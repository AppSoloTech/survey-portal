import type {
  TagCatalogGroup,
  TagDefinition,
  TagDefinitionsResponse,
  TagGroup
} from "@survey-portal/shared";
import express from "express";
import type { Pool, PoolClient } from "pg";
import pg from "pg";

import { pool } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { isTagDefinitionUniqueViolation } from "../services/surveyBuilder.js";
import {
  readPositiveIntegerParam,
  sameIdSet,
  validateReorderBody,
  validateTagDefinitionBody,
  validateTagGroupBody,
  validateTagMoveBody,
  validateTagReorderBody
} from "../services/validation.js";

const { DatabaseError } = pg;

type Queryable = Pool | PoolClient;

interface TagDefinitionRecord {
  id: number;
  tag_key: string;
  tag_value: string;
  group_id: number | null;
  display_order: number;
  created_at: Date;
  updated_at: Date;
}

interface TagGroupRecord {
  id: number;
  name: string;
  display_order: number;
  created_at: Date;
  updated_at: Date;
}

function mapTagDefinitionRecord(record: TagDefinitionRecord): TagDefinition {
  return {
    id: record.id,
    tagKey: record.tag_key,
    tagValue: record.tag_value,
    groupId: record.group_id,
    displayOrder: record.display_order,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString()
  };
}

function mapTagGroupRecord(record: TagGroupRecord): TagGroup {
  return {
    id: record.id,
    name: record.name,
    displayOrder: record.display_order,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString()
  };
}

async function fetchTagCatalog(queryable: Queryable = pool): Promise<TagDefinitionsResponse> {
  const [groupResult, tagResult] = await Promise.all([
    queryable.query<TagGroupRecord>(
      `select id, name, display_order, created_at, updated_at
       from tag_groups
       order by display_order, lower(name), id`
    ),
    queryable.query<TagDefinitionRecord>(
      `select id, tag_key, tag_value, group_id, display_order, created_at, updated_at
       from tag_definitions
       order by group_id nulls first, display_order, tag_key, tag_value, id`
    )
  ]);

  const tags = tagResult.rows.map(mapTagDefinitionRecord);
  const groupsById = new Map<number, TagCatalogGroup>(
    groupResult.rows.map((record) => {
      const group = mapTagGroupRecord(record);
      return [group.id, { ...group, tags: [] }];
    })
  );
  const ungroupedTags: TagDefinition[] = [];

  for (const tag of tags) {
    if (tag.groupId === null) {
      ungroupedTags.push(tag);
      continue;
    }

    groupsById.get(tag.groupId)?.tags.push(tag);
  }

  return {
    tags,
    groups: [...groupsById.values()],
    ungroupedTags
  };
}

async function groupExists(queryable: Queryable, groupId: number): Promise<boolean> {
  const result = await queryable.query<{ exists: boolean }>(
    `select exists (
       select 1
       from tag_groups
       where id = $1
     ) as exists`,
    [groupId]
  );

  return result.rows[0]?.exists ?? false;
}

async function fetchNextGroupDisplayOrder(queryable: Queryable): Promise<number> {
  const result = await queryable.query<{ next_display_order: number }>(
    `select coalesce(max(display_order), 0) + 1 as next_display_order
     from tag_groups`
  );

  return result.rows[0]?.next_display_order ?? 1;
}

async function fetchNextTagDisplayOrder(
  queryable: Queryable,
  groupId: number | null
): Promise<number> {
  const result = await queryable.query<{ next_display_order: number }>(
    `select coalesce(max(display_order), 0) + 1 as next_display_order
     from tag_definitions
     where group_id is not distinct from $1`,
    [groupId]
  );

  return result.rows[0]?.next_display_order ?? 1;
}

async function fetchTagGroupIds(queryable: Queryable): Promise<number[]> {
  const result = await queryable.query<{ id: number }>(
    `select id
     from tag_groups
     order by display_order, lower(name), id`
  );

  return result.rows.map((row) => row.id);
}

async function fetchTagIdsForGroup(
  queryable: Queryable,
  groupId: number | null,
  excludedTagId?: number
): Promise<number[]> {
  const result = await queryable.query<{ id: number }>(
    `select id
     from tag_definitions
     where group_id is not distinct from $1
       and ($2::int is null or id <> $2)
     order by display_order, tag_key, tag_value, id`,
    [groupId, excludedTagId ?? null]
  );

  return result.rows.map((row) => row.id);
}

