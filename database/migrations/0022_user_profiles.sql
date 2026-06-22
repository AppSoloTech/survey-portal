create table if not exists user_profiles (
  id integer generated always as identity primary key,
  user_id integer not null references users (id) on delete cascade,
  organization text,
  job_title text,
  location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_profiles_user_id_unique unique (user_id),
  constraint user_profiles_organization_length_check check (
    organization is null or char_length(organization) <= 120
  ),
  constraint user_profiles_job_title_length_check check (
    job_title is null or char_length(job_title) <= 120
  ),
  constraint user_profiles_location_length_check check (
    location is null or char_length(location) <= 120
  )
);

create index if not exists user_profiles_user_id_idx on user_profiles (user_id);
