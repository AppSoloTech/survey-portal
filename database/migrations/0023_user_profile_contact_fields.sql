alter table user_profiles
  add column if not exists contact_number text,
  add column if not exists preferred_contact_method text,
  add column if not exists contact_notes text;

alter table user_profiles
  add constraint user_profiles_contact_number_length_check check (
    contact_number is null or char_length(contact_number) <= 120
  ),
  add constraint user_profiles_preferred_contact_method_length_check check (
    preferred_contact_method is null or char_length(preferred_contact_method) <= 120
  ),
  add constraint user_profiles_contact_notes_length_check check (
    contact_notes is null or char_length(contact_notes) <= 120
  );
