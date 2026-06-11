import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

import { resolveTestDatabaseUrl } from "./testDatabaseUrl.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../../../../database/migrations");

// Runs once per `vitest run`: resets the test database schema and applies
// every migration in order so route tests start from the real DDL.
export default async function globalSetup(): Promise<void> {
  const testDatabaseUrl = resolveTestDatabaseUrl();
  const pool = new pg.Pool({ connectionString: testDatabaseUrl });

  try {
    await pool.query("drop schema if exists public cascade; create schema public;");

    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    if (migrationFiles.length === 0) {
      throw new Error(`No migration files found in ${migrationsDir}`);
    }

    for (const file of migrationFiles) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      await pool.query(sql);
    }
  } finally {
    await pool.end();
  }
}
