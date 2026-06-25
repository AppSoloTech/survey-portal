-- Tag Catalog Seed (0004)
--
-- Mirrors the grouped tag catalog from the production database as of
-- 2026-06-25: 8 category groups and 63 tag definitions.
-- See markdown/TAG_CATALOG_SEED.md for how this snapshot was produced and how
-- to refresh it. Applied automatically by npm run db:reset after migrations,
-- in database/seeds filename order.
--
-- Idempotent: groups upsert by name, tag definitions upsert by
-- (tag_key, tag_value), and each tag is (re)assigned to its group with a
-- stable per-group display order so reseeding never duplicates or drifts.

-- Category groups, ordered as in production.
insert into tag_groups (name, display_order) values
  ('Equity', 1),
  ('Federal Civil Rights', 2),
  ('HCBS', 3),
  ('Health, Safety, and Cost', 4),
  ('Labor and Workforce', 5),
  ('Medicaid / 1115 Waiver', 6),
  ('NJDDD Administrative Practice', 7),
  ('OPIA/administrative accountability', 8)
on conflict (name) do update set
  display_order = excluded.display_order,
  updated_at = now();

-- Tag definitions, each carrying its category group name and per-group order.
with catalog (tag_key, tag_value, group_name, display_order) as (
  values
    ('Equity', 'All', 'Equity', 1),
    ('Equity', 'Complex-care disparity', 'Equity', 2),
    ('Equity', 'Cultural access barrier', 'Equity', 3),
    ('Equity', 'Disability access barrier', 'Equity', 4),
    ('Equity', 'Income/housing disparity', 'Equity', 5),
    ('Equity', 'Language access barrier', 'Equity', 6),
    ('Equity', 'Race/ethnicity disparity', 'Equity', 7),
    ('Equity', 'Rural/urban workforce disparity', 'Equity', 8),
    ('Federal Civil Rights', 'ADA', 'Federal Civil Rights', 1),
    ('Federal Civil Rights', 'Civil rights enforcement', 'Federal Civil Rights', 2),
    ('Federal Civil Rights', 'CR-Final Settings Rule', 'Federal Civil Rights', 3),
    ('Federal Civil Rights', 'Olmstead', 'Federal Civil Rights', 4),
    ('Federal Civil Rights', 'Retaliation/chilling effect concern', 'Federal Civil Rights', 5),
    ('Federal Civil Rights', 'Section 504', 'Federal Civil Rights', 6),
    ('HCBS', '1115 waiver Appendix F', 'HCBS', 1),
    ('HCBS', 'Access Rule', 'HCBS', 2),
    ('HCBS', 'All', 'HCBS', 3),
    ('HCBS', 'Discouragement', 'HCBS', 4),
    ('HCBS', 'Failure to document setting/provider options', 'HCBS', 5),
    ('HCBS', 'Failure to fund self-directed services', 'HCBS', 6),
    ('HCBS', 'HCBS-Final Settings Rule', 'HCBS', 7),
    ('HCBS', 'Informed choice failure', 'HCBS', 8),
    ('HCBS', 'Lack of informed consent', 'HCBS', 9),
    ('HCBS', 'Person-centered planning failure', 'HCBS', 10),
    ('HCBS', 'Quality Measure Set', 'HCBS', 11),
    ('Health, Safety, and Cost', 'All', 'Health, Safety, and Cost', 1),
    ('Health, Safety, and Cost', 'Behavioral/psychiatric crisis', 'Health, Safety, and Cost', 2),
    ('Health, Safety, and Cost', 'Caregiver burnout', 'Health, Safety, and Cost', 3),
    ('Health, Safety, and Cost', 'ER/hospitalization', 'Health, Safety, and Cost', 4),
    ('Health, Safety, and Cost', 'Increased public cost', 'Health, Safety, and Cost', 5),
    ('Health, Safety, and Cost', 'Institutional placement', 'Health, Safety, and Cost', 6),
    ('Health, Safety, and Cost', 'Life-threatening incident', 'Health, Safety, and Cost', 7),
    ('Health, Safety, and Cost', 'Medical deterioration', 'Health, Safety, and Cost', 8),
    ('Health, Safety, and Cost', 'Preventable crisis', 'Health, Safety, and Cost', 9),
    ('Health, Safety, and Cost', 'Risk of institutionalization', 'Health, Safety, and Cost', 10),
    ('Labor and Workforce', '1115 Waiver', 'Labor and Workforce', 1),
    ('Labor and Workforce', 'All', 'Labor and Workforce', 2),
    ('Labor and Workforce', 'Employer Authority-1115 Waiver', 'Labor and Workforce', 3),
    ('Labor and Workforce', 'NJ Labor Laws', 'Labor and Workforce', 4),
    ('Labor and Workforce', 'NJ Labor Laws + employer authority-1115 waiver', 'Labor and Workforce', 5),
    ('Medicaid / 1115 Waiver', 'Access to care concern', 'Medicaid / 1115 Waiver', 1),
    ('Medicaid / 1115 Waiver', 'All', 'Medicaid / 1115 Waiver', 2),
    ('Medicaid / 1115 Waiver', 'Budget authority restriction', 'Medicaid / 1115 Waiver', 3),
    ('Medicaid / 1115 Waiver', 'Due process concern', 'Medicaid / 1115 Waiver', 4),
    ('Medicaid / 1115 Waiver', 'Grievance concern', 'Medicaid / 1115 Waiver', 5),
    ('Medicaid / 1115 Waiver', 'Medical necessity concern', 'Medicaid / 1115 Waiver', 6),
    ('Medicaid / 1115 Waiver', 'Notice/appeal concern', 'Medicaid / 1115 Waiver', 7),
    ('Medicaid / 1115 Waiver', 'Provider capacity concern', 'Medicaid / 1115 Waiver', 8),
    ('Medicaid / 1115 Waiver', 'Quality monitoring concern', 'Medicaid / 1115 Waiver', 9),
    ('Medicaid / 1115 Waiver', 'Service interruption', 'Medicaid / 1115 Waiver', 10),
    ('Medicaid / 1115 Waiver', 'Waiver implementation failure', 'Medicaid / 1115 Waiver', 11),
    ('NJDDD Administrative Practice', 'Agency pressure', 'NJDDD Administrative Practice', 1),
    ('NJDDD Administrative Practice', 'All', 'NJDDD Administrative Practice', 2),
    ('NJDDD Administrative Practice', 'DDD nonresponse', 'NJDDD Administrative Practice', 3),
    ('NJDDD Administrative Practice', 'Excessive documentation burden', 'NJDDD Administrative Practice', 4),
    ('NJDDD Administrative Practice', 'Fiscal intermediary delay', 'NJDDD Administrative Practice', 5),
    ('NJDDD Administrative Practice', 'Goods and services denial', 'NJDDD Administrative Practice', 6),
    ('NJDDD Administrative Practice', 'Provider steering', 'NJDDD Administrative Practice', 7),
    ('NJDDD Administrative Practice', 'Support Coordinator failure', 'NJDDD Administrative Practice', 8),
    ('NJDDD Administrative Practice', 'Technical assistance failure', 'NJDDD Administrative Practice', 9),
    ('NJDDD Administrative Practice', 'Training failure', 'NJDDD Administrative Practice', 10),
    ('NJDDD Administrative Practice', 'Vendor approval delay', 'NJDDD Administrative Practice', 11),
    ('OPIA/administrative accountability', 'OPIA/administrative accountability', 'OPIA/administrative accountability', 1)
)
insert into tag_definitions (tag_key, tag_value, group_id, display_order)
select catalog.tag_key, catalog.tag_value, tag_groups.id, catalog.display_order
from catalog
join tag_groups on tag_groups.name = catalog.group_name
on conflict (tag_key, tag_value) do update set
  group_id = excluded.group_id,
  display_order = excluded.display_order,
  updated_at = now();
