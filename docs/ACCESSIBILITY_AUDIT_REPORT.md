# Accessibility Audit Report

Audit date: 2026-06-27  
Scope: React web app in `apps/web/src`, covering public/auth flows, participant survey taking, dashboards, admin survey builder, conditional logic, reports, tables, modals, forms, navigation, shared styling, and feedback patterns.

This is a code-based WCAG 2.2 AA-oriented review. No application code was changed.

## Executive Summary

The portal has several good accessibility foundations: native inputs are used in many forms, most primary interactions are real buttons or links, the user table uses real table markup on desktop, focus-visible styling exists globally, mobile touch targets are considered, and reduced-motion preferences are respected in the animation helper and CSS.

The biggest risks are repeated patterns rather than isolated defects: missing route/page focus management, incomplete dialog behavior, visual-only or weakly announced feedback, custom controls that do not fully implement native semantics, and survey question controls that need stronger programmatic labels and error associations. Because the expected audience includes many disabled users, these should be treated as production-quality requirements rather than polish.

Severity count:

- Critical: 0
- High: 8
- Medium: 9
- Low: 5

## Must Fix Before Production

### 1. Route changes do not update focus, page title, or announce context

Severity: High  
Location: `apps/web/src/App.tsx` lines 87-121, route tree; page headings across `apps/web/src/pages/**`

What the issue is: The SPA switches routes inside `<main>` without a route-level focus reset, document title update, or navigation announcement. Focus can remain on the activating link/button while the page content changes.

Why it matters: Screen reader and keyboard users may not know navigation occurred or where the new page begins. This is especially disorienting in survey and admin workflows where pages look similar.

Recommended fix: Add a shared route accessibility manager.

Suggested implementation approach: Create a component near `AppShell` that watches `location.pathname`, sets `document.title`, moves focus to `<main tabIndex={-1}>` or the page `<h1>/<h2>`, scrolls intentionally, and optionally updates a visually hidden polite live region with the new page label.

### 2. Dialogs lack complete modal focus management

Severity: High  
Location: `apps/web/src/pages/SurveyAttemptPage.tsx` lines 1166-1212; also `apps/web/src/pages/ResetPassword.tsx`

What the issue is: The anonymous follow-up email modal uses `role="dialog"` and `aria-modal="true"`, but there is no initial focus placement, focus trap, Escape key close behavior, return focus, inert/hidden background handling, or labelled description. The backdrop is `role="presentation"` but remains part of a page where background controls can still be reached.

Why it matters: Keyboard and screen reader users can leave the dialog unexpectedly, lose context, or continue interacting with background content while a modal is visually blocking the page.

Recommended fix: Build a reusable accessible `Modal` primitive.

Suggested implementation approach: On open, store the triggering element, focus the first meaningful control or heading, trap Tab/Shift+Tab inside the dialog, close on Escape where safe, restore focus on close, add `aria-describedby`, and make background content inert while open.

### 3. Form errors and status messages are not consistently announced or associated

Severity: High  
Location: `apps/web/src/pages/Login.tsx` lines 46-84; `apps/web/src/pages/SurveyAttemptPage.tsx` lines 674-690, 1126, 1193; repeated across auth/admin forms

What the issue is: Error messages are usually rendered as `<p className="status error">`, but most lack `role="alert"` or `aria-live`, and inputs are not marked with `aria-invalid` or connected through `aria-describedby`.

Why it matters: Screen reader users may not hear that submission failed or which field needs attention. Cognitive and low-vision users also benefit from persistent, specific error placement.

Recommended fix: Create shared `Alert` and `ErrorMessage` primitives and a `FormField` wrapper.

Suggested implementation approach: Use `role="alert"` for blocking errors, `aria-live="polite"` for non-blocking status, generate stable ids, set `aria-invalid` on invalid fields, and connect helper/error text with `aria-describedby`. Move focus to the first error summary after failed submit.

### 4. Survey progress is visual-only

Severity: High  
Location: `apps/web/src/pages/SurveyAttemptPage.tsx` lines 952-968

