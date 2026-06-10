begin;

alter table survey_questions
  drop constraint if exists survey_questions_type_check;

alter table survey_questions
  add constraint survey_questions_type_check check (
    question_type in ('text', 'integer', 'single_select', 'multi_select', 'scale')
  );

commit;
