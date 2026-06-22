create table if not exists anonymous_rate_limits (
  scope text not null,
  client_key_hash text not null,
  total_hits integer not null default 0,
  window_reset_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (scope, client_key_hash),
  constraint anonymous_rate_limits_scope_not_blank check (length(trim(scope)) > 0),
  constraint anonymous_rate_limits_key_hash_not_blank check (length(trim(client_key_hash)) > 0),
  constraint anonymous_rate_limits_total_hits_positive check (total_hits >= 0)
);

create index if not exists anonymous_rate_limits_window_reset_at_idx
  on anonymous_rate_limits (window_reset_at);
