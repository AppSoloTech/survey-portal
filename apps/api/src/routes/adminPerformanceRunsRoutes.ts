import type {
  PerformanceTestRunDetail,
  PerformanceTestRunDetailResponse,
  PerformanceTestRunStatus,
  PerformanceTestRunSummary,
  PerformanceTestRunsListResponse
} from "@survey-portal/shared";
import express from "express";

import { pool } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { readPositiveIntegerParam } from "../services/validation.js";

const defaultPerformanceRunsPageSize = 20;
const maxPerformanceRunsPageSize = 100;

interface PerformanceTestRunSummaryRecord {
  id: number;
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

interface PerformanceTestRunRecord extends PerformanceTestRunSummaryRecord {
  config: Record<string, unknown>;
  summary: Record<string, unknown>;
  report_markdown: string | null;
}

export const adminPerformanceRunsRouter = express.Router();

adminPerformanceRunsRouter.get("/", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const page = readPaginationParam(req.query.page, 1, Number.MAX_SAFE_INTEGER, "page");
    const pageSize = readPaginationParam(
      req.query.pageSize,
      defaultPerformanceRunsPageSize,
      maxPerformanceRunsPageSize,
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
       from performance_test_runs`
    );
    const runsResult = await pool.query<PerformanceTestRunRecord>(
      `select id,
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
       order by started_at desc, id desc
       limit $1
       offset $2`,
      [pageSize.value, offset]
    );
    const response: PerformanceTestRunsListResponse = {
      runs: runsResult.rows.map(mapPerformanceTestRunSummary),
      total: Number(totalResult.rows[0]?.count ?? 0),
      page: page.value,
      pageSize: pageSize.value
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

adminPerformanceRunsRouter.get("/:id", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const runId = readPositiveIntegerParam(req.params.id);

    if (!runId) {
      res.status(400).json({ error: "Performance test run id must be a positive integer" });
      return;
    }

    const result = await pool.query<PerformanceTestRunRecord>(
      `select id,
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
              config,
              summary,
              report_markdown,
              created_at,
              updated_at
       from performance_test_runs
       where id = $1`,
      [runId]
    );

    if (!result.rows[0]) {
      res.status(404).json({ error: "Performance test run not found" });
      return;
    }

    const response: PerformanceTestRunDetailResponse = {
      run: mapPerformanceTestRunDetail(result.rows[0])
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

function readPaginationParam(
  value: unknown,
  fallback: number,
  max: number,
  name: "page" | "pageSize"
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

function mapPerformanceTestRunSummary(
  record: PerformanceTestRunSummaryRecord
): PerformanceTestRunSummary {
  return {
    id: record.id,
    runKey: record.run_key,
    scenario: record.scenario,
    targetBaseUrl: record.target_base_url,
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

function mapPerformanceTestRunDetail(record: PerformanceTestRunRecord): PerformanceTestRunDetail {
  return {
    ...mapPerformanceTestRunSummary(record),
    config: record.config,
    summary: record.summary,
    reportMarkdown: record.report_markdown
  };
}

function parseNullableNumber(value: string | null): number | null {
  return value === null ? null : Number(value);
}
