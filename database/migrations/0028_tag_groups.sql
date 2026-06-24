create table if not exists tag_groups (
  id integer generated always as identity primary key,
  name text not null,
  display_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tag_groups_name_unique unique (name),
  constraint tag_groups_display_order_positive check (display_order > 0)
);

alter table tag_definitions
  add column if not exists group_id integer references tag_groups(id) on delete set null,
  add column if not exists display_order integer;

with ordered_tags as (
  select
    id,
    row_number() over (order by tag_key, tag_value, id)::integer as next_display_order
  from tag_definitions
  where display_order is null
)
update tag_definitions
set display_order = ordered_tags.next_display_order
from ordered_tags
where tag_definitions.id = ordered_tags.id;

alter table tag_definitions
  alter column display_order set not null;

alter table tag_definitions
  add constraint tag_definitions_display_order_positive check (display_order > 0);

create index if not exists tag_groups_display_order_idx
  on tag_groups (display_order, id);

create index if not exists tag_definitions_group_order_idx
  on tag_definitions (group_id, display_order, id);
