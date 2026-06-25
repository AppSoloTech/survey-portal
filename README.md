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
npm run db:migrate
npm run dev
```

To load the local development admin and sample survey, use the guarded reset
command below against a disposable local database. Do not apply local seed files
directly with `psql -f`; raw SQL seed files cannot inspect `RUN_ENV` and must
not be run against hosted, shared, staging, or production databases.

To wipe and rebuild a messy local database:

```bash
npm run db:reset
```

This drops and recreates the local `public` schema, runs the tracked migration
runner, then applies local seed SQL in filename order. It refuses to run unless
`RUN_ENV=dev` and the target database host is local.

The API serves `/api/health`, `/api/health/live`, `/api/health/ready`,
`/api/auth/*`, `/api/surveys/*`, `/api/my-surveys/*`, `/api/admin/*`,
`/api/categories/*`, and `/api/tags/*`. In development, Vite proxies API calls
to the Express server.

## Environment

Use `RUN_ENV=dev` for local database usage and `RUN_ENV=prod` for hosted database usage. When `RUN_ENV=prod`, `NODE_ENV` must be `production`.

Production PostgreSQL TLS verifies certificates by default. If the hosted database requires a custom CA, provide either `DATABASE_SSL_CA_PATH` or `DATABASE_SSL_CA` through the runtime environment.

Set `JWT_SECRET` to a non-placeholder secret for any shared, hosted, or production environment. `JWT_EXPIRES_IN` defaults to one hour when omitted.

Authentication endpoints are rate limited per client IP in memory:

- `POST /api/auth/login`: 5 requests per 15 minutes by default.
- `POST /api/auth/register`: 5 requests per 15 minutes by default.

Override with `AUTH_RATE_LIMIT_WINDOW_MS`, `AUTH_LOGIN_RATE_LIMIT_MAX`, and
`AUTH_REGISTER_RATE_LIMIT_MAX` when needed. Azure App Service should run with
`TRUST_PROXY_HOPS=1` so Express trusts the single Azure proxy hop for client IP
resolution. Do not set blanket proxy trust; spoofed `X-Forwarded-For` headers
must not bypass auth rate limiting. If the API ever scales horizontally, replace
the in-memory limiter store with a shared store.

Production secrets should live in Azure App Service configuration, not in source control.

## Release Notes

The root `package.json` version is the deployed app version. Production-bound
changes should include a matching release file in `markdown/releases/`.

Create the current version's release-note template:

```bash
npm run release:notes
```

Validate release-note format and version coverage:

```bash
npm run release:check
```

Admins can view published release notes in the app at `/admin/releases`.

## Health Checks

- `GET /api/health/live` returns 200 when the Node process is up and does not
  touch PostgreSQL.
- `GET /api/health/ready` returns 200 only when the database readiness check
  succeeds and 503 when it fails.
- `GET /api/health` is kept for existing consumers and aliases readiness.

Readiness queries `app_health_check`, so it verifies both PostgreSQL reachability
and the presence of the migrated schema.

## Database Migrations

Run pending migrations with:

```bash
npm run db:migrate
```

The runner applies `database/migrations/*.sql` in filename order, records each
file and checksum in `schema_migrations`, and no-ops when everything is current.
If an existing already-migrated database predates `schema_migrations`, explicitly
record the current files without applying SQL:

```bash
npm run db:migrate -- --baseline
```

Use the baseline path only after verifying that the target database already has
the schema represented by the migration files. The runner refuses to infer this
from a populated database.

## Admin Provisioning

Hosted environments must create the first admin with the provisioning command,
not the local seed:

```bash
ADMIN_FIRST_NAME=Phase \
ADMIN_LAST_NAME=Admin \
ADMIN_EMAIL=admin@example.com \
ADMIN_PASSWORD='replace-with-a-secret-password' \
npm run admin:provision
```

The command hashes the password with bcrypt, creates the admin or promotes an
existing user, and is safe to rerun. It never logs the password or hash.

## Scripts

```bash
npm run dev
npm run admin:provision
npm run db:migrate
npm run db:reset
npm run release:notes
npm run release:check
npm run typecheck
npm run build
npm run lint
npm run test
npm run deploy
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
