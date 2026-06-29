import {
  assertNoOperationalSecrets,
  sanitizeOperationalString,
  sanitizeOperationalValue
} from "./redaction.mjs";

export async function createPerformanceRun(pool, input) {
  const hasSuiteId = input.suiteId !== undefined && input.suiteId !== null;
  const result = hasSuiteId
    ? await pool.query(
        `insert into performance_test_runs (
           run_key,
           scenario,
           target_base_url,
           status,
           started_at,
           suite_id,
           config,
           summary
         )
         values ($1, $2, $3, 'running', now(), $4, $5::jsonb, '{}'::jsonb)
         returning id, started_at`,
        [
          input.runKey,
          input.scenario,
          sanitizeOperationalString(input.targetBaseUrl),
          input.suiteId,
          stringifySafeJson(input.config ?? {}, "performance run config")
        ]
      )
    : await pool.query(
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
          sanitizeOperationalString(input.targetBaseUrl),
          stringifySafeJson(input.config ?? {}, "performance run config")
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
      stringifySafeJson(input.summary, "performance run summary"),
      sanitizePersistedMarkdown(input.reportMarkdown, "performance run markdown")
    ]
  );
}

export async function createPerformanceSuite(pool, input) {
  const result = await pool.query(
    `insert into performance_test_suites (
       suite_key,
       target_base_url,
       status,
       started_at,
       planned_profiles,
       planned_stages,
       config,
       summary
     )
     values ($1, $2, 'running', now(), $3::jsonb, $4::jsonb, $5::jsonb, '{}'::jsonb)
     returning id, started_at`,
    [
      input.suiteKey,
      sanitizeOperationalString(input.targetBaseUrl),
      stringifySafeJson(input.plannedProfiles ?? [], "suite planned profiles"),
      stringifySafeJson(input.plannedStages ?? [], "suite planned stages"),
      stringifySafeJson(input.config ?? {}, "suite config")
    ]
  );

  return {
    id: result.rows[0].id,
    startedAt: result.rows[0].started_at
  };
}

export async function finishPerformanceSuite(pool, input) {
  await pool.query(
    `update performance_test_suites
     set status = $2,
         finished_at = now(),
         duration_seconds = greatest(0, floor(extract(epoch from (now() - started_at)))::int),
         first_failing_profile = $3,
         first_failing_stage = $4,
         first_failing_target_vus = $5,
         first_failing_current_vus = $6,
         bottleneck = $7,
         bottleneck_confidence = $8,
         recommendation = $9,
         summary = $10::jsonb,
         report_markdown = $11,
         updated_at = now()
     where id = $1`,
    [
      input.id,
      input.status,
      input.firstFailingProfile ?? null,
      input.firstFailingStage ?? null,
      input.firstFailingTargetVus ?? null,
      input.firstFailingCurrentVus ?? null,
      input.bottleneck ?? null,
      input.bottleneckConfidence ?? null,
      input.recommendation ?? null,
      stringifySafeJson(input.summary ?? {}, "suite summary"),
      sanitizePersistedMarkdown(input.reportMarkdown ?? "", "suite markdown")
    ]
  );
}

export async function insertPerformanceSamples(pool, samples) {
  for (const sample of samples) {
    await pool.query(
      `insert into performance_test_samples (
         suite_id,
         run_id,
         source,
         profile,
         scenario,
         stage_label,
         target_vus,
         current_vus,
         sampled_at,
         elapsed_seconds,
         metrics,
         unavailable_reason,
         caveat
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, coalesce($9::timestamptz, now()), $10, $11::jsonb, $12, $13)`,
      [
        sample.suiteId,
        sample.runId ?? null,
        sample.source,
        sample.profile ?? null,
        sample.scenario ?? null,
        sample.stageLabel ?? null,
        sample.targetVus ?? null,
        sample.currentVus ?? null,
        sample.sampledAt ?? null,
        sample.elapsedSeconds ?? null,
        stringifySafeJson(sample.metrics ?? {}, "performance sample metrics"),
        sample.unavailableReason ? sanitizeOperationalString(sample.unavailableReason) : null,
        sample.caveat ? sanitizeOperationalString(sample.caveat) : null
      ]
    );
  }
}

function stringifySafeJson(value, label) {
  const sanitized = sanitizeOperationalValue(value);
  assertNoOperationalSecrets(sanitized, label);
  return JSON.stringify(sanitized);
}

function sanitizePersistedMarkdown(value, label) {
  const sanitized = sanitizeOperationalString(value);
  assertNoOperationalSecrets(sanitized, label);
  return sanitized;
}
