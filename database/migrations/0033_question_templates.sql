alter table survey_templates
  add column if not exists source_question_title text;

alter table survey_templates
  drop constraint if exists survey_templates_kind_check;

alter table survey_templates
  add constraint survey_templates_kind_check
    check (template_kind in ('page', 'question'));
