import assert from "node:assert/strict";
import test from "node:test";

import { assertTargetSafety, parseCliArgs, parseEnvFileText, resolveLoadtestConfig } from "../lib/env.mjs";
import { summarizePostgresSamples } from "../lib/metrics.mjs";
import {
  createPerformanceRun,
  createPerformanceSuite,
  finishPerformanceSuite,
  insertPerformanceSamples
} from "../lib/persistence.mjs";
import { buildMarkdownReport, classifyBottleneck, normalizeK6Summary } from "../lib/reporting.mjs";
import { containsOperationalSecret, sanitizeOperationalValue } from "../lib/redaction.mjs";
import {
  buildSuiteMarkdownReport,
  classifySuiteResults,
  parseSuitePlan,
  shouldEarlyStop
} from "../lib/suite-planning.mjs";

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

test("parseCliArgs supports standalone suite boolean flags", () => {
  const parsed = parseCliArgs(["--allow-capacity", "--include-direct-db", "--suite", "capacity"]);

  assert.equal(parsed.values.allowCapacity, true);
  assert.equal(parsed.values.includeDirectDb, true);
  assert.equal(parsed.values.suite, "capacity");
});

test("parseCliArgs rejects known value-style flags without a value", () => {
  assert.throws(() => parseCliArgs(["--run-key"]), /requires a value/);
  assert.throws(() => parseCliArgs(["--profile", "--yes"]), /requires a value/);
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

test("classifyBottleneck scales DB pressure threshold with configured pool ceiling", () => {
  const belowScaledThreshold = classifyBottleneck({
    httpSummary: { p95Ms: 1500, errorRate: 0.03 },
    sqlSummary: {
      available: true,
      maxActiveConnections: 20,
      maxTotalConnections: 20,
      transactionRollbackDelta: 0
    },
    appDbPoolMax: 10,
    appInstanceCount: 3
  });
  const aboveScaledThreshold = classifyBottleneck({
    httpSummary: { p95Ms: 1500, errorRate: 0.03 },
    sqlSummary: {
      available: true,
      maxActiveConnections: 60,
      maxTotalConnections: 60,
      transactionRollbackDelta: 0
    },
    appDbPoolMax: 10,
    appInstanceCount: 3
  });

  assert.equal(belowScaledThreshold.bottleneck, "unknown");
  assert.equal(aboveScaledThreshold.bottleneck, "database");
});

test("classifyBottleneck reports database pressure on transaction rollbacks", () => {
  const result = classifyBottleneck({
    httpSummary: { p95Ms: 1500, errorRate: 0.03 },
    sqlSummary: {
      available: true,
      maxActiveConnections: 1,
      maxTotalConnections: 2,
      transactionRollbackDelta: 1
    },
    appDbPoolMax: 10,
    appInstanceCount: 3
  });

  assert.equal(result.bottleneck, "database");
  assert.match(result.recommendation, /rollbacks increased/);
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

test("parseSuitePlan expands the small preset with smoke and bracketed child runs", () => {
  const config = resolveLoadtestConfig({
    argv: ["--dev", "--run-key", "unit-run", "--suite-key", "unit-suite"],
    env: {
      LOADTEST_BASE_URL: "http://localhost:3000",
      LOADTEST_DATABASE_URL: "postgresql://user:pass@localhost:5432/survey_portal"
    }
  });
  const plan = parseSuitePlan(config);

  assert.equal(plan.suiteKey, "unit-suite");
  assert.deepEqual(plan.profiles, ["smoke", "mixed", "read-heavy", "write-heavy"]);
  assert.equal(plan.maxVus, 10);
  assert.equal(plan.childRuns.some((child) => child.profile === "smoke"), true);
  assert.equal(plan.childRuns.some((child) => child.profile === "write-heavy" && child.targetVus === 10), true);
});

test("parseSuitePlan requires explicit capacity preset opt-in", () => {
  const config = resolveLoadtestConfig({
    argv: ["--dev", "--run-key", "unit-run", "--suite", "capacity"],
    env: {
      LOADTEST_BASE_URL: "http://localhost:3000",
      LOADTEST_DATABASE_URL: "postgresql://user:pass@localhost:5432/survey_portal"
    }
  });

  assert.throws(() => parseSuitePlan(config), /explicit opt-in/);
});

test("parseSuitePlan does not treat --allow-capacity false as opt-in", () => {
  const config = resolveLoadtestConfig({
    argv: ["--dev", "--run-key", "unit-run", "--suite", "capacity", "--allow-capacity", "false"],
    env: {
      LOADTEST_BASE_URL: "http://localhost:3000",
      LOADTEST_DATABASE_URL: "postgresql://user:pass@localhost:5432/survey_portal"
    }
  });

  assert.throws(() => parseSuitePlan(config), /explicit opt-in/);
});

test("parseSuitePlan accepts standalone --allow-capacity for capacity preset", () => {
  const config = resolveLoadtestConfig({
    argv: ["--dev", "--run-key", "unit-run", "--suite", "capacity", "--allow-capacity", "--max-vus", "40"],
    env: {
      LOADTEST_BASE_URL: "http://localhost:3000",
      LOADTEST_DATABASE_URL: "postgresql://user:pass@localhost:5432/survey_portal"
    }
  });
  const plan = parseSuitePlan(config);

  assert.equal(plan.preset, "capacity");
  assert.equal(plan.maxVus, 40);
});

test("parseSuitePlan accepts env opt-in for capacity preset", () => {
  const config = resolveLoadtestConfig({
    argv: ["--dev", "--run-key", "unit-run"],
    env: {
      LOADTEST_BASE_URL: "http://localhost:3000",
      LOADTEST_DATABASE_URL: "postgresql://user:pass@localhost:5432/survey_portal",
      LOADTEST_SUITE_PRESET: "capacity",
      LOADTEST_SUITE_ALLOW_CAPACITY: "true",
      LOADTEST_SUITE_MAX_VUS: "40"
    }
  });
  const plan = parseSuitePlan(config);

  assert.equal(plan.preset, "capacity");
  assert.equal(plan.maxVus, 40);
});

test("parseSuitePlan lets CLI false override env direct-db opt-in", () => {
  const config = resolveLoadtestConfig({
    argv: ["--dev", "--run-key", "unit-run", "--include-direct-db", "false"],
    env: {
      LOADTEST_BASE_URL: "http://localhost:3000",
      LOADTEST_DATABASE_URL: "postgresql://user:pass@localhost:5432/survey_portal",
      LOADTEST_SUITE_INCLUDE_DIRECT_DB: "true"
    }
  });
  const plan = parseSuitePlan(config);

  assert.equal(plan.includeDirectDb, false);
  assert.equal(plan.childRuns.some((child) => child.profile === "direct-db"), false);
});

test("parseSuitePlan generates unique child run keys for repeated custom stage targets", () => {
  const config = resolveLoadtestConfig({
    argv: [
      "--dev",
      "--run-key",
      "unit-run",
      "--suite-key",
      "unit-suite",
      "--profiles",
      "mixed",
      "--suite-stages",
      '[{"duration":"10s","targetVus":5},{"duration":"10s","targetVus":5}]'
    ],
    env: {
      LOADTEST_BASE_URL: "http://localhost:3000",
      LOADTEST_DATABASE_URL: "postgresql://user:pass@localhost:5432/survey_portal"
    }
  });
  const plan = parseSuitePlan(config);
  const keys = plan.childRuns.map((child) => child.runKey);

  assert.equal(new Set(keys).size, keys.length);
});

test("shouldEarlyStop detects threshold crossings and failed child runs", () => {
  assert.equal(
    shouldEarlyStop(
      { status: "completed", httpSummary: { errorRate: 0.01, p95Ms: 100 } },
      { errorRate: 0.05, p95Ms: 1000 }
    ),
    false
  );
  assert.equal(
    shouldEarlyStop(
      { status: "completed", httpSummary: { errorRate: 0.06, p95Ms: 100 } },
      { errorRate: 0.05, p95Ms: 1000 }
    ),
    true
  );
  assert.equal(
    shouldEarlyStop(
      { status: "failed", httpSummary: { errorRate: 0, p95Ms: 10 } },
      { errorRate: 0.05, p95Ms: 1000 }
    ),
    true
  );
});

test("classifySuiteResults identifies first degradation and app-pool bottleneck", () => {
  const plan = {
    earlyStop: { errorRate: 0.05, p95Ms: 1000 }
  };
  const aggregate = classifySuiteResults({
    plan,
    childResults: [
      {
        profile: "mixed",
        stageLabel: "10vu",
        targetVus: 10,
        status: "completed",
        httpSummary: { errorRate: 0, p95Ms: 200 },
        sqlSummary: { available: true },
        classification: { bottleneck: "unknown" }
      },
      {
        profile: "mixed",
        stageLabel: "25vu",
        targetVus: 25,
        status: "completed",
        httpSummary: { errorRate: 0.08, p95Ms: 2000 },
        sqlSummary: { available: true },
        classification: { bottleneck: "app_pool" }
      },
      {
        profile: "direct-db",
        stageLabel: "direct-db",
        targetVus: null,
        status: "completed",
        httpSummary: { errorRate: 0, p95Ms: 50 },
        sqlSummary: { available: true },
        classification: { bottleneck: "unknown" }
      }
    ]
  });

  assert.equal(aggregate.firstFailure.profile, "mixed");
  assert.equal(aggregate.firstFailure.targetVus, 25);
  assert.equal(aggregate.bottleneck, "app_pool");
  assert.equal(aggregate.confidence, "high");
});

test("buildSuiteMarkdownReport includes first degradation, caveats, and child run keys", () => {
  const markdown = buildSuiteMarkdownReport({
    suiteKey: "unit-suite",
    targetBaseUrl: "http://localhost:3000",
    status: "failed",
    plan: {
      preset: "small",
      profiles: ["mixed"],
      earlyStop: { errorRate: 0.05, p95Ms: 1000 }
    },
    childResults: [
      {
        runKey: "unit-suite-mixed-10vu",
        status: "failed",
        profile: "mixed",
        stageLabel: "10vu",
        httpSummary: { p95Ms: 1500, errorRate: 0.1 }
      }
    ],
    aggregate: {
      firstFailure: { profile: "mixed", stageLabel: "10vu", targetVus: 10 },
      bottleneck: "unknown",
      confidence: "low",
      recommendation: "Review evidence.",
      caveats: ["SQL visibility was unavailable."]
    }
  });

  assert.match(markdown, /mixed at 10vu/);
  assert.match(markdown, /unit-suite-mixed-10vu/);
  assert.match(markdown, /SQL visibility was unavailable/);
});

test("suite redaction omits secret-like values before persistence", () => {
  const sanitized = sanitizeOperationalValue({
    apiKey: "secret",
    api_key: "secret",
    accessToken: "secret",
    cookie: "session=secret",
    nested: {
      databaseUrl: "postgresql://user:pass@example.invalid:5432/db",
      text: "Bearer abc.def"
    }
  });

  assert.equal(sanitized.apiKey, "[redacted]");
  assert.equal(sanitized.api_key, "[redacted]");
  assert.equal(sanitized.accessToken, "[redacted]");
  assert.equal(sanitized.cookie, "[redacted]");
  assert.equal(sanitized.nested.databaseUrl, "[redacted]");
  assert.equal(sanitized.nested.text, "Bearer [redacted]");
  assert.equal(containsOperationalSecret(JSON.stringify(sanitized)), false);
});

test("suite persistence writes suite SQL and links child run rows", async () => {
  const pool = createMockPool([
    { id: 10, started_at: new Date("2026-06-29T12:00:00Z") },
    { id: 11, started_at: new Date("2026-06-29T12:01:00Z") }
  ]);
  const suite = await createPerformanceSuite(pool, {
    suiteKey: "unit-suite",
    targetBaseUrl: "http://localhost:3000",
    plannedProfiles: ["mixed"],
    plannedStages: [{ label: "10vu", targetVus: 10, duration: "1m" }],
    config: { suitePreset: "small" }
  });
  const run = await createPerformanceRun(pool, {
    runKey: "unit-suite-mixed-10vu",
    scenario: "mixed",
    targetBaseUrl: "http://localhost:3000",
    suiteId: suite.id,
    config: { profile: "mixed" }
  });

  assert.equal(suite.id, 10);
  assert.equal(run.id, 11);
  assert.match(pool.queries[0].sql, /insert into performance_test_suites/);
  assert.match(pool.queries[1].sql, /suite_id/);
  assert.equal(pool.queries[1].params[3], 10);
});

test("createPerformanceRun omits suite_id for one-off run compatibility", async () => {
  const pool = createMockPool([{ id: 12, started_at: new Date("2026-06-29T12:02:00Z") }]);

  await createPerformanceRun(pool, {
    runKey: "unit-one-off",
    scenario: "smoke",
    targetBaseUrl: "http://localhost:3000",
    config: { profile: "smoke" }
  });

  assert.doesNotMatch(pool.queries[0].sql, /suite_id/);
  assert.equal(pool.queries[0].params.length, 4);
});

test("finishPerformanceSuite can persist aborted terminal state", async () => {
  const pool = createMockPool([]);

  await finishPerformanceSuite(pool, {
    id: 10,
    status: "aborted",
    bottleneck: "unknown",
    bottleneckConfidence: "low",
    recommendation: "Interrupted.",
    summary: { interrupted: true },
    reportMarkdown: "# Aborted\n"
  });

  assert.match(pool.queries[0].sql, /update performance_test_suites/);
  assert.equal(pool.queries[0].params[1], "aborted");
});

test("insertPerformanceSamples writes bounded sanitized sample metrics", async () => {
  const pool = createMockPool([]);

  await insertPerformanceSamples(pool, [
    {
      suiteId: 1,
      runId: 2,
      source: "k6",
      profile: "mixed",
      scenario: "mixed",
      stageLabel: "10vu",
      targetVus: 10,
      currentVus: 10,
      elapsedSeconds: 60,
      metrics: { p95Ms: 100, apiKey: "secret" },
      caveat: "Bearer abc.def"
    }
  ]);

  assert.match(pool.queries[0].sql, /insert into performance_test_samples/);
  assert.equal(JSON.parse(pool.queries[0].params[10]).apiKey, "[redacted]");
  assert.equal(pool.queries[0].params[12], "Bearer [redacted]");
});

function createMockPool(rows) {
  return {
    queries: [],
    async query(sql, params = []) {
      this.queries.push({ sql, params });
      return { rows: rows.length > 0 ? [rows.shift()] : [], rowCount: rows.length > 0 ? 1 : 0 };
    }
  };
}
