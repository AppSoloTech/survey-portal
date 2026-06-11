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

---

## Phase 1 — Authentication and Role System

Date:
2026-06-09

Status:
Completed

Prompt:
`prompts/prompt_1.txt`

Git Commit:
Pending

Review Artifacts:
- Codex handoff: `notes/claude_handoff_phase_1.txt`
- Claude review: `notes/claude_review_phase_1.txt`

## Goals

- Implement registration and login.
- Hash passwords with bcrypt.
- Issue and verify JWT bearer tokens.
- Store and enforce `user` and `admin` roles.
- Protect API and frontend routes.
- Persist frontend authentication state across reloads.

## Built

- Added `users` migration with unique email, bcrypt hash storage, role check constraint, and timestamps.
- Added shared auth response/user types.
- Added API auth helpers, auth middleware, and role middleware.
- Added `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, and `POST /api/auth/logout`.
- Added `GET /api/admin/me` as a minimal admin-only authorization probe.
- Added React auth API client, auth provider, protected route guard, admin route guard, login form, registration form, session persistence, and logout action.
- Updated user/admin dashboards to consume authenticated user state.
- Added bcrypt/jsonwebtoken dependencies and TypeScript types.
- Added post-review hardening for missing-email login timing and production JWT secret strength.

## Important Decisions

### Bearer JWT Persistence

Decision:
Store the JWT in browser local storage and send it as an `Authorization: Bearer` header.

Reason:
Matches the phase requirement for JWT auth and keeps the Phase 1 implementation simple without adding cookie/session infrastructure before the app needs it.

Tradeoff:
Logout is client-side token removal plus a validating logout endpoint; true server-side token revocation is deferred unless future requirements call for it.

### Admin Authorization Probe

Decision:
Add `GET /api/admin/me` as the first admin-only API route.

Reason:
Prompt 1 requires server-side admin route protection, but admin management screens are explicitly out of scope.

Tradeoff:
The route exists only to validate authorization and return the current admin identity; real admin features remain deferred.

### Shared Package Types

Decision:
Expose `packages/shared/src/index.ts` as the package `types` entry while keeping runtime imports pointed at `dist/index.js`.

Reason:
App package typechecks need current shared TypeScript types without relying on stale ignored `dist` declarations.

Tradeoff:
The shared package still must be built before runtime execution because runtime imports use compiled JavaScript.

## Architecture Notes

- Database/schema impact: added only the `users` auth table; no survey tables were created.
- API contract impact: added `/api/auth/*` endpoints and a minimal `/api/admin/me` protected endpoint.
- Auth or authorization impact: JWT auth, bcrypt hashing, user lookup, and role checks are now server-enforced.
- Data privacy or visibility impact: passwords are never returned by API responses; request logging still logs paths only.
- Frontend UX impact: login/register are working forms; dashboard/admin routes are guarded.
- Environment or deployment impact: `JWT_SECRET` is required at API startup; `.env.example` already documents placeholder values.
- Environment or deployment impact: `RUN_ENV=prod` rejects the local JWT placeholder and secrets shorter than 32 characters.

## Validation

Commands run:

```bash
npm install -w apps/api bcrypt jsonwebtoken
npm install -D -w apps/api @types/bcrypt @types/jsonwebtoken
npm run typecheck
npm run lint
npm run build
psql "$DATABASE_URL" -f database/migrations/0002_users.sql
node apps/api/dist/server.js
node auth endpoint validation scripts
env RUN_ENV=prod NODE_ENV=production DATABASE_URL=postgresql://user:pass@example.com:5432/db JWT_SECRET=short node -e "import('./apps/api/dist/config.js')"
env RUN_ENV=prod NODE_ENV=production DATABASE_URL=postgresql://user:pass@example.com:5432/db JWT_SECRET=replace_with_a_local_development_secret node -e "import('./apps/api/dist/config.js')"
```

Results:

- Passed: dependency install and npm audit reported zero vulnerabilities.
- Passed: `npm run typecheck`.
- Passed: `npm run lint`.
- Passed: `npm run build`.
- Passed: users migration applied locally.
- Passed: unauthenticated `/api/auth/me` returned 401.
- Passed: registration returned 201 with user and token.
- Passed: duplicate email registration returned 409.
- Passed: login returned a token.
- Passed: authenticated `/api/auth/me` returned current user.
- Passed: standard user received 403 from `/api/admin/me`.
- Passed: stored password hash was not plaintext and used bcrypt format.
- Passed: direct DB promotion to admin allowed `/api/admin/me`.
- Passed after review: production startup rejects `JWT_SECRET` shorter than 32 characters.
- Passed after review: production startup rejects the local placeholder `JWT_SECRET`.
- Passed after review: missing-email login still returns a generic 401 while running a dummy bcrypt comparison.
- Failed: sandboxed local DB/server/network commands were blocked until rerun with approved local access.
- Not run: browser visual inspection.

Manual tests:

- Exercised registration, duplicate email rejection, login, current-user lookup, logout, user-role authorization rejection, bcrypt storage, and admin-role authorization through local API calls.
- Confirmed no production secrets were added to tracked files.

## Claude Review Notes

Source:

- `notes/claude_review_phase_1.txt`

Status:

- Completed

Critical issues:

- None blocking Phase 1 commit.

Suggested improvements:

- S1: Login timing side-channel on missing-email path.
- S2: Add rate limiting on `/api/auth/login` and `/api/auth/register` before public exposure.
- S3: Add production JWT secret strength guard.
- S4: Drop `password_hash` from authenticated user lookups that do not need it.
- S5: Centralize user SELECT projections.
- S6: Add a max password length to avoid bcrypt 72-byte truncation surprises.
- S7: Avoid redundant `/api/auth/me` fetch immediately after login/register.

Accepted fixes:

- Fixed S1: missing-email login now performs a dummy bcrypt comparison using a decoy hash before returning generic 401.
- Fixed S3: `RUN_ENV=prod` rejects the local JWT placeholder and secrets shorter than 32 characters.
- Fixed S4: authenticated current-user lookup no longer selects `password_hash`.

Deferred findings:

- Server-side token revocation is deferred because it is not required by Prompt 1.
- S2: rate limiting is deferred until public exposure or a security hardening phase.
- S5: central user SELECT helpers are deferred until there is more query reuse.
- S6: max password length is deferred as a validation-hardening follow-up.
- S7: redundant `/api/auth/me` fetch after login/register is deferred as a UX/performance polish item.
- T1: revisit local-storage JWT versus httpOnly cookie auth before real survey response or hidden-tag data lands.
- Password reset, email verification, OAuth, survey functionality, and admin management screens remain deferred by prompt scope.
- Active follow-ups are copied to `markdown/FOLLOW_UPS.md` so future phases review them before implementation.

## Problems Encountered

- Problem:
  Sandboxed npm install hung behind network isolation.
  Resolution:
  Stopped the stuck process and reran dependency installation with approved network access.

- Problem:
  TypeScript initially read stale ignored shared declaration output after adding new shared auth types.
  Resolution:
  Updated shared package type metadata to expose source types while preserving compiled runtime imports.

- Problem:
  Sandboxed local PostgreSQL and localhost API connections were blocked.
  Resolution:
  Reran migration, temporary server startup, and endpoint validation with approved local access.

- Problem:
  Claude review found a low-severity login timing side-channel on the missing-email path.
  Resolution:
  Added a fixed bcrypt decoy hash comparison for missing-user login attempts.

- Problem:
  Claude review found no production strength guard for `JWT_SECRET`.
  Resolution:
  Added production startup checks for placeholder and short JWT secrets.

## Follow-Up Tasks

- Consider adding an automated backend test harness before additional auth-sensitive behavior grows.
- Add rate limiting to auth routes before public exposure.
- Revisit local-storage JWT versus httpOnly cookie auth before real survey response or hidden-tag data lands.
- Add max password length validation in a future auth-hardening pass.
- Update `/api/health` readiness semantics before Azure health checks rely on it.
- Add a real admin creation/seed workflow in a later admin or deployment phase.
- Keep any future loose ends in `markdown/FOLLOW_UPS.md` before committing a phase.

## Commit Readiness

- Requirements implemented: Yes
- Product context still aligned: Yes
- Architecture principles still aligned: Yes
- Security review complete: Yes; Claude review found no blocking issues.
- Review findings addressed or deferred: Yes; S1/S3/S4 fixed, remaining findings deferred.
- Manual testing complete: API-level auth testing complete; browser visual inspection not run
- Ready to commit: Yes

---

## Phase 2 — Survey Database Model, Seeds, and API Foundation

Date:
2026-06-09

Status:
Completed after Claude review fixes

Prompt:
`prompts/prompt_2.txt`

Git Commit:
Pending

Review Artifacts:
- Codex handoff: `notes/claude_handoff_phase_2.txt`
- Claude review: `notes/claude_review_phase_2.txt`

## Goals

- Implement the survey data model described in `markdown/DATA_MODEL_VISION.md`.
- Add migrations and local seed data for realistic future survey testing.
- Add foundational survey CRUD APIs without building survey-taking UI or admin-builder UI.

## Built

- Added `database/migrations/0003_surveys.sql` with normalized tables for surveys, questions, answer options, hidden answer tags, conditional rules, attempts, response answers, and selected response options.
- Added `database/seeds/0001_phase_2_seed.sql` with one local admin, one published test survey, all MVP question types, hidden answer tags, and one sample `JUMP_TO_QUESTION` rule.
- Added shared survey/question/option/tag/rule API types.
- Added `/api/surveys` routes for `GET /`, `GET /:id`, `POST /`, and `PUT /:id`.
- Updated database setup docs and seed safety notes.
- Created the required Phase 2 Claude handoff and updated process templates/checklists so future handoffs are a phase-closeout gate.

## Important Decisions

### Survey Read Authentication

Decision:
Require authentication for `GET /api/surveys` and `GET /api/surveys/:id`.

Reason:
Claude review C1 correctly identified that anonymous reads conflicted with the Authorization Principle and product rule that users must register/login before using surveys.

Tradeoff:
Logged-in standard users can still read only published surveys and never receive hidden tags; admins can read all statuses and receive hidden tags. There is no public anonymous survey catalog.

### Metadata-Only Survey Mutations

Decision:
Keep `POST /api/surveys` and `PUT /api/surveys/:id` scoped to survey metadata.

Reason:
Prompt 2 asks for foundational CRUD APIs and explicitly excludes the admin builder UI. Nested question, option, tag, and rule management belongs in later admin-builder phases.

Tradeoff:
Seeded data exercises the full schema, but real authoring of child entities waits for dedicated endpoints.

### Local Seed Scope

Decision:
Treat the Phase 2 admin seed as local development data only.

Reason:
The seed intentionally creates a known local admin account and resets that password on reapply.

Tradeoff:
Local testing is easy, but hosted admin provisioning remains a separate active follow-up and local seeds must not run against hosted, shared, staging, or production databases.

## Architecture Notes

- Database/schema impact: survey definition, conditional logic, attempt, response, selected-option, and hidden-tag tables now exist with explicit foreign keys and check constraints.
- API contract impact: `/api/surveys` is available to authenticated callers; admin callers receive all statuses and hidden tags, standard users receive published surveys without hidden tags.
- Auth or authorization impact: all survey endpoints now verify authentication; `POST`/`PUT` also require admin role.
- Data privacy or visibility impact: hidden answer tags are only selected and returned for admin callers.
- Frontend UX impact: no UI changes in this phase.
- Environment or deployment impact: local seeds are documented as unsafe for hosted/prod use.

## Validation

Commands run:

```bash
npm run typecheck
npm run lint
npm run build
git diff --check
pg_isready -h 127.0.0.1 -p 5432 -d survey_portal
curl -sS http://127.0.0.1:3000/api/health
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/0001_app_health_check.sql -f database/migrations/0002_users.sql -f database/migrations/0003_surveys.sql -f database/seeds/0001_phase_2_seed.sql
curl -sS http://127.0.0.1:3000/api/surveys
env PORT=3002 API_HOST=127.0.0.1 node apps/api/dist/server.js
curl -sS -i http://127.0.0.1:3002/api/surveys
# node -e script checked seeded admin login and authenticated survey GET against port 3002
kill 34831
```

Results:

- Passed: `npm run typecheck`.
- Passed: `npm run lint`.
- Passed: `npm run build`.
- Passed: `git diff --check`.
- Passed: local PostgreSQL readiness check outside Codex's restricted network sandbox.
- Passed: `/api/health` returned database connected.
- Passed: ordered migrations and Phase 2 seed applied locally.
- Passed after C1 fix: unauthenticated `GET /api/surveys` returned 401.
- Passed after C1 fix: seeded admin login returned 200.
- Passed after C1 fix: authenticated admin `GET /api/surveys` returned the seeded survey and included hidden `answerTags`.
- Passed during manual testing: standard-user survey read returned published surveys without hidden `answerTags`.
- Passed during manual testing: admin `POST /api/surveys` smoke test created a draft survey.
- Passed during manual testing: admin `PUT /api/surveys/:id` smoke test updated survey metadata.
- Failed: initial sandboxed `psql`/`pg_isready` attempts could not reach `localhost:5432` because of Codex network sandboxing.
- Not run: browser visual inspection.

Manual tests:

- Confirmed the local database had only `users` before applying Phase 2 migration/seed.
- Confirmed migration/seed application created the expected Phase 2 tables and seed records.
- Confirmed pre-review public response omitted hidden `answerTags`.
- Confirmed post-review authenticated user/admin survey visibility behaved as expected.
- Confirmed admin survey create/update smoke tests passed.

Phase closeout artifacts:

- Codex handoff created before final implementation summary: initially missed, then corrected before review.
- Handoff path: `notes/claude_handoff_phase_2.txt`
- Claude review status before commit: Completed

## Claude Review Notes

Source:

- `notes/claude_review_phase_2.txt`

Status:

- Completed

Critical issues:

- C1: unauthenticated survey reads conflicted with product and authorization principles.

Suggested improvements:

- S1: local seed creates a known-credential admin and must be guarded/documented against hosted/prod use.
- S2: retiring a survey should preserve `published_at`.
- S3: future rule-management writes must validate same-survey references.
- S4: optional-auth logic duplicated `requireAuth`.
- S5: optional-auth row typing concern.
- S6: future publish flow should require at least one question.
- S7: add explicit write length bounds.

Accepted fixes:

- Fixed C1: `GET /api/surveys` and `GET /api/surveys/:id` now require `requireAuth`.
- Fixed S2: retiring a survey preserves existing `published_at`.
- Fixed S4/S5 path: removed optional-auth logic from survey routes and reused `requireAuth`.
- Addressed S1 documentation: seed docs and README now state local seeds must not run against hosted/shared/staging/production databases.

Deferred findings:

- S1 guard/provisioning: add hosted-safe admin provisioning and automated `RUN_ENV=prod` seed guard before deployment automation.
- S3: validate conditional rule references in later rule-management endpoints.
- S6: enforce at least one question before publishing in later admin-builder flows.
- S7: add explicit write length bounds when authoring endpoints mature.

## Problems Encountered

- Problem:
  Initial local PostgreSQL checks appeared to fail.
  Resolution:
  Investigation showed PostgreSQL was running; the failure was Codex's restricted network sandbox. Re-ran DB checks outside the sandbox and applied migrations/seeds.

- Problem:
  Phase 2 handoff was not created before the first implementation summary.
  Resolution:
  Added `notes/claude_handoff_phase_2.txt` and tightened `markdown/CLAUDE_REVIEW_TEMPLATE.md`, `markdown/PHASE_TEMPLATE.md`, and `markdown/REVIEW_CHECKLIST.md`.

- Problem:
  Claude review found survey reads were anonymous.
  Resolution:
  Changed survey GET routes to require authentication and documented the decision above.

## Follow-Up Tasks

- Add hosted-safe admin provisioning before any hosted deployment.
- Add a `RUN_ENV=prod` guard before local seed execution is automated.
- Choose a database migration runner before deployment workflow becomes repetitive.
- Validate same-survey conditional rule references when rule-management endpoints are added.
- Require at least one question before publishing once admin-builder publish flows exist.
- Add explicit length bounds for survey metadata and future question/option text writes.
- Add route-level tests for survey auth, standard-user visibility, and admin hidden-tag visibility.

## Commit Readiness

- Requirements implemented: Yes
- Codex handoff created: Yes
- Product context still aligned: Yes
- Architecture principles still aligned: Yes
- Security review complete: Yes; C1 fixed after Claude review.
- Review findings addressed or deferred: Yes
- Manual testing complete: Yes; API/database checks, user/admin survey visibility, and admin create/update smoke tests passed.
- Ready to commit: Yes

---

## Phase 3 — User Survey Experience

Date:
2026-06-09

Status:
Completed after Claude review fixes

Prompt:
`prompts/prompt_3.txt`

Git Commit:
Pending

Review Artifacts:
- Codex handoff: `notes/claude_handoff_phase_3.txt`
- Claude review: `notes/claude_review_phase_3.txt`

## Goals

- Migrate authentication from frontend local-storage bearer tokens to server-set httpOnly cookies.
- Let authenticated users browse, start, resume, answer, save progress, and submit surveys.
- Persist survey responses and evaluate MVP `JUMP_TO_QUESTION` conditional navigation.

## Built

- Auth responses now set an httpOnly `survey_portal_auth` cookie and no longer return JWTs to the frontend.
- Logout clears the auth cookie; frontend API calls use `credentials: "include"`.
- Auth middleware now reads JWTs from the cookie while preserving server-side user lookup and role authorization.
- Added Phase 3 APIs:
  - `POST /api/surveys/:id/start`
  - `POST /api/surveys/:id/answer`
  - `POST /api/surveys/:id/complete`
  - `GET /api/my-surveys`
  - `GET /api/my-surveys/:attemptId`
- Added response persistence, selected option replacement, active-attempt reuse, completion locking, and required-answer validation.
- Added post-review hardening so abandoned attempts cannot accept answers and concurrent starts return the existing active attempt instead of surfacing a unique-constraint error.
- Added one-question-at-a-time user dashboard UI with progress, previous/next navigation, start/resume, and submit flow.

## Important Decisions

### Cookie Auth

Decision:
Use a server-set JWT cookie with `httpOnly`, `SameSite=Lax`, `path=/`, and `secure` only when `RUN_ENV=prod`.

Reason:
This removes JWT exposure to browser JavaScript and works for local HTTP development while preparing the production path to require HTTPS cookies.

Tradeoff:
The MVP still uses stateless JWT expiry rather than server-side token revocation. The cookie is a session cookie, so browser session behavior controls persistence while the JWT expiry remains the server-side validity limit.

### Optional Question Skips

Decision:
Allow optional questions to save an intentionally blank response row.

Reason:
The MVP has one question per page and no separate skip endpoint; a blank optional response lets users advance and resume correctly.

Tradeoff:
Reports must distinguish blank optional responses from meaningful answers.

## Validation

Commands run:

```bash
npm run build -w packages/shared
npm run typecheck
npm run lint
npm run build
```

Results:

- Passed: shared package build refreshed downstream workspace types.
- Passed: `npm run typecheck`.
- Passed: `npm run lint`.
- Passed: `npm run build`.
- Not run yet: browser visual inspection.

## Follow-Up Tasks

- Add automated route tests for cookie auth and survey attempt validation.
- Run browser-based route/layout inspection when automation is available.
- Consider server-side JWT revocation or token versioning if logout semantics need to invalidate active cookies immediately.
- Confirm whether completed attempts should prevent future repeat attempts through the start endpoint.
- Hoist pure navigation helpers to `packages/shared` if frontend/backend conditional navigation logic grows.
- Define whether changed branching answers should prune now-unreachable responses before reporting.

## Claude Review Notes

Source:

- `notes/claude_review_phase_3.txt`

Status:

- Completed

Critical issues:

- None.

Suggested improvements:

- S1: `answer` blocked completed attempts but not abandoned attempts.
- S2: concurrent starts could surface a unique-constraint error instead of returning the existing active attempt.
- S3/S4/S6/Q1: shared navigation helper extraction, route-service extraction, unreachable-response policy, and repeat-after-completion decision are useful future work.

Accepted fixes:

- Fixed S1: abandoned attempts now return 409 from the answer route.
- Fixed S2: start now catches the one-active-attempt unique violation and returns the existing active attempt.

Deferred findings:

- Shared navigation helper extraction.
- Survey attempt/response service extraction.
- Branch-change unreachable-response policy before reporting.
- Repeat-after-completion product decision.

## Commit Readiness

- Requirements implemented: Yes
- Codex handoff created: Yes
- Product context still aligned: Yes
- Architecture principles still aligned: Yes
- Security review complete: Yes; Claude review found no blocking issues.
- Review findings addressed or deferred: Yes
- Manual testing complete: Typecheck/lint/build only so far.
- Ready to commit: Yes; live API/browser smoke testing is still recommended before tagging the phase done.

---

## Phase 4 — Admin Survey Builder MVP

Date:
2026-06-09

Status:
Implemented after Claude review fixes

Prompt:
`prompts/prompt_4.txt`

Git Commit:
Pending

Review Artifacts:
- Codex handoff: `notes/claude_handoff_phase_4.txt`
- Claude review: `notes/claude_review_phase_4.txt`

## Goals

- Let administrators create, edit, publish, and retire surveys.
- Add form-based management for questions, answer options, hidden answer tags, and MVP `JUMP_TO_QUESTION` conditional rules.
- Enforce authentication and admin authorization for all builder writes.
- Preserve Phase 3 standard user survey-taking behavior.

## Built

- Added admin-only builder APIs under `/api/surveys` for:
  - survey metadata and status transitions
  - question create/edit/delete/reorder
  - answer option create/edit/delete/reorder
  - hidden answer tag create/edit/delete
  - conditional rule create/edit/delete
- Added publish validation requiring at least one question, answer options for selection questions, and valid same-survey conditional rule references.
- Added server-side length and enum validation for survey builder writes.
- Preserved hidden tag isolation by only including `answerTags` when admin paths request hidden tags.
- Replaced the placeholder admin dashboard with a dense form-based survey builder UI.
- Added admin frontend API helpers and responsive builder styles.
- Added post-review hardening so question and answer option deletes are blocked outside draft surveys and against saved response rows.
- Hardened insert-at-position display-order shifting to use the same two-statement park-then-set approach as reorder endpoints.
- Added forward-only validation for `JUMP_TO_QUESTION` rules.

## Important Decisions

### Form-Based Builder

Decision:
Use explicit forms and up/down reorder buttons instead of drag-and-drop.

Reason:
Phase 4 asks for a maintainable business tool, not a visual designer. This keeps the workflow understandable and keeps ordering operations easy to validate server-side.

Tradeoff:
The first builder UI is a large single React component and may need extraction after review fixes or before reporting expands the admin area.

### Admin-Only Hidden Tags

Decision:
Expose answer tags only through admin survey structure responses and builder write responses.

Reason:
Tags are business metadata for reporting and rules, not participant-facing content.

Tradeoff:
The shared type still allows optional `answerTags`, so review and tests must keep checking that user survey APIs call the structure loader with hidden tags disabled.

## Validation

Commands run:

```bash
npm run typecheck
npm run lint
npm run build
git diff --check
curl -sS http://127.0.0.1:3000/api/health
```

Results:

- Passed: `npm run typecheck`.
- Passed: `npm run lint`.
- Passed: `npm run build`.
- Passed: `git diff --check`.
- Passed: API health returned `status: ok` and `database: connected`.
- Not run: automated backend route tests.
- Not run: browser visual inspection.
- Not run: live admin builder CRUD smoke test.
- Not run: live cross-survey conditional-rule rejection smoke test.

## Claude Review Notes

Source:

- `notes/claude_review_phase_4.txt`

Status:

- Completed

Verdict:

- Approve for commit, with documented follow-ups.

Critical issues:

- C1: Deleting questions/options from a published or retired survey can cascade into collected response data. This must be resolved before production or reporting.

Suggested improvements:

- S1: Insert-time display-order shifting uses a fragile data-modifying CTE plus outer update pattern. Harden it to the same two-statement approach used by reorder helpers and smoke-test insert-at-position.
- S2: Conditional jump rules currently allow backward/self targets, which can make a survey uncompletable. Enforce forward-only jumps or document an intentional exception.
- S3/S4/S5/S6: Consider transaction consistency for validate-then-write paths, force new surveys to draft, improve minor accessibility/feedback details, and split the now-large survey route file before reporting work expands.

Accepted follow-ups:

- Fixed C1: question and answer option deletes now return 409 once a survey is no longer draft, returning attempted surveys to draft is blocked, and saved response rows block destructive question/option deletes even if a survey is draft.
- Fixed S1 code hardening: insert-at-position order shifting now uses two statements instead of a data-modifying CTE that rewrites the same rows.
- Fixed S2: rule creation/update and publish validation reject backward or self-targeting `JUMP_TO_QUESTION` rules.
- Kept active follow-up for the live insert-at-position/reorder smoke test.
- Added active follow-up to extract Phase 4 builder routes/services before admin reporting.

Resolved previous follow-ups:

- Same-survey conditional rule validation is implemented.
- At-least-one-question publish validation is implemented.
- Explicit length bounds for survey builder writes are implemented.
- Response-data destructive question/option delete protection is implemented.
- Forward-only jump rule validation is implemented.

Second Claude review:

- `notes/claude_review_phase_4_fixes.txt`

Status:

- Completed

Verdict:

- S1 and S2 were fully fixed; C1 needed one more response-preservation guard.

Residual C1 fix:

- Blocked moving a published or retired survey back to draft once it has attempts.
- Added saved-response checks before deleting a question or answer option, preventing cascade deletion even if a survey is draft.
- Kept the non-draft delete guards and UI-disabled delete buttons from the first C1 pass.
- Re-ran `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check` after this residual fix.

## Commit Readiness

- Requirements implemented: Yes
- Codex handoff created: Yes
- Claude review created: Yes
- Product context still aligned: Yes
- Architecture principles still aligned: Yes
- Security review complete: Yes; no auth, authorization, hidden-tag-exposure, or SQL-injection blockers found.
- Review findings addressed or deferred: Yes; C1/S1 code hardening/S2 are fixed, and the remaining live ordering smoke test is documented in `markdown/FOLLOW_UPS.md`.
- Manual testing complete: API health only; admin CRUD smoke testing still recommended.
- Ready to commit: Yes, with route/service extraction and live ordering smoke testing documented as follow-ups.

---

## Phase 5 — Admin Builder UX Polish

Date:
2026-06-10

Status:
Implemented after Claude review fixes

Prompt:
`prompts/prompt_5.txt`

Git Commit:
Pending

Review Artifacts:
- Codex handoff: `notes/claude_handoff_phase_5.txt`
- Claude review: `notes/claude_review_phase_5.txt`

## Goals

- Fix the base-user text-answer state isolation regression in conditional survey-taking paths.
- Improve admin builder scanability, section hierarchy, action labels, save feedback, and mobile stacking.
- Make draft saves feel persisted without implying publish is required to preserve work.
- Add clear publish/retire status actions near the bottom of the builder while preserving backend validation.
- Reset the add-rule form after a successful jump-rule create.

## Built

- Replaced shared survey-runner answer state with question-id keyed draft maps for text, integer, and selection inputs.
- Hydrated draft answer maps from saved attempt responses without clearing unrelated question drafts.
- Keyed the active question form and text/integer controls by question id so text inputs do not visually carry values across conditional jumps.
- Added scoped admin mutation feedback such as `Survey metadata saved`, `Question added`, `Option saved`, `Hidden tag saved`, and `Jump rule added`.
- Removed status editing from the metadata form; metadata saves now preserve the current status.
- Added top and bottom survey status action panels with current status, publish, and retire controls.
- Added an explicit `Republish survey` action for retired surveys, preserving backend publish validation.
- Added add-rule reset behavior by clearing the controlled source question state and resetting the form after successful rule creation.
- Refined runner hydration so current-question-only navigation does not overwrite unsaved edits for already-answered questions.
- Removed redundant post-submit draft hydration and collapsed draft hydration/update helpers.
- Improved builder section hierarchy, option/tag row labels, scoped destructive action labels, section notes, and mobile action stacking.

## Important Decisions

### Question-Keyed Runner Drafts

Decision:
Store in-progress survey-taking input values by question id instead of by reusable input type.

Reason:
Conditional navigation can move between two text questions without visiting intervening questions. A single shared text state can briefly or persistently show the prior text question's value in the next text question.

Tradeoff:
The runner keeps small per-question draft maps in component state. This is still local-only UI state and remains hydrated from saved attempt responses.

### Explicit Status Actions

Decision:
Keep status transitions out of the metadata save form and expose publish/retire as explicit action panels.

Reason:
Admins should understand that draft construction progress is saved independently of publishing, and publish should continue to rely on backend validation.

Tradeoff:
The builder shows status actions in two places to satisfy the prompt and reduce scrolling friction.

## Validation

Commands run:

```bash
npm run typecheck
npm run lint
npm run build
git diff --check
```

Results:

- Passed: `npm run typecheck`.
- Passed: `npm run lint`.
- Passed: `npm run build`.
- Passed: `git diff --check`.
- Not run: live admin builder browser CRUD smoke test.
- Not run: mobile browser visual inspection.
- Not run: live base-user conditional text-question reproduction.
- Not run: retired survey republish browser smoke test.

Manual browser note:

Browser automation is not installed in this repo (`npm ls playwright` and `npm ls @playwright/test` returned empty), and no local app server was running on the expected ports during implementation. A live browser pass should still be run before commit if a browser-capable environment is available.

## Claude Review Notes

Source:

- `notes/claude_review_phase_5.txt`

Status:

- Completed

Verdict:

- No blocking bug found. Claude verified that the core text-answer isolation fix is sound and that the admin UX rewiring is structurally clean.

Findings addressed:

- F1: Added a retired-survey `Republish survey` UI path that calls the existing validated publish transition.
- F2: Changed runner hydration to depend on the attempt object instead of every active survey/current-question change.
- F3: Removed redundant explicit hydration after answer submit.
- F5: Collapsed duplicated draft hydration/update helper code.
- F6: Copied selected option id arrays during hydration instead of storing response arrays by reference.

Documented:

- F4: Metadata save can still trigger publish validation on already-published surveys because the current API expects status in metadata updates. This was pre-existing and is left unchanged for Phase 5 to avoid a backend contract change.

## Phase 5 Manual Test Fixes

Source:

- `notes/phase-5-test-notes.txt`

Review artifact:

- `notes/claude_handoff_phase_5_test_fixes.txt`
- `notes/claude_review_phase_5_test_fixes.txt`

Status:

- Implemented after focused Claude review fixes.

Changes:

- Refactored answer option rows so `Save option text`, option ordering, option deletion, and hidden tag actions are visually and functionally separate.
- Restored hidden tag dropdowns with `Custom key...` and `Custom value...` options for ad hoc tags.
- Reworked the Hidden Tags section into a tag suggestion library with built-in, saved, and custom source labels.
- Clarified that only custom tag suggestions are removable.
- Added `Back to top` to the bottom survey status action area.
- Added participant integer input placeholder and helper text.
- Updated frontend and backend navigation so questions targeted by `JUMP_TO_QUESTION` rules are skipped by ordinary linear flow unless a matching rule jumps to them.
- Hoisted `resolveNextQuestion` into `@survey-portal/shared` so frontend and backend use one navigation implementation.
- Added builder copy documenting that jump targets are conditional-only in normal forward flow.
- Made custom duplicate tag suggestions removable, updated suggestion toast wording, and relabeled cross-survey saved suggestions as `Saved in surveys`.
- Added a persisted `skipTargetInNormalFlow` jump-rule setting so admins can choose whether the target question stays in normal forward flow.

Validation after manual test fixes:

```bash
npm run typecheck
npm run lint
npm run build
git diff --check
```

Results:

- Passed: `npm run typecheck`.
- Passed: `npm run lint`.
- Passed: `npm run build`.
- Passed: `git diff --check`.

Manual testing completed:

- User completed the manual browser pass after the target-flow toggle.
- Current option/tag saving, restored tag dropdown flow, and conditional target normal-flow toggle behavior were accepted for commit.

Focused Claude review:

- Completed in `notes/claude_review_phase_5_test_fixes.txt`.
- No blocking issues found.
- Addressed F1 with builder documentation for conditional-only jump targets.
- Addressed F2 by sharing `resolveNextQuestion` from `@survey-portal/shared`.
- Addressed F3 by basing custom suggestion removability on `customTagPresets`.
- Addressed F4 by updating preset/suggestion toast wording.
- Addressed F5 by clarifying the cross-survey saved suggestion label.
- Re-review completed after final fixes: ship-ready pending the manual smoke tests already listed above.
- Re-review confirmed the restored tag dropdown flow, shared navigation resolver, custom suggestion removal behavior, and conditional-target navigation consistency.
- Post re-review update: added the target-flow toggle after additional manual feedback. Fresh focused review was not run for that final toggle; user completed manual testing and accepted the current behavior.

## Commit Readiness

- Requirements implemented: Yes
- Codex handoff created: Yes
- Claude review created: Yes
- Product context still aligned: Yes
- Architecture principles still aligned: Yes
- Security review complete: No backend/auth changes were made; hidden-tag exposure and publish validation paths were not weakened.
- Review findings addressed or deferred: Yes for first Claude review and focused test-fix review; final target-flow toggle manually accepted without a fresh Claude review.
- Manual testing complete: Yes; completed by user after the target-flow toggle.
- Ready to commit: Yes.

---

## Phase 5.1 — Survey Flow Mapping Visualization

Date:
2026-06-11

Status:
Implemented after Codex review fixes

Prompt:
`prompts/prompt_5.1.txt`

Git Commit:
Pending

Role note:
For this phase the usual AI roles are reversed by explicit human instruction:
Claude Code implemented, and Codex performs the review.

Review Artifacts:
- Codex review handoff (written by Claude): `notes/codex_handoff_phase_5_1.txt`
- Codex review: `notes/codex_review_phase_5_1.txt`

## Goals

- Add a read-only Survey Flow Map to the existing admin builder.
- Derive the map entirely from the already-loaded `Survey` payload (questions, answer options, conditional rules, `displayOrder`, `skipTargetInNormalFlow`) with no new fetch, persistence, or backend endpoint.
- Visualize normal progression, conditional jump paths, and conditional-only questions using the shared runtime semantics.
- Flag informational validation issues without modifying survey data or weakening backend publish validation.

## Built

- Added `apps/web/src/components/admin/surveyFlowGraph.ts`, a pure non-React helper exporting `buildSurveyFlowGraph(survey)` that returns nodes, conditional edges, and informational issues.
- Normal-flow edges are computed by calling the shared `resolveNextQuestion(survey, question, undefined)` directly, so the map cannot drift from runtime navigation semantics.
- Added `apps/web/src/components/admin/SurveyFlowMap.tsx`, rendering the graph as an accessible HTML/CSS vertical flow list with legend, issue summary, per-question nodes, normal/conditional/incoming path lines, and empty states.
- Wired the section into `AdminDashboard` after the Jump rules section and added a `Flow map` link (`#survey-flow`) to the admin section nav.
- Added flow map styles to `apps/web/src/styles.css`, including a mobile breakpoint consistent with the existing 760px layout rules.
- No new dependencies; React Flow was evaluated and rejected for this scope.

## Important Decisions

### Custom HTML/CSS Visualization Instead Of React Flow

Decision:
Render the flow map as a vertical, ordered list of question node cards with labeled path lines instead of adding a graph-canvas dependency.

Reason:
The MVP is one-question-per-page with forward-only jumps, so the flow is fundamentally a top-to-bottom sequence with jump annotations. A list stays readable for large surveys, works on mobile without drag/zoom interactions, is screen-reader accessible, and adds zero dependencies.

Tradeoff:
No 2D spatial edge drawing. Conditional paths are described per node ("If answer is X, jump to question N") rather than drawn as connecting lines, which trades visual flair for density and maintainability.

### Reuse `resolveNextQuestion` For Normal Flow

Decision:
The graph builder calls the shared runtime resolver with an undefined response to compute each question's normal-flow successor, and mirrors its rule-matching filter for conditional edges.

Reason:
The prompt requires faithfully mirroring runtime navigation. Calling the shared helper directly means skip-set behavior (including the runtime detail that any rule with `skipTargetInNormalFlow` and a target suppresses that target regardless of action type) is reflected automatically.

Tradeoff:
The map inherits runtime quirks by design; those quirks are surfaced as informational issues rather than hidden.

### Defensive Validation Is Informational Only

Decision:
All flow checks (missing references, unsupported operators/action types, backward/self targets, duplicates, unreachable questions, cycles) render as an informational issue list plus node badges. Nothing mutates survey data and publish validation is untouched.

Reason:
Current admin/API rules prevent most of these states; they can only appear via legacy/imported data. The map's job is to make them visible for troubleshooting.

Tradeoff:
Admins must still fix issues through the existing builder forms.

## Architecture Notes

- Database/schema impact: none.
- API contract impact: none; no new endpoints and no changed responses.
- Auth or authorization impact: none; the map renders inside the existing admin-guarded dashboard from already-authorized data.
- Data privacy or visibility impact: none; the map shows question/option text only and never renders hidden tags.
- Frontend UX impact: new read-only Flow map section in the builder workspace plus one section-nav link.
- Environment or deployment impact: none.

## Validation

Commands run:

```bash
npm run typecheck
npm run lint
npm run build
git diff --check
node /tmp/flow-graph-check.mjs   # ad hoc unit-like checks for the pure helper
node apps/api/dist/server.js     # brief boot check
curl -sS http://127.0.0.1:3000/api/health
```

Results:

- Passed: `npm run typecheck`.
- Passed: `npm run lint`.
- Passed: `npm run build`.
- Passed: `git diff --check`.
- Passed: 9 ad hoc unit-like scenarios against the pure graph helper (empty survey, linear flow, skip-target jump, non-skip jump, missing source option plus unreachable target, missing source/target questions, unsupported operator/action type, backward/self/duplicate rules, circular legacy navigation, text-source rule that can never fire).
- Passed: API boot check with `database: connected`.
- Not run: browser-based manual pass. No browser automation is installed in this repo (`npm ls playwright` is empty), so the prompt's interactive checklist (rule toggling, reorder/rename live updates, mobile width inspection) is documented for a user-driven pass before commit.

Manual tests:

- Verified through the helper checks that `skipTargetInNormalFlow = true` targets are labeled `Conditional only`, skipped by normal-flow edges, and remain reachable through their jump rules.
- Verified duplicate rules for one source answer option are flagged with first-rule-wins messaging that matches the runtime's first-match evaluation.
- Verified cycle detection only fires for backward/legacy-style data, not for valid forward-only rules.

## Codex Review Notes

Source:

- `notes/codex_review_phase_5_1.txt`

Status:

- Completed

Verdict:

- Changes requested; both findings fixed and re-validated.

Findings addressed:

- Medium: duplicate jump rules for the same source question and answer option were flagged as `duplicate_rule_for_option` but still marked fireable and traversed by reachability/cycle detection, even though the runtime's first-match-wins `find` means a shadowed duplicate can never execute. Fixed by setting `canFireAtRuntime = false` for duplicates after the first id-ordered rule for a source option, which automatically excludes them from adjacency, reachability, and cycle detection while keeping the informational issue and the rendered edge.
- Low: incoming summaries on target nodes described every referencing rule as a "Jump target", contradicting the source-side copy for unsupported/legacy action types. Fixed by splitting incoming references into "Jump target of rule(s)..." for `JUMP_TO_QUESTION` rules and "Referenced as the target of non-executed rule(s)... (action X)" for other action types.

Re-validation after fixes:

- Passed: `npm run typecheck`, `npm run lint`, `npm run build`, `git diff --check`.
- Passed: helper checks extended with two regression scenarios — a skip target reachable only through a shadowed duplicate is now reported unreachable, and a cycle that exists only through a shadowed duplicate backward rule is no longer reported.

## Follow-Up Tasks

- Run the Phase 5.1 manual browser checklist from `prompts/prompt_5.1.txt` once a browser-capable environment is available.
- Consider a lightweight frontend unit test runner so pure helpers like `surveyFlowGraph.ts` get committed tests instead of ad hoc scripts.

## Commit Readiness

- Requirements implemented: Yes
- Review handoff created: Yes (`notes/codex_handoff_phase_5_1.txt`, addressed to Codex)
- Codex review created: Yes (`notes/codex_review_phase_5_1.txt`)
- Product context still aligned: Yes
- Architecture principles still aligned: Yes; visualization only, no schema/API/auth changes.
- Security review complete: No backend changes; hidden tags are not rendered by the flow map.
- Review findings addressed or deferred: Yes; both Codex findings fixed and re-validated.
- Manual testing complete: Yes; helper-level checks during implementation, then a user-run browser pass on 2026-06-11 (post-Phase 6, with the flow map on the Logic page) was accepted.
- Ready to commit: Yes.

---

## Phase 6 — Admin Builder Information Architecture Split

Date:
2026-06-11

Status:
Implemented after Codex review fix

Prompt:
`prompts/prompt_6.txt`

Git Commit:
Pending

Role note:
Roles remain reversed per explicit human instruction: Claude Code implemented,
Codex reviews.

Review Artifacts:
- Codex review handoff (written by Claude): `notes/codex_handoff_phase_6.txt`
- Codex review: `notes/codex_review_phase_6.txt`

## Goals

- Split the single-page admin builder into a surveys overview plus a per-survey
  workspace with focused pages (setup, questions, logic, preview).
- Move the selected survey from component state into the URL so deep links and
  browser back/forward work.
- Preserve every Phase 4/5/5.1 builder behavior, validation, and server
  contract. Frontend-only.

## Built

- `apps/web/src/pages/admin/AdminSurveysOverview.tsx`: `/admin` overview with a
  create-survey form and a scannable list (status pill, question/rule counts,
  last-updated date). Creating a survey navigates into its workspace.
- `apps/web/src/pages/admin/SurveyWorkspaceLayout.tsx`: layout route for
  `/admin/surveys/:surveyId`. Loads the survey via the existing
  `GET /api/surveys/:id`, owns mutation plumbing (`runSurveyMutation`,
  submit/error/notice state, status transitions with the same confirm and
  feedback messages), renders the persistent header (title, status pill,
  edit-state banner, publish/retire/republish actions), tab navigation with
  question/rule counts, and shares everything with child pages via router
  outlet context (`useSurveyWorkspace`). Invalid or missing survey ids render
  a not-found state with a link back to the overview.
- Workspace pages: `SurveySetupPage` (metadata + availability panel),
  `SurveyQuestionsPage` (add question, question editors with options and
  hidden tags, tag suggestion library), `SurveyLogicPage` (jump rules + the
  Phase 5.1 flow map), `SurveyPreviewPage` (read-only preview).
- New routes nested under the existing `AdminRoute` guard; the workspace index
  redirects to `setup`. The old single-page `AdminDashboard.tsx` was deleted.
- Shared helpers extracted by moving code: `components/admin/builderForm.ts`
  (form readers + confirm) and `components/admin/tagPresets.ts` (default/
  merge/build tag preset helpers).
- `fetchAdminSurvey(surveyId)` added to the frontend API client for the
  existing backend endpoint (no API change).
- `SurveyBuilderComponents.tsx`: removed the obsolete anchor-based
  `AdminSectionNav`; simplified `StatusActionPanel` to a single availability
  panel (the bottom "Finish construction" variant and back-to-top link are
  obsolete now that pages are short and header actions are persistent).
- CSS: removed dead styles (`.section-nav`, `.admin-builder-layout`,
  `.admin-survey-panel`, `.admin-survey-list`, `.survey-selector`,
  `.status-action-panel.top/.bottom`), added workspace header/tab and overview
  list styles, and updated both mobile breakpoints accordingly.

## Important Decisions

### Layout-Owned Survey State Via Outlet Context

Decision:
The workspace layout fetches and owns the survey object plus mutation
plumbing; child pages consume it through `useOutletContext`.

Reason:
Every existing mutation already returns the full updated survey, so one
`setSurvey` callback keeps all pages (including the flow map) re-deriving from
fresh state with no state library and no prop drilling.

Tradeoff:
Feedback messages live in the layout and persist across tab switches until the
next action, mirroring the old single-page behavior.

### Cross-Survey Tag Suggestions Keep One Extra Fetch

Decision:
The questions page fetches the survey list once per mount to keep the
"Saved in surveys" cross-survey tag suggestions, merging the live workspace
survey over its stale snapshot.

Reason:
The Phase 5 tag library intentionally suggests tags saved in other surveys;
the workspace otherwise only loads one survey. A silent fallback keeps the
page functional if the list fetch fails.

Tradeoff:
One additional `GET /api/surveys` when opening the questions page.

### Custom Tag Suggestions Live In The Workspace Layout

Decision:
Session-only custom tag suggestions are stored in layout state rather than
page state.

Reason:
They previously survived as long as the admin stayed on the builder page;
keeping them in the layout preserves that lifetime across tab switches within
a survey workspace.

Tradeoff:
They still reset when leaving the workspace, matching the existing
"stay in this builder session" copy.

## Architecture Notes

- Database/schema impact: none.
- API contract impact: none; one new frontend helper for an existing endpoint.
- Auth or authorization impact: none; all new routes nest under the existing
  `AdminRoute` guard and server-side authorization is unchanged.
- Data privacy or visibility impact: none; hidden tags remain admin-only.
- Frontend UX impact: `/admin` is now an overview; survey editing happens in a
  four-page workspace with a persistent status header and URL-addressable
  pages.
- Environment or deployment impact: none; SPA fallback already serves nested
  client routes.

## Validation

Commands run:

```bash
npm run typecheck
npm run lint
npm run build
git diff --check
npx vite --port 5179   # brief dev serve; curled /admin, /admin/surveys/3/logic, /admin/surveys/abc
```

Results:

- Passed: `npm run typecheck`.
- Passed: `npm run lint`.
- Passed: `npm run build`.
- Passed: `git diff --check`.
- Passed: deep workspace URLs (including an invalid id) return the SPA shell
  in dev serve; invalid ids render the client-side not-found state.
- Not run: interactive browser checklist from `prompts/prompt_6.txt`
  (end-to-end build across pages, publish-blocked messaging, back/forward,
  standard-user redirect, mobile widths). No browser automation is installed
  in this repo; recorded as a follow-up consistent with prior phases.

## Codex Review Notes

Source:

- `notes/codex_review_phase_6.txt`

Status:

- Completed

Verdict:

- One Medium finding; fixed and re-validated.

Findings addressed:

- Medium: `runSurveyMutation` could apply a stale mutation result (survey
  object, feedback, submit state) after the admin navigated to a different
  survey's workspace while the request was in flight. Fixed by capturing the
  active survey id in a ref at mutation start and only applying results —
  and only clearing `isSubmitting` — while the layout still shows that
  survey; switching surveys also resets `isSubmitting`. This mirrors the
  fetch effect's existing stale-response guard. Same-survey overlapping
  mutations keep their previous last-response-wins behavior.

Re-validation after fix:

- Passed: `npm run typecheck`, `npm run lint`, `npm run build`,
  `git diff --check` from the repo root.

## Follow-Up Tasks

- Run the Phase 6 manual browser checklist from `prompts/prompt_6.txt` once a
  browser-capable environment is available.

## Commit Readiness

- Requirements implemented: Yes
- Review handoff created: Yes (`notes/codex_handoff_phase_6.txt`)
- Codex review created: Yes (`notes/codex_review_phase_6.txt`)
- Product context still aligned: Yes
- Architecture principles still aligned: Yes; frontend-only restructure.
- Security review complete: No backend changes; admin guard and server-side
  authorization untouched.
- Review findings addressed or deferred: Yes; the Medium stale-mutation guard
  is fixed and re-validated.
- Manual testing complete: Yes; user-run browser pass on 2026-06-11 accepted
  after the Codex review fix.
- Ready to commit: Yes.

---

## Phase 7 — Mobile-First UI/UX Polish

Date:
2026-06-11

Status:
Implemented after Codex review fix

Prompt:
`prompts/prompt_7.txt`

Git Commit:
Pending

Role note:
Roles remain reversed per explicit human instruction: Claude Code implemented,
Codex reviews.

Review Artifacts:
- Codex review handoff (written by Claude): `notes/codex_handoff_phase_7.txt`
- Codex review: `notes/codex_review_phase_7.txt`

## Discovery Audit (code-level; no browser tooling in this environment)

Issues found at 360-760px widths by inspecting markup and `styles.css`:

1. Participant runner placement (Priority 1, confirmed): the stacked mobile
   layout renders the survey list above the runner panel, so starting a survey
   put the active question below the fold. The "Choose a survey" placeholder
   panel also rendered as dead space under the list on mobile.
2. iOS auto-zoom (confirmed, all forms): form controls use `font: inherit`
   inside labels styled at 0.86-0.9rem, giving effective input fonts of
   roughly 13.8-14.4px — under the 16px threshold that triggers mobile Safari
   zoom-on-focus. Affected: auth forms, all admin builder forms, and the
   runner's number/textarea controls (those inherited 16px but were not
   explicit).
3. Touch targets: option rows were 44px but radio/checkbox glyphs were 16px;
   scale chips had no minimum height; `.compact-button` was 35px tall; the
   430px breakpoint shrank all buttons to ~38px.
4. App header: no wrap on the header row, so brand + nav squeezed at narrow
   widths with loose link wrapping inside the nav.
5. Workspace tabs sat inside the header card, so they could not stick during
   long-page scrolling on mobile.
6. Focus visibility existed for inputs but not for buttons/links.
7. The mobile completion summary stacked its two stat boxes vertically,
   wasting vertical space on a panel that should read in one screen.

No horizontal-overflow sources were found; long-text wrapping was added
defensively to survey card titles and the question legend.

## Built

Priority 1 — participant runner:

- The dashboard workspace gets a `survey-active` class while a survey is open;
  at <=760px the survey list panel is hidden so the runner is the first
  content on screen, and "Back to surveys" (existing) returns to the list.
  The empty runner placeholder is hidden on mobile.
- Option rows: 48px min height, 20px radio/checkbox glyphs, pointer cursor;
  scale chips: 48px min height; Next/Previous/Submit: 44px min height and full
  width on mobile (existing full-width rules retained).
- All form controls now declare `font-size: 1rem` explicitly, eliminating the
  iOS zoom-on-focus trigger app-wide.
- Completion summary keeps its two stat boxes side by side on mobile so the
  completion panel reads in one screen.

Priority 2 — global shell:

- New 560px breakpoint: the app header stacks vertically and nav links become
  a full-width two-column grid with comfortable tap sizes.
- Global `:focus-visible` outlines for links, buttons, and the status
  disclosure; subtle `:active` press feedback on buttons.
- The 430px button shrink no longer reduces minimum heights below 40px.
- Defensive `overflow-wrap` on survey card titles and the question legend.

Priority 3 — auth and home:

- Covered by the global input font-size fix; existing autocomplete, input
  types, full-width mobile buttons, and error placement were verified and
  left unchanged.

Priority 4 — admin workspace:

- Workspace tabs moved out of the header card into a standalone tab bar
  (markup change in `SurveyWorkspaceLayout.tsx`) so they can be sticky at the
  top of the viewport at <=760px; styled as the same white pill bar pattern.
- `.compact-button` minimum height raised to 40px on mobile.
- Flow map, editor stacking, and header action wrapping from earlier phases
  verified and retained.

## Important Decisions

### Hide The List, Not A Takeover View

Decision:
On mobile, an active survey hides the survey list with CSS rather than
introducing a takeover/modal view.

Reason:
It is the smallest change that makes the runner the focused content. The
existing "Back to surveys" action already provides the exit, and desktop
keeps the side-by-side layout.

Tradeoff:
The page header and profile strip remain above the runner; the profile strip
was compacted on mobile to reduce that cost.

### Explicit 1rem Control Fonts

Decision:
Set `font-size: 1rem` on every form control rather than raising label font
sizes.

Reason:
Labels are intentionally small (dense business tool); the controls themselves
are what trigger mobile zoom and need 16px.

Tradeoff:
Inputs render slightly larger than their labels, which is the conventional
pattern.

## Architecture Notes

- Database/schema/API/auth impact: none.
- Runner state logic untouched: per-question draft maps, hydration, and
  `resolveNextQuestion` usage are unchanged; the only `UserDashboard` change
  is a conditional CSS class on the workspace wrapper.
- Markup changes: the conditional class above, and the workspace tab bar
  moving from inside the header card to a sibling element.
- All other changes are CSS-only in `styles.css`.

## Validation

Commands run:

```bash
npm run typecheck
npm run lint
npm run build
git diff --check
```

Results:

- Passed: all four commands.
- Not run: the manual browser pass at 360/390/768px (register/login, runner
  focus, per-type answering, conditional-jump text isolation regression
  check, admin walkthrough, overflow sweep). No browser tooling is installed;
  deferred to the user-driven pass consistent with prior phases.

## Codex Review Notes

Source:

- `notes/codex_review_phase_7.txt`

Status:

- Completed

Verdict:

- One High finding; fixed and re-validated.

Findings addressed:

- High: hiding the survey list on mobile while a survey is active removed the
  only in-progress exit path, since `Back to surveys` rendered only on the
  completion panel — violating the prompt's requirement to keep a clear way
  back to the list. Fixed by adding a `Back to surveys` ghost button to the
  active-question action row using the existing `onClose` callback, disabled
  while submitting, last in the action order so it reads as an exit rather
  than the primary action. Close semantics are unchanged from the completion
  panel: the current question's unsubmitted draft is discarded, saved answers
  persist, and resume works.

Re-validation after fix:

- Passed: `npm run typecheck`, `npm run lint`, `npm run build`,
  `git diff --check`.

Post-review user adjustment:

- On mobile, the runner action group no longer stacks vertically: Previous and
  Next sit side by side left-to-right (each half width, 44px tall), with
  `Back to surveys` on its own full-width row below. CSS-only; re-validated
  with the same four commands.

## Follow-Up Tasks

- Run the Phase 7 manual browser checklist from `prompts/prompt_7.txt`,
  including the Phase 5 text-isolation regression check and the new
  mid-survey `Back to surveys` exit on mobile, once a browser-capable
  environment or user pass is available.

## Commit Readiness

- Requirements implemented: Yes
- Review handoff created: Yes (`notes/codex_handoff_phase_7.txt`)
- Codex review created: Yes (`notes/codex_review_phase_7.txt`)
- Product context still aligned: Yes
- Architecture principles still aligned: Yes; CSS-first polish, no new
  dependencies.
- Security review complete: No backend changes; no new data exposure.
- Review findings addressed or deferred: Yes; the High mobile exit-path
  finding is fixed and re-validated.
- Manual testing complete: Static validation complete; browser pass pending
  and tracked in `markdown/FOLLOW_UPS.md`.
- Ready to commit: Yes, pending the user-driven browser checklist.
