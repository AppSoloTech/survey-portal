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
- Cross-survey tag rollup: aggregate a hidden tag category across all surveys (internally stored as `tag_key`, e.g. compliance_result everywhere) — per-survey rollup shipped first.
- Global glossary follow-on phases: Phase 39 implements the Admin glossary foundation, Phase 40 implements Admin-only Merriam-Webster dictionary suggestions using environment-held credentials, and Phase 41 renders enabled glossary matches inline for participant question prompts without changing survey logic, responses, reports, hidden tags, or CSV.

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

- Verify the first GitHub Actions run after adding gitleaks and `npm audit`;
  tune or move the secret scan to a separate workflow if repository policy or
  false positives require it.
- Review whether `style-src 'unsafe-inline'` can be removed from the CSP in a
  later styling pass.
- Consider a neutral rename or explanatory comment for `anonymous_rate_limits`,
  which now stores both anonymous and auth-scoped rate-limit buckets.
- Consider a dedicated CSRF signing secret/env var for stronger key separation
  from `JWT_SECRET`.

### Environment And Deployment

- Verify the first run of the Azure deploy workflow (`.github/workflows/main_njsda-wa.yml`) after the Phase 9/10 code is pushed to `main`.
- Configure the Azure Web App application settings for production: `RUN_ENV=prod`, `NODE_ENV=production`, a strong `JWT_SECRET`, `DATABASE_URL` for the hosted PostgreSQL server (connection verified 2026-06-11), and `TRUST_PROXY_HOPS=1`. Decide on a dedicated application database on the hosted server instead of the default `postgres` database, then run `npm run db:migrate` and `npm run admin:provision` against it.
- Apply the security hardening Azure checklist from `notes/security_pass.txt`
  before public pilot: HTTPS-only, minimum TLS, `/api/health/ready` health
  checks, Always On, FTPS/basic publishing restrictions, Key Vault reference
  decision, managed identity, PostgreSQL network/TLS posture, diagnostic logs,
  alerts, Defender recommendations, RBAC least privilege, and restore
  readiness.

### API And Code Quality

- Centralize repeated user SELECT projections if auth query reuse grows.
- Consider a cleanup migration to drop the now-unused `user_profiles.organization`, `user_profiles.job_title`, `user_profiles.location`, `user_profiles.preferred_contact_method`, and `user_profiles.contact_notes` columns after confirming no pre-deploy data needs backfill or retention. Phase 30 keeps those columns/data as legacy metadata but removes them from the cleaned-up self-service and admin profile surfaces.
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
- Phase 41 glossary scope follow-up: confirm whether inline glossary rendering should expand beyond question prompts to survey/page descriptions, question help text, or answer option labels. Phase 41 intentionally applies only to participant-facing question prompt text and Admin preview question prompt text.
- Public/user heading cleanup follow-up: Phase 43 normalized the shared header
  brand and the scoped public/registered-user route headings. Admin-only
  heading hierarchy and any broader heading audit remain deferred with the
  Admin accessibility findings.
- Phase 43 Claude review nits: consider renaming the reusable modal base CSS
  class from feature-specific `contact-email-modal` to a neutral modal class;
  consider resetting or nonce-ing the route live region so consecutive routes
  with the same generic title re-announce; consider jsdom/render-level tests for
  modal Escape, focus containment, inert restore, and return-focus behavior if
  the frontend test harness expands beyond current source-tripwire tests.
- Phase 40 production enablement: before enabling the Merriam-Webster provider
  for client use, confirm whether the Admin-only suggestion UI needs an
  approved Merriam-Webster logo asset in addition to source attribution text.
- Phase 40 provider quota hardening: consider a lightweight lookup throttle or
  per-term cache before enabling Merriam-Webster suggestions for broader Admin
  use.
- Phase 39 glossary polish: if Admin glossary usage grows, reduce update churn
  by avoiding full alias soft-delete/reinsert when only enabled/source fields
  change, and consider making duplicate-match conflict errors identify the
  offending string.
- Phase 26 test hardening: the current participant numeric-progress regression test is a source-text tripwire. Consider adding a render-level web test if the project adopts React Testing Library or another DOM test harness.
- Future dynamic remaining-time model: Phase 27 records lightweight attempt
  activity and capped active-time aggregates, but Phase 26's participant display
  still intentionally uses backend-owned effective survey estimates plus
  question-weight proportions. Build any running prediction model in a later,
  separately reviewed phase.
