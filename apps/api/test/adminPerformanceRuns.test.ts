import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { pool } from "../src/db.js";
import { registerAdmin, registerUser } from "./helpers/factories.js";

const app = createApp();

describe("admin performance test runs", () => {
  it("rejects unauthenticated and non-admin access", async () => {
    const user = await registerUser(app);
    const run = await insertPerformanceRun({ runKey: "auth-run" });

    const unauthenticatedList = await request(app).get("/api/admin/performance-runs");
    const unauthenticatedDetail = await request(app).get(`/api/admin/performance-runs/${run.id}`);
    const standardList = await request(app)
      .get("/api/admin/performance-runs")
      .set("Cookie", user.cookie);
    const standardDetail = await request(app)
      .get(`/api/admin/performance-runs/${run.id}`)
      .set("Cookie", user.cookie);

    expect(unauthenticatedList.status).toBe(401);
    expect(unauthenticatedDetail.status).toBe(401);
    expect(standardList.status).toBe(403);
    expect(standardDetail.status).toBe(403);
  });

  it("lists summary rows newest first with pagination metadata", async () => {
    const admin = await registerAdmin(app);
    const olderRun = await insertPerformanceRun({
      runKey: "older-run",
      scenario: "read-heavy",
      startedAt: "2026-06-29T12:00:00.000Z",
      p95Ms: 210.25
    });
    const newerRun = await insertPerformanceRun({
      runKey: "newer-run",
      scenario: "mixed",
      status: "failed",
      startedAt: "2026-06-29T13:00:00.000Z",
      p95Ms: 310.5
    });

    const response = await request(app)
      .get("/api/admin/performance-runs?page=1&pageSize=1")
      .set("Cookie", admin.cookie);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      total: 2,
      page: 1,
      pageSize: 1,
      runs: [
        {
          id: newerRun.id,
          runKey: "newer-run",
          scenario: "mixed",
          targetBaseUrl: "https://survey.example.test",
          status: "failed",
          startedAt: "2026-06-29T13:00:00.000Z",
          finishedAt: "2026-06-29T13:05:00.000Z",
          durationSeconds: 300,
          maxVus: 25,
          peakRequestsPerSecond: 42.75,
          p50Ms: 100.5,
          p95Ms: 310.5,
          p99Ms: 450.25,
          errorRate: 0.0125,
          totalRequests: 12000,
          failedRequests: 150,
          bottleneck: "app_pool",
          recommendation: "Increase DB pool only after confirming database headroom.",
          createdAt: expect.any(String),
          updatedAt: expect.any(String)
        }
      ]
    });
    expect(response.body.runs[0].id).not.toBe(olderRun.id);
    expect(response.body.runs[0].config).toBeUndefined();
    expect(response.body.runs[0].summary).toBeUndefined();
    expect(response.body.runs[0].reportMarkdown).toBeUndefined();
  });

  it("returns detailed JSON and markdown fields for one run", async () => {
    const admin = await registerAdmin(app);
    const run = await insertPerformanceRun({
      runKey: "detail-run",
      config: { vus: 25, duration: "5m", thresholds: { p95: 500 } },
      summary: { checksPassed: true, httpReqDuration: { p95: 240.33 } },
      reportMarkdown: "## Performance report\n\nCompleted successfully."
    });

    const response = await request(app)
      .get(`/api/admin/performance-runs/${run.id}`)
      .set("Cookie", admin.cookie);

    expect(response.status).toBe(200);
    expect(response.body.run).toMatchObject({
      id: run.id,
      runKey: "detail-run",
      config: { vus: 25, duration: "5m", thresholds: { p95: 500 } },
      summary: { checksPassed: true, httpReqDuration: { p95: 240.33 } },
      reportMarkdown: "## Performance report\n\nCompleted successfully."
    });
  });

  it("redacts secret-like persisted operational fields from run detail", async () => {
    const admin = await registerAdmin(app);
    const run = await insertPerformanceRun({
      runKey: "redacted-run",
      targetBaseUrl: "https://operator:secret@survey.example.test",
      config: {
        databaseUrl: "postgresql://app:secret@db.example.test:5432/survey",
        apiKey: "api-secret",
        safeFlag: true
      },
      summary: {
        note: 'accessToken="abc123" api_key=raw',
        headers: { authorization: "Bearer secret-token" }
      },
      reportMarkdown: "postgresql://app:secret@db.example.test:5432/survey apiKey=abc123"
    });

    const response = await request(app)
      .get(`/api/admin/performance-runs/${run.id}`)
      .set("Cookie", admin.cookie);

    expect(response.status).toBe(200);
    expect(response.body.run.targetBaseUrl).toBe("https://[redacted]@survey.example.test");
    expect(response.body.run.config).toEqual({
      databaseUrl: "[redacted]",
      apiKey: "[redacted]",
      safeFlag: true
    });
    expect(response.body.run.summary).toEqual({
      note: "accessToken=[redacted] api_key=[redacted]",
      headers: { authorization: "[redacted]" }
    });
    expect(response.body.run.reportMarkdown).toContain("[redacted-postgres-url]");
    expect(response.body.run.reportMarkdown).toContain("apiKey=[redacted]");
  });

  it("returns 404 for missing runs and validates ids and pagination", async () => {
    const admin = await registerAdmin(app);

    const missing = await request(app)
      .get("/api/admin/performance-runs/999999")
      .set("Cookie", admin.cookie);
    const invalidId = await request(app)
      .get("/api/admin/performance-runs/not-a-number")
      .set("Cookie", admin.cookie);
    const invalidPage = await request(app)
      .get("/api/admin/performance-runs?page=0")
      .set("Cookie", admin.cookie);
    const invalidPageSize = await request(app)
      .get("/api/admin/performance-runs?pageSize=abc")
      .set("Cookie", admin.cookie);

    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ error: "Performance test run not found" });
    expect(invalidId.status).toBe(400);
    expect(invalidId.body).toEqual({
      error: "Performance test run id must be a positive integer"
    });
    expect(invalidPage.status).toBe(400);
    expect(invalidPage.body).toEqual({ error: "page must be a positive integer" });
    expect(invalidPageSize.status).toBe(400);
    expect(invalidPageSize.body).toEqual({ error: "pageSize must be a positive integer" });
  });

  it("does not expose write operations for browser-triggered performance runs", async () => {
    const admin = await registerAdmin(app);

    const response = await request(app)
      .post("/api/admin/performance-runs")
      .set("Cookie", admin.cookie)
      .send({ scenario: "read-heavy" });
    const storedRows = await pool.query<{ count: string }>(
      `select count(*)::text as count
       from performance_test_runs`
    );

    expect(response.status).toBe(404);
    expect(Number(storedRows.rows[0].count)).toBe(0);
  });
});

