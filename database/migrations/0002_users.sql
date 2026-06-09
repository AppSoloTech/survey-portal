create table if not exists users (
  id integer generated always as identity primary key,
  first_name text not null,
  last_name text not null,
  email text not null,
  password_hash text not null,
  role text not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_email_unique unique (email),
  constraint users_role_check check (role in ('user', 'admin'))
);

create index if not exists users_role_idx on users (role);
