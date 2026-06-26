create table if not exists glossary_entries (
  id integer generated always as identity primary key,
  canonical_term text not null,
  definition text not null,
  is_enabled boolean not null default true,
  definition_source text not null default 'manual',
  source_provider text,
  source_reference text,
  source_lookup_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint glossary_entries_canonical_term_length check (
    char_length(btrim(canonical_term)) between 1 and 120
  ),
  constraint glossary_entries_definition_length check (
    char_length(btrim(definition)) between 1 and 1200
  ),
  constraint glossary_entries_definition_source_check check (
    definition_source in ('manual', 'dictionary_suggested')
  ),
  constraint glossary_entries_source_provider_length check (
    source_provider is null or char_length(btrim(source_provider)) between 1 and 80
  ),
  constraint glossary_entries_source_reference_length check (
    source_reference is null or char_length(btrim(source_reference)) <= 240
  )
);

create table if not exists glossary_match_strings (
  id integer generated always as identity primary key,
  glossary_entry_id integer not null references glossary_entries(id) on delete cascade,
  match_text text not null,
  normalized_match_text text generated always as (lower(btrim(match_text))) stored,
  is_canonical boolean not null default false,
  display_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint glossary_match_strings_text_length check (
    char_length(btrim(match_text)) between 1 and 120
  ),
  constraint glossary_match_strings_display_order_positive check (display_order > 0)
);

create unique index if not exists glossary_match_strings_normalized_active_unique
  on glossary_match_strings (normalized_match_text)
  where deleted_at is null;

create unique index if not exists glossary_match_strings_canonical_active_unique
  on glossary_match_strings (glossary_entry_id)
  where is_canonical and deleted_at is null;

create index if not exists glossary_entries_active_enabled_idx
  on glossary_entries (is_enabled, lower(canonical_term), id)
  where deleted_at is null;

create index if not exists glossary_match_strings_entry_order_idx
  on glossary_match_strings (glossary_entry_id, display_order, id)
  where deleted_at is null;
