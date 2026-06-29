import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import {
  confirmWriteIfNeeded,
  loadtestDir,
  parseCliArgs,
  printTargetSummary,
  reportsDir,
  resolveLoadtestConfig
} from "./lib/env.mjs";
import { assertPerformanceTestRunsTable, assertPerformanceTestSuitesTables, createLoadtestPool } from "./lib/pg.mjs";
import { samplePostgresMetrics, summarizePostgresSamples } from "./lib/metrics.mjs";
import { normalizeK6Summary, classifyBottleneck } from "./lib/reporting.mjs";
import {
  createPerformanceRun,
  createPerformanceSuite,
  finishPerformanceRun,
  finishPerformanceSuite,
  insertPerformanceSamples
} from "./lib/persistence.mjs";
import {
  buildSuiteMarkdownReport,
  classifySuiteResults,
  parseSuitePlan,
  shouldEarlyStop
} from "./lib/suite-planning.mjs";
import { pickSafeConfig, sanitizeOperationalValue } from "./lib/redaction.mjs";

async function main() {
  const preliminaryArgs = parseCliArgs(process.argv.slice(2));

  if (preliminaryArgs.help) {
    printHelp();
    return;
  }

  const config = resolveLoadtestConfig();
  const manifest = readManifest(config.runKey);
  const plan = parseSuitePlan(config);
  let pool;
  let suite;
  let activeChild = null;
  let removeAbortHandlers = () => undefined;

  printTargetSummary(config, `run capacity suite ${plan.suiteKey}`);
  printSuitePlan(plan);
  await confirmWriteIfNeeded(config, "Persist capacity suite results");
  mkdirSync(reportsDir, { recursive: true });

  try {
    pool = createLoadtestPool(config, { max: Math.max(config.dbConcurrency + 2, 4) });
    await assertPerformanceTestRunsTable(pool);
    await assertPerformanceTestSuitesTables(pool);
    suite = await createPerformanceSuite(pool, {
      suiteKey: plan.suiteKey,
      targetBaseUrl: config.baseUrl,
      plannedProfiles: plan.profiles,
      plannedStages: plan.stages,
      config: buildSuiteConfig(config, plan, manifest)
    });
    removeAbortHandlers = installAbortHandlers({
      pool,
      config,
      plan,
      suiteId: suite.id,
      getActiveChild: () => activeChild
    });

    const childResults = [];
    let elapsedSeconds = 0;
    let stoppedEarly = false;

    for (const child of plan.childRuns) {
      activeChild = { ...child, runId: null, process: null };

      const result = await runChild({
        pool,
        config,
        manifest,
        plan,
        suiteId: suite.id,
        child,
        elapsedSeconds,
        setActiveChild: (next) => {
          activeChild = { ...activeChild, ...next };
        }
      });

      childResults.push(result);
      elapsedSeconds += result.elapsedSeconds ?? parseDurationSeconds(child.duration ?? "0s");

      if (child.profile !== "direct-db" && shouldEarlyStop(result, plan.earlyStop)) {
        stoppedEarly = true;
        console.log(
          `Early stop: ${child.runKey} crossed thresholds or failed. Remaining child runs were skipped.`
        );
        break;
      }
    }

    activeChild = null;
    const aggregate = classifySuiteResults({ plan, childResults });
    const status = stoppedEarly || childResults.some((result) => result.status === "failed")
      ? "failed"
      : "completed";
    await finishSuiteAndArtifacts({
      pool,
      config,
      suiteId: suite.id,
      plan,
      status,
      childResults,
      aggregate,
      interrupted: false
    });

    printCloseout(config, plan, childResults, status);
  } catch (error) {
    if (suite && pool) {
      await persistSuiteFailure({ pool, config, plan, suiteId: suite.id, error });
    }

    throw error;
  } finally {
    removeAbortHandlers();
    if (pool) {
      await pool.end();
    }
  }
}

