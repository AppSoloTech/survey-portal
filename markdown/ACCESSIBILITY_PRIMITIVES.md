# Accessibility Primitives Guide

This guide records the public and registered-user accessibility patterns added
or tightened during Phases 42-45. Use these rules when extending the same
surfaces.

See `markdown/ACCESSIBILITY_TEST_PLAN.md` for the repeatable verification
workflow that exercises these patterns.

## Route Context

Relevant file: `apps/web/src/App.tsx`.

- Public and registered-user route changes should update `document.title`.
- Route changes should move focus to `#main-content` or an equivalent main
  target without trapping focus.
- Keep the skip link before repeated navigation and keep the main target
  focusable.
- The header brand is not the page-level heading. Route content should provide
  the meaningful `h1`.

## Modal Dialogs

Use `AccessibleModal` for public/user modal dialogs.

Relevant file: `apps/web/src/components/AccessibleModal.tsx`.

Required usage:

- Provide a stable title id through `labelledBy`.
- Provide `descriptionId` when supporting copy explains the dialog.
- Put the intended initial focus target inside the modal, or let the primitive
  focus the first meaningful control.
- Keep Escape close enabled unless closing would lose critical work.
- Do not render background controls outside the modal as alternate actions while
  the modal is open.

## Status And Alerts

Use `AlertMessage` for scoped route and form statuses.

Relevant file: `apps/web/src/components/AlertMessage.tsx`.

- `variant="error"` is assertive and uses `role="alert"`.
- `variant="success"` and `variant="info"` are polite statuses.
- Avoid using the loading-style `.status.muted` treatment for terminal empty
  states when it would imply work is still in progress.
- Keep destructive or blocking errors available long enough for review.

## Form Fields

Use `FormField` for public/user inputs when practical.

Relevant file: `apps/web/src/components/FormField.tsx`.

Required usage:

- Give every field a stable id.
- Expose visible required or optional context.
- Connect helper and error text through `aria-describedby`.
- Set invalid fields through the provided `aria-invalid` behavior.
- Keep server validation as the authority; frontend field messaging only
  explains the visible state.

## Toasts

Use `ToastProvider` for transient app feedback.

Relevant file: `apps/web/src/components/ToastProvider.tsx`.

- Success toasts belong in the polite live region.
- Error toasts belong in the assertive live region.
- Keep the visible dismiss button.
- Do not make the entire toast a generic click target.

## Pagination

Use `PaginationRow` for public/user paginated lists.

Relevant file: `apps/web/src/components/PaginationRow.tsx`.

- Keep the visible "Page X of Y" status.
- Keep the status polite and atomic so page changes are announced.
- Do not replace pagination with visual-only controls.

## Survey Runner Controls

Survey questions should preserve native semantics wherever possible.

Relevant files: `apps/web/src/pages/SurveyAttemptPage.tsx` and
`packages/shared/src/index.ts`.

- Keep each question grouped by fieldset/legend or an equivalent labelled
  grouping.
- Associate controls with prompt, helper, and error text.
- Scale questions use native radio-style choices for discrete values.
- Semantic progress must remain available alongside the visual progress bar.
- Required unanswered questions must not expose a false selected/default value.
- Hidden tags remain internal and must not appear in participant-facing labels,
  helper text, or errors.

## Inline Glossary

Use `InlineGlossaryText` for participant-facing glossary terms in question
prompts.

Relevant file: `apps/web/src/components/InlineGlossaryText.tsx`.

- Preserve focus, hover, click/tap, and Escape behavior.
- Keep definition text linked through stable `aria-describedby` targets.
- Do not use glossary rendering in answer exports, reporting, hidden tags, or
  stored survey data.

## Repeated Actions

When visible context is only in a surrounding card or row, add contextual
accessible names without changing the visible label.

Relevant files include `apps/web/src/components/SurveySummaryCard.tsx`,
`apps/web/src/pages/UserDashboard.tsx`,
`apps/web/src/pages/CategorySurveysPage.tsx`, and
`apps/web/src/pages/AnonymousSurveyDirectoryPage.tsx`.

Preferred pattern:

```tsx
<button type="button">
  Start survey
  <span className="visually-hidden">: Survey title</span>
</button>
```

Use this for repeated dashboard actions, category actions, anonymous directory
links, and similar public/user card actions.

## Disabled Actions

When a disabled action matters to the user:

Relevant files include `apps/web/src/pages/AccountSettings.tsx` and any scoped
public/user route that disables an important action.

- Provide nearby visible helper text explaining why it is unavailable.
- Reference that helper text with `aria-describedby` when the control remains
  focusable.
- Use native `disabled` for truly unavailable actions unless discoverability
  requires an `aria-disabled` pattern with guarded click handling.

## Contrast And Theme Tokens

Relevant file: `apps/web/src/styles.css`.

- Use semantic color tokens from `apps/web/src/styles.css`; avoid raw colors in
  new component styles.
- Check both light and dark themes for text, focus rings, disabled controls,
  status surfaces, cards, toasts, modals, and progress indicators.
- Do not rely on color alone to communicate status or required action.