What the issue is: The progress bar is rendered as a `div` with `aria-hidden="true"`. The remaining-time text is live, but the numeric progress value and current page position are not programmatically exposed.

Why it matters: Survey progress is a core orientation cue. Screen reader users need equivalent information to understand effort remaining and current position.

Recommended fix: Use native `<progress>` or a semantic progressbar.

Suggested implementation approach: Render `<progress value={progressPercent} max={100}>` or `role="progressbar"` with `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, and `aria-valuetext` such as `Page 2 of 5, about 4 minutes remaining`.

### 5. Survey answer controls need explicit accessible labels and descriptions

Severity: High  
Location: `apps/web/src/pages/SurveyAttemptPage.tsx` lines 983-1000 and 1241-1425

What the issue is: Textarea, number stepper, and range controls are placed inside a fieldset/legend, but the individual controls do not have explicit `aria-labelledby` or `aria-describedby` links to the question prompt/help text. The integer stepper buttons are labelled only "Decrease value" and "Increase value", and the scale slider label is generic.

Why it matters: Repeated survey questions can become ambiguous for screen reader and voice-control users. Users need to know which question a control belongs to and hear helper text/error text reliably.

Recommended fix: Generate ids for each question prompt, help text, control, and error.

Suggested implementation approach: Give the legend an id, pass it into each rendered control, apply `aria-labelledby` and `aria-describedby`, and include question context in stepper button labels. Use `aria-required` consistently where native `required` is not enough.

### 6. Scale slider has an inaccessible unset state

Severity: High  
Location: `apps/web/src/pages/SurveyAttemptPage.tsx` lines 1392-1425 and following range input

What the issue is: When no value is selected, the range input still exposes the minimum value as its current value. Validation later rejects required unanswered scale questions, but assistive tech may announce that a value is already selected.

Why it matters: Users may accidentally submit incorrect responses or be confused by a control that visually says "no value" while programmatically reporting a number.

Recommended fix: Prefer a native radio group for discrete scale values, or make the slider state explicit.

Suggested implementation approach: For 3-21 discrete choices, use radio buttons styled as scale options. If retaining the slider, add `aria-valuetext="No value selected"` until a real selection exists, clearly expose selected value text, and test keyboard/screen reader behavior.

### 7. Custom grouped question select does not fully implement listbox semantics

Severity: High  
Location: `apps/web/src/components/admin/PageGroupedQuestionSelect.tsx` lines 92-168

What the issue is: The custom select uses a button with `aria-haspopup="listbox"` and a panel with `role="listbox"`, but options are buttons, the visible label is a plain span, there is no `aria-controls`, no active-descendant or roving tabindex behavior, and arrow-key navigation is not implemented. The component does already close on Escape and outside click; preserve that behavior.

Why it matters: Admins using keyboard or screen readers may not be able to operate the control predictably, especially in the conditional logic builder where the source question is required.

Recommended fix: Use a native `<select>` if possible; otherwise implement a complete combobox/listbox pattern.

Suggested implementation approach: Prefer `<select><optgroup>` for grouped questions. If custom UI is necessary, follow the ARIA Authoring Practices combobox/listbox model: labelled trigger, controlled popup id, listbox options that are not nested interactive buttons, Escape/Enter/Arrow/Home/End behavior, and clear selected/active state.

### 8. Account menu uses menu roles without menu keyboard behavior

Severity: High  
Location: `apps/web/src/App.tsx` lines 267-304

What the issue is: The account menu declares `aria-haspopup="menu"` and `role="menu"`/`role="menuitem"`, but it behaves like a simple disclosure navigation menu. It lacks arrow-key menu behavior, Escape close, outside click close, focus movement into the menu, and focus restoration.

Why it matters: ARIA menu roles change screen reader expectations. If the widget does not implement the corresponding keyboard model, users get misleading instructions.

Recommended fix: Either remove menu roles and treat it as a disclosure, or implement the menu pattern completely.

Suggested implementation approach: For this navigation menu, use a button with `aria-expanded`/`aria-controls`, a labelled panel containing normal links/buttons, Escape/outside close, and optional focus-on-open. Reserve `role="menu"` for app-style command menus.

## Should Fix Soon

### 9. Loading, success, and mutation states need a consistent live-region strategy

Severity: Medium  
Location: `apps/web/src/components/ToastProvider.tsx` lines 46-78; status messages across pages

What the issue is: Toasts use `aria-live="polite"` but auto-dismiss after 4 seconds, are rendered as buttons, and many non-toast statuses are static paragraphs without live-region semantics.

Why it matters: Users may miss important save/publish/delete confirmations or errors, especially if announcements collide with route changes or form validation.

Recommended fix: Centralize feedback in reusable `Alert`/`Toast` primitives.

Suggested implementation approach: Use `role="status"` for success, `role="alert"` for errors, avoid auto-dismiss for critical failures, provide a visible dismiss button with an accessible name, and keep messages available in-page after destructive/admin actions.

### 10. Required fields are not visibly or programmatically explained consistently

Severity: Medium  
Location: `apps/web/src/pages/Login.tsx` lines 52-71; `apps/web/src/pages/SurveyAttemptPage.tsx` lines 1082-1124; admin forms in `SurveyBuilderComponents.tsx`

What the issue is: Many inputs use native `required`, but the UI does not provide a consistent visible required indicator, form-level note, or accessible required text.

Why it matters: Users with cognitive disabilities, low vision, or screen reader workflows need to know requirements before attempting submission.

Recommended fix: Add a shared `FormField` pattern with label, required marker, helper text, and error slot.

Suggested implementation approach: Render "Required" text or a visually hidden marker in labels, keep optional fields explicitly marked where useful, and avoid relying only on browser validation.

### 11. Report visualizations need stronger text/table alternatives

Severity: Medium  
Location: `apps/web/src/pages/admin/SurveyResultsPage.tsx` lines 255-272, 505-518, 538-555

What the issue is: Results bars are hidden from assistive tech and counts are present as text, which is good. However, the data is not structured as a table or list with explicit relationships between question, count, blank count, option, and percentage.

Why it matters: Admins using screen readers or magnification need efficient ways to compare results, not just read visual bars one by one.

Recommended fix: Provide semantic tabular summaries or accessible chart descriptions.

Suggested implementation approach: Use `<table>` for answer distribution data or add a "View as table" section. Include percentages alongside counts and keep CSV export as a supplement, not the only structured alternative.

### 12. Admin users table loses semantic headers on mobile

Severity: Medium  
Location: `apps/web/src/pages/admin/AdminUsersPage.tsx` lines 195-250; `apps/web/src/styles.css` lines 5985-6015

What the issue is: The desktop table has good `scope="col"` headers, but mobile CSS sets `thead { display: none; }` and converts table elements to blocks. Header labels are recreated with CSS `content: attr(data-label)`.

Why it matters: CSS-generated labels may not be exposed reliably to assistive tech, and changing table elements to block display can weaken table navigation.

Recommended fix: Keep headers available to assistive tech on mobile.

Suggested implementation approach: Visually hide table headers instead of `display:none`, preserve table semantics where possible, or use an accessible card/list layout at mobile sizes with real text labels in the DOM.

### 13. Disclosure and details sections need clearer focus and state conventions

Severity: Medium  
Location: `apps/web/src/components/admin/SurveyBuilderComponents.tsx` lines 774-804; `apps/web/src/pages/admin/SurveyLogicPage.tsx` lines 39-84

What the issue is: Native `details/summary` is a good base, but the app frequently suppresses default markers and adds visual icons through CSS/presentational spans. State is visible, but sections may need clearer heading structure and keyboard focus review.

Why it matters: Admin pages have many collapsible groups. Users need predictable heading navigation and clear expanded/collapsed state.

Recommended fix: Preserve native disclosure semantics and pair summaries with real headings where sections are major regions.

Suggested implementation approach: Keep native `summary`, avoid hiding all default affordances unless replacement is accessible, add nested heading text inside summaries where appropriate, and test with keyboard plus screen reader.

### 14. Disabled buttons often lack explanatory text available to assistive tech

Severity: Medium  
Location: `apps/web/src/pages/admin/AdminUsersPage.tsx` lines 233-240; many `disabled={...}` admin and survey actions

What the issue is: Disabled states are common but often only imply why through surrounding context or a `title` attribute.

Why it matters: Disabled controls are not focusable in most browsers, so keyboard/screen reader users may never hear why an action is unavailable.

Recommended fix: Provide visible/help text explaining unavailable actions, or use focusable controls with `aria-disabled` when explanation is important.

Suggested implementation approach: For important actions like publish, retire, submit, and role changes, add adjacent explanatory text referenced by `aria-describedby`; use `aria-disabled` plus guarded click handling only when the user needs to discover the disabled reason by focus.

### 15. Drag-and-drop organization requires manual keyboard verification and clearer instructions

Severity: Medium  
Location: `apps/web/src/pages/admin/SurveyOrganizePage.tsx` lines 577-690; `apps/web/src/components/admin/OrganizeQuestionRow.tsx` lines 30-55

What the issue is: The organizer uses `@dnd-kit` with a keyboard sensor and drag handles, which is promising, but there are no visible or programmatic instructions explaining keyboard reordering.

Why it matters: Keyboard-only admins need to know how to reorder pages/questions without trial and error.

Recommended fix: Add concise instructions and live announcements for reorder results.

Suggested implementation approach: Add a visually available "Reorder with keyboard" hint near the organize board, connect it to drag handles with `aria-describedby`, and verify `@dnd-kit` live-region announcements in browser testing.

### 16. Inline glossary popovers need screen reader/browser validation

Severity: Medium  
Location: `apps/web/src/components/InlineGlossaryText.tsx` lines 54-96

What the issue is: Glossary terms are keyboard focusable, open on focus/hover, and close on Escape, which is useful and should be preserved. The remaining gap is narrower: the component uses `aria-description`, which is not uniformly supported, and the tooltip is only linked while open.

Why it matters: Definitions are important for survey comprehension. Users need reliable access across assistive technologies.

Recommended fix: Use robust `aria-describedby` behavior and test with NVDA, VoiceOver, and keyboard.

Suggested implementation approach: Keep the definition element mounted or ensure it is mounted before focus announcement, retain the existing Escape/focus/hover behavior, and consider a disclosure/popover pattern if definitions contain longer text.

### 17. Motion is mostly reduced-motion aware, but some animated status feedback remains distracting

Severity: Medium  
Location: `apps/web/src/motion/motion.ts` lines 4-41; `apps/web/src/styles.css` lines 5300-5308; status/error animations in CSS

What the issue is: Reduced motion handling exists globally, but the UI still uses many animated highlights, shimmer, shake, pulse, and bar-grow effects.

Why it matters: Users with vestibular disorders, migraines, ADHD, or cognitive load sensitivity may be affected by motion-heavy feedback.

Recommended fix: Keep the current reduced-motion foundation and review every animation for necessity.

Suggested implementation approach: Ensure all animation is covered under `prefers-reduced-motion`, avoid shake for errors where possible, and prefer static state changes for critical feedback.

## Nice-to-Have Improvements

### 18. Add a skip link

Severity: Low  
Location: `apps/web/src/App.tsx` shell/header layout

What the issue is: There is no "Skip to main content" link before the sticky header/navigation.

Why it matters: Keyboard users must tab through repeated header controls on every page.

Recommended fix: Add a visually hidden skip link that becomes visible on focus.

Suggested implementation approach: Place `<a className="skip-link" href="#main-content">Skip to main content</a>` before the header and give `<main id="main-content" tabIndex={-1}>`.

### 19. Heading hierarchy should be normalized around one page-level heading

Severity: Low  
Location: `apps/web/src/App.tsx` lines 172-175 and 233-235; page components generally use `h2`

What the issue is: The header brand uses `h1` on every page, while page titles use `h2`. This makes the repeated site title the top heading instead of the current page title.

Why it matters: Screen reader heading navigation is clearer when each page has one meaningful `h1`.

Recommended fix: Make the brand text non-heading and use page-level `h1` in each route.

Suggested implementation approach: Replace header `h1` with styled text or `span`, update page headers from `h2` to `h1`, then keep nested sections as `h2`/`h3`.

### 20. Pagination should expose current page status as live text

Severity: Low  
Location: `apps/web/src/components/PaginationRow.tsx` lines 13-34; admin pagination patterns

What the issue is: Pagination status is visible, but page changes are not announced as live updates.

Why it matters: Screen reader users may not know that a dashboard or admin list changed after pressing Next/Previous.

Recommended fix: Add `aria-live="polite"` to pagination status and move focus intentionally if content changes significantly.

Suggested implementation approach: Update `PaginationRow` and admin inline pagination to expose "Page X of Y" in a polite live region.

### 21. Color contrast should be verified with automated tooling in both themes

Severity: Low  
Location: `apps/web/src/styles.css` color tokens and component styles

What the issue is: The palette appears thoughtfully tokenized, but this audit did not run browser-based contrast checks against all states, themes, and overlays.

Why it matters: Disabled users include low-vision and color-sensitive users; contrast can fail in combinations that look acceptable in code.

Recommended fix: Run axe/Playwright contrast checks and manual spot checks in light/dark modes.

Suggested implementation approach: Add an accessibility test pass that renders key pages in both themes and checks text, focus rings, disabled states, status pills, toasts, and chart labels.

### 22. Add accessible names to repeated action buttons where context is only visual

Severity: Low  
Location: `apps/web/src/components/SurveySummaryCard.tsx`, admin overview/results row actions

What the issue is: Buttons like "Start survey", "Resume survey", "View answers", and "Delete" are understandable visually from surrounding cards/rows, but repeated controls can be ambiguous in screen reader button lists.

Why it matters: Users navigating by controls need enough context without reading the full surrounding card.

Recommended fix: Include item context in accessible names.

Suggested implementation approach: Add `aria-label` such as `Start survey: ${title}` or include visually hidden text inside the button.

## Areas That Appear Accessible and Should Be Preserved

- Real native controls are used broadly: inputs, textareas, selects, buttons, links, fieldsets, legends, details/summary, and tables.
- Focus-visible styling exists globally for anchors, buttons, and summaries in `apps/web/src/styles.css` lines 673-678.
- `ThemeToggle` has `aria-label` and `aria-pressed`.
- Dashboard search uses a visually hidden label.
- Survey options use native radio/checkbox controls inside clickable labels.
- Admin users desktop table uses real `<table>`, `<thead>`, `<tbody>`, and `scope="col"` headers.
- Drag handles have explicit `aria-label`s and use `@dnd-kit` keyboard sensors.
- Motion code checks `prefers-reduced-motion`, and CSS has a global reduced-motion media query.
- Toasts at least use a live region, even though the pattern needs refinement.
- Public decorative WebGL backdrop is `aria-hidden`.

## Missing Reusable Accessibility Primitives

Recommended shared primitives:

- `Button`: consistent disabled/aria-disabled behavior, loading state, accessible names for icon/contextual buttons.
- `FormField`: label, required indicator, helper text, error text, ids, `aria-describedby`, `aria-invalid`.
- `Input`, `Textarea`, `Select`: wrappers using `FormField` semantics.
- `RadioGroup` and `CheckboxGroup`: required/error semantics for survey questions.
- `ScaleQuestion`: accessible discrete scale control, preferably radio-based.
- `Modal`: focus trap, initial focus, Escape, restore focus, inert background, labelled title/description.
- `Alert` / `ErrorMessage`: `role="alert"` or `role="status"` conventions.
- `Toast`: persistent/dismissible feedback with correct live-region behavior.
- `ProgressIndicator`: semantic progressbar/native progress with text equivalent.
- `RouteAnnouncer`: page title, focus reset, and navigation live region.
- `DisclosureSection`: consistent details/summary or button-controlled disclosure behavior.

## Recommended Phased Remediation Plan

### Phase 1: Critical production blockers

1. Fix the scale slider unset state so unanswered questions are not exposed as having the minimum value selected.
2. Add route title/focus management and a skip link.
3. Replace current modal pattern with an accessible `Modal` primitive.
4. Add alert/error semantics and field associations for login, registration, survey runner, anonymous registration, and admin mutation errors.
5. Fix survey progress semantics and survey question control labelling.

### Phase 2: Shared component/accessibility foundation

1. Build `FormField`, `Alert`, `Modal`, `ProgressIndicator`, `Button`, and `RouteAnnouncer`.
2. Normalize required/optional indicators and helper/error text.
3. Convert account menu to a disclosure or complete menu implementation.
4. Replace or complete the custom grouped question select.
5. Standardize loading, success, and error live-region behavior.

### Phase 3: Page-specific improvements

1. Improve admin results with table alternatives for charts.
2. Preserve admin table semantics on mobile.
3. Add keyboard instructions and verified announcements for drag-and-drop organization.
4. Add contextual accessible names to repeated row/card action buttons.
5. Review survey builder disclosures and heading hierarchy.

### Phase 4: Polish, Testing, Documentation

1. Add Playwright + axe checks for core routes in light and dark themes.
2. Manually test with keyboard only, NVDA/Firefox or NVDA/Chrome, VoiceOver/Safari, and mobile screen reader/touch.
3. Document accessibility primitives and expected patterns for future components.
4. Add a regression checklist for every new survey question type, modal, custom control, chart, and admin workflow.

## Verification Summary

Files/components reviewed:

- `prompts/accessibility_audit_prompts.txt`
- `apps/web/src/App.tsx`
- `apps/web/src/styles.css`
- `apps/web/src/pages/Login.tsx`
- `apps/web/src/pages/Register.tsx`
- `apps/web/src/pages/ForgotPassword.tsx`
- `apps/web/src/pages/ResetPassword.tsx`
- `apps/web/src/pages/Home.tsx`
- `apps/web/src/pages/UserDashboard.tsx`
- `apps/web/src/pages/CategorySurveysPage.tsx`
- `apps/web/src/pages/AnonymousSurveyDirectoryPage.tsx`
- `apps/web/src/pages/AccountSettings.tsx`
- `apps/web/src/pages/SurveyAttemptPage.tsx`
- `apps/web/src/components/SurveySummaryCard.tsx`
- `apps/web/src/components/PaginationRow.tsx`
- `apps/web/src/components/ThemeToggle.tsx`
- `apps/web/src/components/ToastProvider.tsx`
- `apps/web/src/components/InlineGlossaryText.tsx`
- `apps/web/src/motion/motion.ts`
- `apps/web/src/pages/admin/SurveyWorkspaceLayout.tsx`
- `apps/web/src/pages/admin/SurveyQuestionsPage.tsx`
- `apps/web/src/pages/admin/SurveyOrganizePage.tsx`
- `apps/web/src/pages/admin/SurveyLogicPage.tsx`
- `apps/web/src/pages/admin/SurveyResultsPage.tsx`
- `apps/web/src/pages/admin/AdminUsersPage.tsx`
- `apps/web/src/components/admin/SurveyBuilderComponents.tsx`
- `apps/web/src/components/admin/RuleCreateForm.tsx`
- `apps/web/src/components/admin/RuleList.tsx`
- `apps/web/src/components/admin/SurveyFlowMap.tsx`
- `apps/web/src/components/admin/PageGroupedQuestionSelect.tsx`
- `apps/web/src/components/admin/OrganizeQuestionRow.tsx`

Top 5 highest-impact fixes:

1. Scale slider unset-state fix so unanswered questions are not exposed as answered.
2. Route focus/title/live announcement management.
3. Accessible modal primitive with focus trap and restore.
4. Form-field error association and live alert strategy.
5. Survey runner progress/control labelling and custom select/listbox remediation.

Manual browser testing still required:

- Full keyboard-only pass across login, dashboard, survey attempt, admin builder, logic, organize, and results.
- Screen reader pass with NVDA/Firefox or NVDA/Chrome and VoiceOver/Safari.
- Mobile screen reader/touch pass for survey taking and admin tables.
- Axe/Playwright automated checks across light and dark themes.
- Manual contrast checks for all status pills, disabled states, focus rings, overlays, and chart/report surfaces.
