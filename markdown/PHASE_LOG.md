# Phase Log

This file is durable project memory. Add a new entry after each implementation phase, review, and fix cycle.

Use `markdown/PHASE_TEMPLATE.md` for phase entries.

---

## Baseline — Documentation Audit

Date:
2026-06-08

Status:
Completed

Scope:
Reusable workflow documentation baseline before application scaffolding.

Decisions:

- `prompts/MASTER_PRODUCT_CONTEXT.txt` is the product source of truth.
- `markdown/ARCHITECTURE_PRINCIPLES.md` is the architecture source of truth.
- `markdown/DATA_MODEL_VISION.md` is durable data-model guidance, subordinate to product and architecture decisions.
- `markdown/GLOBAL_DEVELOPMENT_ENVIRONMENT.txt` records local and Azure environment assumptions.
- `prompts/` holds phase prompts only; durable product and environment context lives in `markdown/`.
- `notes/` will hold phase-specific Claude handoffs and review outputs.
- Azure App Service and Azure PostgreSQL Flexible Server are the MVP deployment targets.

Open items for Phase 0:

- choose and document exact Node.js and npm versions
- decide database migration tooling
- decide frontend build tooling
- verify the active `.env` remains ignored and contains no production secrets

Validation:

- Documentation consistency scan performed.
- `.env.example` created with placeholder-only local development values.
- No application code exists yet, so typecheck/build/runtime validation is not applicable.

---

## Phase 0 — Project Foundation and Scaffolding

Date:
2026-06-08

Status:
Completed

Prompt:
`prompts/prompt_0.txt`

Git Commit:
Pending

Review Artifacts:
- Codex handoff: `notes/claude_handoff_phase_0.txt`
- Claude review: `notes/claude_review_phase_0.txt`

## Goals

- Create a full-stack TypeScript project foundation.
- Add React frontend, Express backend, shared types, database scaffolding, and root scripts.
- Support local and hosted PostgreSQL configuration without committing secrets.

## Built

- npm workspace structure with `apps/web`, `apps/api`, and `packages/shared`.
- React + Vite application shell with placeholder routes for Home, Login, Register, User Dashboard, Admin Dashboard, and Not Found.
- Express API with `/api/health`, request logging, error handling, JSON parsing, optional development CORS, and production static serving.
- PostgreSQL connection module using `pg`.
- `RUN_ENV` database selection supporting local split DB variables, local database URL, hosted database URL, or `DATABASE_URL`.
- Minimal shared types for user roles, survey attempt statuses, and health responses.
- Database folders with an initial `app_health_check` migration and seed guidance.
- Root TypeScript, ESLint, npm workspace scripts, `.nvmrc`, `.env.example`, and README setup notes.

## Important Decisions

### Workspace Structure

Decision:
Use npm workspaces with separate `apps/web`, `apps/api`, and `packages/shared` folders.

Reason:
Keeps frontend, backend, and shared contracts separated while preserving a simple modular monolith.

Tradeoff:
More package files than a single-folder app, but clearer ownership boundaries.

### Frontend Build Tool

Decision:
Use Vite for the React frontend.

Reason:
Vite gives a small, conventional React + TypeScript setup with fast local development and simple production builds.

Tradeoff:
Adds a frontend-specific build tool, but avoids custom bundling.

### Database Configuration

Decision:
Use `RUN_ENV=dev` and `RUN_ENV=prod` to select local or hosted database configuration.

Reason:
Matches the phase prompt and allows local split variables while keeping Azure-hosted secrets external.

Tradeoff:
The app has a small configuration helper now, but it prevents environment-specific branching throughout the codebase.

## Architecture Notes

- Database/schema impact: only a minimal `app_health_check` migration was added; survey schema is deferred.
- API contract impact: `/api/health` returns app, environment, timestamp, and database status.
- Auth or authorization impact: no auth was implemented in this phase.
- Data privacy or visibility impact: no user or survey data is stored or exposed.
- Frontend UX impact: placeholder navigation and pages establish routes without implying completed features.
- Environment or deployment impact: Express can serve the built React app and read Azure-style environment variables.

## Validation

Commands run:

```bash
npm install
npm run typecheck
npm run build
npm run lint
env RUN_ENV=prod NODE_ENV=development DATABASE_URL=postgresql://user:pass@example.com:5432/db node apps/api/dist/server.js
npm run dev
curl -sS http://127.0.0.1:3000/api/health
curl -sS http://127.0.0.1:5173/
curl -sS http://127.0.0.1:5173/admin
curl -sS http://127.0.0.1:5173/not-a-route
git check-ignore -v .env .env.example
```

