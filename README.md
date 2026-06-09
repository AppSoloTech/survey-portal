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
npm run dev
```

The API serves `/api/health`. In development, Vite proxies API calls to the Express server.

## Environment

Use `RUN_ENV=dev` for local database usage and `RUN_ENV=prod` for hosted database usage. When `RUN_ENV=prod`, `NODE_ENV` must be `production`.

Production PostgreSQL TLS verifies certificates by default. If the hosted database requires a custom CA, provide either `DATABASE_SSL_CA_PATH` or `DATABASE_SSL_CA` through the runtime environment.

Production secrets should live in Azure App Service configuration, not in source control.

## Scripts

```bash
npm run dev
npm run typecheck
npm run build
npm run lint
npm run start
```
