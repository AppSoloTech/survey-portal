import type { ParticipantGlossaryEntry } from "@survey-portal/shared";
import type { Pool, PoolClient } from "pg";

import { pool } from "../db.js";

type Queryable = Pool | PoolClient;

interface ParticipantGlossaryEntryRecord {
  id: number;
  canonical_term: string;
  definition: string;
}

interface ParticipantGlossaryMatchRecord {
  glossary_entry_id: number;
  match_text: string;
  display_order: number;
  id: number;
}

export async function fetchParticipantGlossaryEntries(
  queryable: Queryable = pool
): Promise<ParticipantGlossaryEntry[]> {
  const entriesResult = await queryable.query<ParticipantGlossaryEntryRecord>(
    `select id, canonical_term, definition
     from glossary_entries
     where deleted_at is null
       and is_enabled = true
     order by lower(canonical_term), id`
  );

  if (entriesResult.rows.length === 0) {
    return [];
  }

  const entryIds = entriesResult.rows.map((entry) => entry.id);
  const matchesResult = await queryable.query<ParticipantGlossaryMatchRecord>(
    `select glossary_entry_id, match_text, display_order, id
     from glossary_match_strings
     where deleted_at is null
       and glossary_entry_id = any($1::int[])
     order by glossary_entry_id, display_order, id`,
    [entryIds]
  );
  const matchStringsByEntryId = new Map<number, string[]>();

  for (const match of matchesResult.rows) {
    const matchStrings = matchStringsByEntryId.get(match.glossary_entry_id) ?? [];
    matchStrings.push(match.match_text);
    matchStringsByEntryId.set(match.glossary_entry_id, matchStrings);
  }

  return entriesResult.rows.map((entry) => ({
    id: entry.id,
    canonicalTerm: entry.canonical_term,
    definition: entry.definition,
    matchStrings: matchStringsByEntryId.get(entry.id) ?? []
  }));
}
