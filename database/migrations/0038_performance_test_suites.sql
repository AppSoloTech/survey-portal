create table if not exists performance_test_suites (
  id integer generated always as identity primary key,
  suite_key text not null unique,
  target_base_url text not null,
  status text not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  duration_seconds integer,
  planned_profiles jsonb not null default '[]'::jsonb,
  planned_stages jsonb not null default '[]'::jsonb,
  first_failing_profile text,
  first_failing_stage text,
  first_failing_target_vus integer,
  first_failing_current_vus integer,
  bottleneck text,
  bottleneck_confidence text,
  recommendation text,
  config jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  report_markdown text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint performance_test_suites_status_check
    check (status in ('running', 'completed', 'failed', 'aborted'))
);

create index if not exists performance_test_suites_started_at_id_idx
  on performance_test_suites (started_at desc, id desc);

create index if not exists performance_test_suites_status_started_at_idx
  on performance_test_suites (status, started_at desc);

alter table performance_test_runs
  add column if not exists suite_id integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'performance_test_runs_suite_id_fkey'
  ) then
    alter table performance_test_runs
      add constraint performance_test_runs_suite_id_fkey
        foreign key (suite_id)
        references performance_test_suites (id)
        on delete set null;
  end if;
end $$;

create index if not exists performance_test_runs_suite_id_started_at_id_idx
  on performance_test_runs (suite_id, started_at desc, id desc);

create table if not exists performance_test_samples (
  id integer generated always as identity primary key,
  suite_id integer not null references performance_test_suites (id) on delete cascade,
  run_id integer references performance_test_runs (id) on delete set null,
  source text not null,
  profile text,
  scenario text,
  stage_label text,
  target_vus integer,
  current_vus integer,
  sampled_at timestamptz not null,
  elapsed_seconds integer,
  metrics jsonb not null default '{}'::jsonb,
  unavailable_reason text,
  caveat text,
  created_at timestamptz not null default now(),
  constraint performance_test_samples_source_check
    check (source in ('k6', 'sql', 'azure_app_service', 'azure_postgres', 'suite'))
);

create index if not exists performance_test_samples_suite_order_idx
  on performance_test_samples (suite_id, elapsed_seconds, sampled_at, id);

create index if not exists performance_test_samples_suite_source_order_idx
  on performance_test_samples (suite_id, source, elapsed_seconds, sampled_at, id);

create index if not exists performance_test_samples_suite_run_order_idx
  on performance_test_samples (suite_id, run_id, elapsed_seconds, sampled_at, id);

create index if not exists performance_test_samples_suite_profile_order_idx
  on performance_test_samples (suite_id, profile, elapsed_seconds, sampled_at, id);
