import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { pool } from "../src/db.js";
import { registerAdmin, registerUser } from "./helpers/factories.js";

const app = createApp();

describe("admin performance test suites", () => {
  it("rejects unauthenticated and non-admin access", async () => {
    const user = await registerUser(app);
    const suite = await insertPerformanceSuite({ suiteKey: "auth-suite" });

    const unauthenticatedList = await request(app).get("/api/admin/performance-suites");
    const unauthenticatedDetail = await request(app).get(
      `/api/admin/performance-suites/${suite.id}`
    );
    const standardList = await request(app)
      .get("/api/admin/performance-suites")
      .set("Cookie", user.cookie);
    const standardDetail = await request(app)
      .get(`/api/admin/performance-suites/${suite.id}`)
      .set("Cookie", user.cookie);

    expect(unauthenticatedList.status).toBe(401);
    expect(unauthenticatedDetail.status).toBe(401);
    expect(standardList.status).toBe(403);
    expect(standardDetail.status).toBe(403);
  });

  it("lists suite summary rows newest first without sample rows", async () => {
    const admin = await registerAdmin(app);
    const olderSuite = await insertPerformanceSuite({
      suiteKey: "older-suite",
      status: "completed",
      startedAt: "2026-06-29T12:00:00.000Z"
    });
    const newerSuite = await insertPerformanceSuite({
      suiteKey: "newer-suite",
      status: "failed",
      startedAt: "2026-06-29T13:00:00.000Z",
      firstFailingProfile: "mixed",
      firstFailingStage: "50-vus",
      firstFailingTargetVus: 50,
      firstFailingCurrentVus: 48
    });
    await insertPerformanceSample({ suiteId: newerSuite.id, source: "k6", elapsedSeconds: 10 });

    const response = await request(app)
      .get("/api/admin/performance-suites?page=1&pageSize=1")
      .set("Cookie", admin.cookie);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      total: 2,
      page: 1,
      pageSize: 1,
      suites: [
        {
          id: newerSuite.id,
          suiteKey: "newer-suite",
          targetBaseUrl: "https://survey.example.test",
          status: "failed",
          startedAt: "2026-06-29T13:00:00.000Z",
          finishedAt: "2026-06-29T13:15:00.000Z",
          durationSeconds: 900,
          plannedProfiles: ["smoke", "mixed"],
          plannedStages: [{ label: "25-vus", targetVus: 25 }],
          firstFailingProfile: "mixed",
          firstFailingStage: "50-vus",
          firstFailingTargetVus: 50,
          firstFailingCurrentVus: 48,
          bottleneck: "app_service",
          bottleneckConfidence: "medium",
          recommendation: "Increase App Service tier only after confirming retry behavior.",
          createdAt: expect.any(String),
          updatedAt: expect.any(String)
        }
      ]
    });
    expect(response.body.suites[0].id).not.toBe(olderSuite.id);
    expect(response.body.suites[0].config).toBeUndefined();
    expect(response.body.suites[0].summary).toBeUndefined();
    expect(response.body.suites[0].reportMarkdown).toBeUndefined();
    expect(response.body.suites[0].samples).toBeUndefined();
  });

  it("returns detail with child runs and bounded ordered samples", async () => {
    const admin = await registerAdmin(app);
    const suite = await insertPerformanceSuite({
      suiteKey: "detail-suite",
      config: { maxVus: 50, nested: { threshold: "p95" } },
      summary: { result: "first degradation at 50 VUs" },
      reportMarkdown: "## Suite report\n\nCapacity changed at 50 VUs."
    });
    const run = await insertPerformanceRun({
      suiteId: suite.id,
      runKey: "detail-run",
      scenario: "mixed"
    });
    await insertPerformanceSample({
      suiteId: suite.id,
      runId: run.id,
      source: "k6",
      profile: "mixed",
      scenario: "mixed",
      stageLabel: "25-vus",
      targetVus: 25,
      currentVus: 23,
      elapsedSeconds: 20,
      sampledAt: "2026-06-29T13:00:20.000Z",
      metrics: { p95Ms: 400 }
    });
    await insertPerformanceSample({
      suiteId: suite.id,
      source: "sql",
      profile: "mixed",
      stageLabel: "10-vus",
      elapsedSeconds: 10,
      sampledAt: "2026-06-29T13:00:10.000Z",
      metrics: { activeConnections: 4 }
    });

    const response = await request(app)
      .get(`/api/admin/performance-suites/${suite.id}?sampleLimit=1`)
      .set("Cookie", admin.cookie);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      sampleLimit: 1,
      suite: {
        id: suite.id,
        suiteKey: "detail-suite",
        config: { maxVus: 50, nested: { threshold: "p95" } },
        summary: { result: "first degradation at 50 VUs" },
        reportMarkdown: "## Suite report\n\nCapacity changed at 50 VUs."
      },
      runs: [
        {
          id: run.id,
          suiteId: suite.id,
          runKey: "detail-run",
          scenario: "mixed",
          status: "completed",
          p95Ms: 240.33
        }
      ],
      samples: [
        {
          source: "sql",
          profile: "mixed",
          stageLabel: "10-vus",
          elapsedSeconds: 10,
          metrics: { activeConnections: 4 }
        }
      ]
    });
  });

  it("filters samples by source, runId, and profile", async () => {
    const admin = await registerAdmin(app);
    const suite = await insertPerformanceSuite({ suiteKey: "filtered-suite" });
    const matchingRun = await insertPerformanceRun({
      suiteId: suite.id,
      runKey: "matching-run",
      scenario: "read-heavy"
    });
    await insertPerformanceRun({
      suiteId: suite.id,
      runKey: "other-run",
      scenario: "write-heavy"
    });
    await insertPerformanceSample({
      suiteId: suite.id,
      runId: matchingRun.id,
      source: "k6",
      profile: "read-heavy",
      elapsedSeconds: 5,
      metrics: { p95Ms: 123 }
    });
    await insertPerformanceSample({
      suiteId: suite.id,
      source: "sql",
      profile: "read-heavy",
      elapsedSeconds: 6,
      metrics: { activeConnections: 2 }
    });
    await insertPerformanceSample({
      suiteId: suite.id,
      runId: matchingRun.id,
      source: "k6",
      profile: "write-heavy",
      elapsedSeconds: 7,
      metrics: { p95Ms: 456 }
    });

    const response = await request(app)
      .get(
        `/api/admin/performance-suites/${suite.id}?source=k6&runId=${matchingRun.id}&profile=read-heavy`
      )
      .set("Cookie", admin.cookie);

    expect(response.status).toBe(200);
    expect(response.body.samples).toHaveLength(1);
    expect(response.body.samples[0]).toMatchObject({
      source: "k6",
      runId: matchingRun.id,
      profile: "read-heavy",
      metrics: { p95Ms: 123 }
    });
  });

  it("returns default JSON fields and unavailable sample caveats without zeroing metrics", async () => {
    const admin = await registerAdmin(app);
    const suite = await insertPerformanceSuite({ suiteKey: "defaults-suite", useDefaults: true });
    await insertPerformanceSample({
      suiteId: suite.id,
      source: "azure_app_service",
      metrics: {},
      unavailableReason: "Azure CLI was not authenticated.",
      caveat: "App Service CPU is unavailable, not zero."
    });

    const response = await request(app)
      .get(`/api/admin/performance-suites/${suite.id}`)
      .set("Cookie", admin.cookie);

    expect(response.status).toBe(200);
    expect(response.body.suite.plannedProfiles).toEqual([]);
    expect(response.body.suite.plannedStages).toEqual([]);
    expect(response.body.suite.config).toEqual({});
    expect(response.body.suite.summary).toEqual({});
    expect(response.body.samples[0]).toMatchObject({
      source: "azure_app_service",
      metrics: {},
      unavailableReason: "Azure CLI was not authenticated.",
      caveat: "App Service CPU is unavailable, not zero."
    });
  });

  it("redacts secret-like persisted operational fields from suite detail and samples", async () => {
    const admin = await registerAdmin(app);
    const suite = await insertPerformanceSuite({
      suiteKey: "redacted-suite",
      config: {
        adminPassword: "super-secret-password",
        databaseUrl: "postgresql://app:secret@db.example.test:5432/survey",
        apiKey: "api-secret",
        safeFlag: true
      },
      summary: {
        headers: { authorization: "Bearer secret-token" },
        note: 'token=abc123 password=hunter2 accessToken="abc123" {"api_key":"raw"}'
      },
      reportMarkdown:
        "DB postgresql://app:secret@db.example.test:5432/survey Authorization: Bearer abc123 token=raw apiKey=abc"
    });
    await insertPerformanceSample({
      suiteId: suite.id,
      source: "suite",
      metrics: {
        cookie: "session=abc123",
        nested: { csrfToken: "csrf-secret", p95Ms: 10 },
        message: "Bearer abc123"
      }
    });

    const response = await request(app)
      .get(`/api/admin/performance-suites/${suite.id}`)
      .set("Cookie", admin.cookie);

    expect(response.status).toBe(200);
    expect(response.body.suite.config).toEqual({
      adminPassword: "[redacted]",
      databaseUrl: "[redacted]",
      apiKey: "[redacted]",
      safeFlag: true
    });
    expect(response.body.suite.summary).toEqual({
      headers: { authorization: "[redacted]" },
      note: "token=[redacted] password=[redacted] accessToken=[redacted] {api_key=[redacted]}"
    });
    expect(response.body.suite.reportMarkdown).not.toContain("secret");
    expect(response.body.suite.reportMarkdown).toContain("[redacted-postgres-url]");
    expect(response.body.samples[0].metrics).toEqual({
      cookie: "[redacted]",
      nested: { csrfToken: "[redacted]", p95Ms: 10 },
      message: "Bearer [redacted]"
    });
  });

  it("returns 404 for missing suites and validates ids, pagination, and sample filters", async () => {
    const admin = await registerAdmin(app);
    const suite = await insertPerformanceSuite({ suiteKey: "validation-suite" });

    const missing = await request(app)
      .get("/api/admin/performance-suites/999999")
      .set("Cookie", admin.cookie);
    const invalidId = await request(app)
      .get("/api/admin/performance-suites/not-a-number")
      .set("Cookie", admin.cookie);
    const invalidPage = await request(app)
      .get("/api/admin/performance-suites?page=0")
      .set("Cookie", admin.cookie);
    const invalidPageSize = await request(app)
      .get("/api/admin/performance-suites?pageSize=abc")
      .set("Cookie", admin.cookie);
    const invalidSource = await request(app)
      .get(`/api/admin/performance-suites/${suite.id}?source=app`)
      .set("Cookie", admin.cookie);
    const invalidRunId = await request(app)
      .get(`/api/admin/performance-suites/${suite.id}?runId=0`)
      .set("Cookie", admin.cookie);
    const invalidLimit = await request(app)
      .get(`/api/admin/performance-suites/${suite.id}?sampleLimit=nope`)
      .set("Cookie", admin.cookie);

    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ error: "Performance test suite not found" });
    expect(invalidId.status).toBe(400);
    expect(invalidId.body).toEqual({
      error: "Performance test suite id must be a positive integer"
    });
    expect(invalidPage.status).toBe(400);
    expect(invalidPage.body).toEqual({ error: "page must be a positive integer" });
    expect(invalidPageSize.status).toBe(400);
    expect(invalidPageSize.body).toEqual({ error: "pageSize must be a positive integer" });
    expect(invalidSource.status).toBe(400);
    expect(invalidRunId.status).toBe(400);
    expect(invalidLimit.status).toBe(400);
  });

  it("caps requested sample limits and exposes no write operations", async () => {
    const admin = await registerAdmin(app);
    const suite = await insertPerformanceSuite({ suiteKey: "cap-suite" });

    const detail = await request(app)
      .get(`/api/admin/performance-suites/${suite.id}?sampleLimit=5000`)
      .set("Cookie", admin.cookie);
    const write = await request(app)
      .post("/api/admin/performance-suites")
      .set("Cookie", admin.cookie)
      .send({ suiteKey: "browser-suite" });
    const storedRows = await pool.query<{ count: string }>(
      `select count(*)::text as count
       from performance_test_suites
       where suite_key = 'browser-suite'`
    );

    expect(detail.status).toBe(200);
    expect(detail.body.sampleLimit).toBe(1000);
    expect(write.status).toBe(404);
    expect(Number(storedRows.rows[0].count)).toBe(0);
  });
});

