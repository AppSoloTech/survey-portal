-- Two published seed surveys with linear flows (no jump or skip rules, no
-- hidden tags): an 8-question and a 10-question survey for exercising the
-- dashboard, pagination, and longer attempt runs. Idempotent by title,
-- mirroring 0001_phase_2_seed.sql. Scale questions carry contiguous numeric
-- answer options ('1'..'5'); the API derives scaleMin/scaleMax from them.

-- ---------------------------------------------------------------------
-- Survey A: Employee Onboarding Experience (8 questions)
-- ---------------------------------------------------------------------
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
    'Employee Onboarding Experience',
    'Straight 8-question survey covering the first weeks at the company. No conditional logic.',
    'published',
    admin_user.id,
    now()
  from admin_user
  where not exists (
    select 1 from surveys where title = 'Employee Onboarding Experience'
  )
  returning id
),
seed_survey as (
  select id from inserted_survey
  union
  select id from surveys where title = 'Employee Onboarding Experience'
),
question_rows (display_order, question_text, question_type, is_required, help_text) as (
  values
    (1, 'How would you describe your overall onboarding experience?', 'single_select', true, null),
    (2, 'Did you receive your equipment on time?', 'single_select', true, null),
    (3, 'Which onboarding sessions did you attend?', 'multi_select', true, 'Select every session that applies.'),
    (4, 'How clear were your goals for the first week?', 'scale', true, '1 = not clear at all, 5 = completely clear.'),
    (5, 'How many days did it take to get access to all required systems?', 'integer', true, null),
    (6, 'What was the most helpful part of your onboarding?', 'text', false, null),
    (7, 'Would you recommend our onboarding process to a new hire?', 'single_select', true, null),
    (8, 'Any other feedback about your onboarding?', 'text', false, null)
)
insert into survey_questions (
  survey_id,
  display_order,
  question_text,
  question_type,
  is_required,
  help_text
)
select
  seed_survey.id,
  question_rows.display_order,
  question_rows.question_text,
  question_rows.question_type,
  question_rows.is_required,
  question_rows.help_text
from seed_survey
cross join question_rows
where not exists (
  select 1
  from survey_questions existing
  where existing.survey_id = seed_survey.id
    and existing.display_order = question_rows.display_order
);

with seed_survey as (
  select id from surveys where title = 'Employee Onboarding Experience'
),
option_rows (question_order, display_order, option_text) as (
  values
    (1, 1, 'Excellent'),
    (1, 2, 'Good'),
    (1, 3, 'Fair'),
    (1, 4, 'Poor'),
    (2, 1, 'Yes'),
    (2, 2, 'No'),
    (3, 1, 'Company overview'),
    (3, 2, 'Tools and systems'),
    (3, 3, 'Team introductions'),
    (3, 4, 'Benefits walkthrough'),
    (4, 1, '1'),
    (4, 2, '2'),
    (4, 3, '3'),
    (4, 4, '4'),
    (4, 5, '5'),
    (7, 1, 'Yes'),
    (7, 2, 'No'),
    (7, 3, 'Unsure')
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

-- ---------------------------------------------------------------------
-- Survey B: Workplace Satisfaction Survey (10 questions)
-- ---------------------------------------------------------------------
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
    'Workplace Satisfaction Survey',
    'Straight 10-question survey on role satisfaction and workplace environment. No conditional logic.',
    'published',
    admin_user.id,
    now()
  from admin_user
  where not exists (
    select 1 from surveys where title = 'Workplace Satisfaction Survey'
  )
  returning id
),
seed_survey as (
  select id from inserted_survey
  union
  select id from surveys where title = 'Workplace Satisfaction Survey'
),
question_rows (display_order, question_text, question_type, is_required, help_text) as (
  values
    (1, 'Which department do you work in?', 'single_select', true, null),
    (2, 'How long have you worked at the company?', 'single_select', true, null),
    (3, 'How satisfied are you with your current role?', 'scale', true, '1 = very dissatisfied, 5 = very satisfied.'),
    (4, 'How would you rate your work-life balance?', 'scale', true, '1 = poor, 5 = excellent.'),
    (5, 'Which benefits do you use regularly?', 'multi_select', true, 'Select every benefit that applies.'),
    (6, 'Do you feel recognized for the work you do?', 'single_select', true, null),
    (7, 'How many hours per week do you typically spend in meetings?', 'integer', true, null),
    (8, 'What one change would most improve your day-to-day work?', 'text', false, null),
    (9, 'Would you recommend the company as a place to work?', 'single_select', true, null),
    (10, 'Any additional comments?', 'text', false, null)
)
insert into survey_questions (
  survey_id,
  display_order,
  question_text,
  question_type,
  is_required,
  help_text
)
select
  seed_survey.id,
  question_rows.display_order,
  question_rows.question_text,
  question_rows.question_type,
  question_rows.is_required,
  question_rows.help_text
from seed_survey
cross join question_rows
where not exists (
  select 1
  from survey_questions existing
  where existing.survey_id = seed_survey.id
    and existing.display_order = question_rows.display_order
);

with seed_survey as (
  select id from surveys where title = 'Workplace Satisfaction Survey'
),
option_rows (question_order, display_order, option_text) as (
  values
    (1, 1, 'Engineering'),
    (1, 2, 'Sales'),
    (1, 3, 'Operations'),
    (1, 4, 'Support'),
    (2, 1, 'Less than 1 year'),
    (2, 2, '1 to 3 years'),
    (2, 3, '3 to 5 years'),
    (2, 4, 'More than 5 years'),
    (3, 1, '1'),
    (3, 2, '2'),
    (3, 3, '3'),
    (3, 4, '4'),
    (3, 5, '5'),
    (4, 1, '1'),
    (4, 2, '2'),
    (4, 3, '3'),
    (4, 4, '4'),
    (4, 5, '5'),
    (5, 1, 'Health insurance'),
    (5, 2, 'Retirement plan'),
    (5, 3, 'Remote work stipend'),
    (5, 4, 'Learning budget'),
    (5, 5, 'Wellness program'),
    (6, 1, 'Yes'),
    (6, 2, 'Sometimes'),
    (6, 3, 'No'),
    (9, 1, 'Yes'),
    (9, 2, 'Maybe'),
    (9, 3, 'No')
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
