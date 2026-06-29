import type {
  PerformanceTestRunStatus,
  PerformanceTestSampleSource,
  PerformanceTestSampleSummary,
  PerformanceTestSuiteChildRunSummary,
  PerformanceTestSuiteDetail,
  PerformanceTestSuiteDetailResponse,
  PerformanceTestSuiteStatus,
  PerformanceTestSuiteSummary,
  PerformanceTestSuitesListResponse
} from "@survey-portal/shared";
import express from "express";

import { pool } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  sanitizeOperationalMarkdown,
  sanitizeOperationalRecord,
  sanitizeOperationalString
} from "../services/operationalRedaction.js";
import { readPositiveIntegerParam } from "../services/validation.js";

const defaultPerformanceSuitesPageSize = 20;
const maxPerformanceSuitesPageSize = 100;
const defaultPerformanceSamplesLimit = 200;
const maxPerformanceSamplesLimit = 1000;
const performanceSampleSources = new Set<PerformanceTestSampleSource>([
  "k6",
  "sql",
  "azure_app_service",
  "azure_postgres",
  "suite"
]);

interface PerformanceTestSuiteSummaryRecord {
  id: number;
  suite_key: string;
  target_base_url: string;
  status: PerformanceTestSuiteStatus;
  started_at: Date;
  finished_at: Date | null;
  duration_seconds: number | null;
  planned_profiles: unknown;
  planned_stages: unknown;
  first_failing_profile: string | null;
  first_failing_stage: string | null;
  first_failing_target_vus: number | null;
  first_failing_current_vus: number | null;
  bottleneck: string | null;
  bottleneck_confidence: string | null;
  recommendation: string | null;
  created_at: Date;
  updated_at: Date;
}

interface PerformanceTestSuiteRecord extends PerformanceTestSuiteSummaryRecord {
  config: Record<string, unknown>;
  summary: Record<string, unknown>;
  report_markdown: string | null;
}

interface PerformanceTestChildRunRecord {
  id: number;
  suite_id: number | null;
  run_key: string;
  scenario: string;
  target_base_url: string;
  status: PerformanceTestRunStatus;
  started_at: Date;
  finished_at: Date | null;
  duration_seconds: number | null;
  max_vus: number | null;
  peak_requests_per_second: string | null;
  p50_ms: string | null;
  p95_ms: string | null;
  p99_ms: string | null;
  error_rate: string | null;
  total_requests: number | null;
  failed_requests: number | null;
  bottleneck: string | null;
  recommendation: string | null;
  created_at: Date;
  updated_at: Date;
}

interface PerformanceTestSampleRecord {
  id: number;
  suite_id: number;
  run_id: number | null;
  source: PerformanceTestSampleSource;
  profile: string | null;
  scenario: string | null;
  stage_label: string | null;
  target_vus: number | null;
  current_vus: number | null;
  sampled_at: Date;
  elapsed_seconds: number | null;
  metrics: Record<string, unknown>;
  unavailable_reason: string | null;
  caveat: string | null;
  created_at: Date;
}

export const adminPerformanceSuitesRouter = express.Router();

