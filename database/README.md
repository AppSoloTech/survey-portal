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

## Shipping Database Changes To The Hosted (Azure) Database

The change process is migration-file driven:

1. Make every schema or data change as a new numbered file in
   `database/migrations/` (never edit an applied file — checksums are
   validated and the runner refuses drifted history).
2. Apply and test locally with `npm run db:migrate` (or `npm run db:reset`).
3. Commit the migration file together with the code that depends on it.
4. Ship with one of the flows below.

The hosted migrator reads its connection settings **only** from `.env.prod`
at the repository root (copy `.env.prod.example`, fill in the Azure values).
It never reads `.env` or shell variables, so local development settings can
never redirect a production migration at the wrong database. TLS with
certificate verification is always on, and local hosts are refused.

```bash
npm run db:status:hosted    # read-only: applied vs pending, drift check
npm run db:migrate:hosted   # apply pending migrations (asks to confirm)
npm run deploy              # push main (triggers Azure deploy) + migrate, together
```

- **Code and database together:** `npm run deploy` — refuses non-main
  branches, dirty trees, and unpulled upstream commits; pushes `main`
  (which kicks off the GitHub Actions build and Azure deploy), then runs
  the hosted migrator. Add `-- --yes` to skip the confirmation prompt.
- **Code only:** `git push origin main`.
- **Database only:** `npm run db:migrate:hosted`.

Ordering is safe in either direction as long as migrations stay additive
and backward-compatible with the previous app release (the convention in
this repository): old code must run against the new schema and new code
against the old schema for the brief deploy window.

The status command doubles as drift detection: it fails loudly if the
hosted `schema_migrations` history does not exactly match the local file
order and checksums.

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
