alter table survey_attempts
  add column if not exists anonymous_contact_email text;

alter table survey_attempts
  drop constraint if exists survey_attempts_anonymous_contact_email_check;

alter table survey_attempts
  add constraint survey_attempts_anonymous_contact_email_check check (
    anonymous_contact_email is null
    or (
      user_id is null
      and anonymous_link_id is not null
      and length(anonymous_contact_email) <= 320
      and anonymous_contact_email = lower(anonymous_contact_email)
      and anonymous_contact_email like '%@%'
    )
  );
