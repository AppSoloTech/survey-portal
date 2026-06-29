import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const rootDir = path.resolve(__dirname, "../..");
export const loadtestDir = path.join(rootDir, "loadtest");
export const reportsDir = path.join(loadtestDir, "reports");
export const defaultEnvPath = path.join(rootDir, ".env.loadtest");
const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
const standaloneBooleanValueFlags = new Set(["allow-capacity", "include-direct-db"]);

export function parseEnvFileText(text) {
  const values = {};

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");

    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    const rawValue = trimmed.slice(equalsIndex + 1).trim();
    values[key] = rawValue.replace(/^["']|["']$/g, "");
  }

  return values;
}

export function parseCliArgs(argv) {
  const args = {
    dev: false,
    yes: false,
    dryRun: false,
    persistenceSmoke: false,
    help: false,
    values: {}
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--dev") {
      args.dev = true;
    } else if (arg === "--yes" || arg === "-y") {
      args.yes = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--persistence-smoke") {
      args.persistenceSmoke = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg.startsWith("--")) {
      const [rawName, rawInlineValue] = arg.slice(2).split("=", 2);
      const nextValue = argv[index + 1];
      const hasNextValue = nextValue && !nextValue.startsWith("--");
      const value = rawInlineValue ?? (hasNextValue ? nextValue : readStandaloneFlagValue(rawName));

      if (rawInlineValue === undefined && hasNextValue) {
        index += 1;
      }

      args.values[toCamelCase(rawName)] = value;
    }
  }

  return args;
}

export function readLoadtestEnv(envPath = defaultEnvPath) {
  if (!existsSync(envPath)) {
    throw new Error(
      `${path.basename(envPath)} not found at the repository root. ` +
        "Copy .env.loadtest.example to .env.loadtest and fill in load-test settings."
    );
  }

  return parseEnvFileText(readFileSync(envPath, "utf8"));
}

export function resolveLoadtestConfig(options = {}) {
  const argv = options.argv ?? process.argv.slice(2);
  const env = options.env ?? readLoadtestEnv(options.envPath);
  const cli = parseCliArgs(argv);
  const devMode = cli.dev || readBoolean(env.LOADTEST_DEV_MODE, false);
  const baseUrl = readRequired(env, "LOADTEST_BASE_URL");
  const databaseUrl = resolveDatabaseUrl(env);
  const baseHost = parseHost(baseUrl, "LOADTEST_BASE_URL");
  const databaseHost = parseHost(databaseUrl, "LOADTEST_DATABASE_URL");

  assertTargetSafety({
    baseHost,
    databaseHost,
    devMode
  });

  const runKey =
    cli.values.runKey ??
    env.LOADTEST_RUN_KEY ??
    `loadtest-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const databaseSslCa = readOptionalSslCa(env, options.envPath ?? defaultEnvPath);
  const adminEmail = cli.values.adminEmail ?? env.LOADTEST_ADMIN_EMAIL ?? "";
  const adminPassword = cli.values.adminPassword ?? env.LOADTEST_ADMIN_PASSWORD ?? "";

  return {
    cli,
    env,
    devMode,
    yes: cli.yes || readBoolean(env.LOADTEST_YES, false),
    runKey,
    marker: `LOADTEST ${runKey}`,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    databaseUrl,
    databaseSsl: devMode
      ? undefined
      : {
          rejectUnauthorized: true,
          ...(databaseSslCa ? { ca: databaseSslCa } : {})
        },
    targetLabel: buildTargetLabel(databaseUrl),
    adminEmail,
    adminPassword,
    profile: cli.values.profile ?? env.LOADTEST_PROFILE ?? "smoke",
    vus: readPositiveInteger(cli.values.vus ?? env.LOADTEST_VUS, 1, "LOADTEST_VUS"),
    duration: String(cli.values.duration ?? env.LOADTEST_DURATION ?? "30s"),
    completedAttempts: readPositiveInteger(
      cli.values.completedAttempts ?? env.LOADTEST_COMPLETED_ATTEMPTS,
      12,
      "LOADTEST_COMPLETED_ATTEMPTS"
    ),
    dbConcurrency: readPositiveInteger(
      cli.values.dbConcurrency ?? env.LOADTEST_DB_CONCURRENCY,
      4,
      "LOADTEST_DB_CONCURRENCY"
    ),
    dbDurationSeconds: readPositiveInteger(
      cli.values.dbDurationSeconds ?? env.LOADTEST_DB_DURATION_SECONDS,
      30,
      "LOADTEST_DB_DURATION_SECONDS"
    ),
    appDbPoolMax: readPositiveInteger(
      cli.values.appDbPoolMax ?? env.LOADTEST_APP_DB_POOL_MAX,
      10,
      "LOADTEST_APP_DB_POOL_MAX"
    ),
    appInstanceCount: readPositiveInteger(
      cli.values.appInstanceCount ?? env.LOADTEST_APP_INSTANCE_COUNT,
      1,
      "LOADTEST_APP_INSTANCE_COUNT"
    ),
    rampingStages: cli.values.rampingStages ?? env.LOADTEST_RAMPING_STAGES ?? defaultRampingStages(),
    sampleIntervalMs: readPositiveInteger(
      cli.values.sampleIntervalMs ?? env.LOADTEST_SQL_SAMPLE_INTERVAL_MS,
      5000,
      "LOADTEST_SQL_SAMPLE_INTERVAL_MS"
    ),
    persistenceSmoke: cli.persistenceSmoke || readBoolean(env.LOADTEST_PERSISTENCE_SMOKE, false)
  };
}

export function assertTargetSafety({ baseHost, databaseHost, devMode }) {
  const hasLocalTarget = isLocalHost(baseHost) || isLocalHost(databaseHost);

  if (hasLocalTarget && !devMode) {
    throw new Error(
      "Refusing to use localhost load-test targets without --dev. " +
        "Pass --dev only for intentional local development tests."
    );
  }

  if (devMode && (!isLocalHost(baseHost) || !isLocalHost(databaseHost))) {
    throw new Error(
      "--dev requires both LOADTEST_BASE_URL and LOADTEST_DATABASE_URL to point at localhost. " +
        "Remove --dev for hosted tests."
    );
  }
}

export async function confirmWriteIfNeeded(config, action) {
  if (config.devMode || config.yes) {
    return;
  }

  if (!process.stdin.isTTY) {
    throw new Error(`Not running in a terminal; pass --yes to ${action}.`);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = (
    await rl.question(`${action} against ${config.targetLabel} and ${config.baseUrl}? [y/N] `)
  )
    .trim()
    .toLowerCase();
  rl.close();

  if (answer !== "y" && answer !== "yes") {
    throw new Error("Aborted; no changes made.");
  }
}

export function printTargetSummary(config, action) {
  console.log(`Load-test action: ${action}`);
  console.log(`HTTP target: ${config.baseUrl}`);
  console.log(`Database target: ${config.targetLabel}`);
  console.log(`Mode: ${config.devMode ? "dev/local" : "hosted"}`);
  console.log(`Run key: ${config.runKey}`);
}

function resolveDatabaseUrl(env) {
  if (env.LOADTEST_DATABASE_URL) {
    return env.LOADTEST_DATABASE_URL;
  }

  const host = env.LOADTEST_DB_HOST;
  const name = env.LOADTEST_DB_NAME;
  const user = env.LOADTEST_DB_USER;

  if (!host || !name || !user) {
    throw new Error(
      "Set LOADTEST_DATABASE_URL or LOADTEST_DB_HOST, LOADTEST_DB_NAME, and LOADTEST_DB_USER."
    );
  }

  const port = env.LOADTEST_DB_PORT ?? "5432";
  const password = env.LOADTEST_DB_PASSWORD ?? "";

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${name}`;
}

