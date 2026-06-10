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
npm run start
```
