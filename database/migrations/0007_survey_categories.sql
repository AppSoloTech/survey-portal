create table if not exists survey_categories (
  id integer generated always as identity primary key,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists survey_categories_name_unique_idx
  on survey_categories (lower(name));

alter table surveys
  add column if not exists category_id integer
    references survey_categories (id) on delete set null;

create index if not exists surveys_category_id_idx on surveys (category_id);
