import type {
  AdminGlossaryQuestionSearchResult,
  ParticipantGlossaryEntry,
  SurveyStatus
} from "@survey-portal/shared";
import type { Pool, PoolClient } from "pg";

import { pool } from "../db.js";

type Queryable = Pool | PoolClient;

export const glossaryQuestionSearchMinQueryLength = 2;
export const glossaryQuestionSearchDefaultLimit = 20;
export const glossaryQuestionSearchMaxLimit = 50;

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

interface GlossaryQuestionSearchRecord {
  assessment_id: number;
  assessment_title: string;
  assessment_status: SurveyStatus;
  page_id: number | null;
  page_title: string | null;
  page_display_order: number | null;
  question_id: number;
  question_text: string;
  question_display_order: number;
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

export async function searchAdminGlossaryQuestions(
  query: string,
  limit = glossaryQuestionSearchDefaultLimit,
  queryable: Queryable = pool
): Promise<AdminGlossaryQuestionSearchResult[]> {
  const normalizedQuery = query.trim();
  const boundedLimit =
    Number.isSafeInteger(limit) && limit > 0
      ? Math.min(limit, glossaryQuestionSearchMaxLimit)
      : glossaryQuestionSearchDefaultLimit;

  if (normalizedQuery.length < glossaryQuestionSearchMinQueryLength) {
    return [];
  }

  const result = await queryable.query<GlossaryQuestionSearchRecord>(
    `select
       surveys.id as assessment_id,
       surveys.title as assessment_title,
       surveys.status as assessment_status,
       survey_pages.id as page_id,
       survey_pages.title as page_title,
       survey_pages.display_order as page_display_order,
       survey_questions.id as question_id,
       survey_questions.question_text,
       survey_questions.display_order as question_display_order
     from survey_questions
     join surveys on surveys.id = survey_questions.survey_id
     left join survey_pages on survey_pages.id = survey_questions.page_id
     where surveys.deleted_at is null
       and surveys.status in ('draft', 'published')
       and position(lower($1) in lower(survey_questions.question_text)) > 0
     order by
       position(lower($1) in lower(survey_questions.question_text)),
       lower(surveys.title),
       surveys.title,
       coalesce(survey_pages.display_order, 2147483647),
       survey_questions.display_order,
       survey_questions.id
     limit $2`,
    [normalizedQuery, boundedLimit]
  );

  return result.rows.map((record) => {
    // Offsets are for JavaScript string slicing of the returned questionText.
    const matchStart = record.question_text.toLowerCase().indexOf(normalizedQuery.toLowerCase());
    const safeMatchStart = Math.max(matchStart, 0);

    return {
      assessment: {
        id: record.assessment_id,
        title: record.assessment_title,
        status: record.assessment_status
      },
      page:
        record.page_id === null ||
        record.page_title === null ||
        record.page_display_order === null
          ? null
          : {
              id: record.page_id,
              title: record.page_title,
              displayOrder: record.page_display_order
            },
      question: {
        id: record.question_id,
        questionText: record.question_text,
        displayOrder: record.question_display_order
      },
      match: {
        start: safeMatchStart,
        end: safeMatchStart + normalizedQuery.length
      }
    };
  });
}
