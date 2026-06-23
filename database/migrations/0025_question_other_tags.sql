-- Hidden tags attached to the system-generated Other choice on selection
-- questions. Other remains response text, not an answer_options row, so these
-- tags hang directly off the question and apply when other_text is non-null.
create table if not exists question_other_tags (
  id integer generated always as identity primary key,
  question_id integer not null references survey_questions (id) on delete cascade,
  tag_key text not null,
  tag_value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint question_other_tags_key_value_unique unique (question_id, tag_key, tag_value),
  constraint question_other_tags_key_value_nonblank_check check (
    char_length(trim(tag_key)) > 0
    and char_length(trim(tag_value)) > 0
    and char_length(tag_key) <= 80
    and char_length(tag_value) <= 180
  )
);

create index if not exists question_other_tags_question_id_idx
  on question_other_tags (question_id);