type InsertPerformanceSuiteInput = {
  suiteKey: string;
  status?: "running" | "completed" | "failed" | "aborted";
  startedAt?: string;
  firstFailingProfile?: string | null;
  firstFailingStage?: string | null;
  firstFailingTargetVus?: number | null;
  firstFailingCurrentVus?: number | null;
  config?: Record<string, unknown>;
  summary?: Record<string, unknown>;
  reportMarkdown?: string | null;
  useDefaults?: boolean;
};

async function insertPerformanceSuite(input: InsertPerformanceSuiteInput): Promise<{ id: number }> {
  if (input.useDefaults) {
    const result = await pool.query<{ id: number }>(
      `insert into performance_test_suites (
         suite_key,
         target_base_url,
         status,
         started_at
       )
       values ($1, 'https://survey.example.test', 'running', '2026-06-29T13:00:00.000Z')
       returning id`,
      [input.suiteKey]
    );

    return result.rows[0];
  }

  const result = await pool.query<{ id: number }>(
    `insert into performance_test_suites (
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
       report_markdown
     )
     values (
       $1,
       'https://survey.example.test',
       $2,
       $3,
       '2026-06-29T13:15:00.000Z',
       900,
       $4::jsonb,
       $5::jsonb,
       $6,
       $7,
       $8,
       $9,
       'app_service',
       'medium',
       'Increase App Service tier only after confirming retry behavior.',
       $10::jsonb,
       $11::jsonb,
       $12
     )
     returning id`,
    [
      input.suiteKey,
      input.status ?? "completed",
      input.startedAt ?? "2026-06-29T13:00:00.000Z",
      JSON.stringify(["smoke", "mixed"]),
      JSON.stringify([{ label: "25-vus", targetVus: 25 }]),
      input.firstFailingProfile ?? null,
      input.firstFailingStage ?? null,
      input.firstFailingTargetVus ?? null,
      input.firstFailingCurrentVus ?? null,
      JSON.stringify(input.config ?? { maxVus: 50 }),
      JSON.stringify(input.summary ?? { result: "ok" }),
      input.reportMarkdown ?? "# Suite report"
    ]
  );

  return result.rows[0];
}

