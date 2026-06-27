# Accessibility Test Plan

This plan is the repeatable public and registered-user accessibility verification
checklist for the Survey Portal. It covers the remediation work from Phases
42-45 and is intentionally scoped away from Admin-only audit findings unless a
shared primitive is being smoke-checked for compatibility.

Use this before production releases and after changes to public routes,
registered-user routes, participant survey taking, modals, forms, route shell,
toasts, pagination, glossary rendering, or theme tokens.

See `markdown/ACCESSIBILITY_PRIMITIVES.md` for implementation usage rules for
the public/user accessibility primitives referenced by this plan.

## Scope

In scope:

- Public home, login, register, forgot password, reset password, and anonymous
  survey directory.
- Registered dashboard, category survey list, account settings, and registered
  survey attempt routes.
- Anonymous survey attempt and anonymous completion follow-up email modal.
- Shared public/user primitives: route announcer, skip link, account
  disclosure, `AccessibleModal`, `AlertMessage`, `FormField`, `ToastProvider`,
  `PaginationRow`, semantic survey progress, inline glossary, and visually
  hidden contextual action names.
- Light and dark theme checks.
- Responsive checks at 375px, 768px, and 1280px.

Out of scope for this plan:

- Admin-only grouped selects, Admin Results chart alternatives, Admin users
  mobile table remediation, Admin builder disclosures, and Admin drag-and-drop
  accessibility improvements.
- Real client data.
- External live service calls.

## Tooling Position

Automated browser accessibility checks are useful but are not a replacement for
manual keyboard and assistive-technology testing.

The current repo has Vitest source/unit tests only. It does not include
Playwright, axe, jsdom, or React Testing Library. Do not add browser
accessibility dependencies without human approval. Until that approval exists,
this plan is the authoritative accessibility regression workflow.

Recommended future automation, if approved:

- Add Playwright and axe integration as dev dependencies.
- Add `npm run test:accessibility`.
- Start with smoke checks for public home/login/register, dashboard, category
  survey list, account settings, registered survey attempt, anonymous
  directory, and anonymous survey attempt in light and dark themes.
- Keep the suite small, deterministic, and independent from live external
  services.

## Test Data

Use fake local data only.

Minimum local fixture needs:

- One standard user account.
- One published registered-user survey with:
  - text question
  - integer question
  - single-select question
  - multi-select question
  - discrete scale question
  - at least one required question
  - at least one optional question
  - at least one inline glossary term in a participant-facing question prompt
- One published survey assigned to a category.
- One listed anonymous survey link.
- One anonymous survey with a completion follow-up email option.

## Browser Matrix

Run at least:

- Chromium or Chrome for keyboard and layout checks.
- Firefox with NVDA where available.
- Safari with VoiceOver where available.
- Mobile Safari with VoiceOver or Android Chrome with TalkBack where available.

If a browser or assistive technology is unavailable, record the gap in
`markdown/PHASE_LOG.md` and carry it in `markdown/FOLLOW_UPS.md`.

## Keyboard-Only Workflow

For every route below:

- Use Tab and Shift+Tab only.
- Confirm visible focus is always present and not clipped.
- Confirm focus order follows the visual and task order.
- Confirm Enter and Space activate buttons or controls as expected.
- Confirm Escape closes disclosures, tooltips, and modals where applicable.
- Confirm no keyboard trap exists except inside an open modal.
- Confirm route changes land on main content or otherwise announce context.

Routes and workflows:

- Home:
  - skip link appears on focus and lands on main content
  - theme toggle is focusable and announces pressed state
  - public anonymous survey directory link is clear
- Login:
  - required fields are labelled
  - invalid login announces an error
  - register and forgot-password links remain reachable
- Register:
  - required fields and password helper text are announced
  - missing or invalid fields expose errors through field associations
- Forgot password:
  - successful and failed submit statuses are announced
- Reset password:
  - invalid or expired token state is announced
  - successful reset modal traps focus, closes predictably, and restores focus
- Dashboard:
  - survey-card actions have contextual accessible names
  - resume nudge action has contextual accessible name
  - pagination controls announce current page changes
  - category group drill-in controls are specific
- Category survey list:
  - back link is reachable
  - survey actions are specific
  - pagination controls announce current page changes
  - empty state is announced without loading-style behavior
