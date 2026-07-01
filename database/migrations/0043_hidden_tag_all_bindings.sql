alter table answer_tags
  add column if not exists is_manual boolean not null default true;

alter table question_other_tags
  add column if not exists is_manual boolean not null default true;

alter table question_value_tags
  add column if not exists is_manual boolean not null default true;

create table if not exists hidden_tag_all_bindings (
  id integer generated always as identity primary key,
  target_type text not null,
  answer_option_id integer references answer_options (id) on delete cascade,
  question_id integer references survey_questions (id) on delete cascade,
  integer_min integer,
  integer_max integer,
  tag_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hidden_tag_all_bindings_target_type_check
    check (target_type in ('answer_option', 'question_other', 'question_value')),
  constraint hidden_tag_all_bindings_target_shape_check
    check (
      (target_type = 'answer_option'
        and answer_option_id is not null
        and question_id is null
        and integer_min is null
        and integer_max is null)
      or
      (target_type = 'question_other'
        and answer_option_id is null
        and question_id is not null
        and integer_min is null
        and integer_max is null)
      or
      (target_type = 'question_value'
        and answer_option_id is null
        and question_id is not null)
    ),
  constraint hidden_tag_all_bindings_range_check
    check (integer_min is null or integer_max is null or integer_min <= integer_max),
  constraint hidden_tag_all_bindings_tag_key_nonblank_check
    check (length(btrim(tag_key)) > 0)
);

create unique index if not exists hidden_tag_all_bindings_answer_option_unique
  on hidden_tag_all_bindings (answer_option_id, tag_key)
  where target_type = 'answer_option';

create unique index if not exists hidden_tag_all_bindings_other_unique
  on hidden_tag_all_bindings (question_id, tag_key)
  where target_type = 'question_other';

create unique index if not exists hidden_tag_all_bindings_value_unique
  on hidden_tag_all_bindings (
    question_id,
    tag_key,
    coalesce(integer_min, -2147483648),
    coalesce(integer_max, 2147483647)
  )
  where target_type = 'question_value';

create index if not exists hidden_tag_all_bindings_tag_key_idx
  on hidden_tag_all_bindings (tag_key);

create table if not exists hidden_tag_all_binding_tags (
  id integer generated always as identity primary key,
  binding_id integer not null references hidden_tag_all_bindings (id) on delete cascade,
  tag_value text not null,
  created_at timestamptz not null default now(),
  constraint hidden_tag_all_binding_tags_unique unique (binding_id, tag_value),
  constraint hidden_tag_all_binding_tags_value_nonblank_check
    check (length(btrim(tag_value)) > 0)
);

create index if not exists hidden_tag_all_binding_tags_value_idx
  on hidden_tag_all_binding_tags (tag_value);

insert into hidden_tag_all_bindings (target_type, answer_option_id, tag_key)
select distinct 'answer_option', answer_option_id, tag_key
from answer_tags
where lower(tag_value) in ('all', '<all>')
on conflict do nothing;

insert into hidden_tag_all_bindings (target_type, question_id, tag_key)
select distinct 'question_other', question_id, tag_key
from question_other_tags
where lower(tag_value) in ('all', '<all>')
on conflict do nothing;

insert into hidden_tag_all_bindings (
  target_type,
  question_id,
  integer_min,
  integer_max,
  tag_key
)
select distinct
  'question_value',
  question_id,
  integer_min,
  integer_max,
  tag_key
from question_value_tags
where lower(tag_value) in ('all', '<all>')
on conflict do nothing;

insert into hidden_tag_all_binding_tags (binding_id, tag_value)
select distinct bindings.id, tag_definitions.tag_value
from hidden_tag_all_bindings bindings
join tag_definitions
  on tag_definitions.tag_key = bindings.tag_key
where lower(tag_definitions.tag_value) not in ('all', '<all>')
on conflict do nothing;

update answer_tags target
set is_manual = false,
    updated_at = now()
from hidden_tag_all_bindings bindings
join hidden_tag_all_binding_tags sources
  on sources.binding_id = bindings.id
where bindings.target_type = 'answer_option'
  and target.answer_option_id = bindings.answer_option_id
  and target.tag_key = bindings.tag_key
  and target.tag_value = sources.tag_value;

update question_other_tags target
set is_manual = false,
    updated_at = now()
from hidden_tag_all_bindings bindings
join hidden_tag_all_binding_tags sources
  on sources.binding_id = bindings.id
where bindings.target_type = 'question_other'
  and target.question_id = bindings.question_id
  and target.tag_key = bindings.tag_key
  and target.tag_value = sources.tag_value;

update question_value_tags target
set is_manual = false,
    updated_at = now()
from hidden_tag_all_bindings bindings
join hidden_tag_all_binding_tags sources
  on sources.binding_id = bindings.id
where bindings.target_type = 'question_value'
  and target.question_id = bindings.question_id
  and target.integer_min is not distinct from bindings.integer_min
  and target.integer_max is not distinct from bindings.integer_max
  and target.tag_key = bindings.tag_key
  and target.tag_value = sources.tag_value;

delete from answer_tags
where lower(tag_value) in ('all', '<all>');

delete from question_other_tags
where lower(tag_value) in ('all', '<all>');

delete from question_value_tags
where lower(tag_value) in ('all', '<all>');
