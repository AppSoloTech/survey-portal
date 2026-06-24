alter table anonymous_survey_links
  add column if not exists listed_in_public_directory boolean not null default false;

create index if not exists anonymous_survey_links_public_directory_idx
  on anonymous_survey_links (listed_in_public_directory, enabled, expires_at, survey_id)
  where listed_in_public_directory = true;
