insert into users (
  first_name,
  last_name,
  email,
  password_hash,
  role
)
values (
  'Phase',
  'Admin',
  'admin@example.test',
  '$2b$12$A2bRqSgd5aXQNkkdvEXZq.htZgoSr8tNcdrYFkhCRTSrpXNhhofnm',
  'admin'
)
on conflict (email) do update
set
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  password_hash = excluded.password_hash,
  role = excluded.role,
  updated_at = now();

with admin_user as (
  select id from users where email = 'admin@example.test'
),
inserted_survey as (
  insert into surveys (
    title,
    description,
    status,
    created_by_user_id,
    published_at
  )
  select
    'Phase 2 Test Survey',
    'Local seed survey with representative MVP question types and a sample jump rule.',
    'published',
    admin_user.id,
    now()
  from admin_user
  where not exists (
    select 1 from surveys where title = 'Phase 2 Test Survey'
  )
  returning id
),
seed_survey as (
  select id from inserted_survey
  union
  select id from surveys where title = 'Phase 2 Test Survey'
),
page_rows (display_order, title) as (
  values
    (1, 'Page 1'),
    (2, 'Page 2'),
    (3, 'Page 3'),
    (4, 'Page 4')
)
insert into survey_pages (
  survey_id,
  title,
  display_order
)
select
  seed_survey.id,
  page_rows.title,
  page_rows.display_order
from seed_survey
cross join page_rows
where not exists (
  select 1
  from survey_pages existing
  where existing.survey_id = seed_survey.id
    and existing.display_order = page_rows.display_order
);

with seed_survey as (
  select id from surveys where title = 'Phase 2 Test Survey'
),
question_rows (display_order, question_text, question_type, is_required, help_text) as (
  values
    (1, 'Has your organization completed the annual compliance review?', 'single_select', true, null),
    (2, 'Which operational areas were included in the review?', 'multi_select', true, 'Select every area that applies.'),
    (3, 'How many unresolved findings remain?', 'integer', true, null),
    (4, 'What is the primary blocker for completing the review?', 'text', false, null)
)
insert into survey_questions (
  survey_id,
  page_id,
  display_order,
  question_text,
  question_type,
  is_required,
  help_text
)
select
  seed_survey.id,
  survey_pages.id,
  question_rows.display_order,
  question_rows.question_text,
  question_rows.question_type,
  question_rows.is_required,
  question_rows.help_text
from seed_survey
cross join question_rows
join survey_pages
  on survey_pages.survey_id = seed_survey.id
  and survey_pages.display_order = question_rows.display_order
where not exists (
  select 1
  from survey_questions existing
  where existing.survey_id = seed_survey.id
    and existing.page_id = survey_pages.id
    and existing.display_order = question_rows.display_order
);

with seed_survey as (
  select id from surveys where title = 'Phase 2 Test Survey'
),
option_rows (question_order, display_order, option_text) as (
  values
    (1, 1, 'Yes'),
    (1, 2, 'No'),
    (1, 3, 'In progress'),
    (2, 1, 'Security'),
    (2, 2, 'Finance'),
    (2, 3, 'Operations'),
    (2, 4, 'Human resources')
)
insert into answer_options (
  question_id,
  display_order,
  option_text
)
select
  survey_questions.id,
  option_rows.display_order,
  option_rows.option_text
from option_rows
join seed_survey on true
join survey_questions
  on survey_questions.survey_id = seed_survey.id
  and survey_questions.display_order = option_rows.question_order
where not exists (
  select 1
  from answer_options existing
  where existing.question_id = survey_questions.id
    and existing.display_order = option_rows.display_order
);

with seed_survey as (
  select id from surveys where title = 'Phase 2 Test Survey'
),
tag_rows (question_order, option_order, tag_key, tag_value) as (
  values
    (1, 1, 'compliance_result', 'complete'),
    (1, 2, 'compliance_result', 'incomplete'),
    (1, 2, 'review_required', 'true'),
    (1, 3, 'compliance_result', 'in_progress'),
    (2, 1, 'area', 'security'),
    (2, 2, 'area', 'finance'),
    (2, 3, 'area', 'operations'),
    (2, 4, 'area', 'human_resources')
)
insert into answer_tags (
  answer_option_id,
  tag_key,
  tag_value
)
select
  answer_options.id,
  tag_rows.tag_key,
  tag_rows.tag_value
from tag_rows
join seed_survey on true
join survey_questions
  on survey_questions.survey_id = seed_survey.id
  and survey_questions.display_order = tag_rows.question_order
join answer_options
  on answer_options.question_id = survey_questions.id
  and answer_options.display_order = tag_rows.option_order
on conflict (answer_option_id, tag_key, tag_value) do nothing;

with seed_survey as (
  select id from surveys where title = 'Phase 2 Test Survey'
),
source_question as (
  select survey_questions.id
  from survey_questions
  join seed_survey on seed_survey.id = survey_questions.survey_id
  where survey_questions.display_order = 1
),
source_option as (
  select answer_options.id
  from answer_options
  join source_question on source_question.id = answer_options.question_id
  where answer_options.display_order = 2
),
target_question as (
  select survey_questions.id
  from survey_questions
  join seed_survey on seed_survey.id = survey_questions.survey_id
  where survey_questions.display_order = 4
)
insert into conditional_logic_rules (
  survey_id,
  source_question_id,
  source_answer_option_id,
  condition_operator,
  action_type,
  target_question_id,
  skip_target_in_normal_flow
)
select
  seed_survey.id,
  source_question.id,
  source_option.id,
  'equals',
  'JUMP_TO_QUESTION',
  target_question.id,
  true
from seed_survey
cross join source_question
cross join source_option
cross join target_question
where not exists (
  select 1
  from conditional_logic_rules existing
  where existing.survey_id = seed_survey.id
    and existing.source_question_id = source_question.id
    and existing.source_answer_option_id = source_option.id
    and existing.condition_operator = 'equals'
    and existing.action_type = 'JUMP_TO_QUESTION'
    and existing.target_question_id = target_question.id
);

-- The reusable tag catalog (tag_definitions) is seeded from the production
-- snapshot in 0004_tag_catalog_seed.sql, not from this survey's local test
-- tags. The hidden answer_tags above stay on the seeded options for runner and
-- reporting tests; they are intentionally not registered in the catalog.