adminPerformanceSuitesRouter.get("/", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const page = readPaginationParam(req.query.page, 1, Number.MAX_SAFE_INTEGER, "page");
    const pageSize = readPaginationParam(
      req.query.pageSize,
      defaultPerformanceSuitesPageSize,
      maxPerformanceSuitesPageSize,
      "pageSize"
    );

    if (!page.ok) {
      res.status(400).json({ error: page.error });
      return;
    }

    if (!pageSize.ok) {
      res.status(400).json({ error: pageSize.error });
      return;
    }

    const offset = (page.value - 1) * pageSize.value;
    const totalResult = await pool.query<{ count: string }>(
      `select count(*)::text as count
       from performance_test_suites`
    );
    const suitesResult = await pool.query<PerformanceTestSuiteSummaryRecord>(
      `select id,
              suite_key,
              target_base_url,
              status,
              started_at,
              finished_at,
              duration_seconds,
              planned_profiles,
              planned_stages,
              first_failing_profile,
              first_failing_stage,
              first_failing_target_vus,
              first_failing_current_vus,
              bottleneck,
              bottleneck_confidence,
              recommendation,
              created_at,
              updated_at
       from performance_test_suites
       order by started_at desc, id desc
       limit $1
       offset $2`,
      [pageSize.value, offset]
    );
    const response: PerformanceTestSuitesListResponse = {
      suites: suitesResult.rows.map(mapPerformanceTestSuiteSummary),
      total: Number(totalResult.rows[0]?.count ?? 0),
      page: page.value,
      pageSize: pageSize.value
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

adminPerformanceSuitesRouter.get(
  "/:id",
  requireAuth,
  requireRole("admin"),
  async (req, res, next) => {
    try {
      const suiteId = readPositiveIntegerParam(req.params.id);

      if (!suiteId) {
        res.status(400).json({ error: "Performance test suite id must be a positive integer" });
        return;
      }

      const sampleQuery = readSampleQuery(req.query);

      if (!sampleQuery.ok) {
        res.status(400).json({ error: sampleQuery.error });
        return;
      }

      const suiteResult = await pool.query<PerformanceTestSuiteRecord>(
        `select id,
                suite_key,
                target_base_url,
                status,
                started_at,
                finished_at,
                duration_seconds,
                planned_profiles,
                planned_stages,
                first_failing_profile,
                first_failing_stage,
                first_failing_target_vus,
                first_failing_current_vus,
                bottleneck,
                bottleneck_confidence,
                recommendation,
                config,
                summary,
                report_markdown,
                created_at,
                updated_at
         from performance_test_suites
         where id = $1`,
        [suiteId]
      );

      if (!suiteResult.rows[0]) {
        res.status(404).json({ error: "Performance test suite not found" });
        return;
      }

      const [runsResult, samplesResult] = await Promise.all([
        pool.query<PerformanceTestChildRunRecord>(
          `select id,
                  suite_id,
                  run_key,
                  scenario,
                  target_base_url,
                  status,
                  started_at,
                  finished_at,
                  duration_seconds,
                  max_vus,
                  peak_requests_per_second,
                  p50_ms,
                  p95_ms,
                  p99_ms,
                  error_rate,
                  total_requests,
                  failed_requests,
                  bottleneck,
                  recommendation,
                  created_at,
                  updated_at
           from performance_test_runs
           where suite_id = $1
           order by started_at desc, id desc`,
          [suiteId]
        ),
        pool.query<PerformanceTestSampleRecord>(
          `select id,
                  suite_id,
                  run_id,
                  source,
                  profile,
                  scenario,
                  stage_label,
                  target_vus,
                  current_vus,
                  sampled_at,
                  elapsed_seconds,
                  metrics,
                  unavailable_reason,
                  caveat,
                  created_at
           from performance_test_samples
           where suite_id = $1
             and ($2::text is null or source = $2)
             and ($3::integer is null or run_id = $3)
             and ($4::text is null or profile = $4)
           order by elapsed_seconds asc nulls last, sampled_at asc, id asc
           limit $5`,
          [
            suiteId,
            sampleQuery.value.source,
            sampleQuery.value.runId,
            sampleQuery.value.profile,
            sampleQuery.value.limit
          ]
        )
      ]);

      const response: PerformanceTestSuiteDetailResponse = {
        suite: mapPerformanceTestSuiteDetail(suiteResult.rows[0]),
        runs: runsResult.rows.map(mapPerformanceTestChildRun),
        samples: samplesResult.rows.map(mapPerformanceTestSample),
        sampleLimit: sampleQuery.value.limit
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

function readPaginationParam(
  value: unknown,
  fallback: number,
  max: number,
  name: "page" | "pageSize" | "sampleLimit"
): { ok: true; value: number } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true, value: fallback };
  }

  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    return { ok: false, error: `${name} must be a positive integer` };
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return { ok: false, error: `${name} must be a positive integer` };
  }

  return { ok: true, value: Math.min(parsed, max) };
}

function readSampleQuery(query: express.Request["query"]):
  | {
      ok: true;
      value: {
        limit: number;
        source: PerformanceTestSampleSource | null;
        runId: number | null;
        profile: string | null;
      };
    }
  | { ok: false; error: string } {
  const limit = readPaginationParam(
    query.sampleLimit,
    defaultPerformanceSamplesLimit,
    maxPerformanceSamplesLimit,
    "sampleLimit"
  );

  if (!limit.ok) {
    return limit;
  }

  const source = readOptionalSourceParam(query.source);

  if (source === "invalid") {
    return { ok: false, error: "source must be k6, sql, azure_app_service, azure_postgres, or suite" };
  }

  const runId = readOptionalPositiveIntegerQueryParam(query.runId, "runId");

  if (runId === "invalid") {
    return { ok: false, error: "runId must be a positive integer" };
  }

  const profile = readOptionalTextQueryParam(query.profile, "profile");

  if (profile === "invalid") {
    return { ok: false, error: "profile must be a single non-empty value" };
  }

  return {
    ok: true,
    value: {
      limit: limit.value,
      source,
      runId,
      profile
    }
  };
}

function readOptionalSourceParam(value: unknown): PerformanceTestSampleSource | null | "invalid" {
  if (value === undefined) {
    return null;
  }

  if (typeof value !== "string" || !performanceSampleSources.has(value as PerformanceTestSampleSource)) {
    return "invalid";
  }

  return value as PerformanceTestSampleSource;
}

function readOptionalPositiveIntegerQueryParam(value: unknown, _name: string): number | null | "invalid" {
  if (value === undefined) {
    return null;
  }

  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    return "invalid";
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return "invalid";
  }

  return parsed;
}

function readOptionalTextQueryParam(value: unknown, _name: string): string | null | "invalid" {
  if (value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    return "invalid";
  }

  const trimmed = value.trim();

  return trimmed ? trimmed : "invalid";
}

function mapPerformanceTestSuiteSummary(
  record: PerformanceTestSuiteSummaryRecord
): PerformanceTestSuiteSummary {
  return {
    id: record.id,
    suiteKey: record.suite_key,
    targetBaseUrl: sanitizeOperationalString(record.target_base_url),
    status: record.status,
    startedAt: record.started_at.toISOString(),
    finishedAt: record.finished_at?.toISOString() ?? null,
    durationSeconds: record.duration_seconds,
    plannedProfiles: Array.isArray(record.planned_profiles) ? record.planned_profiles : [],
    plannedStages: Array.isArray(record.planned_stages) ? record.planned_stages : [],
    firstFailingProfile: record.first_failing_profile,
    firstFailingStage: record.first_failing_stage,
    firstFailingTargetVus: record.first_failing_target_vus,
    firstFailingCurrentVus: record.first_failing_current_vus,
    bottleneck: record.bottleneck,
    bottleneckConfidence: record.bottleneck_confidence,
    recommendation: record.recommendation,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString()
  };
}

function mapPerformanceTestSuiteDetail(
  record: PerformanceTestSuiteRecord
): PerformanceTestSuiteDetail {
  return {
    ...mapPerformanceTestSuiteSummary(record),
    config: sanitizeOperationalRecord(record.config),
    summary: sanitizeOperationalRecord(record.summary),
    reportMarkdown: sanitizeOperationalMarkdown(record.report_markdown)
  };
}

function mapPerformanceTestChildRun(
  record: PerformanceTestChildRunRecord
): PerformanceTestSuiteChildRunSummary {
  return {
    id: record.id,
    suiteId: record.suite_id,
    runKey: record.run_key,
    scenario: record.scenario,
    targetBaseUrl: sanitizeOperationalString(record.target_base_url),
    status: record.status,
    startedAt: record.started_at.toISOString(),
    finishedAt: record.finished_at?.toISOString() ?? null,
    durationSeconds: record.duration_seconds,
    maxVus: record.max_vus,
    peakRequestsPerSecond: parseNullableNumber(record.peak_requests_per_second),
    p50Ms: parseNullableNumber(record.p50_ms),
    p95Ms: parseNullableNumber(record.p95_ms),
    p99Ms: parseNullableNumber(record.p99_ms),
    errorRate: parseNullableNumber(record.error_rate),
    totalRequests: record.total_requests,
    failedRequests: record.failed_requests,
    bottleneck: record.bottleneck,
    recommendation: record.recommendation,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString()
  };
}

function mapPerformanceTestSample(record: PerformanceTestSampleRecord): PerformanceTestSampleSummary {
  return {
    id: record.id,
    suiteId: record.suite_id,
    runId: record.run_id,
    source: record.source,
    profile: record.profile,
    scenario: record.scenario,
    stageLabel: record.stage_label,
    targetVus: record.target_vus,
    currentVus: record.current_vus,
    sampledAt: record.sampled_at.toISOString(),
    elapsedSeconds: record.elapsed_seconds,
    metrics: sanitizeOperationalRecord(record.metrics),
    unavailableReason: record.unavailable_reason,
    caveat: record.caveat,
    createdAt: record.created_at.toISOString()
  };
}

function parseNullableNumber(value: string | null): number | null {
  return value === null ? null : Number(value);
}
