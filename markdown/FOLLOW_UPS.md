# Follow-Up Backlog

This file tracks accepted loose ends that should not be forgotten when a phase moves on without implementing them.

Review this file before starting each implementation phase. When a follow-up is completed, move it to the completed section with the phase or commit that resolved it.

---

## Active Follow-Ups

### Auth And Security

- Add rate limiting to `/api/auth/login` and `/api/auth/register` before public exposure or hosted deployment.
- Add maximum password length validation to avoid bcrypt's 72-byte truncation edge case.

### Environment And Deployment

- Update `/api/health` readiness semantics before Azure health checks rely on it. Either return non-2xx when PostgreSQL is unavailable or split liveness/readiness endpoints.
- Choose a database migration runner before deployment workflow becomes repetitive.
- Add a hosted-safe admin provisioning workflow before any hosted deployment; do not run local seed files against hosted, shared, staging, or production databases.
- Add a `RUN_ENV=prod` guard before seed execution is automated.

### API And Code Quality

- Centralize repeated user SELECT projections if auth query reuse grows.
- Avoid the redundant `/api/auth/me` fetch immediately after login/register.
- Consider moving the full health response shape, including database status, into `packages/shared`.
- Either query `app_health_check` from the health check or document the table as a migration-pipeline placeholder.
- Confirm with the client that the enforced attempt policy matches the business need: a completed attempt blocks new starts (409), while an abandoned attempt allows a fresh start and stays visible in reports as history.
- Hoist the saved-path walk (`collectFinalPathQuestionIds` in `apps/api/src/services/surveyReporting.ts`, plus the similar walks in `surveyAttempts.ts` and `UserDashboard.tsx`) into `packages/shared` alongside `resolveNextQuestion` if another consumer appears.
- Add reporting pagination and hidden-tag filtering when attempt volume or analysis needs grow.
- The surveys overview fetches one report per non-draft survey for its completion indicator; replace with a batched count endpoint if survey count grows.

### Frontend Validation

- Run browser-based route and layout inspection when a browser automation setup is available.
- Run the Phase 7 manual browser checklist from `prompts/prompt_7.txt` at 360/390/768px widths, including the Phase 5 conditional-jump text-isolation regression check.
- Run the Phase 8 manual browser checklist from `prompts/prompt_8.txt` (Results tab, attempt detail, CSV spot-check, 360px width).
- Add React component tests when UI behavior grows beyond what pure-helper unit tests cover.

---

## Completed Follow-Ups

- Phase 2: Added a safe local admin seed in `database/seeds/0001_phase_2_seed.sql`.
- Phase 3: Migrated from local-storage bearer JWTs to httpOnly, SameSite cookie auth before persisted survey response data was implemented.
- Phase 4: Added same-survey conditional rule validation, publish-time question requirements, and explicit length bounds for survey builder writes.
- Phase 4: Blocked destructive question/answer-option deletes once response data exists, and blocked returning attempted surveys to draft.
- Phase 4: Hardened insert-at-position display-order shifting to use a two-statement park-then-set pattern.
- Phase 4: Enforced forward-only `JUMP_TO_QUESTION` rule targets.
- Phase 5.1/6: User-run manual browser pass on 2026-06-11 covered the flow map and the multi-page admin workspace; results accepted.
- Phase 8: Extracted survey builder and attempt/response services from `apps/api/src/routes/surveys.ts` into `apps/api/src/services/` with focused route files.
- Phase 8: Added the automated test harness (Vitest + supertest + dedicated test database) covering auth, hidden-tag isolation, builder validation, ordering, attempt lifecycle, conditional navigation, and reporting.
- Phase 8: The Phase 4 insert-at-position/reorder smoke test now runs as automated route tests in `apps/api/test/surveyBuilder.test.ts`.
- Phase 8: Frontend unit tests now cover `surveyFlowGraph.ts` and shared `resolveNextQuestion`.
- Phase 8: Decided changed-branch response handling for reporting: keep historical answers, mark them "not on final path" in reports and exports.
- Phase 8 (post-review): Enforced one-completed-attempt-per-user-per-survey — the start endpoint returns 409 once a completed attempt exists; abandoned attempts permit a fresh start. Resolves the long-standing "decide whether completed attempts should prevent repeat attempts" item.
