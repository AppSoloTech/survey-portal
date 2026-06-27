# Unreleased

Release title: User-Facing Accessibility Improvements

Summary: Improves participant survey-taking, app navigation, and dialog accessibility for public and registered-user workflows.

## Fixed

- Survey scale questions now use native radio-style choices so unanswered required scales are not exposed as the minimum value.
- Participant survey progress now includes programmatic progress and visible current-path context.
- Survey runner answer controls now have stronger prompt, help text, and error associations for assistive technology.
- Runner validation, save, submit, and anonymous follow-up email errors are announced more reliably.
- Public and registered-user routes now update browser titles, announce navigation, and move focus to the main content after route changes.
- Keyboard users can skip repeated header navigation with a skip-to-main link.
- The account menu now uses disclosure navigation semantics with Escape and outside-click close behavior.
- Password reset and anonymous follow-up email dialogs now use shared modal focus management with focus trapping, Escape handling, return focus, and background inert behavior.
- Auth and account forms now expose required/optional field context, invalid states, helper text, and announced form errors more consistently.
- Public and registered-user status messages, pagination updates, and toast notifications now use clearer live-region semantics with dedicated dismiss controls for toasts.
