const httpProfiles = new Set(["smoke", "read-heavy", "write-heavy", "mixed"]);

const defaultEarlyStop = {
  errorRate: 0.05,
  p95Ms: 2000
};

export function parseSuitePlan(config) {
  const preset = String(config.cli.values.suite ?? config.env.LOADTEST_SUITE_PRESET ?? "small");
  const suiteKey = config.cli.values.suiteKey ?? config.env.LOADTEST_SUITE_KEY ?? `${config.runKey}-suite`;
  const maxVus = readPositiveInteger(
    config.cli.values.maxVus ?? config.env.LOADTEST_SUITE_MAX_VUS,
    preset === "capacity" ? Math.max(config.vus, 50) : undefined,
    "LOADTEST_SUITE_MAX_VUS"
  );
  const includeDirectDb =
    readOptionalBoolean(config.cli.values.includeDirectDb, "include-direct-db") ??
    readBoolean(config.env.LOADTEST_SUITE_INCLUDE_DIRECT_DB, false);
  const allowCapacity =
    readOptionalBoolean(config.cli.values.allowCapacity, "allow-capacity") ??
    readBoolean(config.env.LOADTEST_SUITE_ALLOW_CAPACITY, false);
  const profiles = parseProfiles(config.cli.values.profiles ?? config.env.LOADTEST_SUITE_PROFILES, preset);
  const stageSpec = config.cli.values.suiteStages ?? config.env.LOADTEST_SUITE_STAGES;
  const stages = stageSpec
    ? parseSuiteStages(stageSpec, "LOADTEST_SUITE_STAGES")
    : defaultStagesForPreset(preset, maxVus);
  const earlyStop = {
    errorRate: readPositiveNumber(
      config.cli.values.earlyStopErrorRate ?? config.env.LOADTEST_SUITE_EARLY_STOP_ERROR_RATE,
      defaultEarlyStop.errorRate,
      "LOADTEST_SUITE_EARLY_STOP_ERROR_RATE"
    ),
    p95Ms: readPositiveNumber(
      config.cli.values.earlyStopP95Ms ?? config.env.LOADTEST_SUITE_EARLY_STOP_P95_MS,
      defaultEarlyStop.p95Ms,
      "LOADTEST_SUITE_EARLY_STOP_P95_MS"
    )
  };

  if (preset === "capacity" && !allowCapacity) {
    throw new Error(
      "The capacity suite preset requires explicit opt-in with --allow-capacity or LOADTEST_SUITE_ALLOW_CAPACITY=true."
    );
  }

  for (const profile of profiles) {
    if (!httpProfiles.has(profile)) {
      throw new Error(`Unsupported suite profile: ${profile}`);
    }
  }

  return {
    suiteKey,
    preset,
    profiles,
    includeDirectDb,
    maxVus: Math.max(...stages.map((stage) => stage.targetVus), 1),
    stages,
    earlyStop,
    appDbPoolMax: config.appDbPoolMax,
    appInstanceCount: config.appInstanceCount,
    childRuns: buildChildRuns({ suiteKey, preset, profiles, stages, includeDirectDb })
  };
}

export function buildChildRuns({ suiteKey, profiles, stages, includeDirectDb }) {
  const runs = [];
  const usedRunKeys = new Set();

  for (const profile of profiles) {
    if (profile === "smoke") {
      runs.push({
        runKey: uniqueChildRunKey(usedRunKeys, suiteKey, profile, 1),
        profile,
        scenario: profile,
        stageLabel: "smoke",
        targetVus: 1,
        duration: "30s",
        index: runs.length + 1
      });
      continue;
    }

    for (const stage of stages) {
      if (stage.targetVus < 1) {
        continue;
      }

      runs.push({
        runKey: uniqueChildRunKey(usedRunKeys, suiteKey, profile, stage.targetVus),
        profile,
        scenario: profile,
        stageLabel: stage.label,
        targetVus: stage.targetVus,
        duration: stage.duration,
        index: runs.length + 1
      });
    }
  }

  if (includeDirectDb) {
    runs.push({
      runKey: uniqueChildRunKey(usedRunKeys, suiteKey, "direct-db", 1),
      profile: "direct-db",
      scenario: "direct-db",
      stageLabel: "direct-db",
      targetVus: null,
      duration: null,
      index: runs.length + 1
    });
  }

  return runs;
}

