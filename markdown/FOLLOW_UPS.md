# Follow-Up Backlog

This file tracks accepted loose ends that should not be forgotten when a phase moves on without implementing them.

Review this file before starting each implementation phase. When a follow-up is completed, move it to the completed section with the phase or commit that resolved it.
- Run a manual browser pass over the round-2 Phase 10 changes: tag catalog listing seeded tags after `npm run db:reset`, dashboard category group cards and /dashboard/category/:categoryId drill-in (375/768/1280px), and the skip-rule builder flow (create multi-skip rules, flow map skip edges, attempt navigation both ways, Results states).
- Consider grouping multi-target skip rules visually in the rules list (one row per skipped question today; grouped display deferred).
- Consider a `skip_rule_covers_all_options` flow-map check (flag when every answer option of a source question skips the same target).
- Consider a batch rules endpoint (`targetQuestionIds[]` in one transaction) if multi-skip rule creation volume grows; the UI currently fans out one POST per skipped question.
- Review and merge (or discard) the experiment/dark-mode-and-extras branch: dark mode toggle, dashboard search, results drop-off bars. Manual browser pass in both themes at 375/768/1280px before merging.
- Consider per-option answer distribution in the survey report payload (API + shared type addition) to upgrade the Results funnel bars into true answer-distribution charts.

## Future Features (parked by the developer)

- Email provider selection and real delivery adapter: Phase 16 added a disabled/no-op foundation only. Choose an approved provider (Azure Communication Services, SendGrid, SMTP, or another service), define credential handling in Azure App Service settings, then implement password-reset, anonymous-invite, assignment, or receipt sending in their own phases with opt-in/opt-out handling where applicable.
- Review and merge feature/templates-and-reporting (stacked on the dark-mode branch): duplicate-as-template, resume nudge, report date range + option distribution + tag rollup. Manual browser pass over the Results tab with real data before merging.
- Cross-survey tag rollup: aggregate a hidden tag key across all surveys (e.g. compliance_result everywhere) — per-survey rollup shipped first.
- Global glossary feature: prompt_22's original per-question tooltip scope is superseded. Implement the client-reviewed glossary direction in staged prompts: Admin glossary foundation (`prompts/prompt_28.txt`), dictionary-assisted definition suggestions (`prompts/prompt_29.txt`), and participant inline glossary rendering (`prompts/prompt_30.txt`).

---

## Active Follow-Ups

### Phase 12 Builder Page Split + Organize Tab

- Run a manual browser + responsive pass (375/768/1280px) on the Questions and Organize tabs: page pill rail + jump dropdown, page-scoped add-question, within-page Up/Down; on Organize — drag-reorder pages, drag-reorder questions, drag a question across pages (lands at the drop position), add page, delete empty page, keyboard drag (Tab to handle, Space, arrows, Space), and read-only behavior on a published survey.
- URL deep-link the active page: the Organize "Open in Questions" link now pre-selects the page via router navigation state, but that state is lost on a full reload and is not shareable. Consider reflecting the active page (and optionally a selected survey) in the URL (`?page=`) for a durable, shareable deep link.
- Optional optimistic/local reorder on the Organize board for snappier drag persistence, plus a live cross-page drag preview (today a cross-page drag shows the DragOverlay and re-homes only on drop; within-page reordering already animates).
- Re-check the @dnd-kit React 19 `JSX` global shim (`apps/web/src/jsx-global-shim.d.ts`) when upgrading @dnd-kit or @types/react; remove it if upstream type defs stop referencing the global `JSX` namespace.

### Phase 14 Off-Path Answer Pruning

- Existing data backfill (deferred): the runtime prune only prevents *new* off-path rows. Off-path answers already stored before Phase 14 remain until that attempt is next saved. Decide whether to add a one-time cleanup (script/migration) that prunes pre-existing off-path rows so historical reports correct themselves. Chosen runtime-only for now.
- The `onFinalPath` flag and the "Not on final path" answered badge are now largely vestigial for answered rows (pruning removes them); kept as a safety net for any row that escapes pruning and for `not_reached`/projection states. Its keep-set was migrated onto `resolveProgressivePageState` (Phase 14 review) so it no longer mislabels page-jump branches. Revisit whether to simplify if the safety net proves unnecessary.
- ~~Manual browser pass: take the "Workplace Role Based Survey (copy)", branch to Engineering, answer, go Previous, switch to Sales, complete; confirm in admin Results that the attempt detail shows no Engineering answers and the aggregate "Answers per question" / hidden-tag rollup no longer count them.~~ Done 2026-06-17 (developer verified the repro works).

