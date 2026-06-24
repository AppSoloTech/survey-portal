# Admin Demo Guide

Use this guide as a talk track for walking an admin user through the Survey Portal. It is written for a demo where both attendees are admin users, so the flow emphasizes survey creation, publishing, response review, reporting, and admin controls.

## Demo Goals

- Show that admins can manage the complete survey lifecycle without code changes.
- Show the guardrails around published surveys: live survey structure is locked to preserve response history, while metadata stays editable.
- Show how hidden tags support internal reporting without exposing business metadata to participants.
- Show the participant path just enough to prove the admin configuration drives the user experience.
- Show where admin-only controls live: surveys, users, tags, logic, preview, and results.

## Pre-Demo Checklist

1. Start the app.

   ```bash
   npm run dev
   ```

2. Open the web app, usually at `http://127.0.0.1:5173`.
3. Sign in with an admin account.
4. Confirm the header shows the admin navigation:
   - `Dashboard`
   - `Admin workspace`
   - `Users`
   - `Tags`
5. Pick a low-risk survey for the demo, or create a fresh demo survey. Avoid deleting, retiring, or role-changing real client data unless that is explicitly part of the demo.
6. Keep one participant-style browser session ready if possible. Because admins can also access the user dashboard, you can use your admin account for the participant loop if needed.

## Suggested Demo Flow

### 1. Orientation

Start on the signed-in header and explain the two modes:

- `Dashboard` is the participant-facing area where users browse, start, resume, and complete surveys.
- `Admin workspace` is where admins create and manage surveys.
- `Users` manages account roles.
- `Tags` manages reusable hidden tag definitions.

Talking point:

> The same platform supports both the participant workflow and the admin workflow. Admins can still see the user dashboard, but regular users cannot access the admin pages.

### 2. Admin Workspace: Survey Overview

Go to `Admin workspace`.

Point out:

- Survey list with status pills: `draft`, `published`, or `retired`.
- Per-survey metadata: category, question count, jump rule count, updated date, and completion summary when attempts exist.
- `Create draft survey`.
- `Duplicate`, which creates an editable draft copy.
- `Delete`, which removes user access while preserving collected responses for analytics.
- Survey categories panel.

Recommended demo action:

1. Create a new draft survey with a simple title, such as `Client Demo Survey`.
2. Add a short description.
3. Open the new survey workspace automatically.

Talking point:

> New surveys begin as drafts. That lets admins build structure, questions, tags, and logic before participants can access anything.

### 3. Survey Setup: Metadata, Category, Status

In the survey workspace, start on `Setup`.

Point out:

- Title and description.
- Category assignment.
- Inline new category creation.
- Status panel for publishing and retiring.
- Workspace-level actions: duplicate, publish, retire.

Recommended demo action:

1. Assign the survey to an existing category or create a demo category.
2. Save metadata.
3. Do not publish yet. Save publishing for after questions and preview.

Talking point:

> Categories are how surveys are grouped on the participant dashboard. Metadata can still be edited later, even after the survey is published.

### 4. Questions: Build the Survey

Open `Questions`.

Show the supported question types:

- Text
- Integer
- Single select
- Multi select
- Scale

Recommended demo build:

1. Add a single-select question, such as `Is the site compliant?`
2. Add options:
   - `Yes`
   - `No`
   - `Needs review`
3. Add hidden tags to the options:
   - `compliance = pass`
   - `compliance = fail`
   - `review = needed`
4. Add a text question, such as `Notes for follow-up`.
5. Add an integer question, such as `Estimated issue count`.
6. Optionally add a scale question, such as `Priority from 1 to 5`.

Point out:

- Questions can be reordered while the survey is a draft.
- Options can be reordered while the survey is a draft.
- Selection options and scale values can carry hidden tags.
- Text and integer questions can also carry hidden tags based on answered values.
- Hidden tags are admin/reporting metadata and are never shown to participants.
- Saving question text, option text, and hidden tags are separate actions.

Talking point:

> Hidden tags turn simple participant answers into structured reporting signals. The participant sees normal answer choices; the admin gets consistent internal metadata for analysis and export.

### 5. Logic: Conditional Navigation

Open `Logic`.

Show:

- Source question.
- Source answer.
- Action:
  - `Jump to question`
  - `Skip questions`
- Existing rules grouped by source question.
- Survey flow map.

Recommended demo action:

Create one rule:

- If `Is the site compliant?` = `Yes`, skip `Notes for follow-up`.

Or create a jump rule:

- If `Is the site compliant?` = `No`, jump to `Notes for follow-up`.