export function buildChildRunKey(suiteKey, profile, targetVus, index = 0) {
  const safeProfile = profile.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  const vusLabel = targetVus ? `${targetVus}vu` : "db";
  const suffix = index ? `-${index}` : "";

  return `${suiteKey}-${safeProfile}-${vusLabel}${suffix}`;
}

function uniqueChildRunKey(usedRunKeys, suiteKey, profile, targetVus) {
  let index = 0;
  let runKey = buildChildRunKey(suiteKey, profile, targetVus);

  while (usedRunKeys.has(runKey)) {
    index += 1;
    runKey = buildChildRunKey(suiteKey, profile, targetVus, index);
  }

  usedRunKeys.add(runKey);
  return runKey;
}

export function shouldEarlyStop(childResult, thresholds) {
  const summary = childResult.httpSummary ?? {};
  const errorRate = summary.errorRate ?? 0;
  const p95Ms = summary.p95Ms ?? 0;

  return (
    childResult.status !== "completed" ||
    errorRate >= thresholds.errorRate ||
    p95Ms >= thresholds.p95Ms
  );
}

export function classifySuiteResults({ plan, childResults }) {
  const failing = childResults.find((result) => shouldEarlyStop(result, plan.earlyStop));
  const completedHttp = childResults.filter(
    (result) => result.profile !== "direct-db" && result.status === "completed"
  );
  const directDb = childResults.find((result) => result.profile === "direct-db");
  const childBottlenecks = childResults.map((result) => result.classification?.bottleneck).filter(Boolean);
  const caveats = [];

  if (childResults.some((result) => result.sqlSummary?.available === false)) {
    caveats.push("SQL visibility was unavailable for at least one child run.");
  }

  caveats.push(
    "k6 exact per-bucket percentiles were not streamed; the suite uses stage-sized child runs and bounded summaries."
  );

  let bottleneck = "unknown";
  let confidence = "low";

  if (childBottlenecks.includes("database")) {
    bottleneck = "database";
    confidence = directDb?.status === "failed" ? "high" : "medium";
  } else if (childBottlenecks.includes("app_pool")) {
    bottleneck = "app_pool";
    confidence = directDb?.status === "completed" ? "high" : "medium";
  } else if (failing && directDb?.status === "completed") {
    bottleneck = "app_service";
    confidence = "medium";
  }

  const firstFailure = failing
    ? {
        profile: failing.profile,
        stageLabel: failing.stageLabel,
        targetVus: failing.targetVus,
        currentVus: failing.targetVus
      }
    : null;

  return {
    firstFailure,
    bottleneck,
    confidence,
    caveats,
    recommendation: buildSuiteRecommendation({
      firstFailure,
      bottleneck,
      confidence,
      completedHttpCount: completedHttp.length,
      directDb
    })
  };
}

export function buildSuiteMarkdownReport({ suiteKey, targetBaseUrl, status, plan, childResults, aggregate }) {
  const lines = [
    `# Capacity suite report: ${suiteKey}`,
    "",
    `Target: ${targetBaseUrl}`,
    `Status: ${status}`,
    `Preset: ${plan.preset}`,
    `Profiles: ${plan.profiles.join(", ")}`,
    `Early stop: error rate >= ${(plan.earlyStop.errorRate * 100).toFixed(2)}%, p95 >= ${Math.round(plan.earlyStop.p95Ms)} ms`,
    "",
    "## First degradation",
    "",
    aggregate.firstFailure
      ? `- ${aggregate.firstFailure.profile} at ${aggregate.firstFailure.stageLabel} (${aggregate.firstFailure.targetVus} target VUs)`
      : "- No degradation crossed the configured early-stop thresholds.",
    "",
    "## Likely bottleneck",
    "",
    `- ${aggregate.bottleneck} (${aggregate.confidence} confidence)`,
    `- ${aggregate.recommendation}`,
    "",
    "## Child runs",
    "",
    ...childResults.map((result) => {
      const p95 = result.httpSummary?.p95Ms == null ? "unavailable" : `${Math.round(result.httpSummary.p95Ms)} ms`;
      const errorRate =
        result.httpSummary?.errorRate == null ? "unavailable" : `${(result.httpSummary.errorRate * 100).toFixed(2)}%`;

      return `- ${result.runKey}: ${result.status}, profile ${result.profile}, stage ${result.stageLabel}, p95 ${p95}, error rate ${errorRate}`;
    }),
    "",
    "## Caveats",
    "",
    ...aggregate.caveats.map((caveat) => `- ${caveat}`),
    "",
    "## Closeout",
    "",
    `Teardown command: npm run loadtest:teardown -- --run-key ${suiteKey.replace(/-suite$/, "")} --yes`
  ];

  return lines.join("\n");
}