async function reorderGroups(queryable: Queryable, groupIds: number[]): Promise<void> {
  await applyDisplayOrderValues(queryable, {
    ids: groupIds,
    tableName: "tag_groups"
  });
}

async function reorderTags(
  queryable: Queryable,
  groupId: number | null,
  tagIds: number[]
): Promise<void> {
  await applyDisplayOrderValues(queryable, {
    groupId,
    ids: tagIds,
    tableName: "tag_definitions"
  });
}

async function applyDisplayOrderValues(
  queryable: Queryable,
  options:
    | { ids: number[]; tableName: "tag_groups" }
    | { groupId: number | null; ids: number[]; tableName: "tag_definitions" }
): Promise<void> {
  if (options.ids.length === 0) {
    return;
  }

  const valuesSql = options.ids
    .map((_, index) => {
      const idParam = index * 2 + 1;
      const orderParam = index * 2 + 2;
      return `($${idParam}::int, $${orderParam}::int)`;
    })
    .join(", ");
  const values = options.ids.flatMap((id, index) => [id, index + 1]);

  if (options.tableName === "tag_groups") {
    await queryable.query(
      `update tag_groups
       set display_order = ordered.display_order,
           updated_at = now()
       from (values ${valuesSql}) as ordered(id, display_order)
       where tag_groups.id = ordered.id`,
      values
    );
    return;
  }

  await queryable.query(
    `update tag_definitions
     set display_order = ordered.display_order,
         updated_at = now()
     from (values ${valuesSql}) as ordered(id, display_order)
     where tag_definitions.id = ordered.id
       and tag_definitions.group_id is not distinct from $${values.length + 1}`,
    [...values, options.groupId]
  );
}

function insertIdAt(ids: number[], id: number, displayOrder: number | null): number[] {
  const next = ids.filter((item) => item !== id);
  const targetIndex =
    displayOrder === null ? next.length : Math.max(0, Math.min(displayOrder - 1, next.length));
  next.splice(targetIndex, 0, id);
  return next;
}

function isTagGroupNameUniqueViolation(error: unknown): boolean {
  return (
    error instanceof DatabaseError &&
    error.code === "23505" &&
    error.constraint === "tag_groups_name_unique"
  );
}

// The tag catalog is admin-only: tags drive hidden classification and must
// never reach participants. Groups are admin-only catalog housing metadata.
export const tagsRouter = express.Router();

tagsRouter.use(requireAuth, requireRole("admin"));

tagsRouter.get("/", async (req, res, next) => {
  try {
    res.json(await fetchTagCatalog());
  } catch (error) {
    next(error);
  }
});

tagsRouter.post("/groups", async (req, res, next) => {
  try {
    const validation = validateTagGroupBody(req.body);

    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const result = await pool.query<TagGroupRecord>(
      `insert into tag_groups (name, display_order)
       values ($1, $2)
       returning id, name, display_order, created_at, updated_at`,
      [validation.value.name, await fetchNextGroupDisplayOrder(pool)]
    );

    res.status(201).json({ group: mapTagGroupRecord(result.rows[0]) });
  } catch (error) {
    if (isTagGroupNameUniqueViolation(error)) {
      res.status(409).json({ error: "Tag group already exists" });
      return;
    }

    next(error);
  }
});

tagsRouter.put("/groups/reorder", async (req, res, next) => {
  const validation = validateReorderBody(req.body, "groupIds");

  if (!validation.ok) {
    res.status(400).json({ error: validation.error });
    return;
  }

  const client = await pool.connect();

  try {
    await client.query("begin");

    const existingIds = await fetchTagGroupIds(client);

    if (!sameIdSet(existingIds, validation.value.ids)) {
      await client.query("rollback");
      res.status(400).json({ error: "groupIds must include every tag group exactly once" });
      return;
    }

    await reorderGroups(client, validation.value.ids);
    await client.query("commit");

    res.json(await fetchTagCatalog());
  } catch (error) {
    await client.query("rollback");
    next(error);
  } finally {
    client.release();
  }
});

tagsRouter.put("/groups/:groupId", async (req, res, next) => {
  try {
    const groupId = readPositiveIntegerParam(req.params.groupId);

    if (!groupId) {
      res.status(400).json({ error: "Group id must be a positive integer" });
      return;
    }

    const validation = validateTagGroupBody(req.body);

    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const result = await pool.query<TagGroupRecord>(
      `update tag_groups
       set name = $2,
           updated_at = now()
       where id = $1
       returning id, name, display_order, created_at, updated_at`,
      [groupId, validation.value.name]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: "Tag group not found" });
      return;
    }

    res.json({ group: mapTagGroupRecord(result.rows[0]) });
  } catch (error) {
    if (isTagGroupNameUniqueViolation(error)) {
      res.status(409).json({ error: "Tag group already exists" });
      return;
    }

    next(error);
  }
});

