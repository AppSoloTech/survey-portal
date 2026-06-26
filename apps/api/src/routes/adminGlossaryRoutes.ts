import type {
  AdminGlossaryAlias,
  AdminGlossaryEntry,
  ParticipantGlossaryEntry
} from "@survey-portal/shared";
import express from "express";
import type { Pool, PoolClient } from "pg";
import pg from "pg";

import { pool } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  readPositiveIntegerParam,
  validateGlossaryEntryBody
} from "../services/validation.js";

const { DatabaseError } = pg;

type Queryable = Pool | PoolClient;

interface GlossaryEntryRecord {
  id: number;
  canonical_term: string;
  definition: string;
  is_enabled: boolean;
  definition_source: AdminGlossaryEntry["definitionSource"];
  source_provider: string | null;
  source_reference: string | null;
  source_lookup_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface GlossaryAliasRecord {
  id: number;
  glossary_entry_id: number;
  match_text: string;
  is_canonical: boolean;
  display_order: number;
  created_at: Date;
  updated_at: Date;
}

function mapGlossaryAliasRecord(record: GlossaryAliasRecord): AdminGlossaryAlias {
  return {
    id: record.id,
    glossaryEntryId: record.glossary_entry_id,
    matchText: record.match_text,
    isCanonical: record.is_canonical,
    displayOrder: record.display_order,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString()
  };
}

function mapGlossaryEntryRecord(
  record: GlossaryEntryRecord,
  aliases: AdminGlossaryAlias[]
): AdminGlossaryEntry {
  return {
    id: record.id,
    canonicalTerm: record.canonical_term,
    definition: record.definition,
    isEnabled: record.is_enabled,
    definitionSource: record.definition_source,
    sourceProvider: record.source_provider,
    sourceReference: record.source_reference,
    sourceLookupAt: record.source_lookup_at?.toISOString() ?? null,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString(),
    aliases
  };
}

async function fetchGlossaryEntries(
  queryable: Queryable = pool,
  options: { enabledOnly?: boolean; entryId?: number } = {}
): Promise<AdminGlossaryEntry[]> {
  const params: unknown[] = [];
  const filters = ["deleted_at is null"];

  if (options.enabledOnly) {
    filters.push("is_enabled = true");
  }

  if (options.entryId !== undefined) {
    params.push(options.entryId);
    filters.push(`id = $${params.length}`);
  }

  const entryResult = await queryable.query<GlossaryEntryRecord>(
    `select id, canonical_term, definition, is_enabled, definition_source,
            source_provider, source_reference, source_lookup_at, created_at, updated_at
     from glossary_entries
     where ${filters.join(" and ")}
     order by lower(canonical_term), id`,
    params
  );

  if (entryResult.rows.length === 0) {
    return [];
  }

  const entryIds = entryResult.rows.map((entry) => entry.id);
  const aliasResult = await queryable.query<GlossaryAliasRecord>(
    `select id, glossary_entry_id, match_text, is_canonical, display_order, created_at, updated_at
     from glossary_match_strings
     where deleted_at is null
       and glossary_entry_id = any($1::int[])
     order by glossary_entry_id, display_order, id`,
    [entryIds]
  );
  const aliasesByEntryId = new Map<number, AdminGlossaryAlias[]>();

  for (const alias of aliasResult.rows.map(mapGlossaryAliasRecord)) {
    const aliases = aliasesByEntryId.get(alias.glossaryEntryId) ?? [];
    aliases.push(alias);
    aliasesByEntryId.set(alias.glossaryEntryId, aliases);
  }

  return entryResult.rows.map((record) =>
    mapGlossaryEntryRecord(record, aliasesByEntryId.get(record.id) ?? [])
  );
}

async function fetchGlossaryEntry(
  queryable: Queryable,
  entryId: number
): Promise<AdminGlossaryEntry | null> {
  return (await fetchGlossaryEntries(queryable, { entryId }))[0] ?? null;
}

async function insertGlossaryAliases(
  queryable: Queryable,
  entryId: number,
  canonicalTerm: string,
  aliases: string[]
): Promise<void> {
  const matchStrings = [canonicalTerm, ...aliases];
  const valuesSql = matchStrings
    .map((_, index) => {
      const offset = index * 4;
      return `($${offset + 1}::int, $${offset + 2}::text, $${offset + 3}::boolean, $${offset + 4}::int)`;
    })
    .join(", ");
  const values = matchStrings.flatMap((matchString, index) => [
    entryId,
    matchString,
    index === 0,
    index + 1
  ]);

  await queryable.query(
    `insert into glossary_match_strings (
       glossary_entry_id, match_text, is_canonical, display_order
     )
     values ${valuesSql}`,
    values
  );
}

function isGlossaryMatchUniqueViolation(error: unknown): boolean {
  return (
    error instanceof DatabaseError &&
    error.code === "23505" &&
    (error.constraint === "glossary_match_strings_normalized_active_unique" ||
      error.constraint === "glossary_match_strings_canonical_active_unique")
  );
}

function toParticipantGlossaryEntry(entry: AdminGlossaryEntry): ParticipantGlossaryEntry {
  return {
    id: entry.id,
    canonicalTerm: entry.canonicalTerm,
    definition: entry.definition,
    matchStrings: entry.aliases.map((alias) => alias.matchText)
  };
}

export const adminGlossaryRouter = express.Router();

adminGlossaryRouter.use(requireAuth, requireRole("admin"));

adminGlossaryRouter.get("/", async (req, res, next) => {
  try {
    res.json({ entries: await fetchGlossaryEntries() });
  } catch (error) {
    next(error);
  }
});

adminGlossaryRouter.get("/participant-safe", async (req, res, next) => {
  try {
    const entries = await fetchGlossaryEntries(pool, { enabledOnly: true });
    res.json({ entries: entries.map(toParticipantGlossaryEntry) });
  } catch (error) {
    next(error);
  }
});

adminGlossaryRouter.get("/:entryId", async (req, res, next) => {
  const entryId = readPositiveIntegerParam(req.params.entryId);

  if (!entryId) {
    res.status(400).json({ error: "Glossary entry id must be a positive integer" });
    return;
  }

  try {
    const entry = await fetchGlossaryEntry(pool, entryId);

    if (!entry) {
      res.status(404).json({ error: "Glossary entry not found" });
      return;
    }

    res.json({ entry });
  } catch (error) {
    next(error);
  }
});

adminGlossaryRouter.post("/", async (req, res, next) => {
  const validation = validateGlossaryEntryBody(req.body);

  if (!validation.ok) {
    res.status(400).json({ error: validation.error });
    return;
  }

  const client = await pool.connect();

  try {
    await client.query("begin");

    const result = await client.query<GlossaryEntryRecord>(
      `insert into glossary_entries (
         canonical_term, definition, is_enabled, definition_source,
         source_provider, source_reference, source_lookup_at
       )
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id, canonical_term, definition, is_enabled, definition_source,
                 source_provider, source_reference, source_lookup_at, created_at, updated_at`,
      [
        validation.value.canonicalTerm,
        validation.value.definition,
        validation.value.isEnabled,
        validation.value.definitionSource,
        validation.value.sourceProvider,
        validation.value.sourceReference,
        validation.value.sourceLookupAt
      ]
    );
    const entryId = result.rows[0].id;

    await insertGlossaryAliases(
      client,
      entryId,
      validation.value.canonicalTerm,
      validation.value.aliases
    );
    await client.query("commit");

    res.status(201).json({ entry: await fetchGlossaryEntry(pool, entryId) });
  } catch (error) {
    await client.query("rollback");

    if (isGlossaryMatchUniqueViolation(error)) {
      res.status(409).json({ error: "Glossary match string already exists" });
      return;
    }

    next(error);
  } finally {
    client.release();
  }
});

adminGlossaryRouter.put("/:entryId", async (req, res, next) => {
  const entryId = readPositiveIntegerParam(req.params.entryId);

  if (!entryId) {
    res.status(400).json({ error: "Glossary entry id must be a positive integer" });
    return;
  }

  const validation = validateGlossaryEntryBody(req.body);

  if (!validation.ok) {
    res.status(400).json({ error: validation.error });
    return;
  }

  const client = await pool.connect();

  try {
    await client.query("begin");

    const result = await client.query<GlossaryEntryRecord>(
      `update glossary_entries
       set canonical_term = $2,
           definition = $3,
           is_enabled = $4,
           definition_source = $5,
           source_provider = $6,
           source_reference = $7,
           source_lookup_at = $8,
           updated_at = now()
       where id = $1
         and deleted_at is null
       returning id, canonical_term, definition, is_enabled, definition_source,
                 source_provider, source_reference, source_lookup_at, created_at, updated_at`,
      [
        entryId,
        validation.value.canonicalTerm,
        validation.value.definition,
        validation.value.isEnabled,
        validation.value.definitionSource,
        validation.value.sourceProvider,
        validation.value.sourceReference,
        validation.value.sourceLookupAt
      ]
    );

    if (result.rowCount === 0) {
      await client.query("rollback");
      res.status(404).json({ error: "Glossary entry not found" });
      return;
    }

    await client.query(
      `update glossary_match_strings
       set deleted_at = now(),
           updated_at = now()
       where glossary_entry_id = $1
         and deleted_at is null`,
      [entryId]
    );
    await insertGlossaryAliases(
      client,
      entryId,
      validation.value.canonicalTerm,
      validation.value.aliases
    );
    await client.query("commit");

    res.json({ entry: await fetchGlossaryEntry(pool, entryId) });
  } catch (error) {
    await client.query("rollback");

    if (isGlossaryMatchUniqueViolation(error)) {
      res.status(409).json({ error: "Glossary match string already exists" });
      return;
    }

    next(error);
  } finally {
    client.release();
  }
});

adminGlossaryRouter.delete("/:entryId", async (req, res, next) => {
  const entryId = readPositiveIntegerParam(req.params.entryId);

  if (!entryId) {
    res.status(400).json({ error: "Glossary entry id must be a positive integer" });
    return;
  }

  const client = await pool.connect();

  try {
    await client.query("begin");

    const entry = await fetchGlossaryEntry(client, entryId);

    if (!entry) {
      await client.query("rollback");
      res.status(404).json({ error: "Glossary entry not found" });
      return;
    }

    await client.query(
      `update glossary_entries
       set deleted_at = now(),
           updated_at = now()
       where id = $1
         and deleted_at is null`,
      [entryId]
    );
    await client.query(
      `update glossary_match_strings
       set deleted_at = now(),
           updated_at = now()
       where glossary_entry_id = $1
         and deleted_at is null`,
      [entryId]
    );
    await client.query("commit");

    res.json({ entry });
  } catch (error) {
    await client.query("rollback");
    next(error);
  } finally {
    client.release();
  }
});