- Account settings:
  - profile fields expose labels, helper text, optional markers, and errors
  - reset-password cooldown explanation remains discoverable
  - save success and failure states are announced
- Registered survey attempt:
  - progress has a programmatic equivalent
  - text, integer, single-select, multi-select, scale, and Other controls are
    associated with the question prompt and relevant helper/error text
  - required unanswered questions announce validation errors
  - Previous, Save, Next, and Submit remain reachable and understandable
  - inline glossary terms open on focus and close with Escape
- Anonymous survey directory:
  - repeated "Start survey" links include survey context
  - list and empty/error/loading states are announced
- Anonymous survey attempt:
  - the runner checks above pass without requiring a registered session
  - completion follow-up modal traps focus, announces title/description, and
    restores focus after close

## Screen Reader Workflow

NVDA with Firefox or Chrome:

- Navigate by headings on public and registered-user routes.
- Navigate by buttons and links on dashboard, category list, anonymous
  directory, and survey attempt pages.
- Confirm route changes announce the new page context.
- Confirm survey progress is exposed as progress or equivalent text.
- Confirm question prompts, help text, required state, selected state, and
  errors are announced for every supported question type.
- Confirm dashboard and directory card actions include enough context without
  reading surrounding visual content.
- Confirm inline glossary terms expose definitions reliably after focus/open.
- Confirm modal title and description are announced and background content is
  not reachable while the modal is open.

VoiceOver with Safari:

- Repeat the route-change, heading, button/link list, modal, form-error,
  dashboard-card, directory-card, and glossary checks.
- Pay special attention to route focus reset, tooltip/glossary announcement,
  and modal return focus.

Record the screen reader, browser, operating system, date, and any unresolved
issues in the phase log.

## Mobile Screen Reader And Touch

At a narrow mobile viewport:

- Confirm touch targets are usable and text does not overlap.
- Confirm the header, skip link, account disclosure, and theme toggle remain
  operable.
- Confirm participant survey taking works by touch and mobile screen reader:
  reading prompt/help text, selecting options, entering text/numbers, choosing
  scale values, opening glossary terms, saving, navigating, and submitting.
- Confirm account settings fields and reset cooldown copy are reachable.
- Confirm anonymous directory cards and start links are reachable.
- Confirm dialogs do not allow background interaction while open.

## Contrast Workflow

Check both light and dark themes.

Use a browser contrast checker or manual sampling tool for:

- normal body text on `--bg`, `--surface`, and `--surface-2`
- muted text using `--text-muted` and `--text-faint`
- labels using `--text-label`
- disabled text and disabled surfaces
- primary, secondary, danger, and ghost buttons
- focus rings around links, buttons, form controls, summary/details controls,
  survey choices, and modal controls
- status messages: info, success, error, warning
- toasts and alert surfaces
- dashboard survey cards, category group cards, anonymous directory cards, and
  progress indicators
- glossary triggers and tooltip surfaces
- modal backdrop and modal surface text
- status pills and badges

Acceptance targets:

- Normal text meets WCAG 2.2 AA contrast.
- Large text and UI component boundaries meet WCAG 2.2 AA expectations.
- Information is not conveyed by color alone.
- Focus indicators are visible in both themes and around disabled-adjacent
  controls.

## Phase 45 Pending Verification Disposition

The Phase 45 manual verification items remain human-run because they require a
real browser, route fixture data, and assistive technology access.

Use `markdown/FOLLOW_UPS.md` as the live tracker for the outstanding Phase
45/46 manual verification items. This section records the disposition only so
the test plan does not become a second backlog.

When completed, move the item from `markdown/FOLLOW_UPS.md` to Completed
Follow-Ups and summarize the result in `markdown/PHASE_LOG.md`.

## Defect Recording

For every defect found:

- If it is tiny, public/user scoped, and low risk, fix it in the current phase.
- If it is larger, Admin-only, dependency-related, or needs product direction,
  add it to `markdown/FOLLOW_UPS.md` with a clear future phase placement.
- Do not silently broaden the phase to Admin-only remediation.

## Release Gate

Before production release, confirm:

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm test`
- `npm run release:check`
- `git diff --check`
- manual accessibility checks from this plan are completed or explicitly
  deferred with a dated reason
