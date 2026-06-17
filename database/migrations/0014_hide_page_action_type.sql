-- Skip page (HIDE_PAGE) rules hide an entire later page per attempt when the
-- source answer matches, the page-level analogue of HIDE_QUESTION. Allow the
-- new action type and require it to carry a target page (and no target
-- question), mirroring JUMP_TO_PAGE. Existing rows are unaffected.
alter table conditional_logic_rules
  drop constraint conditional_logic_rules_action_type_check;

alter table conditional_logic_rules
  add constraint conditional_logic_rules_action_type_check check (
    action_type in (
      'JUMP_TO_QUESTION',
      'JUMP_TO_PAGE',
      'SHOW_QUESTION',
      'HIDE_QUESTION',
      'HIDE_PAGE',
      'END_SURVEY'
    )
  );

alter table conditional_logic_rules
  drop constraint conditional_logic_rules_target_check;

alter table conditional_logic_rules
  add constraint conditional_logic_rules_target_check check (
    (
      action_type in ('JUMP_TO_QUESTION', 'HIDE_QUESTION')
      and target_question_id is not null
      and target_page_id is null
    )
    or (
      action_type in ('JUMP_TO_PAGE', 'HIDE_PAGE')
      and target_page_id is not null
      and target_question_id is null
    )
    or (
      action_type in ('SHOW_QUESTION', 'END_SURVEY')
    )
  );