async function runChild({ pool, config, manifest, plan, suiteId, child, elapsedSeconds, setActiveChild }) {
  const run = await createPerformanceRun(pool, {
    runKey: child.runKey,
    scenario: child.scenario,
    targetBaseUrl: config.baseUrl,
    suiteId,
    config: buildChildConfig(config, plan, child, manifest)
  });
  setActiveChild({ runId: run.id });

  const result = child.profile === "direct-db"
    ? await executeDirectDbChild({ pool, config, manifest, child })
    : await executeHttpChild({ pool, config, manifest, child, setActiveChild });
  const httpSummary = result.httpSummary;
  const classification = classifyBottleneck({
    httpSummary,
    sqlSummary: result.sqlSummary,
    appDbPoolMax: config.appDbPoolMax,
    appInstanceCount: config.appInstanceCount
  });
  const summary = sanitizeOperationalValue({
    profile: child.profile,
    stageLabel: child.stageLabel,
    targetVus: child.targetVus,
    http: httpSummary,
    sql: result.sqlSummary,
    artifacts: result.artifactPaths,
    caveats: result.caveats,
    directDb: result.directDb ?? null,
    azure: { available: false, reason: "Azure Monitor sampling is optional and was not run." }
  });
  const reportMarkdown = buildChildMarkdown({
    runKey: child.runKey,
    child,
    status: result.status,
    httpSummary,
    sqlSummary: result.sqlSummary,
    recommendation: classification.recommendation,
    caveats: result.caveats
  });

  writeFileSync(
    path.join(reportsDir, `${child.runKey}.summary.json`),
    `${JSON.stringify(summary, null, 2)}\n`
  );
  writeFileSync(path.join(reportsDir, `${child.runKey}.report.md`), reportMarkdown);
  await finishPerformanceRun(pool, {
    id: run.id,
    status: result.status,
    httpSummary,
    bottleneck: classification.bottleneck,
    recommendation: classification.recommendation,
    summary,
    reportMarkdown
  });
  await insertPerformanceSamples(pool, buildSampleRows({
    suiteId,
    runId: run.id,
    child,
    result,
    elapsedSeconds
  }));

  return {
    ...child,
    runId: run.id,
    status: result.status,
    httpSummary,
    sqlSummary: result.sqlSummary,
    classification,
    caveats: result.caveats,
    artifactPaths: result.artifactPaths,
    elapsedSeconds: parseDurationSeconds(child.duration ?? `${config.dbDurationSeconds}s`)
  };
}

async function executeHttpChild({ pool, config, manifest, child, setActiveChild }) {
  const samples = [await collectPostgresSample(pool)];

  if (config.persistenceSmoke) {
    samples.push(await collectPostgresSample(pool));
    return {
      status: "completed",
      rawSummary: buildPersistenceSmokeSummary(child),
      httpSummary: normalizeK6Summary(buildPersistenceSmokeSummary(child)),
      sqlSummary: summarizePostgresSamples(samples),
      artifactPaths: [],
      caveats: ["Persistence smoke mode did not invoke k6."]
    };
  }

  if (!k6IsAvailable()) {
    const rawSummary = buildFailureSummary("k6 binary was not found on PATH.");
    return {
      status: "failed",
      rawSummary,
      httpSummary: normalizeK6Summary(rawSummary),
      sqlSummary: summarizePostgresSamples(samples),
      artifactPaths: [],
      caveats: ["k6 was unavailable, so HTTP load was not executed."]
    };
  }

  const summaryPath = path.join(reportsDir, `${child.runKey}.k6-summary.json`);
  const k6Process = spawn("k6", ["run", path.join(loadtestDir, "k6", "scenarios.js")], {
    stdio: "inherit",
    env: {
      ...process.env,
      LOADTEST_K6_SUMMARY_PATH: summaryPath,
      LOADTEST_PROFILE: child.profile,
      LOADTEST_BASE_URL: config.baseUrl,
      LOADTEST_ADMIN_EMAIL: config.adminEmail || manifest?.admin?.email || "",
      LOADTEST_ADMIN_PASSWORD: config.adminPassword || manifest?.admin?.password || "",
      LOADTEST_SURVEY_ID: String(manifest?.surveyId ?? ""),
      LOADTEST_ANONYMOUS_TOKEN: manifest?.anonymous?.publicToken ?? "",
      LOADTEST_VUS: String(child.targetVus ?? config.vus),
      LOADTEST_DURATION: child.duration ?? config.duration,
      LOADTEST_RAMPING_STAGES: "[]"
    }
  });
  setActiveChild({ process: k6Process });
  const sampler = setInterval(async () => {
    samples.push(await collectPostgresSample(pool));
  }, config.sampleIntervalMs);
  let exitCode = 1;

  try {
    exitCode = await waitForProcess(k6Process);
  } finally {
    clearInterval(sampler);
  }

  samples.push(await collectPostgresSample(pool));

  const rawSummary = existsSync(summaryPath)
    ? JSON.parse(readFileSync(summaryPath, "utf8"))
    : buildFailureSummary(`k6 exited with code ${exitCode} before writing a summary.`);

  return {
    status: exitCode === 0 ? "completed" : "failed",
    rawSummary,
    httpSummary: normalizeK6Summary(rawSummary),
    sqlSummary: summarizePostgresSamples(samples),
    artifactPaths: existsSync(summaryPath) ? [summaryPath] : [],
    caveats: [
      "Stage evidence is represented by this child run summary; exact in-stage p95 buckets were not streamed."
    ]
  };
}