tagsRouter.delete("/groups/:groupId", async (req, res, next) => {
  const groupId = readPositiveIntegerParam(req.params.groupId);

  if (!groupId) {
    res.status(400).json({ error: "Group id must be a positive integer" });
    return;
  }

  const client = await pool.connect();

  try {
    await client.query("begin");

    const ungroupedTagIds = await fetchTagIdsForGroup(client, null);
    const groupTagIds = await fetchTagIdsForGroup(client, groupId);
    const groupResult = await client.query<TagGroupRecord>(
      `delete from tag_groups
       where id = $1
       returning id, name, display_order, created_at, updated_at`,
      [groupId]
    );

    if (groupResult.rowCount === 0) {
      await client.query("rollback");
      res.status(404).json({ error: "Tag group not found" });
      return;
    }

    await reorderTags(client, null, [...ungroupedTagIds, ...groupTagIds]);
    await reorderGroups(client, await fetchTagGroupIds(client));
    await client.query("commit");

    res.json({ group: mapTagGroupRecord(groupResult.rows[0]) });
  } catch (error) {
    await client.query("rollback");
    next(error);
  } finally {
    client.release();
  }
});

tagsRouter.put("/reorder", async (req, res, next) => {
  const validation = validateTagReorderBody(req.body);

  if (!validation.ok) {
    res.status(400).json({ error: validation.error });
    return;
  }

  const client = await pool.connect();

  try {
    await client.query("begin");

    if (validation.value.groupId !== null && !(await groupExists(client, validation.value.groupId))) {
      await client.query("rollback");
      res.status(404).json({ error: "Tag group not found" });
      return;
    }

    const existingIds = await fetchTagIdsForGroup(client, validation.value.groupId);

    if (!sameIdSet(existingIds, validation.value.tagIds)) {
      await client.query("rollback");
      res.status(400).json({ error: "tagIds must include every tag in the group exactly once" });
      return;
    }

    await reorderTags(client, validation.value.groupId, validation.value.tagIds);
    await client.query("commit");

    res.json(await fetchTagCatalog());
  } catch (error) {
    await client.query("rollback");
    next(error);
  } finally {
    client.release();
  }
});

tagsRouter.post("/", async (req, res, next) => {
  const validation = validateTagDefinitionBody(req.body);

  if (!validation.ok) {
    res.status(400).json({ error: validation.error });
    return;
  }

  const groupId = validation.value.groupId ?? null;
  const client = await pool.connect();

  try {
    await client.query("begin");

    if (groupId !== null && !(await groupExists(client, groupId))) {
      await client.query("rollback");
      res.status(404).json({ error: "Tag group not found" });
      return;
    }

    const displayOrder = await fetchNextTagDisplayOrder(client, groupId);
    const result = await client.query<TagDefinitionRecord>(
      `insert into tag_definitions (tag_key, tag_value, group_id, display_order)
       values ($1, $2, $3, $4)
       returning id, tag_key, tag_value, group_id, display_order, created_at, updated_at`,
      [validation.value.tagKey, validation.value.tagValue, groupId, displayOrder]
    );

    await client.query("commit");

    res.status(201).json({ tag: mapTagDefinitionRecord(result.rows[0]) });
  } catch (error) {
    await client.query("rollback");

    if (isTagDefinitionUniqueViolation(error)) {
      res.status(409).json({ error: "Tag already exists" });
      return;
    }

    next(error);
  } finally {
    client.release();
  }
});

