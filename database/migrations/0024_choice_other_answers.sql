alter table survey_questions
  add column if not exists allow_other boolean not null default false;

alter table survey_questions
  drop constraint if exists survey_questions_allow_other_choice_type_check;

alter table survey_questions
  add constraint survey_questions_allow_other_choice_type_check check (
    allow_other = false
    or question_type in ('single_select', 'multi_select')
  );

alter table survey_response_answers
  add column if not exists other_text text;

alter table survey_response_answers
  drop constraint if exists survey_response_answers_other_text_length_check;

alter table survey_response_answers
  add constraint survey_response_answers_other_text_length_check check (
    other_text is null
    or (
      char_length(other_text) <= 240
      and char_length(trim(other_text)) > 0
    )
  );
