import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";

import {
  confirmWriteIfNeeded,
  loadtestDir,
  printTargetSummary,
  reportsDir,
  resolveLoadtestConfig
} from "./lib/env.mjs";
import { assertPerformanceTestRunsTable, createLoadtestPool } from "./lib/pg.mjs";
import { samplePostgresMetrics, summarizePostgresSamples } from "./lib/metrics.mjs";
import { createPerformanceRun, finishPerformanceRun } from "./lib/persistence.mjs";
import { buildMarkdownReport, classifyBottleneck, normalizeK6Summary } from "./lib/reporting.mjs";

async function main() {
  const config = resolveLoadtestConfig();
  const manifest = readManifestIfPresent(config.runKey);
  const scenario = config.profile;
  printTargetSummary(config, `run ${scenario} performance test`);
  await confirmWriteIfNeeded(config, "Persist performance test results");

  mkdirSync(reportsDir, { recursive: true });
  const pool = createLoadtestPool(config);
  let run;
  let removeAbortHandlers = () => undefined;

  try {
    await assertPerformanceTestRunsTable(pool);
    run = await createPerformanceRun(pool, {
      runKey: config.runKey,
      scenario,
      targetBaseUrl: config.baseUrl,
      config: buildRunConfig(config, manifest)
    });
    removeAbortHandlers = installAbortHandlers({ pool, config, scenario, runId: run.id });

    const result = await executeRun({ config, manifest, pool, scenario });
    await finishAndPersist(pool, {
      config,
      scenario,
      runId: run.id,
      status: result.status,
      result
    });
    console.log(`Performance run ${config.runKey} persisted with status ${result.status}.`);
  } catch (error) {
    if (run) {
      await persistFailure(pool, config, scenario, run.id, error);
    }

    throw error;
  } finally {
    removeAbortHandlers();
    await pool.end();
  }
}

async function executeRun({ config, manifest, pool, scenario }) {
  const samples = [];
  samples.push(await samplePostgresMetrics(pool));

  if (config.persistenceSmoke) {
    samples.push(await samplePostgresMetrics(pool));
    return {
      status: "completed",
      rawSummary: buildPersistenceSmokeSummary(config),
      sqlSummary: summarizePostgresSamples(samples),
      artifactPaths: []
    };
  }

  if (!k6IsAvailable()) {
    return {
      status: "failed",
      rawSummary: buildFailureSummary("k6 binary was not found on PATH."),
      sqlSummary: summarizePostgresSamples(samples),
      artifactPaths: []
    };
  }

  const summaryPath = path.join(reportsDir, `${config.runKey}.k6-summary.json`);
  const k6Process = spawn(
    "k6",
    ["run", path.join(loadtestDir, "k6", "scenarios.js")],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        LOADTEST_K6_SUMMARY_PATH: summaryPath,
        LOADTEST_PROFILE: scenario,
        LOADTEST_BASE_URL: config.baseUrl,
        LOADTEST_ADMIN_EMAIL: config.adminEmail || manifest?.admin?.email || "",
        LOADTEST_ADMIN_PASSWORD: config.adminPassword || manifest?.admin?.password || "",
        LOADTEST_SURVEY_ID: String(manifest?.surveyId ?? ""),
        LOADTEST_ANONYMOUS_TOKEN: manifest?.anonymous?.publicToken ?? "",
        LOADTEST_VUS: String(config.vus),
        LOADTEST_DURATION: config.duration,
        LOADTEST_RAMPING_STAGES: config.rampingStages
      }
    }
  );
  const sampler = setInterval(async () => {
    samples.push(await samplePostgresMetrics(pool));
  }, config.sampleIntervalMs);
  const exitCode = await waitForProcess(k6Process);
  clearInterval(sampler);
  samples.push(await samplePostgresMetrics(pool));
  const rawSummary = existsSync(summaryPath)
    ? JSON.parse(readFileSync(summaryPath, "utf8"))
    : buildFailureSummary(`k6 exited with code ${exitCode} before writing a summary.`);

  return {
    status: exitCode === 0 ? "completed" : "failed",
    rawSummary,
    sqlSummary: summarizePostgresSamples(samples),
    artifactPaths: [summaryPath]
  };
}

