# Follow-Up Backlog

This file tracks accepted loose ends that should not be forgotten when a phase moves on without implementing them.

Review this file before starting each implementation phase. When a follow-up is completed, move it to the completed section with the phase or commit that resolved it.
- Run a manual browser pass over the round-2 Phase 10 changes: tag catalog listing seeded tags after `npm run db:reset`, dashboard category group cards and /dashboard/category/:categoryId drill-in (375/768/1280px), and the skip-rule builder flow (create multi-skip rules, flow map skip edges, attempt navigation both ways, Results states).
- Consider grouping multi-target skip rules visually in the rules list (one row per skipped question today; grouped display deferred).
- Consider a `skip_rule_covers_all_options` flow-map check (flag when every answer option of a source question skips the same target).
- Consider a batch rules endpoint (`targetQuestionIds[]` in one transaction) if multi-skip rule creation volume grows; the UI currently fans out one POST per skipped question.

---

## Active Follow-Ups

### Auth And Security

- Replace the in-memory auth rate-limit store with a shared store if the API ever scales horizontally.

### Environment And Deployment

- Verify the first run of the Azure deploy workflow (`.github/workflows/main_njsda-wa.yml`) after the Phase 9/10 code is pushed to `main`.
- Configure the Azure Web App application settings for production: `RUN_ENV=prod`, `NODE_ENV=production`, a strong `JWT_SECRET`, `DATABASE_URL` for the hosted PostgreSQL server (connection verified 2026-06-11), and `TRUST_PROXY_HOPS=1`. Decide on a dedicated application database on the hosted server instead of the default `postgres` database, then run `npm run db:migrate` and `npm run admin:provision` against it.

### API And Code Quality

- Centralize repeated user SELECT projections if auth query reuse grows.
- Avoid the redundant `/api/auth/me` fetch immediately after login/register.
- Consider moving the full health response shape, including database status, into `packages/shared`.
- Confirm with the client that the enforced attempt policy matches the business need: a completed attempt blocks new starts (409), while an abandoned attempt allows a fresh start and stays visible in reports as history.
- Migrate `collectFinalPathQuestionIds` in `apps/api/src/services/surveyReporting.ts` onto the shared `resolveAttemptPath` helper (the attempt-service and web walks were consolidated in Phase 10).
- Add reporting pagination and hidden-tag filtering when attempt volume or analysis needs grow.
- The surveys overview fetches one report per non-draft survey for its completion indicator (now only for the visible page); replace with a batched count endpoint if survey count grows.
- Add a lightweight server-paginated survey list endpoint (without full question trees) when survey volume outgrows client-side pagination on the dashboard and admin overview.
- Consider an FK from `answer_tags` to `tag_definitions` (normalization) once catalog usage settles; today the catalog is an independent registry backfilled from saved tags.
- Add an admin view for browsing soft-deleted surveys; deleted surveys are currently reachable only by id (survey, report, attempts, CSV remain available for analytics).
- Add category filters to reporting and CSV export if category-based analysis is requested.

### Frontend Validation

- Run browser-based route and layout inspection when a browser automation setup is available.
- Run the Phase 7 manual browser checklist from `prompts/prompt_7.txt` at 360/390/768px widths, including the Phase 5 conditional-jump text-isolation regression check.
- Run the Phase 8 manual browser checklist from `prompts/prompt_8.txt` (Results tab, attempt detail, CSV spot-check, 360px width).
- Add React component tests when UI behavior grows beyond what pure-helper unit tests cover.
- Run a manual browser pass over the Phase 10 UI changes: centered auth card, integer stepper, scale slider snapping, dashboard category grouping/pagination, attempt route breadcrumbs and refresh recovery, toasts, admin users/tags pages, and survey delete/duplicate flows (including 360/768px widths).

---

## Completed Follow-Ups

- Phase 10 round 2: Reintroduced automated CI checks as a gated job in the Azure deploy workflow — lint, build, and the full test suite run against a postgres:18 service container before packaging, and a red run blocks the deploy.
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
- Phase 9: Added auth rate limiting for login/register and a 72-byte registration password maximum.
- Phase 9: Split health checks into liveness and readiness, kept `/api/health` as readiness, and made readiness query `app_health_check`.
- Phase 9: Added the tracked SQL migration runner with `schema_migrations`, checksum/history validation, idempotent no-op reruns, and explicit `--baseline`.
- Phase 9: Added hosted-safe `npm run admin:provision` and kept local seed execution behind guarded `npm run db:reset`.
- Phase 9: Added GitHub Actions CI for typecheck, lint, build, tests with PostgreSQL, and `git diff --check`.
- Phase 10: Hoisted the attempt navigation walk into shared `resolveAttemptPath` (consumed by `surveyAttempts.ts` and the participant runner); the reporting walk remains as a narrowed follow-up.
- Phase 10: Added admin user management (list + promote/demote with self-change guard), survey categories, survey soft delete with analytics retention, published-survey duplication with rule remapping, and the persistent tag catalog with duplicate detection.
