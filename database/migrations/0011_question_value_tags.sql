-- Hidden tags conditioned on a respondent's entered value, for questions
-- that have no answer options to carry tags (integer and text types).
--
-- Integer questions: optional inclusive bounds — min only ("5 or more"),
-- max only ("3 or fewer"), both (a range; min=max for an exact value), or
-- neither (any answered value).
-- Text questions: no condition columns — the tag applies whenever the
-- respondent gives a non-blank answer. Bound columns stay null; the app
-- layer enforces the per-type shape.
--
-- Like answer_tags, rows here are admin-only metadata and must never be
-- exposed to participants.
create table if not exists question_value_tags (
  id integer generated always as identity primary key,
  question_id integer not null references survey_questions (id) on delete cascade,
  integer_min integer,
  integer_max integer,
  tag_key text not null,
  tag_value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint question_value_tags_range_check check (
    integer_min is null or integer_max is null or integer_min <= integer_max
  )
);

create index if not exists question_value_tags_question_id_idx
  on question_value_tags (question_id);
