alter table surveys add column if not exists deleted_at timestamptz;

create index if not exists surveys_deleted_at_idx on surveys (deleted_at);
