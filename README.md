# Survey Portal

Secure full-stack survey portal MVP.

## Stack

- React + TypeScript frontend
- Node.js + Express + TypeScript backend
- PostgreSQL database
- npm workspaces

## Project Structure

```txt
apps/
  api/      Express API and production static server
  web/      React frontend
packages/
  shared/   Shared TypeScript types
database/
  migrations/
  seeds/
```

## Local Setup

```bash
npm install
cp .env.example .env
psql "$DATABASE_URL" -f database/migrations/0001_app_health_check.sql
psql "$DATABASE_URL" -f database/migrations/0002_users.sql
psql "$DATABASE_URL" -f database/migrations/0003_surveys.sql
psql "$DATABASE_URL" -f database/seeds/0001_phase_2_seed.sql
npm run dev
```

The seed command is for local development only. Do not apply local seed files
to hosted, shared, staging, or production databases.

To wipe and rebuild a messy local database:

```bash
npm run db:reset
```

This drops and recreates the local `public` schema, then applies all SQL files
under `database/migrations/` and `database/seeds/` in filename order. It refuses
to run unless `RUN_ENV=dev` and the target database host is local.

The API serves `/api/health`, `/api/auth/*`, and `/api/surveys/*`. In development, Vite proxies API calls to the Express server.

## Environment

Use `RUN_ENV=dev` for local database usage and `RUN_ENV=prod` for hosted database usage. When `RUN_ENV=prod`, `NODE_ENV` must be `production`.

Production PostgreSQL TLS verifies certificates by default. If the hosted database requires a custom CA, provide either `DATABASE_SSL_CA_PATH` or `DATABASE_SSL_CA` through the runtime environment.

Set `JWT_SECRET` to a non-placeholder secret for any shared, hosted, or production environment. `JWT_EXPIRES_IN` defaults to one hour when omitted.

Production secrets should live in Azure App Service configuration, not in source control.

## Scripts

```bash
npm run dev
npm run db:reset
npm run typecheck
npm run build
npm run lint
npm run test
npm run start
```

## Testing

Automated tests use Vitest in every workspace. Shared and web tests are pure
unit tests; API tests run real Express routes with supertest against a
dedicated local PostgreSQL test database.

One-time setup for the API test database:

```bash
psql "postgresql://postgres:postgres@localhost:5432/postgres" -c "create database survey_portal_test"
```

Then run everything from the repository root:

```bash
npm test
```

Test database safety rules:

- API tests read `TEST_DATABASE_URL` (defaults to
  `postgresql://postgres:postgres@localhost:5432/survey_portal_test`).
- The harness refuses to run unless the database name contains `test`, and it
  never falls back to `DATABASE_URL`, `LOCAL_DATABASE_URL`, or
  `HOSTED_DATABASE_URL`.
- Each `npm test -w apps/api` run drops and recreates the test schema, applies
  every migration in `database/migrations/`, and truncates all tables between
  tests. Never point `TEST_DATABASE_URL` at a database whose data you care
  about.

Always run API tests through `npm test` (or `npm test -w apps/api`). Running a
bare `vitest` from the repository root executes every workspace's test files
in parallel against the single test database and causes spurious failures.
