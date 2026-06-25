alter table users
add column if not exists session_version integer not null default 0;

alter table users
add constraint users_session_version_nonnegative check (session_version >= 0);
