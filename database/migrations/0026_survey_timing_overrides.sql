create table if not exists survey_timing_overrides (
  survey_id integer primary key references surveys (id) on delete cascade,
  admin_override_seconds integer not null,
  created_by_user_id integer references users (id) on delete set null,
  updated_by_user_id integer references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint survey_timing_overrides_seconds_positive_check check (
    admin_override_seconds > 0
    and admin_override_seconds <= 86400
  )
);
