create table if not exists survey_templates (
  id integer generated always as identity primary key,
  template_kind text not null,
  name text not null,
  description text,
  source_entity_kind text,
  source_entity_id integer,
  source_survey_id integer,
  source_survey_title text,
  source_page_title text,
  payload_schema_version integer not null,
  payload jsonb not null,
  excluded_logic jsonb not null default '[]'::jsonb,
  created_by_user_id integer references users (id) on delete set null,
  updated_by_user_id integer references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint survey_templates_kind_check check (template_kind in ('page')),
  constraint survey_templates_name_not_blank check (length(trim(name)) > 0),
  constraint survey_templates_payload_schema_version_positive check (payload_schema_version > 0),
  constraint survey_templates_payload_object_check check (jsonb_typeof(payload) = 'object'),
  constraint survey_templates_excluded_logic_array_check check (jsonb_typeof(excluded_logic) = 'array')
);

create index if not exists survey_templates_kind_name_idx
  on survey_templates (template_kind, lower(name), id);

create index if not exists survey_templates_created_by_user_id_idx
  on survey_templates (created_by_user_id);
