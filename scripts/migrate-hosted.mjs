// Applies pending tracked migrations to the hosted (Azure) database.
//
// Unlike scripts/migrate-db.mjs, this script reads its connection settings
// exclusively from .env.prod at the repository root — never from .env or the
// shell environment — so local development variables (DATABASE_URL pointing
// at localhost, RUN_ENV=dev, etc.) can never silently redirect a production
// migration at the wrong database.
//
// Usage:
//   npm run db:status:hosted          show applied/pending state, change nothing
//   npm run db:migrate:hosted         apply pending migrations (asks to confirm)
//   npm run db:migrate:hosted -- --yes   apply without the confirmation prompt
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import readline from "node:readline/promises";

import pg from "pg";

import { listMigrationFiles, runMigrations } from "./migrate-db.mjs";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const envProdPath = path.join(rootDir, ".env.prod");
const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseEnvFile(filePath) {
  const values = {};

  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
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

function resolveHostedConfig() {
  if (!existsSync(envProdPath)) {
    fail(
      ".env.prod not found at the repository root.\n" +
        "Copy .env.prod.example to .env.prod and fill in the hosted database settings.\n" +
        ".env.prod is gitignored and must never be committed."
    );
  }

  const env = parseEnvFile(envProdPath);
  let url = env.HOSTED_DATABASE_URL;

  if (!url) {
    const missing = ["DB_HOST", "DB_NAME", "DB_USER"].filter((key) => !env[key]);

    if (missing.length > 0) {
      fail(`.env.prod must set HOSTED_DATABASE_URL or DB_* parts (missing: ${missing.join(", ")}).`);
    }

    const port = env.DB_PORT ?? "5432";
    url = `postgresql://${encodeURIComponent(env.DB_USER)}:${encodeURIComponent(env.DB_PASSWORD ?? "")}@${env.DB_HOST}:${port}/${env.DB_NAME}`;
  }

  let parsed;

  try {
    parsed = new URL(url);
  } catch {
    fail(".env.prod database settings do not form a valid postgresql:// URL.");
  }

  if (localHosts.has(parsed.hostname)) {
    fail(
      `Refusing to run the hosted migrator against local host ${parsed.hostname}. ` +
        "Use npm run db:migrate for local databases."
    );
  }

  const ca = env.DATABASE_SSL_CA_PATH
    ? readFileSync(path.resolve(rootDir, env.DATABASE_SSL_CA_PATH), "utf8")
    : undefined;

  return {
    url,
    label: `${parsed.username}@${parsed.hostname}:${parsed.port || "5432"}/${parsed.pathname.replace(/^\//, "")}`,
    ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) }
  };
}

async function fetchAppliedMigrations(config) {
  const pool = new Pool({ connectionString: config.url, ssl: config.ssl });

  try {
    const tableCheck = await pool.query(
      "select to_regclass('public.schema_migrations') as name"
    );

    if (!tableCheck.rows[0]?.name) {
      return null;
    }

    const result = await pool.query(
      `select filename, checksum, applied_at
       from schema_migrations
       order by id asc`
    );

    return result.rows;
  } finally {
    await pool.end();
  }
}

// Applied history must be an exact prefix of the local migration files —
// same order, same checksums. Anything else means local files and hosted
// history have drifted and must be reconciled by hand before migrating.
function diffMigrations(applied, files) {
  const problems = [];

  if (applied.length > files.length) {
    problems.push(
      `Hosted database has ${applied.length} applied migrations but only ${files.length} local files exist.`
    );
  }

  for (let index = 0; index < Math.min(applied.length, files.length); index += 1) {
    if (applied[index].filename !== files[index].filename) {
      problems.push(
        `Order mismatch at position ${index + 1}: hosted has ${applied[index].filename}, local file order has ${files[index].filename}.`
      );
    } else if (applied[index].checksum !== files[index].checksum) {
      problems.push(
        `Checksum mismatch for ${applied[index].filename}: the local file changed after it was applied to the hosted database.`
      );
    }
  }

  return { problems, pending: problems.length === 0 ? files.slice(applied.length) : [] };
}

async function confirm(question) {
  if (!process.stdin.isTTY) {
    fail("Not running in a terminal; pass --yes to apply without a confirmation prompt.");
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`${question} [y/N] `)).trim().toLowerCase();
  rl.close();

  return answer === "y" || answer === "yes";
}

async function main() {
  const statusOnly = process.argv.includes("--status");
  const skipPrompt = process.argv.includes("--yes");
  const config = resolveHostedConfig();
  const files = listMigrationFiles();

  console.log(`Hosted database: ${config.label}`);

  const applied = await fetchAppliedMigrations(config);

  if (applied === null) {
    console.log(
      "schema_migrations does not exist on the hosted database.\n" +
        "If the schema is genuinely empty, running the migrator will create everything.\n" +
        "If tables already exist, baseline first (see database/README.md)."
    );

    if (statusOnly) {
      console.log(`Pending if run: all ${files.length} migrations.`);
      return;
    }
  }

  const { problems, pending } = applied
    ? diffMigrations(applied, files)
    : { problems: [], pending: files };

  if (problems.length > 0) {
    fail(["Hosted migration history has drifted from local files:", ...problems].join("\n"));
  }

  console.log(`Applied: ${applied?.length ?? 0} of ${files.length} local migrations.`);

  if (applied && applied.length > 0) {
    const latest = applied[applied.length - 1];
    console.log(`Latest applied: ${latest.filename} (${new Date(latest.applied_at).toISOString()})`);
  }

  if (pending.length === 0) {
    console.log("Hosted database is up to date.");
    return;
  }

  console.log("Pending:");

  for (const file of pending) {
    console.log(`  ${file.filename}`);
  }

  if (statusOnly) {
    return;
  }

  if (!skipPrompt) {
    const proceed = await confirm(
      `Apply ${pending.length} migration${pending.length === 1 ? "" : "s"} to ${config.label}?`
    );

    if (!proceed) {
      console.log("Aborted; no changes made.");
      return;
    }
  }

  const result = await runMigrations({ databaseUrl: config.url, ssl: config.ssl });

  console.log(`Hosted migration complete (${result.applied.length} applied).`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      `db:migrate:hosted failed: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  });
}
