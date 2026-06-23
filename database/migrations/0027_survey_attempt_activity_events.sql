create table if not exists survey_attempt_activity_events (
  id integer generated always as identity primary key,
  survey_attempt_id integer not null references survey_attempts (id) on delete cascade,
  survey_id integer not null references surveys (id) on delete cascade,
  page_id integer references survey_pages (id) on delete set null,
  question_id integer references survey_questions (id) on delete set null,
  event_type text not null,
  visible_question_ids integer[] not null default '{}',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint survey_attempt_activity_events_type_check check (
    event_type in ('page_entry', 'answer_save', 'resume', 'completion', 'heartbeat')
  )
);

create index if not exists survey_attempt_activity_events_attempt_time_idx
  on survey_attempt_activity_events (survey_attempt_id, occurred_at, id);

create index if not exists survey_attempt_activity_events_survey_time_idx
  on survey_attempt_activity_events (survey_id, occurred_at, id);
