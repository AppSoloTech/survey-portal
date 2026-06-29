create table if not exists response_answer_tags (
  id integer generated always as identity primary key,
  answer_id integer not null references survey_response_answers (id) on delete cascade,
  tag_definition_id integer not null references tag_definitions (id) on delete cascade,
  assigned_by integer references users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint response_answer_tags_answer_tag_unique unique (answer_id, tag_definition_id)
);

create index if not exists response_answer_tags_tag_definition_id_idx
  on response_answer_tags (tag_definition_id);
