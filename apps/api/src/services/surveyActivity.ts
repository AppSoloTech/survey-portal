import type { SurveyAttemptActivityEventType } from "@survey-portal/shared";

import { pool } from "../db.js";
import type { Queryable } from "./surveyRecords.js";

export const surveyAttemptActivityIdleGapCapSeconds = 5 * 60;

export interface SurveyAttemptActivityContext {
  attemptId: number;
  surveyId: number;
  eventType: SurveyAttemptActivityEventType;
  pageId: number | null;
  questionId: number | null;
  visibleQuestionIds: number[];
  occurredAt?: Date;
}

export interface AttemptActivitySummary {
  attemptId: number;
  surveyId: number;
  activeSeconds: number;
  eventCount: number;
  firstEventAt: string | null;
  lastEventAt: string | null;
}

export interface SurveyActivitySummary {
  surveyId: number;
  activeSeconds: number;
  eventCount: number;
  attemptCount: number;
}

export async function recordSurveyAttemptActivity(
  queryable: Queryable,
  input: SurveyAttemptActivityContext
): Promise<void> {
  await queryable.query(
    `insert into survey_attempt_activity_events (
       survey_attempt_id,
       survey_id,
       page_id,
       question_id,
       event_type,
       visible_question_ids,
       occurred_at
     )
     values ($1, $2, $3, $4, $5, $6::int[], coalesce($7::timestamptz, now()))`,
    [
      input.attemptId,
      input.surveyId,
      input.pageId,
      input.questionId,
      input.eventType,
      input.visibleQuestionIds,
      input.occurredAt ?? null
    ]
  );
}

export function recordSurveyAttemptActivityBestEffort(
  input: SurveyAttemptActivityContext
): void {
  void recordSurveyAttemptActivity(pool, input).catch(() => {
    console.warn("Survey attempt activity event could not be recorded");
  });
}

export async function touchSurveyAttemptActivity(
  queryable: Queryable,
  attemptId: number
): Promise<void> {
  await queryable.query(
    `update survey_attempts
     set last_activity_at = now(),
         updated_at = now()
     where id = $1`,
    [attemptId]
  );
}

export async function validateSurveyAttemptActivityContext(
  queryable: Queryable,
  input: {
    surveyId: number;
    pageId: number | null;
    questionId: number | null;
    visibleQuestionIds: number[];
  }
): Promise<boolean> {
  if (input.pageId !== null) {
    const pageResult = await queryable.query(
      `select 1
       from survey_pages
       where id = $1
         and survey_id = $2`,
      [input.pageId, input.surveyId]
    );

    if (pageResult.rowCount !== 1) {
      return false;
    }
  }

  if (input.questionId !== null) {
    const questionResult = await queryable.query(
      `select 1
       from survey_questions
       where id = $1
         and survey_id = $2
         and ($3::int is null or page_id = $3)`,
      [input.questionId, input.surveyId, input.pageId]
    );

    if (questionResult.rowCount !== 1) {
      return false;
    }
  }

  if (input.visibleQuestionIds.length > 0) {
    const visibleResult = await queryable.query<{ matching_count: string }>(
      `select count(*)::text as matching_count
       from survey_questions
       where survey_id = $1
         and id = any($2::int[])
         and ($3::int is null or page_id = $3)`,
      [input.surveyId, input.visibleQuestionIds, input.pageId]
    );

    if (Number(visibleResult.rows[0]?.matching_count ?? 0) !== input.visibleQuestionIds.length) {
      return false;
    }
  }

  return true;
}

export async function fetchAttemptActivitySummary(
  attemptId: number
): Promise<AttemptActivitySummary | null> {
  const result = await pool.query<{
    survey_id: number;
    event_count: string;
    active_seconds: string;
    first_event_at: Date | null;
    last_event_at: Date | null;
  }>(
    `with ordered_events as (
       select
         survey_id,
         occurred_at,
         lag(occurred_at) over (order by occurred_at, id) as previous_occurred_at
       from survey_attempt_activity_events
       where survey_attempt_id = $1
     )
     select
       min(survey_id)::int as survey_id,
       count(*)::text as event_count,
       coalesce(
         sum(
           case
             when previous_occurred_at is null then 0
             when occurred_at <= previous_occurred_at then 0
             else least(
               extract(epoch from occurred_at - previous_occurred_at)::int,
               $2::int
             )
           end
         ),
         0
       )::text as active_seconds,
       min(occurred_at) as first_event_at,
       max(occurred_at) as last_event_at
     from ordered_events`,
    [attemptId, surveyAttemptActivityIdleGapCapSeconds]
  );
  const row = result.rows[0];

  if (!row || row.survey_id === null || Number(row.event_count) === 0) {
    return null;
  }

  return {
    attemptId,
    surveyId: row.survey_id,
    activeSeconds: Number(row.active_seconds),
    eventCount: Number(row.event_count),
    firstEventAt: row.first_event_at?.toISOString() ?? null,
    lastEventAt: row.last_event_at?.toISOString() ?? null
  };
}

export async function fetchSurveyActivitySummary(
  surveyId: number
): Promise<SurveyActivitySummary> {
  const result = await pool.query<{
    attempt_count: string;
    event_count: string;
    active_seconds: string;
  }>(
    `with ordered_events as (
       select
         survey_attempt_id,
         occurred_at,
         lag(occurred_at) over (
           partition by survey_attempt_id
           order by occurred_at, id
         ) as previous_occurred_at
       from survey_attempt_activity_events
       where survey_id = $1
     )
     select
       count(distinct survey_attempt_id)::text as attempt_count,
       count(*)::text as event_count,
       coalesce(
         sum(
           case
             when previous_occurred_at is null then 0
             when occurred_at <= previous_occurred_at then 0
             else least(
               extract(epoch from occurred_at - previous_occurred_at)::int,
               $2::int
             )
           end
         ),
         0
       )::text as active_seconds
     from ordered_events`,
    [surveyId, surveyAttemptActivityIdleGapCapSeconds]
  );
  const row = result.rows[0];

  return {
    surveyId,
    activeSeconds: Number(row?.active_seconds ?? 0),
    eventCount: Number(row?.event_count ?? 0),
    attemptCount: Number(row?.attempt_count ?? 0)
  };
}
