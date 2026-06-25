-- Draft role-based survey exported from local builder data for exercising the
-- page-grouped progressive runner. Idempotent by title.

insert into survey_categories (name)
select 'New Tests'
where not exists (
  select 1 from survey_categories where lower(name) = lower('New Tests')
);

with admin_user as (
  select id from users where email = 'admin@example.test'
),
seed_category as (
  select id from survey_categories where lower(name) = lower('New Tests')
),
inserted_survey as (
  insert into surveys (
    title,
    description,
    status,
    created_by_user_id,
    category_id,
    published_at
  )
  select
    'Workplace Role Based Survey',
    'Role based survey questions.',
    'draft',
    admin_user.id,
    seed_category.id,
    null
  from admin_user
  cross join seed_category
  where not exists (
    select 1 from surveys where title = 'Workplace Role Based Survey'
  )
  returning id
),
seed_survey as (
  select id from inserted_survey
  union
  select id from surveys where title = 'Workplace Role Based Survey'
),
page_rows (display_order, title, description) as (
  values
    (1, 'Page 1', null),
    (2, 'Engineering', 'Engineering Questions'),
    (3, 'Sales', null),
    (4, 'Operations', null),
    (5, 'General Section 1', null),
    (6, 'General Section 2', null),
    (7, 'General Section 3', null)
)
insert into survey_pages (
  survey_id,
  title,
  description,
  display_order
)
select
  seed_survey.id,
  page_rows.title,
  page_rows.description,
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
  select id from surveys where title = 'Workplace Role Based Survey'
),
question_rows (page_order, display_order, question_text, question_type, is_required, help_text) as (
  values
    (1, 1, 'How long have you worked at the company?', 'single_select', true, null),
    (1, 2, 'How satisfied are you with your current role?', 'scale', true, '1 = very dissatisfied, 5 = very satisfied.'),
    (1, 3, 'Which department do you work in?', 'single_select', true, null),
    (2, 1, 'How many years of engineering related experience do you have?', 'integer', true, 'Whole numbers: round up'),
    (2, 2, 'What is your primary engineering discipline?', 'single_select', true, 'Select one'),
    (2, 3, 'Do you currently hold a professional engineering license?', 'single_select', true, 'Select one'),
    (2, 4, 'Have you held a PE in the past?', 'single_select', true, 'Select one'),
    (2, 5, 'How often do you use engineering software?', 'single_select', true, 'Select one'),
    (3, 1, 'How many years of sales experience do you have?', 'integer', true, null),
    (3, 2, 'What industry do you primarily sell in?', 'single_select', true, 'Select one'),
    (3, 3, 'Have you met your sales quota this year?', 'single_select', true, 'Select one'),
    (3, 4, 'Why haven''t you met your sales quota this year?', 'text', true, 'Describe'),
    (3, 5, 'What percentage of your quota have you achieved?', 'integer', true, null),
    (4, 1, 'How many years of experience do you have in operations?', 'integer', true, null),
    (4, 2, 'Do you feel your team has the resources needed to perform effectively?', 'single_select', true, null),
    (4, 3, 'Please describe why.', 'text', true, null),
    (4, 4, 'How well do daily operations align with organizational goals?', 'single_select', true, 'Select one'),
    (5, 1, 'How many hours per week do you typically spend in meetings?', 'integer', true, null),
    (5, 2, 'What one change would most improve your day-to-day work?', 'text', false, null),
    (5, 3, 'Would you recommend the company as a place to work?', 'single_select', true, null),
    (6, 1, 'How would you rate your work-life balance?', 'scale', true, '1 = poor, 5 = excellent.'),
    (6, 2, 'Which benefits do you use regularly?', 'multi_select', true, 'Select every benefit that applies.'),
    (6, 3, 'Do you feel recognized for the work you do?', 'single_select', true, null),
    (7, 1, 'Any additional comments?', 'text', false, null)
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
join question_rows on true
join survey_pages
  on survey_pages.survey_id = seed_survey.id
  and survey_pages.display_order = question_rows.page_order
where not exists (
  select 1
  from survey_questions existing
  where existing.survey_id = seed_survey.id
    and existing.page_id = survey_pages.id
    and existing.display_order = question_rows.display_order
);

with seed_survey as (
  select id from surveys where title = 'Workplace Role Based Survey'
),
option_rows (page_order, question_order, display_order, option_text) as (
  values
    (1, 1, 1, 'Less than 1 year'),
    (1, 1, 2, '1 to 3 years'),
    (1, 1, 3, '3 to 5 years'),
    (1, 1, 4, 'More than 5 years'),
    (1, 2, 1, '1'),
    (1, 2, 2, '2'),
    (1, 2, 3, '3'),
    (1, 2, 4, '4'),
    (1, 2, 5, '5'),
    (1, 3, 1, 'Engineering'),
    (1, 3, 2, 'Sales'),
    (1, 3, 3, 'Operations'),
    (2, 2, 1, 'Civil'),
    (2, 2, 2, 'Mechanical'),
    (2, 2, 3, 'Electrical'),
    (2, 2, 4, 'Chemical'),
    (2, 3, 1, 'Yes'),
    (2, 3, 2, 'No'),
    (2, 4, 1, 'Yes'),
    (2, 4, 2, 'No'),
    (2, 5, 1, 'Never'),
    (2, 5, 2, 'Sometimes'),
    (2, 5, 3, 'Often'),
    (2, 5, 4, 'Daily'),
    (3, 2, 1, 'Vehicle'),
    (3, 2, 2, 'Pharmaceutical'),
    (3, 2, 3, 'Real Estate'),
    (3, 2, 4, 'Equipment'),
    (3, 3, 1, 'Yes'),
    (3, 3, 2, 'No'),
    (4, 2, 1, 'Yes'),
    (4, 2, 2, 'No'),
    (4, 4, 1, 'Perfectly'),
    (4, 4, 2, 'Well, but not perfect'),
    (4, 4, 3, 'Average'),
    (4, 4, 4, 'Poorly'),
    (4, 4, 5, 'Not at all'),
    (5, 3, 1, 'Yes'),
    (5, 3, 2, 'Maybe'),
    (5, 3, 3, 'No'),
    (6, 1, 1, '1'),
    (6, 1, 2, '2'),
    (6, 1, 3, '3'),
    (6, 1, 4, '4'),
    (6, 1, 5, '5'),
    (6, 2, 1, 'Health insurance'),
    (6, 2, 2, 'Retirement plan'),
    (6, 2, 3, 'Remote work stipend'),
    (6, 2, 4, 'Learning budget'),
    (6, 2, 5, 'Wellness program'),
    (6, 3, 1, 'Yes'),
    (6, 3, 2, 'Sometimes'),
    (6, 3, 3, 'No')
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
join survey_pages
  on survey_pages.survey_id = seed_survey.id
  and survey_pages.display_order = option_rows.page_order
join survey_questions
  on survey_questions.survey_id = seed_survey.id
  and survey_questions.page_id = survey_pages.id
  and survey_questions.display_order = option_rows.question_order
where not exists (
  select 1
  from answer_options existing
  where existing.question_id = survey_questions.id
    and existing.display_order = option_rows.display_order
);

with seed_survey as (
  select id from surveys where title = 'Workplace Role Based Survey'
),
tag_rows (page_order, question_order, option_order, tag_key, tag_value) as (
  values
    (1, 2, 1, 'quantity', 'a few'),
    (1, 2, 2, 'quantity', 'a few'),
    (1, 2, 3, 'quantity', 'average'),
    (1, 2, 4, 'quantity', 'many'),
    (1, 2, 5, 'quantity', 'many'),
    (1, 3, 1, 'area', 'engineering'),
    (1, 3, 2, 'area', 'sales'),
    (1, 3, 3, 'area', 'operations'),
    (2, 2, 1, 'engineering', 'civil'),
    (2, 2, 2, 'engineering', 'mechanical'),
    (2, 2, 3, 'engineering', 'electrical'),
    (2, 2, 4, 'engineering', 'chemical'),
    (2, 3, 1, 'compliance_result', 'complete'),
    (2, 3, 2, 'compliance_result', 'incomplete'),
    (2, 4, 1, 'compliance_result', 'in_progress'),
    (2, 4, 2, 'compliance_result', 'incomplete'),
    (2, 5, 1, 'quantity', 'none'),
    (2, 5, 2, 'quantity', 'a few'),
    (2, 5, 3, 'quantity', 'average'),
    (2, 5, 4, 'quantity', 'many'),
    (3, 2, 1, 'sales', 'cars'),
    (3, 2, 2, 'sales', 'pharmaceutical'),
    (3, 2, 3, 'sales', 'real estate'),
    (3, 2, 4, 'sales', 'equipment'),
    (3, 3, 1, 'compliance_result', 'complete'),
    (3, 3, 2, 'compliance_result', 'in_progress'),
    (4, 2, 1, 'compliance_result', 'complete'),
    (4, 2, 2, 'compliance_result', 'incomplete'),
    (4, 4, 1, 'compliance_result', 'complete'),
    (4, 4, 2, 'compliance_result', 'complete'),
    (4, 4, 3, 'compliance_result', 'in_progress'),
    (4, 4, 4, 'compliance_result', 'in_progress'),
    (4, 4, 5, 'compliance_result', 'incomplete'),
    (5, 3, 1, 'compliance_result', 'complete'),
    (5, 3, 2, 'compliance_result', 'in_progress'),
    (5, 3, 3, 'compliance_result', 'incomplete'),
    (6, 1, 1, 'quality', 'poor'),
    (6, 1, 2, 'quality', 'poor'),
    (6, 1, 3, 'quality', 'fair'),
    (6, 1, 4, 'quality', 'good'),
    (6, 1, 5, 'quality', 'perfect'),
    (6, 2, 1, 'benefits', 'health insurance'),
    (6, 2, 2, 'benefits', 'retirement'),
    (6, 2, 3, 'benefits', 'stipend'),
    (6, 2, 4, 'benefits', 'education'),
    (6, 2, 5, 'benefits', 'health'),
    (6, 3, 1, 'compliance_result', 'complete'),
    (6, 3, 2, 'compliance_result', 'in_progress'),
    (6, 3, 3, 'compliance_result', 'incomplete')
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
join survey_pages
  on survey_pages.survey_id = seed_survey.id
  and survey_pages.display_order = tag_rows.page_order
join survey_questions
  on survey_questions.survey_id = seed_survey.id
  and survey_questions.page_id = survey_pages.id
  and survey_questions.display_order = tag_rows.question_order
join answer_options
  on answer_options.question_id = survey_questions.id
  and answer_options.display_order = tag_rows.option_order
on conflict (answer_option_id, tag_key, tag_value) do nothing;

with seed_survey as (
  select id from surveys where title = 'Workplace Role Based Survey'
),
value_tag_rows (page_order, question_order, integer_min, integer_max, tag_key, tag_value) as (
  values
    (2, 1, 0, 0, 'quantity', 'none'),
    (2, 1, 1, 2, 'quantity', 'a few'),
    (2, 1, 3, 4, 'quantity', 'average'),
    (2, 1, 5, 100, 'quantity', 'many'),
    (3, 1, 0, 0, 'quantity', 'none'),
    (3, 1, 1, 3, 'quantity', 'a few'),
    (3, 1, 4, 6, 'quantity', 'average'),
    (3, 1, 7, 100, 'quantity', 'many'),
    (3, 4, null, null, 'compliance_result', 'in_progress'),
    (3, 5, 0, 0, 'compliance_result', 'incomplete'),
    (3, 5, 1, 99, 'compliance_result', 'in_progress'),
    (3, 5, 100, 100, 'compliance_result', 'complete'),
    (4, 1, 0, 0, 'quantity', 'none'),
    (4, 1, 1, 3, 'quantity', 'a few'),
    (4, 1, 4, 6, 'quantity', 'average'),
    (4, 1, 7, 100, 'quantity', 'many'),
    (4, 3, null, null, 'compliance_result', 'in_progress'),
    (5, 1, 0, 0, 'quantity', 'none'),
    (5, 1, 1, 39, 'quantity', 'a few'),
    (5, 1, 40, 40, 'quantity', 'average'),
    (5, 1, 41, 100, 'quantity', 'many'),
    (5, 2, null, null, 'compliance_result', 'complete'),
    (7, 1, null, null, 'compliance_result', 'complete')
)
insert into question_value_tags (
  question_id,
  integer_min,
  integer_max,
  tag_key,
  tag_value
)
select
  survey_questions.id,
  value_tag_rows.integer_min,
  value_tag_rows.integer_max,
  value_tag_rows.tag_key,
  value_tag_rows.tag_value
from value_tag_rows
join seed_survey on true
join survey_pages
  on survey_pages.survey_id = seed_survey.id
  and survey_pages.display_order = value_tag_rows.page_order
join survey_questions
  on survey_questions.survey_id = seed_survey.id
  and survey_questions.page_id = survey_pages.id
  and survey_questions.display_order = value_tag_rows.question_order
where not exists (
  select 1
  from question_value_tags existing
  where existing.question_id = survey_questions.id
    and existing.integer_min is not distinct from value_tag_rows.integer_min
    and existing.integer_max is not distinct from value_tag_rows.integer_max
    and existing.tag_key = value_tag_rows.tag_key
    and existing.tag_value = value_tag_rows.tag_value
);

-- The reusable tag catalog (tag_definitions) is seeded from the production
-- snapshot in 0004_tag_catalog_seed.sql, not from this survey's local test
-- tags. The answer_tags and question_value_tags above stay on the seeded
-- options for runner and reporting tests; they are intentionally not
-- registered in the catalog.