- Phase 27 manual browser pass remains pending: authenticated and anonymous
  attempts should save page-entry/resume/heartbeat activity while preserving
  current answer, completion, Admin Results, CSV, hidden-tag, and mobile
  behavior.
- Phase 31 optional hardening: add a rate limiter to
  `GET /api/anonymous-survey-directory`; Claude review marked this non-blocking
  but worthwhile because the endpoint is unauthenticated and decrypts listed
  public tokens.
- Phase 29 large-catalog scaling: collapse-all mitigates hundreds of expanded
  tag rows for now, but consider search/filtering, pagination, or virtualization
  if admins routinely manage hundreds of expanded category/value pairs.
- Phase 25 scaling note: `fetchSurveyStructures` computes effective timing on every survey-structure read, including participant/anonymous hot paths, and the median query sorts valid completed attempts. Revisit caching/materializing effective estimates once Phase 26 consumes the field heavily or high-volume surveys make timing reads expensive.

---

## Completed Follow-Ups

- Phase 44: Manual accessibility/browser pass completed 2026-06-27.
  Developer verified invalid login, register missing/invalid fields,
  forgot/reset password success and error states, reset success modal focus
  behavior after status-copy changes, account settings invalid phone and
  successful save, toast/status behavior, dashboard/category pagination
  announcement, keyboard-only and mobile checks at 375/768/1280px, and Admin
  smoke compatibility for shared toasts.
- Phase 43: Manual accessibility/browser pass completed 2026-06-27.
  Developer verified the public/user app shell and modal accessibility changes:
  keyboard route navigation across scoped public and registered-user routes,
  skip-link focus and main-content landing, account disclosure Escape and
  outside-click close behavior with focus return, password reset and anonymous
  follow-up modal focus trap/Escape/return-focus behavior, browser title
  updates, responsive header/menu behavior at 375/768/1280px, and Admin smoke
  navigation for shared-shell regression.
- Phase 43: Screen reader/assistive-technology spot checks completed
  2026-06-27 as part of the developer manual pass; route announcements,
  main-content focus, account disclosure semantics, and modal descriptions/focus
  behavior passed.
- Phase 42: Manual accessibility/browser pass completed 2026-06-27.
  Developer verified the participant runner after the scale radio conversion:
  required unanswered scale validation, selected scale radio value,
  text/integer/selection/Other prompt and helper/error announcements, semantic
  progress, failed save/submit alerts, anonymous follow-up email modal error
  announcement, keyboard-only controls, responsive layouts at 375/768/1280px,
  conditional page/skip logic, and inline glossary prompts.
- Security hardening pass: Manual browser pass completed 2026-06-25.
  Developer verified login/register/logout CSRF flow, password reset
  completion and stale-session rejection, admin role-change stale-session
  rejection plus re-login, public anonymous directory/direct token runner
  without `/api/auth/me`, anonymous start/answer/complete/register flows, and
  public/authenticated responsive layouts at 375/768/1280px.
- Security hardening pass: Claude review completed in
  `notes/claude_review_security_pass.txt`; the blocking logout-to-login CSRF
  cache issue was addressed before commit readiness.
- Security hardening pass: Adjusted the email-keyed login limiter to skip
  successful requests, reducing self-lockout/targeted-lockout friction.
- Security hardening pass: Expanded request logger fallback redaction to cover
  reset and attempt query keys.
- Security hardening pass: Replaced in-memory auth/password-reset rate-limit
  stores with the shared PostgreSQL-backed store and added email/account-aware
  throttles.
- Security hardening pass: Added `users.session_version` JWT validation and
  invalidated existing auth cookies after password reset and admin role changes.
- Phase 32: Manual browser pass completed 2026-06-24. Developer verified
  anonymous completion account creation from the completion panel,
  redirect/dashboard history ownership after conversion, the "Continue
  anonymously" optional follow-up email fallback, and responsive behavior for
  the completion panel/modal.
- Phase 31: Manual browser pass completed 2026-06-24. Developer verified
  default-unlisted anonymous link creation, opt-in listing on
  `/anonymous-surveys`, participant start from a listed card, opt-out/disable/
  expire removal from the directory, and homepage/directory layouts at
  375/768/1280px.
- Phase 29: Manual browser pass completed 2026-06-24. Developer verified
  create/rename/delete tag groups, create a tag directly into a group,
  click-to-move for grouped and ungrouped tags, drag movement between groups
  and Ungrouped, collapse/expand behavior, grouped tag editing, builder hidden
  tag suggestions, and 375/768/1280px layouts.
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
