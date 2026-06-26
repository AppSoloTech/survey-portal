create table if not exists tag_catalog_settings (
  id boolean primary key default true,
  ungrouped_display_order integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint tag_catalog_settings_singleton check (id),
  constraint tag_catalog_settings_ungrouped_order_positive check (ungrouped_display_order > 0)
);

insert into tag_catalog_settings (id, ungrouped_display_order)
values (true, 1)
on conflict (id) do nothing;