### Phase 11 Page-Based Flow

- Run the API test suite after explicit approval to reset the local PostgreSQL test schema; sandbox escalation was rejected because the harness drops/recreates `public`.
- Run a manual browser pass over the page-based admin builder and participant runner at 375/768/1280px: page CRUD/reorder, question movement, page batch answer save, previous/next navigation, question jump to a target page, page jump rules, and flow-map labels.
- Optional-question completion gating: the progressive runner blocks completion until every question — including optional ones — has been explicitly visited (a response row exists), because `resolveProgressivePageState` reports an optional question with no saved row as the `currentQuestion`. Decided 2026-06-16 to keep this behavior. Implications to revisit if it becomes a friction point: a participant cannot "Finish early" leaving trailing optional questions un-visited; there is no page-level "skip remaining optional" control; and an optional question whose row is later removed/never created would re-gate completion. If we later want true optional skipping, treat optional questions as satisfied for completion in `validateReachedRequiredQuestions`/`resolveProgressivePageState` rather than gating on row existence.

### Auth And Security

- Replace the in-memory auth rate-limit store with a shared store if the API ever scales horizontally.
- Revisit invalidating existing auth sessions after password reset once the app has a session version, token revocation, or similar server-side session invalidation model. Phase 18 intentionally left existing sessions valid because no revocation model exists yet.

### Environment And Deployment

- Verify the first run of the Azure deploy workflow (`.github/workflows/main_njsda-wa.yml`) after the Phase 9/10 code is pushed to `main`.
- Configure the Azure Web App application settings for production: `RUN_ENV=prod`, `NODE_ENV=production`, a strong `JWT_SECRET`, `DATABASE_URL` for the hosted PostgreSQL server (connection verified 2026-06-11), and `TRUST_PROXY_HOPS=1`. Decide on a dedicated application database on the hosted server instead of the default `postgres` database, then run `npm run db:migrate` and `npm run admin:provision` against it.

### API And Code Quality

