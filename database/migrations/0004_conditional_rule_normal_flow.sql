alter table conditional_logic_rules
  add column if not exists skip_target_in_normal_flow boolean not null default true;
