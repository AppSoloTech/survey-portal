import pg from "pg";

import { runMigrations } from "../../../../scripts/migrate-db.mjs";
import { resolveTestDatabaseUrl } from "./testDatabaseUrl.js";

// Runs once per `vitest run`: resets the test database schema and applies
// tracked migrations so route tests start from the real DDL.
export default async function globalSetup(): Promise<void> {
  const testDatabaseUrl = resolveTestDatabaseUrl();
  const pool = new pg.Pool({ connectionString: testDatabaseUrl });

  try {
    await pool.query("drop schema if exists public cascade; create schema public;");
  } finally {
    await pool.end();
  }

  await runMigrations({ databaseUrl: testDatabaseUrl });
}
