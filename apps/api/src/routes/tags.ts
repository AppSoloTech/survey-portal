import type { TagDefinition } from "@survey-portal/shared";
import express from "express";

import { pool } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { isTagDefinitionUniqueViolation } from "../services/surveyBuilder.js";
import { readPositiveIntegerParam, validateAnswerTagBody } from "../services/validation.js";

interface TagDefinitionRecord {
  id: number;
  tag_key: string;
  tag_value: string;
  created_at: Date;
  updated_at: Date;
}

function mapTagDefinitionRecord(record: TagDefinitionRecord): TagDefinition {
  return {
    id: record.id,
    tagKey: record.tag_key,
    tagValue: record.tag_value,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString()
  };
}

// The tag catalog is admin-only: tags drive hidden classification and must
// never reach participants.
export const tagsRouter = express.Router();

tagsRouter.get("/", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const result = await pool.query<TagDefinitionRecord>(
      `select id, tag_key, tag_value, created_at, updated_at
       from tag_definitions
       order by tag_key, tag_value, id`
    );

    res.json({ tags: result.rows.map(mapTagDefinitionRecord) });
  } catch (error) {
    next(error);
  }
});

tagsRouter.post("/", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const validation = validateAnswerTagBody(req.body);

    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const result = await pool.query<TagDefinitionRecord>(
      `insert into tag_definitions (tag_key, tag_value)
       values ($1, $2)
       returning id, tag_key, tag_value, created_at, updated_at`,
      [validation.value.tagKey, validation.value.tagValue]
    );

    res.status(201).json({ tag: mapTagDefinitionRecord(result.rows[0]) });
  } catch (error) {
    if (isTagDefinitionUniqueViolation(error)) {
      res.status(409).json({ error: "Tag already exists" });
      return;
    }

    next(error);
  }
});

tagsRouter.put("/:id", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const id = readPositiveIntegerParam(req.params.id);

    if (!id) {
      res.status(400).json({ error: "Tag id must be a positive integer" });
      return;
    }

    const validation = validateAnswerTagBody(req.body);

    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const result = await pool.query<TagDefinitionRecord>(
      `update tag_definitions
       set tag_key = $2,
           tag_value = $3,
           updated_at = now()
       where id = $1
       returning id, tag_key, tag_value, created_at, updated_at`,
      [id, validation.value.tagKey, validation.value.tagValue]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: "Tag not found" });
      return;
    }

    res.json({ tag: mapTagDefinitionRecord(result.rows[0]) });
  } catch (error) {
    if (isTagDefinitionUniqueViolation(error)) {
      res.status(409).json({ error: "Tag already exists" });
      return;
    }

    next(error);
  }
});

tagsRouter.delete("/:id", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const id = readPositiveIntegerParam(req.params.id);

    if (!id) {
      res.status(400).json({ error: "Tag id must be a positive integer" });
      return;
    }

    // The catalog is a registry of suggestions; deleting a definition never
    // touches tags already saved on answer options.
    const result = await pool.query<TagDefinitionRecord>(
      `delete from tag_definitions
       where id = $1
       returning id, tag_key, tag_value, created_at, updated_at`,
      [id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: "Tag not found" });
      return;
    }

    res.json({ tag: mapTagDefinitionRecord(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});
