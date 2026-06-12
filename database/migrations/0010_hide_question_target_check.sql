-- Skip rules (HIDE_QUESTION) now execute at runtime, so they need a target
-- question just like jumps. Extend the target check to cover both action
-- types. Existing rows are unaffected: the API has only ever written
-- JUMP_TO_QUESTION rules, which already satisfy the constraint.
alter table conditional_logic_rules
  drop constraint conditional_logic_rules_jump_to_question_target_check;

alter table conditional_logic_rules
  add constraint conditional_logic_rules_jump_to_question_target_check check (
    action_type not in ('JUMP_TO_QUESTION', 'HIDE_QUESTION') or target_question_id is not null
  );
