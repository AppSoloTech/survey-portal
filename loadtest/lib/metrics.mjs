export async function samplePostgresMetrics(pool) {
  try {
    const [activity, database] = await Promise.all([
      pool.query(
        `select
           count(*)::int as total_connections,
           count(*) filter (where state = 'active')::int as active_connections,
           count(*) filter (where wait_event_type is not null)::int as waiting_connections
         from pg_stat_activity
         where datname = current_database()`
      ),
      pool.query(
        `select
           numbackends::int as num_backends,
           xact_commit::numeric as xact_commit,
           xact_rollback::numeric as xact_rollback,
           blks_read::numeric as blks_read,
           blks_hit::numeric as blks_hit
         from pg_stat_database
         where datname = current_database()`
      )
    ]);

    return {
      available: true,
      sampledAt: new Date().toISOString(),
      activity: activity.rows[0],
      database: database.rows[0]
    };
  } catch (error) {
    return {
      available: false,
      sampledAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export function summarizePostgresSamples(samples) {
  const availableSamples = samples.filter((sample) => sample.available);

  if (availableSamples.length === 0) {
    return {
      available: false,
      sampleCount: samples.length,
      unavailableReason: samples.find((sample) => !sample.available)?.error ?? "No samples collected"
    };
  }

  const first = availableSamples[0];
  const last = availableSamples[availableSamples.length - 1];

  return {
    available: true,
    sampleCount: availableSamples.length,
    maxActiveConnections: maxMetric(availableSamples, "active_connections"),
    maxTotalConnections: maxMetric(availableSamples, "total_connections"),
    maxWaitingConnections: maxMetric(availableSamples, "waiting_connections"),
    transactionCommitDelta: numericDelta(first, last, "xact_commit"),
    transactionRollbackDelta: numericDelta(first, last, "xact_rollback"),
    blockReadDelta: numericDelta(first, last, "blks_read"),
    blockHitDelta: numericDelta(first, last, "blks_hit")
  };
}

function maxMetric(samples, key) {
  return Math.max(...samples.map((sample) => Number(sample.activity?.[key] ?? 0)));
}

function numericDelta(first, last, key) {
  return Number(last.database?.[key] ?? 0) - Number(first.database?.[key] ?? 0);
}

