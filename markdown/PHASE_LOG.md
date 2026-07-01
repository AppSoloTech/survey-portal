# Phase Log

This file is durable project memory. Add a new entry after each implementation phase, review, and fix cycle.

Use `markdown/PHASE_TEMPLATE.md` for phase entries.

---

## Phase 65 — Participant Survey Review

Date:
2026-07-01

Status:
Implemented; validation passed; Claude review documentation finding addressed; branch-answer unblock added

Prompt:
`prompts/prompt_65.txt`

Git Commit:
Pending

Review Artifacts:
- Codex handoff: `notes/claude_handoff_phase_65.txt`
- Claude review: `notes/claude_review_phase_65.txt`

## Goals

- Add a participant-facing answer review surface before submission.
- Let participants scan saved answers by page, search/filter review rows, and
  jump back to a question to update an answer.
- Keep the review path-aware for page and question skip logic.
- Preserve hidden-tag privacy, existing attempt access boundaries, and existing
  runner controls.

## Built

- Created `prompts/prompt_65.txt` from the approved Phase 65 plan.
- Added an in-runner `SurveyReviewPanel` reachable from Ready to submit and
  during in-progress attempts.
- Built path-aware review groups from `resolveAttemptPagePath` and
  `visibleQuestionIdsByPageId`, showing only participant-visible questions on
  the current attempt path.
- Added compact review rows with page grouping, participant-visible answer
  summaries, answered/unanswered status, and disabled read-only edit actions
  for completed attempts.
- Added client-side search over page title, question prompt, and visible answer
  text, plus all/answered/unanswered status filters.
- Added a large-survey guardrail: review page groups collapse by default after
  the review exceeds 20 questions, while unanswered or matching groups open.
- Added edit-from-review navigation that reuses the existing question controls,
  saves through the existing answer API path, recomputes the resolved path, and
  returns to review only if the edited question remains visible.
- Added a post-review branch-answer unblock: saved active questions now show
  `Update answer`, and edits to conditional-navigation source questions defer
  to the server's recomputed current state instead of preserving stale reviewed
  page state.
- Preserved existing Previous, Resume, Continue, Submit, Back to assessments,
  anonymous contact email, anonymous registration, and issue-profile
  thermometer behavior.
- Updated participant source guardrail tests, release notes, follow-ups, and
  handoff.

## Important Decisions

### Runner State Instead Of New Route

Decision:
Implement answer review as a runner view state inside `SurveyAttemptPage`.

Reason:
The review surface needs the current hydrated attempt, draft state, path helper,
and existing answer controls. Keeping it inside the runner avoids new routing or
API contract complexity.

Consequence:
No backend, API, shared type, or database changes were introduced.

### Summary Rows Only

Decision:
Render review rows as compact summaries with Edit actions instead of rendering
full answer controls for every question.

Reason:
This keeps hundreds-question surveys manageable and avoids duplicating answer
control logic.

Consequence:
Editing jumps into the existing page/question form and returns to review after
the save path succeeds.

## Impact

- Database/schema impact: none.
- API contract impact: none.
- Frontend UX impact: participants can review answers by page before
  submission, search/filter review rows, and edit visible answers from review.
- Hidden-tag/reporting impact: none; review summaries use only
  participant-visible prompts, answer option text, answer text, numbers, and
  Other text.
- Release impact: `markdown/releases/unreleased.md` includes this
  participant-facing review improvement.

## Validation

- Passed: `npm run test -w apps/web -- SurveyAttemptPage.test.ts`
- Passed: `npm run test -w packages/shared`
- Passed: `npm run typecheck`
- Passed: `npm run lint`
- Passed: `npm run build`
- Passed: `npm run release:check`
- Passed: `git diff --check`

Validation notes:
- `npm run build` emitted the existing Vite large chunk warning.
- Manual browser/accessibility checks are tracked in `markdown/FOLLOW_UPS.md`.

Post-review branch-answer unblock validation:
- Passed: `npm run test -w apps/web -- SurveyAttemptPage.test.ts`
- Passed: `npm run typecheck`
- Passed: `npm run lint`
- Passed: `npm run build`
- Passed: `npm run release:check`
- Passed: `git diff --check`

## Follow-Ups

- Run the Phase 65 manual browser/accessibility pass for registered and
  anonymous review flows, responsive layouts, keyboard navigation, screen reader
  sanity, branch pruning, and large-survey usability.

## Claude Review Notes

Status:
Completed 2026-07-01.

Findings:
- Documentation finding addressed: release summary now mentions both the simpler
  participant question header and the Phase 65 review-before-submit flow.
- Claude verified the Phase 65 docs against code and found the documented scope
  accurate.
- Non-blocking notes on heading levels and handoff naming required no changes.

## Commit Readiness

- Requirements implemented: Yes.
- Product context still aligned: Yes.
- Architecture principles still aligned: Yes; no backend, API, or database
  changes were introduced.
- Security review complete: Yes. Claude verified docs against code; source
  guardrails assert the participant review UI avoids hidden-tag, admin metadata,
  scoring, and severity language.
- Review findings addressed or deferred: Yes.
- Manual testing complete: No; tracked as follow-up.
- Ready to commit: Pending manual acceptance.

---

## Phase 64 — Thermometer Break-Off Explosion

Date:
2026-07-01

Status:
Implemented; validation passed; Claude review addressed; Claude visual overhaul documented

Prompt:
`prompts/prompt_64.txt`

Git Commit:
Pending

Review Artifacts:
- Codex handoff: `notes/claude_handoff_phase_64.txt`
- Claude review: `notes/claude_review_phase_64.txt`

## Goals

- Improve the participant Ready to submit issue-profile thermometer ending
  animation.
- Make the thermometer top visibly break off as part of the final burst.
- Add richer explosion graphics without adding a new animation dependency.
- Preserve existing accessibility, reduced-motion, and hidden-tag privacy
  boundaries.

## Built

- Created `prompts/prompt_64.txt` for the frontend-only polish phase.
- Updated the Ready to submit issue-profile burst to use the existing GSAP
  motion layer for one coordinated timeline.
- Added a decorative break-off thermometer cap, five shard pieces, smoke/puff
  particles, and richer spark motion around the thermometer top.
- Enlarged the thermometer visual and tied the burst origin to the top-center
  of the meter's visual column so the explosion starts from the meter edge.
- Replaced the decorative div/CSS thermometer with an SVG thermometer stage for
  more precise tube, bulb, fill, glow, crack, and burst-ray visuals.
- Reworked the SVG thermometer into a consistent classic thermometer silhouette:
  matching glass/well geometry, tube walls at `x35/x61`, a bulb centered at
  `(48,136)`, a shared stem/bulb silhouette, a thinner cyan glass stroke, and
  interior tick marks.
- Added a continuous `gradientUnits="userSpaceOnUse"` blue-to-red warming
  gradient from bottom to top so tube, bulb, neck, and meniscus sample the same
  ramp instead of restarting per shape.
- Added the missing `--danger-soft` theme token in light and dark mode so the
  orange/red gradient stop renders correctly.
- Added liquid polish: a curved meniscus at the fill top, heat-scaled fill glow
  through `--thermo-heat`, spring fill transitions, and reduced-motion
  transition suppression.
- Made the broken rim a Ready to submit state only: in-progress uses an intact
  rounded cap and Ready to submit uses a jagged broken-glass rim synchronized
  with the burst.
- Moved the burst layer inside the SVG visual wrapper and removed the white
  halo/background so mobile and desktop explosions originate from the meter
  itself instead of a nearby circular glow.
- Kept the existing emoji particles and capped particle selection, now animated
  by the same GSAP timeline as the cap/shard/spark effect.
- Raised the burst self-clear timeout to cover the full max-particle GSAP
  timeline and removed obsolete CSS keyframes from the prior implementation.
- Preserved the existing burst-key replay behavior, static emoji collection,
  polite screen-reader announcement, and reduced-motion suppression of the
  decorative burst layer.
- Post-acceptance participant header cleanup: removed the horizontal assessment
  progress bar and "Page X of Y on your current assessment path" copy from
  question pages while keeping the assessment name, page name, and remaining-time
  label.
- Updated web source guardrail tests, release notes, follow-ups, and handoff.

## Important Decisions

### Reuse GSAP

Decision:
Use the existing `gsap` dependency exported from the shared web motion helper.

Reason:
The web app already depends on GSAP for motion, so this gives the ending burst a
coordinated timeline without adding package or bundle-management churn.

Consequence:
The old CSS-keyframe particle motion is replaced by GSAP-owned movement for the
decorative burst layer.

### Decorative-Only Break-Off

Decision:
Keep cap, shard, puff, spark, and emoji particles inside the existing
`aria-hidden` burst layer.

Reason:
The effect should feel more polished visually without changing issue-profile
meaning, progress semantics, or screen-reader output.

Consequence:
The progressbar value text and polite live-region announcement remain the
participant-facing accessibility surface.

## Impact

- Database/schema impact: none.
- API contract impact: none.
- Frontend UX impact: issue-profile thermometer is a cleaner SVG visual with
  intact and broken states, a continuous blue-to-red warming fill, liquid
  meniscus polish, and a richer Ready to submit burst. Participant question
  headers are also less noisy because they no longer show the horizontal
  assessment progress meter or page-path location copy.
- Hidden-tag/reporting impact: none; participant-facing copy and payloads do
  not expose hidden tags or admin metadata.
- Release impact: `markdown/releases/unreleased.md` includes this
  participant-facing polish.

## Validation

- Passed: `npm run test -w apps/web -- SurveyAttemptPage.test.ts`
- Passed: `npm run typecheck`
- Passed: `npm run lint`
- Passed: `npm run build`
- Passed: `npm run release:check`
- Passed: `git diff --check`
- Claude reported standalone headless-Chromium visual renders for intact and
  broken states in both themes.

Validation notes:
- `npm run build` emitted the existing Vite large chunk warning.
- The current thermometer has not yet been observed in the running app after
  Claude's visual overhaul.
- Manual browser/accessibility checks remain pending and are tracked in
  `markdown/FOLLOW_UPS.md`.

Post-acceptance header cleanup validation:
- Passed: `npm test --workspace apps/web -- SurveyAttemptPage.test.ts`
- Passed: `npm run typecheck --workspace apps/web`

## Follow-Ups

- Run the Phase 64 manual browser/accessibility pass for registered and
  anonymous bursts, replay after navigating away/back to Ready to submit,
  reduced-motion static presentation, light/dark themes, and 375/768/1280px
  layouts.

## Claude Review Notes

Status:
Completed 2026-07-01.

Findings:
- No blockers.
- Addressed max-particle tail clipping by raising the burst self-clear timeout
  from 3400ms to 4600ms.
- Removed dead CSS keyframes left after moving particle/spark motion to GSAP.
- Post-review note: a later client-requested SVG completion-stage enhancement
  replaced the decorative div/CSS thermometer after the Claude review above.
  Automated validation passed, but that newest visual-stage diff has not had a
  separate Claude review.
- Claude follow-up visual overhaul documented the final SVG thermometer shape,
  continuous gradient, missing token fix, meniscus/heat glow, intact/broken rim
  states, and standalone headless-Chromium visual render checks. It also noted
  that the running app transition still needs a quick manual pass.

## Commit Readiness

- Requirements implemented: Yes.
- Product context still aligned: Yes.
- Architecture principles still aligned: Yes; no backend, API, or database
  changes were introduced.
- Security review complete: Partial; Claude review confirmed the participant-safe
  copy and hidden-tag isolation boundaries for the GSAP refactor. The later SVG
  visual overhaul remains frontend-only and participant-safe by source
  guardrail, with no participant metadata exposure.
- Review findings addressed or deferred: Yes.
- Manual testing complete: No; tracked as follow-up.
- Ready to commit: Pending manual acceptance of the running app transition.

---

## Phase 63 — Results Large-Data UX

Date:
2026-07-01

Status:
Implemented; validation passed; Claude review finding addressed

Prompt:
`prompts/prompt_63.txt`

Git Commit:
Pending

Review Artifacts:
- Codex handoff: `notes/claude_handoff_phase_63.txt`
- Claude review: `notes/claude_review_phase_63.txt`

## Goals

- Reduce noise on the Admin Results page.
- Make the summary body collapsible while keeping date filters, Refresh, and
  CSV export reachable.
- Replace the all-attempts Results rendering with a large-data-friendly,
  server-paginated attempts browser.

## Built

- Added page/pageSize validation to `GET /api/surveys/:id/attempts` with
  defaults of page 1 and page size 25 and a maximum page size of 100.
- Updated the attempts reporting service to use a filtered SQL count query and
  SQL-level `limit`/`offset` pagination, ordered by
  `started_at desc nulls last, id desc`.
- Extended the shared attempts response with pagination metadata:
  `page`, `pageSize`, `totalCount`, `totalPages`, `hasNextPage`, and
  `hasPreviousPage`.
- Split the Results page loading so summary/tag catalog fetches are separate
  from attempts-page fetches. Attempts page changes no longer refetch the
  report summary or tag catalog.
- Added a summary disclosure control with `aria-expanded` and
  `aria-controls`; collapsed state hides summary counts, question stats, option
  distributions, and hidden-tag rollup only.
- Added a denser table-like attempts browser with visible range context,
  Previous/Next controls, and 25/50/100 page-size choices.
- Adjusted the attempts browser responsive breakpoint so tablet-width layouts
  use stacked rows instead of clipping the Review action column.
- Preserved single-panel attempt detail loading, review-tag editing, hidden-tag
  rollup semantics, CSV date-range export, and Admin-only authorization.

## Important Decisions

### Beyond-Range Pages

Decision:
The API returns an empty bounded page with accurate metadata when a requested
page is beyond the result set. The frontend detects that condition and clamps
to the last available page.

Reason:
This keeps the API contract simple, avoids surprise redirects in a read
endpoint, and still gives the UI enough information to recover from stale page
state.

### Summary And Attempts Loading

Decision:
Date-range changes and Refresh reload both summary and attempts. Attempts-page
and page-size changes reload only the attempts endpoint.

Reason:
The report summary/tag catalog are denser and more expensive data. Paging
through participant rows should not churn them.

## Architecture Notes

- Database/schema impact: none.
- API contract impact: `GET /api/surveys/:id/attempts` is now paginated and
  returns pagination metadata.
- Auth or authorization impact: none; reporting routes remain Admin-only.
- Participant/anonymous impact: none.
- Hidden-tag visibility impact: none; Admin Results still shows internal
  metadata only to admins.
- Deferred work: hidden-tag filtering remains a future reporting feature.

## Validation

Commands run:

```bash
npm run typecheck
npm run lint
npm run test -w apps/api -- test/reporting.test.ts
npm run test -w apps/web -- SurveyResultsPage
npm run build
npm test
npm run release:check
git diff --check
```

Results:

- Passed: `npm run typecheck`.
- Passed: `npm run lint`.
- Passed with approved local DB access:
  `npm run test -w apps/api -- test/reporting.test.ts` (31 tests).
- Passed: `npm run test -w apps/web -- SurveyResultsPage` (3 tests).
- Passed: `npm run build` (Vite emitted the existing large-chunk warning).
- Passed with approved local DB access: `npm test`.
  - shared: 71 tests
  - web: 108 tests
  - API: 318 tests
  - release: 9 tests
  - loadtest: 29 tests
- Passed: `npm run release:check`.
- Passed: `git diff --check`.

Problems encountered:

- Initial sandboxed focused API test command could not connect to local
  PostgreSQL (`EPERM 127.0.0.1:5432`) and used the wrong Vitest filter before
  setup ran.
- First approved focused API run hit auth registration rate limiting in the
  pagination fixture. The fixture was changed to seed user/attempt records
  directly in the test database.

## Follow-Up Tasks

- None.

## Commit Readiness

- Requirements implemented: Yes.
- Codex handoff created: Yes.
- Product context still aligned: Yes.
- Architecture principles still aligned: Yes.
- Security review complete: Yes; Claude review found no boundary issues.
- Review findings addressed or deferred: Yes; tablet layout clipping finding
  addressed.
- Manual testing complete: Not run.
- Ready to commit: Yes.

## Claude Review Notes

Source:

- `notes/claude_review_phase_63.txt`

Status:

- Completed; accepted with one layout fix.

Findings and disposition:

- Tablet-width attempts grid clipping risk: addressed by switching the Results
  attempts browser to stacked rows at `max-width: 56.25rem` (900px), before the
  desktop grid can clip the Review action column.

---

## Phase 62 — Tag Category Emoji Inheritance

Date:
2026-07-01

Status:
Implemented; validation passed; Claude review accepted

Prompt:
`prompts/prompt_62.txt`

Git Commit:
Pending

Review Artifacts:
- Codex handoff: `notes/claude_handoff_phase_62.txt`
- Claude review: `notes/claude_review_phase_62.txt`

## Goals

- Fix the Admin Tags workflow so new catalog tags inherit a tag-key category
  emoji when the category already has one shared emoji.
- Preserve explicit per-tag emoji overrides.
- Avoid guessing when the category emoji has been cleared or existing matching
  tags have conflicting emoji values.
- Keep participant payloads limited to emoji/count aggregates and never expose
  hidden tag identities.

## Built

- Added `fetchCommonTagKeyEmoji` in `apps/api/src/routes/tags.ts` to find the
  one shared non-null emoji for an existing `tag_key`.
- Updated `POST /api/tags` so blank, null, or omitted create-time emoji values
  inherit that common emoji when it exists.
- Preserved explicit create-time emoji values as intentional overrides.
- Left `PUT /api/tags/category-emoji` behavior unchanged: it still applies or
  clears emoji for existing definitions with the selected `tagKey`.
- Added focused API regressions covering inherited emoji, explicit override,
  cleared category emoji, mixed/ambiguous emoji values, and existing non-admin
  route protection.
- Updated unreleased notes and created the Phase 62 handoff.

## Important Decisions

### Tag-Key Category Source

Decision:
Use the existing tag-key category model for inheritance, matching the Admin Tags
`Apply emoji to tag category` action.

Reason:
Phase 60 introduced category emoji as a `tag_definitions.tag_key` bulk action,
not as metadata on visual `tag_groups`. Phase 62 is a bug fix for that existing
workflow and does not add a new `tag_groups.emoji` schema concept.

Tradeoff:
Visual tag groups remain independent organization sections. If the client later
means group-section emoji inheritance, that should be a separate schema/product
phase.

### Ambiguous Emoji Handling

Decision:
Inherit only when exactly one non-null emoji exists for matching tag
definitions.

Reason:
This preserves clear category defaults while avoiding a silent guess when admins
have intentionally set different per-tag emoji values.

Tradeoff:
If a category has mixed emoji values, admins must choose an explicit emoji for
the new tag or reapply the category emoji first.

Clarification:
Matching rows with null emoji do not block inheritance. If a tag key has one
distinct non-null emoji plus any number of null emoji rows, a new blank tag
inherits that one non-null emoji.

## Architecture Notes

- Database/schema impact: none.
- API contract impact: no new endpoint; `POST /api/tags` now stores an inherited
  emoji in the created tag response when the request does not provide one and a
  single category default exists.
- Auth or authorization impact: none; `/api/tags` routes remain Admin-only.
- Data privacy or visibility impact: participant and anonymous payloads remain
  unchanged and continue to expose only emoji/count aggregates.
- Frontend UX impact: no UI changes. The existing Admin Tags create form sends
  `null` for blank emoji, which now inherits a server-side category default
  where appropriate.
- Environment or deployment impact: none.

## Validation

Commands run:

```bash
npm run test -w apps/api -- tagCatalog
npm run typecheck
npm run lint
npm run release:check
npm run build
git diff --check
npm test
```

Results:

- Initial sandboxed focused API command could not connect to local PostgreSQL
  (`EPERM 127.0.0.1:5432`); rerun with approved local DB access passed.
- Passed with approved local DB access:
  `npm run test -w apps/api -- tagCatalog` (22 tests).
- Passed: `npm run typecheck`.
- Passed: `npm run lint`.
- Passed: `npm run release:check`.
- Passed: `npm run build` (Vite emitted the existing large chunk warning).
- Passed: `git diff --check`.
- Passed with approved local DB access: `npm test`.
  - shared: 71 tests
  - web: 106 tests
  - API: 313 tests
  - release: 9 tests
  - loadtest: 29 tests

Manual tests:

- Passed by developer on 2026-07-01. Manual QA confirmed the Phase 62 Admin
  Tags emoji inheritance workflow after automated validation.

Phase closeout artifacts:

- Codex handoff created before final implementation summary: Yes.
- Handoff path: `notes/claude_handoff_phase_62.txt`
- Claude review status before commit: Accepted.

## Claude Review Notes

Source:

- `notes/claude_review_phase_62.txt`

Status:

- Completed; clean, correctly scoped, safe to accept.

Findings and disposition:

- No blocking findings.
- Accepted clarification: partial-null inheritance is intentional. Matching
  rows with null emoji do not block inheritance when there is exactly one
  distinct non-null emoji for the tag key.
- Confirmed Phase 62 closes only `notes/1.0_test_notes.txt` item 1. Results
  summary collapse and large-data presentation remain split into Phase 63.

## Problems Encountered

- Problem: Focused API tests need local PostgreSQL access and the sandbox blocks
  `127.0.0.1:5432`.
  Resolution: Reran focused API and full test suites with approved local DB
  access.

## Follow-Up Tasks

- None.

## Commit Readiness

- Requirements implemented: Yes.
- Codex handoff created: Yes.
- Product context still aligned: Yes.
- Architecture principles still aligned: Yes.
- Security review complete: Yes; Claude review accepted and server-side
  Admin-only route protections are unchanged and covered by existing tests.
- Review findings addressed or deferred: Yes; no blockers, clarification
  documented.
- Manual testing complete: Yes.
- Ready to commit: Yes.

---

## Phase 61 — Category All Review Tags

Date:
2026-06-30

Status:
Implemented; validation passed; Claude review finding addressed

Prompt:
`prompts/prompt_61.txt`

Git Commit:
Pending

Review Artifacts:
- Codex handoff: `notes/claude_handoff_phase_61.txt`
- Claude review: `notes/claude_review_phase_61.txt`

## Goals

- Add an admin-only category `<ALL>` convenience action for review tags on text
  answers.
- Keep `<ALL>` virtual so no system tag rows are created in
  `tag_definitions`.
- Persist category-level bindings so future category tags propagate to
  previously bound submitted answers.
- Preserve Admin Tags management, reporting, CSV, and participant privacy
  boundaries.

## Built

- Added `response_answer_tag_groups` and
  `response_answer_tag_group_tags` to persist category-all review tag bindings
  and inherited tag sources without creating `<ALL>` tag definition rows.
- Split Phase 61 schema into `0040_response_answer_tag_groups.sql` and
  `0041_response_answer_tag_group_sources.sql` so dev databases that had already
  applied the initial `0040` draft keep a valid migration checksum.
- Added an admin-only category review-tag endpoint that stores the binding and
  bulk-inserts all real tag definitions for a category into
  `response_answer_tags`.
- Reused the existing answered-text validation and `response_answer_tags`
  uniqueness constraint for idempotency.
- Added tag catalog propagation so tags created, edited, or moved into a bound
  category are inserted onto already-bound answers.
- Added tag catalog cleanup so tags moved out of a bound category are removed
  from bound answers when they were inherited-only.
- Added category deletion cleanup so inherited-only expanded review tags are
  removed before category binding/source rows cascade away.
- Updated the Survey Results review-tag dropdown to synthesize
  `<ALL> - Apply all in {category}` options for categories not yet bound to the
  answer.
- Updated the Questions tab hidden-tag add and existing tag forms so choosing
  visible value `<ALL>` creates a living auto-apply subscription for the
  selected tag category on option tags, Other tags, and text/integer value tags.
- Added `hidden_tag_all_bindings`,
  `hidden_tag_all_binding_tags`, and `is_manual` flags on builder hidden-tag
  tables so inherited hidden tags can sync with the tag catalog while manual
  hidden tags remain sticky.
- Added hidden-tag propagation from Admin Tags so created, edited, and deleted
  catalog values sync to option, Other, and text/integer value-tag targets with
  active `<ALL>` subscriptions.
- Added migration `0042_hidden_tag_all_marker_backfill.sql` to backfill existing
  marker targets with all current catalog values.
- Added migration `0043_hidden_tag_all_bindings.sql` to convert older
  `All`/`<ALL>` marker targets into real hidden-tag subscriptions and remove
  marker rows.
- Added a `Stop` control for category auto-apply that removes inherited-only
  tags while preserving manual tags.
- Suppressed individual remove buttons for inherited-only review chips so Stop
  remains the clear removal path for category-applied tags.
- Kept `<ALL>` out of persisted review chips, CSV values, report aggregates,
  tag catalog rows, and Admin Tags management.
- Added focused API and web guardrail tests for virtual category application.
- Updated release notes, follow-ups, and phase handoff.

## Important Decisions

### Virtual Selector

Decision:
Use a virtual dropdown selector and category bulk endpoint rather than real
`<ALL>` rows in `tag_definitions`.

Reason:
The virtual approach satisfies the admin workflow without fake catalog rows,
seed changes, category-delete orphaned tag definitions, or extra filtering
across every tag catalog/reporting query.

Tradeoff:
The app now needs a small binding table and propagation hooks in tag catalog
mutations so future category membership changes reach previously bound answers.
The app also tracks inherited tag sources separately from manual tags so synced
category removals do not erase manual review work.

### Living Binding

Decision:
Future tags added or moved into a category must propagate to answers where the
category `<ALL>` selector was already applied, including completed/submitted
attempts.

Reason:
The product owner clarified that category all should remain semantically tied
to the category over time, not just bulk-apply the current tag set.

Tradeoff:
Inherited category tags stay in parity with the category. Manual tags are
sticky and remain until the admin removes them.

## Architecture Notes

- Database/schema impact: additive `response_answer_tag_groups` in migration
  `0040`, `response_answer_tags.is_manual` and
  `response_answer_tag_group_tags` in migration `0041`, plus builder
  hidden-tag subscription tables and manual flags in migration `0043`.
- API contract impact: added a category bulk-add review-tag action under the
  existing admin survey reporting route plus a category stop-auto-apply action;
  admin attempt answers and review-tag mutation responses include
  `reviewTagGroupIds`, and review tag payloads include `isManual`.
- Auth or authorization impact: no model change; the new action is admin-only
  and validates the same survey/attempt/answered text ownership as individual
  review tags.
- Data privacy or visibility impact: participant and anonymous payloads remain
  unchanged; `<ALL>` is never persisted or exposed as a tag value.
- Frontend UX impact: Survey Results text-answer review-tag dropdown now shows
  `<ALL> - Apply all in {category}` for categories not yet bound to the answer
  and `Auto-applying all in {category}` bindings with Stop controls;
  inherited-only chips do not show individual remove buttons. Questions tab
  hidden-tag add and existing tag forms now show a visible `<ALL>` value once a
  catalog category is selected, then render a managed `<ALL>` subscription row
  with Stop controls and inherited-only rows marked as managed.
- Reporting impact: submitted attempts read current hidden tags from the survey
  structure, so propagated hidden-tag values appear in admin detail/reporting
  for both existing and future attempts.
- Environment or deployment impact: none.

## Validation

Commands run:

```bash
npm run test -w apps/web -- SurveyQuestionsPage.test.ts SurveyResultsPage.test.ts
npm run test -w apps/api -- test/tagCatalog.test.ts test/reporting.test.ts test/surveyBuilder.test.ts
npm run typecheck
npm run lint
npm run build
npm run db:migrate
npm run release:check
npm test
git diff --check
git diff --check -- database/migrations/0040_response_answer_tag_groups.sql database/migrations/0041_response_answer_tag_group_sources.sql packages/shared/src/index.ts apps/api/src/services/surveyReporting.ts apps/api/src/routes/surveyReportingRoutes.ts apps/api/src/routes/tags.ts apps/api/test/helpers/setup.ts apps/api/test/reporting.test.ts apps/web/src/api/surveys.ts apps/web/src/pages/admin/SurveyResultsPage.tsx apps/web/src/pages/admin/SurveyResultsPage.test.ts apps/web/src/styles.css markdown/releases/unreleased.md markdown/FOLLOW_UPS.md markdown/PHASE_LOG.md notes/claude_handoff_phase_61.txt notes/claude_review_phase_61.txt prompts/prompt_61.txt
```

Results:

- Passed: `npm run test -w apps/web -- SurveyResultsPage.test.ts`
- Passed after builder hidden-tag `<ALL>` update:
  `npm run test -w apps/web -- SurveyQuestionsPage.test.ts SurveyResultsPage.test.ts`
- Initial sandboxed API test could not connect to local PostgreSQL
  (`EPERM 127.0.0.1:5432`); rerun with approved local DB access passed:
  `npm run test -w apps/api -- test/reporting.test.ts`
- After the living-binding update, focused API reporting tests passed again
  with approved local DB access and applied Phase 61 migrations.
- After the 100% parity update, focused API reporting tests passed again with
  25 tests, covering move-out removal, manual preservation, and Stop
  auto-apply.
- After Claude's second review, focused API reporting tests passed again with
  26 tests, covering category deletion cleanup and inherited/manual payload
  source flags.
- After the migration split, local `npm run db:migrate` passed and applied
  `0041_response_answer_tag_group_sources.sql`.
- After the builder hidden-tag subscriber update, local `npm run db:migrate`
  passed and applied `0043_hidden_tag_all_bindings.sql`; a follow-up run
  reported no pending migrations.
- Passed after the builder hidden-tag subscriber update:
  `npm run test -w apps/api -- test/tagCatalog.test.ts test/reporting.test.ts test/surveyBuilder.test.ts`
  (73 tests)
- Passed after addressing Claude's builder-side coverage finding:
  `npm run test -w apps/api -- test/tagCatalog.test.ts test/reporting.test.ts test/surveyBuilder.test.ts test/surveyDuplicate.test.ts`
  (83 tests)
- Passed after the builder hidden-tag subscriber update:
  `npm run test -w apps/web -- SurveyQuestionsPage.test.ts SurveyResultsPage.test.ts`
- Passed: `npm run typecheck`
- Passed: `npm run lint`
- Passed: `npm run build`
- Passed: `npm run release:check`
- Passed with approved local DB access after the parity update: `npm test`
- Passed with approved local DB access after the second-review fixes:
  `npm test` (shared 71, web 105, API 306, release 9, loadtest 29)
- Passed with approved local DB access after the migration split:
  `npm test` (shared 71, web 105, API 306, release 9, loadtest 29)
- `git diff --check` reported unrelated trailing whitespace in
  `notes/game_plan-test_notes.txt`, which was already modified outside this
  phase and left untouched.
- Passed for Phase 61 files: scoped `git diff --check -- ...`

Manual tests:

- Passed by developer on 2026-07-01. Manual QA covered the admin/user
  process for category `<ALL>` review tags and builder hidden-tag `<ALL>`
  subscriptions, including future Admin Tags propagation to submitted answers.

Phase closeout artifacts:

- Codex handoff created before final implementation summary: Yes.
- Handoff path: `notes/claude_handoff_phase_61.txt`
- Claude review status before commit: Completed; product finding addressed.

## Claude Review Notes

Source:

- `notes/claude_review_phase_61.txt`

Status:

- Completed; no blockers in original review. Product-signoff finding and
  second-review polish items were addressed.

Critical issues:

- None.

Suggested improvements:

- Claude noted that snapshot versus living binding needed product sign-off.
  The product owner confirmed living propagation is required.
- Claude's second review noted inherited chips had a misleading remove button
  and category deletion left inherited-only expanded tags behind.
- Claude's builder hidden-tag subscription review found the architecture sound
  but requested stronger behavioral coverage before broad manual QA.

Accepted fixes:

- Reworked Phase 61 from snapshot bulk apply to living category binding.
- Reworked inherited tag tracking so moved-out category tags are removed from
  subscribed answers unless the tag was also manually applied.
- Added `isManual` to review tag payloads and hid individual remove buttons for
  inherited-only chips.
- Added category deletion cleanup for inherited-only expanded review tags.
- Added builder-side API regressions for question value subscriptions, Other
  subscriptions, catalog rename/delete propagation, Stop/manual preservation,
  individual hidden-tag delete downgrade behavior, and duplicate-survey binding
  copy.

Deferred findings:

- None from the current review.

## Problems Encountered

- Problem: The original phase prompt considered real `<ALL>` tag rows, which
  would have increased schema and leakage risk.
  Resolution: Prompt 61 was revised before implementation to require a virtual
  selector design.
- Problem: Claude review identified snapshot semantics as a product decision.
  Resolution: The product owner confirmed future tags must propagate to
  submitted answers; implementation was updated to persist category bindings.
- Problem: Product owner confirmed 100% category parity should remove tags that
  leave a subscribed category while preserving manually added tags.
  Resolution: Added inherited source tracking and category stop-auto-apply.
- Problem: Second Claude review found category deletion did not mirror move-out
  parity and inherited-only chips offered a misleading remove action.
  Resolution: Category deletion now removes inherited-only expanded tags before
  cascades, and review tag chips expose/use `isManual` so only manual chips have
  individual removal.
- Problem: Local `npm run db:migrate` found a checksum mismatch because the
  initial `0040` draft had already been applied before later schema additions
  were folded into the same migration file.
  Resolution: Restored `0040` to its applied checksum and moved the manual flag
  plus inherited source table into new migration `0041`.
- Problem: Manual screenshot showed the expected `<ALL>` value was missing from
  the Questions tab hidden-tag value dropdown.
  Resolution: Added a visible virtual `<ALL>` value to builder hidden-tag add
  forms and expanded it client-side into the selected category's real catalog
  values.
- Problem: Manual testing showed new Admin Tags values did not propagate to
  answer options/questions that had previously used hidden-tag `<ALL>`/`All`.
  Resolution: Added server-side hidden-tag propagation when catalog values are
  created or updated; targets with an `All`/`<ALL>` marker receive the new value,
  and migration `0042` backfills existing marker targets.

## Follow-Up Tasks

- Run the Phase 61 manual browser pass tracked in `markdown/FOLLOW_UPS.md`.

## Commit Readiness

- Requirements implemented: Yes.
- Codex handoff created: Yes.
- Product context still aligned: Yes.
- Architecture principles still aligned: Yes.
- Security review complete: Claude review completed; second-review polish items
  addressed.
- Review findings addressed or deferred: Product-signoff finding and
  second-review polish items addressed.
- Manual testing complete: No; tracked as follow-up.
- Ready to commit: Pending optional re-review and manual acceptance.

---

## Phase 60 — Issue Profile Emoji Burst

Date:
2026-06-30

Status:
Implemented; validation passed; Claude review addressed

Prompt:
`prompts/prompt_60.txt`

Git Commit:
This commit (`Add issue profile thermometer and emoji burst`)

Review Artifacts:
- Reference images: `game_info/meter.png`, `game_info/image.png`
- Codex handoff: `notes/claude_handoff_phase_60.txt`
- Claude review: `notes/claude_review_phase_60.txt`

## Goals

- Add admin-managed emoji metadata to hidden tag catalog definitions.
- Compute participant-safe emoji/count aggregates from matched hidden tags
  without exposing tag keys, values, IDs, group names, or category labels.
- Add a capped CSS/DOM emoji burst from the issue profile thermometer on the
  Ready to submit screen.
- Preserve reduced-motion and screen-reader behavior.

## Built

- Added migration `0039_tag_definition_emoji.sql` with nullable
  `tag_definitions.emoji`.
- Added `emoji` to shared/admin tag definition types and Admin Tags create/edit
  UI.
- Enriched hidden-only survey tag structures with catalog emoji metadata via
  key/value joins.
- Added shared `SurveyIssueProfileEmojiCollection` and frequency-based
  aggregation.
- Added `issueProfileEmojiCollection` to registered and anonymous start/resume,
  answer, complete, and contact-email refresh payloads.
- Added a Ready to submit emoji burst, static collected emoji chips, and
  reduced-motion particle suppression in the survey runner.
- Added an admin tag-category emoji action that applies one emoji across all
  existing catalog values for a hidden tag category.
- Refined the burst after manual review so it replays when returning to Ready
  to submit, uses a slower upward burst, continues into a smoother falling arc,
  and includes decorative spark particles.
- Adjusted screen-reader announcements so the emoji/profile live region only
  announces the meaningful collected-details event, not every fill percentage
  update.
- Added a static emoji chip overflow indicator and per-chip accessible count
  text.
- Added focused shared/API/web guardrail tests.

## Important Decisions

### Emoji-Only Participant Payload

Decision:
Participants receive only emoji/count aggregate items and a total count.

Reason:
Emoji can make the runner feel more game-like without exposing hidden tag
identity or admin category metadata.

Consequence:
The runner does not show tag keys, values, IDs, group names, category labels, or
selected tag names.

### Frequency-Based Counts

Decision:
Every matched selected-option, Other, or value tag with emoji contributes one
count.

Reason:
The final burst should represent repeated themes gathered through the attempt,
not just unique category presence.

Consequence:
Multiple tag definitions sharing one emoji aggregate into the same emoji count.

### CSS/DOM Burst

Decision:
Use capped DOM emoji particles instead of canvas or a new animation dependency.

Reason:
This keeps the implementation accessible, testable, and consistent with the
current runner.

Consequence:
The burst caps at 40 particles, uses weighted representation for larger totals,
and falls back to static emoji chips for reduced-motion users.

## Impact

- Database/schema impact: additive nullable `tag_definitions.emoji`.
- API contract impact: runner payloads now include
  `issueProfileEmojiCollection`.
- Frontend UX impact: Admin Tags has an optional emoji field; participants see a
  Ready to submit emoji burst and static collected emoji chips.
- Hidden-tag/reporting impact: hidden tag identities remain excluded from
  participant and anonymous payloads; admin reporting is unchanged.
- Release impact: Phase 60 notes are folded into
  `markdown/releases/v1.0.0.md`; `markdown/releases/unreleased.md` is reset for
  the next release.

## Validation

- Passed: `npm run test -w packages/shared -- surveyIssueProfileProgress`
- Passed: `npm run test -w apps/web -- SurveyAttemptPage.test.ts`
- Passed: `npm run test -w apps/api -- tagCatalog`
- Passed with approved local PostgreSQL access:
  `npm run test -w apps/api -- test/issueProfileProgress.test.ts`
- Passed: `npm run typecheck`
- Passed: `npm run lint`
- Passed: `npm run build`
- Passed: `npm run release:check`
- Passed: `git diff --check`

Validation notes:
- The first sandboxed API test could not connect to local PostgreSQL at
  `127.0.0.1:5432`; the focused API test passed after approved local database
  access.
- `npm run build` emitted the existing Vite large chunk warning.
- Manual browser and assistive-technology checks remain pending and are tracked
  in `markdown/FOLLOW_UPS.md`.

## Follow-Ups

- Run the Phase 60 manual browser/accessibility pass for admin emoji editing,
  registered and anonymous bursts, reduced-motion static presentation, and
  hidden-tag privacy sanity.

## Claude Review Notes

Status:
Completed 2026-06-30.

Findings:
- No blockers.
- Addressed live-region chattiness by announcing only the Ready to submit
  collected-details event.
- Addressed release-note placement by folding Phase 60 bullets into
  `v1.0.0.md`.
- Addressed collected-emoji chip overflow with a `+N` chip.
- Addressed per-chip accessibility by removing the collection-level label and
  exposing visible chip counts through visually hidden text.
- Accepted stacked Phase 59/60 commit boundary as pending user direction.

## Commit Readiness

- Requirements implemented: Yes.
- Product context still aligned: Yes.
- Architecture principles still aligned: Yes; migration is additive and
  participant payload remains aggregate-only.
- Security review complete: Yes; Claude review found the privacy model sound
  and automated visibility tests confirm hidden tags remain excluded from
  participant and anonymous payloads.
- Review findings addressed or deferred: Yes.
- Manual testing complete: No; tracked as follow-up.
- Ready to commit: Pending manual acceptance.

---

## Phase 59 — Participant Issue Profile Thermometer

Date:
2026-06-30

Status:
Implemented; validation passed; Claude review addressed

Prompt:
`prompts/prompt_59.txt`

Git Commit:
This commit (`Add issue profile thermometer and emoji burst`)

Review Artifacts:
- Planning note: `notes/game_plan.txt`
- Codex handoff: `notes/claude_handoff_phase_59.txt`
- Claude review: `notes/claude_review_phase_59.txt`

## Goals

- Add a participant-facing thermometer that represents an issue profile being
  built, not a score, severity rating, violation count, or percentage of
  violations.
- Preserve hidden-tag privacy by computing thermometer state server-side and
  returning only aggregate participant-safe progress.
- Treat one issue category as one unique hidden `tagKey`.
- Include registered and anonymous survey attempt flows.
- Promote the feature-complete release to `v1.0.0`.

## Built

- Added shared `SurveyIssueProfileProgress` response data and
  `calculateSurveyIssueProfileProgress`.
- Added issue profile progress to authenticated and anonymous start/resume,
  answer, and complete payloads.
- The API computes the aggregate from a hidden-tag-aware survey structure but
  returns only `fillPercent`, aggregate counts, and abstract status.
- Identified categories include selected answer option tags, Other tags when
  Other text is present, and matching text/integer value tags.
- Encountered categories are based on tag-bearing questions reached/revealed so
  far.
- Added a separate accessible issue profile thermometer to the participant
  runner while preserving the existing horizontal assessment progress meter.
- Moved the thermometer into a single sticky runner header so it remains visible
  above the question and completion panels.
- The runner now follows the current server aggregate during normal progress,
  allowing the fill to decrease when an answer change removes an identified
  category.
- Added a ready-to-submit display rule that fills the thermometer to `100`
  before final submission when at least one category has been identified.
- Added distinct `complete_empty` participant copy for submitted attempts with
  no profile details.
- Added a polite screen-reader status mirror for issue profile thermometer
  changes.
- Updated the thermometer fill to a cool-to-warm gradient that starts with cool
  colors near the bottom and reaches red at the top, while keeping participant
  copy abstract and non-scoring.
- Added tests for aggregation behavior, branch/off-path handling, authenticated
  and anonymous API payloads, hidden-tag isolation, and web source guardrails.
- Created `prompts/prompt_59.txt`.
- Prepared release `v1.0.0` and reset `markdown/releases/unreleased.md`.

## Important Decisions

### Keep Tag Identity Server-Side

Decision:
Participants receive only aggregate issue-profile progress.

Reason:
Hidden tags are internal business metadata and must not be exposed to
participants.

Consequence:
The UI does not show category names, tag keys, tag values, or category counts.

### Unique `tagKey` Category Unit

Decision:
One issue category equals one unique hidden `tagKey`.

Reason:
This matches the planning assumption and avoids value-level scoring behavior.

Consequence:
Multiple selected values with the same tag key count as one identified category.

### Allow Answer-Change Decrements

Decision:
The server returns the raw aggregate `fillPercent`, and the web runner displays
that current value during normal in-progress pages.

Reason:
If a participant changes a tagged answer to an untagged answer, the issue
profile should reflect the current saved response set rather than preserve stale
visual progress.

Consequence:
The thermometer can decrease during normal progress after answer changes. This
is intentional and keeps the displayed aggregate aligned with saved responses.

### Ready-To-Submit Completion Display

Decision:
When the participant reaches the Ready to submit screen with at least one
identified category, the runner displays the thermometer at `100` before final
submission.

Reason:
The participant has completed the reachable assessment path, but the durable API
aggregate should not mark the attempt complete until submission.

Consequence:
The `100` pre-submit fill is a runner display rule only; shared/API aggregate
semantics remain unchanged.

## Impact

- Database/schema impact: none.
- API contract impact: registered and anonymous runner payloads now include
  `issueProfileProgress`.
- Frontend UX impact: participant attempt pages show a sticky compact
  thermometer in addition to the existing assessment progress meter.
- Auth/authorization impact: no model change.
- Hidden-tag/reporting impact: hidden tag identities remain excluded from
  participant and anonymous payloads; Admin reporting behavior is unchanged.
- Release impact: root app version is now `1.0.0` with
  `markdown/releases/v1.0.0.md`.

## Validation

- Passed: `npm run test -w packages/shared -- surveyIssueProfileProgress`
- Passed: `npm run test -w apps/web -- SurveyAttemptPage.test.ts`
- Passed after `npm run build -w packages/shared`: `npm run test -w apps/api -- issueProfileProgress`
- Passed after final thermometer polish: `npm run test -w apps/web -- SurveyAttemptPage.test.ts`
- Passed after test-notes polish: `npm run test -w apps/web -- SurveyAttemptPage.test.ts`
- Passed after test-notes polish: `npm run test -w apps/api -- test/issueProfileProgress.test.ts`
- Passed after Claude review polish: `npm run test -w apps/web -- SurveyAttemptPage.test.ts`
- Passed: `npm run typecheck`
- Passed: `npm run lint`
- Passed: `npm run build`
- Passed: `npm test`
- Passed: `npm run release:check`
- Passed: `git diff --check`

Validation notes:
- `npm run build` emitted the existing Vite large chunk warning.
- The first sandboxed API test could not connect to local PostgreSQL at
  `127.0.0.1:5432`; the focused API test and full `npm test` passed after
  approved local PostgreSQL access.
- The focused API test needed `npm run build -w packages/shared` first because
  the API imports the built shared package.
- Manual browser and assistive-technology checks remain pending and are tracked
  in `markdown/FOLLOW_UPS.md`.

## Follow-Ups

- Run the Phase 59 manual browser/accessibility pass for registered and
  anonymous attempts, no-tag/one-tag/multi-tag surveys, answer changes,
  completion animation, keyboard/screen-reader sanity, light/dark themes, and
  375/768/1280px layouts.
- Confirm the product decision on forward-progress thermometer wobble: current
  behavior intentionally follows raw aggregate fill so answer changes can
  decrement progress, but this can also reduce the fill after forward progress
  into newly encountered untagged categories.

## Claude Review Notes

Status:
Completed 2026-06-30.

Findings:
- No blockers.
- Addressed `complete_empty` copy so a submitted no-profile-details attempt no
  longer presents as a ready profile over a 0% fill.
- Addressed screen-reader announcement polish with a polite status mirror.
- Tracked the remaining forward-progress wobble tension as a product follow-up
  because the test notes explicitly requested raw/decrement-capable display
  behavior.

## Commit Readiness

- Requirements implemented: Yes.
- Product context still aligned: Yes.
- Architecture principles still aligned: Yes; no database migration or new
  route was introduced.
- Security review complete: Yes; Claude review found the privacy model sound
  and automated visibility tests confirm hidden tags remain excluded from
  participant and anonymous payloads.
- Review findings addressed or deferred: Yes.
- Manual testing complete: No; tracked as follow-up.
- Ready to commit: Pending manual acceptance.

---

## Phase 58 — Glossary Search Result To Entry Workflow

Date:
2026-06-30

Status:
Implemented; validation passed; Claude review approved

Prompt:
`prompts/prompt_58.txt`

Git Commit:
`a8c8b05`

Review Artifacts:
- Client/planning intake:
  `notes/client_review_2026-06-30_glossary_question_search.txt`
- Codex handoff: `notes/claude_handoff_phase_58.txt`
- Claude review: `notes/claude_review_phase_58.txt`

## Goals

- Replace the Phase 57 disabled question-search result placeholder with a
  deliberate action that starts the existing Glossary create workflow.
- Use the current search query as the editable prefilled canonical term.
- Keep Admin review, definition entry, dictionary suggestions, and save under
  the existing Glossary create path.
- Detect duplicate candidates against loaded Glossary canonical terms and
  aliases before prefill/save where practical.
- Show temporary assessment/page/question context without persisting source
  references.

## Built

- Added a `Start entry from search` action to question-search result cards.
- The action trims the current search input and uses that query as the
  create-form canonical term.
- The action switches to the Entries tab, scrolls to the create form, and
  focuses the definition textarea so the Admin can review/edit the term and
  define it before saving.
- Added a confirmation prompt before replacing non-empty unsaved create-form
  values with a selected search candidate.
- Added client-side duplicate detection against the loaded Glossary entries'
  canonical terms and aliases using trim + case-insensitive comparison.
- Added duplicate feedback and disabled the create submit button while the
  create-form canonical term matches a loaded term or alias. Server-side
  duplicate enforcement remains the source of truth.
- Added a temporary source context panel near the create form with the
  assessment, page, question, selected candidate, and highlighted question
  text. The panel explicitly says the source question reference is not saved.
- Added create-form reset handling and successful-create cleanup for the
  temporary source context and dictionary lookup state.
- Preserved Phase 57 debounce/abort/request-id search behavior and Phase 56
  offset-based highlighting.
- Added focused helper/source guardrail tests for duplicate detection, unsaved
  form detection, the deliberate result action, existing create endpoint usage,
  and no persisted source-reference wiring.
- Updated `markdown/releases/unreleased.md`.

## Important Decisions

### Use Current Query As Candidate

Decision:
Phase 58 uses the current trimmed search query as the editable prefilled
Glossary canonical term.

Reason:
The human confirmed this scope for Phase 58 on 2026-06-30.

Consequence:
Selecting arbitrary text inside a result card remains deferred. Admins can edit
the prefilled query in the create form before saving.

### Keep Source Context Temporary

Decision:
Selected result context is stored only in React state and cleared after
successful create or reset.

Reason:
The first workflow should help Admins remember where a candidate came from
without introducing schema/API changes or long-term source references.

Consequence:
No database migration, backend route, or create payload field was added for
source assessment/page/question ids.

## Impact

- Database/schema impact: none.
- API contract impact: none; saves still use the existing Glossary create
  endpoint.
- Frontend UX impact: `/admin/glossary` question-search results can now start a
  reviewed create-entry draft.
- Auth/authorization impact: no new auth model; all affected UI remains inside
  the Admin Glossary page.
- Participant-facing impact: no direct rendering change; newly saved entries
  still flow through existing participant-safe Glossary behavior.
- Hidden-tag/reporting/response-data impact: none.

## Validation

- Passed: `npm run test -w apps/web -- src/pages/admin/AdminGlossaryPage.test.ts src/api/glossary.test.ts`
- Passed: `npx tsc --noEmit -p apps/web/tsconfig.json`
- Passed: `npm run typecheck`
- Passed: `npm run lint`
- Passed: `npm run build`
- Passed: `npm test`
- Passed: `git diff --check`

Validation notes:
- `npm run build` emitted the existing Vite large chunk warning.
- The first sandboxed `npm test` run failed when the API test setup was blocked
  from connecting to local PostgreSQL at `127.0.0.1:5432`. The same `npm test`
  command passed after approved local PostgreSQL access.
- Manual browser checks passed per developer testing on 2026-06-30.

## Follow-Ups

- Arbitrary word/phrase selection inside a result question remains deferred.
- Persisted source assessment/page/question references remain deferred.
- Automatic entry creation remains out of scope.
- Richer fuzzy or semantic duplicate detection remains deferred.
- Product UX confirmation to keep visible: Claude review noted that Phase 58
  blocks duplicate candidates rather than warning-and-allowing, including terms
  that exist only on disabled entries because disabled entries still reserve
  match strings under the existing DB uniqueness model.
- Phases 54/55 remain paused.
- Manual browser pass should exercise search-to-entry prefill/save,
  unsaved-form replacement confirmation, duplicate candidate warning, rapid
  typing/deleting stale-result behavior, keyboard tab/result action/focus
  behavior, and participant inline rendering after a saved term if practical.

## Claude Review Notes

Source:
`notes/claude_review_phase_58.txt`

Status:
Approved. No correctness, scope, or data-persistence bugs found.

Critical issues:
None.

Suggested improvements:
- Confirm the strict duplicate UX is intended: duplicates are blocked rather
  than warning-and-allowed, and disabled entries still reserve match strings.
- Keep the standard manual browser pass because interactive prefill,
  confirmation, tab switch, scroll/focus, and source-panel behavior are covered
  by source-level guardrails and pure helper tests rather than render-level
  component tests.
- Normalization edge noted as negligible: client `trim()` strips more Unicode
  whitespace than the DB `btrim()` index, with server uniqueness still
  backstopping races or unusual input.

Accepted fixes:
None needed.

Deferred findings:
- Render-level automated coverage remains deferred until the web test harness
  adopts DOM/component testing.

## Commit Readiness

- Requirements implemented: Yes.
- Product context still aligned: Yes.
- Architecture principles still aligned: Yes; no new backend/schema surface was
  introduced.
- Security review complete: Yes; Claude review approved and implementation
  stays on existing Admin-only UI and existing server-side create validation.
- Review findings addressed or deferred: Yes; non-blocking UX/test-assurance
  notes are documented above.
- Manual testing complete: Yes.
- Ready to commit: Committed in `a8c8b05`.

---

## Phase 57 — Glossary Tabs And Question Search UI

Date:
2026-06-30

Status:
Implemented; validation passed; Claude review approved

Prompt:
`prompts/prompt_57.txt`

Git Commit:
`b61419e`

Review Artifacts:
- Client/planning intake:
  `notes/client_review_2026-06-30_glossary_question_search.txt`
- Codex handoff: `notes/claude_handoff_phase_57.txt`
- Claude review: `notes/claude_review_phase_57.txt`

## Goals

- Refactor `/admin/glossary` into separate Admin tabs for existing entry
  management and question-text discovery.
- Consume the Phase 56 Admin-only question-search API from the web app without
  changing the backend contract.
- Preserve all existing Glossary CRUD and dictionary-assist behavior while
  keeping Phase 58 creation/prefill workflow deferred.

## Built

- Added accessible tabs on `/admin/glossary`:
  - `Entries` contains the existing create, edit, enable/disable, archive, and
    dictionary-suggestion workflows.
  - `Question search` contains the new dynamic assessment question search UI.
- Added `searchGlossaryQuestions()` in `apps/web/src/api/glossary.ts` for
  `GET /api/admin/glossary/question-search?q=<query>&limit=<optional>`,
  passing `AbortSignal` through the existing `apiRequest` `RequestInit` path.
- Added question-search behavior that trims input, waits for the Phase 56
  minimum query length of 2, debounces requests by 250 ms, uses a conservative
  limit of 20, aborts stale requests, and guards responses with request ids.
- Added short/empty, loading, results, no-results, and recoverable-error states.
- Rendered result cards with assessment/page/question context and highlighted
  matched text using the returned `match.start`/`match.end` offsets against the
  original `question.questionText`.
- Added a disabled result action placeholder only; no entry creation or prefill
  behavior was wired.
- Added polite live-region updates for search state and keyboard support for
  ArrowLeft/ArrowRight/Home/End tab movement.
- Added responsive CSS for tabs and result cards.
- Added focused web tests for the API helper, highlight slicing, live-region
  messages, and source guardrails around tabs/debounce/abort/non-creating
  action.
- Updated `markdown/releases/unreleased.md`.

## Important Decisions

### Keep Search Informational In Phase 57

Decision:
Result rows include a disabled non-creating action placeholder and do not
prefill or create Glossary entries.

Reason:
The prompt explicitly reserves result-to-entry workflow behavior for Phase 58,
and the candidate-term behavior still needs separate confirmation.

Consequence:
Admins can discover matching question text now, but entry creation still goes
through the existing manual entry form.

### Use Phase 56 Offsets Directly

Decision:
The UI slices the returned original `question.questionText` using
`match.start` and `match.end`, with only defensive clamping.

Reason:
Phase 56 defines those offsets as JavaScript-string offsets for the returned
question text, and recomputing matches client-side could drift from backend
behavior.

Consequence:
Original casing is preserved in search results. Unicode case-fold edge cases
remain accepted Phase 56 review context, not a Phase 57 blocker.

## Impact

- Database/schema impact: none.
- API contract impact: none; Phase 57 consumes the existing Phase 56 endpoint.
- Frontend UX impact: `/admin/glossary` now has tabs and a new question-search
  tab.
- Auth/authorization impact: no new auth model; the consumed endpoint remains
  Admin-only server-side.
- Hidden-tag/reporting/response-data impact: none; the UI renders only the
  Phase 56 question-search response.

## Validation

- Passed: `npm run test -w apps/web -- src/api/glossary.test.ts src/pages/admin/AdminGlossaryPage.test.ts`
- Passed: `npx tsc --noEmit -p apps/web/tsconfig.json`
- Passed: `npm run typecheck`
- Passed: `npm run lint`
- Passed: `npm run build`
- Passed: `npm test`
- Passed: `git diff --check`

Validation notes:
- The first sandboxed `npm test` run failed when API test setup was blocked
  from connecting to local PostgreSQL at `127.0.0.1:5432`. The same `npm test`
  command passed after approved local PostgreSQL access.
- `npm run build` emitted the existing Vite large chunk warning.
- Manual browser checks for opening `/admin/glossary`, switching tabs,
  exercising dynamic search, and returning to the entry manager are pending for
  the human browser pass.

## Follow-Ups

- Phase 58 should wire search results into the existing Glossary create flow
  only after confirming candidate-term behavior.
- Manual browser pass should specifically exercise rapid typing/stale result
  ordering, deleting back below two characters while a request is in flight,
  switching tabs mid-edit with entry form state preserved, and keyboard-only
  tab navigation with Arrow/Home/End focus movement.
- Phases 54/55 remain paused.

## Claude Review Notes

Source:
`notes/claude_review_phase_57.txt`

Status:
Approved. No correctness, accessibility, or scope bugs found.

Critical issues:
None.

Suggested improvements:
- Review noted an assurance gap: debounce, abort, stale-response handling, tab
  keyboard behavior, and the disabled result action are covered by source-level
  guardrails and pure helper tests, not render-level component tests. This
  matches the current repo web-test pattern and makes the pending human browser
  pass important.
- Low-risk awareness note: if the shared web API client ever masks fetch abort
  errors, an unmount during an in-flight search could theoretically surface a
  setState-after-unmount warning.
- Cosmetic note: adding trailing whitespace to an unchanged trimmed query can
  trigger one redundant refetch.

Accepted fixes:
None needed.

Deferred findings:
- Render-level automated coverage remains deferred until the web test harness
  adopts DOM/component testing.

## Commit Readiness

- Requirements implemented: Yes.
- Product context still aligned: Yes.
- Architecture principles still aligned: Yes.
- Security review complete: Yes; Claude review approved and no new backend or
  auth surface was added in this phase.
- Review findings addressed or deferred: Yes; the non-blocking test-assurance
  gap is documented for manual browser verification and future test-harness
  evolution.
- Manual testing complete: Not yet; browser pass documented as pending.
- Ready to commit: Ready for Claude/human review after manual browser pass.

---

## Planning Update — Phase 57 Prompt Alignment After Phase 56

Date:
2026-06-30

Status:
Prompt updated; implementation not started

Prompt:
`prompts/prompt_57.txt`

Git Commit:
Pending

Review Artifacts:
- Phase 56 handoff: `notes/claude_handoff_phase_56.txt`
- Phase 56 review: `notes/claude_review_phase_56.txt`

## Goals

- Carry the completed Phase 56 API contract and Claude review notes into the
  Phase 57 UI prompt before implementation starts.
- Keep Phase 57 scoped to UI consumption of the existing API, without drifting
  into Phase 58 result-to-entry workflow.

## Updated

- Added explicit Phase 56 handoff/review artifacts to Phase 57 required
  reading.
- Documented the concrete question-search endpoint:
  `GET /api/admin/glossary/question-search?q=<query>&limit=<optional>`.
- Documented the response shape, `minQueryLength: 2`, default limit 20, cap 50,
  and blank/one-character empty-result behavior.
- Clarified that `match.start` and `match.end` are offsets into the returned
  original `question.questionText` string and should preserve original casing
  when highlighted.
- Noted that the existing web `apiRequest` can receive `RequestInit` options,
  so Phase 57 can use `AbortSignal` for stale-response protection without
  changing the shared client.
- Added manual checks for full-question search and offset-based highlighting.

## Important Decisions

### Keep The Product Confirmation Visible

Decision:
The Phase 57 page-organization question is now resolved: question search should
be implemented as a tab inside the existing `/admin/glossary` page, not as a
separate Admin page.

Reason:
The human confirmed the tabs direction on 2026-06-30 after reviewing the
Phase 57 prompt alignment.

Consequence:
Phase 57 can proceed with accessible tabs inside `/admin/glossary`. The
candidate-term behavior for Phase 58 remains a separate confirmation item.

## Impact

- Database/schema impact: none.
- API contract impact: none; this update documents the Phase 56 contract for
  the UI phase.
- Frontend UX impact: none yet.
- Auth/authorization impact: none.

## Validation

- Passed: `git diff --check`

## Follow-Ups

- Phase 57 page organization is confirmed: use tabs inside `/admin/glossary`.
- Keep Phase 58 candidate-term behavior confirmation separate from Phase 57.

## Commit Readiness

- Requirements implemented: Prompt alignment only.
- Product context still aligned: Yes.
- Architecture principles still aligned: Yes.
- Security review complete: No runtime behavior changed.
- Review findings addressed or deferred: Phase 56 carry-forward notes were
  reflected in the Phase 57 prompt.
- Manual testing complete: Not applicable.
- Ready to commit: Yes.

---

## Phase 56 — Glossary Question Search API Foundation

Date:
2026-06-30

Status:
Implemented; validation passed; Claude review approved; review notes addressed

Prompt:
`prompts/prompt_56.txt`

Git Commit:
Pending

Review Artifacts:
- Client/planning intake:
  `notes/client_review_2026-06-30_glossary_question_search.txt`
- Codex handoff: `notes/claude_handoff_phase_56.txt`
- Claude review: `notes/claude_review_phase_56.txt`

## Goals

- Add the API foundation for Admins to search assessment question text from the
  Glossary area.
- Keep Phase 56 backend-only, with no Admin Glossary tab UI and no result to
  entry workflow.
- Preserve hidden-tag, response-data, and Admin-only glossary metadata
  boundaries.

## Built

- Added shared Admin Glossary question-search response types in
  `packages/shared/src/index.ts`.
- Added `GET /api/admin/glossary/question-search?q=...` under the existing
  Admin-only Glossary router.
- Added server-side query validation:
  - trims `q`
  - returns empty results for blank or one-character queries
  - defaults `limit` to 20
  - caps `limit` at 50
  - rejects non-positive or non-integer limits
- Added question-text-only substring search across draft and published
  assessments.
- Excluded retired and soft-deleted assessments.
- Returned deterministic result context:
  - assessment id/title/status
  - page id/title/display order when available
  - question id/text/display order
  - first-match start/end offsets
- Added API tests for unauthenticated access, non-admin authorization,
  validation behavior, inclusion/exclusion by assessment status/deleted state,
  result shape, hidden metadata omission, limits, offsets, and ordering.

## Important Decisions

### Short Query Behavior

Decision:
Blank and one-character queries return a normal 200 response with an empty
`results` array.

Reason:
This avoids broad scans during dynamic typing while keeping the later UI simple
and predictable.

Consequence:
The response includes `minQueryLength: 2` so Phase 57 can show client behavior
without hardcoding an undocumented threshold.

### Search Implementation

Decision:
Use plain case-insensitive substring matching with PostgreSQL `position` for
filtering and ordering.

Reason:
The prompt explicitly scopes this as an Admin helper foundation and defers
fuzzy search, ranking engines, full-text search, and new indexes.

Consequence:
`markdown/FOLLOW_UPS.md` now tracks indexed/ranked search as a future scaling
follow-up if content volume approaches roughly 10k questions or searches feel
slow.

### Backend-Only Scope

Decision:
No UI, tabs, debounce, result rendering, or Glossary creation workflow was
implemented.

Reason:
Those are Phase 57 and Phase 58 responsibilities, and the user explicitly
confirmed that Phases 54/55 remain paused while Phase 56 is the next active
feature prompt.

Consequence:
Production behavior changes only by adding the Admin-only API contract and
tests.

### Claude Review Follow-Up

Decision:
Claude approved Phase 56 with no blocking findings. Two small hardening notes
were addressed after review:

- `searchAdminGlossaryQuestions` now caps its own `limit` argument defensively,
  matching the route cap even if a future test or caller invokes the service
  directly.
- The match-offset code now documents that offsets are for JavaScript string
  slicing of the returned `questionText`.

Reason:
Both changes are low-risk and make Phase 57 integration clearer.

Consequence:
The remaining Unicode case-fold and astral-character ordering caveats are
documented review context, not active blockers for the current English/plain
text assessment workflow.

## Impact

- Database/schema impact: none.
- API contract impact: new Admin-only
  `GET /api/admin/glossary/question-search`.
- Frontend UX impact: none.
- Auth/authorization impact: endpoint is protected by existing Glossary
  `requireAuth` and `requireRole("admin")` middleware.
- Hidden-tag/reporting/response-data impact: none; the endpoint queries only
  surveys, pages, and questions and returns no answer, tag, response, or
  glossary source metadata.

## Validation

- Passed: `npm run test -w apps/api -- test/glossary.test.ts`
- Passed: `npm run typecheck`
- Passed: `npm run lint`
- Passed: `npm run build`
- Passed: `npm test`
- Passed: `git diff --check`
- Post-review passed: `npx tsc --noEmit -p apps/api/tsconfig.json`
- Post-review passed: `npm run test -w apps/api -- test/glossary.test.ts`
- Post-review passed: `git diff --check`

Validation notes:
- API tests required approved local PostgreSQL access because the harness
  drops/recreates and migrates the test schema.
- `npm run build` emitted the existing Vite large chunk warning.
- Endpoint behavior was exercised through focused Admin-authenticated API tests
  with known matching questions; no browser UI was added in this phase.

## Follow-Ups

- Phase 57 should build the Admin Glossary tabs/question-search UI on top of
  this API contract after confirming the page organization direction.
- Phase 58 should wire search results into the existing Glossary create flow
  only after confirming candidate-term behavior.
- Revisit indexed or ranked search only if real assessment volume or observed
  latency justifies it.

## Commit Readiness

- Requirements implemented: Yes.
- Product context still aligned: Yes.
- Architecture principles still aligned: Yes.
- Security review complete: Endpoint is server-side Admin-only and avoids
  hidden tags/response data; Claude review approved.
- Review findings addressed or deferred: Minor N1/N2 notes addressed or
  documented; no blocking findings.
- Manual testing complete: Browser manual testing not applicable; API behavior
  covered by automated tests.
- Ready to commit: Yes, after human review and optional Claude review.

---

## Planning Update — Glossary Question Search Refactor Prompts

Date:
2026-06-30

Status:
Prompt drafts created; review feedback addressed; validation passed;
implementation not started

Prompt:
`prompts/prompt_56.txt`, `prompts/prompt_57.txt`, and
`prompts/prompt_58.txt`

Git Commit:
Pending

Review Artifacts:
- Client/planning intake:
  `notes/client_review_2026-06-30_glossary_question_search.txt`
- Claude/Codex handoff: Not created; this is planning documentation only.
- Claude prompt review: External feedback provided by the human and addressed
  in the planning docs.

## Goals

- Preserve the established phase workflow while preparing the larger Glossary
  refactor.
- Split the accepted Glossary question-search plan into implementation-sized
  prompts.
- Keep all production behavior unchanged until a future implementation phase.

## Planned

- Added the accepted client feedback and current planning direction for a
  two-workflow Admin Glossary area:
  - existing Glossary entry management
  - new question-text discovery across non-retired assessments
- Drafted `prompts/prompt_56.txt` for the Admin-only Glossary question search
  API foundation.
- Drafted `prompts/prompt_57.txt` for `/admin/glossary` tabs and the dynamic
  question search UI.
- Drafted `prompts/prompt_58.txt` for connecting a search result to the
  existing create-entry workflow without immediate entry creation.

## Important Decisions

### Review Feedback Tightening

Decision:
The planning docs now call out two confirmation points before implementation:
tabs versus a separate Glossary question-search page, and raw query prefill
versus true arbitrary word/phrase selection from a result.

Reason:
Claude review found the plan sound, but noted that those two details should not
be treated as final client decisions without explicit sign-off.

Consequence:
Phase 56 remains safe to start as the API foundation. Phase 57 should confirm
the page-organization direction before UI implementation, and Phase 58 should
confirm candidate-term behavior before workflow implementation.

### Required Match Offsets

Decision:
Phase 56 now requires match start/end offsets and names the result ordering.

Reason:
The question-search UI depends on reliable highlighting, and deterministic
ordering should be specific enough for tests and review.

Consequence:
Phase 57 can treat highlight data as part of the API contract instead of an
optional best effort.

### Prompt Queue Alignment

Decision:
Phases 54 and 55 remain paused. Phase 56 is the next active feature prompt.

Reason:
The previous queue pause explicitly reserved Phase 56 for the next resumed
feature prompt, and the accepted Glossary question-search work is now the next
planned feature sequence.

Consequence:
Future implementation should begin with `prompts/prompt_56.txt` unless the
human changes priority.

### Documentation Only

Decision:
This update creates planning artifacts only.

Reason:
The accepted request was to write prompts and update non-code planning docs, not
to implement the Glossary refactor.

Consequence:
No backend, frontend, schema, test, release-note, package version, or production
behavior changes are part of this planning update.

## Impact

- Database/schema impact: none.
- API contract impact: none yet; Phase 56 will introduce the planned contract.
- Frontend UX impact: none yet; Phase 57 will introduce the planned UI.
- Auth/authorization impact: none yet; Phase 56 must preserve Admin-only access.
- Operational impact: none.

## Validation

- Passed: `git diff --check`
- Passed: prompt heading inspection with
  `rg -n "Phase 5[6-8]|glossary question" prompts markdown notes`
- No app tests, typecheck, build, release bump, or package changes required for
  this docs-only planning update.

## Follow-Ups

- Implement Phase 56 when the team is ready to begin the Glossary refactor.
- Keep staging intentional so these prompt docs do not accidentally mix with
  unrelated uncommitted app/versioning changes.

## Commit Readiness

- Requirements implemented: Planning docs only.
- Product context still aligned: Yes.
- Architecture principles still aligned: Yes.
- Security review complete: No runtime security behavior changed.
- Review findings addressed or deferred: Claude prompt-review feedback was
  addressed; no formal implementation review is applicable yet.
- Manual testing complete: Not applicable for docs-only planning.
- Ready to commit: Yes, after validation passes and human review of the prompt
  wording.

---

## Maintenance Update — Assessment Terminology And Question Rendering Fixes

Date:
2026-06-30

Status:
Implemented; validation passed; release v0.9.2 prepared

Prompt:
Direct user requests during the 2026-06-30 session:

- Fix Safari initial question prompt rendering and inline glossary popover
  visibility regressions.
- Replace user-facing "survey" terminology with "assessment" terminology.
- Update app versioning, patch notes, and phase log for the session changes.

Git Commit:
Pending

Review Artifacts:
- Claude/Codex handoff: Not created; this was handled as a direct maintenance
  patch rather than a numbered prompt phase.
- Claude review: Not run; review remains pending if the team wants a separate
  AI review before commit.

## Goals

- Keep existing routes, APIs, database schema, and TypeScript domain names
  stable while changing visible product language.
- Fix participant-facing question prompt and glossary display regressions
  without changing glossary matching behavior.
- Promote patch notes through the existing release-note workflow.

## Built

- Stabilized participant question prompt layout for Safari by rendering prompts
  as block-level text and avoiding overly aggressive `overflow-wrap: anywhere`
  behavior during initial layout.
- Restored proper closed-state glossary tooltip behavior by explicitly hiding
  `.inline-glossary-popover[hidden]`.
- Updated visible copy from "survey/surveys" to "assessment/assessments"
  across public pages, participant attempt flow, dashboard/category cards,
  account stats, admin overview, admin builder setup/status/templates/results,
  flow-map diagnostics, and accessibility/document-title labels.
- Updated web source-text regression tests for assessment terminology and the
  glossary hidden-state CSS guard.
- Prepared release `v0.9.2 - Capacity Suites And Assessment UI Polish`,
  bumping the root app version from `0.9.1` to `0.9.2`, updating the root
  lockfile, creating `markdown/releases/v0.9.2.md`, and resetting
  `markdown/releases/unreleased.md`.

## Important Decisions

### UI Copy Only, Not Domain Rename

Decision:
Only user-visible copy, aria labels, page titles, release notes, and patch-log
language were changed to "assessment".

Reason:
The existing API paths, database tables, shared types, CSS class names, and
route paths still use survey-oriented identifiers. Renaming those contracts
would be a much larger migration and was not required for the UX copy request.

Consequence:
Admins and participants see "assessment" language, while developer-facing
identifiers such as `SurveyAttemptPage`, `/api/surveys`, and `survey.id`
remain unchanged.

### Release Includes Existing Capacity Draft

Decision:
The existing capacity-suite draft bullets in `markdown/releases/unreleased.md`
were preserved and promoted together with this session's UI polish.

Reason:
The release workflow treats `unreleased.md` as the working draft for the next
patch. Overwriting the existing capacity-suite notes would have dropped
production-bound project memory.

Consequence:
`v0.9.2` covers both the capacity suite foundation already drafted and this
session's assessment UI/rendering polish.

## Impact

- Database/schema impact: none.
- API contract impact: none.
- Frontend UX impact: visible terminology now says "assessment"; question
  prompt and glossary tooltip rendering were fixed.
- Auth/authorization impact: none.
- Operational impact: root version is now `0.9.2`; latest versioned release
  note is `markdown/releases/v0.9.2.md`.

## Validation

- Passed: `npm run test -w apps/web`
- Passed: `npm run typecheck -w apps/web`
- Passed: `npm run lint -w apps/web`
- Passed: `git diff --check`
- Passed: `npm run release:preview`
- Passed: `npm run release:prepare` (also ran release-note validation)

## Follow-Ups

- Optional: run a browser smoke pass for the public directory, dashboard,
  participant attempt flow, and admin workspace to review the new assessment
  terminology in context.
- Optional: run a separate Claude/Codex review if the team wants a formal
  review artifact before commit.

## Commit Readiness

- Requirements implemented: Yes
- Product context still aligned: Yes
- Architecture principles still aligned: Yes
- Security review complete: No security-sensitive behavior changed.
- Review findings addressed or deferred: No formal review run; optional review
  remains available.
- Manual testing complete: Not run by Codex; browser smoke remains optional.
- Ready to commit: Yes, after human review of the broad copy sweep.

---

## Prompt Queue Pause — Capacity Assessment Phases 54/55

Date:
2026-06-29

Status:
Recorded

Decision:
Pause `prompts/prompt_54.txt` and `prompts/prompt_55.txt` while unrelated
feature work resumes.

Reason:
Azure Monitor sampling and the Admin capacity suite viewer are still valuable
capacity-assessment follow-ups, but they are no longer the next active work.

Consequence:
Keep prompts 54 and 55 as drafted with paused title annotations. Draft the next
new feature prompt as `prompts/prompt_56.txt`.

---

## Phase 53 — Capacity Suite CLI And Stage Sampling

Date:
2026-06-29

Status:
Implemented; validation passed; review feedback addressed; manual persistence-smoke deferred

Prompt:
`prompts/prompt_53.txt`

Git Commit:
Pending

Review Artifacts:
- Codex handoff: `notes/claude_handoff_phase_53.txt`
- Claude review: `notes/claude_review_phase_53.txt`

## Goals

- Add an operator-run `loadtest:suite` command for varied capacity profiles.
- Persist one suite row, linked child run rows, and bounded local evidence
  samples.
- Identify the first degradation range and likely bottleneck from local HTTP
  and SQL evidence.
- Preserve hosted confirmation, anonymous write-heavy safety, and the
  no-browser-controls boundary.

## Built

- Added `npm run loadtest:suite` backed by `loadtest/suite.mjs`.
- Added small, standard, and explicit opt-in capacity suite presets with
  configurable profiles, max VUs, stage lists, early-stop thresholds, app pool
  max, app instance count, and optional direct-DB evidence.
- Implemented stage-sized child runs with unique child run keys under one suite
  key. This avoids raw k6 event-stream persistence while still bracketing the
  first failing VU range.
- Persisted suite `running` rows, terminal suite statuses, child
  `performance_test_runs.suite_id` links, and bounded `performance_test_samples`
  rows for k6-shaped HTTP and SQL summaries.
- Added SIGINT/SIGTERM best-effort abort handling for the suite and active
  child run, with caveated abort reports and the teardown command.
- Added aggregate classification for first failing profile/stage/VU, likely
  bottleneck, confidence, recommendation, and caveats for missing SQL or
  approximate k6 bucket visibility.
- Added CLI write-time operational redaction/secret guards for suite config,
  child run summaries, sample metrics, markdown, and local JSON artifacts.
- Tagged k6 HTTP requests by endpoint family/status with bounded custom
  counters, without storing raw streams.
- Addressed review findings by guarding async SQL sampling, clearing sampler
  intervals in `finally`, confirming before pool creation, and rejecting
  missing CLI values for value-style flags.
- Updated load-test docs, `.env.loadtest.example`, release notes, follow-ups,
  and focused Node tests.

## Important Decisions

### Stage-Sized Sampling

Decision:
The suite runs one child test per profile/stage and stores bounded summaries.

Reason:
Exact per-bucket k6 percentiles require event stream aggregation. This phase
uses local k6 summary output only and should not imply precision it does not
have.

Consequence:
Reports identify the first degraded stage range conservatively and include a
caveat about missing in-stage percentile streams.

### Write-Time Secret Omission

Decision:
The CLI allowlists persisted config fields and sanitizes/guards JSON and
markdown before writing artifacts or database rows.

Reason:
Phase 52 API redaction is defense-in-depth; durable rows and local artifacts
should not contain DB URLs, passwords, cookies, bearer values, CSRF values,
anonymous attempt tokens, API keys, or connection strings.

Consequence:
Suite writes fail closed if a secret-like value survives sanitization.

## Impact

- Database/schema impact: consumes Phase 52 tables; no new migration.
- API contract impact: none.
- Frontend UX impact: none.
- Auth/authorization impact: none.
- Operational impact: new operator CLI suite and local report artifacts.

## Validation

- Passed: `npm run typecheck`
- Passed: `npm run lint`
- Passed: `npm run build` (Vite emitted the existing large chunk warning)
- Passed with approved local PostgreSQL access: `npm test`
- Passed: `npm run test:loadtest`
- Passed: `npm run loadtest:suite -- --help`
- Passed: `git diff --check`
- Not run: local `--persistence-smoke` suite and Phase 52 API visibility check.
  The current `.env.loadtest` is not configured as an all-local dev target, and
  the suite should not be run against hosted targets outside an approved manual
  window.

## Follow-Ups

- Phase 54 remains responsible for optional Azure Monitor metric sampling.
- Phase 55 remains responsible for the Admin suite viewer.
- Browser run controls, app-process load generation, and Azure resource
  creation remain out of scope.

---

## Phase 52 — Performance Suite Data Model And Admin API

Date:
2026-06-29

Status:
Implemented; validation passed; Claude review complete; non-blocking fixes applied

Prompt:
`prompts/prompt_52.txt`

Git Commit:
Pending

Review Artifacts:
- Codex handoff: `notes/claude_handoff_phase_52.txt`
- Claude review: `notes/claude_review_phase_52.txt`

## Goals

- Add durable capacity-assessment suite and sample storage.
- Relate existing one-off performance runs to suites without breaking older
  runs.
- Add read-only Admin APIs for suite list/detail, child runs, and bounded
  sample windows.
- Keep the suite runner, Azure Monitor sampler, Admin suite UI, and browser run
  controls out of scope.

## Built

- Added `performance_test_suites` with suite key, target, status, timing,
  planned profile/stage JSONB, first failing profile/stage/VU fields,
  bottleneck confidence, recommendation, config, summary, markdown, and
  timestamps.
- Added nullable `performance_test_runs.suite_id` with `on delete set null` and
  suite read indexes.
- Added `performance_test_samples` with source checks for `k6`, `sql`,
  `azure_app_service`, `azure_postgres`, and `suite`, plus profile/stage/VU,
  sampled time, elapsed seconds, JSONB metrics, unavailable reason, and caveat
  fields.
- Added shared suite, child-run, and sample response types.
- Added `GET /api/admin/performance-suites` and
  `GET /api/admin/performance-suites/:id` behind existing Admin auth.
- Added bounded sample reads with a 200 default, 1,000 cap, elapsed/sample/id
  ordering, and optional `source`, `runId`, and `profile` filters.
- Added response-time redaction for secret-like suite config, summary, sample
  metrics, and report markdown values.
- After Claude review, extracted operational redaction into a shared API helper,
  broadened it for API-key/access-token patterns, applied it to the existing
  performance run detail endpoint, and removed the undocumented suite sample
  `limit` alias.
- Added focused API and migration tests.
- Updated release notes, data-model guidance, follow-ups, and Claude handoff.

## Important Decisions

### Additive Suite Relationship

Decision:
`performance_test_runs.suite_id` is nullable and uses `on delete set null`.

Reason:
Phase 49-51 one-off runs remain valid and no delete API is being added.

Consequence:
Future suite runners can group child runs without rewriting existing
performance-run history.

### Bounded Evidence API

Decision:
Suite list responses omit samples; suite detail returns a bounded sample window
with conservative default/capped limits and optional filters.

Reason:
Time-bucketed rows are useful evidence, but the Admin API should not expose
unbounded time-series reads.

Consequence:
The future Admin suite viewer can request focused sample windows without
turning PostgreSQL into a raw k6 event store.

### Unavailable And Secret Handling

Decision:
Sample rows can carry unavailable reasons/caveats, and the Admin suite API
redacts secret-like JSON keys, connection strings, bearer values, and markdown
patterns before response serialization.

Reason:
Unavailable metrics must not be mistaken for zero, and operational payloads may
evolve as later CLI phases add more inputs.

Consequence:
The API remains useful for partial evidence while reducing the risk of echoing
accidentally persisted credentials.

## Impact

- Database/schema impact: new migration `0038_performance_test_suites.sql`.
- API contract impact: new read-only Admin suite list/detail endpoints and
  shared response types.
- Frontend UX impact: none.
- Auth/authorization impact: endpoints require existing Admin auth.
- Data privacy impact: suite/sample operational metadata is Admin-only and
  response-redacted for secret-like content.

## Validation

- Passed: `npm run lint`
- Passed: `npm run typecheck`
- Passed: `npm run build` (Vite emitted the existing large chunk warning)
- Passed: `npm test`
- Passed: `git diff --check`
- Passed with approved local PostgreSQL access:
  `npm run test -w apps/api -- adminPerformanceSuites.test.ts adminPerformanceRuns.test.ts migrations.test.ts`
- Passed with approved local PostgreSQL access after review fixes:
  `npm run test -w apps/api -- adminPerformanceSuites.test.ts adminPerformanceRuns.test.ts`

## Follow-Ups

- Phase 53 remains responsible for `npm run loadtest:suite`, profile
  orchestration, stage sampling, and aggregate local classification.
- Phase 54 remains responsible for optional Azure Monitor sampling.
- Phase 55 remains responsible for the Admin capacity suite viewer.
- Artifact browsing/downloads and browser run controls remain out of scope.

---

## Phase 51 — Admin Performance Report Viewer

Date:
2026-06-29

Status:
Implemented; validation passed; Claude review complete

Prompt:
`prompts/prompt_51.txt`

Git Commit:
This commit

Review Artifacts:
- Codex handoff: `notes/claude_handoff_phase_51.txt`
- Claude review: `notes/claude_review_phase_51.txt`

## Goals

- Add a read-only Admin UI for persisted CLI performance report rows.
- Surface status, latency, error, throughput, bottleneck, recommendation, and
  metric availability signals from the Phase 49 API.
- Keep the browser out of test execution: no run, stop, schedule, delete,
  artifact-download, Azure runner, or orchestration controls.

## Built

- Added `/admin/performance` behind the existing Admin route guard.
- Added Web API helpers for:
  - `GET /api/admin/performance-runs`
  - `GET /api/admin/performance-runs/:id`
- Added an Admin tools-panel link from the survey overview.
- Added a dense operational report viewer with recent-run pagination, selected
  run detail, persisted markdown display, config highlights, HTTP/SQL metrics,
  Azure/SQL availability labels, and operator caveats.
- Added status coverage for `running`, `completed`, `failed`, and `aborted`.
- Added helper tests for formatting, metric availability, SQL/HTTP highlights,
  status mapping, and source-level guards against browser run controls/local
  artifact exposure.
- Updated release notes, admin demo notes, and follow-ups.

## Important Decisions

### Read-Only Browser Surface

Decision:
The Admin UI only reads persisted performance data. It does not create,
schedule, stop, delete, or orchestrate load tests.

Reason:
Phase 50 intentionally keeps execution in the operator CLI where target guards,
confirmation prompts, hosted TLS enforcement, and teardown controls live.

Consequence:
Admins can review persisted results in the portal, but operators still use the
CLI to seed, run, persist, and tear down load-test data.

### Unavailable Means Unavailable

Decision:
Unavailable Azure or SQL metric families are labeled as unavailable, optionally
with the stored reason, rather than rendered as zero values.

Reason:
Zero implies a measured absence. Missing permissions, omitted Azure sampling,
or absent SQL data are different operational states.

Consequence:
The viewer can show partial reports without overstating confidence in bottleneck
or capacity signals.

## Impact

- Database/schema impact: none.
- API contract impact: none; consumes Phase 49 Admin read APIs.
- Frontend UX impact: new Admin-only `/admin/performance` route and Admin tools
  link.
- Auth/authorization impact: uses the existing Admin route guard and Admin API
  authorization.
- Data privacy impact: performance rows are admin-only operational metadata;
  local CLI artifact paths are not exposed.

## Validation

- Passed: `npm run typecheck`
- Passed: `npm run lint`
- Passed: `npm run test -w apps/web` (12 files, 86 tests)
- Passed: `npm run build`
- Passed: `git diff --check`
- Passed: `npm test` (shared 5 files / 62 tests; web 12 files / 86 tests;
  api 29 files / 283 tests; release 9 tests; loadtest 12 tests)

## Follow-Ups

- Artifact browsing/downloads remain deferred.
- Time-series sample storage/charts remain deferred.
- Azure runner/orchestration remains out of scope.

---

## Phase 50 — CLI Performance Test Harness And Result Persistence

Date:
2026-06-29

Status:
Implemented; Claude review complete; review fixes applied; live k6 smoke passed

Prompt:
`prompts/prompt_50.txt`

Git Commit:
This commit

Review Artifacts:
- Codex handoff: `notes/claude_handoff_phase_50.txt`
- Claude review: `notes/claude_review_phase_50.txt`
- Codex final review handoff:
  `notes/claude_handoff_phase_50_final_review.txt`
- Claude final review: `notes/claude_review_phase_50_final.txt`

## Goals

- Add an operator-run command-line performance test harness.
- Seed clearly namespaced fake load-test survey data.
- Run k6 HTTP scenarios when k6 is installed and an optional direct-DB check
  from the operator machine.
- Persist summarized results into `performance_test_runs`.
- Keep the Admin app as a viewer only, with no browser run controls and no
  Azure runner/orchestration resources.

## Built

- Added `loadtest/` harness files:
  - explicit `.env.loadtest` parsing and target safety helpers
  - PostgreSQL pool and Phase 49 table checks
  - SQL metric sampling from `pg_stat_activity` and `pg_stat_database`
  - k6 summary normalization, bottleneck classification, markdown reporting,
    and result persistence helpers
  - seed, run, direct-DB load, teardown, and persistence export scripts
  - k6 read-heavy, anonymous write-heavy, mixed, and smoke scenario support
  - pure Node helper tests
- Added `.env.loadtest.example` with placeholders only.
- Added npm scripts:
  - `loadtest:seed`
  - `loadtest:run`
  - `loadtest:db`
  - `loadtest:teardown`
  - `loadtest:doctor`
  - `test:loadtest`
- Updated `.gitignore` for `.env.loadtest.example`, ignored local
  `.env.loadtest`, manifests, and reports.
- Updated `loadtest/README.md`, release notes, and follow-ups.
- After Claude review, fixed the anonymous write-heavy k6 loop to retain the
  start response survey across page saves, added ramping VU stages for
  non-smoke profiles, added a real `http_5xx` k6 counter, tightened teardown
  custom Admin cleanup via manifest emails, added app pool/instance
  classification settings, and marked interrupted runs `aborted` when possible.
- After live k6 smoke, fixed page-submit payloads so write-heavy scenarios
  answer every required question on the current page with the same
  `isOtherSelected`/`otherText` shape sent by the UI.
- Added `loadtest:doctor` to check `.env.loadtest`, target parsing, and local
  k6 availability without bundling k6 into the app.

## Important Decisions

### Explicit Target Safety

Decision:
The harness reads only `.env.loadtest`, refuses localhost targets unless
`--dev` is passed, and requires confirmation or `--yes` for hosted writes.

Reason:
Load tests are operational tooling and must not accidentally target production
or local environments because of normal app `.env` settings.

Tradeoff:
Operators must maintain one extra env file and be explicit about dev/hosted
intent.

### Anonymous Write-Heavy Default

Decision:
k6 write-heavy scenarios use anonymous start/page-answer/complete.

Reason:
The app intentionally blocks a registered user from repeatedly completing the
same survey. Anonymous start creates a fresh attempt for each iteration.

Tradeoff:
Meaningful hosted write-load tests require a temporary approved increase to
`ANONYMOUS_SURVEY_RATE_LIMIT_MAX`, documented in the operator README.

### Optional Azure Metrics

Decision:
Phase 50 does not call Azure Monitor. Summaries label Azure metrics as
unavailable and rely on HTTP plus PostgreSQL stats.

Reason:
The prompt keeps Azure sampling optional and forbids new Azure runner
resources. DB/HTTP summaries are enough for the first CLI persistence phase.

Tradeoff:
App-plan CPU/memory classification remains inconclusive until operators add
Azure CLI/RBAC metric sampling in a future phase.

## Architecture Notes

- Database/schema impact: no new migrations; writes to Phase 49
  `performance_test_runs`.
- API contract impact: none.
- Auth or authorization impact: k6 uses normal Admin login cookies for read
  scenarios and anonymous attempt tokens for write scenarios.
- Data privacy or visibility impact: seed data uses fake namespaced
  `example.invalid` users and `LOADTEST <run_key>` markers only.
- Frontend UX impact: none.
- Environment or deployment impact: hosted targets must run
  `npm run db:migrate:hosted` before result persistence. `.env.loadtest`
  remains local/ignored.

## Validation

Commands run:

```bash
npm run test:loadtest
node --check loadtest/seed.mjs
node --check loadtest/teardown.mjs
node --check loadtest/run.mjs
node --check loadtest/db-load.mjs
node --check loadtest/persist-results.mjs
node --check loadtest/lib/env.mjs
node --check loadtest/lib/metrics.mjs
node --check loadtest/lib/reporting.mjs
node --check loadtest/k6/scenarios.js
node --check loadtest/k6/lib/auth.js
npm run loadtest:seed -- --dev --run-key phase50-smoke
npm run loadtest:run -- --dev --run-key phase50-smoke --persistence-smoke
npm run loadtest:teardown -- --dev --run-key phase50-smoke --dry-run
npm run loadtest:teardown -- --dev --run-key phase50-smoke --yes
npm run typecheck
npm run lint
npm run build
npm test
git diff --check
k6 version
npm run test:loadtest
node --check loadtest/run.mjs
node --check loadtest/teardown.mjs
node --check loadtest/k6/scenarios.js
npm run loadtest:seed -- --dev --run-key phase50-smoke
npm run loadtest:run -- --dev --run-key phase50-smoke --persistence-smoke
npm run loadtest:teardown -- --dev --run-key phase50-smoke --dry-run
npm run loadtest:teardown -- --dev --run-key phase50-smoke --yes
npm run typecheck
npm run lint
npm run build
npm test
git diff --check
k6 version
npm run loadtest:doctor -- --dev
node --check loadtest/k6/scenarios.js
env LOCAL_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/survey_portal_test DATABASE_URL=postgresql://postgres:postgres@localhost:5432/survey_portal_test npm run dev:api
npm run loadtest:seed -- --dev --run-key phase50-k6-smoke-pass
npm run loadtest:run -- --dev --run-key phase50-k6-smoke-pass --profile write-heavy --ramping-stages '[{"duration":"5s","target":1},{"duration":"5s","target":0}]'
npm run loadtest:teardown -- --dev --run-key phase50-k6-smoke-pass --yes
```

Results:

- Passed: `npm run test:loadtest`
- Passed: syntax checks for loadtest scripts, helpers, and k6 files.
- Passed with approved local PostgreSQL access:
  `npm run loadtest:seed -- --dev --run-key phase50-smoke`
- Passed with approved local PostgreSQL access:
  `npm run loadtest:run -- --dev --run-key phase50-smoke --persistence-smoke`
- Passed with approved local PostgreSQL access:
  `npm run loadtest:teardown -- --dev --run-key phase50-smoke --dry-run`
- Passed with approved local PostgreSQL access:
  `npm run loadtest:teardown -- --dev --run-key phase50-smoke --yes`
- Passed: `npm run typecheck`
- Passed: `npm run lint`
- Passed: `npm run build` (Vite emitted the existing large chunk warning)
- Passed with approved local PostgreSQL access: `npm test`
  - shared: 62 tests
  - web: 81 tests
  - API: 283 tests across 29 API files
  - release-note tests: 9 tests
  - loadtest helper tests: 9 tests
- Passed: `git diff --check`
- Failed after Claude review: `k6 version`
  - `k6` is not installed in this environment, so live 1-VU write smoke could
    not be run locally.
- Passed after Claude review fixes: `npm run test:loadtest`
  - loadtest helper tests: 10 tests
- Passed after Claude review fixes: syntax checks for changed run, teardown,
  and k6 scenario files.
- Passed after Claude review fixes with approved local PostgreSQL access:
  `npm run loadtest:seed -- --dev --run-key phase50-smoke`
- Passed after Claude review fixes with approved local PostgreSQL access:
  `npm run loadtest:run -- --dev --run-key phase50-smoke --persistence-smoke`
- Passed after Claude review fixes with approved local PostgreSQL access:
  `npm run loadtest:teardown -- --dev --run-key phase50-smoke --dry-run`
- Passed after Claude review fixes with approved local PostgreSQL access:
  `npm run loadtest:teardown -- --dev --run-key phase50-smoke --yes`
- Passed after Claude review fixes: `npm run typecheck`
- Passed after Claude review fixes: `npm run lint`
- Passed after Claude review fixes: `npm run build` (Vite emitted the existing
  large chunk warning)
- Passed after Claude review fixes with approved local PostgreSQL access:
  `npm test`
  - shared: 62 tests
  - web: 81 tests
  - API: 283 tests across 29 API files
  - release-note tests: 9 tests
  - loadtest helper tests: 10 tests
- Passed after Claude review fixes: `git diff --check`
- Failed environment check: `sudo -n true`
  - sudo is blocked by this container/WSL session's no-new-privileges flag, so
    Codex cannot install system packages here.
- Initially failed until k6 was installed:
  - `k6 version` reported `command not found`.
  - `npm run loadtest:doctor -- --dev` reported `.env.loadtest` and target
    parsing OK, with k6 missing from `PATH`.
- Passed after operator installed k6:
  - `k6 v2.0.0 (commit/8c3be52cc1, go1.26.3, linux/amd64)`
  - `npm run loadtest:doctor -- --dev`
- Passed after the live-smoke page-submit fix:
  `node --check loadtest/k6/scenarios.js`
- Passed with approved local PostgreSQL and HTTP access after starting the API
  against `survey_portal_test`:
  `npm run loadtest:seed -- --dev --run-key phase50-k6-smoke-pass`
- Passed with approved local PostgreSQL and HTTP access:
  `npm run loadtest:run -- --dev --run-key phase50-k6-smoke-pass --profile write-heavy --ramping-stages '[{"duration":"5s","target":1},{"duration":"5s","target":0}]'`
  - k6 completed 10 anonymous write iterations.
  - Each iteration completed start, three page-answer calls, and complete.
  - The performance run persisted with status `completed`.
- Passed with approved local PostgreSQL access:
  `npm run loadtest:teardown -- --dev --run-key phase50-k6-smoke-pass --yes`

Manual/operator notes:

- The local smoke used the dedicated `survey_portal_test` database and did not
  invoke k6 or generate HTTP load.
- Teardown dry-run reported 1 survey, 4 users, and 1 performance run, then the
  real teardown removed those rows and the ignored manifest.
- Live k6 write-heavy smoke was run locally after k6 was installed. The API was
  started with `LOCAL_DATABASE_URL` and `DATABASE_URL` pointed at
  `survey_portal_test` so seed data and API reads used the same database.
- Earlier exploratory live runs correctly exposed a local DB mismatch and then
  the page-submit payload bug; their seeded data was removed with
  `loadtest:teardown`.
- Live Azure CLI and hosted DB access were not run.

## Claude Review Notes

Source:

- `notes/claude_review_phase_50.txt`

Status:

- Completed. Claude found one critical write-heavy k6 bug, several suggested
  improvements, and no target-guard/Azure-orchestration blockers.
- Final review completed after live k6 validation. Claude found no critical
  issues and marked Phase 50 ready to commit/merge.

Findings and disposition:

- Addressed critical issue: write-heavy k6 now captures `survey` from the start
  response and reuses it across page-answer responses.
- Addressed ramping suggestion: non-smoke profiles now use `ramping-vus` stages
  from `LOADTEST_RAMPING_STAGES`.
- Addressed active-connection caveat: classification uses configurable
  `LOADTEST_APP_DB_POOL_MAX` and `LOADTEST_APP_INSTANCE_COUNT`, and README
  documents `pg_stat_activity` role visibility limitations plus
  `pg_monitor`/`pg_read_all_stats` guidance.
- Addressed dead 5xx metric: k6 scenarios now increment a real `http_5xx`
  counter and threshold.
- Addressed custom Admin teardown gap: teardown now matches manifest user IDs
  with exact manifest emails instead of assuming the default admin email
  pattern.
- Addressed stale running-row risk for normal interruptions: `loadtest:run`
  attempts to mark rows `aborted` on `SIGINT`/`SIGTERM`; README documents
  force-kill limitations.
- Addressed k6 summary deprecation: replaced `--summary-export` with
  `handleSummary`.
- Addressed live k6 smoke failure: write-heavy page submissions now answer all
  questions on the current page, not only `currentPageQuestionIds`, and include
  the UI-compatible `isOtherSelected` and `otherText` fields.
- Post-final-review polish: scaled the database-pressure active-connection
  threshold from the configured app pool ceiling instead of using a fixed
  connection count, with focused helper coverage.

## Follow-Up Tasks

- Optional Azure Monitor sampling remains deferred until operators need it.
- Admin read-only performance report viewer remains Phase 51.
- Time-series sample storage remains deferred until report UI needs prove it is
  necessary.

## Commit Readiness

- Requirements implemented: Yes
- Claude handoff created: Yes
- Product context still aligned: Yes
- Architecture principles still aligned: Yes
- Security review complete: Yes; Claude found target guards and
  production-safety posture strong
- Review findings addressed or deferred: Yes
- Manual testing complete: Local persistence smoke and live k6 write-heavy
  smoke complete
- Ready to commit: Yes

---

## Phase 49 — Performance Test Report Data And Admin API Foundation

Date:
2026-06-29

Status:
Implemented; Claude review complete; review cleanup applied

Prompt:
`prompts/prompt_49.txt`

Git Commit:
Pending

Review Artifacts:
- Codex handoff: `notes/claude_handoff_phase_49.txt`
- Claude review: `notes/claude_review_phase_49.txt`

## Goals

- Add durable storage for command-line performance test summaries.
- Add shared response types for Admin list/detail performance report reads.
- Add Admin-only read APIs under `/api/admin/performance-runs`.
- Keep load generation, CLI persistence, Admin UI, and Azure orchestration out
  of scope.

## Built

- Added migration `0037_performance_test_runs.sql` with run identity, scenario,
  target, status, timing, latency, request/error, bottleneck, recommendation,
  JSONB config/summary, markdown report, and audit timestamp fields.
- Added newest-first and status/start-time indexes for list/detail support.
- Added shared `PerformanceTestRunStatus`,
  `PerformanceTestRunSummary`, `PerformanceTestRunDetail`,
  `PerformanceTestRunsListResponse`, and
  `PerformanceTestRunDetailResponse` types.
- Added read-only Admin endpoints:
  - `GET /api/admin/performance-runs`
  - `GET /api/admin/performance-runs/:id`
- Added focused API tests for admin authorization, unauthenticated rejection,
  standard-user rejection, newest-first pagination, list/detail shapes,
  missing ids, invalid ids, invalid pagination, JSON/markdown detail payloads,
  and POST non-availability.
- Added migration-test coverage that verifies the new table is created by the
  ordered migration runner.
- Updated the test database cleanup table list so performance run rows do not
  leak between API tests.
- Updated data-model and unreleased release notes.
- After Claude review, slimmed the list endpoint query so it no longer selects
  detail-only JSONB or markdown fields, and updated `prompts/prompt_50.txt`
  to require `updated_at = now()` in direct persistence updates.

## Important Decisions

### Read-Only Admin Surface

Decision:
Expose only GET endpoints for performance reports in the app.

Reason:
Phase 50 will write report rows from the command-line harness directly through
the approved load-test database connection. The app must not start, schedule,
stop, or host load generation.

Tradeoff:
Admins cannot create or repair report rows through the browser. That keeps the
production-safety boundary clear for this phase.

### Flexible Operational JSONB

Decision:
Keep core report summary fields relational, but store CLI configuration and
non-core metric summaries in JSONB.

Reason:
The CLI payload and optional metric availability may evolve without making the
first Admin read API chase every possible metric field.

Tradeoff:
Ad hoc JSONB report data is less relationally queryable than columns, but the
indexed list/detail use cases are covered by relational columns.

## Architecture Notes

- Database/schema impact: additive migration `0037_performance_test_runs.sql`.
- API contract impact: new Admin-only read endpoints and shared response types.
- Auth or authorization impact: endpoints require `requireAuth` and
  `requireRole("admin")`; standard users receive 403 and unauthenticated
  callers receive 401.
- Data privacy or visibility impact: performance runs are operational/admin
  data and are not exposed to participants or public APIs.
- Frontend UX impact: none.
- Environment or deployment impact: hosted environments must run
  `npm run db:migrate:hosted` after this migration is merged/deployed and
  before Phase 50 CLI runs attempt to persist hosted results.

## Validation

Commands run:

```bash
npm test -w apps/api -- test/adminPerformanceRuns.test.ts
npm run typecheck
npm run lint
npm run build
npm test
git diff --check
npm test -w apps/api -- test/adminPerformanceRuns.test.ts
npm run typecheck
npm run lint
```

Results:

- Initial sandboxed focused API test failed because the harness was blocked
  from connecting to local PostgreSQL on `127.0.0.1:5432`.
- Passed with approved local PostgreSQL access:
  `npm test -w apps/api -- test/adminPerformanceRuns.test.ts`
  - 5 tests
- Passed: `npm run typecheck`
- Passed: `npm run lint`
- Passed: `npm run build` (Vite emitted the existing large chunk warning)
- Passed with approved local PostgreSQL access: `npm test`
  - shared: 62 tests
  - web: 81 tests
  - API: 283 tests across 29 API files
  - release-note tests: 9 tests
- Passed: `git diff --check`
- Passed after Claude review cleanup with approved local PostgreSQL access:
  `npm test -w apps/api -- test/adminPerformanceRuns.test.ts`
  - 5 tests
- Passed after Claude review cleanup: `npm run typecheck`
- Passed after Claude review cleanup: `npm run lint`

Manual tests:

- The focused Supertest coverage seeds local performance run rows and exercises
  Admin list/detail plus standard-user and unauthenticated rejection.
- No separate browser/manual UI pass was run because Phase 49 has no Admin UI.
- No CLI or hosted persistence pass was run because those are Phase 50 scope.

## Claude Review Notes

Source:

- `notes/claude_review_phase_49.txt`

Status:

- Completed. Claude found no critical issues and marked the phase ready to
  commit, recommending one low-effort list-query cleanup before Phase 50.

Findings and disposition:

- Addressed suggested improvement 2(a): list endpoint SQL now selects only
  summary fields, leaving JSONB config/summary and markdown report data for
  detail reads.
- Accepted status index note: the status/start-time index is forward-looking
  for likely Phase 51 filtering and remains cheap.
- Accepted pagination strictness note: malformed pagination returns 400, while
  valid oversized `pageSize` is capped at 100 to match existing Admin list
  patterns.
- Promoted the `updated_at = now()` direct-persistence reminder into
  `prompts/prompt_50.txt`.

## Follow-Up Tasks

- Phase 50 should build the CLI harness and direct database persistence.
- Phase 51 should build the read-only Admin UI viewer.
- Optional time-series sample storage remains deferred until report UI needs
  prove it is necessary.

## Commit Readiness

- Requirements implemented: Yes
- Claude handoff created: Yes
- Product context still aligned: Yes
- Architecture principles still aligned: Yes
- Security review complete: Yes; Claude found no auth or production-safety
  blockers
- Review findings addressed or deferred: Yes
- Manual testing complete: API-level manual-equivalent checks complete; no UI
  exists in this phase
- Ready to commit: Yes

---

## Phase 48 — Admin Results Open-Answer Review Tagging UI

Date:
2026-06-29

Status:
Implemented; Claude review complete; manual browser verification passed

Prompt:
`prompts/prompt_48.txt`

Git Commit:
Pending

Review Artifacts:
- Codex handoff: `notes/claude_handoff_phase_48.txt`
- Claude review: `notes/claude_review_phase_48.txt`

## Goals

- Let Admins add and remove catalog review tags from individual text answers in
  Results.
- Keep automatic hidden/value/Other tags read-only.
- Keep participant-facing behavior unchanged.

## Built

- Added Results-page catalog loading, frontend add/remove API helpers, editable
  review-tag chips, a compact catalog picker, and local attempt-detail updates.
- Added per-mutation pending state, grouped catalog picker options, and catalog
  refresh after mutation errors.
- Added focused review-tag styles using existing Results/tag patterns.
- Updated release notes and follow-ups for the V1 boundary.

## Important Decisions

### Text-Only Editor

Decision:
Render review-tag controls only for answered `text` responses with a saved
response row.

Reason:
The client asked for open-answer review; integer and option answers already have
structured tagging paths.

Tradeoff:
Other text and integer manual review tags remain deferred until the client asks.

## Architecture Notes

- Database/schema impact: none beyond Phase 47.
- API contract impact: consumes Phase 47 review-tag endpoints.
- Auth or authorization impact: Admin UI only; server remains authoritative.
- Data privacy or visibility impact: no participant payload changes.
- Frontend UX impact: Admin Results attempt detail now includes review-tag
  editing for text answers.
- Environment or deployment impact: none.

## Validation

Commands run:

```bash
npm run typecheck
npm run lint
npm run build
npm test
git diff --check
```

Results:

- Passed: typecheck, lint, build, full test suite, and diff check.
- `npm test` passed after escalation for local PostgreSQL access. The sandboxed
  run failed at API global setup with `EPERM 127.0.0.1:5432`.
- `npm run build` emitted the existing Vite large chunk warning.

Manual tests:

- Passed on 2026-06-29 per user manual browser testing.

Phase closeout artifacts:

- Codex handoff created before final implementation summary: Yes
- Handoff path: `notes/claude_handoff_phase_48.txt`
- Claude review status before commit: Completed

## Claude Review Notes

Source:

- `notes/claude_review_phase_48.txt`

Status:

- Completed

Critical issues:

- None

Suggested improvements:

- Add `role="group"` to the review-tag editor wrapper.
- Replace the single pending mutation key with per-mutation pending state.
- Refresh the tag catalog after stale mutation errors.
- Group review-tag picker options by tag catalog group.

Accepted fixes:

- Added `role="group"` to the review-tag editor wrapper.
- Replaced the unreleased release-note placeholder summary.
- Replaced the single pending mutation key with per-mutation pending state.
- Refreshed the tag catalog after mutation errors.
- Grouped review-tag picker options by tag catalog group.

Deferred findings:

- Duplicate add retains `201 Created` for idempotent no-op requests; acceptable
  for V1.

## Follow-Up Tasks

- Confirm whether Other text, integer answers, or review-tag aggregate rollups
  should be added later.

## Commit Readiness

- Requirements implemented: Yes
- Codex handoff created: Yes
- Product context still aligned: Yes
- Architecture principles still aligned: Yes
- Security review complete: Yes
- Review findings addressed or deferred: Yes
- Manual testing complete: Yes
- Ready to commit: Yes

---

## Phase 47 — Open-Answer Review Tagging Backend Foundation

Date:
2026-06-29

Status:
Implemented; Claude review complete

Prompt:
`prompts/prompt_47.txt`

Git Commit:
Pending

Review Artifacts:
- Codex handoff: `notes/claude_handoff_phase_47.txt`
- Claude review: `notes/claude_review_phase_47.txt`

## Goals

- Store manual review tags for individual saved text answers.
- Expose Admin-only add/remove endpoints and attempt-detail review tags.
- Export review tags separately from automatic hidden tags.

## Built

- Added `response_answer_tags` migration with catalog/tag-definition FKs.
- Added shared review-tag types and Admin attempt-detail fields.
- Added Admin-only add/remove endpoints with ownership and text-only validation.
- Added review tags to attempt detail and a separate CSV `review_tags` column.
- Added reporting tests for auth, validation, idempotency, cascade cleanup,
  detail payloads, and CSV export.

## Important Decisions

### Catalog References

Decision:
Store `tag_definition_id` references instead of denormalized tag key/value text.

Reason:
The tag catalog remains the controlled vocabulary and delete behavior is clean.

Tradeoff:
Deleting a tag definition removes historical manual review-tag links.

### Separate CSV Column

Decision:
Export manual review tags in `review_tags`, not `hidden_tags`.

Reason:
Manual qualitative coding is conceptually separate from automatic hidden tags.

Tradeoff:
Consumers need to read one additional column for manual coding.

## Architecture Notes

- Database/schema impact: added `response_answer_tags`.
- API contract impact: added Admin review-tag endpoints and attempt-detail fields.
- Auth or authorization impact: Admin-only routes with server validation.
- Data privacy or visibility impact: no participant payload changes.
- Frontend UX impact: none in Phase 47.
- Environment or deployment impact: migration required.

## Validation

Commands run:

```bash
npm run typecheck
npm run lint
npm run build
npm test
git diff --check
```

Results:

- Passed: typecheck, lint, build, full test suite, and diff check.
- `npm test` passed after escalation for local PostgreSQL access. The sandboxed
  run failed at API global setup with `EPERM 127.0.0.1:5432`.
- `npm run build` emitted the existing Vite large chunk warning.

Manual tests:

- Not required for backend foundation.

Phase closeout artifacts:

- Codex handoff created before final implementation summary: Yes
- Handoff path: `notes/claude_handoff_phase_47.txt`
- Claude review status before commit: Completed

## Claude Review Notes

Source:

- `notes/claude_review_phase_47.txt`

Status:

- Completed

Critical issues:

- None

Suggested improvements:

- Remove redundant standalone `response_answer_tags(answer_id)` index.

Accepted fixes:

- Removed the redundant `response_answer_tags_answer_id_idx`.

Deferred findings:

- Duplicate add retains `201 Created` for idempotent no-op requests; acceptable
  for V1.

## Follow-Up Tasks

- Confirm whether Other text, integer answers, or review-tag aggregate rollups
  should be added later.

## Commit Readiness

- Requirements implemented: Yes
- Codex handoff created: Yes
- Product context still aligned: Yes
- Architecture principles still aligned: Yes
- Security review complete: Yes
- Review findings addressed or deferred: Yes
- Manual testing complete: Backend automated coverage complete; UI manual pass
  belongs to Phase 48
- Ready to commit: Pending review/manual acceptance

---

## Phase 46 — Public/User Accessibility Verification, Contrast, And Documentation

Date:
2026-06-27

Status:
Implemented; Claude review complete; human browser and assistive-technology
verification pending

Prompt:
`prompts/prompt_46.txt`

Git Commit:
Pending

Review Artifacts:
- Codex handoff: `notes/claude_handoff_phase_46_accessibility_verification.txt`
- Claude review: `notes/claude_review_phase_46_accessibility_verification.txt`

## Goals

- Add a repeatable public and registered-user accessibility verification plan.
- Document contrast checks for light and dark themes.
- Record accessibility primitive usage rules for future public/user work.
- Keep Phase 45 manual verification visible until a human browser/AT pass is
  completed.
- Avoid Admin-only remediation and avoid new browser-test dependencies without
  human approval.

## Built

- Added `markdown/ACCESSIBILITY_TEST_PLAN.md` with keyboard-only, screen reader,
  mobile touch, contrast, route/workflow, defect-recording, and release-gate
  checks.
- Added `markdown/ACCESSIBILITY_PRIMITIVES.md` with usage rules for route
  context, modals, statuses, form fields, toasts, pagination, survey runner
  controls, inline glossary, repeated actions, disabled actions, and theme
  contrast.
- Updated `markdown/REVIEW_CHECKLIST.md` with compact accessibility review
  gates for future public/user phases.
- Updated `markdown/FLOW.md` so the new durable accessibility docs are part of
  the workflow document map.
- Updated `markdown/FOLLOW_UPS.md` to carry the Phase 45/46 manual verification
  pass with a clear reason and to record optional future Playwright/axe
  automation behind human dependency approval.
- Updated `markdown/releases/unreleased.md` with admin-readable draft release
  notes for the new accessibility documentation.

## Important Decisions

### Documentation First

Decision:
Do not add Playwright, axe, jsdom, React Testing Library, or a new
`test:accessibility` command in Phase 46.

Reason:
The current repo has Vitest source/unit tests only, and `prompt_46` requires
human approval for new accessibility test dependencies.

Tradeoff:
Automated browser accessibility checks remain a documented future option rather
than a runnable command in this phase.

### Manual Verification Carried Forward

Decision:
Carry the Phase 45 manual browser and assistive-technology verification forward
instead of marking it complete.

Reason:
The checks require real browser, responsive, screen reader, and mobile touch
access. Codex cannot honestly complete that pass from the local command-line
environment.

Tradeoff:
The plan is now repeatable and explicit, but production acceptance still needs a
human-run manual verification pass.

### Versioning And Patch Notes

Decision:
Update `markdown/releases/unreleased.md` and leave the root app version at
`0.1.5`.

Reason:
The project release workflow keeps implementation-session notes in the draft
release file. Root version bumps and versioned `vX.Y.Z.md` files are handled by
release-preparation commands.

Tradeoff:
The admin app does not publish this draft until release preparation promotes it.

## Architecture Notes

- Database/schema impact: none.
- API contract impact: none.
- Auth or authorization impact: none.
- Data privacy or visibility impact: none; hidden-tag privacy remains called
  out in the accessibility primitive guide.
- Frontend UX impact: no runtime behavior change; future public/user
  accessibility validation is now documented.
- Environment or deployment impact: none; no dependencies, scripts, or runtime
  configuration were added.

## Validation

Commands run:

```bash
git checkout -b phase-46-accessibility-verification
git commit --allow-empty -m "checkpoint before phase 46"
npm run typecheck
npm run lint
npm run build
npm test
npm run release:check
git diff --check
npm run release:check # post-review docs polish
git diff --check # post-review docs polish
```

Results:

- Passed: `npm run typecheck`, `npm run lint`, `npm run build`, approved
  local-PostgreSQL `npm test`, `npm run release:check`, and `git diff --check`.
- `npm run build` emitted the existing Vite large chunk warning.
- `npm test` passed shared, web, API integration, and release-note tests.

Manual tests:

- Not run by Codex. The human browser, keyboard-only, screen reader, mobile
  touch, responsive, and contrast pass is documented in
  `markdown/ACCESSIBILITY_TEST_PLAN.md` and tracked in `markdown/FOLLOW_UPS.md`.

Phase closeout artifacts:

- Codex handoff created before final implementation summary: Yes
- Handoff path: `notes/claude_handoff_phase_46_accessibility_verification.txt`
- Claude review status before commit: Completed; accepted docs polish applied

## Claude Review Notes

Source:

- `notes/claude_review_phase_46_accessibility_verification.txt`

Status:

- Completed

Critical issues:

- None

Suggested improvements:

- Claude suggested avoiding a duplicated Phase 45 pending-work list in
  `markdown/ACCESSIBILITY_TEST_PLAN.md`, tightening "Phases 42-46" wording to
  "Phases 42-45", adding component file paths to the primitives guide, and
  cross-linking the two new accessibility docs.

Accepted fixes:

- Updated the test plan to point to `markdown/FOLLOW_UPS.md` as the live
  manual-verification tracker.
- Tightened the test-plan introduction to refer to Phases 42-45 remediation.
- Added cross-references between the test plan and primitives guide.
- Added relevant component/source file paths to the primitives guide.

Deferred findings:

- Human browser/assistive-technology verification remains pending.
- Optional Playwright/axe automation remains deferred until human approval for
  new dev dependencies.

## Follow-Up Tasks

- Complete the Phase 45/46 public-user manual accessibility pass documented in
  `markdown/ACCESSIBILITY_TEST_PLAN.md`.
- If approved later, add a small Playwright plus axe smoke suite and
  `npm run test:accessibility` for representative public/user routes in both
  themes.

## Commit Readiness

- Requirements implemented: Yes
- Codex handoff created: Yes
- Product context still aligned: Yes
- Architecture principles still aligned: Yes
- Security review complete: Yes; Claude found no security, environment, or
  regression surface because this phase is documentation-only
- Review findings addressed or deferred: Yes
- Manual testing complete: No; human browser/assistive-technology pass remains
  tracked as a follow-up
- Ready to commit: Yes

---

## Phase 45 — User Dashboard And Public Directory Accessibility Polish

Date:
2026-06-27

Status:
Implemented; Claude review complete; manual browser and assistive-technology
testing pending

Prompt:
`prompts/prompt_45.txt`

Git Commit:
Pending

Review Artifacts:
- Codex handoff: `notes/claude_handoff_phase_45_user_facing_accessibility.txt`
- Claude review: `notes/claude_review_phase_45_user_facing_accessibility.txt`

## Goals

- Add contextual accessible names to repeated public and registered-user survey actions.
- Keep Phase 44 pagination and status primitives intact while correcting any scoped inconsistency.
- Tighten participant-facing inline glossary ARIA without changing survey data, responses, hidden tags, reporting, or CSV behavior.
- Keep Admin-only accessibility findings out of implementation scope.

## Built

- Added visually hidden survey-title context inside repeated dashboard and category survey action buttons.
- Added visually hidden context to the dashboard resume nudge and category group drill-in action.
- Added visually hidden survey-title context to public anonymous directory start links and clarified the homepage public-directory entry link.
- Added polite live-region semantics to the category empty state while preserving the non-animated empty-state visual treatment and back-to-dashboard link.
- Replaced inline glossary `aria-description` with stable `aria-describedby` pointing at a mounted tooltip definition hidden when closed.
- Added focused source-level web tests for the Phase 45 accessible-name, status, and glossary ARIA wiring.
- Updated draft release notes and the follow-up backlog.

## Important Decisions

### Visible Labels Stay Stable

Decision:
Use visually hidden context inside controls instead of replacing visible labels with `aria-label`.

Reason:
This keeps the visible button/link text unchanged while making screen-reader button and link lists specific enough to distinguish repeated actions.

### Pagination Remains Unchanged

Decision:
Do not modify `PaginationRow` in Phase 45.

Reason:
Phase 44 already added a concise polite atomic status region, and Phase 45 review did not find a scoped regression in dashboard or category usage.

### Terminal Empty State Does Not Use Loading Animation

Decision:
Use `role="status"` and `aria-live="polite"` directly on the category empty-state container instead of wrapping it in `AlertMessage`.

Reason:
`AlertMessage` info styling inherits the animated `.status.muted` treatment intended for loading/status lines. The category empty state is terminal, so it should not pulse like loading feedback.

### Release Notes And Versioning

Decision:
Update `markdown/releases/unreleased.md` and leave the root app version at `0.1.5`.

Reason:
The project release workflow keeps production-bound implementation notes in the draft release file during phase work. Root version bumps and versioned release files are handled by release-preparation commands.

## Architecture Notes

- Database/schema impact: none.
- API contract impact: none.
- Auth or authorization impact: none.
- Data privacy or visibility impact: none; hidden tags, survey answers, reporting, and CSV behavior are untouched.
- Frontend UX impact: repeated public/user actions now expose more context to assistive technology; inline glossary definitions use a more robust described-by target.
- Environment or deployment impact: none.

## Validation

Commands run:

```bash
git checkout -b phase-45-user-facing-accessibility-polish
git commit --allow-empty -m "checkpoint before phase 45"
npm run typecheck -w apps/web
npm run lint -w apps/web
npm run test -w apps/web -- UserFacingAccessibility.test.ts FormFeedback.test.ts
npm run typecheck
npm run lint
npm run build
npm test
npm test # rerun with approved local PostgreSQL access after sandbox EPERM
npm run release:check
git diff --check

# post-review focused checks
npm run typecheck -w apps/web
npm run lint -w apps/web
npm run test -w apps/web -- UserFacingAccessibility.test.ts FormFeedback.test.ts

# post-review full matrix rerun
npm run typecheck
npm run lint
npm run build
npm test
npm test # rerun with approved local PostgreSQL access after sandbox EPERM
npm run release:check
git diff --check
```

Results:

- Passed: focused web typecheck, lint, focused web tests, full typecheck, full lint, full build, approved full `npm test`, `npm run release:check`, `git diff --check`, post-review focused web checks, and the post-review full matrix rerun.
- The sandboxed `npm test` attempt passed shared and web tests, then the API suite could not connect to local PostgreSQL due to sandbox `EPERM` on `127.0.0.1:5432`.
- The approved `npm test` rerun passed shared, web, API, and release-note tests.
- `npm run build` emitted the existing Vite large chunk warning.

Manual tests:

- Not run in this implementation pass; tracked in `markdown/FOLLOW_UPS.md` for browser, keyboard, responsive, and assistive-technology verification.

Phase closeout artifacts:

- Codex handoff created before final implementation summary: Yes
- Handoff path: `notes/claude_handoff_phase_45_user_facing_accessibility.txt`
- Claude review status before commit: Completed; accepted fix applied

## Claude Review Notes

Source:

- `notes/claude_review_phase_45_user_facing_accessibility.txt`

Status:

- Completed

Critical issues:

- None

Suggested improvements:

- Claude noted that the category terminal empty state inherited `.status.muted`
  loading animation when rendered through `AlertMessage`, and suggested avoiding
  the animated status styling for a final empty result.
- Claude also noted optional cascade fragility and inert whitespace from stacking
  `status muted builder-empty-state`; these were resolved by the same accepted
  markup change.
- Claude flagged the homepage anonymous-directory hidden suffix as optional but
  acceptable clarity.

Accepted fixes:

- Changed the category empty state to use its original `builder-empty-state`
  container with `role="status"`, `aria-live="polite"`, and `aria-atomic="true"`
  instead of the animated `AlertMessage` info styling.

Deferred findings:

- Manual browser/assistive-technology verification remains pending and is tracked in `markdown/FOLLOW_UPS.md`.

## Follow-Up Tasks

- Complete the Phase 45 manual browser/assistive-technology pass recorded in `markdown/FOLLOW_UPS.md`.
- Complete any human-approved manual verification and commit decision.

## Commit Readiness

- Requirements implemented: Yes
- Codex handoff created: Yes
- Product context still aligned: Yes
- Architecture principles still aligned: Yes
- Security review complete: Yes; Claude found no security or data-exchange issues
- Review findings addressed or deferred: Yes
- Manual testing complete: No; manual browser/assistive-technology pass remains tracked as a follow-up
- Ready to commit: Yes; human approved commit after automated tests and Claude review, with manual verification follow-up still tracked

---

## Phase 44 — Form Feedback And Required Field Accessibility

Date:
2026-06-27

Status:
Implemented; Claude review complete; manual browser and assistive-technology
testing passed

Prompt:
`prompts/prompt_44.txt`

Git Commit:
Pending

Review Artifacts:
- Codex handoff: `notes/claude_handoff_phase_44_form_feedback_accessibility.txt`
- Claude review: `notes/claude_review_phase_44_form_feedback_accessibility.txt`

## Goals

- Add small shared form feedback primitives for scoped public and
  registered-user forms.
- Make auth and account form errors/statuses more consistently announced and
  associated with controls.
- Add visible/programmatic required and optional conventions in high-value
  scoped forms.
- Improve shared toast and pagination live-region semantics without migrating
  Admin forms.

## Built

- Added `AlertMessage` for error/success/info statuses with appropriate
  `role="alert"` or `role="status"` behavior.
- Added `FormField` for stable ids, visible required/optional markers, helper
  text, field error text, `aria-describedby`, and `aria-invalid`.
- Applied the form pattern to Login, Register, Forgot password, Reset password,
  and Account settings profile fields.
- Kept backend validation and API calls unchanged. Existing server/form errors
  remain one visible alert while scoped controls can reference that alert and be
  marked invalid.
- Added field-specific phone-number feedback in Account settings and
  discoverable disabled explanations for invalid reset links and reset-email
  cooldown.
- Converted scoped public/user loading, empty, success, and error states to the
  shared status primitive where practical.
- Updated shared pagination status to a polite, atomic live region.
- Updated shared toasts so notifications are not rendered as whole clickable
  buttons; success and error toasts now render into persistent polite/assertive
  live-region containers, each toast has a visible dismiss control, and
  auto-dismiss timing is longer.
- Restored auth-form staggered reveal behavior on migrated `FormField` labels.
- Added focused source-level web tests for form/status primitives, toast
  semantics, pagination live status, and account phone/cooldown feedback.
- Updated draft release notes and follow-up backlog.

## Important Decisions

### Public/User Scope

Decision:
Apply the field migration only to public and registered-user forms named in the
prompt.

Reason:
Admin form migration is explicitly deferred. Shared toast changes affect Admin
pages incidentally because `ToastProvider` is app-wide, so those pages should
receive smoke compatibility review only.

### Form-Level Server Errors

Decision:
Keep existing backend/server errors as one form-level alert, and connect
relevant controls to that alert with `aria-describedby` plus `aria-invalid`
instead of duplicating the same message under every field.

Reason:
The current API error shapes are form-level. Duplicating the same server error
as field-specific text would add noise and imply precision the backend did not
provide.

### Release Notes And Versioning

Decision:
Update `markdown/releases/unreleased.md` and leave the root app version at
`0.1.5` during implementation.

Reason:
The project release workflow uses `unreleased.md` as the production-bound draft
during implementation. Version bumps and versioned release files are handled by
release preparation commands.

## Architecture Notes

- Database/schema impact: none.
- API contract impact: none.
- Auth or authorization impact: none.
- Data privacy or visibility impact: none; hidden tags and survey responses are
  untouched.
- Frontend UX impact: scoped forms now expose clearer field requirements,
  helper/error associations, live statuses, pagination announcements, and toast
  dismiss controls.
- Environment or deployment impact: none.

## Validation

Commands run:

```bash
# initial focused checks
npm run typecheck -w apps/web
npm run lint -w apps/web
npm run test -w apps/web -- FormFeedback.test.ts App.test.ts components/AccessibleModal.test.ts

# full matrix
npm run typecheck
npm run lint
npm run build
npm test
npm test # rerun with approved local PostgreSQL access after sandbox EPERM
git diff --check

# post-review full matrix rerun
npm run typecheck
npm run lint
npm run build
npm test
npm test # rerun with approved local PostgreSQL access after sandbox EPERM
git diff --check
```

Results:

- Passed: all commands above except the sandboxed `npm test` attempts.
- The sandboxed `npm test` attempts passed shared and web tests, then the
  API suite could not connect to local PostgreSQL due to sandbox `EPERM` on
  `127.0.0.1:5432`.
- The approved reruns of `npm test` passed shared, web, API, and release-note
  tests.
- `npm run build` emitted the existing Vite large chunk warning.
- The full command matrix was rerun after Claude review fixes and passed, with
  the same sandboxed-then-approved PostgreSQL test pattern.

Manual tests:

- Passed per developer manual testing on 2026-06-27.
- Developer verified invalid login, register missing/invalid fields,
  forgot/reset password success and error states, reset success modal focus
  behavior after status-copy changes, account settings invalid phone and
  successful save, toast/status behavior, dashboard/category pagination
  announcement, keyboard-only and mobile checks at 375/768/1280px, and Admin
  smoke compatibility for shared toasts.

Phase closeout artifacts:

- Codex handoff created before final implementation summary: Yes
- Handoff path: `notes/claude_handoff_phase_44_form_feedback_accessibility.txt`
- Claude review status before commit: Completed; findings addressed

## Claude Review Notes

Source:

- `notes/claude_review_phase_44_form_feedback_accessibility.txt`

Status:

- Completed; approved after Codex addressed the toast live-region reliability
  finding.

Critical issues:

- None.

Accepted fixes:

- Changed success/error toasts to render inside persistent polite/assertive live
  regions instead of relying on transient `role="status"` children.
- Replaced inert `aria-describedby` usage on important native-disabled reset
  controls with focusable `aria-disabled` states and guarded handlers.
- Added a `reveal` prop to `FormField` and restored auth-form `data-reveal`
  behavior.

Deferred findings:

- Render-level DOM tests remain deferred until the project adopts a frontend DOM
  test harness.

## Follow-Up Tasks

- None for Phase 44 closeout.

## Commit Readiness

- Requirements implemented: Yes
- Codex handoff created: Yes
- Product context still aligned: Yes
- Architecture principles still aligned: Yes
- Security review complete: Yes; Claude found no security or scope blockers
- Review findings addressed or deferred: Yes
- Manual testing complete: Yes
- Ready to commit: Yes

---

## Phase 43 — Public/User App Shell, Route, And Modal Accessibility

Date:
2026-06-27

Status:
Implemented; Claude review complete; manual browser and screen reader testing passed

Prompt:
`prompts/prompt_43.txt`

Git Commit:
Pending

Review Artifacts:
- Codex handoff: `notes/claude_handoff_phase_43_shell_modal_accessibility.txt`
- Claude review: `notes/claude_review_phase_43_shell_modal_accessibility.txt`

## Goals

- Add public and registered-user route title, focus, and announcement behavior.
- Add skip-to-main navigation and remove repeated header-brand `h1` usage.
- Replace unsupported account menu ARIA menu semantics with disclosure
  navigation behavior.
- Add reusable modal focus management and apply it to public/user dialogs.

## Built

- Added a route accessibility manager in the app shell that maps scoped routes
  to document titles, focuses the stable `main-content` target after route
  changes, and announces navigation through a polite live region.
- Added a skip link before repeated header navigation and made `<main>` a
  stable focus target.
- Changed public/user header brand text from repeated `h1` elements to styled
  brand text, then normalized scoped page headings to `h1` where low-risk.
- Added `AccessibleModal`, a small portal-based dialog primitive with initial
  focus, Tab containment, Escape close, return focus, labelled title,
  optional description, body scroll lock, and background `inert`/`aria-hidden`
  handling.
- Applied the modal primitive to the anonymous follow-up email modal and the
  password reset success modal.
- Converted the account menu to a disclosure panel with normal links/buttons,
  `aria-expanded`/`aria-controls`, Escape close, outside-click close, and focus
  return to the trigger on Escape.
- Added focused source-level web tests for route title mapping, skip/main
  wiring, account disclosure semantics, and modal behavior.
- Updated draft release notes and follow-up backlog.

## Important Decisions

### Public/User Scope

Decision:
Keep route title mappings and heading normalization scoped to public and
registered-user routes.

Reason:
The prompt explicitly defers Admin-only remediation. Admin routes are only
affected by shared shell primitives where unavoidable.

### Release Notes And Versioning

Decision:
Update `markdown/releases/unreleased.md` and leave the root app version at
`0.1.5` during implementation.

Reason:
The project release workflow uses `unreleased.md` as the production-bound draft
during implementation. Version bumps and versioned release files are handled by
release preparation commands.

### Claude Review Annotation

Decision:
Do not create or fill a Claude review output file before Claude review occurs.
Annotate the missing documented feedback as pending in this phase log and the
Codex handoff.

Reason:
The user noted that Claude Code review has not resulted in documented handoffs
as feedback. The implementation should preserve that truth rather than imply a
review was completed.

## Architecture Notes

- Database/schema impact: none.
- API contract impact: none.
- Auth or authorization impact: none.
- Data privacy or visibility impact: none; hidden tags and participant survey
  response data are untouched.
- Frontend UX impact: route changes now update title/focus/announcement;
  public/user dialogs trap focus; account navigation menu semantics changed to
  disclosure semantics without visual redesign.
- Environment or deployment impact: none.

## Validation

Commands run:

```bash
npm run typecheck -w apps/web
npm run test -w apps/web -- App.test.ts components/AccessibleModal.test.ts
npm run typecheck
npm run lint
npm run build
npm test
npm test # rerun with approved local PostgreSQL access after sandbox EPERM
git diff --check
npm run typecheck -w apps/web
npm run lint -w apps/web
npm run test -w apps/web -- App.test.ts components/AccessibleModal.test.ts
git diff --check
```

Results:

- Passed: all commands above except the first sandboxed `npm test` attempt.
- The first sandboxed `npm test` attempt passed shared and web tests, then the
  API suite could not connect to local PostgreSQL due to sandbox `EPERM` on
  `127.0.0.1:5432`.
- The approved rerun of `npm test` passed shared, web, API, and release-note
  tests.
- `npm run build` emitted the existing Vite large chunk warning.
- The final modal cleanup was followed by the affected web typecheck, lint,
  focused tests, and `git diff --check`; all passed.

Manual tests:

- Passed per developer manual testing on 2026-06-27.
- Developer verified keyboard-only route navigation across scoped public and
  registered-user routes, skip-link focus and main-content landing, account
  disclosure Escape/outside-click behavior with focus return, password reset
  and anonymous follow-up modal focus trap/Escape/return-focus behavior,
  browser title updates, responsive header/menu behavior at 375/768/1280px,
  and Admin smoke navigation for shared-shell regression.
- Developer completed screen reader/assistive-technology spot checks for route
  announcements, main-content focus, account disclosure semantics, and modal
  descriptions/focus behavior.

Phase closeout artifacts:

- Codex handoff created before final implementation summary: Yes
- Handoff path: `notes/claude_handoff_phase_43_shell_modal_accessibility.txt`
- Claude review status before commit: Completed; approved with no blockers.

## Claude Review Notes

Source:

- `notes/claude_review_phase_43_shell_modal_accessibility.txt`

Status:

- Completed; approved with no blockers.

Critical issues:

- None.

Suggested improvements:

- Consider renaming the modal base CSS class from the feature-specific
  `contact-email-modal` to a neutral reusable modal class in a future cleanup.
- Consider resetting or nonce-ing the route live region so consecutive
  different routes with the same generic title, such as category pages, can
  re-announce more reliably.
- Consider render-level/jsdom coverage for the reusable modal primitive if the
  project expands frontend DOM testing beyond current source-tripwire tests.

Accepted fixes:

- None required; review found no blockers.

Deferred findings:

- Admin-only heading hierarchy and Admin accessibility findings remain deferred
  to the Admin accessibility backlog.
- Unmapped Admin routes intentionally keep out-of-scope title/focus/announcement
  behavior for this phase.
- The survey runner heading order now has a visually hidden `h1` followed by
  existing runner `h3` headings; Claude marked this a non-blocking best-practice
  nit.
- Programmatic route focus lands on `<main>` without a visible outline; Claude
  marked this acceptable for a focus-shift target.

## Follow-Up Tasks

- Keep Claude's non-blocking modal CSS naming, route live-region repeated-title,
  and jsdom modal test recommendations visible for future accessibility polish
  or frontend test-harness phases.

## Commit Readiness

- Requirements implemented: Yes
- Codex handoff created: Yes
- Product context still aligned: Yes
- Architecture principles still aligned: Yes
- Security review complete: Yes; Claude found no blockers or behavior/security
  drift
- Review findings addressed or deferred: Yes
- Manual testing complete: Yes
- Ready to commit: Yes

---

## Phase 42 — Survey Runner Critical Accessibility

Date:
2026-06-27

Status:
Implemented; Claude review complete; manual browser and screen reader testing passed

Prompt:
`prompts/prompt_42.txt`

Git Commit:
Pending

Review Artifacts:
- Codex handoff: `notes/claude_handoff_phase_42_survey_runner_accessibility.txt`
- Claude review: `notes/claude_review_phase_42_survey_runner_accessibility.txt`

## Goals

- Fix the participant scale question unset state so unanswered required scales
  are not exposed as the minimum value.
- Add semantic programmatic progress for the current survey path.
- Strengthen answer-control prompt/help/error associations in the survey
  runner without changing response shape, skip logic, hidden tags, reporting,
  or CSV behavior.
- Announce runner validation and save/submit errors more reliably.

## Built

- Replaced the participant scale range input with styled native radio options.
- Preserved scale save behavior through the existing selected answer option id
  state and answer payload.
- Removed dead range slider CSS after Claude review and renamed the remaining
  selected-value scale classes from `scale-slider-*` to `scale-answer-*`.
- Added question-scoped error tracking so invalid integer, required scale, and
  failed answer-save messages render next to the affected question with
  `role="alert"` and `aria-invalid`.
- Added stable ids for question prompts, help text, helper text, controls, and
  error messages.
- Connected text, integer, scale, normal selection, and Other controls to their
  prompt and relevant help/error/helper text.
- Added question-specific labels to integer stepper increase/decrease buttons.
- Replaced the aria-hidden progress track with a native `progress` element,
  visible current path context, and screen-reader value text.
- Added alert/status semantics for runner loading/load failures, anonymous
  account registration errors, anonymous follow-up email errors, and follow-up
  email saved status.
- Added focused web source tests for the runner accessibility changes.
- Updated draft release notes and follow-up backlog.

## Important Decisions

### Native Radio Scale

Decision:
Use native radio options for participant scale questions instead of preserving
the range slider.

Reason:
The range control exposed the minimum value before an answer was selected.
Native radios have an honest unset state while preserving the existing selected
answer option id contract.

### Phase Boundary

Decision:
Do not add modal focus trapping, route focus management, or a global form-field
primitive in this phase.

Reason:
Those are explicitly assigned to Phases 43 and 44. Phase 42 only improves
runner-level modal/email labels, descriptions, invalid state, and error
announcement where they already exist. Focus trapping, Escape close, return
focus, and background inert behavior remain Phase 43.

### Release Notes And Versioning

Decision:
Update `markdown/releases/unreleased.md` during implementation and leave the
root app version at `0.1.5`.

Reason:
The release workflow treats `unreleased.md` as the working draft during
production-bound implementation. The version bump and versioned release file
belong to `npm run release:prepare` / release prep.

## Architecture Notes

- Database/schema impact: none.
- API contract impact: none.
- Response shape impact: none.
- Conditional logic/skip behavior impact: none expected.
- Hidden tag, reporting, and CSV impact: none expected.
- Auth/anonymous attempt behavior impact: no API or authorization changes.
- Frontend UX impact: scale questions render as radio-style choices instead of
  a range slider; progress now includes visible path context.
- Environment or deployment impact: none.

## Validation

Commands run:

```bash
npx tsc --noEmit -p apps/web/tsconfig.json
npm run test -w apps/web -- src/pages/SurveyAttemptPage.test.ts
npm run lint -w apps/web
npm run typecheck
npm run lint
npm run build
npm test
git diff --check
npx tsc --noEmit -p apps/web/tsconfig.json
npm run test -w apps/web -- src/pages/SurveyAttemptPage.test.ts
npm run lint -w apps/web
```

Results:

- Passed: all commands above. The last three commands were rerun after the
  Claude cleanup changes.
- `npm run build` emitted the existing Vite large chunk warning.
- `npm test` passed shared, web, API, and release-note tests. API tests used
  approved local PostgreSQL access.

Manual tests:

- Passed per developer manual testing on 2026-06-27.
- Developer verified the participant runner after the scale radio conversion:
  required unanswered scale validation, selected scale radio value,
  text/integer/selection/Other prompt and helper/error announcements, semantic
  progress, failed save/submit alerts, anonymous follow-up email modal error
  announcement, keyboard-only controls, responsive layouts at 375/768/1280px,
  conditional page/skip logic, and inline glossary prompts.

## Claude Review Notes

Source:

- `notes/claude_review_phase_42_survey_runner_accessibility.txt`

Status:

- Completed; approved with cleanup.

Accepted fixes:

- Deleted orphaned range slider CSS left behind by the radio-scale conversion.
- Renamed the reused scale selected-value classes to `scale-answer-*`.
- Removed a misleading no-op `transition: width` declaration from the native
  progress value styling.

Deferred findings:

- Keep in mind that future navigation changes should preserve the current
  invariant that question-scoped errors are cleared before the question leaves
  the visible page.
- Rendered DOM/accessibility-tree tests remain deferred; current tests follow
  the existing source-tripwire convention.

## Follow-Up Tasks

- None for Phase 42.

## Commit Readiness

- Requirements implemented: Yes
- Codex handoff created: Yes
- Product context still aligned: Yes
- Architecture principles still aligned: Yes
- Security review complete: Yes; Claude found no blocking issues
- Review findings addressed or deferred: Yes
- Manual testing complete: Yes
- Ready to commit: Yes

---

## Phase 41 — Participant Inline Glossary Rendering

Date:
2026-06-27

Status:
Implemented; Claude review complete; manual browser testing passed

Prompt:
`prompts/prompt_41.txt`

Git Commit:
Pending

Review Artifacts:
- Codex handoff: `notes/claude_handoff_phase_41_inline_glossary_rendering.txt`
- Claude review: `notes/claude_review_phase_41_inline_glossary_rendering.txt`

## Goals

- Render enabled Admin-approved global glossary terms inline in participant
  question prompts.
- Include participant-safe glossary entries in authenticated and anonymous
  runner payloads without exposing Admin source metadata.
- Keep glossary definitions informational only, with no survey logic,
  response, reporting, hidden-tag, or CSV coupling.

## Built

- Added a shared deterministic plain-text glossary matcher with
  longest-match-first overlap resolution, case-insensitive matching, repeated
  match support, and word-boundary checks.
- Added an API glossary service for the participant-safe projection and reused
  it from the existing Admin-gated `/api/admin/glossary/participant-safe`
  endpoint.
- Added enabled glossary entries to authenticated start/resume payloads and
  anonymous start payloads used by the survey runner.
- Added an inline glossary React renderer with hover, focus, click/tap, Escape,
  and mobile-friendly popover behavior.
- Styled glossary terms with a dotted underline and subtle hover/focus
  highlight so participants can identify definitions without hunting.
- Added a small bottom margin under question prompts so glossary underlines do
  not crowd the first answer choice.
- Rendered glossary terms in participant question prompts and Admin survey
  preview question prompts.
- Added focused shared matcher tests and API tests for authenticated and
  anonymous participant-safe payload isolation.
- Updated release notes and follow-up backlog.

## Important Decisions

### Attempt-Scoped Participant Exposure

Decision:
Participant UI receives glossary entries through authorized attempt payloads
instead of calling the Admin-only glossary endpoint.

Reason:
The Phase 39 participant-safe Admin endpoint remains Admin-gated by design;
attempt-scoped exposure keeps public/participant access tied to the existing
survey authorization paths.

### Prompt-Only Rendering

Decision:
Glossary rendering applies to question prompt text in the runner and preview,
not page descriptions, help text, or answer option labels.

Reason:
The prompt scoped this phase to plain participant-facing question text unless a
shared renderer clearly demanded more. Broader surfaces remain a documented
follow-up for client confirmation.

## Architecture Notes

- Database/schema impact: none.
- API contract impact: adds `glossaryEntries` to runner-facing
  `StartSurveyResponse` and `MySurveyResponse` payloads.
- Auth or authorization impact: no new participant route; existing Admin route
  remains Admin-only.
- Data privacy or visibility impact: participant payload exposes only
  `{ id, canonicalTerm, definition, matchStrings }`.
- Frontend UX impact: question prompts can include inline definition triggers.
- Environment or deployment impact: none.

## Validation

Commands run:

```bash
npm run test -w packages/shared -- glossaryText
npm run build -w packages/shared
npx tsc --noEmit -p apps/web/tsconfig.json
npx tsc --noEmit -p apps/api/tsconfig.json
npm run test -w apps/web -- src/pages/SurveyAttemptPage.test.ts
npm run test -w apps/api -- attemptLifecycle anonymousSurvey glossary
npm run typecheck
npm run lint
npm run build
npm test
git diff --check
npm run build -w packages/shared
npm run test -w packages/shared -- glossaryText
npx tsc --noEmit -p apps/web/tsconfig.json
npm run test -w apps/web -- src/pages/SurveyAttemptPage.test.ts
npx tsc --noEmit -p apps/web/tsconfig.json
npm run test -w apps/web -- src/pages/SurveyAttemptPage.test.ts
npm run lint -w apps/web
git diff --check
npm run build -w apps/web
```

Results:

- Passed: all commands above.
- `npm run build` emitted the existing Vite large chunk warning.
- API tests required approved local PostgreSQL access because the suite resets
  and migrates the test schema.

Manual tests:

- Passed per developer manual testing on 2026-06-27.
- After the manual pass, glossary terms were updated to use the standard dotted
  underline affordance with subtle hover/focus highlighting for better
  discoverability.
- A Claude re-review found that the post-manual click/tap toggle change broke
  first-tap mobile opening because focus opened the popover before click
  toggled it shut. The interaction was fixed with a focus-open click guard.
  Targeted mobile recheck passed per developer testing.
- After the targeted pass, question prompt bottom spacing was increased
  slightly to reduce crowding before answer choices.

## Claude Review Notes

Source:

- `notes/claude_review_phase_41_inline_glossary_rendering.txt`

Status:

- Completed; approved with minor changes.

Accepted fixes:

- Removed the glossary trigger `aria-label` so the visible matched term remains
  the trigger name and does not distort the fieldset legend's question name.
- Added `aria-description="Definition available"` and retained
  `aria-describedby` for the open tooltip.
- Memoized glossary text segmentation in the React renderer.
- Changed inline glossary wrappers to allow multi-word matches to wrap.
- Made click/tap toggle glossary popovers while preserving focus and Escape
  dismissal.
- Fixed the mobile first-tap regression introduced by the click/tap toggle by
  ignoring the click immediately following a focus-open.
- Restored the existing question-prompt letter spacing.
- Documented the plain-text matcher's locale-expanding Unicode case-folding
  limitation for future i18n work.

Deferred findings:

- Confirm actual fieldset and glossary trigger announcements with NVDA or
  VoiceOver during the manual browser pass.

## Follow-Up Tasks

- Confirm whether glossary rendering should expand to page descriptions,
  question help text, or answer option labels.

## Commit Readiness

- Requirements implemented: Yes
- Codex handoff created: Yes
- Product context still aligned: Yes
- Architecture principles still aligned: Yes
- Security review complete: Yes; Claude found no blocking issues
- Review findings addressed or deferred: Yes
- Manual testing complete: Yes
- Ready to commit: Yes

---

## Phase 40 — Dictionary-Assisted Glossary Definitions

Date:
2026-06-26

Status:
Implemented; Claude review complete; manual browser testing passed

Prompt:
`prompts/prompt_40.txt`

Git Commit:
Pending

Review Artifacts:
- Codex handoff: `notes/claude_handoff_phase_40_glossary_dictionary_assist.txt`
- Claude review: `notes/claude_review_phase_40_glossary_dictionary_assist.txt`

## Goals

- Add Admin-only dictionary suggestions for global glossary definitions.
- Keep dictionary provider calls server-side and environment-driven.
- Preserve manual Admin approval/editing of final glossary definitions.
- Avoid participant inline glossary rendering or participant API exposure.

## Built

- Added shared Admin dictionary lookup response and suggestion types.
- Added optional dictionary provider config:
  `DICTIONARY_PROVIDER=disabled` by default, or
  `DICTIONARY_PROVIDER=merriam-webster` with
  `MERRIAM_WEBSTER_COLLEGIATE_API_KEY`.
- Added a Merriam-Webster Collegiate Dictionary API client that normalizes
  `shortdef` values to plain text and treats string-array responses as spelling
  suggestions/no exact match.
- Added Admin-only `POST /api/admin/glossary/lookup`.
- Added test-mode protection so automated tests disable live dictionary
  lookups even when local `.env` contains a real provider key.
- Extended `/admin/glossary` with lookup controls near the canonical term and
  definition fields, suggestion results, apply buttons, and a manual-source
  control.
- Added source metadata handling so applied suggestions save as
  `dictionary_suggested`, while ignored/manual entries save as `manual` and
  clear provider metadata.
- Hardened server-side source metadata validation so
  `dictionary_suggested` requires provider metadata and direct manual API saves
  clear stale provider fields.
- Added focused API/service tests and web form-helper tests.
- Updated `.env.example`, `.env.prod.example`,
  `markdown/GLOBAL_DEVELOPMENT_ENVIRONMENT.txt`, and
  `markdown/releases/unreleased.md`.

## Important Decisions

### Server-Side Provider Access Only

Decision:
The browser calls only the app API. Merriam-Webster requests happen in the API
service layer.

Reason:
The provider key must remain an environment secret, and Admin authorization
must be enforced server-side.

Tradeoff:
The API now owns provider timeout/error mapping and response normalization.

### Test-Mode Provider Guard

Decision:
When `NODE_ENV=test`, dictionary provider config resolves to disabled.

Reason:
Local development may have a real provider key in `.env`, but automated tests
must never make live API calls or consume provider quota.

Tradeoff:
Provider-enabled behavior is tested through direct mocked service tests and a
mocked route override rather than live route calls.

### Explicit Source Application

Decision:
Dictionary metadata is sent only when an Admin applies a suggestion.

Reason:
Lookup should never mutate saved glossary metadata by itself; the Admin remains
the approver of the final definition.

Tradeoff:
Admins use a visible "Use manual source" control when they want to clear an
applied/existing dictionary source while editing.

## Architecture Notes

- Database/schema impact: none; Phase 39 source metadata fields are reused.
- API contract impact: adds Admin dictionary lookup response types and
  `POST /api/admin/glossary/lookup`.
- Auth or authorization impact: the lookup route inherits the existing
  authenticated Admin-only glossary router gate.
- Data privacy or visibility impact: provider keys stay server-side; no
  participant-facing routes or payloads changed.
- Frontend UX impact: Admin glossary forms can request, review, apply, edit, or
  ignore dictionary suggestions.
- Environment or deployment impact: optional dictionary provider variables are
  documented; disabled remains the safe default.

## Validation

Commands run:

```bash
npm run build -w packages/shared
npx tsc --noEmit -p apps/api/tsconfig.json
npx tsc --noEmit -p apps/web/tsconfig.json
npm run test -w apps/web -- src/pages/admin/glossaryForm.test.ts
npm run test -w apps/api -- test/dictionary.test.ts test/glossary.test.ts
npm run lint
npm run build
npm run typecheck
npm test
git diff --check
```

Results:

- Passed: all commands above.
- `npm run build` emitted the existing Vite large chunk warning.
- API tests required approved local PostgreSQL access.
- An initial focused API test run revealed that local `.env` had a real
  dictionary provider configured, causing an accidental live lookup in a route
  test. The implementation was hardened so `NODE_ENV=test` disables dictionary
  provider access by default, then focused and full suites passed.

Manual tests:

- Passed per developer manual testing on 2026-06-26. Covered
  `/admin/glossary` lookup controls at 375/768/1280px, including provider
  disabled/manual entry, suggestion lookup, apply/edit/save, use manual source,
  no-match/suggestions, and existing entry edit/toggle behavior.

Phase closeout artifacts:

- Codex handoff created before final implementation summary: Yes
- Handoff path: `notes/claude_handoff_phase_40_glossary_dictionary_assist.txt`
- Claude review status before commit: Completed

## Claude Review Notes

Source:

- `notes/claude_review_phase_40_glossary_dictionary_assist.txt`

Status:

- Completed

Critical issues:

- None; Claude approved the phase with no blocking issues.

Suggested improvements:

- Rename the branch from `prompt-40-glossary-rendering` to
  `phase-40-glossary-dictionary-assist` to avoid implying Phase 41 participant
  rendering shipped here.
- Harden direct API source metadata consistency for `manual` and
  `dictionary_suggested` saves.
- Consider a light lookup throttle or cache when the provider is enabled for
  client use.
- Confirm Merriam-Webster branding asset requirements before production
  enablement.

Accepted fixes:

- Renamed the branch to `phase-40-glossary-dictionary-assist`.
- Added server-side validation requiring complete source metadata for
  `dictionary_suggested` saves and clearing provider metadata for manual saves.
- Added API tests for incomplete dictionary metadata rejection and direct manual
  metadata clearing.

Deferred findings:

- Lookup throttle/cache deferred until provider enablement or observed Admin
  usage requires quota protection beyond the in-flight button state.
- Merriam-Webster logo/branding asset confirmation remains a production
  enablement follow-up because the provider ships disabled by default.

## Problems Encountered

- Problem: Automated route tests initially used the local real dictionary
  provider because `.env` already had provider configuration.
  Resolution: Forced dictionary config to disabled under `NODE_ENV=test`; added
  mocked service/route coverage and reran focused/full tests successfully.

## Follow-Up Tasks

- Confirm with the client/production account owner whether the Admin-only
  suggestion UI needs an approved Merriam-Webster logo asset before enabling
  the provider in production.
- Consider a lightweight lookup throttle/cache before enabling the
  Merriam-Webster provider for broader Admin use.
- Phase 41: expose enabled glossary entries to participant flows and render
  inline definitions accessibly.

## Commit Readiness

- Requirements implemented: Yes
- Codex handoff created: Yes
- Product context still aligned: Yes
- Architecture principles still aligned: Yes
- Security review complete: Yes; Claude found no blocking issues
- Review findings addressed or deferred: Yes
- Manual testing complete: Yes
- Ready to commit: Yes

---

## Phase 39 — Global Glossary Admin Foundation

Date:
2026-06-26

Status:
Implemented; Claude review complete; manual browser testing passed

Prompt:
`prompts/prompt_39.txt`

Git Commit:
Pending

Review Artifacts:
- Codex handoff: `notes/claude_handoff_phase_39_glossary_admin.txt`
- Claude review: `notes/claude_review_phase_39_glossary_admin.txt`

## Goals

- Add durable global glossary storage for Admin-approved participant inline
  terms.
- Provide Admin-only CRUD for canonical terms, definitions, aliases, and
  enabled state.
- Keep glossary data independent from survey logic, response storage,
  reporting, hidden tags, and CSV.

## Built

- Added `database/migrations/0035_global_glossary.sql` with
  `glossary_entries` and `glossary_match_strings`.
- Added shared Admin and participant-safe glossary response types.
- Added Admin-only `/api/admin/glossary` CRUD plus an Admin-only
  `/api/admin/glossary/participant-safe` payload for later rendering reuse.
- Added `/admin/glossary` and linked it from the Admin tools panel.
- Added focused API tests for authorization, CRUD/archive, duplicate match
  strings, participant-safe payload isolation, and validation.
- Polished the glossary page layout so form controls use the full available
  width, entry headers protect long text, and action buttons wrap cleanly on
  narrow screens.
- Addressed screenshot feedback where edit-mode glossary fields were using
  browser-default styling instead of the Admin form controls.
- Prepared app release notes for `v0.1.4` so the Admin Software updates page
  includes the Phase 39 glossary foundation.
- Created `notes/claude_handoff_phase_39_glossary_admin.txt`.

## Important Decisions

### Canonical Term As Match String

Decision:
Persist the canonical term as the first `glossary_match_strings` row with
`is_canonical = true`.

Reason:
This lets one case-insensitive uniqueness rule cover canonical terms and
aliases together, avoiding ambiguous participant rendering in Phase 41.

Tradeoff:
The service layer must maintain the canonical match row when entries are
updated.

### Archive-On-Delete

Decision:
The DELETE endpoint archives glossary entries by setting `deleted_at` on the
entry and its match strings.

Reason:
The project already uses soft deletion for survey content, and archived match
strings should no longer block future active glossary entries.

Tradeoff:
Archived glossary rows remain in the database but are excluded from Admin list
and participant-safe reads.

## Architecture Notes

- Database/schema impact: adds global glossary tables independent from survey,
  question, answer, tag, attempt, report, and CSV tables.
- API contract impact: adds Admin glossary CRUD responses and participant-safe
  glossary response types.
- Auth or authorization impact: all new routes require authenticated Admin
  users through existing route middleware.
- Data privacy or visibility impact: participant-safe shape excludes source
  metadata and disabled entries; no participant routes consume it yet.
- Frontend UX impact: Admin tools now include a glossary management page.
- Environment or deployment impact: migration required; no new environment
  variables in Phase 39.

## Validation

Commands run:

```bash
npm run build -w packages/shared
npx tsc --noEmit -p apps/api/tsconfig.json
npx tsc --noEmit -p apps/web/tsconfig.json
npm run test -w apps/api -- glossary
npm run typecheck
npm run lint
npm run build
npm test
git diff --check
npm run db:migrate
curl -sS http://127.0.0.1:3000/api/health
npm run test -w apps/api -- glossary
npx tsc --noEmit -p apps/web/tsconfig.json
npm run lint -w apps/web
npm run build -w apps/web
npm run release:preview
npm run release:prepare
npm run release:check
npm run test:release
git diff --check
```

Results:

- Passed: all commands above.
- `npm run build` emitted the existing Vite large chunk warning.
- `npm test` required approved local PostgreSQL access for API tests.
- Local development migration applied `0035_global_glossary.sql`; API health
  returned `status: ok` and `database: connected`.
- Post-review UI polish passed targeted web typecheck, lint, and build; the
  build emitted the existing Vite large chunk warning.
- `npm run release:prepare` created `markdown/releases/v0.1.4.md`, bumped the
  root app version and lockfile to `0.1.4`, reset `unreleased.md`, and release
  validation passed.

Manual tests:

- Passed per developer manual testing on 2026-06-26. Post-review UI polish was
  checked by source-level responsive review and targeted web validation.

Phase closeout artifacts:

- Codex handoff created before final implementation summary: Yes
- Handoff path: `notes/claude_handoff_phase_39_glossary_admin.txt`
- Claude review status before commit: Completed

## Claude Review Notes

Source:

- `notes/claude_review_phase_39_glossary_admin.txt`

Status:

- Completed

Critical issues:

- None; Claude approved the phase with no blocking issues.

Suggested improvements:

- Reduce match-string row churn on updates if glossary scale grows.
- Improve cross-entry duplicate errors to name the conflicting match string.
- Remember that the Phase 39 participant-safe endpoint is Admin-gated; Phase 41
  will need an attempt-scoped or otherwise participant-appropriate route.
- Keep the 400 vs 409 duplicate distinction in mind for UI error handling.

Accepted fixes:

- Added an unauthenticated glossary request test covering the `401`
  `requireAuth` path.

Deferred findings:

- Match-string update churn and more specific duplicate-conflict messaging are
  deferred as non-blocking Admin UX/scale polish.

## Problems Encountered

- Problem: Targeted API/web typechecks initially saw the stale built shared
  package and could not find the new glossary exports.
  Resolution: Rebuilt `packages/shared`, then reran targeted API/web
  typechecks successfully.

## Follow-Up Tasks

- Phase 40: add dictionary-assisted Admin definition suggestions using the
  Phase 39 source metadata.
- Phase 41: expose enabled glossary entries to participant flows and render
  inline definitions accessibly.

## Commit Readiness

- Requirements implemented: Yes
- Codex handoff created: Yes
- Product context still aligned: Yes
- Architecture principles still aligned: Yes
- Security review complete: Yes; Claude found no blocking issues
- Review findings addressed or deferred: Yes
- Manual testing complete: Yes
- Ready to commit: Yes

---

## Phase 38 — Collapsible Question Editor Sections

Date:
2026-06-26

Status:
Implemented; Claude review complete; manual browser testing passed

Prompt:
`prompts/prompt_38.txt`

Git Commit:
Pending

Review Artifacts:
- Codex handoff: `notes/claude_handoff_phase_38.txt`
- Claude review: `notes/claude_review_phase_38.txt`

## Goals

- Reduce clutter in the admin Questions page.
- Keep each question parent identified by its locator, such as `P1-Q1`.
- Make heavier question tooling collapsible with useful section labels.

## Built

- Added `prompts/prompt_38.txt` as the implementation source of truth.
- Refactored `QuestionEditor` so the question parent header remains visible and
  question move controls stay at the parent level.
- Added local native collapsible sections for question details, template saving,
  text/integer answer tags, answer options or scale values, and Other tags.
- Defaulted Question details open and heavier sections collapsed.
- Added section counts for option/value/Other tag tooling.
- Cleaned up the Questions page Editing page selector so it stacks cleanly on
  narrow screens.
- Updated `markdown/releases/unreleased.md`.
- Promoted release notes into `markdown/releases/v0.1.3.md` and bumped the
  root app version to `0.1.3` during deploy prep.
- Created `notes/claude_handoff_phase_38.txt`.

## Important Decisions

### Local Disclosure State

Decision:
Use local React state around native `details` controls; do not persist section
open state.

Reason:
The feedback asked for focus and cleanup, not saved per-admin preferences.

Tradeoff:
Collapsed/open state resets when the question editor remounts.

## Architecture Notes

- Database/schema impact: none.
- API contract impact: none.
- Auth or authorization impact: none.
- Data privacy or visibility impact: none; hidden tags remain admin-only.
- Frontend UX impact: question tooling is grouped into collapsible sections.
- Environment or deployment impact: none.

## Validation

Commands run:

```bash
npx tsc --noEmit -p apps/web/tsconfig.json
npm run test -w apps/web -- src/components/admin/tagCatalogDrag.test.ts
npm run typecheck
npm run lint
npm run build
npm test
git diff --check
npx tsc --noEmit -p apps/api/tsconfig.json
npm run build -w apps/web
npm run release:preview
npm run release:prepare
npm run release:check
```

Results:

- Passed: all commands above.
- `npm run build` emitted the existing Vite large chunk warning.
- `npm test` required approved local PostgreSQL access for API tests.
- After Claude review, reran `npx tsc --noEmit -p apps/web/tsconfig.json`,
  `npx tsc --noEmit -p apps/api/tsconfig.json`, `npm run lint`, and
  `git diff --check`; all passed.
- After the small-screen Editing page selector follow-up, reran
  `npm run build -w apps/web` and `git diff --check`; both passed.
- During deploy prep, `npm run release:prepare` created
  `markdown/releases/v0.1.3.md`, bumped the root app version and lockfile to
  `0.1.3`, reset `markdown/releases/unreleased.md`, and `npm run release:check`
  passed.

Manual tests:

- Passed on 2026-06-26 per user manual browser testing.
- Covered the Questions page collapsible sections and small-screen Editing page
  selector follow-up.

Phase closeout artifacts:

- Codex handoff created before final implementation summary: Yes
- Handoff path: `notes/claude_handoff_phase_38.txt`
- Claude review status before commit: Completed

## Claude Review Notes

Source:

- `notes/claude_review_phase_38.txt`

Status:

- Completed

Critical issues:

- None

Suggested improvements:

- Claude suggested documenting controlled `details` behavior and noted minor
  count-label convention/manual narrow-width review items.

Accepted fixes:

- Added a short comment documenting the controlled native `details` state.

Deferred findings:

- Per-admin or lifted section-open state remains out of scope.
- Manual narrow-width browser testing passed on 2026-06-26.

## Problems Encountered

- Problem: Initial TypeScript pass caught a widened catalog section key while
  Phase 37/38 validation was running.
  Resolution: Narrowed the section array typing and rebuilt shared types before
  rerunning validation successfully.

## Follow-Up Tasks

- None.

## Commit Readiness

- Requirements implemented: Yes
- Codex handoff created: Yes
- Product context still aligned: Yes
- Architecture principles still aligned: Yes
- Security review complete: Yes; Claude found no critical issues
- Review findings addressed or deferred: Yes
- Manual testing complete: Yes
- Ready to commit: Yes

---

## Phase 37 — Admin Navigation And Tag Catalog Polish

Date:
2026-06-26

Status:
Implemented; Claude review complete; manual browser testing passed

Prompt:
`prompts/prompt_37.txt`

Git Commit:
Pending

Review Artifacts:
- Codex handoff: `notes/claude_handoff_phase_37.txt`
- Claude review: `notes/claude_review_phase_37.txt`

## Goals

- Make survey workspace tab overflow discoverable on narrow screens.
- Update visible tag catalog bucket wording from group to category.
- Let admins persist the order of the Ungrouped tag catalog section.

## Built

- Added `prompts/prompt_37.txt` as the implementation source of truth.
- Added `database/migrations/0034_tag_catalog_settings.sql`.
- Extended tag catalog responses with `ungroupedDisplayOrder`.
- Added admin-only `PUT /api/tags/sections/reorder`.
- Updated tag catalog drag logic so Ungrouped and custom categories reorder as
  catalog sections.
- Updated `/admin/tags` visible copy to use category language for higher-level
  catalog buckets while keeping internal group-shaped names.
- Made narrow survey workspace tabs show a horizontal scrollbar instead of
  hiding the scroll affordance.
- Added focused API tests and pure drag tests.
- Updated `markdown/releases/unreleased.md`.
- Promoted release notes into `markdown/releases/v0.1.3.md` and bumped the
  root app version to `0.1.3` during deploy prep.
- Created `notes/claude_handoff_phase_37.txt`.

## Important Decisions

### Persist Ungrouped As Settings

Decision:
Persist Ungrouped display order in a singleton `tag_catalog_settings` row.

Reason:
Ungrouped is a virtual bucket for tags with `group_id = null`, not a real
category row.

Tradeoff:
Section ordering combines one virtual section with real `tag_groups` rows.

### Category Copy Without Internal Rename

Decision:
Use category language in visible admin copy and API error strings, but keep
existing group-shaped route paths, DB tables, and shared type names.

Reason:
This satisfies the UX feedback without a broad compatibility-breaking rename.

Tradeoff:
Implementers still see `groupId` internally.

## Architecture Notes

- Database/schema impact: adds `tag_catalog_settings` singleton table.
- API contract impact: adds `PUT /api/tags/sections/reorder` and
  `ungroupedDisplayOrder` on tag catalog responses.
- Auth or authorization impact: new route is protected by existing
  admin-only tag router middleware.
- Data privacy or visibility impact: none; tag catalog remains admin-only and
  hidden tags remain excluded from participant payloads.
- Frontend UX impact: tag catalog section ordering and category wording change;
  mobile workspace tabs show scroll affordance.
- Environment or deployment impact: migration required.

## Validation

Commands run:

```bash
npx tsc --noEmit -p apps/web/tsconfig.json
npx tsc --noEmit -p apps/api/tsconfig.json
npm run test -w apps/web -- src/components/admin/tagCatalogDrag.test.ts
npm run test -w apps/api -- tagCatalog
npm run typecheck
npm run lint
npm run build
npm test
git diff --check
npm run release:preview
npm run release:prepare
npm run release:check
```

Results:

- Passed: all commands above.
- `npm run build` emitted the existing Vite large chunk warning.
- Focused and full API tests required approved local PostgreSQL access.
- After Claude review, reran `npx tsc --noEmit -p apps/web/tsconfig.json`,
  `npx tsc --noEmit -p apps/api/tsconfig.json`, `npm run lint`, and
  `git diff --check`; all passed.
- During deploy prep, `npm run release:prepare` created
  `markdown/releases/v0.1.3.md`, bumped the root app version and lockfile to
  `0.1.3`, reset `markdown/releases/unreleased.md`, and `npm run release:check`
  passed.

Manual tests:

- Passed on 2026-06-26 per user manual browser testing.
- Covered narrow survey workspace tabs and `/admin/tags` category/Ungrouped
  ordering behavior.

Phase closeout artifacts:

- Codex handoff created before final implementation summary: Yes
- Handoff path: `notes/claude_handoff_phase_37.txt`
- Claude review status before commit: Completed

## Claude Review Notes

Source:

- `notes/claude_review_phase_37.txt`

Status:

- Completed

Critical issues:

- None

Suggested improvements:

- Claude suggested removing an unused web helper and documenting deterministic
  section-order tie/gap behavior.

Accepted fixes:

- Removed the unused `reorderTagGroups` web API helper.
- Added comments for merged section-order display-order gaps and initial
  Ungrouped/category order ties.

Deferred findings:

- Manual browser testing passed on 2026-06-26.

## Problems Encountered

- Problem: The first API test attempt in the sandbox could not connect to local
  PostgreSQL.
  Resolution: Reran focused and full API tests with approved local PostgreSQL
  access; they passed.

## Follow-Up Tasks

- None.

## Commit Readiness

- Requirements implemented: Yes
- Codex handoff created: Yes
- Product context still aligned: Yes
- Architecture principles still aligned: Yes
- Security review complete: Yes; Claude found no critical issues
- Review findings addressed or deferred: Yes
- Manual testing complete: Yes
- Ready to commit: Yes

---

## Phase 36 — Published Survey Hidden Tag Maintenance

Date:
2026-06-26

Status:
Implemented; Claude review complete; manual testing passed

Prompt:
`prompts/prompt_36.txt`

Git Commit:
Pending

Review Artifacts:
- Codex handoff: `notes/claude_handoff_phase_36.txt`
- Claude review: `notes/claude_review_phase_36.txt`

## Goals

- Allow admins to maintain hidden tag metadata on published surveys.
- Keep questions, answer options, pages, rules, templates, and structural
  survey behavior locked once published.
- Keep retired surveys archival and locked.
- Ensure reporting, attempt detail, and CSV exports reflect current tag metadata
  for already answered questions without mutating participant answer rows.
- Preserve participant hidden-tag non-disclosure.

## Built

- Added `prompts/prompt_36.txt` as the implementation source of truth.
- Added a tag-specific backend lock guard that allows hidden-tag mutations on
  draft and published surveys while blocking deleted and retired surveys.
- Moved answer-option tag, Other tag, and value-tag routes from the structural
  draft-only guard to the new tag metadata guard.
- Added value-tag update support:
  - `PUT /api/surveys/:id/questions/:questionId/value-tags/:valueTagId`
  - matching web API helper
  - admin Questions UI edit forms for existing value tags
- Updated published-survey admin copy to clarify that structure remains locked
  while hidden tags can be maintained for reporting.
- Updated `markdown/releases/unreleased.md`.
- Created `notes/claude_handoff_phase_36.txt`.

## Important Decisions

### Metadata-Driven Propagation

Decision:
Do not store hidden-tag snapshots on participant answer rows.

Reason:
Existing reporting reads hidden tags from current survey metadata. Updating the
tag tables is enough for admin report/detail/CSV views to reflect corrected
metadata for already answered questions.

Tradeoff:
Historical reports intentionally change when admins correct hidden tags on a
published survey.

### Retired Surveys Stay Archival

Decision:
Hidden-tag edits are allowed on draft and published surveys only.

Reason:
Published surveys are operational and may need reporting taxonomy corrections;
retired surveys are treated as closed records.

## Architecture Notes

- Database/schema impact: none.
- API contract impact: added value-tag update route.
- Auth or authorization impact: all tag mutation routes remain admin-only.
- Data privacy or visibility impact: hidden tags remain excluded from
  participant and anonymous participant payloads.
- Frontend UX impact: structural controls remain locked on published surveys;
  hidden-tag controls are enabled for published surveys and disabled for
  retired surveys.
- Environment or deployment impact: no migration required.

## Validation

Commands run:

```bash
npm run typecheck
npm run lint
npm run build
npm test -w apps/api -- test/surveyBuilder.test.ts
npm test -w apps/api -- test/valueTags.test.ts
npm test -w apps/api -- test/reporting.test.ts
npm test
git diff --check
```

Results:

- Passed: `npm run typecheck`
- Passed: `npm run lint`
- Passed: `npm run build` (Vite emitted the existing large chunk warning)
- Passed with approved local PostgreSQL access:
  `npm test -w apps/api -- test/surveyBuilder.test.ts` (30 tests)
- Passed with approved local PostgreSQL access:
  `npm test -w apps/api -- test/valueTags.test.ts` (9 tests)
- Passed with approved local PostgreSQL access:
  `npm test -w apps/api -- test/reporting.test.ts` (20 tests)
- Passed with approved local PostgreSQL access: `npm test`
  - shared: 54 tests
  - web: 59 tests
  - API: 256 tests
  - release notes: 9 tests
- Passed: `git diff --check`

Notes:

- Initial focused API tests were attempted in parallel and failed because the
  suites share/reset the same local PostgreSQL test database. They were rerun
  sequentially and passed.

## Follow-Up Tasks

- Claude review completed and found no correctness bugs.
- Claude review minor nits were addressed by removing dead value-tag CSS and
  restoring the published-survey banner note that title, description, and
  category stay editable.
- Manual testing completed on 2026-06-26. Admin updates to hidden tag values on
  published surveys propagated through reporting/admin views for users who had
  already completed and submitted a survey, and for in-progress users who had
  already selected an answer and moved to the next question.
- Retired surveys remain intentionally non-editable; previously answered
  retired survey questions do not receive hidden-tag corrections through this
  maintenance workflow.

## Commit Readiness

- Requirements implemented: Yes
- Claude handoff created: Yes
- Product context still aligned: Yes
- Architecture principles still aligned: Yes
- Security review complete: Yes; Claude found no correctness bugs and automated
  non-disclosure coverage remains in the full test suite
- Review findings addressed or deferred: Yes
- Manual testing complete: Yes
- Ready to commit: Yes

---

## Phase 33 — Admin Release Notes And Version Tracking

Date:
2026-06-25

Status:
Complete; ready for Claude review

Prompt:
`prompts/prompt_33.txt`

Git Commit:
Pending

Review Artifacts:
- Codex handoff: `notes/claude_handoff_phase_33.txt`
- Claude review: `notes/claude_review_phase_33.txt`

## Goals

- Add an admin-only software version and patch-notes section.
- Keep release notes as committed, reviewable Markdown under `markdown/`.
- Validate release notes before production deploys through `npm run deploy` and
  the GitHub Actions `main` workflow.
- Update durable phase/process scaffolding so future production-bound work
  creates release notes through the established workflow.

## Built

- Created `prompts/prompt_33.txt` as the implementation source of truth.
- Added `markdown/RELEASE_NOTES.md` and release files:
  - `markdown/releases/v0.1.0.md`
  - `markdown/releases/v0.1.1.md`
  - `markdown/releases/unreleased.md`
- Bumped the root app version from `0.1.0` to `0.1.1`.
- Added root scripts:
  - `release:draft`
  - `release:notes`
  - `release:prepare`
  - `release:check`
  - `test:release`
- Added strict release-note parsing and response building in the API.
- Added `GET /api/admin/releases`, protected by existing `requireAuth` and
  `requireRole("admin")` middleware.
- Added shared release-note response types.
- Added `/admin/releases` as a read-only admin page and linked it from Admin
  tools.
- Tightened release-note parsing so blank bullet items are rejected consistently
  by the CLI validator and admin API parser.
- Added a draft-to-release workflow: agents maintain
  `markdown/releases/unreleased.md`, and `npm run release:prepare` promotes the
  draft into the next versioned release note while bumping the root app version.
- Updated `scripts/deploy.mjs` so production pushes validate release notes
  before `git push origin main`.
- Updated `.github/workflows/main_njsda-wa.yml` so direct `main` pushes validate
  release notes before Azure deploy.
- Updated README, `markdown/FLOW.md`, and `markdown/REVIEW_CHECKLIST.md`.
- Created `notes/claude_handoff_phase_33.txt`.

## Important Decisions

### Root App Version Is The Release Version

Decision:
Use the root `package.json` `version` as the deployed app version shown in the
admin UI and validated by release scripts.

Reason:
The repository is deployed as one app from the root workflow, while workspace
package versions represent package contracts and do not need to change for
every product release.

Tradeoff:
The root version can differ from workspace package versions.

### Committed Markdown Over In-App Editing

Decision:
Release notes are edited in the repo and displayed read-only to admins.

Reason:
This keeps production release history reviewable, diffable, and coupled to the
same commit that deploys the app.

Tradeoff:
Admins cannot patch release-note copy from the app after deployment.

### Draft Notes Before Versioned Releases

Decision:
Keep agent-maintained draft notes in `markdown/releases/unreleased.md`, then use
`npm run release:prepare` to promote the draft into a versioned release file.

Reason:
This makes routine coding sessions easy to document incrementally without
publishing draft notes in the admin UI.

Tradeoff:
The final release still needs a human-quality title, summary, and bullet review
before the prepare command will publish it.

### CI Enforces Direct Main Pushes

Decision:
`npm run deploy` validates release notes before pushing, and GitHub Actions
validates direct `main` pushes before Azure deploy.

Reason:
Raw `git push origin main` cannot be reliably intercepted on every developer
machine with committed source alone.

Tradeoff:
Release-note freshness is enforced at CI/deploy time, not by universal local git
hooks.

## Architecture Notes

- Database/schema impact: None.
- API contract impact: added admin-only `GET /api/admin/releases`.
- Auth or authorization impact: endpoint is protected by existing admin
  middleware.
- Data privacy or visibility impact: release notes are visible only to admins
  in-app; committed Markdown remains repository-visible.
- Frontend UX impact: added read-only Software updates admin page.
- Environment or deployment impact: deploy script and GitHub Actions now run
  release-note validation.

## Validation

Commands run:

```bash
npm run release:check
npm run typecheck
npm run test:release
npm test -w apps/api -- releaseNotes
npm run lint
npm run build
npm test
git diff --check
npm run release:check -- --since origin/main
```

Results:

- Passed: `npm run release:check`.
- Passed: `npm run typecheck`.
- Passed: `npm run test:release`
  - 3 tests.
- Passed with approved local PostgreSQL access:
  `npm test -w apps/api -- releaseNotes`
  - 1 file, 4 tests.
- Passed: `npm run lint`.
- Passed: `npm run build`.
  - Vite emitted the existing large chunk warning.
- Passed with approved local PostgreSQL access: `npm test`.
  - Shared tests: 4 files, 54 tests.
  - Web tests: 6 files, 59 tests.
  - API tests: 24 files, 238 tests.
  - Release script tests: 3 tests.
- Passed: `git diff --check`.
- Not expected to pass before commit:
  `npm run release:check -- --since origin/main`.
  - Failed because the check compares committed `HEAD` against `origin/main`;
    Phase 33 changes are still uncommitted, so the push diff does not yet show
    `package.json`.
- Additional parser-hardening validation passed:
  - `npm run release:check`
  - `npm run test:release`
  - `npm run typecheck`
  - `npm test -w apps/api -- releaseNotes` with approved local PostgreSQL access
  - `npm run lint`
  - `npm run build`
  - `git diff --check`
- Release draft automation checks passed:
  - `node scripts/release-notes.mjs draft` reported the draft already exists
  - `node scripts/release-notes.mjs prepare --version patch` rejected placeholder
    draft text before making changes

Manual tests:

- Browser manual test not run; route/page wiring was covered by typecheck and
  production build.

Phase closeout artifacts:

- Codex handoff created before final implementation summary: Yes
- Handoff path: `notes/claude_handoff_phase_33.txt`
- Claude review status before commit: Pending

## Claude Review Notes

Source:

- `notes/claude_review_phase_33.txt`

Status:

- Pending.

Critical issues:

- Pending review.

Suggested improvements:

- Pending review.

Accepted fixes:

- Pending review.

Deferred findings:

- Pending review.

## Problems Encountered

- Problem: Sandboxed API test run could not connect to local PostgreSQL
  (`EPERM 127.0.0.1:5432`).
  Resolution: reran the targeted API test and full `npm test` with approved
  local PostgreSQL access.
- Problem: Deploy-style release freshness check failed before commit.
  Resolution: Documented as expected because that check compares committed
  `HEAD` to `origin/main`; `npm run deploy` requires a clean committed tree
  before running this mode.

## Follow-Up Tasks

- Run Claude review using `notes/claude_handoff_phase_33.txt`.
- Browser-check `/admin/releases` with an admin account before production
  deployment.

## Commit Readiness

- Requirements implemented: Yes
- Codex handoff created: Yes
- Product context still aligned: Yes
- Architecture principles still aligned: Yes
- Security review complete: Pending Claude review
- Review findings addressed or deferred: Pending Claude review
- Manual testing complete: Browser check pending
- Ready to commit: Pending Claude review and browser check

## Security Hardening Pass — Public Pilot Baseline

Date:
2026-06-24

Status:
Complete; ready to commit

Prompt:
Direct user request; review brief tracked in `notes/security_pass.txt`

Git Commit:
Pending

Review Artifacts:
- Codex handoff: `notes/claude_handoff_security_pass.txt`
- Claude review: `notes/claude_review_security_pass.txt`

## Goals

- Harden the existing React/Vite, Express, PostgreSQL, and cookie/JWT app
  before broader public use.
- Keep the current app-auth model while adding explicit browser CSRF and origin
  protection.
- Separate public anonymous survey routes from authenticated shell behavior.
- Improve session invalidation, rate limiting, request-log redaction, CI
  supply-chain checks, and Azure security checklist coverage.

## Built

- Added centralized Express security headers, including CSP, production HSTS,
  frame protection, MIME sniff protection, referrer policy, permissions policy,
  and cross-origin opener policy.
- Added browser-origin validation and CSRF token issuance/validation for unsafe
  browser requests, while keeping bearer-token public anonymous survey endpoints
  CSRF-exempt.
- Adjusted development origin validation so `localhost` and `127.0.0.1` with
  the same protocol/port are accepted as equivalent loopback origins, while
  production origin matching remains exact.
- Added a production-origin policy test proving production accepts only the
  exact configured `WEB_ORIGIN` and rejects host aliases.
- Moved auth, registration, and password-reset limiters onto the shared
  PostgreSQL-backed rate-limit store and added email/account-aware limiter keys.
- Added `users.session_version`, embedded it in auth JWTs, and invalidated stale
  cookies after password resets and admin role changes.
- Expanded request URL redaction for token, secret, password, reset, attempt,
  and email-like query parameters.
- Split `/anonymous-surveys` and `/anonymous-surveys/:token` outside
  `AuthProvider` so public anonymous pages no longer call `/api/auth/me` or
  render authenticated account/admin navigation.
- Removed the inline theme script from `apps/web/index.html` so `script-src
  'self'` is feasible; initial theme selection now runs from bundled module
  code.
- Added CI supply-chain checks: `npm audit --omit=dev --audit-level=high`,
  gitleaks secret scan, and Dependabot for npm/GitHub Actions.
- Added focused security tests for headers, CSRF, origin rejection, password
  reset session invalidation, and role-change session invalidation.
- Addressed Claude's blocking CSRF client-cache finding by clearing cached CSRF
  state on logout, retrying once on CSRF rejection after refetch, and adding a
  web regression test for logout-to-login without page reload.
- Addressed two low-risk Claude suggestions: successful logins no longer count
  against the email-keyed login limiter, and logger fallback redaction now
  covers reset/attempt query keys.
- Created `notes/security_pass.txt` as the Azure checklist and implementation
  summary for Claude review and deployment follow-up.

## Important Decisions

### Browser-Oriented CSRF Enforcement

Decision:
Unsafe requests with browser `Origin` or `Referer` headers must match
`WEB_ORIGIN`; non-anonymous browser unsafe requests also require a valid CSRF
token.

Reason:
The app uses same-site httpOnly cookies, so browser-originated unsafe requests
need explicit CSRF protection without breaking server-side test automation and
non-browser operational calls that do not send browser origin headers.

Tradeoff:
This is not a universal API key/auth replacement for non-browser clients; it is
targeted protection for the browser cookie threat model.

### Anonymous Public Endpoints Remain CSRF-Exempt

Decision:
`/api/anonymous-surveys/:token/*` remains CSRF-exempt.

Reason:
Those endpoints rely on anonymous link bearer tokens plus per-attempt access
tokens and do not authorize via the auth cookie.

Tradeoff:
Claude should re-review whether this remains acceptable for public pilot, but
adding CSRF to those endpoints would complicate unauthenticated token-link
flows.

### Session Versioning Over Session Registry

Decision:
Use a per-user `session_version` integer in JWTs rather than introducing a
server-side per-device session table.

Reason:
This gives immediate invalidation after sensitive account changes while staying
small and aligned with the existing stateless JWT model.

Tradeoff:
Invalidation is coarse-grained per user; all existing cookies for that user are
retired together after a password reset or role change.

## Architecture Notes

- Database/schema impact: migration `0031_user_session_version.sql` adds
  `users.session_version integer not null default 0` with a nonnegative check.
- API contract impact: new `GET /api/auth/csrf` endpoint returns `{ csrfToken }`.
- Auth or authorization impact: auth JWTs now include `sessionVersion`; stale
  session-version cookies return 401. Admin role changes and password resets
  bump the version.
- Data privacy or visibility impact: request URL logging redacts additional
  sensitive query-like values; public anonymous frontend shell avoids
  authenticated account state.
- Frontend UX impact: public anonymous pages use a minimal public header instead
  of authenticated navigation; normal authenticated app routes are unchanged.
- Environment or deployment impact: Azure checklist updated in
  `notes/security_pass.txt`; CI now includes audit, gitleaks, and Dependabot.

## Validation

Commands run:

```bash
npm run typecheck -w apps/api
npm run typecheck -w apps/web
npm run lint -w apps/api
npm run lint -w apps/web
npm test -w apps/api -- test/auth.test.ts test/security.test.ts test/adminUsers.test.ts
npm test -w apps/web
npm test
npm run build
npm audit --omit=dev --audit-level=high
npm test -w apps/web -- src/api/client.test.ts
npm run typecheck -w apps/web
npm run lint -w apps/web
npm run typecheck -w apps/api
npm run lint -w apps/api
npm test -w apps/api -- test/security.test.ts
```

Results:

- Passed: API typecheck.
- Passed: Web typecheck.
- Passed: API lint.
- Passed: Web lint.
- Passed with approved local PostgreSQL access:
  `npm test -w apps/api -- test/auth.test.ts test/security.test.ts test/adminUsers.test.ts`
  - 3 files, 39 tests.
- Passed: `npm test -w apps/web`
  - 5 files, 57 tests.
- Passed with approved local PostgreSQL access: `npm test`
  - Shared tests: 4 files, 54 tests.
  - Web tests: 5 files, 57 tests.
  - API tests: 23 files, 232 tests.
- Passed: `npm run build`.
  - Vite emitted the existing large chunk warning.
- Passed with network access: `npm audit --omit=dev --audit-level=high`.
  - Found 0 vulnerabilities.
- Passed after Claude review fixes:
  - `npm test -w apps/web -- src/api/client.test.ts`
    - 1 file, 2 tests.
  - `npm run typecheck -w apps/web`
  - `npm run lint -w apps/web`
  - `npm run typecheck -w apps/api`
  - `npm run lint -w apps/api`
  - `npm test -w apps/api -- test/auth.test.ts test/security.test.ts test/adminUsers.test.ts`
    - 3 files, 39 tests.
- Passed after loopback-origin fix:
  - `npm run typecheck -w apps/api`
  - `npm run lint -w apps/api`
  - `npm test -w apps/api -- test/security.test.ts`
    - 1 file, 5 tests.

Manual tests:

- Completed by the human tester and passed:
  - Login/register/logout CSRF flow.
  - Password reset completion and stale-session rejection.
  - Admin role change stale-session rejection and re-login.
  - Anonymous directory and direct token runner without `/api/auth/me`.
  - Anonymous start/answer/complete/register flows.
  - Public and authenticated responsive layouts at 375/768/1280px.

Phase closeout artifacts:

- Codex handoff created before final implementation summary: Yes
- Handoff path: `notes/claude_handoff_security_pass.txt`
- Claude review status before commit: Completed; blocking finding addressed

## Claude Review Notes

Source:

- `notes/claude_review_security_pass.txt`

Status:

- Completed. Claude found one blocking client-side regression and several
  non-blocking suggestions.

Critical issues:

- C1: Logout cleared the server CSRF cookie but the web API client kept the old
  token in module memory, causing the next login without page reload to fail
  with 403. Addressed by clearing the cached CSRF token after logout, refetching
  and retrying once on CSRF rejection, and adding
  `apps/web/src/api/client.test.ts`.

Suggested improvements:

- S1: Email-keyed login limiter could count successful logins and create
  self-lockout/targeted lockout friction. Addressed with
  `skipSuccessfulRequests: true` on the email-keyed login limiter.
- S2: `anonymous_rate_limits` table name is now misleading because auth limits
  also use it. Deferred as a future neutral table-name migration/comment.
- S3: Request logger fallback redaction omitted `reset` and `attempt`.
  Addressed.
- S4: CSRF HMAC currently reuses `JWT_SECRET`. Deferred as a future optional
  key-separation env/config pass.

Accepted fixes:

- C1 fixed.
- S1 fixed.
- S3 fixed.

Deferred findings:

- S2 deferred: rename/comment rate-limit storage when a small migration is
  convenient.
- S4 deferred: add a dedicated CSRF signing secret if/when stronger key
  separation is required.

## Problems Encountered

- Problem: Initial sandboxed API test run could not connect to local
  PostgreSQL (`EPERM 127.0.0.1:5432`).
  Resolution: reran API/full tests with approved local PostgreSQL access.

## Follow-Up Tasks

- Verify the first GitHub Actions run with gitleaks after push.
- Apply/review the Azure checklist from `notes/security_pass.txt` before
  public pilot deployment.

## Commit Readiness

- Requirements implemented: Yes
- Codex handoff created: Yes
- Product context still aligned: Yes
- Architecture principles still aligned: Yes
- Security review complete: Yes; Claude review completed
- Review findings addressed or deferred: Yes
- Manual testing complete: Yes
- Ready to commit: Yes

---

## Phase 32 — Anonymous Completion Account Conversion

Date:
2026-06-24

Status:
Complete; ready to commit

Prompt:
`prompts/prompt_32.txt`

Git Commit:
Ready to commit

Review Artifacts:
- Codex handoff: `notes/claude_handoff_phase_32.txt`
- Claude review: `notes/claude_review_phase_32.txt`

## Goals

- Offer account creation after anonymous survey completion before optional
  follow-up email capture.
- Convert a completed anonymous attempt into a newly registered user's attempt
  without copying responses.
- Preserve saved answers and completion timestamps while clearing anonymous-only
  owner/contact fields.
- Keep decline-registration behavior on the existing optional anonymous
  follow-up email path.
- Ensure dashboard/history, Admin Results, and CSV treat converted attempts as
  registered-user attempts.

## Built

- Added shared response contract `ConvertAnonymousSurveyAttemptResponse`.
- Moved backend registration body validation into the shared API validation
  service so normal registration and anonymous conversion use the same field,
  email, and password validation.
- Added public anonymous endpoint
  `POST /api/anonymous-surveys/:token/register`.
  - Requires the anonymous link token, attempt id, and per-attempt access token.
  - Revalidates enabled/unexpired/published/non-deleted anonymous link state.
  - Uses an auth-registration-grade rate limiter backed by the shared
    PostgreSQL rate-limit store.
  - Locks the anonymous attempt row, requires `status = 'completed'`, creates
    the new user, reassigns the same attempt to `user_id`, clears
    `anonymous_link_id`, `anonymous_access_token_hash`, and
    `anonymous_contact_email`, and sets the standard auth cookie.
  - Rebuilds the converted attempt response inside the transaction before
    commit, avoiding a post-commit detail read failure path.
- Updated the anonymous completion UI to show an inline account-creation panel
  after completion.
- Updated the decline path so "Continue anonymously" opens the existing
  optional follow-up email modal.
- Navigates successful converted participants to `/dashboard` with the auth
  context updated from the conversion response.
- Expanded anonymous survey API tests for conversion ownership, duplicate and
  invalid registration safety, token/attempt/status/link availability failures,
  dashboard visibility, Admin Results representation, and CSV participant
  status.
- Addressed both non-blocking Claude review suggestions: added the stricter
  conversion registration limiter and moved converted-attempt response assembly
  before commit.

## Important Decisions

### Conversion Mutates The Attempt

Decision:
Successful anonymous completion registration reassigns the existing completed
attempt row instead of copying responses into a new registered attempt.

Reason:
This preserves response ids, completion timestamps, activity relationships, and
reporting continuity while satisfying the owner XOR constraint already present
on `survey_attempts`.

### Existing-Account Claim Remains Future Scope

Decision:
Duplicate-email registration fails with the existing 409 behavior and does not
convert the attempt.

Reason:
Claiming or merging into an existing account has different auth and ownership
risks and is explicitly out of scope for Phase 32.

## Architecture Notes

- Database/schema impact: no migration required; existing owner/contact checks
  already support conversion when anonymous fields are cleared.
- API contract impact: new anonymous conversion response and endpoint.
- Auth or authorization impact: successful conversion sets the same httpOnly
  auth cookie as normal registration. Failed conversion attempts do not create a
  user or mutate ownership.
- Data privacy or visibility impact: converted attempts no longer retain
  anonymous contact email or anonymous access-token hash. Participant responses
  continue to use participant-safe survey shapes with hidden tags omitted.
- Frontend UX impact: anonymous completion now offers account creation first,
  then optional follow-up email only when the participant declines registration.
- Environment or deployment impact: none beyond deploying updated API/web code.

## Validation

Commands run:

```bash
npm run test -w apps/api -- test/anonymousSurvey.test.ts
npm run typecheck
npm run lint
npm run build
npm test
git diff --check
```

Results:

- Passed with approved local PostgreSQL access:
  `npm run test -w apps/api -- test/anonymousSurvey.test.ts` (8 tests)
- Passed: `npm run typecheck`
- Passed: `npm run lint`
- Passed: `npm run build`
  - Vite emitted the existing large chunk warning.
- Passed with approved local PostgreSQL access: `npm test`
  - Shared tests: 4 files, 54 tests
  - Web tests: 5 files, 57 tests
  - API tests: 22 files, 228 tests
- Passed: `git diff --check`

Manual tests:

- Completed by the human tester and passed:
  - Anonymous participant completes a survey and sees the account-creation
    panel after completion.
  - New-account registration converts the completed attempt, redirects to
    `/dashboard`, and shows the survey in the registered user's history.
  - "Continue anonymously" preserves the optional follow-up email fallback.
  - Completion panel and email modal passed responsive/manual checks.

## Follow-Up Tasks

- None for this phase.

## Claude Review Notes

Source:

- `notes/claude_review_phase_32.txt`

Status:

- Completed. Claude found no blocking issues and recommended commit after the
  pending manual browser pass.

Findings and disposition:

- Non-blocking recommendation: add a registration-grade limiter to the
  conversion endpoint. Addressed with a dedicated limiter using
  `AUTH_RATE_LIMIT_WINDOW_MS` and `AUTH_REGISTER_RATE_LIMIT_MAX`.
- Non-blocking recommendation: harden the post-commit detail/cookie step.
  Addressed by fetching the converted attempt with responses through the
  transaction client before commit, then returning that already-built response
  after commit.

## Commit Readiness

- Requirements implemented: Yes
- Claude handoff created: Yes
- Product context still aligned: Yes
- Architecture principles still aligned: Yes
- Security review complete: Yes; Claude found no blocking issues
- Review findings addressed or deferred: Yes; both non-blocking findings were
  addressed
- Manual testing complete: Yes
- Ready to commit: Yes

---

## Phase 31 — Public Anonymous Survey Directory

Date:
2026-06-24

Status:
Complete; ready to commit

Prompt:
`prompts/prompt_31.txt`

Git Commit:
Ready to commit

Review Artifacts:
- Codex handoff: `notes/claude_handoff_phase_31.txt`
- Claude review: `notes/claude_review_phase_31.txt`

## Goals

- Add a public anonymous survey directory separate from authenticated dashboard
  routes.
- Keep anonymous token links secret/unlisted unless an Admin explicitly opts in
  the individual link.
- Return only enabled, unexpired, listed links for published, non-deleted
  surveys.
- Keep hidden tags, Admin metadata, token hashes, attempt access tokens, and
  profile contact fields out of the directory payload.

## Built

- Added migration `0030_anonymous_public_directory.sql` with
  `anonymous_survey_links.listed_in_public_directory boolean not null default
  false` and a partial listing index.
- Extended anonymous-link shared/API types with `listedInPublicDirectory`.
- Added Admin-only `PATCH /api/surveys/:id/anonymous-links/:linkId/public-directory`
  to opt a link into or out of the public directory.
- Cleared the directory flag when a link is disabled or rotated out.
- Added public `GET /api/anonymous-survey-directory`, returning only
  participant-safe directory cards with survey title, description, category,
  expiration, listing timestamp, and public runner URL.
- Added public `/anonymous-surveys` web route outside `ProtectedRoute`, plus a
  directory list UI that links to existing `/anonymous-surveys/:token` runner
  URLs.
- Replaced the homepage's three informational cards with a prominent public
  anonymous-surveys callout card linking to `/anonymous-surveys`.
- Added a per-link Admin Setup checkbox for directory listing opt-in.
- Expanded anonymous survey API tests for default-off behavior, Admin-only
  toggle, unauthenticated directory reads, eligibility filtering, safe payload
  shape, and unchanged direct unlisted-token access.

## Important Decisions

### Listing Belongs To The Link

Decision:
Store directory opt-in on `anonymous_survey_links`, not `surveys`.

Reason:
The same survey may have multiple anonymous links with different sharing
purposes. Listing one link publicly should not make every tokenized link
discoverable.

### Directory Payload Is Narrower Than Runner Payload

Decision:
The directory returns only listing summary fields and a public URL, not the full
participant survey structure.

Reason:
The runner endpoint already returns participant-safe survey structure after a
visitor opens a specific token. The directory should not broaden exposure of
questions, options, hidden tags, token internals, or profile/contact metadata.

## Architecture Notes

- Database/schema impact: additive migration `0030`.
- API contract impact: new public directory response and Admin link-listing
  mutation.
- Auth or authorization impact: Admin toggle requires `requireAuth` and
  `requireRole("admin")`; public directory read is intentionally unauthenticated.
- Data privacy or visibility impact: directory filters by explicit opt-in,
  enabled/unexpired link, published survey, and non-deleted survey. Hidden tags,
  Admin-only metadata, token hashes, attempt access tokens, and Phase 30 profile
  contact fields are not returned.
- Frontend UX impact: public `/anonymous-surveys` page stays outside dashboard
  navigation; Admin Setup controls directory listing per anonymous link.
- Environment or deployment impact: run migration `0030` before using the public
  directory toggle.

## Validation

Commands run:

```bash
npm run typecheck
npm run test -w apps/api -- test/anonymousSurvey.test.ts
npm run lint
npm run build
npm test
git diff --check
npm run typecheck
npm run lint
npm run build
git diff --check
```

Results:

- Passed: `npm run typecheck`
- Passed with approved local PostgreSQL access:
  `npm run test -w apps/api -- test/anonymousSurvey.test.ts` (5 tests)
- Passed: `npm run lint`
- Passed: `npm run build`
  - Vite emitted the existing large chunk warning.
- Passed with approved local PostgreSQL access: `npm test`
  - Shared tests: 4 files, 54 tests
  - Web tests: 5 files, 57 tests
  - API tests: 22 files, 225 tests
- Passed: `git diff --check`
- Passed after post-review homepage callout update: `npm run typecheck`
- Passed after post-review homepage callout update: `npm run lint`
- Passed after post-review homepage callout update: `npm run build`
  - Vite emitted the existing large chunk warning.
- Passed after post-review homepage callout update: `git diff --check`
- Passed after Setup switch cleanup: `npm run typecheck`
- Passed after Setup switch cleanup: `npm run lint`
- Passed after Setup switch cleanup: `npm run build`
  - Vite emitted the existing large chunk warning.
- Passed after Setup switch cleanup: `git diff --check`

Manual tests:

- Completed by the human tester and passed:
  - Admin creates an anonymous link and confirms it is unlisted by default.
  - Admin opts a link into the public directory and sees it on
    `/anonymous-surveys`.
  - Participant can start the listed survey from the directory.
  - Opting out, disabling, or expiring the link removes it from the directory.
  - Homepage anonymous-surveys callout and directory layouts hold at
    375 / 768 / 1280px.

## Follow-Up Tasks

- Optional hardening from Claude review: rate-limit
  `GET /api/anonymous-survey-directory`.
- Addressed optional UI polish from Claude review: the Admin Setup directory
  control now uses a compact switch and is disabled when a link is not enabled.

## Claude Review Notes

Source:

- `notes/claude_review_phase_31.txt`

Status:

- Completed. Claude found no blocking issues and requested no required code
  changes.

Findings and disposition:

- Public listing default-off behavior, restrictive eligibility filtering,
  participant-safe payload fields, token/logging handling, route segregation,
  hidden-tag/Admin metadata isolation, and unlisted direct-token stability were
  reviewed as sound.
- Non-blocking recommendation: add rate limiting to
  `GET /api/anonymous-survey-directory`. Accepted as optional hardening and
  tracked above.
- Non-blocking recommendation: disable the Setup directory checkbox for disabled
  links. Addressed after screenshot review by replacing the oversized native
  checkbox with a compact switch and disabling it for disabled/unrevealable
  links.
- Minor index note: the partial index includes `listed_in_public_directory` even
  though the partial predicate pins it to true. Accepted as harmless and not
  worth migration churn on its own.

## Commit Readiness

- Requirements implemented: Yes
- Claude handoff created: Yes
- Product context still aligned: Yes
- Architecture principles still aligned: Yes
- Security review complete: Yes; Claude found no blocking issues
- Review findings addressed or deferred: Yes; optional findings tracked above
- Manual testing complete: Yes
- Ready to commit: Yes

---

## Phase 30 — User Profile Demographics Cleanup

Date:
2026-06-24

Status:
Implemented; pending manual browser pass

Prompt:
`prompts/prompt_30.txt`

Git Commit:
Ready to commit

Review Artifacts:
- Codex handoff: `notes/claude_handoff_phase_30.txt`
- Claude review: `notes/claude_review_phase_30.txt`
- Phone follow-up handoff: `notes/claude_handoff_phase_30_phone_followup.txt`
- Phone follow-up review: `notes/claude_review_phase_30_phone_followup.txt`
- Structured address follow-up handoff:
  `notes/claude_handoff_phase_30_address_followup.txt`
- Structured address follow-up review:
  `notes/claude_review_phase_30_address_followup.txt`

## Goals

- Let users update first name, last name, street address, city, state, and
  phone number from Settings.
- Keep profile APIs current-user-only.
- Keep admin user detail read-only while showing structured address fields and
  phone when present.
- Preserve survey stats and Settings password-reset behavior.
- Treat preferred contact method and contact notes as legacy metadata that is
  no longer visible/editable.

## Built

- Added migration `0029_user_profile_address.sql` with optional
  `user_profiles.address_street`, `user_profiles.address_city`, and
  `user_profiles.address_state` columns plus per-field length checks.
- Updated shared profile responses so active profile metadata is now
  `contactNumber` plus `addressStreet`, `addressCity`, and `addressState`;
  the `PUT /api/profile` response now returns the updated auth user and
  profile.
- Extended the current-user profile update service to validate and persist
  first name, last name, structured address fields, and phone number in one
  transaction.
- Preserved partial-merge semantics for profile fields and normalized blank
  optional profile values to `null`.
- Kept `/api/profile` self-service only; no id-param or admin branch was added.
- Updated Settings so users can edit first name, last name, street address,
  city, state, and "Phone number", while survey stats and password reset
  remain in place.
- Updated the auth context so Settings can refresh the client-side current user
  immediately after a successful profile save.
- Updated admin user detail to display read-only structured address fields and
  phone number only, hiding legacy preferred-contact-method and contact-notes
  metadata.
- Expanded profile/admin API tests for name updates, address/phone persistence,
  unauthenticated rejection, guessed-id rejection, validation/null
  normalization, legacy field non-exposure, admin read-only data, and survey
  stats staying unchanged by profile edits.
- Added a post-review structured phone-number follow-up:
  - Settings now uses `react-phone-number-input` with a country selector and
    `US` default country.
  - API validation uses `libphonenumber-js` possible-number checks and stores
    accepted phone numbers in normalized E.164 format.
  - Blank phone input still normalizes to `null`.
  - Focused tests now cover valid US normalization, valid non-US normalization,
    invalid nonblank rejection, and blank-to-null behavior.
- Added a post-review structured address follow-up:
  - Replaced the single `address` API/shared field with `addressStreet`,
    `addressCity`, and `addressState`.
  - Replaced the single Settings address input with separate Street address,
    City, and State inputs.
  - Updated Admin user detail to show each structured address field read-only.
  - Focused tests now cover per-field trimming/null normalization, validation
    bounds, partial-update preservation, and admin read-only display.
- Fixed local development seed compatibility with Phase 29 tag ordering by
  assigning stable `tag_definitions.display_order` values in seeded catalog
  inserts.

## Important Decisions

### Legacy Contact Metadata Remains Stored

Decision:
Keep existing `preferred_contact_method` and `contact_notes` columns/data but
remove them from cleaned-up API response types and UI surfaces.

Reason:
The prompt explicitly asks to preserve existing columns/data unless removal is
separately scoped.

Tradeoff:
The database contains legacy profile metadata that is not currently visible.
Cleanup is tracked in `markdown/FOLLOW_UPS.md`.

### Phone Number Keeps Existing Internal Field

Decision:
Keep `contactNumber` / `contact_number` internally and present it as
"Phone number" in user/admin-facing copy.

Reason:
This keeps the change smaller and matches the prompt's implementation
assumption.

### Phone Numbers Store As E.164

Decision:
Use a structured phone input in Settings and normalize any nonblank phone value
to E.164 before persistence.

Reason:
The field remains optional, but when a user provides a number the app should
capture country/region context and store a stable canonical value.

Tradeoff:
Previously accepted free-form phone strings now fail validation unless they can
be parsed as a possible international phone number. This is accepted before
Phase 30 ships because no migration/backfill is required.

### Address Uses Structured Fields

Decision:
Store address as `address_street`, `address_city`, and `address_state`, exposed
as `addressStreet`, `addressCity`, and `addressState`.

Reason:
The single free-text address field was superseded by the follow-up request to
split the Settings address section into proper street/city/state inputs.

Tradeoff:
This keeps address capture simple and explicit, but still does not include
postal code, country, autocomplete, geocoding, or postal validation.

## Architecture Notes

- Database/schema impact: additive migration `0029_user_profile_address.sql`.
- API contract impact: `UserProfile` now exposes active metadata only:
  `contactNumber`, `addressStreet`, `addressCity`, `addressState`,
  timestamps. `UpdateCurrentUserProfileResponse` includes the updated
  `AuthUser`.
- Auth or authorization impact: profile routes still use `requireAuth` and the
  authenticated user id from middleware; no `/api/profile/:id` behavior added.
- Data privacy or visibility impact: admin detail remains read-only and no
  longer exposes legacy contact method/notes.
- Frontend UX impact: Settings now edits account name plus structured
  address/phone fields and refreshes account-menu identity immediately after
  save. Phone entry uses a country-aware input with upfront formatting.
- Environment or deployment impact: run migration `0029` before using
  structured address fields.
- Dependency impact: `react-phone-number-input` in the web workspace and
  `libphonenumber-js` in the API workspace.

## Validation

Commands run:

```bash
npm run typecheck
npm run test -w apps/api -- profile.test.ts adminUsers.test.ts
npm run lint
npm run build
npm test
npm run db:reset && npm run db:migrate
git diff --check
```

Results:

- Passed: `npm run typecheck`
- Initial sandboxed focused API test attempt was blocked by PostgreSQL access
  to `127.0.0.1:5432`.
- Passed with approved local PostgreSQL access:
  `npm run test -w apps/api -- profile.test.ts adminUsers.test.ts` (20 tests
  after the structured-address follow-up)
- Passed: `npm run lint`
- Passed: `npm run build`
  - Vite emitted the existing large chunk warning.
- Passed with approved local PostgreSQL access: `npm test`
  - Shared tests: 4 files, 54 tests
  - Web tests: 5 files, 57 tests
  - API tests: 22 files, 224 tests after the structured-address follow-up
- Passed with approved local PostgreSQL access:
  `npm run db:reset && npm run db:migrate`
  - Local schema reset applied migrations `0001` through `0029`.
  - Development seeds applied successfully after the tag-definition
    `display_order` fix.
  - Follow-up `db:migrate` reported no pending migrations.
- Passed: `git diff --check`

Manual tests:

- Completed by the human tester and passed:
  - `/settings` updates first name, last name, street address, city, state, and
    phone number.
  - US and non-US country/region phone entries persist and reload correctly.
  - Invalid phone values show clear feedback.
  - Account menu reflects the updated name immediately after save.
  - Settings password reset sends/cooldowns as before.
  - Admin user detail shows normalized phone and structured address fields
    read-only.
  - Standard user cannot reach admin detail.
  - Settings and Admin user detail layouts hold at 375 / 768 / 1280px.

## Follow-Up Tasks

- None for Phase 30 before commit.

## Claude Review Notes

Source:

- `notes/claude_review_phase_30.txt`

Status:

- Completed. Claude found no blocking issues and requested no code changes.

Findings and disposition:

- PII minimization, current-user-only authorization, name/session refresh,
  admin read-only boundaries, legacy field non-exposure, survey stats, and
  password-reset preservation were reviewed as sound.
- Non-blocking note: Settings sends first/last name on every profile save, so
  `users.updated_at` changes even when only address/phone changed. Accepted as
  harmless for this self-service profile surface.
- Non-blocking note: migration constraint addition is not individually
  re-runnable. Accepted under the repo's forward-only checksum-tracked
  migration policy; migration files are run transactionally.
- Optional validator unit-test suggestion accepted as unnecessary for this
phase because route tests cover blank-name rejection and partial profile
update behavior.

Phone follow-up review:

- Completed. Claude found no blocking issues and requested no code changes.

Phone follow-up findings and disposition:

- Server-side possible-number validation, E.164 normalization, blank-to-null
  behavior, current-user-only authorization, dependency fit, admin read-only
  display, and no address scope drift were reviewed as sound.
- Non-blocking note: the rendered phone number text input should ideally have
  an explicit accessible name because the phone component renders both a country
  selector and text input under one visible label. Accepted for manual a11y
  verification before commit; no code change made because the review marked it
  optional.
- Non-blocking note: wrapping `parsePhoneNumber` in a defensive try/catch would
  avoid a theoretical 500 if a future edge input passes possible-number checks
  but fails parsing. Accepted as optional hardening; no code change made because
  current tests and expected inputs are covered.
- Accepted tradeoff: the phone input dependency grows the already-large web
  bundle. Keep as-is for the UX gain unless future bundle work route-splits
  Settings or adopts lighter metadata.

Structured address follow-up review:

- Completed. Claude found no blocking issues and requested no code changes.
- Structured address shape, current-user-only authorization, partial-update
  preservation, per-field blank-to-null normalization, shared/API/web/test
  contract consistency, admin read-only display, and pre-commit migration
  replacement were reviewed as sound.
- Non-blocking note: `State` remains free text rather than a state/region
  dropdown. Accepted as aligned with optional, country-flexible profile data.

## Commit Readiness

- Requirements implemented: Yes
- Claude handoff created: Yes
- Product context still aligned: Yes
- Architecture principles still aligned: Yes
- Security review complete: Yes; Claude found no blocking issues across the
  base phase and both follow-up reviews
- Review findings addressed or deferred: Yes; phone/address follow-up notes
  accepted as optional/manual-pass checks
- Manual testing complete: Yes
- Ready to commit: Yes

---

## Phase 29 — Tag Group Management Foundation

Date:
2026-06-24

Status:
Complete; ready to commit

Prompt:
`prompts/prompt_29.txt`

Git Commit:
Pending

Review Artifacts:
- Codex handoff: `notes/claude_handoff_phase_29.txt`
- Claude review: `notes/claude_review_phase_29.txt`
- UX update handoff: `notes/claude_handoff_phase_29_ux_update.txt`
- UX update review: `notes/claude_review_phase_29_ux_update.txt`

## Goals

- Add admin-managed tag groups for the reusable hidden-tag catalog.
- Keep each tag category/value pair intact while grouping and moving.
- Support group CRUD, group reorder, tag reorder, and moving tags between
  groups and the ungrouped holding area.
- Keep tag groups out of participant, report, CSV, response, and hidden-tag
  matching behavior.

## Built

- Added migration `0028_tag_groups.sql`:
  - new `tag_groups` table with name, display order, timestamps, and unique
    names
  - nullable `tag_definitions.group_id` with `on delete set null`
  - `tag_definitions.display_order` for grouped and ungrouped catalog ordering
  - indexes for group and tag ordering
- Extended shared tag catalog types with `TagGroup`, grouped catalog response
  data, `groupId`, and `displayOrder`.
- Expanded admin-only `/api/tags` behavior:
  - group create, rename, reorder, and delete
  - tag create/update with optional group assignment
  - tag reorder within grouped or ungrouped sections
  - tag move between groups and ungrouped
  - exact-set reorder validation for groups and tag sections
- Updated builder auto-registration so hidden tags saved from survey-builder
  flows enter the ungrouped catalog area with a valid display order.
- Rebuilt `/admin/tags` into a grouped drag/drop board with:
  - group creation
  - optional group selection when creating a new catalog pair
  - group rename/delete controls
  - tag edit/delete controls that preserve or change group assignment
  - draggable group ordering and draggable tag movement between sections
- Added post-review ergonomics for large tag catalogs:
  - clicking a grouped or ungrouped tag opens an inline move panel with a group
    selector
  - drag/drop manual move behavior remains available
  - groups and the Ungrouped holding area can collapse/expand individually
  - board-level Expand all / Collapse all controls support large catalogs
- Tightened the click-to-move control after screenshot review so the group
  selector, Move action, and Cancel action stay inline with the row controls
  instead of stretching across the card.
- Added a pure tag catalog drag helper and focused unit tests.
- Expanded tag catalog API tests for admin-only access, group CRUD, assignment,
  unassignment, reorder, cross-group moves, group deletion, builder
  auto-registration, and non-exposure in participant/report/CSV payloads.
- Corrected one remaining admin-facing builder helper copy instance from
  "keys and values" to "categories and values".

## Important Decisions

### Groups Are Catalog Metadata Only

Decision:
Store grouping on `tag_definitions` and expose it only through admin catalog
APIs.

Reason:
The feature is for managing reusable catalog pairs. Hidden tags saved on answer
options, Other metadata, and value tags should continue to use plain
category/value pairs exactly as before.

Tradeoff:
Reports and CSV do not show group names. Cross-survey or reporting filters by
group remain out of scope.

### Group Deletion Leaves Tags Intact

Decision:
Deleting a tag group returns its catalog definitions to the ungrouped holding
area.

Reason:
The prompt explicitly requires group deletion to avoid deleting tag
definitions, and existing saved hidden tags are independent of the catalog.

Tradeoff:
Admins may need to manually re-home returned tags after deleting a group.

## Architecture Notes

- Database/schema impact: additive migration `0028_tag_groups.sql`; existing
  definitions backfill into ungrouped ordering.
- API contract impact: `/api/tags` list responses now include grouped catalog
  data while keeping the flat `tags` array; tag objects include `groupId` and
  `displayOrder`.
- Auth or authorization impact: all group endpoints use the existing admin-only
  `/api/tags` boundary.
- Data privacy or visibility impact: automated tests assert participant,
  report, and CSV payloads do not expose tag group metadata.
- Frontend UX impact: `/admin/tags` is now a grouped drag/drop management
  board with an ungrouped holding area.
- Environment or deployment impact: run migration `0028` before using tag
  groups.

## Validation

Commands run:

```bash
npm run typecheck
npm run test -w apps/web -- tagCatalogDrag
npm run test -w apps/api -- test/tagCatalog.test.ts
npm run lint
npm run build
npm test
git diff --check
npm run test -w apps/web -- tagCatalogDrag
```

Results:

- Passed: `npm run typecheck`
- Passed: `npm run test -w apps/web -- tagCatalogDrag` (4 tests)
- Initial sandboxed focused API test attempt was blocked by PostgreSQL access
  to `127.0.0.1:5432`.
- Passed with approved local PostgreSQL access:
  `npm run test -w apps/api -- test/tagCatalog.test.ts` (13 tests)
- Passed: `npm run lint`
- Passed: `npm run build`
  - Vite emitted the existing large chunk warning.
- Passed with approved local PostgreSQL access: `npm test`
  - Shared tests: 4 files, 54 tests
  - Web tests: 5 files, 57 tests
  - API tests: 22 files, 222 tests
- Passed: `git diff --check`
- Post-review UX polish passed:
  - `npm run typecheck`
  - `npm run test -w apps/web -- tagCatalogDrag`
  - `npm run lint`
  - `npm run build`
  - `git diff --check`
- Compact move-control polish passed:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build`
  - `git diff --check`
- Final pre-commit rerun passed with approved local PostgreSQL access:
  `npm test`
  - Shared tests: 4 files, 54 tests
  - Web tests: 5 files, 57 tests
  - API tests: 22 files, 222 tests

Manual tests:

- Passed by developer on 2026-06-24:
  - create/rename/delete tag groups on `/admin/tags`
  - create a tag directly into a group
  - click grouped and ungrouped tags to move them with the group selector
  - drag tag pairs between groups and into Ungrouped
  - collapse/expand groups and Ungrouped
  - edit a grouped tag pair and confirm group assignment remains correct
  - re-check hidden-tag suggestions in the survey builder
  - inspect responsive behavior at 375 / 768 / 1280px

## Follow-Up Tasks

- Manual `/admin/tags` responsive browser pass is complete.
- Claude Code review is complete with no blocking findings and no requested
  code changes.
- Confirmed Claude's migration atomicity question: `scripts/migrate-db.mjs`
  wraps each pending migration file in `begin`/`commit`.
- Accepted Claude's non-blocking observation that builder suggestion ordering
  now follows the flat catalog response's ungrouped/group display order before
  `buildTagPresets` sorts merged suggestions alphabetically. Manual browser
  testing should still confirm the suggestion dropdown reads sensibly.
- Added post-review UX polish at developer request after Claude's review:
  click-to-move controls and collapsible grouped/ungrouped sections. These
  additions passed frontend-focused validation and received a targeted second
  Claude review with no blocking findings.
- Accepted Claude's UX review notes:
  - empty whole-catalog state plus Ungrouped empty section can both render when
    the catalog is empty; harmless, left as-is for now
  - moving a tag out of a collapsed section requires expanding it first; this is
    accepted behavior for the current interaction model
  - stale collapsed-section keys after group deletion are inert and self-correct
    on Collapse all / Expand all
  - search/filtering, pagination, or virtualization remain deferred if
    hundred-row expanded catalogs become cumbersome

## Claude Review Notes

Source:

- `notes/claude_review_phase_29.txt`

Status:

- Completed. Claude found no blocking issues and recommended commit after the
  required manual browser and mobile pass.

Findings and disposition:

- Migration safety, admin-only authorization, pair-level grouping integrity,
  group delete behavior, server-side reorder validation, and
  participant/report/CSV isolation were reviewed as sound.
- Non-blocking observation about possible concurrent display-order ties is
  accepted for this low-concurrency admin surface; read paths have stable
  tiebreakers and reorders self-heal to contiguous ordering.
- Non-blocking observation about redundant intermediate `display_order` write
  during tag moves is accepted as harmless within the transaction.

## Claude UX Update Review Notes

Source:

- `notes/claude_review_phase_29_ux_update.txt`

Status:

- Completed. Claude found no blocking issues and recommended commit after the
  manual browser and mobile pass, which is now complete.

Findings and disposition:

- Click-to-move and drag-to-move were reviewed as safely separated by dedicated
  controls, with edit and move state mutually exclusive.
- Collapsed sections were reviewed as valid drop targets; dragging into a
  collapsed section is supported, while moving out requires expanding.
- The move panel's same-group guard, submit disabling, retry behavior, and
  server-authoritative state refresh were reviewed as sound.
- Dense-row/narrow-width CSS was reviewed as reasonable and the required
  375 / 768 / 1280px manual pass is now complete.

## Commit Readiness

- Requirements implemented: Yes
- Claude handoff created: Yes
- Product context still aligned: Yes
- Architecture principles still aligned: Yes
- Security review complete: Yes; Claude found authorization boundaries sound
  and server-side admin-only tests pass for catalog/group endpoints
- Review findings addressed or deferred: Yes; no code changes requested
- Manual testing complete: Yes
- Ready to commit: Yes

---

## Phase 28 — Tag Category Terminology Alignment

Date:
2026-06-24

Status:
Complete; ready to commit

Prompt:
`prompts/prompt_28.txt`

Git Commit:
Pending

Review Artifacts:
- Codex handoff: `notes/claude_handoff_phase_28.txt`
- Claude review: `notes/claude_review_phase_28.txt`

## Goals

- Present the user/admin-facing `tagKey` concept as "Tag category".
- Keep "Tag value" terminology unchanged.
- Preserve API fields, shared types, database columns, hidden-tag behavior,
  report semantics, and CSV data shape.

## Built

- Updated Admin tag catalog labels, helper copy, and duplicate warning copy to
  use "Tag category" and "category/value pair" language.
- Updated the shared survey-builder hidden-tag editor used by answer-option
  tags, Other tags, and value tags:
  - label now says "Tag category"
  - placeholder now says "Choose tag category"
  - custom option/input now say "Custom category..." and "Enter tag category"
  - duplicate warning now says "category/value pair"
- Updated user-facing API validation copy for hidden tag bodies:
  - "Tag category and value are required"
  - "Tag category must be 80 characters or fewer"
- Updated the focused tag catalog validation test to assert the new error copy.
- Updated Results hidden-tag rollup helper copy to describe hidden tag
  category/value pairs.
- Updated `markdown/ADMIN_DEMO_GUIDE.md`, `markdown/DATA_MODEL_VISION.md`, and
  `markdown/FOLLOW_UPS.md` for current terminology.
- Created the Claude review handoff at `notes/claude_handoff_phase_28.txt`.
- Claude review found no critical issues, no API/type/database drift, no missed
  user-facing "Tag key" copy, and no requested code changes.

## Important Decisions

### Internal Contract Stability

Decision:
Keep `tagKey`, `tagValue`, and `tag_key` unchanged in API contracts, shared
types, SQL, and tests that assert payload shape.

Reason:
The client feedback is terminology alignment, not a data-model migration.
Changing contracts or columns would create needless compatibility and migration
risk.

Tradeoff:
The code still uses the historical internal name while visible admin copy uses
"Tag category".

### Historical Phase Log References

Decision:
Leave older `markdown/PHASE_LOG.md` entries that mention key/value terminology
as historical records.

Reason:
Those entries describe past implementation phases and are not current
admin-facing product copy.

Tradeoff:
Repository-wide text searches still find old historical wording, but current
UI, validation copy, and active docs have been updated.

## Architecture Notes

- Database/schema impact: none.
- API contract impact: no field or payload shape changes; only validation
  message copy changed.
- Auth or authorization impact: none.
- Data privacy or visibility impact: hidden tags remain admin-only metadata and
  are still never shown to participants.
- Frontend UX impact: admin-facing terminology now says tag category/value.
- Reporting impact: hidden-tag rollup behavior and counts are unchanged; only
  helper copy changed.

## Validation

Commands run:

```bash
npm run typecheck
npm run lint
npm run build
npm test
git diff --check
```

Results:

- Passed: `npm run typecheck`
- Passed: `npm run lint`
- Passed: `npm run build`
  - Vite emitted the existing large chunk warning.
- Initial sandboxed `npm test` partially passed and then failed on API global
  setup because the sandbox blocked PostgreSQL at `127.0.0.1:5432`.
  - Shared tests passed: 4 files, 54 tests.
  - Web tests passed: 4 files, 53 tests.
- Passed on escalated rerun: `npm test`
  - Shared tests: 4 files, 54 tests.
  - Web tests: 4 files, 53 tests.
  - API tests: 22 files, 215 tests.
- Passed: `git diff --check`

Manual tests:

- Passed by developer on 2026-06-24:
  - `/admin/tags` shows "Tag category" and "Tag value".
  - Admin tag add/edit still works and hidden tags still appear as suggestions.
  - Builder answer-option, Other, and value hidden-tag forms show "Tag category".
  - Admin Results and CSV behavior remain unchanged.

## Follow-Up Tasks

- Claude Code review is complete with no requested fixes.

## Commit Readiness

- Requirements implemented: Yes
- Product context still aligned: Yes
- Architecture principles still aligned: Yes
- Security review complete: Yes
- Review findings addressed or deferred: No requested fixes
- Manual testing complete: Yes
- Ready to commit: Yes

---

## Phase 27 — Running Dynamic Time Remaining Instrumentation

Date:
2026-06-23

Status:
Post-review fixes applied; pending DB-backed validation and manual checks

Prompt:
`prompts/prompt_27.txt`

Git Commit:
Pending

Review Artifacts:
- Codex handoff: `notes/claude_handoff_phase_27.txt`
- Claude review: `notes/claude_review_phase_27.txt`

## Goals

- Add lightweight participant attempt activity instrumentation for future
  dynamic remaining-time estimates.
- Keep the Phase 26 participant display powered by static effective survey
  estimate plus question-weight proportions.
- Validate authenticated and anonymous ownership before accepting activity
  writes.
- Provide capped active-time aggregation helpers by attempt and survey.

## Built

- Added migration `0027_survey_attempt_activity_events.sql`.
  - Stores attempt id, survey id, optional page/question context, event type,
    visible question ids, and timestamps.
  - Event types are `page_entry`, `answer_save`, `resume`, `completion`, and
    `heartbeat`.
  - No raw answer text, selected option values, hidden tags, or participant
    contact data are stored in activity rows.
- Added shared activity request/response contracts.
- Added `apps/api/src/services/surveyActivity.ts`.
  - `surveyAttemptActivityIdleGapCapSeconds` is centralized at 300 seconds.
  - Active seconds sum gaps between consecutive events with each gap capped.
  - Helpers summarize active seconds for a single attempt and for a survey.
- Added authenticated activity endpoint:
  - `POST /api/surveys/:id/activity`
  - Requires logged-in ownership of the attempt and rejects completed or
    abandoned attempts.
- Added anonymous activity endpoint:
  - `POST /api/anonymous-surveys/:token/activity`
  - Requires valid anonymous link token, attempt id, and attempt access token.
- Added backend activity records for answer saves and completion in both
  authenticated and anonymous flows.
  - Post-review fix: server-emitted answer-save and completion telemetry is
    best-effort and cannot roll back answer transactions or 500 an already
    completed attempt.
- Instrumented the participant runner with non-blocking resume, page-entry, and
  one-minute heartbeat activity writes while preserving Phase 26 remaining-time
  display behavior.
- Added focused API/service tests in `apps/api/test/surveyActivity.test.ts`.
- Updated `markdown/DATA_MODEL_VISION.md` and `markdown/FOLLOW_UPS.md`.

## Important Decisions

### Idle Gap Cap

Decision:
Cap each event-to-event gap at five minutes when computing active seconds.

Reason:
This avoids counting overnight pauses or long idle browser sessions as
continuous survey work while preserving useful short pauses between page entry,
answer save, heartbeat, resume, and completion events.

Tradeoff:
The cap is conservative and intentionally approximate. It is operational
metadata for later modeling, not a participant-facing prediction in this phase.

### Participant Payload Isolation

Decision:
Activity endpoints return only `{ ok: true }`, and existing participant survey
and attempt payloads do not expose activity rows or active seconds.

Reason:
Activity timing is operational metadata. Phase 26's display should remain
participant-safe and driven by `Survey.effectiveEstimateSeconds`.

Tradeoff:
Admin timeline and diagnostic views remain out of scope until a future phase
explicitly asks for them.

### Server-Side Telemetry Durability

Decision:
Record server-emitted answer-save and completion events best-effort, outside the
participant-critical answer transaction and completion response path.

Reason:
Claude review identified that telemetry failures could otherwise roll back saved
answers or return a 500 after a successful completion update. Activity metadata
must not affect response or completion durability.

Tradeoff:
A rare telemetry insert failure may leave a missing activity event, but the
participant's actual answer/completion remains correct.

## Architecture Notes

- Database/schema impact: adds one activity table with explicit FKs and indexes
  for attempt-time and survey-time aggregation.
- API contract impact: adds participant activity write endpoints for
  authenticated and anonymous attempts.
- Auth or authorization impact: authenticated activity uses the same attempt
  ownership lookup as answer saves; anonymous activity uses the same link +
  access-token ownership check as anonymous answer saves.
- Data privacy or visibility impact: activity rows store no raw answer content
  and are not included in participant payloads.
- Frontend UX impact: no visible UI change; telemetry writes are fire-and-forget
  and do not block answering, navigation, or completion.
- Reporting impact: Admin Results, reporting counts, hidden tags, and CSV remain
  unchanged.

## Validation

Commands run:

```bash
npm run typecheck
npm run lint
npm run build
npm run test -w packages/shared -- surveyRemainingTime
npm run test -w apps/web -- SurveyAttemptPage
npm test -w apps/api -- surveyActivity
git diff --check
```

Results:

- Passed: `npm run typecheck`
- Passed: `npm run lint`
- Passed: `npm run build` (Vite emitted the existing large chunk warning)
- Passed: `npm run test -w packages/shared -- surveyRemainingTime`
  - 7 tests
- Passed: `npm run test -w apps/web -- SurveyAttemptPage`
  - 1 test
- Passed after post-review fix: `git diff --check`
- Not completed: `npm test -w apps/api -- surveyActivity`
  - Sandboxed run could not connect to PostgreSQL at `127.0.0.1:5432`.
  - Escalated rerun was rejected because the API test global setup drops and
    recreates the PostgreSQL `public` schema, which requires explicit human
    approval.

Manual tests:

- Not run in browser.

## Follow-Up Tasks

- Run the focused DB-backed activity test file after explicit approval for the
  test database reset.
- Run the Phase 27 manual browser pass for authenticated and anonymous
  activity writes plus 375/768/1280px responsive checks.
- Build any participant-facing dynamic remaining-time model in a later phase
  using the new capped active-time data.

## Commit Readiness

- Requirements implemented: Yes
- Product context still aligned: Yes
- Architecture principles still aligned: Yes
- Security review complete: Claude review complete
- Review findings addressed or deferred: Critical C1/C2 coupling issues fixed;
  non-blocking findings deferred or documented
- Manual testing complete: No
- Ready to commit: No, pending DB-backed tests, manual checks, and branch
  confirmation

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

---

## UI Update — Main Nav Header And Dashboard Identity (separate from Phase 8)

Date:
2026-06-11 (earlier the same day as Phase 8)

Status:
Implemented per direct user request; not part of the Phase 8 prompt scope.

Scope:

- Removed the redundant `Login` link from the unauthenticated primary nav
  (the Home page retains its primary Login action).
- Added a mobile hamburger menu (`nav-toggle`) that collapses the primary
  nav at widths <= 760px, replacing the old stacked/grid nav rules.
- Moved the signed-in identity into the nav: full name plus a role chip
  ("Admin"/"User").
- Removed the user dashboard profile strip (name/email) and the admin
  overview "Signed in as" line, since the navbar now carries identity.

Validation:

- typecheck, lint, build, and `git diff --check` passed at implementation
  time and again within the Phase 8 validation runs.

Commit note:

- These changes share the working tree with Phase 8 but are an independent
  UX task. Codex review finding F3 flagged the overlap; recommendation is to
  commit this UI update separately (or call it out explicitly in the commit
  message) so the reporting/test-harness diff stays tightly scoped.

---

## Phase 8 — Admin Reporting, CSV Export, and Automated Test Harness

Date:
2026-06-11

Status:
Implemented; Codex review findings addressed

Prompt:
`prompts/prompt_8.txt`

Git Commit:
Pending

Review Artifacts:
- Implementation handoff: `notes/codex_handoff_phase_8.txt`
- Codex review: `notes/codex_review_phase_8.txt` (pending)

## Goals

- Extract services from the 3,650-line `apps/api/src/routes/surveys.ts` with
  zero behavior change.
- Stand up the project's first automated test harness (Vitest + supertest +
  dedicated PostgreSQL test database) with baseline coverage of existing
  behavior.
- Deliver admin reporting: completion summary, attempts list, attempt detail
  with resolved hidden tags, and CSV export, with a Results tab in the survey
  workspace.

## Built

### Workstream 1 — Service Extraction (no behavior change)

- `apps/api/src/services/validation.ts`: pure request-body validators and
  field readers.
- `apps/api/src/services/surveyRecords.ts`: DB record interfaces, record
  mappers, scale helpers, and single-entity fetchers.
- `apps/api/src/services/surveyStructure.ts`: `fetchSurveyStructures` with
  hidden-tag inclusion control.
- `apps/api/src/services/surveyBuilder.ts`: builder mutations, ordering,
  publish validation, and rule-reference validation.
- `apps/api/src/services/surveyAttempts.ts`: attempt lifecycle, answer
  validation/persistence, and navigation walks.
- Route files split by responsibility: `surveyReadRoutes.ts`,
  `surveyBuilderRoutes.ts`, `surveyAttemptRoutes.ts`, `mySurveysRoutes.ts`,
  with `routes/surveys.ts` reduced to router composition. Paths, methods,
  middleware, status codes, and messages are unchanged; the extraction was
  done by moving code bodies verbatim.

### Workstream 2 — Test Harness

- Vitest in all three workspaces plus a root `npm test` script.
- API route tests run supertest against `createApp()` with a dedicated test
  database. The harness reads `TEST_DATABASE_URL`, refuses database names
  without `test`, never falls back to dev/hosted URLs, resets the schema and
  applies all migrations per run, and truncates tables between tests.
- Baseline suites written against the pre-extraction monolith and re-run
  unchanged after extraction: auth (register/login/me/logout/roles), survey
  visibility and recursive hidden-tag isolation, builder publish/rule/order
  validation and delete guards, attempt lifecycle, conditional navigation,
  and scale answers.
- Pure-helper unit tests: shared `resolveNextQuestion` (12 cases) and web
  `surveyFlowGraph` (18 cases including every issue code).
- Totals: 93 tests (12 shared, 18 web, 63 API).

### Workstream 3 — Reporting And Export

- Admin-only endpoints (requireAuth + requireRole admin):
  - `GET /api/surveys/:id/report` — attempt counts by status, completion
    rate, per-question answered/blank counts.
  - `GET /api/surveys/:id/attempts` — attempts with participant identity,
    status, timestamps, answered counts.
  - `GET /api/surveys/:id/attempts/:attemptId` — answers in survey order
    with hidden tags resolved through selected options, blank-skip markers,
    and final-path markers.
  - `GET /api/surveys/:id/export.csv` — RFC 4180-quoted CSV download, one
    row per saved response, with selected options and `key=value` hidden
    tags joined by `; `.
- `apps/api/src/services/surveyReporting.ts` and a pure, unit-tested
  `apps/api/src/services/csv.ts`.
- Shared reporting types in `packages/shared`.
- UI: Results tab in the survey workspace (summary stats, per-question
  counts, attempts list, expandable attempt detail, Export CSV link), and a
  completion indicator on the surveys overview rows.

## Important Decisions

### Product Decisions (recommended defaults applied per human instruction)

1. Repeat attempts: one attempt per user per survey stands; reports treat
   the attempt as the unit of record.
2. Branch-change orphans: answers left unreachable by a changed branching
   answer are kept as historical data and explicitly marked
   "not on final path" in the attempt detail and CSV (`on_final_path`
   column). The final path is computed by walking shared
   `resolveNextQuestion` over the attempt's saved responses.
3. Blank optional responses: blank saved rows are reported as
   "skipped (blank)", distinct from questions with no response row
   ("not answered yet" on the final path; "never reached" off it).

### Extraction Before Features

The baseline route tests were written against the monolith first, then the
split was performed by moving code verbatim, then the tests were re-run
unchanged (45/45). Reporting was built only after that gate passed.

### Test Database Safety

Tests configure the API by setting `LOCAL_DATABASE_URL`/`DATABASE_URL` to the
validated test URL before the config module loads. The name-must-contain-test
rule plus explicit conflict checks against dev/hosted URLs follow the same
defensive posture as the seed scripts.

## Architecture Notes

- Database/schema impact: none. No new tables or migrations.
- API contract impact: four new additive admin-only reporting endpoints; all
  existing endpoints unchanged (verified by baseline tests).
- Auth or authorization impact: reporting endpoints enforce admin role
  server-side; tests assert 401/403 on every reporting path.
- Data privacy or visibility impact: hidden tags appear only in admin
  reporting responses and the admin-only CSV (which also contains
  participant emails). Participant payloads remain tag-free, asserted
  recursively in tests.
- Frontend UX impact: new Results tab and overview completion indicator;
  no participant-facing changes.
- Environment or deployment impact: new optional `TEST_DATABASE_URL`
  documented in `.env.example` and README; local-only.

## Validation

Commands run:

```bash
npm run typecheck
npm run lint
npm run build
npm test
git diff --check
```

Results:

- Passed: typecheck, lint, build across all workspaces.
- Passed: `npm test` — 93/93 (shared 12, web 18, API 63).
- Passed: `git diff --check`.
- Note: run API tests via `npm test`; a bare `vitest` at the repo root runs
  all workspaces' files in parallel against the single test database and
  fails spuriously (documented in README).
- Not run: manual browser pass (no browser automation in this environment).
  The Phase 8 checklist is tracked in `markdown/FOLLOW_UPS.md`.

## Codex Review Notes

Source:

- `notes/codex_review_phase_8.txt`

Status:

- Completed. Three findings; all addressed.

Findings addressed:

- F1 (Medium): The Results attempt-detail fetch could apply a stale response
  if rows were clicked quickly, showing one participant's answers under
  another's selection. Fixed with a request-id ref guard around
  `setDetail`/`setError`/`setIsDetailLoading`, mirroring the stale-response
  pattern used by the page-level summary load. The guard also invalidates
  in-flight requests when the panel is toggled closed or the survey changes.
- F2 (Medium): The documented "one attempt per user per survey" default was
  not enforced — the start endpoint created a fresh attempt after a
  completed or abandoned one. Resolution per the data-model decision
  ("one active/completed attempt per user per survey"): starting a survey
  with an existing completed attempt now returns 409
  "This survey has already been completed" (new `fetchCompletedAttempt`
  service helper plus a route guard). Abandoned attempts intentionally do
  NOT block a fresh start: abandonment exists so stale attempts cannot lock
  users out, and abandoned attempts remain visible in reports as historical
  records. Both behaviors are covered by new route tests (start-after-complete
  409; start-after-abandoned creates a new attempt).
- F3 (Low): The nav-header/dashboard-identity changes predate Phase 8 and
  were a separate user-requested task sharing the working tree. Documented
  above as a separate phase-log entry with a recommendation to commit them
  separately from the Phase 8 diff.

## Follow-Up Tasks

- Manual browser checklist for the Results tab (tracked in FOLLOW_UPS).
- Reporting pagination and hidden-tag filtering when volume demands.
- Replace per-survey report fetches on the overview with a batched count
  endpoint if survey count grows.
- Consider hoisting the saved-path walk into `packages/shared` next time a
  consumer is added.
- Confirm with the client that completed-blocks-restart and
  abandoned-allows-restart match the business need (enforced as of the F2
  fix).

## Commit Readiness

- Requirements implemented: Yes
- Implementation handoff created: Yes
- Codex review created: Yes; all findings addressed (F1/F2 fixed, F3
  documented).
- Product context still aligned: Yes
- Architecture principles still aligned: Yes
- Security review complete: Reporting endpoints admin-gated and tested;
  hidden-tag isolation asserted; parameterized SQL throughout.
- Review findings addressed or deferred: Yes
- Manual testing complete: Automated suite complete (95 tests); browser pass
  deferred and tracked.
- Ready to commit: Yes, pending the user-driven browser checklist.

---

## Phase 9 — Deployment Hardening and Continuous Integration

Date:
2026-06-11

Status:
Completed; ready to commit with follow-ups

Prompt:
`prompts/prompt_9.txt`

Git Commit:
Pending

Review Artifacts:
- Implementation handoff: `notes/claude_handoff_phase_9.txt`
- Claude review: `notes/claude_review_phase_9.txt` (pending)

## Discovery

1. `/api/health` previously called `checkDatabaseConnection()` with `select 1`
   and always returned HTTP 200, even when PostgreSQL was unavailable.
2. Migrations were untracked. README documented hand-applied `psql -f`
   commands; `scripts/reset-local-db.mjs` and API test `globalSetup` each
   applied every migration file directly with no `schema_migrations` state.
3. The local seed creates/promotes `admin@example.test` with a committed
   development password hash and sample survey data, so it must stay local-only
   and guarded by script-level environment checks.
4. Login already preserved generic timing-equalized 401 behavior through a
   decoy bcrypt comparison when no email record exists.

## Built

- Added `express-rate-limit` to `POST /api/auth/login` and
  `POST /api/auth/register`.
- Added registration password validation rejecting values longer than 72 bytes
  after UTF-8 encoding.
- Added conservative proxy trust config: `TRUST_PROXY_HOPS` defaults to 1 in
  `RUN_ENV=prod` for Azure App Service and 0 otherwise.
- Split health endpoints:
  - `/api/health/live`: process liveness, always 200, no DB touch.
  - `/api/health/ready`: database/schema readiness, 200 or 503.
  - `/api/health`: readiness alias for existing consumers.
- Updated `HealthResponse` and frontend health fetch/rendering so unhealthy
  readiness bodies still render useful status details.
- Added `scripts/migrate-db.mjs` and `npm run db:migrate`.
- Added `schema_migrations` tracking with filename order, SHA-256 checksums,
  idempotent no-op reruns, mismatch failures, and explicit `--baseline`.
- Updated `scripts/reset-local-db.mjs` and API test `globalSetup` to use the
  migration runner.
- Added `scripts/provision-admin.mjs` and `npm run admin:provision` for
  hosted-safe admin creation/promotion from environment variables or prompts.
- Added GitHub Actions CI at `.github/workflows/ci.yml`.
- Updated `.env.example`, README, database docs, seed docs, global environment
  notes, and follow-up tracking.

## Important Decisions

### Minimal Custom Migration Runner

Decision:
Use a small custom `pg` runner instead of `node-pg-migrate`.

Reason:
The project already has ordered SQL migrations. The missing deployment need was
state tracking, checksums, idempotency, mismatch detection, and explicit
baseline support, all of which are straightforward without changing the
migration authoring format.

Tradeoff:
No down migrations or migration framework features. This matches current MVP
needs and avoids a second migration DSL.

### Health Readiness Alias

Decision:
Keep `/api/health` as a readiness alias and add explicit `/live` and `/ready`
subpaths.

Reason:
Existing frontend consumers keep working, while Azure health checks can use the
truthful readiness endpoint. The body remains compact and shared through
`HealthResponse`.

Tradeoff:
Existing consumers now receive 503 when the database/schema check fails, which
is the intended hosted behavior.

### In-Memory Auth Rate Limiting

Decision:
Use `express-rate-limit` with `MemoryStore`, 5 requests per 15 minutes for
login and registration by default.

Reason:
The MVP runs as a single Azure App Service instance. The limiter is explicit,
configurable, and covered by tests.

Tradeoff:
Horizontal scaling will require a shared limiter store; this remains tracked in
`markdown/FOLLOW_UPS.md`.

## Architecture Notes

- Database/schema impact: no existing migration files were changed. The runner
  creates `schema_migrations` outside the ordered SQL files.
- API contract impact: `/api/health` can now return 503 and `HealthResponse`
  includes `database`.
- Auth impact: login/register are rate limited; registration rejects passwords
  above bcrypt's 72-byte effective input limit.
- Data privacy impact: hidden tags and admin reporting boundaries were not
  touched.
- Environment/deployment impact: added migration, provisioning, rate-limit,
  proxy-trust, and CI configuration.

## Validation

Commands run:

```bash
npm install -w apps/api express-rate-limit
npm run typecheck
npm run lint
npm run build
npm test
git diff --check
```

Results:

- Passed: `npm run typecheck`.
- Passed: `npm run lint`.
- Passed: `npm run build`.
- Passed: `npm test` — 109/109 tests (shared 12, web 18, API 79).
- Passed: `git diff --check`.
- Passed: focused API test run after implementation — 79/79.
- Note: initial sandboxed API test run failed with `EPERM 127.0.0.1:5432`;
  reran with approved local PostgreSQL access.
- Note: local typecheck initially saw stale shared declaration output after
  changing `HealthResponse`; rebuilding `packages/shared` cleared it, and the
  root `typecheck` script now builds shared first.
- Not run: GitHub Actions workflow itself. First real execution happens after
  push or pull request and is tracked for human verification.

## Follow-Up Tasks

- Verify the first GitHub Actions CI run after this workflow reaches GitHub.
- Replace the auth rate-limit in-memory store with a shared store if the API
  scales horizontally.

## Commit Readiness

- Requirements implemented: Yes
- Implementation handoff created: Yes (`notes/claude_handoff_phase_9.txt`)
- Claude review created: Pending
- Product context still aligned: Yes
- Architecture principles still aligned: Yes; modular monolith, SQL migrations,
  and server-side auth remain intact.
- Security review complete: Implementation ready for Claude review; no secrets
  committed.
- Review findings addressed or deferred: Pending Claude review.
- Manual testing complete: Automated validation complete; GitHub Actions first
  hosted run pending.
- Ready to commit: After Claude review.

## Phase 10 — Testing Pass and Issue List Fixes

Date:
2026-06-11

Status:
Implemented; Codex review pending

Prompt:
`prompts/prompt_10.txt` with the issue list from `notes/phase_9_test_notes.txt`

Git Commit:
Pending

Review Artifacts:
- Implementation/review handoff: `notes/claude_handoff_phase_10.txt`
- Role note: roles flipped this phase — Claude Code implemented, Codex reviews.

## Received Issue List (Summary And Classification)

General:
1. Admin user management with promote-to-admin — feature (authz-sensitive).
2. Survey categories with admin-managed grouping — feature (schema).
3. Integer question input unclear — UX polish (stepper).
4. Scale question rendered as blocks — UX polish (snapping slider).

Login/Register:
5. Center and polish login/register — UX polish.

User role:
6. Dashboard: remove "Choose a survey" panel, fill space, pagination — UX rework.
7. Dedicated survey-taking screen with breadcrumbs — UX rework (routing).
8. Saved-answers vs total-questions delta under skip logic — bug (confusing data).
9. Remove "USER" nav pill; keep the admin pill — UX polish.

Admin role:
10. Admin workspace survey-list pagination — UX polish.
11. Survey CRUD: clone-on-edit for published surveys; delete hides from users but
    keeps all rows for analytics — feature (schema, data safety).
12. Persistent "Survey metadata saved" notice — UX polish (toasts).
13. Tag/key catalog table, management page, inline registration, duplicate
    detection — feature (schema).

No item was discarded; every item was implemented this phase.

## Fixes Implemented

- Migrations `0006_survey_soft_delete.sql` (surveys.deleted_at + index),
  `0007_survey_categories.sql` (survey_categories table + surveys.category_id FK,
  on delete set null), `0008_tag_definitions.sql` (tag_definitions table with
  unique (tag_key, tag_value), backfilled from answer_tags).
- Admin users API: `GET /api/admin/users` (server-paginated, never selects
  password_hash) and `PATCH /api/admin/users/:id/role` (400 invalid role,
  404 unknown user, 409 self-change guard). New `/admin/users` page with
  promote/demote actions (self-actions disabled).
- Survey soft delete: `DELETE /api/surveys/:id` stamps `deleted_at`. Deleted
  surveys vanish from `GET /api/surveys` (all roles), `/api/my-surveys`
  (both scope branches), start (404), answer/complete (409), and all builder
  mutations (409 via a `rejectDeletedSurvey` guard that runs after the role
  check). Admin reads by id and all reporting endpoints still resolve deleted
  surveys, so analytics and rows are fully retained.
- Survey duplicate: `POST /api/surveys/:id/duplicate` clones metadata
  (+category), questions, options, hidden tags, and conditional rules in one
  transaction with old→new ID remapping for all rule references. Clone is
  always a draft titled "<title> (copy)"; attempts are not copied. Surfaced as
  "Create editable draft copy" in the workspace header for non-draft surveys.
- Categories: admin-only CRUD at `/api/categories` (top-level mount avoids the
  `/api/surveys/:id` route-shadowing hazard); `categoryId` accepted on survey
  create/update with existence validation; `categoryId`/`categoryName` embedded
  in survey payloads. Category select + inline create on the setup page, and a
  management panel on the admin overview. The user dashboard groups surveys by
  category with filter chips.
- Tag catalog: admin-only CRUD at `/api/tags` (409 on duplicate pairs). Tags
  saved on answer options register in the catalog automatically (upsert).
  New `/admin/tags` page replaces the session-only tag suggestion manager;
  the questions page consumes catalog entries as suggestions and warns on
  duplicate key/value pairs per option as the admin types; submits surface the
  server 409.
- Path-aware progress (shared `resolveAttemptPath`): the duplicated navigation
  walks in `apps/api/src/services/surveyAttempts.ts` and the web runner were
  consolidated into `packages/shared`. The participant runner now shows
  "Question x of y" and the completion summary against the resolved path, so
  skip-logic surveys no longer show a confusing answered/total delta.
- Dedicated attempt route `/surveys/:surveyId/attempt` with breadcrumbs
  (Dashboard / survey title), extracted from `UserDashboard.tsx`. The page
  recovers from refresh by resuming the active attempt server-side; abandoned
  attempts start fresh per the attempt policy.
- Dashboard rework: removed the "Choose a survey" panel; full-width card grid
  grouped by category, client-side pagination (9 per page).
- Integer questions render as a stepper (−/+ buttons around the numeric
  input); scale questions render as a native range slider snapping to whole
  values with a current-value badge and min/max labels.
- Login/register centered in an `auth-card` layout.
- "USER" nav pill removed; the admin pill remains.
- Admin overview: client-side pagination (10 per page) with completion reports
  fetched only for the visible page; per-row delete with a confirm dialog that
  states response data is retained.
- Toast notifications replace the persistent workspace notice; errors remain
  inline.

## Assumptions And Deferrals

- Soft delete is a `deleted_at` column, not a status: keeps the status check
  constraint, publish/retire timestamp logic, and the survey's last real
  status for analytics.
- "Edit a published survey" is an explicit duplicate button, not an automatic
  clone on edit, matching the tester's stated default while avoiding surprise
  drafts.
- Users who completed the original survey may take a published clone — it is
  an independent survey by design; documented consequence of clone-on-edit.
- Categories are single-assignment (`surveys.category_id`), not many-to-many.
- Tag catalog has no FK from `answer_tags`; it is a registry. Deleting a
  catalog entry never touches saved option tags. Normalization deferred.
- Survey-list pagination is client-side at current data volumes; a lightweight
  server-paginated list endpoint is deferred to FOLLOW_UPS.

## Tests And Validation

New suites: `adminUsers.test.ts`, `surveyDeletion.test.ts`,
`surveyDuplicate.test.ts`, `categories.test.ts`, `tagCatalog.test.ts` (API),
`resolveAttemptPath.test.ts` (shared). New factories: `deleteSurvey`,
`duplicateSurvey`, `createCategory`, `createTagDefinition`.

```bash
npm run typecheck   # passed
npm run lint        # passed
npm run build       # passed
npm test            # passed — 147/147 (shared 18, web 18, API 111)
git diff --check    # passed
npm run db:reset    # passed — applies 0006–0008 + seeds
npm run db:migrate  # passed — idempotent no-op rerun
```

Manual-only verification (documented in the handoff): slider/stepper feel,
login centering, toast behavior, breadcrumb/refresh flow, dashboard grouping
and pagination at mobile widths.

## Commit Readiness

- Requirements implemented: Yes — all 13 issues addressed.
- Implementation handoff created: Yes (`notes/claude_handoff_phase_10.txt`)
- Codex review created: Pending
- Product context still aligned: Yes
- Architecture principles still aligned: Yes; error shape, hidden-tag
  isolation, cookie auth, attempt policy, and add-only migrations preserved.
- Ready to commit: After Codex review.

## Phase 10 — Codex Review Fixes (Round 1)

Date:
2026-06-11

Findings addressed (from Codex source review):

1. Published surveys were still structurally mutable through builder
   endpoints (question text/required/help updates, option add/rename, tag
   add/change, rule add/update/delete), bypassing the clone-on-edit model.
   Fixed with a shared `rejectStructurallyLockedSurvey` guard in
   `apps/api/src/routes/surveyBuilderRoutes.ts` applied to all fourteen
   structural routes (questions, reorders, options, tags, rules). It returns
   409 "Survey structure can only be edited while the survey is a draft.
   Create an editable draft copy to make changes" for published and retired
   surveys, and also covers the deleted check so structural routes need one
   lookup. Metadata/category updates (`PUT /api/surveys/:id`) and status
   changes stay allowed by design. The now-dead inline draft checks and the
   published-only type/scale-range checks were removed
   (`hasScaleRangeChanged` deleted). The builder UI disables structural
   controls on non-draft surveys and the edit-state banners point at
   "Create editable draft copy".
2. API test cleanup missed the new tables: `survey_categories` and
   `tag_definitions` added to the truncate list in
   `apps/api/test/helpers/setup.ts`.
3. The tag catalog duplicate warning only covered create: edit rows in
   `AdminTagsPage.tsx` are now controlled inputs with the same as-you-type
   duplicate warning (excluding the tag being edited) and a disabled save on
   duplicates.

New regression coverage in `apps/api/test/surveyBuilder.test.ts`
("published survey structural lock"): every structural mutation 409s on a
published survey, retired surveys are equally locked, and metadata/category/
status changes still succeed. One existing assertion updated to the new
guard message.

Validation rerun: typecheck, lint, build, `npm test` (150/150 — shared 18,
web 18, API 114), `git diff --check` all passed.

## Phase 10 — Codex Scoped Re-Review Result

Date:
2026-06-11

Codex confirmed the round-1 fixes with no findings: the guard split in
`surveyBuilderRoutes.ts` is correct (structural routes fronted by
`rejectStructurallyLockedSurvey`; metadata/status/delete/duplicate by
`rejectDeletedSurvey`; `POST /api/surveys` has neither since it has no
`:id`), and the simplified PUT-question path is draft-only in practice
because the guard runs before the handler. Codex reran
`npm run test -w apps/api -- test/surveyBuilder.test.ts` (18/18 passed).

Corrections from the re-review note: the handoff/phase-log said "15
structural routes"; the correct count is 14 (4 question + 4 option +
3 tag + 3 rule routes) — both documents fixed. Codex also noted the lock
test sweep does not literally hit every structural endpoint (options
reorder and tag update/delete are covered by source inspection plus the
shared guard rather than dedicated requests); accepted as-is since the
guard is a single shared middleware.

Commit readiness: review complete with no open findings — ready to commit.

## Phase 10 — Deployment Workflow Swap and Hosted DB Verification

Date:
2026-06-11

- The Phase 9 `ci.yml` workflow was removed before it ever ran, replaced by
  the Azure-generated deploy workflow `.github/workflows/main_njsda-wa.yml`
  (created from the njsda-wa Web App resource, pulled from origin/main).
  That workflow builds on push to `main` and deploys to the njsda-wa App
  Service; its test step is commented out, so automated CI checks are
  tracked as a follow-up.
- Verified connectivity to the hosted Azure PostgreSQL server
  (njsda-db.postgres.database.azure.com, PostgreSQL 18.4) using the
  credentials kept in the untracked local `.env`: TLS connection with
  certificate verification succeeded. The check used a read-only query and
  the default `postgres` database; choosing a dedicated application
  database plus migration/provisioning are tracked in FOLLOW_UPS.

## Phase 10 — Hosted DB Configuration via Discrete Variables

Date:
2026-06-11

The Azure Web App is configured with discrete `DB_HOST`/`DB_PORT`/`DB_NAME`/
`DB_USER`/`DB_PASSWORD` settings rather than a `DATABASE_URL` connection
string. Production previously hard-required `HOSTED_DATABASE_URL` or
`DATABASE_URL`; the prod branch in `apps/api/src/config.ts`,
`scripts/migrate-db.mjs`, and `scripts/provision-admin.mjs` now falls back to
building the connection string from the `DB_*` parts (connection strings win
when both forms are set; user/password are URL-encoded automatically, which
also sidesteps manual escaping of special characters). Missing configuration
now produces one clear error naming both options. Documented in
`.env.example` and `database/README.md`.

Verified by importing the built config in an Azure-like environment (no
`.env` file, `RUN_ENV=prod`, only `DB_*` + `JWT_SECRET`): the URL resolves
to the provided host/database with encoded credentials. Full validation
gate rerun: typecheck, lint, build, 150/150 tests, `git diff --check`.

## Phase 10 — Testing Pass Round 2: Tag Catalog Backfill, Category Drill-In, Conditional Skip Rules

Date:
2026-06-12

Received issue list (3 items, from prompts/prompt_10.txt):
1. Seeded tags not editable/accessible in the tag catalog (classified: bug).
2. Survey groups displayed as drillable cards on the dashboard; ungrouped
   surveys keep their plain card presentation (classified: UX feature).
3. A second conditional-logic option that skips one or more questions based
   on the answer provided, alongside existing jump rules (classified:
   feature; participant-facing navigation + additive API contract).

Intake finding: the "total CRUD" portion of issue 1 was already implemented
in the earlier Phase 10 commit (routes/tags.ts, AdminTagsPage edit/delete,
tagCatalog.test.ts). The remaining defect was that seed SQL bypasses the
API's registerTagDefinition(), so seeded answer tags never reached
tag_definitions and the catalog listed zero entries.

Fixes implemented:
- Issue 1: migration 0009_tag_definitions_backfill.sql re-runs the
  idempotent catalog backfill; the seed file now registers its own tags.
- Issue 2: dashboard shows one category group card per category (name,
  completed-of-total, survey count) ahead of ungrouped survey cards in a
  single paginated grid; clicking drills into the new protected route
  /dashboard/category/:categoryId with breadcrumb back-navigation. Pure
  grouping logic extracted to pages/dashboardGrouping.ts with unit tests;
  shared SurveySummaryCard/PaginationRow components and a useMySurveys hook
  replace the previous inline markup. The category filter-chip row was
  removed (replaced by the group cards).
- Issue 3: implemented as answer-conditional skip rules reusing the
  HIDE_QUESTION action type already allowed by the schema — one rule row per
  (source answer, skipped question); the admin UI multi-selects questions
  and fans out one rule per choice. Shared engine: resolveNextQuestion gains
  an optional hiddenQuestionIds set (static normal-flow skip set is now
  JUMP-only; hidden jump targets fall through to the next visible question);
  resolveAttemptPath activates skip rules incrementally along the walked
  path, so stale off-path answers hide nothing and backward hides are
  impossible. API: validation accepts both action types and forces
  skipTargetInNormalFlow=false for skips; rule routes parameterize
  action_type; publish validation treats HIDE_QUESTION as supported;
  reporting's collectFinalPathQuestionIds now delegates to
  resolveAttemptPath so report path semantics cannot diverge from the
  runtime. Flow map renders skip edges with a new legend entry and a
  duplicate_skip_rule informational issue; skip edges do not create
  reachability. Migration 0010 extends the target-required check constraint
  to HIDE_QUESTION rows.

Assumptions (documented per intake rules): route-based drill-in and
one-rule-row-per-skipped-question were confirmed with the developer before
implementation; skipped questions report as not_reached / off final path,
matching the existing jump-bypass presentation; rule-skipped required
questions do not block completion (they are off the navigation path).

Tests: 179 passing — shared 27 (skip-set semantics, hidden-set advance,
hidden jump-target fall-through, incremental path activation, stale-answer
isolation), web 28 (dashboard grouping; flow-graph skip support, redundant
duplicate detection, reachability), api 124 (skip rule CRUD + forced flag,
JUMP<->HIDE conversion, unsupported action rejection, attempt navigation
with skips, completion with rule-hidden required questions, trigger-change
restoration, reporting states for skipped and answered-then-hidden
questions).

Validation gate: npm run typecheck, lint, build, test (27 + 28 + 124), and
git diff --check all pass.

Commit readiness: implementation complete; pending Claude review per the
phase role arrangement.

## Experiment Branch — Dark Mode, Dashboard Search, Results Funnel

Date:
2026-06-12

Branch: experiment/dark-mode-and-extras (not merged to main; developer
review pending). Scope: developer-requested dark mode toggle plus two
small presentation-only features. No API, schema, or auth changes —
consistent with the architecture principles (simplicity, no speculative
backend complexity).

- Dark mode: every color literal in apps/web/src/styles.css now resolves
  through ~40 semantic tokens in :root (the third token family alongside
  the spacing and type scales), with a dark palette under
  [data-theme="dark"], a new --on-brand token for text on brand
  backgrounds, and color-scheme switching for native controls. Theme
  defaults to the OS preference, is applied pre-paint by an inline
  script in index.html, persists to localStorage, and toggles from a
  header button (components/ThemeToggle.tsx).
- Dashboard search: client-side filter over title/description/category
  in pages/dashboardGrouping.ts (unit-tested), wired into UserDashboard
  with pagination reset and a no-match state.
- Results funnel: "Answers per question" rows render a bar scaled to the
  most-answered question, visualizing drop-off from existing report data.
- Deliberately deferred (would change the API contract): per-option
  answer distribution in the report payload — recorded in FOLLOW_UPS.

Validation: typecheck, lint, build, 27 + 31 + 124 = 182 tests,
git diff --check — all green on the branch.

## Feature Branch — Templates, Resume Nudge, Reporting Upgrade

Date:
2026-06-12

Branch: feature/templates-and-reporting (stacked on
experiment/dark-mode-and-extras; neither merged to main yet). Developer
selected this slate; public/anonymous links and email notifications were
parked under "Future Features" in FOLLOW_UPS.md.

- Survey templates: implemented as duplicate-anywhere — every admin
  overview row gains a Duplicate action and the workspace duplicate
  button now shows for drafts, so any survey (a draft kept as a
  template, or a live survey) can spawn an editable draft copy through
  the existing duplicate API. No schema or API changes.
- Attempt resume nudge: dashboard banner for the most recently touched
  in-progress attempt with one-click resume; frontend-only over existing
  my-surveys data.
- Reporting upgrade (the "meaningful aggregation" item):
  - from/to date-range filter (inclusive YYYY-MM-DD, validated) applied
    consistently to /report, /attempts, and /export.csv;
  - questionStats.optionStats: per-option selection counts rendered as
    distribution bars for selects and scales;
  - tagStats: per-survey hidden-tag rollup (selection count + distinct
    respondent count per tag pair, zero-count pairs included) — the
    first reporting consumer of the hidden-tag system; admin-only, never
    exposed to participants, honoring the Hidden Tag Principle.

API contract changes are additive only (new response fields, new
optional query params). Validation: full gate green — typecheck, lint,
build, 27 shared + 31 web + 128 api tests, git diff --check.

Deferred: cross-survey tag rollup (aggregating one tag key across all
surveys) — noted in FOLLOW_UPS as the natural next reporting step.

## Feature Branch — Logic Rule Grouping and Question Value Tags

Date:
2026-06-12

Branch: feature/templates-and-reporting (continued). Developer-reported
items from the live review of the previous batch.

1. Logic rules now render grouped by source question inside collapsible
   details/summary blocks (rule counts in the bar, survey order, legacy
   orphaned rules last).
2. Skip rules render a spacer in the normal-flow checkbox grid cell so
   Save/Delete sit in the same column as jump rules.
3+4. Question value tags: hidden tags for integer and text questions,
   which previously had no tag vehicle (tags lived only on answer
   options). Developer-confirmed semantics: integer tags carry optional
   inclusive min/max bounds (min-only, max-only, exact, range, or
   unbounded = any answered value); text tags apply to any non-blank
   answer.
   - Migration 0011 adds question_value_tags (FK cascade, range check).
   - Shared: QuestionValueTag type, SurveyQuestion.valueTags (admin-only,
     mirroring answerTags), valueTagMatchesResponse helper shared by
     reporting and attempt-detail so match semantics cannot diverge.
   - API: POST/DELETE value-tag routes (draft-only, admin-only, per-type
     shape validation), catalog auto-registration, duplicate-survey copies
     value tags, participant isolation (valueTags never serialized without
     includeHiddenTags).
   - Reporting: the tag rollup is now a union of option-tag selections and
     value-tag matches with distinct respondent counts; attempt detail and
     CSV include matched value tags per answer.
   - Web: "Hidden tags for answers" section in the question editor for
     text/integer questions (reuses TagFields presets; bounds inputs for
     integer), condition summaries per row, value-tag chips in the
     results attempt detail.

Tests: valueTags.test.ts covers CRUD and per-type validation, publish
locking, duplication, catalog registration, participant isolation
(collectObjectKeys sweep), and reporting integration (rollup, detail,
CSV). Totals: 27 shared + 31 web + 135 api = 193 passing; typecheck,
lint, build, git diff --check green.

## Phase 11 — Page-Based Survey Flow

Date:
2026-06-16

Status:
Implemented; Claude review C1 resolved

Prompt:
`prompts/prompt_11A.txt`

Review Artifacts:
- Codex handoff: `notes/claude_handoff_phase_11A.txt`
- Claude review: `notes/claude_review_phase_11A.txt`

## Goals

- Replace the old one-question-per-page MVP decision with page-based surveys.
- Preserve existing survey behavior by migrating one existing question into one page.
- Add admin page construction, participant page navigation, and page-level jump rules.

## Built

- Added `survey_pages`, `survey_questions.page_id`, page constraints, one-page-per-question backfill, and real `conditional_logic_rules.target_page_id`/`source_page_id` references.
- Added shared `SurveyPage`, `Survey.pages`, `SurveyQuestion.pageId`, `currentPage` response fields, and page-aware path helpers.
- Added page CRUD/reorder endpoints, page-scoped question reorder, question movement, page-aware duplication, and page-aware rule validation.
- Updated the admin Questions workspace to manage page panels and move questions between pages.
- Updated the participant runner to render one page at a time and submit page answers in a batch endpoint.
- Updated conditional logic UI and flow map support for `JUMP_TO_PAGE`.

## Important Decisions

- Existing surveys migrate to one page per existing question; empty surveys receive `Page 1`.
- Page-level logic v1 supports forward-only `JUMP_TO_PAGE`.
- Legacy `Survey.questions`, `currentQuestion`, and `/api/surveys/:id/answer` remain for compatibility.
- Page deletes are draft-only, empty-only, and cannot remove the last page.
- Same-page `JUMP_TO_QUESTION` is a page-navigation no-op because all visible questions on that page render together.

## Validation

Commands run:

```bash
npm run typecheck
npm run build
npm run lint
npm run test -w packages/shared
npm run test -w apps/web
git diff --check
```

Results:

- Passed before Claude review: typecheck, build, lint, shared tests (29), web tests (32), diff check.
- Passed after Claude review fix: typecheck, build, lint, shared tests (37), web tests (32), diff check.
- Passed after manual flow-map fix: typecheck, shared tests (38), web tests (33).
- Passed after seed fix: `npm run db:reset`; local seeds now create one page per seeded question before inserting questions.
- Passed after logic-label clarity fix: typecheck, web tests (33).
- Passed after logic reconciliation fix: typecheck, shared tests (41), web tests (34).
- Blocked: `npm run test -w apps/api` needs local PostgreSQL access and drops/recreates the test schema; sandbox escalation was rejected pending explicit user approval.
- In progress: manual browser pass over the page-based builder/runner.

## Claude Review Notes

Source:

- `notes/claude_review_phase_11A.txt`

Status:

- C1 resolved: same-page `JUMP_TO_QUESTION` no longer creates a page loop.
- Added shared tests for multi-question pages, ordering helpers, `JUMP_TO_PAGE`, page-loop detection, hidden-page skipping, hidden jump targets, and stale answers on hidden questions.
- Also addressed low-risk review suggestions by skipping hidden source questions during page-jump resolution, bypassing page-jump targets with no visible questions, avoiding an unnecessary target-question lookup for `JUMP_TO_PAGE`, and documenting the legacy reorder/page-answer compatibility behavior.
- Remaining non-blocking suggested improvements are tracked as future code-quality/manual-validation work unless product review elevates them.

## Manual Test Notes

- `notes/phase_11A_test_notes.txt` records a flow-map defect found during manual testing.
- Resolved: flow map and shared normal-question advancement now respect page order before page-scoped question order, so duplicate "Question 1" values across pages do not create false unreachable warnings.
- Resolved: admin logic question references now use `P{page}-Q{question}` labels in source/target dropdowns, skip target controls, existing rule editors, and rule group headings.
- Resolved: page navigation rules now evaluate together after the page is submitted; if multiple navigation rules trigger, the farthest valid later visible page wins.
- Resolved: new admin navigation rules default to page jumps, while question jumps remain editable as legacy compatibility rules that land on the containing page.
- Accepted in this pass: participant page skip rule from Page 1 Question 1 to Page 3 Question 1 worked from the user side.

## Follow-Up Tasks

- Run API tests after explicit approval for the destructive local test DB reset.
- Run manual browser validation for page CRUD/reorder, question moves, page runner navigation, and page-jump rules.

## Commit Readiness

- Requirements implemented: Yes
- Codex handoff created: Yes
- Product context still aligned: Yes; `DATA_MODEL_VISION.md` updated for page-based flow.
- Architecture principles still aligned: Yes
- Security review complete: Yes; Claude review found no hidden-tag or authorization regression.
- Review findings addressed or deferred: Yes; C1 fixed, test gap reduced with shared helper coverage, API/manual validation remain tracked.
- Manual testing complete: No; follow-up tracked
- Ready to commit: After API test approval/run and manual browser pass, or with those explicitly accepted as carried follow-ups

---

## Phase 12 — Survey Builder Page Split + Organize Tab

Date:
2026-06-16

Status:
Completed (Codex review done; findings addressed)

Prompt:
`prompts/prompt_12.txt`

Git Commit:
Pending (branch `phase-12-survey-builder-page-split`)

Review Artifacts:
- Implementation handoff (for Codex): `notes/codex_handoff_phase_12.txt`
- Codex review (round 1): `notes/codex_review_phase_12.txt` (completed)
- Round-2 UI-delta handoff (for Codex): `notes/codex_handoff_phase_12_ui.txt`
- Codex review (round 2, UI delta): `notes/codex_review_phase_12_ui.txt` (completed; no new findings)

Role note: roles reversed for this phase — Claude Code implemented, Codex reviews
(precedent: Phases 5.1–8). Source planning note:
`notes/ui_ux_questions_builder_split.txt`.

## Goals

- Bifurcate the overloaded Questions tab at the page level: edit one page at a
  time, selected via a pill rail + "jump to page" dropdown.
- Provide a dedicated, low-clutter "Organize" tab for arranging pages and
  questions via drag-and-drop (reorder pages, reorder questions, move questions
  across pages), plus add/delete pages.

## Built

- PageSwitcher component (pill rail reusing `.workspace-tab` styling + jump
  dropdown) driving a local `activePageId` on the Questions tab.
- SurveyQuestionsPage restructured: renders only the active page's metadata edit
  form, a page-scoped Add-question form (page picker removed), and that page's
  reused `QuestionEditor` list. Removed the Add-page form, per-question
  "Move to page" dropdown, and per-page move/delete buttons (moved to Organize).
- New "Organize" workspace tab: route in `App.tsx`, `WorkspaceTab` in
  `SurveyWorkspaceLayout.tsx`, and `SurveyOrganizePage` with a `@dnd-kit` board
  (sortable page cards + compact sortable question rows) plus the Add-page form.
- New dependency `@dnd-kit/{core,sortable,utilities}`; `jsx-global-shim.d.ts` to
  restore the global `JSX` namespace for @dnd-kit under React 19.
- New CSS section in `styles.css` (page switcher, organize board, compact rows,
  drag handle/overlay) with 767.98px mobile rules.

## Important Decisions

### Frontend-only; reuse existing endpoints

Decision: implement entirely in the web app using the existing
reorderSurveyPages / reorderQuestions / moveQuestionToPage / page CRUD endpoints.

Reason: the Phase 11 page model already exposes everything needed; the request
was UX, not data-model.

Tradeoff: none material; no schema/API/auth surface touched.

### Organize as a separate workspace tab + drag-and-drop

Decision: a new top-level "Organize" tab (not an in-tab mode toggle), with
drag-and-drop reordering via @dnd-kit; the Questions tab keeps its within-page
Up/Down controls.

Reason: developer preference; keeps reordering out of the editing surface.

Tradeoff: adds a dependency and a route/tab; no live cross-container drag preview
(drop-to-commit via DragOverlay) to keep the implementation robust.

## Architecture Notes

- Database/schema impact: none.
- API contract impact: none (existing endpoints only).
- Auth or authorization impact: none; all structural controls remain draft-only
  via `survey.status !== "draft"` gating, now also disabling drag.
- Data privacy or visibility impact: none; the Organize board shows no hidden
  tags; hidden tags stay admin-only on the Questions tab.
- Frontend UX impact: Questions tab is single-page-focused; new Organize tab.
- Environment or deployment impact: new frontend dependency only.

## Validation

Commands run:

```bash
npm run typecheck
npm run lint
npm run build
npm test
git diff --check
```

Results:

- Passed: typecheck, lint, build, all tests (shared 43, web 34, api 148 = 225),
  git diff --check clean. API suite ran against the local Postgres test DB.
- Failed: none.
- Not run: manual browser pass (no browser automation in this environment).

Manual tests:

- Pending — see the checklist in `notes/codex_handoff_phase_12.txt` and the new
  FOLLOW_UPS entry.

Phase closeout artifacts:

- Codex handoff created before final summary: Yes
- Handoff path: `notes/codex_handoff_phase_12.txt`
- Codex review status before commit: Pending

## Codex Review Notes

Source: `notes/codex_review_phase_12.txt` (Claude implemented, Codex reviewed).

Status: Completed. No critical issues. Three findings, all accepted and fixed:

- P2 (race): Organize drag handles stayed active during in-flight mutations, so a
  fast second drag could submit a reorder/move from a stale survey snapshot.
  Fixed by gating the sortable `disabled` state on `isSubmitting` and early-
  returning from `handleDragEnd` when `isSubmitting` (SurveyOrganizePage.tsx).
- P3 (UX acceptance): switching pages did not reset the controlled
  `newQuestionType`, so the scale type/fields could carry to a new page. Fixed
  with an effect resetting it to `"text"` on `activePageId` change
  (SurveyQuestionsPage.tsx).
- P3 (UX acceptance, pre-existing): locked surveys left the question text, help
  text, and required checkbox enabled in `QuestionEditor`. Fixed by passing
  `disabled={isPublished}` to those inputs (SurveyBuilderComponents.tsx),
  matching the other locked controls.

Re-validation after fixes: typecheck, lint, build all pass; tests pass (shared
43, web 34, api 148 = 225); git diff --check clean.

## Post-Review Enhancements (same branch)

After the review, two in-scope improvements were added:

- Extracted the Organize board's drag-end decision logic into a pure,
  dependency-free helper (`apps/web/src/components/admin/organizeDrag.ts`:
  `resolveDragOutcome` / `resolveOverPageId` / `parseEntityId`) and added unit
  coverage (`organizeDrag.test.ts`, 11 cases) for page reorder, same-page
  reorder, cross-page move (1-based displayOrder), empty-page and header drops,
  and no-op guards. `SurveyOrganizePage.handleDragEnd` now just dispatches the
  resolved outcome. Web tests: 34 -> 45.
- The Organize page card "Open in Questions" link now pre-selects that page on
  the Questions tab via router navigation state (`SurveyQuestionsPage` reads
  `location.state.pageId` in its lazy initializer, falling back to the first
  page). URL-based deep-linking remains the deferred follow-up.

Re-validation after enhancements: typecheck, lint, build pass; tests pass
(shared 43, web 45, api 148 = 236); git diff --check clean.

## Manual Test Round 1 (same branch)

Developer manual-test feedback (`notes/phase_12_test_notes.txt`) addressed:

- Organize: long question lists made page reordering unwieldy. Added a per-page
  collapse/expand toggle (chevron) and a board-level "Collapse all / Expand all"
  so pages can be hidden down to their headers for easy reordering. Collapse is a
  view-only concern (works on locked surveys); cross-page drops onto a collapsed
  page still resolve via the card header.
- Questions: the page pills wrapped into a disorganized multi-row block, and the
  "Jump to page" dropdown duplicated them. First reconciled to a single contained
  horizontally scrolling pill bar; when that bar would not scroll reliably (a
  grid-blowout: the single auto column expanded to the pills' max-content), the
  developer opted to replace the pills entirely with a single page dropdown +
  prev/next stepper arrows + an "X of N" indicator. `.builder-workspace` was also
  pinned to `grid-template-columns: minmax(0, 1fr)` as general blowout hygiene.

Re-validation: typecheck, lint, build pass; web tests 45; git diff --check clean.

## Codex Round-2 Review (UI delta)

Source: `notes/codex_review_phase_12_ui.txt`. Status: completed, no new
actionable findings. Codex verified the three round-1 fixes are present and
correct, confirmed `resolveDragOutcome` preserves the prior drag behavior
(1-based displayOrder, empty-page and page-header drops), confirmed the collapse
feature introduces no conditional-hook issue and still accepts drops on collapsed
pages via the header, and confirmed the dropdown stepper bounds and the
router-state page pre-selection fallback. Remaining risk is the manual drag/drop +
responsive browser pass (already tracked as a follow-up).

## Problems Encountered

- Problem: typecheck failed because @types/react v19 dropped the global `JSX`
  namespace that @dnd-kit's type defs reference.
  Resolution: added `apps/web/src/jsx-global-shim.d.ts` re-aliasing global `JSX`
  to `React.JSX`.

## Follow-Up Tasks

- Manual browser + responsive pass (375/768/1280px) on the Questions and
  Organize tabs, including keyboard drag and read-only behavior.
- Optional: URL deep-linking of the active page / pre-select page from the
  Organize "Open in Questions" link.
- Optional: optimistic/local reorder for snappier drag persistence and a live
  cross-page drag preview.

## Commit Readiness

- Requirements implemented: Yes
- Codex handoff created: Yes
- Product context still aligned: Yes
- Architecture principles still aligned: Yes
- Security review complete: Yes; Codex review found no auth/data-model/hidden-tag
  regression (no critical issues).
- Review findings addressed or deferred: Yes; all three round-1 Codex findings
  (P2, P3, P3) fixed and re-validated. Round-2 Codex review of the UI delta found
  no new actionable issues.
- Manual testing complete: No; full browser/responsive/keyboard-drag pass tracked
  as a follow-up (developer has manually exercised the page switcher and Organize
  collapse).
- Ready to commit: Yes, pending the manual browser pass or its explicit acceptance
  as a carried follow-up.

---

# Phase 14 — Prune Off-Path Answers At Runtime

Date:
2026-06-17

Status:
Completed (pending Codex review and manual browser pass)

Prompt:
None — driven by the `notes/phase_12_test_notes.txt` edge case ("Engineering
answers recorded even though they were not relevant to the respondent"). Roles
reversed: Claude implemented, Codex reviews.

Git Commit:
Pending

Review Artifacts:
- Codex handoff: `notes/codex_handoff_phase_14.txt`
- Codex review: `notes/codex_review_phase_14.txt` (completed — no blocking findings)

## Codex Review Outcome

Codex review: no blocking findings. One Low finding — stale comments plus
`onFinalPath` page-flow drift (the kept safety net still used the question-level
`resolveAttemptPath`, which does not model page jumps, so admin attempt detail
could mark a never-reached page-branch question as `onFinalPath: true`).

Fixes applied (this session):
- Migrated `collectFinalPathQuestionIds`
  (`apps/api/src/services/surveyReporting.ts`) onto `resolveProgressivePageState`
  so the `onFinalPath` safety net matches the participant runtime for page-jump
  surveys. Added an admin-detail assertion to the page-based repro test
  (EngineeringQ -> `state: not_reached`, `onFinalPath: false`).
- Updated the two misleading comments (`packages/shared/src/index.ts`
  `onFinalPath` doc; the `collectFinalPathQuestionIds` doc) and the obsolete
  FOLLOW_UPS migration item.

Re-validated after fixes: `npm run typecheck`, `npm run lint`, `npm test`
(16 files / 151 tests) all green.

## Goals

- Stop storing answers from a survey branch the respondent abandons by changing
  an earlier branching/jump answer (or by flipping a skip trigger).
- Make stored answers match what the respondent actually answered on their final
  path, so the attempt detail and the aggregate report stop counting off-path
  data.
- Cover the fix with tests before any commit, since it deletes respondent data.

## Built

- `pruneOffPathAnswers(queryable, survey, attemptId)` in
  `apps/api/src/services/surveyAttempts.ts`: recomputes the revealed-question set
  via `resolveProgressivePageState` (the page runtime's own resolver) and deletes
  every `survey_response_answers` row whose question is not revealed.
  `survey_response_selected_options` rows cascade. Skips pruning when the path
  loops or the keep-set is empty.
- `fetchAttemptResponses(queryable, attemptId)`: transaction-scoped loader so the
  prune observes the just-saved rows (and hydrates selected options, which jump
  rules depend on).
- Call sites inside the existing transactions: the single-answer route
  (`POST /:id/answer`, which now also fetches the survey structure) and the page
  route (`POST /:id/pages/:pageId/answer`, once per request after
  `savePageAnswers`).
- Tests: rewrote the two reporting "kept as history" cases to assert the off-path
  answer is now deleted (`state: not_reached`, null text); added an aggregate
  non-inflation test; added a page-based repro test (Engineering → answer →
  switch to Sales) asserting the Engineering answer rows are gone.
- Docs: recorded the reversal of the Phase 8 keep-history decision in
  `markdown/FOLLOW_UPS.md` (with the deferred-backfill and onFinalPath follow-ups).

## Important Decisions

### Reverse the Phase 8 "keep history" decision

Decision: Prune off-path answers at save time rather than keeping them and
flagging them "not on final path".

Reason: Keeping them stored let in-progress and completed off-path answers inflate
the aggregate report counts and hidden-tag rollups (no final-path filter in
`surveyReporting.ts`), and contradicted the respondent's actual path. Pruning the
rows fixes the aggregate leak with no SQL change.

Tradeoff: Irreversibly deletes respondent data; re-entering an abandoned branch
shows it empty (the respondent re-answers). Both confirmed acceptable with the
developer.

### Keep-set source: resolveProgressivePageState

Decision: Build the keep-set from `resolveProgressivePageState`'s
`visibleQuestionIdsByPageId`, not the question-level `resolveAttemptPath`.

Reason: The participant runtime is page-based. `resolveAttemptPath` does not
reroute on `JUMP_TO_PAGE` the way the page runtime does (verified: the page-based
repro test failed when pruning off `resolveAttemptPath`, passed off
`resolveProgressivePageState`). Using the runtime's own resolver guarantees the
prune can never diverge from what the respondent was shown.

Tradeoff: None material; `resolveProgressivePageState` already handles
`JUMP_TO_QUESTION`, `JUMP_TO_PAGE`, and `HIDE_QUESTION`.

### Scope = all off-path; runtime-only; keep onFinalPath

Decisions (with the developer): prune ALL off-path answers (jump-abandoned and
`HIDE_QUESTION`-hidden alike); fix the runtime only with NO backfill of existing
rows; keep the `onFinalPath` flag and "Not on final path" badge as a safety net.

## Architecture Notes

- Database/schema impact: none (no migration). Relies on the existing
  `on delete cascade` from `survey_response_selected_options`.
- API contract impact: none; response shapes unchanged.
- Auth or authorization impact: none.
- Data privacy or visibility impact: deletes off-path respondent answers at save
  time. Aggregate report counts and hidden-tag rollups now exclude off-path data
  because the rows no longer exist.
- Frontend UX impact: none directly; admin Results detail now shows pruned
  questions as `not_reached` instead of "answered / Not on final path".
- Environment or deployment impact: none.

## Validation

Commands run:

```bash
npm run typecheck
npm run lint
npm test
```

Results:

- Passed: typecheck, lint, full suite (shared + web + api = 151 api/web/shared
  tests, 16 files, all green).
- Failed: none (an intermediate page-based test failure exposed the
  resolveAttemptPath/JUMP_TO_PAGE divergence and was fixed by switching to
  resolveProgressivePageState).
- Not run: none.

Manual tests:

- Done (developer, 2026-06-17): took the repro survey, branched to Engineering,
  answered, went Previous, switched to Sales, completed; behavior verified as
  working. Accepted.

Phase closeout artifacts:

- Codex handoff created before final implementation summary: Yes
- Handoff path: `notes/codex_handoff_phase_14.txt`
- Codex review status before commit: Completed (no blocking findings; Low finding
  fixed — see Codex Review Outcome above)

## Problems Encountered

- Problem: the first keep-set source (`resolveAttemptPath`) left the Engineering
  answer in place because the question-level walker does not reroute on
  `JUMP_TO_PAGE`.
  Resolution: switched `pruneOffPathAnswers` to `resolveProgressivePageState`'s
  `visibleQuestionIdsByPageId`, the resolver the page runtime itself uses.

## Follow-Up Tasks

- Decide whether to backfill/prune off-path rows already stored before this phase
  (chosen runtime-only for now).
- Revisit whether the `onFinalPath` machinery / badge can be simplified once the
  safety net proves unnecessary.
- Manual browser pass on the repro survey (above).

## Commit Readiness

- Requirements implemented: Yes
- Codex handoff created: Yes
- Product context still aligned: Yes
- Architecture principles still aligned: Yes (reuses the canonical runtime
  resolver; no new schema, API, or auth surface)
- Security review complete: Yes; Codex review found no auth/data-exposure
  regression. Change is server-side and runs inside the existing answer-save
  transaction.
- Review findings addressed or deferred: Yes; the single Low finding (stale
  comments + `onFinalPath` resolver drift) was fixed this session. Backfill and
  badge-simplification carried as explicit follow-ups.
- Manual testing complete: Yes; developer verified the repro survey works (above).
- Ready to commit: Yes, at the developer's discretion.

---

# Phase 15 — Skip Page Conditional Logic

Date:
2026-06-17

Status:
Completed (manual browser pass green; ready to commit)

Prompt:
`prompts/prompt_15.txt`

Git Commit:
Pending

Review Artifacts:
- Codex handoff: `notes/codex_handoff_phase_15.txt`
- Codex review: `notes/codex_review_phase_15.txt` (completed — one Low/Medium
  finding, fixed this session)

## Codex Review Outcome

Codex review: no blocking findings. One Low/Medium — the flow map flagged a valid
`HIDE_PAGE` rule whose target page is empty as `missing_target_question` ("survey
would end at the source"), even though an empty target page is an accepted no-op.

Fix applied (this session), web-only (`surveyFlowGraph.ts` + `SurveyFlowMap.tsx`):
an existing-but-empty `HIDE_PAGE` target is now a valid no-op (no
`missing_target_question`); forward-only is enforced by page display order, and
the outgoing edge reads "skip the target page." Added two flow-map tests;
`JUMP_TO_PAGE` behavior unchanged. Re-validated: `npm run typecheck`,
`npm run lint` green; web tests 52 passed; `git diff --check` clean
(API/shared/migration untouched).

## Goals

- Add a "Skip page" option to the Logic page that skips an entire later page
  conditional on a source question's answer — the page-level analogue of the
  existing "Skip questions" (HIDE_QUESTION) action.
- Match Skip questions on source parity (selection `equals` + text `is_blank`)
  and behave dynamically (hide whatever questions are on the target page at
  evaluation time).
- Cover the new behavior with tests before commit.

## Built

- New action type `HIDE_PAGE` (target page set, no target question,
  `skip_target_in_normal_flow` forced off), mirroring `JUMP_TO_PAGE` vs
  `JUMP_TO_QUESTION`.
- `database/migrations/0014_hide_page_action_type.sql`: extends the action-type
  IN-list and the target-shape check so `HIDE_PAGE` joins `JUMP_TO_PAGE` in the
  page-target branch.
- Runtime: single change in `packages/shared/src/index.ts`
  `collectActivatedHiddenQuestionIds` — a matching `HIDE_PAGE` rule expands to
  every question on the target page and feeds the existing
  `activeHiddenQuestionIds` set. Page-skip, reporting (`collectFinalPathQuestionIds`),
  and `pruneOffPathAnswers` all reuse that set, so they needed no change.
- API: `validation.ts` and `surveyBuilder.ts` (reference checks + invalid-rule
  detector SQL) accept `HIDE_PAGE` (target page after source page; blank-text
  allowed; flag forced off). Route SQL unchanged.
- Logic-page UI: "Skip page" action with a multi-select "Pages to skip" (one
  `HIDE_PAGE` rule per page), editable in the rule list, and recognized/described
  by the flow map.
- Tests: shared runtime (page hidden / not hidden), API validation (accept +
  two rejects), and an end-to-end progressive-runner page-skip test; `addRule`
  factory union extended.

## Important Decisions

### First-class HIDE_PAGE action vs. expanding to HIDE_QUESTION rows

Decision: Add a dedicated `HIDE_PAGE` action type rather than creating N
`HIDE_QUESTION` rules at save time.

Reason: Keeps the rule a single editable row, and is dynamic — questions added
to the target page later are skipped automatically because expansion happens at
evaluation time.

Tradeoff: One new action type to thread through validation, the flow map, and the
schema constraint; offset by reusing the entire hidden-question runtime so no new
page-skip/reporting/pruning code was needed.

### Reduce page-hide to question-hide at runtime

Decision: Represent a hidden page as "all its questions hidden" via the existing
`activeHiddenQuestionIds` set instead of adding a parallel hidden-page set.

Reason: The page walker, both path resolvers, reporting, and off-path pruning
already key off hidden question ids, so the feature rides on proven machinery.

Tradeoff: An empty target page contributes no hidden ids (acceptable — an empty
page renders nothing and is already skipped in normal flow).

## Architecture Notes

- Database/schema impact: new migration `0014`; two constraints recreated; no new
  columns (reuses `target_page_id`).
- API contract impact: `actionType` now accepts `HIDE_PAGE`; error copy for
  allowed-types and blank-text rules updated.
- Auth or authorization impact: none.
- Data privacy or visibility impact: none (skipped-page answers are pruned/marked
  `not_reached` by the existing pipeline).
- Frontend UX impact: "Skip page" action on the Logic page (create + edit) and a
  flow-map description.
- Environment or deployment impact: run migration `0014` on deploy.

## Validation

Commands run:
```bash
npm run typecheck
npm run lint
npm run test
```

Results:
- Passed: typecheck, lint; shared 45, web 50, api 155 (16 files). Migration
  `0014` applied by the API test globalSetup.
- Failed: none.
- Not run: `git diff --check` (run before commit); manual browser pass.

Manual tests:
- Pending developer browser pass: create/edit a Skip page rule (selection + blank
  source); respondent trigger vs non-trigger answer.

Phase closeout artifacts:
- Codex handoff created: Yes — `notes/codex_handoff_phase_15.txt` (base) +
  `notes/codex_handoff_phase_15_advance.txt` (advance-on-trigger lever)
- Codex review status: Completed for both — base review found one Low/Medium
  finding (empty-page HIDE_PAGE flow-map false error), fixed this session; the
  advance-on-trigger follow-up review found no findings

## Advance-On-Trigger Lever (same-session follow-up)

Developer feedback after testing: a `HIDE_PAGE` skip only takes effect once the
trigger question's whole page is finished. Added an admin-controlled per-rule
lever so the skip can instead fire the moment the trigger answer is submitted.

- New boolean `advance_on_trigger` (`HIDE_PAGE` only; forced off elsewhere) via
  `database/migrations/0015_hide_page_advance_on_trigger.sql`. Default false keeps
  the "finish the page, then skip" behavior.
- Runtime: `hasActivatedAdvancingPageSkip` + a branch in
  `resolveProgressivePageState` that, when the trigger fires an advancing rule,
  stops revealing the current page and advances to `getNextVisiblePage` (skipping
  the just-hidden target page) — reusing the immediate-navigation path jumps use.
  Remaining same-page questions become off-path and are pruned, like a jump.
- Threaded through persistence (records/structure/duplication/routes), validation
  (forced off unless `HIDE_PAGE`), the web client, and the rule builder/editor as
  an "Advance immediately when triggered" checkbox; flow map annotates it.
- Tests: shared advance-vs-finish-page, API force-off + e2e (AfterRoute never
  revealed, lands on Final). Re-validated green (shared 47, web 52, api 157;
  migrations 0014 + 0015 applied by the API test setup).
- Codex review (`notes/codex_handoff_phase_15_advance.txt` →
  `notes/codex_review_phase_15_advance.txt`): **no findings**. Confirmed jump wins
  before the advance branch, OR-across-rules is intended, `resolveAttemptPath`
  left unchanged is acceptable, and persistence is complete. Residual risk: manual
  browser pass of the checkbox still pending.

## Follow-Up Tasks

- Consider whether the flow map should annotate every question on a skipped page
  (currently the incoming "Skipped by" note attaches to the page's first question
  only).

## Commit Readiness

- Requirements implemented: Yes
- Codex handoff created: Yes
- Product context still aligned: Yes
- Architecture principles still aligned: Yes (reuses the canonical hidden-question
  runtime; minimal new surface)
- Security review complete: Yes — Codex review found no auth/visibility surface
  change
- Review findings addressed or deferred: Yes — the single Low/Medium flow-map
  finding was fixed this session; the advance-on-trigger review had no findings
- Manual testing complete: Yes — developer browser pass of Skip page (selection +
  blank-text sources, the advance-on-trigger lever, and respondent flow) looks
  good
- Ready to commit: Yes — all gates green (tests, both Codex reviews, manual pass);
  commit at the developer's discretion

---

# Phase 16 — Email Client Foundation

Date:
2026-06-22

Status:
Completed; ready to commit

Prompt:
`prompts/prompt_16.txt`

Git Commit:
Pending

Review Artifacts:
- Codex handoff: `notes/claude_handoff_phase_16.txt`
- Claude review: `notes/claude_review_phase_16.txt` (completed — no critical
  issues; optional coverage/comment suggestions fixed)

## Goals

- Add the minimum provider-agnostic email foundation needed for future password
  reset and anonymous survey invitation phases.
- Keep local and production behavior safe while provider credentials are not
  available.
- Avoid implementing any user-facing password reset, anonymous survey, assignment,
  notification, or receipt workflow.

## Built

- Added email configuration parsing in `apps/api/src/config.ts`.
- Added `EMAIL_ENABLED`, `EMAIL_PROVIDER`, `EMAIL_FROM_ADDRESS`, and
  `EMAIL_REPLY_TO_ADDRESS` placeholders to `.env.example` and `.env.prod.example`.
- Added `apps/api/src/services/email.ts` with:
  - typed `password_reset` and `anonymous_survey_invite` message payloads
  - provider-agnostic `EmailClient`
  - disabled adapter
  - development no-op adapter
  - default `emailClient` built from API config
- Added focused tests in `apps/api/test/email.test.ts` for disabled defaults,
  explicit no-op configuration, invalid config guard branches, production
  guardrails, client adapter mismatch behavior, and logging safety.
- Pinned API test setup to `EMAIL_ENABLED=false` / `EMAIL_PROVIDER=disabled` so
  local private `.env` files cannot make unrelated tests depend on email settings.
- Updated `markdown/GLOBAL_DEVELOPMENT_ENVIRONMENT.txt` and `markdown/FOLLOW_UPS.md`.

## Important Decisions

### Email Disabled By Default

Decision:
`EMAIL_ENABLED=false` and `EMAIL_PROVIDER=disabled` are the documented defaults.

Reason:
The provider and credentials are not approved yet, so local development and
production startup should be safe by default.

Tradeoff:
Future phases must explicitly enable a provider before real mail can send.

### No Production No-Op

Decision:
`EMAIL_ENABLED=true` fails fast in `RUN_ENV=prod` until a real provider adapter is
implemented.

Reason:
A production no-op provider can look like delivery is enabled while silently
dropping password reset or invitation messages.

Tradeoff:
There is no production smoke mode for enabled email yet; disabled production
startup remains supported.

### Sanitized No-Op Logging

Decision:
The no-op adapter logs only provider, template name, and recipient count.

Reason:
Future reset URLs, invite URLs, tokens, recipients, survey titles, and message
bodies can be sensitive.

Tradeoff:
No-op logs are intentionally sparse; tests assert that sensitive message fields
do not appear.

## Architecture Notes

- Database/schema impact: none.
- API contract impact: none; no public routes or response shapes changed.
- Auth or authorization impact: none.
- Data privacy or visibility impact: no real email is sent; logs omit recipients,
  links, tokens, titles, and message bodies.
- Frontend UX impact: none.
- Environment or deployment impact: production must keep email disabled until an
  approved provider adapter and Azure-held credentials are implemented.

## Claude Review Outcome

Source:

- `notes/claude_review_phase_16.txt`

Status:

- Completed; no critical issues.

Optional suggestions fixed after review:

- Added tests for invalid `EMAIL_ENABLED`, invalid `EMAIL_PROVIDER`, disabled
  email with `noop`, enabled email with `disabled`, and
  `createEmailClient({ enabled: true, provider: "disabled" })`.
- Added comments documenting that provider validation must stay in sync with the
  client factory and that Phase 16 message shapes are single-recipient.

Accepted tradeoffs:

- Keep the strict production fail-fast when `EMAIL_ENABLED=true` until a real
  provider adapter exists.
- Keep sparse no-op logging with provider/template/recipient count only.

## Validation

Commands run:

```bash
npm run typecheck
npm run lint
npm run build
npm test
npm run test -w apps/api -- email.test.ts
git diff --check
env PORT=3106 EMAIL_ENABLED=false EMAIL_PROVIDER=disabled node apps/api/dist/server.js
curl -sS http://127.0.0.1:3106/api/health
```

Results:

- Passed: `npm run typecheck`
- Passed: `npm run lint`
- Passed: `npm run build`
- Passed: `npm test` after rerunning with approved local PostgreSQL access
  (shared 47, web 52, API 163 tests across 17 API files).
- Passed after Claude review fixes: focused API email test with approved local
  PostgreSQL access (11 tests).
- Passed: `git diff --check`
- Passed: built API startup with email disabled; `/api/health` returned HTTP 200
  with `status: ok` and `database: connected`.
- Failed in sandbox only: initial `npm test` API global setup could not connect
  to local PostgreSQL (`EPERM 127.0.0.1:5432`); rerun with approval passed.
- Failed in sandbox only: initial API startup could not bind
  `127.0.0.1:3106`; rerun with approval passed.

Manual tests:

- Confirmed the built API starts with `EMAIL_ENABLED=false` and
  `EMAIL_PROVIDER=disabled`.
- Confirmed existing readiness route still works with email config present.
- Reviewed `.env.example` and `.env.prod.example`; values are placeholders only.
- Exercised disabled and no-op adapters through automated tests without sending
  real mail.

Phase closeout artifacts:

- Codex handoff created before final implementation summary: Yes
- Handoff path: `notes/claude_handoff_phase_16.txt`
- Claude review status before commit: Completed; review written to
  `notes/claude_review_phase_16.txt`

## Problems Encountered

- Problem:
  The sandbox blocked local PostgreSQL access during the API test global setup.
  Resolution:
  Reran `npm test` with approved local PostgreSQL access; full suite passed.

- Problem:
  The sandbox blocked binding the manual API startup port.
  Resolution:
  Reran the built API startup command with approval; health check passed.

## Follow-Up Tasks

- Choose the real email provider and credential strategy before enabling delivery.
- Implement password reset and anonymous survey invitation sending in separate
  phases.
- Add provider-specific integration tests once a real adapter is approved.

## Commit Readiness

- Requirements implemented: Yes
- Claude handoff created: Yes
- Product context still aligned: Yes
- Architecture principles still aligned: Yes
- Security review complete: Yes; Claude review found no critical issues and
  confirmed secret handling, production safety, logging safety, and scope control.
- Review findings addressed or deferred: Yes; optional guard-branch tests and
  comments were added after review.
- Manual testing complete: Basic disabled API startup and health check complete.
- Ready to commit: Yes, at the developer's discretion.

---

# Phase 17 — Anonymous Survey Foundation

Date:
2026-06-22

Status:
Completed; ready to commit after manual browser sign-off

Prompt:
`prompts/prompt_17.txt`

Git Commit:
Pending

Review Artifacts:
- Codex handoff: `notes/claude_handoff_phase_17.txt`
- Claude review: `notes/claude_review_phase_17.txt`

## Goals

- Add a safe anonymous survey foundation with tokenized public access.
- Keep anonymous takers separate from logged-in users.
- Reuse the existing participant-safe survey runner, answer validation,
  pruning, completion, and admin reporting paths where practical.
- Avoid email invitations, recipient management, public discovery, or account
  creation for anonymous takers.

## Built

- Added `database/migrations/0016_anonymous_survey_links.sql`.
- Added `anonymous_survey_links` with token lookup key, hashed token secret,
  enabled/disabled state, nullable expiration, creator, and timestamps.
- Added `database/migrations/0017_anonymous_contact_email.sql`.
- Added `database/migrations/0018_anonymous_link_public_token.sql`.
- Added `anonymous_survey_links.public_token` so enabled links created after
  the migration can be revealed and copied again by admins in Setup.
- Added `database/migrations/0019_anonymous_link_public_token_encryption.sql`.
- Added application-layer AES-256-GCM encryption for `public_token`, with
  plaintext legacy-token read support.
- Added `database/migrations/0020_anonymous_rate_limits.sql`.
- Replaced the anonymous public-route in-memory rate-limit store with a
  PostgreSQL-backed store shared across API instances.
- Added nullable `survey_attempts.user_id`, `anonymous_link_id`, and
  `anonymous_access_token_hash`, with an owner check requiring either registered
  user ownership or anonymous link ownership.
- Added nullable `survey_attempts.anonymous_contact_email` for optional
  post-completion anonymous follow-up contact capture.
- Added anonymous token helpers using high-entropy URL-safe random tokens,
  hashed secrets, and dot separators.
- Added admin anonymous-link APIs under `/api/surveys/:id/anonymous-links`.
- Added public anonymous survey APIs under `/api/anonymous-surveys/:token`.
- Added IP-based throttling for the public anonymous survey router, with
  `ANONYMOUS_SURVEY_RATE_LIMIT_WINDOW_MS` and
  `ANONYMOUS_SURVEY_RATE_LIMIT_MAX` environment controls.
- Public anonymous APIs return participant-safe survey structures only
  (`includeHiddenTags: false`) and require a per-attempt anonymous token for
  answer/complete writes.
- Masked anonymous survey token values in API request logs.
- Added a global `Referrer-Policy: no-referrer` header so anonymous tokens in
  SPA paths are not leaked as referrers.
- Changed link-secret hash verification to use constant-time comparison.
- Made hard-deleting anonymous links explicitly cascade to their anonymous
  attempts, matching the existing hard-delete survey cascade behavior.
- Mapped mid-flow anonymous survey unavailability to the same safe 404 response
  instead of generic 500s.
- Updated admin reporting and CSV export to represent anonymous attempts as
  anonymous participants rather than synthetic users.
- Added admin Setup controls to create with expiration presets, copy-on-create,
  reveal/copy enabled links from the list, rotate enabled links, show
  expiration, show row-level copied feedback, disable anonymous links, and keep
  disabled links in a collapsed management section for published surveys.
- Added `/anonymous-surveys/:token` frontend route that reuses the participant
  runner without requiring authentication.
- Added an optional anonymous completion modal that can save a
  respondent-provided follow-up email after submission.
- Exposed saved anonymous follow-up emails in admin Results and CSV exports,
  labelled as unverified follow-up addresses rather than account emails. CSV
  includes `participant_email_status` for this distinction.
- Added focused API tests for admin-only link management, unavailable tokens,
  anonymous lifecycle, hidden-tag isolation, anonymous/user ownership separation,
  follow-up email capture, and reporting representation.
- Updated `markdown/DATA_MODEL_VISION.md` and `markdown/FOLLOW_UPS.md`.

## Important Decisions

### Hashed Link Secret And Admin Repeat Copy

Decision:
Anonymous link URLs are generated as a public lookup key plus a high-entropy
secret. The database stores the lookup key and a hash of the secret for
validation. Links created after migration `0018` also store `public_token` so
admins can reveal and copy enabled public links again from Setup. New writes
encrypt `public_token` with application-layer AES-256-GCM.

Reason:
Admins need to recover already-distributed links. The hash remains useful for
lookup/verification, while encrypted `public_token` restores repeat-copy UX for
enabled links without storing new tokens as plaintext.

Tradeoff:
Anyone with raw database or backup read access still cannot use encrypted
`public_token` without the application secret. If that secret changes, existing
links continue to validate through their hash but cannot be revealed for repeat
copy; admins can rotate affected links.

### Per-Attempt Anonymous Access Token

Decision:
Starting an anonymous survey creates an attempt-specific high-entropy token,
stored only as a hash and required for answer/complete calls.

Reason:
The public link authorizes starting a survey, but attempt writes need a separate
ownership credential so knowing or guessing an attempt id is not enough to edit
responses.

Tradeoff:
There is no anonymous resume-after-refresh flow yet; a browser refresh starts a
new anonymous attempt. Durable anonymous resume can be added later if required.

### Disabled Or Expired Links Stop Writes

Decision:
Every public anonymous read/write revalidates the link token, enabled state,
expiration, survey status, and soft-delete state.

Reason:
Disabling or expiring a link should make that token unavailable promptly,
including in-progress anonymous attempts.

Tradeoff:
An anonymous taker in progress may be blocked if an admin disables the link
before completion. This matches the Phase 17 safety expectation.

## Architecture Notes

- Database/schema impact: migrations `0016`, `0017`, `0018`, `0019`, and
  `0020`; attempt ownership can now be registered or anonymous, anonymous
  attempts may carry a nullable follow-up email after completion, newly created
  anonymous links retain an encrypted admin-copyable public token, and anonymous
  public-route rate limits are stored in PostgreSQL.
- API contract impact: new admin anonymous-link endpoints, public anonymous
  survey endpoints, and an anonymous post-completion contact-email endpoint;
  existing authenticated survey APIs continue to require auth.
- Auth or authorization impact: admin link management remains auth+admin-only;
  public routes do not set cookies and require token validation.
- Data privacy or visibility impact: hidden tags remain excluded from anonymous
  participant responses; admin reports still include hidden tags. Request logs
  mask anonymous token path segments.
- Frontend UX impact: Setup tab has anonymous-link controls; public route reuses
  the existing survey runner and shows an optional contact modal after anonymous
  completion.
- Environment or deployment impact: run migrations `0016`, `0017`, `0018`,
  `0019`, and `0020` on deploy. Public URLs are generated from `WEB_ORIGIN`.
  Tune anonymous public-route rate-limit settings in Azure before sharing links
  broadly. `ANONYMOUS_LINK_TOKEN_ENCRYPTION_SECRET` can be set to decouple link
  token encryption from `JWT_SECRET`.

## Claude Review Outcome

Source:

- `notes/claude_review_phase_17.txt`

Status:

- Completed; no critical issues.

Confirmed safe:

- Auth boundaries, hidden-tag isolation, token entropy/storage, request-log
  masking, anonymous ownership checks, reporting representation, and non-goal
  discipline.

Post-review fixes applied:

- Added public anonymous endpoint rate limiting.
- Added `Referrer-Policy: no-referrer`.
- Switched token-secret hash comparison to `crypto.timingSafeEqual`.
- Made `anonymous_link_id` hard-delete behavior explicit with `on delete cascade`.
- Mapped mid-flow unavailable anonymous surveys to safe 404 responses.
- Documented anonymous rate-limit environment variables in `.env.example`,
  `.env.prod.example`, and `GLOBAL_DEVELOPMENT_ENVIRONMENT.txt`.
- Documented the encrypted `public_token` repeat-copy decision in
  `markdown/DATA_MODEL_VISION.md` and this phase log.
- Replaced plaintext `public_token` writes with encrypted writes, retaining
  support for older plaintext rows.
- Replaced the anonymous public-route in-memory rate-limit store with a
  PostgreSQL-backed shared store.
- Softened the anonymous follow-up email modal copy so it does not promise
  automated survey result emails.
- Labelled anonymous follow-up emails as unverified in admin Results and CSV.

Accepted tradeoffs:

- Anonymous attempts do not resume after refresh because the attempt token stays
  in React state only.
- Disabling or expiring a link blocks in-progress anonymous writes.
- Enabled anonymous links created after migration `0018` can be revealed/copied
  by admins because `public_token` is stored; new writes are encrypted after
  migration `0019`.
- Links created before migration `0018` cannot be reconstructed from their
  existing hashes; admins can create replacement links if needed.

## Validation

Commands run:

```bash
npm run typecheck
npm run lint
npm run build
npm run test -w apps/api -- test/anonymousSurvey.test.ts
npm test
git diff --check
```

Results:

- Passed: `npm run typecheck`
- Passed: `npm run lint`
- Passed: `npm run build` (Vite emitted the existing large chunk warning)
- Passed with approved local PostgreSQL access:
  `npm run test -w apps/api -- test/anonymousSurvey.test.ts` (4 tests)
- Passed with approved local PostgreSQL access: `npm test` (shared 47, web 52,
  API 172 tests across 18 API files)
- Passed: `git diff --check`

Manual tests:

- Pending browser pass: admin creates/copies/disables a link; anonymous visitor
  completes in a fresh browser; disabled/bad link shows unavailable state; admin
  Results labels anonymous attempts.

Phase closeout artifacts:

- Codex handoff created before final implementation summary: Yes
- Handoff path: `notes/claude_handoff_phase_17.txt`
- Claude review status before commit: Completed; review written to
  `notes/claude_review_phase_17.txt`

## Problems Encountered

- Problem:
  Initial token parsing used underscores as separators, but URL-safe base64 can
  contain underscores.
  Resolution:
  Switched link and attempt tokens to dot-separated segments.

- Problem:
  API tests need local PostgreSQL and were blocked in the sandbox.
  Resolution:
  Reran the focused API test with approved local PostgreSQL access.

- Problem:
  Claude review identified several non-blocking hardening items around public
  endpoint throttling, referrer leakage, token comparison style, FK hard-delete
  behavior, and rare mid-flow survey unavailability.
  Resolution:
  Addressed those items in the post-review fix pass and reran validation.

## Follow-Up Tasks

- Decide whether anonymous attempts should support browser refresh/resume via
  session storage or another anonymous session mechanism.
- Future invitation/email phases may send anonymous links after a real email
  provider is selected; recipient lists and invitation workflows remain out of
  scope.

## Commit Readiness

- Requirements implemented: Yes
- Claude handoff created: Yes
- Product context still aligned: Yes; `DATA_MODEL_VISION.md` updated to replace
  the old "no anonymous completion" answer.
- Architecture principles still aligned: Yes
- Security review complete: Yes; Claude review found no blocking issues and the
  non-blocking hardening suggestions were fixed.
- Review findings addressed or deferred: Yes
- Manual testing complete: Pending browser pass
- Ready to commit: Yes after the recommended manual browser pass, at the
  developer's discretion

---

## Phase 18 — Password Reset Foundation

Date:
2026-06-22

Status:
Completed; ready to commit with follow-ups

Prompt:
`prompts/prompt_18.txt`

Git Commit:
Pending

Review Artifacts:
- Codex handoff: `notes/claude_handoff_phase_18.txt`
- Claude review: `notes/claude_review_phase_18.txt`

## Goals

- Build secure password reset foundation from the login screen and a logged-in
  settings context.
- Store reset tokens as one-time, hash-only credentials with expiry and
  consumption tracking.
- Reuse the Phase 16 email abstraction and Phase 17 public lookup-key plus
  hashed-secret lessons.

## Built

- Added `password_reset_tokens` migration with user association, public lookup
  key, hashed secret, expiry, consumed timestamp, and timestamps.
- Added password reset service for `prt.lookup.secret` token generation,
  SHA-256 secret hashing, timing-safe comparison, reset URL generation from
  `WEB_ORIGIN`, Phase 16 email dispatch, and transactional completion.
- Added public reset request and completion endpoints:
  `POST /api/auth/password-reset/request` and
  `POST /api/auth/password-reset/complete`.
- Added authenticated reset initiation endpoint:
  `POST /api/auth/me/password-reset/request`.
- Centralized password validation so registration and reset completion use the
  same minimum length and bcrypt 72-byte maximum.
- Added reset request and completion rate limiting using the existing auth
  in-memory limiter pattern.
- Public reset requests now return the generic response immediately and queue
  reset creation/email dispatch after response, preventing downstream email
  failures from becoming existing-email-only 500s.
- The local no-op email adapter logs password reset links only outside
  production so the full link flow can be manually tested without real email.
- Added login "Forgot password?" flow, `/forgot-password`, `/reset-password`,
  and a minimal protected `/settings` account page for logged-in reset
  initiation.
- The reset page clears the URL hash after reading the token so the secret does
  not linger visibly in the address bar.
- Added focused API tests for enumeration resistance, token storage, email
  payload dispatch, single-use reset, old-password rejection, expired/malformed
  token failures, auth requirement, request and completion rate limiting, and no
  unexpected cookies.
- Updated `markdown/GLOBAL_DEVELOPMENT_ENVIRONMENT.txt` to document that
  `WEB_ORIGIN` is used for password reset links.

## Important Decisions

### Hash-Only Reset Tokens

Decision:
Reset tokens use a public lookup key and high-entropy secret. The database
stores the lookup key and SHA-256 hash of the secret, never the full token or a
recoverable encrypted token.

Reason:
This matches the Phase 17 lookup-key plus hashed-secret pattern while avoiding
recoverable password reset credentials.

Tradeoff:
Reset links cannot be reconstructed from the database. This is intentional for
password reset.

### URL Fragment Reset Links

Decision:
Reset emails use `/reset-password#token=...` instead of putting the token in
the path or query string.

Reason:
URL fragments are not sent in HTTP requests, which keeps reset secrets out of
normal Express request logs while still allowing the React route to read the
token.

Tradeoff:
The reset form must run in the browser to read the fragment. This fits the
current React app.

### Existing Sessions Remain Valid

Decision:
Password reset updates the password hash and consumes reset tokens, but does
not invalidate existing auth cookies/sessions.

Reason:
The app does not yet have a session version or token revocation model.

Tradeoff:
An already authenticated browser remains authenticated after reset. Revisit
when session revocation exists.

### Consume Outstanding Reset Tokens

Decision:
A successful reset consumes all outstanding reset tokens for the account.

Reason:
Older reset emails should not remain usable after the user has changed their
password.

Tradeoff:
Only the newest or used link effectively survives until reset completion. This
is acceptable for a security-sensitive account flow.

## Architecture Notes

- Database/schema impact: migration `0021_password_reset_tokens.sql`.
- API contract impact: three auth endpoints were added for request, completion,
  and authenticated self-initiation.
- Auth or authorization impact: public request/complete endpoints do not set
  cookies; logged-in initiation requires `requireAuth`; existing sessions are
  not invalidated.
- Data privacy or visibility impact: reset request responses are generic for
  existing, unknown, and invalid email input. Reset secrets are not returned by
  API responses and are not stored plaintext or encrypted at rest.
- Frontend UX impact: login includes "Forgot password?", reset screens were
  added, and a small Settings page exposes logged-in reset initiation.
- Environment or deployment impact: run migration `0021` on deploy.
  `WEB_ORIGIN` must be correct in hosted environments for reset links.

## Claude Review Notes

Source:

- `notes/claude_review_phase_18.txt`

Status:

- Completed. No critical issues; verdict was ready to commit with follow-ups.

Findings and fixes:

- Addressed: public reset request timing/error-path enumeration by returning the
  generic response before reset creation/email dispatch and logging only a
  sanitized async failure.
- Addressed: added a development-safe no-op password reset link log, guarded by
  non-production behavior.
- Addressed: added completion-endpoint rate-limit coverage.
- Addressed: removed the redundant partial lookup index from the unshipped
  migration.
- Addressed: cleared the reset token hash from the browser address bar after
  the React reset page reads it.
- Accepted tradeoff: existing sessions remain valid after password reset until
  a future session revocation model exists.
- Accepted tradeoff: reset endpoints use the existing in-memory auth
  rate-limit pattern unless/until the app scales horizontally.

Product note:

- With production email still forced disabled, the user-facing "Forgot
  password?" flow is a foundation, not an end-to-end shippable production
  recovery feature. Real delivery remains blocked on an approved provider
  adapter.

## Validation

Commands run:

```bash
npm run typecheck
npm run lint
npm run build
npm test
git diff --check
```

Results:

- Passed: `npm run typecheck`
- Passed: `npm run lint`
- Passed: `npm run build` (Vite emitted the existing large chunk warning)
- Initial sandboxed `npm test` passed shared/web tests, then API tests failed
  with `EPERM 127.0.0.1:5432` because local PostgreSQL access was blocked.
- Passed with approved local PostgreSQL access: `npm test` (shared 47, web 52,
  API 178 tests across 18 API files)
- Passed after Claude review fixes: `npm run typecheck`
- Passed after Claude review fixes: `npm run lint`
- Passed after Claude review fixes: `npm run build` (Vite emitted the existing
  large chunk warning)
- Passed after Claude review fixes with approved local PostgreSQL access:
  `npm test` (shared 47, web 52, API 180 tests across 18 API files)
- Passed: `git diff --check`

Manual tests:

- Not run in browser. Recommended browser pass: request reset for existing and
  non-existing email; use the reset link once; confirm old password fails and
  new password works; attempt reuse; trigger reset from `/settings`.

## Problems Encountered

- Problem:
  API tests need local PostgreSQL and were blocked in the sandbox.
  Resolution:
  Reran the full test suite with approved local PostgreSQL access.

- Problem:
  The first expired-token test attempted to set `expires_at` earlier than
  `created_at`, violating the migration check constraint.
  Resolution:
  Updated the test fixture to age both `created_at` and `expires_at`
  consistently.

- Problem:
  Claude review identified non-blocking hardening around public request timing,
  future provider error paths, dev manual link testing, completion limiter
  coverage, a redundant index, and address-bar hash hygiene.
  Resolution:
  Applied the targeted fixes listed in the Claude Review Notes section and
  reran validation.

## Follow-Up Tasks

- Keep the existing auth/security follow-up to replace in-memory auth rate
  limiting with a shared store if the API scales horizontally.
- Revisit existing session invalidation after password reset when the app has a
  session version or token revocation model.
- Real password reset email delivery remains blocked on the future production
  email provider adapter.

## Commit Readiness

- Requirements implemented: Yes
- Claude handoff created: Yes
- Product context still aligned: Yes
- Architecture principles still aligned: Yes
- Security review complete: Yes; Claude found no critical issues.
- Review findings addressed or deferred: Yes
- Manual testing complete: Pending browser pass
- Ready to commit: Yes with the documented production email and manual browser
  testing follow-ups, at the developer's discretion

---

## Phase 19 — User Profile Foundation

Date:
2026-06-22

Status:
Completed; ready to commit with manual-browser follow-up

Prompt:
`prompts/prompt_19.txt`

Git Commit:
Pending

Review Artifacts:
- Codex handoff: `notes/claude_handoff_phase_19.txt`
- Claude review: `notes/claude_review_phase_19.txt`

## Goals

- Extend the existing `/settings` route with optional user profile metadata.
- Store approved demographics relationally.
- Add authenticated current-user profile read/update APIs.
- Show registered current-user survey statistics without mixing anonymous
  attempts.
- Preserve the Phase 18 password reset panel and cooldown behavior.

## Built

- Added `database/migrations/0022_user_profiles.sql` with `user_profiles`
  linked one-to-one with `users`.
- Added shared `UserProfile`, `CurrentUserSurveyStats`,
  `CurrentUserProfileResponse`, and `UpdateCurrentUserProfileResponse` types.
- Added `GET /api/profile` and `PUT /api/profile`, both protected by
  `requireAuth` and scoped only to `req.user.id`.
- Added server-side profile validation for optional text fields with a
  120-character maximum and blank-to-null normalization.
- Added current-user survey stats for available, in progress, completed, last
  activity, and completion rate.
- Updated `/settings` to render account details, survey stats, editable
  demographic fields, and the existing password reset action.
- Added focused API tests for authentication, profile persistence, user
  isolation, validation, stats correctness, and anonymous-attempt exclusion.
- Updated `markdown/DATA_MODEL_VISION.md` with the user profile entity.
- Addressed Claude review follow-ups by making `PUT /api/profile` partial-merge
  safe, rejecting array request bodies, and documenting the intentional
  published-vs-non-draft stats split in code comments.

## Important Decisions

### Separate User Profile Table

Decision:
Use a `user_profiles` table rather than adding demographic columns directly to
`users`.

Reason:
The approved demographics are optional profile metadata and can remain
relational without expanding the auth-critical user row.

Tradeoff:
Profile reads join/lookup another table. The endpoint hides that complexity and
returns null profile fields when no row exists yet.

### Current-User-Only API Shape

Decision:
Expose only `/api/profile` without any user id parameter.

Reason:
Standard users can only read and update their own profile. Avoiding id-bearing
routes reduces the chance of cross-user access bugs and keeps Phase 20 admin
profile tooling out of scope.

Tradeoff:
Admin profile lookup/editing will need its own explicitly admin-scoped route in
a future phase.

### Registered Survey Stats

Decision:
Profile stats count only attempts where `survey_attempts.user_id` matches the
authenticated user. Anonymous attempts are ignored.

Reason:
Anonymous attempts have separate ownership and must not be mixed into a
registered user's private profile view.

Tradeoff:
An anonymous attempt by the same real-world person is not reflected in their
registered profile stats. This is intentional for the anonymous/registered
separation.

## Architecture Notes

- Database/schema impact: migration `0022_user_profiles.sql`.
- API contract impact: added current-user profile response/update contracts and
  `/api/profile` endpoints.
- Auth or authorization impact: both profile endpoints require auth; there is no
  user-id parameter and no admin profile surface.
- Data privacy or visibility impact: profile metadata is visible only to the
  authenticated owner in this phase; no public or admin profile view was added.
- Frontend UX impact: existing Settings route now includes profile fields and
  survey stats while keeping password reset available.
- Environment or deployment impact: run migration `0022` on deploy.

## Validation

Commands run:

```bash
npm run typecheck
npm run lint
npm run build
npm test
git diff --check
```

Results:

- Passed: `npm run typecheck`
- Passed: `npm run lint`
- Passed: `npm run build` (Vite emitted the existing large chunk warning)
- Initial sandboxed targeted API test failed with `EPERM 127.0.0.1:5432`
  because local PostgreSQL access was blocked.
- Initial approved targeted profile test failed on an ambiguous SQL
  `updated_at` reference in the stats CTE.
- Passed after SQL fix with approved local PostgreSQL access:
  `npm test -w apps/api -- test/profile.test.ts`
- Passed with approved local PostgreSQL access: `npm test` (shared 47, web 52,
  API 185 tests across 19 API files)
- Passed after Claude review fixes: `npm run typecheck`
- Passed after Claude review fixes: `npm run lint`
- Passed after Claude review fixes: `npm run build` (Vite emitted the existing
  large chunk warning)
- Passed after Claude review fixes with approved local PostgreSQL access:
  `npm test -w apps/api -- test/profile.test.ts`
- Passed after Claude review fixes with approved local PostgreSQL access:
  `npm test` (shared 47, web 52, API 185 tests across 19 API files)
- Passed: `git diff --check`

Manual tests:

- Not run in browser. Follow-up logged for Account dropdown `/settings`,
  profile save/reload, stats update, anonymous-stat isolation, password reset
  cooldown, and responsive checks at 375/768/1280px.

## Problems Encountered

- Problem:
  The sandbox blocked local PostgreSQL access for API tests.
  Resolution:
  Reran targeted and full tests with approved local PostgreSQL access.

- Problem:
  The profile stats CTE selected `updated_at` after joining `surveys`, causing
  an ambiguous column error.
  Resolution:
  Qualified the registered activity columns with `survey_attempts`.

## Claude Review Notes

Source:

- `notes/claude_review_phase_19.txt`

Status:

- Completed. No critical issues; verdict was ready to commit.

Findings and fixes:

- Addressed: partial profile updates no longer clear omitted fields.
- Addressed: array JSON bodies are rejected instead of treated as empty profile
  objects.
- Addressed: added code comments for the intentional stats scope asymmetry and
  abandoned-attempt last-activity behavior.

Accepted tradeoffs:

- Completion rate remains completed divided by available + in-progress +
  completed survey units.
- Available surveys include all published surveys visible to registered users,
  including surveys that also have anonymous links.

## Follow-Up Tasks

- Run the logged Phase 19 manual browser pass for Settings/profile/stat
  behavior and responsive widths.
- Decide later whether the Settings stat label needs more explicit completion
  rate wording after a browser/user review pass.

## Commit Readiness

- Requirements implemented: Yes
- Claude handoff created: Yes
- Product context still aligned: Yes
- Architecture principles still aligned: Yes
- Security review complete: Yes; Claude found no critical issues.
- Review findings addressed or deferred: Yes
- Manual testing complete: Pending browser pass
- Ready to commit: Yes with the documented manual browser follow-up, at the
  developer's discretion

---

## Phase 20 — Admin User Tools Foundation

Date:
2026-06-23

Status:
Completed; ready to commit with manual-browser follow-up

Prompt:
`prompts/prompt_20.txt`

Git Commit:
Pending

Review Artifacts:
- Codex handoff: `notes/claude_handoff_phase_20.txt`
- Claude review: `notes/claude_review_phase_20.txt`

## Goals

- Add admin-only user detail visibility under the admin API namespace.
- Show safe user account metadata, read-only profile demographics, and
  registered-user survey statistics.
- Let admins initiate password reset email delivery for a user without exposing
  reset tokens, reset URLs, password hashes, or reset storage fields.
- Keep `/api/profile` self-service-only and avoid admin profile editing.

## Built

- Added shared admin user detail/reset response contracts:
  `AdminUserDetailResponse` and `AdminUserPasswordResetResponse`.
- Exported the Phase 19 profile/stat read helpers as reusable registered-user
  helpers without changing `/api/profile`.
- Added admin-only endpoints:
  - `GET /api/admin/users/:id`
  - `POST /api/admin/users/:id/password-reset`
- Admin detail returns a safe user projection, existing-or-null profile fields,
  and registered survey stats using the same semantics as Phase 19.
- Admin reset uses the Phase 18 password reset service and returns only the
  generic reset message. Token and reset URL material are discarded by the
  admin route.
- Added role-filtering to the admin user list API so the UI can show accurate,
  separately paginated administrator and standard-user sections.
- Added migration `0023_user_profile_contact_fields.sql` and replaced the
  professional profile fields on active API/UI surfaces with contact-focused
  fields: contact number, preferred contact method, and contact notes.
- Added `/admin/users/:userId` detail UI linked from the existing admin users
  table, with a bifurcated `/admin/users` list, read-only profile details,
  survey stat tiles, back navigation, and reset initiation feedback.
- Added focused API tests for admin-only access, unknown users, secret-field
  exclusion, no-profile null fields, registered-only stats with anonymous
  isolation, admin-triggered reset token creation, and admin self-reset.

## Important Decisions

### Admin Namespace Only

Decision:
Add user detail/reset under `/api/admin/users/:id` and leave `/api/profile`
unchanged.

Reason:
Profile endpoints remain self-service-only, while admin user tools have their
own authorization boundary.

Tradeoff:
Admin detail mirrors some profile read behavior through shared service helpers,
but the write/update surface remains separate and does not add admin profile
editing.

### Reset Response Non-Disclosure

Decision:
Reuse the password reset service for token creation/email dispatch, but return
only the generic reset message to admins.

Reason:
Admins should be able to initiate recovery without seeing reset tokens or links.

Tradeoff:
In disabled/no-op email mode, the route still creates the reset token row but
does not expose a development link through the admin response.

### Registered Stats Semantics

Decision:
Reuse Phase 19 registered-user survey stat semantics for admin detail.

Reason:
The admin surface should not invent a second definition for available,
in-progress, completed, last activity, or completion rate.

Tradeoff:
Completion rate remains completed divided by available + in-progress +
completed survey units, and anonymous attempts remain excluded.

## Architecture Notes

- Database/schema impact: migration `0023_user_profile_contact_fields.sql` adds
  optional contact-focused profile columns.
- API contract impact: added admin user detail and admin password reset
  initiation responses.
- Auth or authorization impact: new endpoints require `requireAuth` and
  `requireRole("admin")`; standard users receive 403 and unauthenticated
  requests receive 401.
- Data privacy or visibility impact: admin detail returns only approved user,
  profile, and registered stat fields; no password or reset secret fields are
  returned.
- Frontend UX impact: admin users table is visually split into Administrators
  and Standard users, links to a detail view, and the detail view can initiate
  reset email delivery. Settings profile fields now ask for contact details
  instead of organization/job-title/location details.
- Environment or deployment impact: run migration `0023` on deploy/local dev
  databases before using profile settings or admin user detail.

## Validation

Commands run:

```bash
npm run typecheck
npm run lint
npm run build
npm test -w apps/api -- test/adminUsers.test.ts
npm test -w apps/api -- test/profile.test.ts test/adminUsers.test.ts
npm test
npm run db:migrate
git diff --check
```

Results:

- Passed: `npm run typecheck`
- Passed: `npm run lint`
- Passed: `npm run build` (Vite emitted the existing large chunk warning)
- Initial sandboxed targeted API test failed with `EPERM 127.0.0.1:5432`
  because local PostgreSQL access was blocked; the filter also used a filename
  pattern before the harness initialized.
- Passed with approved local PostgreSQL access:
  `npm test -w apps/api -- test/adminUsers.test.ts` (12 admin user tests)
- Passed after bifurcated user-list adjustment with approved local PostgreSQL
  access: `npm test -w apps/api -- test/adminUsers.test.ts` (13 admin user tests)
- Passed after contact-field adjustment with approved local PostgreSQL access:
  `npm test -w apps/api -- test/profile.test.ts test/adminUsers.test.ts`
  (17 profile/admin tests)
- Passed with approved local PostgreSQL access: `npm test` (shared 47, web 52,
  API 190 tests across 19 API files)
- Passed after contact-field adjustment with approved local PostgreSQL access:
  `npm test` (shared 47, web 52, API 190 tests across 19 API files)
- Passed after bifurcated user-list adjustment with approved local PostgreSQL
  access: `npm test` (shared 47, web 52, API 191 tests across 19 API files)
- Passed with approved local PostgreSQL access: `npm run db:migrate`
  (applied `0023_user_profile_contact_fields.sql` to the local dev database)
- Passed: `git diff --check`

Manual tests:

- Not run in browser. Follow-up logged for admin user list/detail/reset
  workflows and responsive checks at 375/768/1280px.

## Problems Encountered

- Problem:
  The sandbox blocked local PostgreSQL access for API tests.
  Resolution:
  Reran targeted and full tests with approved local PostgreSQL access.

## Claude Review Notes

Source:

- `notes/claude_review_phase_20.txt`

Status:

- Completed. Claude approved for commit with no critical or blocking issues.

Findings and disposition:

- Accepted tradeoff: admin reset returns the existing generic reset message
  even though the route returns 404 for unknown users. This keeps the response
  consistent with the existing self-service reset routes and secret-free.
- Accepted pre-existing pattern: password reset token creation happens before
  email send, so email-send failure can return 500 after a token row is written.
  This is shared with the existing reset service and not a Phase 20 regression.
- Accepted tradeoff: admin reset has no separate rate limiter, matching the
  authenticated self-service reset route and relying on trusted admin access.
- Deferred optional cleanup: centralize the duplicated safe admin user
  projection if future admin user routes expand.
- Follow-up review approved the post-approval contact-field change and the
  bifurcated admin user list with no blocking issues.
- Accepted product decision: contact number, preferred contact method, and
  contact notes are more sensitive than the original professional fields, but
  they are intentionally user-entered, short, optional, and scoped to survey
  follow-up rather than broad CRM/account management.
- Deferred cleanup: migration `0023` leaves the original
  `organization`/`job_title`/`location` columns in place. Drop them in a later
  cleanup migration after confirming no pre-deploy profile data needs backfill
  or retention.

Review highlights:

- Admin-only enforcement, PII minimization, token non-disclosure, and secret
  exclusion passed review.
- Phase 19 profile/stat semantics are consistent because `/api/profile` and
  admin detail now share the same read helpers.
- Anonymous attempts remain isolated from registered-user stats.
- `/api/profile` remains self-service-only and no CRM-style admin workflow was
  introduced.

Post-review product adjustment:

- After manual testing, the profile/detail fields were changed from the overly
  professional organization/job-title/location set to contact number, preferred
  contact method, and contact notes. This added migration `0023` and updated the
  shared profile contract, profile API service, Settings UI, admin detail UI,
  data model vision, and focused profile/admin tests.
- A follow-up Claude review was appended to `notes/claude_review_phase_20.txt`
  after this contact-field adjustment and after the bifurcated admin user list.
  Claude approved with no blocking issues.

## Follow-Up Tasks

- Run the logged Phase 20 manual browser pass for admin user detail/reset and
  responsive widths.

## Commit Readiness

- Requirements implemented: Yes
- Claude handoff created: Yes
- Product context still aligned: Yes
- Architecture principles still aligned: Yes
- Security review complete: Yes; Claude found no critical or blocking issues
- Review findings addressed or deferred: Yes; optional suggestions accepted or
  deferred as noted above
- Manual testing complete: Pending browser pass
- Ready to commit: Yes with the documented manual browser follow-up, at the
  developer's discretion

---

## Phase 21 — Choice Other Answer Foundation

Date:
2026-06-23

Status:
Completed

Prompt:
`prompts/prompt_21.txt`

Git Commit:
Pending

Review Artifacts:
- Codex handoff: `notes/claude_handoff_phase_21.txt`
- Claude review: `notes/claude_review_phase_21.txt`

## Goals

- Add an admin-controlled Allow Other setting for `single_select` and
  `multi_select` questions.
- Render a system-generated Other option in the participant runner when enabled.
- Store custom Other text separately from normal answer options.
- Keep hidden tags and conditional logic attached only to real answer options.
- Show Other text separately in admin reporting and CSV export.

## Built

- Added migration `0024_choice_other_answers.sql`:
  - `survey_questions.allow_other boolean not null default false`
  - database check limiting `allow_other` to `single_select` and `multi_select`
  - `survey_response_answers.other_text text`
  - database check requiring nonblank Other text and capping it at 240 chars
- Added shared contracts for `allowOther`, `otherText`, answer request payloads,
  admin attempt detail Other text, and report `otherResponseCount`.
- Added builder create/update validation and admin UI toggles for applicable
  draft questions only.
- Preserved `allow_other` through survey duplication.
- Added participant runner state and UI for the system-generated Other row and
  free-text input.
- Added server-side validation for single-answer and page-answer saves:
  - single-select accepts exactly one standard option or one nonblank Other
    response
  - single-select rejects mixed standard + Other responses
  - multi-select accepts standard-only, Other-only, or mixed standard + Other
    responses
  - selected Other with blank text is rejected
  - unsupported question types and non-Other-enabled questions reject Other data
  - stray Other fields on text, integer, and scale answers are rejected
- Updated answer saving/loading to persist `other_text` on
  `survey_response_answers` while keeping `survey_response_selected_options`
  limited to real option IDs.
- Updated progressive completion/meaningful-response logic to count nonblank
  Other text as an answered choice response.
- Updated reporting and CSV:
  - aggregate question stats count Other responses separately
  - attempt detail includes `otherText`
  - Results UI displays mixed multi-select standard options plus Other text
  - CSV adds an `other_text` column separate from `selected_options`
  - hidden-tag rollup remains based only on real selected options and value tags
- Added focused API tests in `apps/api/test/choiceOtherAnswers.test.ts`.
- Updated `markdown/DATA_MODEL_VISION.md` and `markdown/FOLLOW_UPS.md`.

## Important Decisions

### Other Is Not An Answer Option

Decision:
Represent selected Other in persisted responses by non-null
`survey_response_answers.other_text`; do not create an `answer_options` row.

Reason:
The phase prompt requires Other to be system-generated and stored separately
from standard option IDs.

Tradeoff:
There is no persisted boolean for "Other selected"; a saved Other response is
represented by nonblank text. Request validation still accepts a separate
`isOtherSelected` flag so the API can reject checked-but-empty Other input.

### Option-Based Logic Ignores Other

Decision:
Conditional logic continues to match only `selectedAnswerOptionIds` from real
answer options.

Reason:
Other responses have no option ID and are explicitly out of scope for hidden
tags or conditional logic.

Tradeoff:
Admins cannot branch on Other text in this phase. If needed later, that should
be designed as a separate text/value rule feature.

### Raw Other Reporting

Decision:
Display/export raw Other text per response and count Other responses per
question; do not aggregate identical custom strings.

Reason:
The prompt left aggregation open and said to defer it if unanswered.

Tradeoff:
Reports remain correct and transparent, but do not yet normalize equivalent
custom strings for charts.

## Architecture Notes

- Database/schema impact: migration `0024_choice_other_answers.sql` is additive
  and default-disabled for existing questions/responses.
- API contract impact: answer request payloads include `isOtherSelected` and
  `otherText`; responses include `otherText`; reports include
  `otherResponseCount`.
- Auth or authorization impact: no auth/role boundary changes.
- Data privacy or visibility impact: Other text is participant-entered response
  data visible in admin reports/CSV like other answers; hidden tags remain
  admin-only and are not attached to Other.
- Frontend UX impact: admins see Allow Other only for choice questions;
  participants see a generated Other row only when enabled.
- Environment or deployment impact: run migration `0024` before using Allow
  Other in any environment.

## Validation

Commands run:

```bash
npm run typecheck
npm test -w apps/api -- choiceOtherAnswers
npm run lint
npm run build
npm test
git diff --check
```

Results:

- Passed: `npm run typecheck`
- Initial sandboxed targeted API test failed with `EPERM 127.0.0.1:5432`
  because local PostgreSQL access was blocked; the first filter also used an
  overly specific workspace path.
- Passed with approved local PostgreSQL access:
  `npm test -w apps/api -- choiceOtherAnswers` (8 tests)
- Passed after addressing Claude S1 with approved local PostgreSQL access:
  `npm test -w apps/api -- choiceOtherAnswers` (9 tests)
- Passed: `npm run lint`
- Passed: `npm run build` (Vite emitted the existing large chunk warning)
- Passed with approved local PostgreSQL access: `npm test`
  - shared: 47 tests
  - web: 52 tests
  - API: 199 tests across 20 API files
- Passed after addressing Claude S1 with approved local PostgreSQL access:
  `npm test`
  - shared: 47 tests
  - web: 52 tests
  - API: 200 tests across 20 API files
- Passed: `git diff --check`

Manual tests:

- Completed by developer on 2026-06-23. Browser pass covered admin Allow Other
  toggles, participant standard-only/Other-only/mixed submissions, empty Other
  validation, Results/CSV display, hidden-tag isolation, and responsive checks.

## Problems Encountered

- Problem:
  Sandboxed API tests could not connect to local PostgreSQL.
  Resolution:
  Reran targeted and full test suites with approved local PostgreSQL access.

- Problem:
  Adding required shared fields exposed a few test fixture defaults and literal
  inference issues.
  Resolution:
  Added `allowOther: false` and `otherText: null` defaults in shared/web test
  builders and made the participant runner generic setter calls explicit.

## Claude Review Notes

Source:

- `notes/claude_review_phase_21.txt`

Status:

- Completed. Claude approved for commit with no critical or blocking issues.

Findings and disposition:

- Approved: data-model separation, required validation, page-answer parity,
  reporting/CSV separation, hidden-tag isolation, backward compatibility,
  unsupported-type UI boundaries, and no Phase 20 drift.
- Addressed S1: text and integer answers now reject stray
  `isOtherSelected`/`otherText` fields instead of silently dropping them. Added
  a regression test covering text and integer unsupported Other answer fields.
- Accepted note S2: the unsupported-type guard now lives at the top of
  `validateAnswerForQuestion`, so it is the active guard for text, integer,
  scale, and future unsupported types.
- Accepted low-severity S3: the builder checkbox remains uncontrolled for now;
  submit behavior is correctly gated client-side and server-side, so no invalid
  data can persist. This can be revisited as visual polish if it proves
  confusing during manual testing.

## Follow-Up Tasks

- Phase 21 manual browser pass completed on 2026-06-23.
- Have Claude Code write `notes/claude_review_phase_21.txt` and address any
  accepted findings. Done: review completed and S1 addressed.

## Commit Readiness

- Requirements implemented: Yes
- Claude handoff created: Yes
- Product context still aligned: Yes
- Architecture principles still aligned: Yes
- Security review complete: Yes; Claude found no critical or blocking issues
  and automated hidden-tag isolation checks were added
- Review findings addressed or deferred: Yes
- Manual testing complete: Yes
- Ready to commit: Yes

---

## Phase 25 — Survey Completion Time Stats And Admin Override Foundation

Date:
2026-06-23

Status:
Completed

Prompt:
`prompts/prompt_25.txt`

Git Commit:
Pending

Review Artifacts:
- Codex handoff: `notes/claude_handoff_phase_25.txt`
- Claude review: `notes/claude_review_phase_25.txt`

## Goals

- Build backend-owned survey completion estimates from completed attempts.
- Add Admin override support for total estimated survey completion minutes.
- Show timing metadata and override controls on Admin Setup.
- Expose only the participant-safe effective estimate on survey payloads.
- Leave participant progress label replacement and dynamic timing
  instrumentation to Phases 26 and 27.

## Built

- Added migration `0026_survey_timing_overrides.sql` with a
  `survey_timing_overrides` table keyed one-to-one to `surveys`.
- Added shared timing contracts:
  - `SurveyTimingSummary`
  - `SurveyTimingResponse`
  - `SurveyTimingEstimateSource`
  - participant-safe `Survey.effectiveEstimateSeconds`
- Added `apps/api/src/services/surveyTiming.ts`.
  - derives statistical estimates from valid completed attempts for the same
    survey
  - ignores missing timestamps, non-positive durations, non-completed
    attempts, and samples over four hours
  - uses the median valid duration
  - computes backend defaults from question-type weights
  - applies precedence: Admin override, statistical estimate, default estimate
- Added Admin-only timing endpoints:
  - `GET /api/surveys/:id/timing`
  - `PUT /api/surveys/:id/timing`
  - `DELETE /api/surveys/:id/timing`
- Timing override edits use the metadata/deleted-survey guard rather than the
  structural lock, so published surveys can receive timing overrides without
  allowing structural question/page edits.
- Extended survey structure loading so authenticated and anonymous participant
  payloads receive only `effectiveEstimateSeconds`.
- Added Admin Setup timing controls showing derived estimate, sample count,
  default estimate, effective estimate, source, override input, and clear
  action.
- Added focused API tests in `apps/api/test/surveyTiming.test.ts`.
- Updated `markdown/DATA_MODEL_VISION.md` and `markdown/FOLLOW_UPS.md`.

## Important Decisions

### Median Statistical Estimate

Decision:
Use the median of valid completed-attempt durations for the same survey.

Reason:
The prompt left outlier handling open. Median is a simple robust statistic that
does not require a complex analytics model.

Tradeoff:
Small samples can still be noisy, but the Admin override can correct values
that do not match operational intuition.

### Four-Hour Sample Cap

Decision:
Ignore completed-attempt durations over four hours for the first statistical
estimate.

Reason:
`completed_at - started_at` can include idle browser time. The cap removes
obvious long-pause samples while Phase 27 is still pending.

Tradeoff:
Very long legitimate surveys would fall back to the remaining valid samples,
or to Admin override/default if every sample is capped. This should be revisited
if the client expects multi-hour survey sessions.

### Participant-Safe Effective Estimate

Decision:
Attach only `effectiveEstimateSeconds` to the shared `Survey` payload.

Reason:
Phase 26 needs a participant-safe total estimate, but Admin audit metadata
(`derivedEstimateSeconds`, `defaultEstimateSeconds`, `adminOverrideSeconds`,
`sampleCount`, `estimateSource`) should remain Admin-only.

Tradeoff:
Admin Setup uses a dedicated timing endpoint for the richer metadata instead
of relying on the general survey read.

## Architecture Notes

- Database/schema impact: additive override table only; derived/default values
  are computed at read time.
- API contract impact: surveys now carry `effectiveEstimateSeconds`; Admins
  can read/set/clear full timing metadata through Admin-only endpoints.
- Auth or authorization impact: timing metadata and mutations are guarded by
  `requireAuth` plus `requireRole("admin")`.
- Data privacy or visibility impact: participant payloads exclude timing audit
  fields and expose only the effective estimate.
- Frontend UX impact: Admin Setup now has a separate timing panel.
- Environment or deployment impact: run migration `0026` before using timing
  overrides in any environment.

## Validation

Commands run:

```bash
npm test -w apps/api -- surveyTiming
npm run typecheck
npm run lint
npm run build
npm test
git diff --check
```

Results:

- Passed with approved local PostgreSQL access:
  `npm test -w apps/api -- surveyTiming` (6 tests)
- Initial `npm run typecheck` failed because one web test fixture lacked the
  new required `Survey.effectiveEstimateSeconds` field.
- Fixed the fixture in
  `apps/web/src/components/admin/surveyFlowGraph.test.ts`.
- Passed after fix: `npm run typecheck`
- Passed: `npm run lint`
- Passed: `npm run build` (Vite emitted the existing large chunk warning)
- Passed with approved local PostgreSQL access: `npm test`
  - shared: 47 tests
  - web: 52 tests
  - API: 210 tests across 21 API files
- Passed: `git diff --check`
- Passed after Claude review fixes: `npm run typecheck`
- Passed after Claude review fixes: `npm run lint`
- Passed after Claude review fixes: `npm run build` (Vite emitted the
  existing large chunk warning)
- Passed after Claude review fixes with approved local PostgreSQL access:
  `npm test -w apps/api -- surveyTiming` (6 tests)
- Passed after Claude review fixes with approved local PostgreSQL access:
  `npm test`
  - shared: 47 tests
  - web: 52 tests
  - API: 210 tests across 21 API files
- Passed after Claude review fixes: `git diff --check`

Manual tests:

- Completed by developer on 2026-06-23. Browser pass covered the Admin Setup
  timing workflow and responsive checks. Developer reported manual testing is
  good.
- Non-blocking console warning observed during manual testing:
  `THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.`
  This comes from `apps/web/src/components/AmbientBackdrop.tsx`, is unrelated
  to Phase 25 timing, and is tracked in `markdown/FOLLOW_UPS.md`.

## Claude Review Notes

Source:

- `notes/claude_review_phase_25.txt`

Status:

- Completed. Claude approved for commit after the deferred manual browser pass,
  with no critical issues.

Findings and disposition:

- Accepted scaling note: timing is recomputed on every survey-structure read,
  including participant and anonymous hot paths. Logged in
  `markdown/FOLLOW_UPS.md` for caching/materialization review once Phase 26
  consumes timing more heavily or high-volume surveys make reads expensive.
- Addressed validator cleanup: simplified the override minutes type check.
- Addressed sub-second edge case: statistical medians are clamped to at least
  one second before becoming an effective estimate.
- Addressed mobile layout risk: the timing override form now stacks under the
  existing mobile breakpoint.

## Follow-Up Tasks

- Manual Admin Setup timing checks completed on 2026-06-23.
- Phase 26 should consume `Survey.effectiveEstimateSeconds` for participant
  remaining-time copy and remove numeric progress labels.
- Phase 27 should add lightweight attempt activity instrumentation and active
  time aggregation.

## Commit Readiness

- Requirements implemented: Yes
- Claude handoff created: Yes
- Product context still aligned: Yes
- Architecture principles still aligned: Yes
- Security review complete: Automated Admin-only and participant payload
  isolation checks added; Claude found no critical issues
- Review findings addressed or deferred: Yes
- Manual testing complete: Yes
- Ready to commit: Yes

---

## Phase 26 — Participant Estimated Completion Display

Date:
2026-06-23

Status:
Completed

Prompt:
`prompts/prompt_26.txt`

Git Commit:
Pending

Review Artifacts:
- Codex handoff: `notes/claude_handoff_phase_26.txt`
- Claude review: `notes/claude_review_phase_26.txt`

## Goals

- Replace participant-facing numeric progress labels with estimated time
  remaining.
- Power the estimate from participant-safe `Survey.effectiveEstimateSeconds`.
- Keep calculations aligned with the resolved visible page path, including
  branching, page jumps, hide-page behavior, and skips.
- Keep Admin pagination and Admin workflow labels unchanged.

## Built

- Added shared participant timing helpers:
  - `surveyQuestionTypeEstimateWeightsSeconds`
  - `getSurveyQuestionTypeEstimateWeightSeconds`
  - `calculateSurveyRemainingTimeEstimate`
  - `formatRemainingTimeCopy`
- Moved the backend default timing weight lookup to the shared weight helper so
  Phase 25 survey defaults and Phase 26 participant proportions stay aligned.
- Updated the authenticated and anonymous participant runner header to show
  copy such as "About 3 min remaining", "Less than 1 min remaining", or
  "Almost done" instead of "Page X of Y".
- Kept the visual progress bar, but made it decorative so participant-facing
  accessible copy is the remaining-time label rather than numeric page counts.
- Added focused shared tests for:
  - text, integer, single-select, multi-select, and scale question weights
  - scaling remaining time from the effective total estimate
  - decreasing estimates across a straight page path
  - multi-question current-page remaining questions plus future pages
  - branch/path changes using existing path helpers
  - defensive unknown-current-page handling
  - less-than-one-minute and almost-done copy
- Added a web source guard ensuring the participant runner does not reintroduce
  "Page X of Y" or "Question X of Y" style labels.

## Important Decisions

### Shared Timing Weights

Decision:
Use shared question-type timing weights for both backend default estimates and
participant remaining-time proportions.

Reason:
Phase 26 needs to scale remaining question weight against the Phase 25
effective survey estimate. Keeping the weights in shared code prevents backend
and frontend estimates from drifting.

Tradeoff:
The weights remain code-owned constants. Admin-configurable per-type weights
are still out of scope.

### Resolved Path Projection

Decision:
Calculate remaining time from `resolveAttemptPagePath` output and the
progressive response helper semantics.

Reason:
This keeps the participant display aligned with the runner's existing
branching, page-jump, hide-page, skip, and progressive reveal behavior.

Tradeoff:
The estimate remains approximate. It does not use active elapsed time or
per-attempt behavior until Phase 27.

## Architecture Notes

- Database/schema impact: none.
- API contract impact: none beyond consuming the existing participant-safe
  `Survey.effectiveEstimateSeconds`.
- Auth or authorization impact: none.
- Data privacy or visibility impact: participant UI uses only the effective
  estimate and does not expose Admin timing audit metadata.
- Frontend UX impact: authenticated and anonymous participant runners now show
  remaining-time copy instead of numeric page progress.
- Environment or deployment impact: none.

## Validation

Commands run:

```bash
npm run typecheck
npm run test -w packages/shared -- surveyRemainingTime
npm run test -w apps/web -- SurveyAttemptPage
npm run lint
npm run build
npm test
git diff --check
```

Results:

- Passed: `npm run typecheck`
- Passed: `npm run test -w packages/shared -- surveyRemainingTime`
  - 7 tests after Claude review fixes
- Passed: `npm run test -w apps/web -- SurveyAttemptPage`
  - 1 test
- Passed: `npm run lint`
- Passed: `npm run build` (Vite emitted the existing large chunk warning)
- Initial sandboxed `npm test` passed shared and web, then failed when the API
  harness was blocked from connecting to local PostgreSQL on
  `127.0.0.1:5432`.
- Passed after rerun with approved local PostgreSQL access: `npm test`
  - shared: 54 tests after Claude review fixes
  - web: 53 tests
  - API: 210 tests across 21 API files
- Passed: `git diff --check`

Manual tests:

- Completed by developer on 2026-06-23. Browser pass covered the remaining-time
  participant display, timing derivation/sample behavior, and anonymous
  token-link completion timing. Developer reported manual testing passes.

## Claude Review Notes

Source:

- `notes/claude_review_phase_26.txt`

Status:

- Completed. Claude found no blocking issues and marked the phase ready to
  commit after the deferred manual browser and responsive pass.

Findings and disposition:

- Addressed decorative bar divergence: the progress fill now follows the
  remaining-time estimate instead of page position.
- Addressed heading semantics: the visible heading is now the stable page title,
  and the time estimate lives in a polite live region.
- Addressed defensive edge: an unknown current page id now treats the path as
  not-yet-complete rather than immediately reporting "Almost done".
- Deferred render-test hardening: current web guard remains a source-text
  tripwire; a render-level assertion is tracked in `markdown/FOLLOW_UPS.md`
  if/when the web test harness adds DOM rendering utilities.

## Follow-Up Tasks

- Phase 27 should add lightweight activity instrumentation and active-time
  aggregation.

## Commit Readiness

- Requirements implemented: Yes
- Claude handoff created: Yes
- Product context still aligned: Yes
- Architecture principles still aligned: Yes
- Security review complete: Participant UI consumes only
  `effectiveEstimateSeconds`; Admin timing audit metadata remains untouched
- Review findings addressed or deferred: Yes
- Manual testing complete: Yes
- Ready to commit: Yes

---

## Phase 24 — Other Hidden Tags Foundation

Date:
2026-06-23

Status:
Implemented; Claude review complete; manual browser pass pending

Prompt:
`prompts/prompt_24.txt`

Git Commit:
Pending

Review Artifacts:
- Codex handoff: `notes/claude_handoff_phase_24.txt`
- Claude review: `notes/claude_review_phase_24.txt`

## Goals

- Allow admins to attach hidden tags to the system-generated Other choice when
  `allowOther` is enabled on `single_select` and `multi_select` questions.
- Keep Other separate from normal answer options.
- Resolve Other hidden tags in admin report detail, hidden-tag rollup, and CSV
  when a response has non-null `other_text`.
- Keep Other tags out of participant-facing survey and attempt payloads.

## Built

- Added migration `0025_question_other_tags.sql` with a `question_other_tags`
  table keyed to `survey_questions`.
- Added shared/admin-only types for `QuestionOtherTag`,
  `SurveyQuestion.otherTags`, and `AdminAttemptAnswer.otherTags`.
- Extended admin survey structure loading to include Other tags only when hidden
  tags are requested.
- Added draft-only builder routes to create, update, and delete Other hidden
  tags:
  - `POST /api/surveys/:id/questions/:questionId/other-tags`
  - `PUT /api/surveys/:id/questions/:questionId/other-tags/:tagId`
  - `DELETE /api/surveys/:id/questions/:questionId/other-tags/:tagId`
- Registered Other hidden tags in the shared tag catalog, matching answer-option
  hidden-tag behavior.
- Copied Other hidden tags when duplicating surveys.
- Added admin Questions UI controls for Other hidden tags only when a persisted
  choice question has Allow Other enabled.
- Included Other tags in:
  - admin attempt detail when `otherText` is present
  - CSV hidden-tag export when `other_text` is present
  - hidden-tag report rollup counts
- Updated data-model and follow-up documentation.
- Added focused API tests in `apps/api/test/choiceOtherAnswers.test.ts`.

## Important Decisions

### Separate Question-Level Model

Decision:
Store Other hidden tags in `question_other_tags`, keyed to `survey_questions`.

Reason:
Other is system-generated and must not become an `answer_options` row. A
question-level table lets reporting resolve tags from `other_text` without
creating fake option IDs or conditional-logic targets.

Tradeoff:
The same tag pair can exist on a real option and on Other independently. The
report rollup intentionally combines by key/value pair, as existing tag rollups
already do.

### Other Tags Apply By Current Metadata

Decision:
Reports resolve Other hidden tags from current survey metadata when
`other_text` is non-null.

Reason:
This follows existing answer-option hidden-tag behavior for the reported survey.

Tradeoff:
Adding or editing Other tags later can affect reports for historical Other
responses on the same survey, matching the current metadata-driven reporting
model.

## Architecture Notes

- Database/schema impact: migration `0025_question_other_tags.sql` is additive.
- API contract impact: admin survey responses can include
  `SurveyQuestion.otherTags`; admin attempt detail can include
  `AdminAttemptAnswer.otherTags`.
- Auth or authorization impact: Other tag mutations are admin-only and
  draft-only through the existing structural lock guard.
- Data privacy or visibility impact: Other hidden tags are omitted when
  participant-facing endpoints load survey structures without hidden tags.
- Frontend UX impact: Other hidden-tag controls appear only on draft choice
  questions where Allow Other is enabled.
- Environment or deployment impact: run migration `0025` before using Other
  hidden tags in any environment.

## Validation

Commands run:

```bash
npm run typecheck
npm test -w apps/api -- choiceOtherAnswers
npm run lint
npm run build
npm test
git diff --check
```

Results:

- Passed: `npm run typecheck`
- Passed with approved local PostgreSQL access:
  `npm test -w apps/api -- choiceOtherAnswers` (13 tests)
- Passed: `npm run lint`
- Passed: `npm run build` (Vite emitted the existing large chunk warning)
- Passed with approved local PostgreSQL access: `npm test`
  - shared: 47 tests
  - web: 52 tests
  - API: 204 tests across 20 API files
- Passed: `git diff --check`
- Passed after Claude review fix: `npm run typecheck`
- Passed after Claude review fix: `npm run lint`
- Passed after Claude review fix with approved local PostgreSQL access:
  `npm test -w apps/api -- choiceOtherAnswers` (13 tests)
- Passed after Claude review fix: `git diff --check`

Manual tests:

- Completed by developer on 2026-06-23. Browser pass covered admin enabling
  Allow Other, adding Other hidden tags, submitting a participant Other
  response, verifying Results detail/rollup and CSV output, confirming
  participant non-disclosure, and confirming turning Allow Other off hides the
  Other hidden-tag editor.

## Claude Review Notes

Source:

- `notes/claude_review_phase_24.txt`

Status:

- Completed. Claude approved for commit after the deferred manual browser pass,
  with no critical issues.

Findings and disposition:

- Addressed suggestion 2.1: admin structure loading now attaches
  `otherTags` whenever hidden tags are requested, regardless of current
  `allowOther`, so admin attempt detail/CSV and the hidden-tag rollup resolve
  Other tags from the same metadata source.
- Accepted note 2.2: survey duplication does not re-register copied tag pairs
  in the catalog, matching answer-option tag duplication; the original tag
  writes already register the pair.
- Addressed cosmetic note 2.3: removed the extra blank line before the value-tag
  route block.

## Follow-Up Tasks

- Claude review completed and accepted findings were addressed.
- Manual browser pass completed on 2026-06-23.

## Commit Readiness

- Requirements implemented: Yes
- Claude handoff created: Yes
- Product context still aligned: Yes
- Architecture principles still aligned: Yes
- Security review complete: Yes; Claude found no critical issues and automated
  hidden-tag non-disclosure checks were added
- Review findings addressed or deferred: Yes
- Manual testing complete: Yes
- Ready to commit: Yes
