begin;

alter table conditional_logic_rules
  alter column source_answer_option_id drop not null;

alter table conditional_logic_rules
  drop constraint if exists conditional_logic_rules_condition_operator_check;

alter table conditional_logic_rules
  add constraint conditional_logic_rules_condition_operator_check check (
    condition_operator in ('equals', 'is_blank')
  );

commit;