function defaultStagesForPreset(preset, maxVus) {
  if (preset === "small") {
    return [
      { label: "5vu", targetVus: 5, duration: "30s" },
      { label: "10vu", targetVus: 10, duration: "45s" }
    ];
  }

  if (preset === "standard") {
    return [
      { label: "10vu", targetVus: 10, duration: "1m" },
      { label: "25vu", targetVus: 25, duration: "2m" },
      { label: "35vu", targetVus: 35, duration: "2m" }
    ];
  }

  if (preset === "capacity") {
    const upper = maxVus ?? 50;
    return [...new Set([10, 25, Math.max(25, Math.floor(upper * 0.75)), upper])]
      .sort((left, right) => left - right)
      .map((targetVus) => ({ label: `${targetVus}vu`, targetVus, duration: "2m" }));
  }

  throw new Error(`Unsupported suite preset: ${preset}`);
}

function parseProfiles(rawValue, preset) {
  if (rawValue) {
    return String(rawValue)
      .split(",")
      .map((profile) => profile.trim())
      .filter(Boolean);
  }

  if (preset === "small") {
    return ["smoke", "mixed", "read-heavy", "write-heavy"];
  }

  return ["mixed", "read-heavy", "write-heavy"];
}

function parseSuiteStages(rawValue, name) {
  let parsed;

  try {
    parsed = JSON.parse(rawValue);
  } catch {
    throw new Error(`${name} must be a JSON array of {label,duration,targetVus} objects.`);
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`${name} must include at least one stage.`);
  }

  return parsed.map((stage, index) => {
    const targetVus = Number(stage.targetVus ?? stage.target);
    const duration = stage.duration;

    if (!Number.isInteger(targetVus) || targetVus < 0 || typeof duration !== "string" || !duration) {
      throw new Error(`${name} stage ${index + 1} must include duration and non-negative targetVus.`);
    }

    return {
      label: String(stage.label ?? `${targetVus}vu`),
      targetVus,
      duration
    };
  });
}

function readPositiveInteger(value, fallback, name) {
  if (value === undefined || value === "") {
    if (fallback === undefined) {
      return undefined;
    }

    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function readPositiveNumber(value, fallback, name) {
  if (value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }

  return parsed;
}

function readBoolean(value, fallback) {
  if (value === undefined || value === "") {
    return fallback;
  }

  if (value === true || value === "true") {
    return true;
  }

  if (value === false || value === "false") {
    return false;
  }

  throw new Error("Suite boolean load-test values must be true or false.");
}

function readOptionalBoolean(value, name) {
  if (value === undefined || value === "") {
    return null;
  }

  if (value === true || value === "true") {
    return true;
  }

  if (value === false || value === "false") {
    return false;
  }

  throw new Error(`${name} must be true or false when a value is provided.`);
}

function buildSuiteRecommendation({ firstFailure, bottleneck, confidence, completedHttpCount, directDb }) {
  const prefix = firstFailure
    ? `First degradation appeared in ${firstFailure.profile} around ${firstFailure.targetVus} VUs.`
    : `No configured degradation threshold was crossed across ${completedHttpCount} HTTP child runs.`;

  if (bottleneck === "database") {
    return `${prefix} Database evidence is the strongest signal (${confidence} confidence); review query plans, indexes, connection limits, and PostgreSQL sizing before increasing application concurrency.`;
  }

  if (bottleneck === "app_pool") {
    return `${prefix} App DB pool pressure is the strongest local signal (${confidence} confidence); confirm pool settings and app instance count before scaling PostgreSQL.`;
  }

  if (bottleneck === "app_service") {
    return `${prefix} Direct DB evidence did not fail${directDb ? "" : " or was not run"}, so app service saturation is plausible; capture Azure Monitor metrics in the next phase for higher confidence.`;
  }

  return `${prefix} Local HTTP/SQL signals are inconclusive; rerun with SQL visibility and optional Azure Monitor sampling before changing service tiers.`;
}
