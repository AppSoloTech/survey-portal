export async function createPerformanceRun(pool, input) {
  const result = await pool.query(
    `insert into performance_test_runs (
       run_key,
       scenario,
       target_base_url,
       status,
       started_at,
       config,
       summary
     )
     values ($1, $2, $3, 'running', now(), $4::jsonb, '{}'::jsonb)
     returning id, started_at`,
    [
      input.runKey,
      input.scenario,
      input.targetBaseUrl,
      JSON.stringify(input.config ?? {})
    ]
  );

  return {
    id: result.rows[0].id,
    startedAt: result.rows[0].started_at
  };
}

export async function finishPerformanceRun(pool, input) {
  await pool.query(
    `update performance_test_runs
     set status = $2,
         finished_at = now(),
         duration_seconds = greatest(0, floor(extract(epoch from (now() - started_at)))::int),
         max_vus = $3,
         peak_requests_per_second = $4,
         p50_ms = $5,
         p95_ms = $6,
         p99_ms = $7,
         error_rate = $8,
         total_requests = $9,
         failed_requests = $10,
         bottleneck = $11,
         recommendation = $12,
         summary = $13::jsonb,
         report_markdown = $14,
         updated_at = now()
     where id = $1`,
    [
      input.id,
      input.status,
      input.httpSummary.maxVus ?? null,
      input.httpSummary.peakRequestsPerSecond,
      input.httpSummary.p50Ms,
      input.httpSummary.p95Ms,
      input.httpSummary.p99Ms,
      input.httpSummary.errorRate,
      input.httpSummary.totalRequests ?? null,
      input.httpSummary.failedRequests ?? null,
      input.bottleneck,
      input.recommendation,
      JSON.stringify(input.summary),
      input.reportMarkdown
    ]
  );
}
