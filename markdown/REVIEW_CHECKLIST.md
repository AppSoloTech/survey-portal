# Review Checklist

Use this checklist before committing a phase and when preparing Claude review handoffs.

---

## Scope

- The implementation matches the current phase prompt.
- Client-review phases identify the source feedback note or pasted issue list.
- Every received feedback item is fixed, explicitly deferred, blocked by a documented question, or marked out of scope.
- Non-goals were not implemented accidentally.
- Any intentional scope change is documented in `markdown/PHASE_LOG.md`.
- No unrelated refactors or dependency churn were included.

## Product Fit

- User and admin capabilities align with `prompts/MASTER_PRODUCT_CONTEXT.txt`.
- Survey concepts use consistent names: survey, question, answer option, hidden tag, conditional logic, survey attempt, response.
- Hidden tags remain internal metadata and are not exposed to survey participants.
- MVP question types remain limited to text, integer, single-select, and multi-select unless explicitly expanded.
- Reporting favors correctness and maintainability over visual complexity.

## Architecture

- React, Express, TypeScript, Node.js, and PostgreSQL remain the baseline stack.
- The app remains a modular monolith unless a durable architecture decision says otherwise.
- REST APIs live under `/api`.
- Survey definitions and conditional logic are data-driven rather than hardcoded.
- Core business data is relational and uses explicit foreign keys where appropriate.
- Schema and survey-flow decisions align with `markdown/DATA_MODEL_VISION.md`.
- Shared code is minimal and avoids speculative abstractions.

## Security

- Passwords are never stored or logged in plaintext.
- Authentication is enforced server-side.
- Authorization is enforced server-side for every protected endpoint.
- Admin-only functionality is inaccessible to standard users.
- Browser unsafe requests that rely on auth cookies have CSRF and allowed-origin protection.
- Public anonymous endpoints that bypass CSRF have a documented non-cookie bearer-token authorization model.
- Sensitive account changes invalidate or deliberately preserve existing sessions with the decision documented.
- Incoming requests are validated on the server.
- Database access uses parameterized queries or a safe query builder/ORM.
- Error responses do not expose implementation details.
- Logs do not contain secrets, passwords, tokens, or sensitive response data.
- Security headers are present and appropriate for the app surface, including CSP, frame protection, MIME sniff protection, referrer policy, and production HSTS where applicable.

## Environment And Secrets

- `.env` and `.env.*` remain ignored except `.env.example`.
- `.env.example` contains placeholders only.
- Production secrets are expected to live in Azure App Service configuration.
- Production secrets that need stronger controls are tracked for Azure Key Vault references or equivalent managed secret storage.
- Local development defaults do not leak into production startup.
- CORS is only enabled where needed and is appropriately constrained.
- Required environment variables are documented.

## Release Notes And Deployment

- Production-bound implementation sessions update
  `markdown/releases/unreleased.md` with concise admin-readable draft notes.
- Placeholder draft release-note text is removed before preparing a release.
- Production-bound changes update the root `package.json` app version.
- `markdown/releases/vX.Y.Z.md` exists for the root app version.
- Release notes follow `markdown/RELEASE_NOTES.md`.
- `npm run release:check` passes before `npm run deploy`.
- Direct `main` pushes rely on GitHub Actions release-note validation before
  Azure deploy.

## Database

- Migrations are explicit, reviewable, and ordered.
- Seeds contain no real personal data or production secrets.
- Schema changes preserve data ownership and authorization boundaries.
- Status values and enums match the product context.
- MVP schema work respects the documented one-question-per-page survey flow unless a later phase intentionally changes it.
- Conditional navigation implements only approved MVP actions unless future actions are explicitly in scope.
- Rollback or recovery considerations are documented for risky migrations.

## Frontend UX

- User and admin areas are clearly separated.
- Navigation does not imply unavailable features are complete.
- Loading, empty, error, and unauthorized states are handled where relevant.
- Forms provide useful validation feedback without relying on frontend validation for security.
- User-facing copy avoids leaking internal tags or implementation terms.

## Validation

- Typecheck was run or documented as unavailable.
- Build was run or documented as unavailable.
- Lint was run or documented as unavailable.
- Security-sensitive changes include focused automated tests where practical.
- Supply-chain checks were run or explicitly deferred when dependency or CI security changed.
- Backend startup was tested when backend behavior changed.
- Frontend startup was tested when frontend behavior changed.
- `/api/health` was checked when the API changed.
- Relevant manual workflows were exercised.

## Review And Memory

- `notes/claude_handoff_phase_X.txt` was created before Codex marked phase implementation complete.
- `notes/claude_review_phase_X.txt` was created after Claude review, or `markdown/PHASE_LOG.md` explicitly marks the review as pending.
- Accepted and deferred findings are summarized in `markdown/PHASE_LOG.md`.
- Deferred findings and loose ends are added to `markdown/FOLLOW_UPS.md` when they should remain visible to future phases.
- Follow-up tasks have owners or clear future phase placement.
- Commit readiness is explicitly documented.
