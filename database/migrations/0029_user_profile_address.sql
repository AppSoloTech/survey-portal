alter table user_profiles
  add column if not exists address_street text,
  add column if not exists address_city text,
  add column if not exists address_state text;

alter table user_profiles
  add constraint user_profiles_address_street_length_check check (
    address_street is null or char_length(address_street) <= 160
  ),
  add constraint user_profiles_address_city_length_check check (
    address_city is null or char_length(address_city) <= 80
  ),
  add constraint user_profiles_address_state_length_check check (
    address_state is null or char_length(address_state) <= 80
  );
