export function normalizeK6Summary(rawSummary) {
  const metrics = rawSummary?.metrics ?? {};
  const duration = metrics.http_req_duration?.values ?? {};
  const requests = metrics.http_reqs ?? {};
  const failed = metrics.http_req_failed ?? {};
  const vusMax = metrics.vus_max ?? metrics.vus;
  const checks = metrics.checks ?? {};
  const http5xx = metrics.http_5xx ?? metrics.http_req_failed_5xx;

  return {
    p50Ms: readMetricValue(duration, ["p(50)", "p50", "med"]),
    p95Ms: readMetricValue(duration, ["p(95)", "p95"]),
    p99Ms: readMetricValue(duration, ["p(99)", "p99"]),
    errorRate: readMetricValue(failed, ["rate", "value"]),
    totalRequests: Math.round(readMetricValue(requests, ["count", "value"]) ?? 0),
    failedRequests: Math.round(
      readMetricValue(metrics.http_req_failed_count, ["count", "value"]) ??
        ((readMetricValue(requests, ["count", "value"]) ?? 0) *
          (readMetricValue(failed, ["rate", "value"]) ?? 0))
    ),
    peakRequestsPerSecond: readMetricValue(requests, ["rate"]),
    maxVus: Math.round(readMetricValue(vusMax, ["value", "max"]) ?? 0),
    checksPassRate: readMetricValue(checks, ["rate"]),
    http5xxCount: Math.round(readMetricValue(http5xx, ["count", "value"]) ?? 0)
  };
}

export function classifyBottleneck({ httpSummary, sqlSummary, appDbPoolMax = 10, appInstanceCount = 1 }) {
  const errorRate = httpSummary.errorRate ?? 0;
  const p95Ms = httpSummary.p95Ms ?? 0;
  const latencyOrErrorsHigh = errorRate >= 0.02 || p95Ms >= 1000;

  if (!latencyOrErrorsHigh) {
    return {
      bottleneck: "unknown",
      recommendation: "No clear bottleneck signal. Compare with a higher-load run before changing resources."
    };
  }

  if (sqlSummary?.available) {
    const maxActive = sqlSummary.maxActiveConnections ?? 0;
    const maxTotal = sqlSummary.maxTotalConnections ?? 0;
    const rollbacks = sqlSummary.transactionRollbackDelta ?? 0;
    const expectedPoolCeiling = appDbPoolMax * appInstanceCount;
    const connectionPressure =
      maxTotal >= Math.max(1, Math.floor(expectedPoolCeiling * 0.9)) ||
      maxActive >= Math.max(1, Math.floor(expectedPoolCeiling * 0.9));

    if (connectionPressure && rollbacks === 0) {
      return {
        bottleneck: "app_pool",
        recommendation:
          `HTTP latency/errors rose while visible DB connections approached the configured app pool ceiling (${expectedPoolCeiling}). Confirm pg_stat_activity visibility, app instance count, and pool settings before scaling the database.`
      };
    }

    if (rollbacks > 0 || maxActive >= 20) {
      return {
        bottleneck: "database",
        recommendation:
          "PostgreSQL signals show DB pressure. Review query plans, indexes, and database capacity before increasing HTTP concurrency."
      };
    }
  }

  return {
    bottleneck: "unknown",
    recommendation:
      "Latency or errors increased, but resource signals were unavailable or inconclusive. Capture SQL and Azure metrics for the next run."
  };
}

export function buildMarkdownReport(input) {
  const lines = [
    `# Performance test report: ${input.runKey}`,
    "",
    `Scenario: ${input.scenario}`,
    `Target: ${input.targetBaseUrl}`,
    `Status: ${input.status}`,
    "",
    "## HTTP summary",
    "",
    `- Total requests: ${input.httpSummary.totalRequests ?? "unavailable"}`,
    `- Failed requests: ${input.httpSummary.failedRequests ?? "unavailable"}`,
    `- Error rate: ${formatPercent(input.httpSummary.errorRate)}`,
    `- p50: ${formatMs(input.httpSummary.p50Ms)}`,
    `- p95: ${formatMs(input.httpSummary.p95Ms)}`,
    `- p99: ${formatMs(input.httpSummary.p99Ms)}`,
    `- Peak requests/sec: ${formatNumber(input.httpSummary.peakRequestsPerSecond)}`,
    `- Max VUs: ${input.httpSummary.maxVus || "unavailable"}`,
    "",
    "## SQL metrics",
    "",
    input.sqlSummary?.available
      ? `- Max active connections: ${input.sqlSummary.maxActiveConnections}`
      : `- SQL metrics unavailable: ${input.sqlSummary?.unavailableReason ?? "not sampled"}`,
    "",
    "## Recommendation",
    "",
    input.recommendation
  ];

  return lines.join("\n");
}

function readMetricValue(source, keys) {
  if (!source) {
    return null;
  }

  for (const key of keys) {
    const value = source[key] ?? source.values?.[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value !== "" && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }

  return null;
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