type InsertPerformanceRunInput = {
  runKey: string;
  scenario?: string;
  status?: "running" | "completed" | "failed" | "aborted";
  targetBaseUrl?: string;
  startedAt?: string;
  p95Ms?: number;
  config?: Record<string, unknown>;
  summary?: Record<string, unknown>;
  reportMarkdown?: string;
};

async function insertPerformanceRun(input: InsertPerformanceRunInput): Promise<{ id: number }> {
  const result = await pool.query<{ id: number }>(
    `insert into performance_test_runs (
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
       $4,
       $5,
       '2026-06-29T13:05:00.000Z',
       300,
       25,
       42.75,
       100.50,
       $6,
       450.25,
       0.012500,
       12000,
       150,
       'app_pool',
       'Increase DB pool only after confirming database headroom.',
       $7::jsonb,
       $8::jsonb,
       $9
     )
     returning id`,
    [
      input.runKey,
      input.scenario ?? "read-heavy",
      input.targetBaseUrl ?? "https://survey.example.test",
      input.status ?? "completed",
      input.startedAt ?? "2026-06-29T13:00:00.000Z",
      input.p95Ms ?? 240.33,
      JSON.stringify(input.config ?? { vus: 25 }),
      JSON.stringify(input.summary ?? { checksPassed: true }),
      input.reportMarkdown ?? "# Performance report"
    ]
  );

  return result.rows[0];
}
