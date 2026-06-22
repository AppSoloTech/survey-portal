alter table anonymous_survey_links
  drop constraint if exists anonymous_survey_links_public_token_check;

alter table anonymous_survey_links
  add constraint anonymous_survey_links_public_token_check check (
    public_token is null
    or public_token like 'asl.%'
    or public_token like 'enc:v1:%'
  );