async function executeDirectDbChild({ pool, config, manifest }) {
  const endAt = Date.now() + config.dbDurationSeconds * 1000;
  const samples = [await collectPostgresSample(pool)];
  const latencies = [];
  let totalQueries = 0;
  let errors = 0;

  await Promise.all(
    Array.from({ length: config.dbConcurrency }, async () => {
      while (Date.now() < endAt) {
        const started = performance.now();

        try {
          await runReportLikeQuery(pool, manifest.surveyId);
          latencies.push(performance.now() - started);
          totalQueries += 1;
        } catch {
          errors += 1;
        }
      }
    })
  );
  samples.push(await collectPostgresSample(pool));

  const directDb = {
    totalQueries,
    errors,
    queriesPerSecond: totalQueries / Math.max(config.dbDurationSeconds, 1),
    latency: percentileSummary(latencies)
  };
  const httpSummary = {
    p50Ms: directDb.latency.p50Ms,
    p95Ms: directDb.latency.p95Ms,
    p99Ms: directDb.latency.p99Ms,
    errorRate: errors / Math.max(totalQueries, 1),
    totalRequests: totalQueries,
    failedRequests: errors,
    peakRequestsPerSecond: directDb.queriesPerSecond,
    maxVus: config.dbConcurrency,
    checksPassRate: errors === 0 ? 1 : 0,
    http5xxCount: 0
  };

  return {
    status: errors === 0 ? "completed" : "failed",
    rawSummary: { directDb },
    httpSummary,
    sqlSummary: summarizePostgresSamples(samples),
    directDb,
    artifactPaths: [],
    caveats: ["Direct-DB child run bypasses the HTTP app tier and is persisted as suite evidence."]
  };
}

async function finishSuiteAndArtifacts({ pool, config, suiteId, plan, status, childResults, aggregate, interrupted }) {
  const summary = sanitizeOperationalValue({
    suiteKey: plan.suiteKey,
    preset: plan.preset,
    profiles: plan.profiles,
    stages: plan.stages,
    childRunKeys: childResults.map((result) => result.runKey),
    earlyStop: plan.earlyStop,
    firstFailure: aggregate.firstFailure,
    bottleneck: aggregate.bottleneck,
    confidence: aggregate.confidence,
    caveats: aggregate.caveats,
    interrupted
  });
  const reportMarkdown = buildSuiteMarkdownReport({
    suiteKey: plan.suiteKey,
    targetBaseUrl: config.baseUrl,
    status,
    plan,
    childResults,
    aggregate
  });

  writeFileSync(
    path.join(reportsDir, `${plan.suiteKey}.summary.json`),
    `${JSON.stringify(summary, null, 2)}\n`
  );
  writeFileSync(path.join(reportsDir, `${plan.suiteKey}.report.md`), reportMarkdown);
  await finishPerformanceSuite(pool, {
    id: suiteId,
    status,
    firstFailingProfile: aggregate.firstFailure?.profile ?? null,
    firstFailingStage: aggregate.firstFailure?.stageLabel ?? null,
    firstFailingTargetVus: aggregate.firstFailure?.targetVus ?? null,
    firstFailingCurrentVus: aggregate.firstFailure?.currentVus ?? null,
    bottleneck: aggregate.bottleneck,
    bottleneckConfidence: aggregate.confidence,
    recommendation: aggregate.recommendation,
    summary,
    reportMarkdown
  });
}

