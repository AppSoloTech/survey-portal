alter table response_answer_tags
  add column if not exists is_manual boolean not null default true;

create table if not exists response_answer_tag_group_tags (
  id integer generated always as identity primary key,
  answer_id integer not null,
  group_id integer not null,
  tag_definition_id integer not null references tag_definitions (id) on delete cascade,
  assigned_by integer references users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint response_answer_tag_group_tags_binding_fk
    foreign key (answer_id, group_id)
    references response_answer_tag_groups (answer_id, group_id)
    on delete cascade,
  constraint response_answer_tag_group_tags_unique
    unique (answer_id, group_id, tag_definition_id)
);

create index if not exists response_answer_tag_group_tags_tag_definition_id_idx
  on response_answer_tag_group_tags (tag_definition_id);
