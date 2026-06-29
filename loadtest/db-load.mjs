import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

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
import { buildMarkdownReport, classifyBottleneck } from "./lib/reporting.mjs";

async function main() {
  const config = resolveLoadtestConfig();
  const manifest = readManifest(config.runKey);
  printTargetSummary(config, "run direct database performance check");
  await confirmWriteIfNeeded(config, "Persist direct database performance results");
  mkdirSync(reportsDir, { recursive: true });

  const pool = createLoadtestPool(config, { max: config.dbConcurrency });

  try {
    await assertPerformanceTestRunsTable(pool);
    const run = await createPerformanceRun(pool, {
      runKey: `${config.runKey}-db`,
      scenario: "direct-db",
      targetBaseUrl: config.baseUrl,
      config: {
        dbConcurrency: config.dbConcurrency,
        dbDurationSeconds: config.dbDurationSeconds,
        surveyId: manifest.surveyId
      }
    });
    const result = await runDbLoad(pool, manifest, config);
    const httpSummary = {
      p50Ms: result.latency.p50Ms,
      p95Ms: result.latency.p95Ms,
      p99Ms: result.latency.p99Ms,
      errorRate: result.errors / Math.max(result.totalQueries, 1),
      totalRequests: result.totalQueries,
      failedRequests: result.errors,
      peakRequestsPerSecond: result.queriesPerSecond,
      maxVus: config.dbConcurrency,
      checksPassRate: result.errors === 0 ? 1 : 0,
      http5xxCount: 0
    };
    const classification = classifyBottleneck({
      httpSummary,
      sqlSummary: result.sqlSummary,
      appDbPoolMax: config.appDbPoolMax,
      appInstanceCount: config.appInstanceCount
    });
    const summary = {
      directDb: result,
      sql: result.sqlSummary,
      azure: { available: false, reason: "Azure Monitor sampling is optional and was not run." }
    };
    const reportMarkdown = buildMarkdownReport({
      runKey: `${config.runKey}-db`,
      scenario: "direct-db",
      targetBaseUrl: config.baseUrl,
      status: result.errors === 0 ? "completed" : "failed",
      httpSummary,
      sqlSummary: result.sqlSummary,
      recommendation: classification.recommendation
    });

    writeFileSync(
      path.join(reportsDir, `${config.runKey}-db.summary.json`),
      `${JSON.stringify(summary, null, 2)}\n`
    );
    writeFileSync(path.join(reportsDir, `${config.runKey}-db.report.md`), reportMarkdown);

    await finishPerformanceRun(pool, {
      id: run.id,
      status: result.errors === 0 ? "completed" : "failed",
      httpSummary,
      bottleneck: classification.bottleneck,
      recommendation: classification.recommendation,
      summary,
      reportMarkdown
    });
    console.log(`Direct DB load result persisted as ${config.runKey}-db.`);
  } finally {
    await pool.end();
  }
}

async function runDbLoad(pool, manifest, config) {
  const endAt = Date.now() + config.dbDurationSeconds * 1000;
  const samples = [await samplePostgresMetrics(pool)];
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
  samples.push(await samplePostgresMetrics(pool));

  return {
    totalQueries,
    errors,
    queriesPerSecond: totalQueries / Math.max(config.dbDurationSeconds, 1),
    latency: percentileSummary(latencies),
    sqlSummary: summarizePostgresSamples(samples)
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

function readManifest(runKey) {
  const manifestPath = path.join(loadtestDir, `.manifest.${runKey}.json`);

  if (!existsSync(manifestPath)) {
    throw new Error(`Manifest not found: ${manifestPath}. Run npm run loadtest:seed first.`);
  }

  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`loadtest:db failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