async function persistSuiteFailure({ pool, config, plan, suiteId, error }) {
  const message = error instanceof Error ? error.message : String(error);
  const aggregate = {
    firstFailure: null,
    bottleneck: "unknown",
    confidence: "low",
    caveats: [`Suite failed before aggregate evidence was complete: ${message}`],
    recommendation: "Suite failed before complete local evidence was available. Review child run rows and local artifacts."
  };

  await finishSuiteAndArtifacts({
    pool,
    config,
    suiteId,
    plan,
    status: "failed",
    childResults: [],
    aggregate,
    interrupted: false
  });
}

function installAbortHandlers({ pool, config, plan, suiteId, getActiveChild }) {
  let handled = false;
  const handlers = new Map();

  for (const signal of ["SIGINT", "SIGTERM"]) {
    const handler = async () => {
      if (handled) {
        return;
      }

      handled = true;
      const activeChild = getActiveChild();
      console.error(`Received ${signal}; marking suite ${plan.suiteKey} as aborted.`);

      if (activeChild?.process) {
        activeChild.process.kill(signal);
      }

      try {
        if (activeChild?.runId) {
          const rawSummary = buildFailureSummary(`Child run aborted by ${signal}.`);
          const httpSummary = normalizeK6Summary(rawSummary);

          await finishPerformanceRun(pool, {
            id: activeChild.runId,
            status: "aborted",
            httpSummary,
            bottleneck: "unknown",
            recommendation: "Child run was interrupted before complete evidence was available.",
            summary: {
              aborted: true,
              signal,
              caveat: "Interrupted child run; metrics are incomplete."
            },
            reportMarkdown: `# Performance test report: ${activeChild.runKey}\n\nStatus: aborted\n\nInterrupted by ${signal}.\n`
          });
        }

        await finishSuiteAndArtifacts({
          pool,
          config,
          suiteId,
          plan,
          status: "aborted",
          childResults: [],
          aggregate: {
            firstFailure: null,
            bottleneck: "unknown",
            confidence: "low",
            caveats: [`Suite interrupted by ${signal}; child metrics may be incomplete.`],
            recommendation: "Suite was interrupted. Inspect persisted child rows and rerun during a clean approved window."
          },
          interrupted: true
        });
      } catch (error) {
        console.error(
          `Failed to mark suite as aborted: ${error instanceof Error ? error.message : String(error)}`
        );
      } finally {
        console.error(`Teardown command: npm run loadtest:teardown -- --run-key ${config.runKey} --yes`);
        process.exit(signal === "SIGINT" ? 130 : 143);
      }
    };
    handlers.set(signal, handler);
    process.once(signal, handler);
  }

  return () => {
    for (const [signal, handler] of handlers) {
      process.off(signal, handler);
    }
  };
}

