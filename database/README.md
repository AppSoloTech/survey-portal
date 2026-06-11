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

## Connection

The API, migration runner, and admin provisioning accept either:

- a connection string: `DATABASE_URL` or `LOCAL_DATABASE_URL` (dev), or
  `HOSTED_DATABASE_URL`/`DATABASE_URL` (prod)
- split variables: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
  (user and password are URL-encoded automatically)

Connection strings win when both forms are set. Use `RUN_ENV=dev` for local
database access and `RUN_ENV=prod` for hosted database access.

## Applying Migrations

Apply pending migrations with the tracked runner:

```bash
npm run db:migrate
```

The runner records applied filenames and checksums in `schema_migrations`.
For an already-migrated database that predates the runner, use
`npm run db:migrate -- --baseline` only after verifying the schema manually.

## Applying Local Seeds

Phase 2 local seed data includes one admin account and one published survey with
representative MVP question types, answer tags, and a `JUMP_TO_QUESTION` rule.

```bash
npm run db:reset
```

Do not run seed files directly with `psql -f`. The local seed creates a known
development admin password and cannot enforce runtime environment guards by
itself.

## Resetting A Local Database

Use this only against a disposable local development database:

```bash
npm run db:reset
```

The reset job:

- loads `.env` from the repository root when present
- requires `RUN_ENV=dev`
- refuses hosted database URLs
- refuses non-local database hosts unless `DB_RESET_ALLOW_NONLOCAL=1` is set
- drops and recreates the `public` schema
- runs the tracked migration runner
- applies every SQL file in `database/seeds/` in filename order
