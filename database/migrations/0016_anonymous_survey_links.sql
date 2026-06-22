create table if not exists anonymous_survey_links (
  id integer generated always as identity primary key,
  survey_id integer not null references surveys (id) on delete cascade,
  token_lookup_key text not null unique,
  token_secret_hash text not null,
  enabled boolean not null default true,
  expires_at timestamptz,
  created_by_user_id integer references users (id) on delete set null,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint anonymous_survey_links_lookup_key_not_blank check (length(trim(token_lookup_key)) > 0),
  constraint anonymous_survey_links_secret_hash_not_blank check (length(trim(token_secret_hash)) > 0)
);

create index if not exists anonymous_survey_links_survey_id_idx
  on anonymous_survey_links (survey_id);

create index if not exists anonymous_survey_links_available_idx
  on anonymous_survey_links (token_lookup_key, enabled, expires_at);

drop index if exists survey_attempts_one_active_per_user_survey_idx;

alter table survey_attempts
  alter column user_id drop not null;

alter table survey_attempts
  add column if not exists anonymous_link_id integer references anonymous_survey_links (id) on delete cascade,
  add column if not exists anonymous_access_token_hash text;

update survey_attempts
set anonymous_access_token_hash = null
where user_id is not null;

alter table survey_attempts
  drop constraint if exists survey_attempts_owner_check;

alter table survey_attempts
  add constraint survey_attempts_owner_check check (
    (
      user_id is not null
      and anonymous_link_id is null
      and anonymous_access_token_hash is null
    )
    or (
      user_id is null
      and anonymous_link_id is not null
      and anonymous_access_token_hash is not null
    )
  );

create unique index if not exists survey_attempts_one_active_per_user_survey_idx
  on survey_attempts (survey_id, user_id)
  where user_id is not null
    and status in ('not_started', 'in_progress');

create index if not exists survey_attempts_anonymous_link_id_idx
  on survey_attempts (anonymous_link_id);