function buildSampleRows({ suiteId, runId, child, result, elapsedSeconds }) {
  const sampledAt = new Date().toISOString();
  const sqlAvailable = result.sqlSummary?.available;
  const rows = [
    {
      suiteId,
      runId,
      source: "k6",
      profile: child.profile,
      scenario: child.scenario,
      stageLabel: child.stageLabel,
      targetVus: child.targetVus,
      currentVus: child.targetVus,
      sampledAt,
      elapsedSeconds,
      metrics: result.httpSummary,
      caveat: child.profile === "direct-db" ? "Direct-DB metrics are mapped into HTTP-shaped fields for comparison." : result.caveats[0]
    }
  ];

  rows.push({
    suiteId,
    runId,
    source: "sql",
    profile: child.profile,
    scenario: child.scenario,
    stageLabel: child.stageLabel,
    targetVus: child.targetVus,
    currentVus: child.targetVus,
    sampledAt,
    elapsedSeconds,
    metrics: sqlAvailable ? result.sqlSummary : {},
    unavailableReason: sqlAvailable ? null : result.sqlSummary?.unavailableReason ?? "SQL sample unavailable",
    caveat: sqlAvailable ? null : "Missing SQL visibility is not treated as zero."
  });

  return rows;
}

async function collectPostgresSample(pool) {
  try {
    return await samplePostgresMetrics(pool);
  } catch (error) {
    return {
      available: false,
      sampledAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function buildSuiteConfig(config, plan, manifest) {
  return {
    ...pickSafeConfig(config),
    suitePreset: plan.preset,
    suiteMaxVus: plan.maxVus,
    includeDirectDb: plan.includeDirectDb,
    earlyStop: plan.earlyStop,
    manifestRunKey: manifest.runKey,
    surveyId: manifest.surveyId
  };
}

function buildChildConfig(config, plan, child, manifest) {
  return {
    ...pickSafeConfig(config),
    suiteKey: plan.suiteKey,
    suitePreset: plan.preset,
    profile: child.profile,
    stageLabel: child.stageLabel,
    targetVus: child.targetVus,
    duration: child.duration,
    manifestRunKey: manifest.runKey,
    surveyId: manifest.surveyId,
    dbConcurrency: child.profile === "direct-db" ? config.dbConcurrency : undefined,
    dbDurationSeconds: child.profile === "direct-db" ? config.dbDurationSeconds : undefined
  };
}

function buildChildMarkdown({ runKey, child, status, httpSummary, sqlSummary, recommendation, caveats }) {
  return [
    `# Performance test report: ${runKey}`,
    "",
    `Scenario: ${child.scenario}`,
    `Stage: ${child.stageLabel}`,
    `Target VUs: ${child.targetVus ?? "not applicable"}`,
    `Status: ${status}`,
    "",
    "## Summary",
    "",
    `- Total requests: ${httpSummary.totalRequests ?? "unavailable"}`,
    `- Failed requests: ${httpSummary.failedRequests ?? "unavailable"}`,
    `- Error rate: ${formatPercent(httpSummary.errorRate)}`,
    `- p95: ${formatMs(httpSummary.p95Ms)}`,
    `- Peak requests/sec: ${formatNumber(httpSummary.peakRequestsPerSecond)}`,
    sqlSummary?.available
      ? `- Max active DB connections: ${sqlSummary.maxActiveConnections}`
      : `- SQL metrics unavailable: ${sqlSummary?.unavailableReason ?? "not sampled"}`,
    "",
    "## Recommendation",
    "",
    recommendation,
    "",
    "## Caveats",
    "",
    ...caveats.map((caveat) => `- ${caveat}`)
  ].join("\n");
}

function buildPersistenceSmokeSummary(child) {
  const requestCount = Math.max(child.targetVus ?? 1, 1) * 10;

  return {
    metrics: {
      http_req_duration: { values: { "p(50)": 25, "p(95)": 75, "p(99)": 125 } },
      http_req_failed: { rate: 0 },
      http_reqs: { count: requestCount, rate: requestCount / 10 },
      vus_max: { value: child.targetVus ?? 1 },
      checks: { rate: 1 }
    }
  };
}

function buildFailureSummary(message) {
  return {
    error: message,
    metrics: {
      http_req_duration: { values: {} },
      http_req_failed: { rate: 1 },
      http_reqs: { count: 0, rate: 0 },
      vus_max: { value: 0 }
    }
  };
}

async function runReportLikeQuery(pool, surveyId) {
  await pool.query(
    `select
       survey_attempts.status,
       count(survey_response_answers.id)::int as answer_count
     from survey_attempts
     left join survey_response_answers
       on survey_response_answers.survey_attempt_id = survey_attempts.id
     where survey_attempts.survey_id = $1
     group by survey_attempts.status`,
    [surveyId]
  );
}

function percentileSummary(values) {
  if (values.length === 0) {
    return { p50Ms: null, p95Ms: null, p99Ms: null };
  }

  const sorted = [...values].sort((left, right) => left - right);

  return {
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99)
  };
}

function percentile(sorted, fraction) {
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  return sorted[index];
}

function k6IsAvailable() {
  const result = spawnSync("k6", ["version"], { stdio: "ignore" });
  return result.status === 0;
}

function waitForProcess(child) {
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

function readManifest(runKey) {
  const manifestPath = path.join(loadtestDir, `.manifest.${runKey}.json`);

  if (!existsSync(manifestPath)) {
    throw new Error(`Manifest not found: ${manifestPath}. Run npm run loadtest:seed first.`);
  }

  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

function printSuitePlan(plan) {
  console.log(`Suite key: ${plan.suiteKey}`);
  console.log(`Preset: ${plan.preset}`);
  console.log(`Profiles: ${plan.profiles.join(", ")}`);
  console.log(`Stages: ${plan.stages.map((stage) => `${stage.label}/${stage.duration}`).join(", ")}`);
  console.log(`Child run keys: ${plan.childRuns.map((child) => child.runKey).join(", ")}`);
}

function printCloseout(config, plan, childResults, status) {
  console.log(`Capacity suite ${plan.suiteKey} persisted with status ${status}.`);
  console.log(`Child run keys: ${childResults.map((result) => result.runKey).join(", ")}`);
  console.log(`Suite report: ${path.join(reportsDir, `${plan.suiteKey}.report.md`)}`);
  console.log(`Teardown command: npm run loadtest:teardown -- --run-key ${config.runKey} --yes`);
}

function parseDurationSeconds(value) {
  const match = /^(\d+)(ms|s|m|h)$/.exec(String(value));

  if (!match) {
    return 0;
  }

  const amount = Number(match[1]);
  const unit = match[2];

  if (unit === "ms") {
    return Math.ceil(amount / 1000);
  }

  if (unit === "m") {
    return amount * 60;
  }

  if (unit === "h") {
    return amount * 3600;
  }

  return amount;
}

function formatMs(value) {
  return value === null || value === undefined ? "unavailable" : `${Math.round(value)} ms`;
}

function formatNumber(value) {
  return value === null || value === undefined ? "unavailable" : Number(value).toFixed(2);
}

function formatPercent(value) {
  return value === null || value === undefined ? "unavailable" : `${(value * 100).toFixed(2)}%`;
}

function printHelp() {
  console.log(`Usage: npm run loadtest:suite -- [options]

Runs a capacity assessment suite from the operator machine and persists one
suite row, linked child run rows, bounded k6/SQL samples, and local reports.

Options:
  --run-key <key>                  Seed manifest key to use.
  --suite-key <key>                Suite key. Defaults to <run-key>-suite.
  --suite <small|standard|capacity>
  --profiles <csv>                 HTTP profiles, e.g. mixed,read-heavy.
  --max-vus <number>               Capacity upper bound.
  --suite-stages <json>            [{ "label":"10vu","duration":"1m","targetVus":10 }]
  --early-stop-error-rate <n>      Default 0.05.
  --early-stop-p95-ms <n>          Default 2000.
  --include-direct-db true         Add direct-db child evidence.
  --allow-capacity                 Required for the capacity preset.
  --persistence-smoke              Persist suite plumbing without invoking k6.
  --dev                            Required for localhost targets.
  --yes                            Required for non-interactive hosted runs.

Hosted suite runs can affect real users. Run only during an approved window.
Anonymous write-heavy profiles need ANONYMOUS_SURVEY_RATE_LIMIT_MAX raised
temporarily, then reset after the test window.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`loadtest:suite failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