Results:

- Passed: `npm install`, `npm run typecheck`, `npm run build`, `npm run lint`.
- Passed: `RUN_ENV=prod` with `NODE_ENV=development` fails fast with `NODE_ENV must be production when RUN_ENV is prod`.
- Passed: `npm run dev` after running with local server permission for ports 3000 and 5173.
- Passed: `/api/health` returned HTTP 200 with `status: ok`, `runEnv: dev`, and `database: connected`.
- Passed: Vite served the React app shell and SPA fallback routes.
- Passed: `.env` is ignored; `.env.example` remains trackable.
- Failed: initial sandboxed `npm run dev` attempts could not bind localhost ports.
- Not run: browser-based visual inspection.

Manual tests:

- Confirmed API server starts on `127.0.0.1:3000`.
- Confirmed Vite server starts on `127.0.0.1:5173`.
- Confirmed frontend route URLs return the app shell.
- Confirmed no real secrets were added to tracked environment files.

## Claude Review Notes

Source:

- `notes/claude_review_phase_0.txt`

Status:

- Completed

Critical issues:

- None blocking Phase 0 commit.
- Addressed after Claude review: production PostgreSQL TLS now uses certificate verification by default and supports optional CA configuration.
- Addressed after Claude review: startup now rejects `RUN_ENV=prod` unless `NODE_ENV=production`, and production behavior is derived from `RUN_ENV`.

Suggested improvements:

- Run browser-based route inspection when a browser automation setup is available.
- Before Azure health checks rely on `/api/health`, return 503 when PostgreSQL is unavailable or split liveness/readiness endpoints.
- Either query `app_health_check` from the health check or document the table as a migration-pipeline placeholder.
- Consider moving the full health response shape, including database status, into `packages/shared`.
- Consider making dotenv path resolution module-relative instead of `process.cwd()` dependent.
- Add an automated test harness before security-critical auth and survey behavior lands.

Accepted fixes:

- Replaced `tsx` dev runtime with compile-and-run API dev script because `tsx` IPC pipes were blocked in this environment.
- Made API host configurable and defaulted local development to `127.0.0.1`.
- Loaded both workspace and repository root `.env` files for API workspace scripts.
- Accepted Phase 0 health behavior: `/api/health` may stay HTTP 200 when DB is unavailable for local scaffolding, but this must change before Azure deployment monitoring.
- Fixed C1 after review: `pg` production SSL uses `rejectUnauthorized: true` and supports `DATABASE_SSL_CA` or `DATABASE_SSL_CA_PATH`.
- Fixed C2 after review: `RUN_ENV=prod` requires `NODE_ENV=production`, and server production behavior is keyed to `RUN_ENV`.
- Fixed S4 after review: API dotenv loading now resolves from the compiled module location instead of `process.cwd()`.

Deferred findings:

- Full survey schema is deferred to a later data-model phase.
- Authentication, authorization, registration, login, survey taking, and admin reporting are deferred by prompt scope.
- S1: change health readiness behavior to report DB outage with non-2xx status before Azure health checks are configured.

## Problems Encountered

- Problem:
  Sandboxed `npm install` hung without registry progress.
  Resolution:
  Re-ran `npm install` with approved network access.

- Problem:
  `tsx` could not open its IPC pipe in the sandbox.
  Resolution:
  API dev script now builds TypeScript and runs `node dist/server.js`.

- Problem:
  Sandboxed local servers could not bind ports.
  Resolution:
  Re-ran `npm run dev` with approved local server permission.

## Follow-Up Tasks

- Consider browser automation for future frontend validation.
- Update `/api/health` readiness semantics before Azure health checks rely on it.
- Consider the lower-priority review suggestions before or during the relevant future phases.
- Implement Phase 1 only after Phase 0 review and commit decisions.

## Commit Readiness

- Requirements implemented: Yes
- Product context still aligned: Yes
- Architecture principles still aligned: Yes
- Security review complete: Basic Phase 0 check complete; no production secrets committed.
- Review findings addressed or deferred: Yes; C1/C2 were fixed after review, and the Azure health-readiness item remains deferred and tracked.
- Manual testing complete: Basic server and route checks complete.
- Ready to commit: Yes
