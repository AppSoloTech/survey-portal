create table if not exists response_answer_tag_groups (
  id integer generated always as identity primary key,
  answer_id integer not null references survey_response_answers (id) on delete cascade,
  group_id integer not null references tag_groups (id) on delete cascade,
  assigned_by integer references users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint response_answer_tag_groups_answer_group_unique unique (answer_id, group_id)
);

create index if not exists response_answer_tag_groups_group_id_idx
  on response_answer_tag_groups (group_id);
