create table if not exists surveys (
  id integer generated always as identity primary key,
  title text not null,
  description text,
  status text not null default 'draft',
  created_by_user_id integer references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  retired_at timestamptz,
  constraint surveys_status_check check (status in ('draft', 'published', 'retired'))
);

create index if not exists surveys_status_idx on surveys (status);
create index if not exists surveys_created_by_user_id_idx on surveys (created_by_user_id);

create table if not exists survey_questions (
  id integer generated always as identity primary key,
  survey_id integer not null references surveys (id) on delete cascade,
  question_text text not null,
  question_type text not null,
  display_order integer not null,
  is_required boolean not null default true,
  help_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint survey_questions_type_check check (
    question_type in ('text', 'integer', 'single_select', 'multi_select')
  ),
  constraint survey_questions_display_order_positive check (display_order > 0),
  constraint survey_questions_display_order_unique unique (survey_id, display_order)
);

create index if not exists survey_questions_survey_id_idx on survey_questions (survey_id);

create table if not exists answer_options (
  id integer generated always as identity primary key,
  question_id integer not null references survey_questions (id) on delete cascade,
  option_text text not null,
  display_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint answer_options_display_order_positive check (display_order > 0),
  constraint answer_options_display_order_unique unique (question_id, display_order)
);

create index if not exists answer_options_question_id_idx on answer_options (question_id);

create table if not exists answer_tags (
  id integer generated always as identity primary key,
  answer_option_id integer not null references answer_options (id) on delete cascade,
  tag_key text not null,
  tag_value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint answer_tags_key_value_unique unique (answer_option_id, tag_key, tag_value)
);

create index if not exists answer_tags_answer_option_id_idx on answer_tags (answer_option_id);

create table if not exists conditional_logic_rules (
  id integer generated always as identity primary key,
  survey_id integer not null references surveys (id) on delete cascade,
  source_question_id integer not null references survey_questions (id) on delete cascade,
  source_answer_option_id integer not null references answer_options (id) on delete cascade,
  condition_operator text not null,
  action_type text not null,
  target_question_id integer references survey_questions (id) on delete cascade,
  target_page_id integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conditional_logic_rules_condition_operator_check check (
    condition_operator in ('equals')
  ),
  constraint conditional_logic_rules_action_type_check check (
    action_type in (
      'JUMP_TO_QUESTION',
      'JUMP_TO_PAGE',
      'SHOW_QUESTION',
      'HIDE_QUESTION',
      'END_SURVEY'
    )
  ),
  constraint conditional_logic_rules_jump_to_question_target_check check (
    action_type <> 'JUMP_TO_QUESTION' or target_question_id is not null
  )
);

create index if not exists conditional_logic_rules_survey_id_idx
  on conditional_logic_rules (survey_id);
create index if not exists conditional_logic_rules_source_question_id_idx
  on conditional_logic_rules (source_question_id);

create table if not exists survey_attempts (
  id integer generated always as identity primary key,
  survey_id integer not null references surveys (id) on delete cascade,
  user_id integer not null references users (id) on delete cascade,
  status text not null default 'not_started',
  started_at timestamptz,
  last_activity_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint survey_attempts_status_check check (
    status in ('not_started', 'in_progress', 'completed', 'abandoned')
  )
);

create index if not exists survey_attempts_survey_id_idx on survey_attempts (survey_id);
create index if not exists survey_attempts_user_id_idx on survey_attempts (user_id);
create unique index if not exists survey_attempts_one_active_per_user_survey_idx
  on survey_attempts (survey_id, user_id)
  where status in ('not_started', 'in_progress');

create table if not exists survey_response_answers (
  id integer generated always as identity primary key,
  survey_attempt_id integer not null references survey_attempts (id) on delete cascade,
  question_id integer not null references survey_questions (id) on delete cascade,
  answer_text text,
  answer_integer integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint survey_response_answers_one_answer_shape_check check (
    (answer_text is not null and answer_integer is null)
    or (answer_text is null and answer_integer is not null)
    or (answer_text is null and answer_integer is null)
  ),
  constraint survey_response_answers_attempt_question_unique unique (
    survey_attempt_id,
    question_id
  )
);

create index if not exists survey_response_answers_survey_attempt_id_idx
  on survey_response_answers (survey_attempt_id);
create index if not exists survey_response_answers_question_id_idx
  on survey_response_answers (question_id);

create table if not exists survey_response_selected_options (
  id integer generated always as identity primary key,
  survey_response_answer_id integer not null
    references survey_response_answers (id) on delete cascade,
  answer_option_id integer not null references answer_options (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint survey_response_selected_options_unique unique (
    survey_response_answer_id,
    answer_option_id
  )
);

create index if not exists survey_response_selected_options_answer_id_idx
  on survey_response_selected_options (survey_response_answer_id);
create index if not exists survey_response_selected_options_option_id_idx
  on survey_response_selected_options (answer_option_id);
