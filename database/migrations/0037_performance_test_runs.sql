create table if not exists performance_test_runs (
  id integer generated always as identity primary key,
  run_key text not null unique,
  scenario text not null,
  target_base_url text not null,
  status text not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  duration_seconds integer,
  max_vus integer,
  peak_requests_per_second numeric(12, 2),
  p50_ms numeric(12, 2),
  p95_ms numeric(12, 2),
  p99_ms numeric(12, 2),
  error_rate numeric(8, 6),
  total_requests integer,
  failed_requests integer,
  bottleneck text,
  recommendation text,
  config jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  report_markdown text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint performance_test_runs_status_check
    check (status in ('running', 'completed', 'failed', 'aborted'))
);

create index if not exists performance_test_runs_started_at_id_idx
  on performance_test_runs (started_at desc, id desc);

create index if not exists performance_test_runs_status_started_at_idx
  on performance_test_runs (status, started_at desc);
