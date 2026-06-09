create table if not exists app_health_check (
  id integer primary key,
  checked_at timestamptz not null default now()
);
