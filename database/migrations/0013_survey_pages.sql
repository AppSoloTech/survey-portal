create table if not exists survey_pages (
  id integer generated always as identity primary key,
  survey_id integer not null references surveys (id) on delete cascade,
  title text not null,
  description text,
  display_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint survey_pages_title_not_blank check (length(trim(title)) > 0),
  constraint survey_pages_display_order_positive check (display_order > 0),
  constraint survey_pages_display_order_unique unique (survey_id, display_order)
);

create index if not exists survey_pages_survey_id_idx on survey_pages (survey_id);

insert into survey_pages (survey_id, title, description, display_order, created_at, updated_at)
select
  survey_questions.survey_id,
  'Page ' || survey_questions.display_order::text,
  null,
  survey_questions.display_order,
  now(),
  now()
from survey_questions
where not exists (
  select 1
  from survey_pages
  where survey_pages.survey_id = survey_questions.survey_id
)
order by survey_questions.survey_id, survey_questions.display_order, survey_questions.id;

insert into survey_pages (survey_id, title, description, display_order, created_at, updated_at)
select surveys.id, 'Page 1', null, 1, now(), now()
from surveys
where not exists (
  select 1
  from survey_pages
  where survey_pages.survey_id = surveys.id
);

alter table survey_questions
  add column if not exists page_id integer;

update survey_questions
set page_id = survey_pages.id
from survey_pages
where survey_questions.survey_id = survey_pages.survey_id
  and survey_questions.display_order = survey_pages.display_order
  and survey_questions.page_id is null;

alter table survey_questions
  alter column page_id set not null;

alter table survey_questions
  drop constraint if exists survey_questions_page_id_fkey;

alter table survey_questions
  add constraint survey_questions_page_id_fkey
  foreign key (page_id) references survey_pages (id) on delete cascade;

alter table survey_questions
  drop constraint if exists survey_questions_display_order_unique;

alter table survey_questions
  drop constraint if exists survey_questions_page_display_order_unique;

alter table survey_questions
  add constraint survey_questions_page_display_order_unique unique (page_id, display_order);

create index if not exists survey_questions_page_id_idx on survey_questions (page_id);

alter table conditional_logic_rules
  add column if not exists source_page_id integer references survey_pages (id) on delete cascade;

update conditional_logic_rules
set source_page_id = survey_questions.page_id
from survey_questions
where survey_questions.id = conditional_logic_rules.source_question_id
  and conditional_logic_rules.source_page_id is null;

alter table conditional_logic_rules
  drop constraint if exists conditional_logic_rules_source_page_id_fkey;

alter table conditional_logic_rules
  add constraint conditional_logic_rules_source_page_id_fkey
  foreign key (source_page_id) references survey_pages (id) on delete cascade;

alter table conditional_logic_rules
  drop constraint if exists conditional_logic_rules_target_page_id_fkey;

alter table conditional_logic_rules
  add constraint conditional_logic_rules_target_page_id_fkey
  foreign key (target_page_id) references survey_pages (id) on delete cascade;

alter table conditional_logic_rules
  drop constraint if exists conditional_logic_rules_jump_to_question_target_check;

alter table conditional_logic_rules
  add constraint conditional_logic_rules_target_check check (
    (
      action_type in ('JUMP_TO_QUESTION', 'HIDE_QUESTION')
      and target_question_id is not null
      and target_page_id is null
    )
    or (
      action_type = 'JUMP_TO_PAGE'
      and target_page_id is not null
      and target_question_id is null
    )
    or (
      action_type in ('SHOW_QUESTION', 'END_SURVEY')
    )
  );

create index if not exists conditional_logic_rules_source_page_id_idx
  on conditional_logic_rules (source_page_id);

create index if not exists conditional_logic_rules_target_page_id_idx
  on conditional_logic_rules (target_page_id);