Talking point:

> Logic is intentionally simple and admin-configurable. The current MVP supports answer-driven jumps and skips for later questions, which covers the main conditional flow without turning the product into a complex workflow engine.

### 6. Preview: Validate Before Publishing

Open `Preview`.

Point out:

- Read-only preview of the survey title, description, questions, help text, required markers, and answer controls.
- Preview shows the configured order.
- Conditional logic still depends on participant answers during actual completion.

Recommended demo action:

Use the preview as a final admin review step before publishing.

Talking point:

> Preview is the admin sanity check. It lets us review what participants will read before making the survey available.

### 7. Publish and Explain Locking

Return to `Setup` or use the workspace header and click `Publish survey`.

After publishing, open `Questions` and `Logic` again.

Point out:

- Structural controls are locked after publishing.
- Questions, options, tags, and logic are locked to protect existing responses.
- Title, description, and category remain editable.
- `Create editable draft copy` is the safe way to revise a live survey structure.
- `Retire survey` stops new starts while preserving reporting history.

Talking point:

> Once real responses exist, changing the structure directly can corrupt interpretation. The app protects that history by locking structure and using draft copies for revisions.

### 8. Participant Loop

Go to `Dashboard`.

Show:

- Published surveys.
- Category group cards.
- Search.
- Survey status: `not started`, `in progress`, `completed`.
- Resume banner if there is an in-progress survey.

Recommended demo action:

1. Start the published demo survey.
2. Answer the first question in a way that triggers logic.
3. Move through the survey.
4. Use `Previous` once to show review.
5. Submit the survey.
6. Return to surveys.

Talking point:

> The participant experience is intentionally focused: start, answer one question at a time, save progress as they go, resume later, and submit when ready.

### 9. Results and Reporting

Return to `Admin workspace`, open the demo survey, then open `Results`.

Show:

- Completion summary:
  - Completed
  - In progress
  - Abandoned
  - Completion rate
- Date filters.
- Refresh.
- Export CSV.
- Answers per question.
- Option distribution bars.
- Hidden tag rollup.
- Participant attempt list.
- `View answers` for individual responses.
- Per-answer states:
  - Answered
  - Skipped (blank)
  - Not answered yet
  - Never reached
  - Not on final path

Talking point:

> Results combine high-level completion metrics with drill-down detail. Hidden tag rollups make the internal metadata useful for analysis, and CSV export gives admins a path into external reporting tools.

### 10. Tag Catalog

Open `Tags`.

Show:

- Reusable hidden tag category/value pairs.
- Add tag.
- Edit tag.
- Delete tag.
- Duplicate warning.

Point out:

- Tags saved in the question builder register in the shared catalog automatically.
- Tags added here become suggestions in every survey.
- Deleting a catalog entry does not remove tags already saved on answer options.

Talking point:

> The catalog keeps reporting metadata consistent across surveys. Admins can reuse the same tag vocabulary instead of retyping one-off values.

### 11. User Management

Open `Users`.

Show:

- Registered users.
- Email.
- Role.
- Registration date.
- Promote user to admin.
- Demote admin to user.

Demo-safe guidance:

- Do not demote yourself during the demo. The app disables self-demotion.
- Do not demote the client unless that is explicitly agreed.
- If demonstrating the control, use a throwaway user account.

Talking point:

> Admins can manage access directly. Role changes take effect immediately, and regular users are blocked from admin-only routes server-side.

## Admin Use Cases To Emphasize

- Create a draft survey.
- Organize surveys by category.
- Build question sets with required/optional questions.
- Add answer options and scale values.
- Attach hidden reporting tags.
- Configure simple answer-driven logic.
- Preview before publishing.
- Publish to make a survey available.
- Retire a survey to stop new starts.
- Duplicate a survey to create a safe editable draft copy.
- Review completion status and participant attempts.
- Export results to CSV.
- Manage reusable tag definitions.
- Promote and demote admin access.

## Demo Safety Notes

- Prefer duplicating an existing survey over editing a live one.
- Avoid deleting surveys during the client demo unless using a disposable demo survey.
- Avoid retiring a live survey unless you intend to remove it from participant availability.
- Published and retired survey structure is locked by design.
- Hidden tags are internal metadata. Do not describe them as participant-visible labels.
- Results may be empty until at least one participant starts or submits the survey.

## Short Closing Script

> The main admin story is: create a draft, add questions and tags, configure simple logic, preview, publish, collect responses, and review or export results. The system keeps live survey history protected by locking structure after publish, while still giving admins a clean path to iterate through editable draft copies.