function parseHost(value, label) {
  try {
    return new URL(value).hostname;
  } catch {
    throw new Error(`${label} must be a valid URL.`);
  }
}

function buildTargetLabel(databaseUrl) {
  const parsed = new URL(databaseUrl);
  const database = parsed.pathname.replace(/^\//, "");

  return `${parsed.username || "unknown"}@${parsed.hostname}:${parsed.port || "5432"}/${database}`;
}

function readOptionalSslCa(env, envPath) {
  const inlineCa = env.LOADTEST_DATABASE_SSL_CA?.replace(/\\n/g, "\n");

  if (inlineCa) {
    return inlineCa;
  }

  if (!env.LOADTEST_DATABASE_SSL_CA_PATH) {
    return undefined;
  }

  const baseDir = path.dirname(envPath);
  return readFileSync(path.resolve(baseDir, env.LOADTEST_DATABASE_SSL_CA_PATH), "utf8");
}

function readRequired(env, name) {
  const value = env[name];

  if (!value) {
    throw new Error(`${name} is required in .env.loadtest.`);
  }

  return value;
}

function readBoolean(value, defaultValue) {
  if (value === undefined || value === "") {
    return defaultValue;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new Error("Boolean load-test values must be true or false.");
}

function readPositiveInteger(value, defaultValue, name) {
  if (value === undefined || value === "") {
    return defaultValue;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function isLocalHost(host) {
  return localHosts.has(host);
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_match, character) => character.toUpperCase());
}

function readStandaloneFlagValue(rawName) {
  if (standaloneBooleanValueFlags.has(rawName)) {
    return true;
  }

  throw new Error(`--${rawName} requires a value.`);
}

function defaultRampingStages() {
  return JSON.stringify([
    { duration: "1m", target: 10 },
    { duration: "2m", target: 25 },
    { duration: "2m", target: 50 },
    { duration: "1m", target: 0 }
  ]);
}