tagsRouter.patch("/:id/group", async (req, res, next) => {
  const id = readPositiveIntegerParam(req.params.id);

  if (!id) {
    res.status(400).json({ error: "Tag id must be a positive integer" });
    return;
  }

  const validation = validateTagMoveBody(req.body);

  if (!validation.ok) {
    res.status(400).json({ error: validation.error });
    return;
  }

  const client = await pool.connect();

  try {
    await client.query("begin");

    const existing = await client.query<{ group_id: number | null }>(
      `select group_id
       from tag_definitions
       where id = $1`,
      [id]
    );

    if (existing.rowCount === 0) {
      await client.query("rollback");
      res.status(404).json({ error: "Tag not found" });
      return;
    }

    if (validation.value.groupId !== null && !(await groupExists(client, validation.value.groupId))) {
      await client.query("rollback");
      res.status(404).json({ error: "Tag group not found" });
      return;
    }

    const sourceGroupId = existing.rows[0].group_id;
    const targetGroupId = validation.value.groupId;
    const targetIds = insertIdAt(
      await fetchTagIdsForGroup(client, targetGroupId, id),
      id,
      validation.value.displayOrder
    );

    await client.query(
      `update tag_definitions
       set group_id = $2,
           display_order = $3,
           updated_at = now()
       where id = $1`,
      [id, targetGroupId, targetIds.indexOf(id) + 1]
    );
    await reorderTags(client, targetGroupId, targetIds);

    if (sourceGroupId !== targetGroupId) {
      await reorderTags(client, sourceGroupId, await fetchTagIdsForGroup(client, sourceGroupId));
    }

    await client.query("commit");

    res.json(await fetchTagCatalog());
  } catch (error) {
    await client.query("rollback");
    next(error);
  } finally {
    client.release();
  }
});

tagsRouter.put("/:id", async (req, res, next) => {
  const id = readPositiveIntegerParam(req.params.id);

  if (!id) {
    res.status(400).json({ error: "Tag id must be a positive integer" });
    return;
  }

  const validation = validateTagDefinitionBody(req.body);

  if (!validation.ok) {
    res.status(400).json({ error: validation.error });
    return;
  }

  const client = await pool.connect();

  try {
    await client.query("begin");

    const existing = await client.query<{ group_id: number | null; display_order: number }>(
      `select group_id, display_order
       from tag_definitions
       where id = $1`,
      [id]
    );

    if (existing.rowCount === 0) {
      await client.query("rollback");
      res.status(404).json({ error: "Tag not found" });
      return;
    }

    const currentGroupId = existing.rows[0].group_id;
    const nextGroupId = validation.value.groupId === undefined ? currentGroupId : validation.value.groupId;

    if (nextGroupId !== null && !(await groupExists(client, nextGroupId))) {
      await client.query("rollback");
      res.status(404).json({ error: "Tag group not found" });
      return;
    }

    const movedGroups = currentGroupId !== nextGroupId;
    const displayOrder = movedGroups
      ? await fetchNextTagDisplayOrder(client, nextGroupId)
      : existing.rows[0].display_order;
    const result = await client.query<TagDefinitionRecord>(
      `update tag_definitions
       set tag_key = $2,
           tag_value = $3,
           group_id = $4,
           display_order = $5,
           updated_at = now()
       where id = $1
       returning id, tag_key, tag_value, group_id, display_order, created_at, updated_at`,
      [id, validation.value.tagKey, validation.value.tagValue, nextGroupId, displayOrder]
    );

    if (movedGroups) {
      await reorderTags(client, currentGroupId, await fetchTagIdsForGroup(client, currentGroupId));
      await reorderTags(client, nextGroupId, await fetchTagIdsForGroup(client, nextGroupId));
    }

    await client.query("commit");

    res.json({ tag: mapTagDefinitionRecord(result.rows[0]) });
  } catch (error) {
    await client.query("rollback");

    if (isTagDefinitionUniqueViolation(error)) {
      res.status(409).json({ error: "Tag already exists" });
      return;
    }

    next(error);
  } finally {
    client.release();
  }
});

tagsRouter.delete("/:id", async (req, res, next) => {
  const id = readPositiveIntegerParam(req.params.id);

  if (!id) {
    res.status(400).json({ error: "Tag id must be a positive integer" });
    return;
  }

  const client = await pool.connect();

  try {
    await client.query("begin");

    // The catalog is a registry of suggestions; deleting a definition never
    // touches tags already saved on answer options.
    const result = await client.query<TagDefinitionRecord>(
      `delete from tag_definitions
       where id = $1
       returning id, tag_key, tag_value, group_id, display_order, created_at, updated_at`,
      [id]
    );

    if (result.rowCount === 0) {
      await client.query("rollback");
      res.status(404).json({ error: "Tag not found" });
      return;
    }

    await reorderTags(client, result.rows[0].group_id, await fetchTagIdsForGroup(client, result.rows[0].group_id));
    await client.query("commit");

    res.json({ tag: mapTagDefinitionRecord(result.rows[0]) });
  } catch (error) {
    await client.query("rollback");
    next(error);
  } finally {
    client.release();
  }
});