async function finishAndPersist(pool, { config, scenario, runId, status, result }) {
  const httpSummary = normalizeK6Summary(result.rawSummary);
  const classification = classifyBottleneck({
    httpSummary,
    sqlSummary: result.sqlSummary,
    appDbPoolMax: config.appDbPoolMax,
    appInstanceCount: config.appInstanceCount
  });
  const summary = {
    http: httpSummary,
    sql: result.sqlSummary,
    k6: result.rawSummary,
    artifacts: result.artifactPaths,
    azure: { available: false, reason: "Azure Monitor sampling is optional and was not run." }
  };
  const reportMarkdown = buildMarkdownReport({
    runKey: config.runKey,
    scenario,
    targetBaseUrl: config.baseUrl,
    status,
    httpSummary,
    sqlSummary: result.sqlSummary,
    recommendation: classification.recommendation
  });
  const reportPath = path.join(reportsDir, `${config.runKey}.report.md`);

  writeFileSync(reportPath, reportMarkdown);
  writeFileSync(path.join(reportsDir, `${config.runKey}.summary.json`), `${JSON.stringify(summary, null, 2)}\n`);

  await finishPerformanceRun(pool, {
    id: runId,
    status,
    httpSummary,
    bottleneck: classification.bottleneck,
    recommendation: classification.recommendation,
    summary,
    reportMarkdown
  });
}

async function persistFailure(pool, config, scenario, runId, error) {
  const message = error instanceof Error ? error.message : String(error);
  const rawSummary = buildFailureSummary(message);

  await finishAndPersist(pool, {
    config,
    scenario,
    runId,
    status: "failed",
    result: {
      rawSummary,
      sqlSummary: { available: false, sampleCount: 0, unavailableReason: "Run failed before sampling completed." },
      artifactPaths: []
    }
  });
}

async function persistAborted(pool, config, scenario, runId, signal) {
  await finishAndPersist(pool, {
    config,
    scenario,
    runId,
    status: "aborted",
    result: {
      rawSummary: buildFailureSummary(`Run aborted by ${signal}.`),
      sqlSummary: {
        available: false,
        sampleCount: 0,
        unavailableReason: "Run was interrupted before final SQL summary."
      },
      artifactPaths: []
    }
  });
}

function installAbortHandlers({ pool, config, scenario, runId }) {
  let handled = false;
  const handlers = new Map();

  for (const signal of ["SIGINT", "SIGTERM"]) {
    const handler = async () => {
      if (handled) {
        return;
      }

      handled = true;
      console.error(`Received ${signal}; marking performance run ${config.runKey} as aborted.`);

      try {
        await persistAborted(pool, config, scenario, runId, signal);
      } catch (error) {
        console.error(
          `Failed to mark performance run as aborted: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      } finally {
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

function readManifestIfPresent(runKey) {
  const manifestPath = path.join(loadtestDir, `.manifest.${runKey}.json`);

  if (!existsSync(manifestPath)) {
    return null;
  }

  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

function buildRunConfig(config, manifest) {
  return {
    profile: config.profile,
    vus: config.vus,
    duration: config.duration,
    rampingStages: config.rampingStages,
    appDbPoolMax: config.appDbPoolMax,
    appInstanceCount: config.appInstanceCount,
    sampleIntervalMs: config.sampleIntervalMs,
    persistenceSmoke: config.persistenceSmoke,
    manifestRunKey: manifest?.runKey ?? null,
    surveyId: manifest?.surveyId ?? null
  };
}

function buildPersistenceSmokeSummary(config) {
  const requestCount = config.vus * 10;

  return {
    metrics: {
      http_req_duration: { values: { "p(50)": 25, "p(95)": 75, "p(99)": 125 } },
      http_req_failed: { rate: 0 },
      http_reqs: { count: requestCount, rate: requestCount / 10 },
      vus_max: { value: config.vus },
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

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`loadtest:run failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
