import {
  getSurveyQuestionTypeEstimateWeightSeconds,
  type Survey,
  type SurveyQuestionType,
  type SurveyTimingEstimateSource,
  type SurveyTimingSummary
} from "@survey-portal/shared";

import { pool } from "../db.js";
import type { Queryable } from "./surveyRecords.js";

export const maxStatisticalSampleDurationSeconds = 4 * 60 * 60;

const minimumSurveyDefaultSeconds = 60;
const maxAdminOverrideMinutes = 24 * 60;

interface TimingOverrideRecord {
  survey_id: number;
  admin_override_seconds: number;
}

interface TimingStatsRecord {
  survey_id: number;
  derived_estimate_seconds: number | string | null;
  sample_count: number | string;
}

export function getMaxAdminOverrideMinutes(): number {
  return maxAdminOverrideMinutes;
}

export function getQuestionTypeDefaultSeconds(questionType: SurveyQuestionType): number {
  return getSurveyQuestionTypeEstimateWeightSeconds(questionType);
}

export function calculateDefaultEstimateSeconds(
  survey: Pick<Survey, "questions">
): number {
  const total = survey.questions.reduce(
    (sum, question) => sum + getQuestionTypeDefaultSeconds(question.questionType),
    0
  );

  return Math.max(minimumSurveyDefaultSeconds, total);
}

export function composeSurveyTimingSummary(input: {
  adminOverrideSeconds: number | null;
  defaultEstimateSeconds: number;
  derivedEstimateSeconds: number | null;
  sampleCount: number;
}): SurveyTimingSummary {
  let estimateSource: SurveyTimingEstimateSource = "default";
  let effectiveEstimateSeconds = input.defaultEstimateSeconds;

  if (input.derivedEstimateSeconds !== null) {
    estimateSource = "statistical";
    effectiveEstimateSeconds = input.derivedEstimateSeconds;
  }

  if (input.adminOverrideSeconds !== null) {
    estimateSource = "admin_override";
    effectiveEstimateSeconds = input.adminOverrideSeconds;
  }

  return {
    derivedEstimateSeconds: input.derivedEstimateSeconds,
    defaultEstimateSeconds: input.defaultEstimateSeconds,
    adminOverrideSeconds: input.adminOverrideSeconds,
    effectiveEstimateSeconds,
    sampleCount: input.sampleCount,
    estimateSource
  };
}

export async function buildSurveyTimingSummaries(
  surveys: Pick<Survey, "id" | "questions">[]
): Promise<Map<number, SurveyTimingSummary>> {
  const summaries = new Map<number, SurveyTimingSummary>();

  if (surveys.length === 0) {
    return summaries;
  }

  const surveyIds = surveys.map((survey) => survey.id);
  const [overrideResult, statsResult] = await Promise.all([
    pool.query<TimingOverrideRecord>(
      `select survey_id, admin_override_seconds
       from survey_timing_overrides
       where survey_id = any($1::int[])`,
      [surveyIds]
    ),
    pool.query<TimingStatsRecord>(
      `with valid_durations as (
         select
           survey_id,
           extract(epoch from completed_at - started_at)::double precision as duration_seconds
         from survey_attempts
         where survey_id = any($1::int[])
           and status = 'completed'
           and started_at is not null
           and completed_at is not null
           and completed_at > started_at
           and completed_at <= started_at + ($2::int * interval '1 second')
       )
       select
         survey_id,
         percentile_cont(0.5) within group (order by duration_seconds) as derived_estimate_seconds,
         count(*)::int as sample_count
       from valid_durations
       group by survey_id`,
      [surveyIds, maxStatisticalSampleDurationSeconds]
    )
  ]);

  const overrideBySurveyId = new Map(
    overrideResult.rows.map((row) => [row.survey_id, row.admin_override_seconds])
  );
  const statsBySurveyId = new Map(statsResult.rows.map((row) => [row.survey_id, row]));

  for (const survey of surveys) {
    const stats = statsBySurveyId.get(survey.id);
    const derivedEstimateSeconds =
      stats?.derived_estimate_seconds === null || stats?.derived_estimate_seconds === undefined
        ? null
        : Math.max(1, Math.round(Number(stats.derived_estimate_seconds)));

    summaries.set(
      survey.id,
      composeSurveyTimingSummary({
        adminOverrideSeconds: overrideBySurveyId.get(survey.id) ?? null,
        defaultEstimateSeconds: calculateDefaultEstimateSeconds(survey),
        derivedEstimateSeconds,
        sampleCount: stats ? Number(stats.sample_count) : 0
      })
    );
  }

  return summaries;
}

export async function fetchSurveyTimingSummary(
  surveyId: number
): Promise<SurveyTimingSummary | null> {
  const [survey] = await import("./surveyStructure.js").then(({ fetchSurveyStructures }) =>
    fetchSurveyStructures({
      surveyId,
      includeAllStatuses: true,
      includeHiddenTags: false,
      includeDeleted: true
    })
  );

  if (!survey) {
    return null;
  }

  const timingBySurveyId = await buildSurveyTimingSummaries([survey]);

  return timingBySurveyId.get(survey.id) ?? null;
}

export async function setSurveyTimingOverride(input: {
  queryable?: Queryable;
  surveyId: number;
  userId: number;
  adminOverrideSeconds: number;
}): Promise<void> {
  const queryable = input.queryable ?? pool;

  await queryable.query(
    `insert into survey_timing_overrides (
       survey_id,
       admin_override_seconds,
       created_by_user_id,
       updated_by_user_id
     )
     values ($1, $2, $3, $3)
     on conflict (survey_id)
     do update
     set admin_override_seconds = excluded.admin_override_seconds,
         updated_by_user_id = excluded.updated_by_user_id,
         updated_at = now()`,
    [input.surveyId, input.adminOverrideSeconds, input.userId]
  );
}

export async function clearSurveyTimingOverride(surveyId: number): Promise<void> {
  await pool.query(
    `delete from survey_timing_overrides
     where survey_id = $1`,
    [surveyId]
  );
}
