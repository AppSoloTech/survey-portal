import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import pg from "pg";

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const migrationsDir = path.join(rootDir, "database", "migrations");

export async function runMigrations({
  databaseUrl,
  migrationsDirectory = migrationsDir,
  baseline = false,
  ssl,
  logger = console
}) {
  const migrationFiles = listMigrationFiles(migrationsDirectory);

  if (migrationFiles.length === 0) {
    throw new Error(`No migration files found in ${migrationsDirectory}`);
  }

  const pool = new Pool({ connectionString: databaseUrl, ...(ssl ? { ssl } : {}) });

  try {
    await ensureMigrationTableAllowed(pool, baseline);
    await ensureSchemaMigrationsTable(pool);

    const appliedMigrations = await readAppliedMigrations(pool);

    if (baseline) {
      await baselineMigrations(pool, migrationFiles, appliedMigrations, logger);
      return { applied: [], baseline: migrationFiles.map((file) => file.filename) };
    }

    validateMigrationHistory(appliedMigrations, migrationFiles);

    const pendingMigrations = migrationFiles.slice(appliedMigrations.length);

    for (const migration of pendingMigrations) {
      logger.log(`Applying ${migration.filename}`);
      await pool.query("begin");

      try {
        await pool.query(migration.sql);
        await pool.query(
          `insert into schema_migrations (filename, checksum)
           values ($1, $2)`,
          [migration.filename, migration.checksum]
        );
        await pool.query("commit");
      } catch (error) {
        await pool.query("rollback");
        throw error;
      }
    }

    if (pendingMigrations.length === 0) {
      logger.log("No pending migrations.");
    }

    return { applied: pendingMigrations.map((file) => file.filename), baseline: [] };
  } finally {
    await pool.end();
  }
}

export function listMigrationFiles(directory = migrationsDir) {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort((left, right) => left.localeCompare(right))
    .map((filename) => {
      const fullPath = path.join(directory, filename);
      const sql = readFileSync(fullPath, "utf8");

      return {
        filename,
        fullPath,
        sql,
        checksum: createHash("sha256").update(sql).digest("hex")
      };
    });
}

async function ensureMigrationTableAllowed(pool, baseline) {
  const migrationTable = await pool.query("select to_regclass('public.schema_migrations') as name");

  if (migrationTable.rows[0]?.name) {
    return;
  }

  const existingObjects = await pool.query(
    `select tablename
     from pg_tables
     where schemaname = 'public'
     order by tablename`
  );

  if (existingObjects.rowCount > 0 && !baseline) {
    throw new Error(
      `Found existing public schema tables without schema_migrations (${existingObjects.rows
        .map((row) => row.tablename)
        .join(", ")}). Run npm run db:migrate -- --baseline only if these migrations were already applied.`
    );
  }
}

async function ensureSchemaMigrationsTable(pool) {
  await pool.query(
    `create table if not exists schema_migrations (
       id integer generated always as identity primary key,
       filename text not null unique,
       checksum text not null,
       applied_at timestamptz not null default now()
     )`
  );
}

async function readAppliedMigrations(pool) {
  const result = await pool.query(
    `select filename, checksum
     from schema_migrations
     order by id asc`
  );

  return result.rows;
}

async function baselineMigrations(pool, migrationFiles, appliedMigrations, logger) {
  if (appliedMigrations.length > 0) {
    validateMigrationHistory(appliedMigrations, migrationFiles);
    logger.log("schema_migrations already contains a valid baseline.");
    return;
  }

  await pool.query("begin");

  try {
    for (const migration of migrationFiles) {
      await pool.query(
        `insert into schema_migrations (filename, checksum)
         values ($1, $2)`,
        [migration.filename, migration.checksum]
      );
    }

    await pool.query("commit");
    logger.log(`Recorded ${migrationFiles.length} baseline migrations without applying SQL.`);
  } catch (error) {
    await pool.query("rollback");
    throw error;
  }
}

function validateMigrationHistory(appliedMigrations, migrationFiles) {
  if (appliedMigrations.length > migrationFiles.length) {
    throw new Error("schema_migrations contains more entries than migration files.");
  }

  for (let index = 0; index < appliedMigrations.length; index += 1) {
    const applied = appliedMigrations[index];
    const expected = migrationFiles[index];

    if (!expected || applied.filename !== expected.filename) {
      throw new Error(
        `Migration history mismatch at position ${index + 1}: database has ${applied.filename}, file order has ${expected?.filename ?? "no file"}.`
      );
    }

    if (applied.checksum !== expected.checksum) {
      throw new Error(`Migration checksum mismatch for ${applied.filename}.`);
    }
  }
}

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
  const runEnv = process.env.RUN_ENV ?? "dev";

  if (runEnv !== "dev" && runEnv !== "prod") {
    throw new Error("RUN_ENV must be either dev or prod");
  }

  // Both environments accept a connection string or discrete DB_* settings;
  // hosted platforms often configure the parts individually.
  const url =
    runEnv === "prod"
      ? process.env.HOSTED_DATABASE_URL ?? process.env.DATABASE_URL
      : process.env.LOCAL_DATABASE_URL ?? process.env.DATABASE_URL;

  if (url) {
    return url;
  }

  const host = readRequiredEnv("DB_HOST");
  const port = process.env.DB_PORT ?? "5432";
  const name = readRequiredEnv("DB_NAME");
  const user = readRequiredEnv("DB_USER");
  const password = process.env.DB_PASSWORD ?? "";

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${name}`;
}

function readOptionalDatabaseSslCa() {
  const inlineCa = process.env.DATABASE_SSL_CA?.replace(/\\n/g, "\n");

  if (inlineCa) {
    return inlineCa;
  }

  const caPath = process.env.DATABASE_SSL_CA_PATH;

  if (!caPath) {
    return undefined;
  }

  return readFileSync(caPath, "utf8");
}

function resolveDatabaseSsl() {
  if ((process.env.RUN_ENV ?? "dev") !== "prod") {
    return undefined;
  }

  const ca = readOptionalDatabaseSslCa();

  return {
    rejectUnauthorized: true,
    ...(ca ? { ca } : {})
  };
}

function readRequiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

async function main() {
  loadDotenv(path.join(rootDir, ".env"));

  const baseline = process.argv.includes("--baseline");
  const result = await runMigrations({
    databaseUrl: resolveDatabaseUrl(),
    baseline,
    ssl: resolveDatabaseSsl()
  });

  if (baseline) {
    console.log(`Baseline complete (${result.baseline.length} migrations recorded).`);
  } else {
    console.log(`Migration complete (${result.applied.length} applied).`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`db:migrate failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
