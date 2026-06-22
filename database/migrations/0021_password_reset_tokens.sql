create table if not exists password_reset_tokens (
  id integer generated always as identity primary key,
  user_id integer not null references users (id) on delete cascade,
  token_lookup_key text not null,
  token_secret_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint password_reset_tokens_lookup_unique unique (token_lookup_key),
  constraint password_reset_tokens_lookup_not_blank check (length(trim(token_lookup_key)) > 0),
  constraint password_reset_tokens_secret_hash_not_blank check (length(trim(token_secret_hash)) > 0),
  constraint password_reset_tokens_expiry_after_created check (expires_at > created_at)
);

create index if not exists password_reset_tokens_user_id_idx
  on password_reset_tokens (user_id);

create index if not exists password_reset_tokens_expires_at_idx
  on password_reset_tokens (expires_at);