type InsertPerformanceRunInput = {
  suiteId: number;
  runKey: string;
  scenario: string;
};

async function insertPerformanceRun(input: InsertPerformanceRunInput): Promise<{ id: number }> {
  const result = await pool.query<{ id: number }>(
    `insert into performance_test_runs (
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
       config,
       summary,
       report_markdown
     )
     values (
       $1,
       $2,
       $3,
       'https://survey.example.test',
       'completed',
       '2026-06-29T13:05:00.000Z',
       '2026-06-29T13:10:00.000Z',
       300,
       25,
       42.75,
       100.50,
       240.33,
       450.25,
       0.012500,
       12000,
       150,
       'app_pool',
       'Increase DB pool only after confirming database headroom.',
       '{}'::jsonb,
       '{}'::jsonb,
       '# Performance report'
     )
     returning id`,
    [input.suiteId, input.runKey, input.scenario]
  );

  return result.rows[0];
}

type InsertPerformanceSampleInput = {
  suiteId: number;
  runId?: number | null;
  source: "k6" | "sql" | "azure_app_service" | "azure_postgres" | "suite";
  profile?: string | null;
  scenario?: string | null;
  stageLabel?: string | null;
  targetVus?: number | null;
  currentVus?: number | null;
  elapsedSeconds?: number | null;
  sampledAt?: string;
  metrics?: Record<string, unknown>;
  unavailableReason?: string | null;
  caveat?: string | null;
};

async function insertPerformanceSample(input: InsertPerformanceSampleInput): Promise<{ id: number }> {
  const result = await pool.query<{ id: number }>(
    `insert into performance_test_samples (
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
       caveat
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13)
     returning id`,
    [
      input.suiteId,
      input.runId ?? null,
      input.source,
      input.profile ?? null,
      input.scenario ?? null,
      input.stageLabel ?? null,
      input.targetVus ?? null,
      input.currentVus ?? null,
      input.sampledAt ?? "2026-06-29T13:00:00.000Z",
      input.elapsedSeconds ?? null,
      JSON.stringify(input.metrics ?? {}),
      input.unavailableReason ?? null,
      input.caveat ?? null
    ]
  );

  return result.rows[0];
}
