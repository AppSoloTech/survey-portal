create table if not exists tag_definitions (
  id integer generated always as identity primary key,
  tag_key text not null,
  tag_value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tag_definitions_key_value_unique unique (tag_key, tag_value)
);

insert into tag_definitions (tag_key, tag_value)
select distinct tag_key, tag_value
from answer_tags
on conflict (tag_key, tag_value) do nothing;
