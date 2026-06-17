-- Skip-page (HIDE_PAGE) rules can optionally advance the participant the moment
-- their trigger fires: the rest of the trigger's page is left unanswered and the
-- runtime jumps straight past the skipped page(s) to the next visible page, like
-- a page jump. The default (false) preserves the existing behavior — finish the
-- current page first, then skip the targeted page. Only HIDE_PAGE rules may set
-- the flag.
alter table conditional_logic_rules
  add column if not exists advance_on_trigger boolean not null default false;

alter table conditional_logic_rules
  add constraint conditional_logic_rules_advance_on_trigger_check check (
    not advance_on_trigger or action_type = 'HIDE_PAGE'
  );
