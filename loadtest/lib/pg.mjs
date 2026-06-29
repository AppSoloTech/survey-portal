import pg from "pg";

const { Pool } = pg;

export function createLoadtestPool(config, options = {}) {
  return new Pool({
    connectionString: config.databaseUrl,
    ...(config.databaseSsl ? { ssl: config.databaseSsl } : {}),
    ...(options.max ? { max: options.max } : {})
  });
}

export async function assertPerformanceTestRunsTable(pool) {
  const result = await pool.query("select to_regclass('public.performance_test_runs') as name");

  if (!result.rows[0]?.name) {
    throw new Error(
      "performance_test_runs table was not found. Run npm run db:migrate:hosted for hosted targets before persisting results."
    );
  }
}

export async function assertSchemaMigrationsIncludePhase49(pool) {
  const result = await pool.query(
    `select 1
     from schema_migrations
     where filename = '0037_performance_test_runs.sql'
     limit 1`
  );

  if (result.rowCount === 0) {
    throw new Error(
      "Migration 0037_performance_test_runs.sql is not recorded in schema_migrations for this target database."
    );
  }
}

