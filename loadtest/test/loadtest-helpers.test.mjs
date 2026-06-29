import assert from "node:assert/strict";
import test from "node:test";

import { assertTargetSafety, parseCliArgs, parseEnvFileText, resolveLoadtestConfig } from "../lib/env.mjs";
import { summarizePostgresSamples } from "../lib/metrics.mjs";
import { buildMarkdownReport, classifyBottleneck, normalizeK6Summary } from "../lib/reporting.mjs";

test("parseEnvFileText reads simple dotenv values without mutating process.env", () => {
  const parsed = parseEnvFileText(`
    LOADTEST_BASE_URL="http://localhost:3000"
    LOADTEST_VUS=2
    # ignored
  `);

  assert.equal(parsed.LOADTEST_BASE_URL, "http://localhost:3000");
  assert.equal(parsed.LOADTEST_VUS, "2");
});

test("parseCliArgs supports dev, yes, and key/value arguments", () => {
  const parsed = parseCliArgs(["--dev", "--yes", "--run-key", "abc", "--profile=smoke"]);

  assert.equal(parsed.dev, true);
  assert.equal(parsed.yes, true);
  assert.equal(parsed.values.runKey, "abc");
  assert.equal(parsed.values.profile, "smoke");
});

test("target safety refuses local targets outside explicit dev mode", () => {
  assert.throws(
    () =>
      assertTargetSafety({
        baseHost: "localhost",
        databaseHost: "localhost",
        devMode: false
      }),
    /without --dev/
  );
});

test("target safety refuses hosted target confusion in dev mode", () => {
  assert.throws(
    () =>
      assertTargetSafety({
        baseHost: "localhost",
        databaseHost: "example.postgres.database.azure.com",
        devMode: true
      }),
    /both LOADTEST_BASE_URL/
  );
});

test("resolveLoadtestConfig builds a local dev config from explicit LOADTEST values", () => {
  const config = resolveLoadtestConfig({
    argv: ["--dev", "--run-key", "unit-run"],
    env: {
      LOADTEST_BASE_URL: "http://localhost:3000",
      LOADTEST_DATABASE_URL: "postgresql://user:pass@localhost:5432/survey_portal",
      LOADTEST_VUS: "3",
      LOADTEST_APP_DB_POOL_MAX: "20",
      LOADTEST_APP_INSTANCE_COUNT: "2"
    }
  });

  assert.equal(config.runKey, "unit-run");
  assert.equal(config.devMode, true);
  assert.equal(config.vus, 3);
  assert.equal(config.appDbPoolMax, 20);
  assert.equal(config.appInstanceCount, 2);
  assert.equal(config.databaseSsl, undefined);
});

test("normalizeK6Summary extracts duration, request, and error metrics", () => {
  const summary = normalizeK6Summary({
    metrics: {
      http_req_duration: { values: { "p(50)": 20, "p(95)": 90, "p(99)": 150 } },
      http_req_failed: { rate: 0.01 },
      http_reqs: { count: 100, rate: 20 },
      vus_max: { value: 5 }
    }
  });

  assert.equal(summary.p95Ms, 90);
  assert.equal(summary.totalRequests, 100);
  assert.equal(summary.failedRequests, 1);
  assert.equal(summary.maxVus, 5);
});

test("summarizePostgresSamples computes connection maxima and stat deltas", () => {
  const summary = summarizePostgresSamples([
    {
      available: true,
      activity: { active_connections: 2, total_connections: 4, waiting_connections: 0 },
      database: { xact_commit: "10", xact_rollback: "1", blks_read: "5", blks_hit: "20" }
    },
    {
      available: true,
      activity: { active_connections: 5, total_connections: 6, waiting_connections: 1 },
      database: { xact_commit: "15", xact_rollback: "1", blks_read: "8", blks_hit: "35" }
    }
  ]);

  assert.equal(summary.available, true);
  assert.equal(summary.maxActiveConnections, 5);
  assert.equal(summary.transactionCommitDelta, 5);
  assert.equal(summary.blockHitDelta, 15);
});

test("classifyBottleneck flags app-pool pressure when connections pin near default pool size", () => {
  const result = classifyBottleneck({
    httpSummary: { p95Ms: 1500, errorRate: 0.03 },
    sqlSummary: {
      available: true,
      maxActiveConnections: 10,
      maxTotalConnections: 10,
      transactionRollbackDelta: 0
    },
    appDbPoolMax: 10,
    appInstanceCount: 1
  });

  assert.equal(result.bottleneck, "app_pool");
});

test("classifyBottleneck respects configured app instance pool ceiling", () => {
  const result = classifyBottleneck({
    httpSummary: { p95Ms: 1500, errorRate: 0.03 },
    sqlSummary: {
      available: true,
      maxActiveConnections: 10,
      maxTotalConnections: 10,
      transactionRollbackDelta: 0
    },
    appDbPoolMax: 10,
    appInstanceCount: 3
  });

  assert.equal(result.bottleneck, "unknown");
});

test("buildMarkdownReport renders concise operator output", () => {
  const markdown = buildMarkdownReport({
    runKey: "unit-run",
    scenario: "smoke",
    targetBaseUrl: "http://localhost:3000",
    status: "completed",
    httpSummary: {
      totalRequests: 100,
      failedRequests: 0,
      errorRate: 0,
      p50Ms: 20,
      p95Ms: 90,
      p99Ms: 150,
      peakRequestsPerSecond: 20,
      maxVus: 5
    },
    sqlSummary: { available: false, unavailableReason: "not sampled" },
    recommendation: "No action."
  });

  assert.match(markdown, /Performance test report: unit-run/);
  assert.match(markdown, /No action\./);
});
