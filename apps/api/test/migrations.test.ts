import pg from "pg";
import { afterEach, describe, expect, it } from "vitest";

import { listMigrationFiles, runMigrations } from "../../../scripts/migrate-db.mjs";
import { resolveTestDatabaseUrl } from "./helpers/testDatabaseUrl.js";

const { Pool } = pg;
const createdDatabases: string[] = [];

describe("migration runner", () => {
  afterEach(async () => {
    for (const databaseName of createdDatabases.splice(0)) {
      await dropDatabase(databaseName);
    }
  });

  it("applies pending migrations exactly once and no-ops on the second run", async () => {
    const databaseUrl = await createIsolatedTestDatabase();
    const expectedMigrations = listMigrationFiles().map((migration) => migration.filename);

    const firstRun = await runMigrations({
      databaseUrl,
      logger: silentLogger
    });
    const secondRun = await runMigrations({
      databaseUrl,
      logger: silentLogger
    });

    expect(firstRun.applied).toEqual(expectedMigrations);
    expect(secondRun.applied).toEqual([]);

    const pool = new Pool({ connectionString: databaseUrl });

    try {
      const result = await pool.query(
        `select filename
         from schema_migrations
         order by id`
      );

      expect(result.rows.map((row) => row.filename)).toEqual(expectedMigrations);
    } finally {
      await pool.end();
    }
  });

  it("fails loudly when recorded migration checksums do not match files", async () => {
    const databaseUrl = await createIsolatedTestDatabase();
    await runMigrations({ databaseUrl, logger: silentLogger });

    const pool = new Pool({ connectionString: databaseUrl });

    try {
      await pool.query(
        `update schema_migrations
         set checksum = 'not-the-real-checksum'
         where id = 1`
      );
    } finally {
      await pool.end();
    }

    await expect(runMigrations({ databaseUrl, logger: silentLogger })).rejects.toThrow(
      /Migration checksum mismatch/
    );
  });

  it("records an explicit baseline without applying SQL", async () => {
    const databaseUrl = await createIsolatedTestDatabase();
    const expectedMigrations = listMigrationFiles().map((migration) => migration.filename);

    const pool = new Pool({ connectionString: databaseUrl });

    try {
      await pool.query("create table already_migrated_marker (id integer primary key)");
    } finally {
      await pool.end();
    }

    const baselineRun = await runMigrations({
      databaseUrl,
      baseline: true,
      logger: silentLogger
    });
    const secondRun = await runMigrations({ databaseUrl, logger: silentLogger });

    expect(baselineRun.baseline).toEqual(expectedMigrations);
    expect(secondRun.applied).toEqual([]);
  });

  it("refuses to infer a baseline for an existing schema", async () => {
    const databaseUrl = await createIsolatedTestDatabase();
    const pool = new Pool({ connectionString: databaseUrl });

    try {
      await pool.query("create table existing_table (id integer primary key)");
    } finally {
      await pool.end();
    }

    await expect(runMigrations({ databaseUrl, logger: silentLogger })).rejects.toThrow(
      /without schema_migrations/
    );
  });
});

const silentLogger = {
  log: () => undefined
};

async function createIsolatedTestDatabase(): Promise<string> {
  const baseUrl = new URL(resolveTestDatabaseUrl());
  const databaseName = `survey_portal_migration_test_${Date.now()}_${Math.floor(
    Math.random() * 1_000_000
  )}`;
  const maintenanceUrl = buildMaintenanceDatabaseUrl(baseUrl);
  const maintenancePool = new Pool({ connectionString: maintenanceUrl });

  try {
    await maintenancePool.query(`create database ${databaseName}`);
    createdDatabases.push(databaseName);
  } finally {
    await maintenancePool.end();
  }

  baseUrl.pathname = `/${databaseName}`;
  return baseUrl.toString();
}

async function dropDatabase(databaseName: string): Promise<void> {
  const maintenancePool = new Pool({ connectionString: buildMaintenanceDatabaseUrl(new URL(resolveTestDatabaseUrl())) });

  try {
    await maintenancePool.query(
      `select pg_terminate_backend(pid)
       from pg_stat_activity
       where datname = $1
         and pid <> pg_backend_pid()`,
      [databaseName]
    );
    await maintenancePool.query(`drop database if exists ${databaseName}`);
  } finally {
    await maintenancePool.end();
  }
}

function buildMaintenanceDatabaseUrl(baseUrl: URL): string {
  const maintenanceUrl = new URL(baseUrl.toString());
  maintenanceUrl.pathname = "/postgres";
  return maintenanceUrl.toString();
}