- Centralize repeated user SELECT projections if auth query reuse grows.
- Consider a cleanup migration to drop the now-unused `user_profiles.organization`, `user_profiles.job_title`, and `user_profiles.location` columns after confirming no pre-deploy data needs backfill or retention. Phase 20 replaced active profile fields with contact number, preferred contact method, and contact notes.
- Confirm the contact profile fields remain intentionally limited to survey follow-up and do not expand into CRM/account-management workflows; phone number and free-text contact notes are more sensitive PII than the original Phase 19 professional fields.
- Avoid the redundant `/api/auth/me` fetch immediately after login/register.
- Consider moving the full health response shape, including database status, into `packages/shared`.
- Confirm with the client that the enforced attempt policy matches the business need: a completed attempt blocks new starts (409), while an abandoned attempt allows a fresh start and stays visible in reports as history.
- ~~Migrate `collectFinalPathQuestionIds` in `apps/api/src/services/surveyReporting.ts` onto the shared `resolveAttemptPath` helper~~ — superseded in Phase 14: it now uses `resolveProgressivePageState` (the page runtime's resolver) so the `onFinalPath` flag matches what the participant was shown for page-jump surveys.
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
- Run the Phase 19 manual browser pass: Account dropdown to `/settings` at 375/768/1280px, save/reload optional contact profile fields, verify survey stats after starting/completing a registered survey, confirm anonymous attempts do not change the registered user's profile stats, and confirm the Settings password reset cooldown still works.
- Run the Phase 20 manual browser pass: admin reviews the bifurcated Administrators/Standard users sections in `/admin/users`, opens user detail and returns to the list, reviews contact profile/stat tiles, initiates a password reset without seeing token data, confirms standard-user 403 behavior from admin detail/reset endpoints, and checks the admin user list/detail/reset UI at 375/768/1280px.
- Replace `THREE.Clock` in `apps/web/src/components/AmbientBackdrop.tsx` with the supported Three.js timing API or a local `performance.now()` timer. Manual Phase 25 browser testing surfaced the console warning: `THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.`
- Phase 28-30 glossary prompts drafted: build the Admin glossary first, then optional dictionary-assist, then participant inline rendering. Validate that the rendering phase exposes only participant-safe glossary fields and does not affect response data, skip logic, reports, hidden tags, or CSV.
- Phase 26 test hardening: the current participant numeric-progress regression test is a source-text tripwire. Consider adding a render-level web test if the project adopts React Testing Library or another DOM test harness.
- Phase 27 should add lightweight attempt activity instrumentation and active-time aggregation. Phase 26 intentionally uses backend-owned effective survey estimates plus question-weight proportions only; it does not implement running elapsed-time instrumentation.
- Phase 25 scaling note: `fetchSurveyStructures` computes effective timing on every survey-structure read, including participant/anonymous hot paths, and the median query sorts valid completed attempts. Revisit caching/materializing effective estimates once Phase 26 consumes the field heavily or high-volume surveys make timing reads expensive.

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
- Phase 8: Decided changed-branch response handling for reporting: keep historical answers, mark them "not on final path" in reports and exports. **Reversed in Phase 14** — off-path answers are now pruned at save time so stored data matches the respondent's final path (see Phase 14 below).
- Phase 14: Reversed the Phase 8 "keep historical answers" decision. `pruneOffPathAnswers` (`apps/api/src/services/surveyAttempts.ts`) deletes any saved answer not on the recomputed final path after each answer/page save, inside the existing transaction; `survey_response_selected_options` cascades. Scope is "all off-path" (jump-abandoned branches and `HIDE_QUESTION`-hidden answers alike). The aggregate report/tag leak (no final-path filter in `surveyReporting.ts`) self-corrects with no SQL change because the rows no longer exist. The `onFinalPath` machinery and "Not on final path" badge were kept as a safety net.
- Phase 17: Added the anonymous survey foundation: admin-created tokenized public links for published surveys, hashed link secrets, encrypted admin-copyable enabled links, expiration presets, link rotation, shared PostgreSQL-backed anonymous public-route rate limiting, per-attempt anonymous access tokens, anonymous attempt ownership separate from `users.id`, public participant-safe read/start/answer/complete APIs, optional post-completion follow-up email capture, admin Setup controls, and anonymous reporting labels. Future email invitation delivery and recipient-list management remain deferred to later email/invitation phases.
- Phase 21: Manual browser pass completed 2026-06-23. Developer verified admin enables/disables Allow Other on draft single-select and multi-select questions, participant standard-only/Other-only/mixed multi-select submissions, empty selected Other validation, Results and CSV separation of Other text, and no fake Other option or hidden tag behavior.
- Phase 24: Implemented Other hidden tags as question-level admin metadata for system-generated Other, without creating an answer option, editable Other label, or conditional-logic trigger.
- Phase 25: Implemented backend-owned survey completion estimates from valid completed attempts, a published-survey-safe Admin override, participant-safe effective estimate payload support, Admin Setup timing controls, and focused timing API tests.
- Phase 26: Manual browser pass completed 2026-06-23. Developer verified remaining-time display for participant runner, timing derivation/sample behavior including anonymous token-link completion, and accepted the manual testing result.
- Phase 8 (post-review): Enforced one-completed-attempt-per-user-per-survey — the start endpoint returns 409 once a completed attempt exists; abandoned attempts permit a fresh start. Resolves the long-standing "decide whether completed attempts should prevent repeat attempts" item.
- Phase 9: Added auth rate limiting for login/register and a 72-byte registration password maximum.
- Phase 9: Split health checks into liveness and readiness, kept `/api/health` as readiness, and made readiness query `app_health_check`.
- Phase 9: Added the tracked SQL migration runner with `schema_migrations`, checksum/history validation, idempotent no-op reruns, and explicit `--baseline`.
- Phase 9: Added hosted-safe `npm run admin:provision` and kept local seed execution behind guarded `npm run db:reset`.
- Phase 9: Added GitHub Actions CI for typecheck, lint, build, tests with PostgreSQL, and `git diff --check`.
- Phase 10: Hoisted the attempt navigation walk into shared `resolveAttemptPath` (consumed by `surveyAttempts.ts` and the participant runner); the reporting walk remains as a narrowed follow-up.
- Phase 10: Added admin user management (list + promote/demote with self-change guard), survey categories, survey soft delete with analytics retention, published-survey duplication with rule remapping, and the persistent tag catalog with duplicate detection.
