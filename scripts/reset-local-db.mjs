import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const rootDir = process.cwd();
const envPath = path.join(rootDir, ".env");
const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);

loadDotenv(envPath);

const runEnv = process.env.RUN_ENV ?? "dev";

if (runEnv !== "dev") {
  fail(`Refusing to reset database because RUN_ENV is ${runEnv}. Use RUN_ENV=dev.`);
}

const databaseUrl = resolveDatabaseUrl();
const databaseHost = readDatabaseHost(databaseUrl);

if (!databaseHost) {
  fail("Could not determine database host from local database configuration.");
}

if (!localHosts.has(databaseHost) && process.env.DB_RESET_ALLOW_NONLOCAL !== "1") {
  fail(
    `Refusing to reset non-local database host ${databaseHost}. Set DB_RESET_ALLOW_NONLOCAL=1 only for a disposable dev database.`
  );
}

if (process.env.HOSTED_DATABASE_URL && databaseUrl === process.env.HOSTED_DATABASE_URL) {
  fail("Refusing to reset HOSTED_DATABASE_URL.");
}

const migrationFiles = listSqlFiles(path.join(rootDir, "database", "migrations"));
const seedFiles = listSqlFiles(path.join(rootDir, "database", "seeds"));

if (migrationFiles.length === 0) {
  fail("No migration files found.");
}

console.log(`Resetting local database at ${databaseHost}`);
runPsql(databaseUrl, [
  "-v",
  "ON_ERROR_STOP=1",
  "-c",
  "drop schema if exists public cascade; create schema public;"
]);

for (const file of [...migrationFiles, ...seedFiles]) {
  console.log(`Applying ${path.relative(rootDir, file)}`);
  runPsql(databaseUrl, ["-v", "ON_ERROR_STOP=1", "-f", file]);
}

console.log("Local database reset complete.");

function loadDotenv(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);

  for (const line of lines) {
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
    const value = rawValue.replace(/^["']|["']$/g, "");

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function resolveDatabaseUrl() {
  const url = process.env.LOCAL_DATABASE_URL ?? process.env.DATABASE_URL;

  if (url) {
    return url;
  }

  const host = process.env.DB_HOST;
  const port = process.env.DB_PORT ?? "5432";
  const name = process.env.DB_NAME;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD ?? "";

  if (!host || !name || !user) {
    fail("Set LOCAL_DATABASE_URL, DATABASE_URL, or DB_HOST/DB_NAME/DB_USER before resetting.");
  }

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${name}`;
}

function readDatabaseHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return process.env.DB_HOST;
  }
}

function listSqlFiles(directory) {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort((left, right) => left.localeCompare(right))
    .map((fileName) => path.join(directory, fileName));
}

function runPsql(databaseUrl, args) {
  const result = spawnSync("psql", ["--dbname", databaseUrl, ...args], {
    stdio: "inherit"
  });

  if (result.error) {
    fail(`Could not run psql: ${result.error.message}`);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function fail(message) {
  console.error(`db:reset failed: ${message}`);
  process.exit(1);
}
