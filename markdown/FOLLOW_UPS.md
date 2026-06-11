# Follow-Up Backlog

This file tracks accepted loose ends that should not be forgotten when a phase moves on without implementing them.

Review this file before starting each implementation phase. When a follow-up is completed, move it to the completed section with the phase or commit that resolved it.

---

## Active Follow-Ups

### Auth And Security

- Add rate limiting to `/api/auth/login` and `/api/auth/register` before public exposure or hosted deployment.
- Add maximum password length validation to avoid bcrypt's 72-byte truncation edge case.
- Add an automated backend auth test harness before auth-sensitive behavior grows further.

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
- Decide whether completed survey attempts should prevent later repeat attempts through the start endpoint.
- Hoist pure survey navigation helpers into `packages/shared` if frontend and backend conditional navigation logic grows.
- Extract survey attempt/response lifecycle helpers from `apps/api/src/routes/surveys.ts` before admin reporting adds more table readers.
- Define whether changed branching answers should prune now-unreachable saved responses or keep them as historical response data before reporting.
- Add a live insert-at-position/reorder smoke test for Phase 4 ordering paths.
- Extract Phase 4 survey-builder routes/services from `apps/api/src/routes/surveys.ts` before admin reporting adds more table readers.

### Frontend Validation

- Run browser-based route and layout inspection when a browser automation setup is available.
- Run the Phase 7 manual browser checklist from `prompts/prompt_7.txt` at 360/390/768px widths, including the Phase 5 conditional-jump text-isolation regression check.
- Add a lightweight frontend unit test runner so pure helpers such as `apps/web/src/components/admin/surveyFlowGraph.ts` get committed tests instead of ad hoc verification scripts.

---

## Completed Follow-Ups

- Phase 2: Added a safe local admin seed in `database/seeds/0001_phase_2_seed.sql`.
- Phase 3: Migrated from local-storage bearer JWTs to httpOnly, SameSite cookie auth before persisted survey response data was implemented.
- Phase 4: Added same-survey conditional rule validation, publish-time question requirements, and explicit length bounds for survey builder writes.
- Phase 4: Blocked destructive question/answer-option deletes once response data exists, and blocked returning attempted surveys to draft.
- Phase 4: Hardened insert-at-position display-order shifting to use a two-statement park-then-set pattern.
- Phase 4: Enforced forward-only `JUMP_TO_QUESTION` rule targets.
- Phase 5.1/6: User-run manual browser pass on 2026-06-11 covered the flow map and the multi-page admin workspace; results accepted.
