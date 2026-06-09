import pg from "pg";

import { config } from "./config.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl:
    config.runEnv === "prod"
      ? {
          rejectUnauthorized: true,
          ...(config.databaseSslCa ? { ca: config.databaseSslCa } : {})
        }
      : undefined
});

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await pool.query("select 1");
    return true;
  } catch (error) {
    console.warn("Database health check failed", error);
    return false;
  }
}
