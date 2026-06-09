# Database

Database changes should be made through explicit, ordered migrations.

Current migrations include:

- a small health-check table
- the initial authentication `users` table
- the Phase 2 survey data model tables for surveys, questions, options, tags, rules,
  attempts, responses, and selected response options

## Folders

- `migrations/` contains ordered SQL migration files.
- `seeds/` contains safe local seed data only.

## Local Connection

The API accepts either:

- `DATABASE_URL` or `LOCAL_DATABASE_URL`
- split local variables: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`

Use `RUN_ENV=dev` for local database access and `RUN_ENV=prod` for hosted database access.

## Applying Migrations

Apply migrations in filename order:

```bash
psql "$DATABASE_URL" -f database/migrations/0001_app_health_check.sql
psql "$DATABASE_URL" -f database/migrations/0002_users.sql
psql "$DATABASE_URL" -f database/migrations/0003_surveys.sql
```

## Applying Local Seeds

Phase 2 local seed data includes one admin account and one published survey with
representative MVP question types, answer tags, and a `JUMP_TO_QUESTION` rule.

```bash
psql "$DATABASE_URL" -f database/seeds/0001_phase_2_seed.sql
```
