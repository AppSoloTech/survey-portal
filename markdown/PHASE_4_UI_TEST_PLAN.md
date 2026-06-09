# Phase 4 UI Test Plan

Purpose:
Run a robust manual UI test for the Phase 4 admin survey builder and confirm the Phase 3 user survey flow still works.

Use this against a local development database only. The local seed creates a known admin account and must not be applied to hosted, shared, staging, or production databases.

---

## Prerequisites

Local app:

```bash
npm run dev
```

Expected local URLs:

```txt
Web: http://127.0.0.1:5173/
API: http://127.0.0.1:3000/
```

Local seed admin:

```txt
Email: admin@example.test
Password: AdminPass123!
```

Optional clean setup:

```bash
psql "$DATABASE_URL" -f database/migrations/0001_app_health_check.sql
psql "$DATABASE_URL" -f database/migrations/0002_users.sql
psql "$DATABASE_URL" -f database/migrations/0003_surveys.sql
psql "$DATABASE_URL" -f database/seeds/0001_phase_2_seed.sql
```

Preflight checks:

- Open `http://127.0.0.1:3000/api/health` and confirm `database` is `connected`.
- Open `http://127.0.0.1:5173/`.
- Confirm the app can load without console errors.

---

## Test Data Naming

Use a unique title so test data is easy to identify:

```txt
Phase 4 UI Smoke - YYYY-MM-DD HHMM
```

Recommended survey content:

- Q1: `Do you need a follow-up review?`
  - Type: `single_select`
  - Required: yes
  - Options:
    - `Yes`
    - `No`
  - Hidden tag on `Yes`:
    - key: `review_required`
    - value: `true`
- Q2: `How many locations are affected?`
  - Type: `integer`
  - Required: yes
- Q3: `Describe the issue`
  - Type: `text`
  - Required: no
- Q4: `Which areas apply?`
  - Type: `multi_select`
  - Required: yes
  - Options:
    - `Operations`
    - `Safety`
    - `Compliance`

Recommended rule:

```txt
If Q1 equals No, jump to Q4
```

This creates a forward-only jump and avoids the known Phase 4 follow-up around backward/self jumps.

---

## Admin Access And Route Protection

- Log out if currently signed in.
- Open `/admin` while logged out.
- Expected: redirected away from the admin builder or asked to log in.
- Register a new standard user from `/register`.
- Try opening `/admin`.
- Expected: standard user cannot access the admin builder.
- Log out.
- Log in as `admin@example.test`.
- Open `/admin`.
- Expected: Survey Builder page loads.

Pass:

- Admin route is reachable only as admin.
- Non-admin cannot use the admin page.

---

## Survey Creation

- In the left panel, create a new survey using the unique title.
- Add a short description.
- Expected:
  - The survey appears in the survey list.
  - The survey status is `draft`.
  - The survey is selected after creation.

Try invalid metadata:

- Save metadata with a blank title.
- Expected: browser/server validation prevents the save or shows an error.
- Restore the title.

Pass:

- Survey creation works.
- New survey starts as draft.
- Basic validation prevents empty title.

---

## Publish Guard: No Questions

- With the new draft survey selected and no questions added, click `Publish`.
- Expected: publish fails with an error requiring at least one question.

Pass:

- Survey without questions cannot be published.

---

## Question Builder

Create the four recommended questions.

For each question:

- Fill question text.
- Choose the correct type.
- Set required appropriately.
- Add help text for at least one question.
- Click `Add question`.

Expected:

- Each new question appears in order.
- Question type, required flag, text, and help text are visible/editable.

Edit checks:

- Edit Q3 text, save, and confirm the updated text remains after save.
- Toggle Q3 required on, save, then toggle it off again and save.
- While still draft, change Q3 type from `text` to `integer`, save, then change it back to `text`.

Reorder checks:

- Move Q4 up once.
- Move it back down.
- Expected: display order updates and remains stable after save.

Pass:

- Questions can be added, edited, and reordered.
- Question type can be changed before publish.

---

## Answer Options And Hidden Tags

For Q1:

- Add options `Yes` and `No`.
- Edit `Yes` to `Yes - needs review`, save, then change it back to `Yes`.
- Move `No` above `Yes`, then move it back.
- Add hidden tag to `Yes`:
  - `review_required` / `true`
- Edit the tag value to `yes`, save, then change it back to `true`.

For Q4:

- Add options `Operations`, `Safety`, and `Compliance`.
- Reorder at least one option and move it back.

Expected:

- Options save and reorder correctly.
- Hidden tags are visible in the admin builder.
- Hidden tags are attached to the intended option.

Pass:

- Selection answer options can be created, edited, and reordered.
- Hidden tags can be created and edited in admin only.

---

## Publish Guard: Selection Question Without Options

- Add a temporary `single_select` question with no options.
- Click `Publish`.
- Expected: publish fails because selection questions need at least one answer option.
- Delete the temporary question while the survey is still draft.

Pass:

- Selection questions without answer options block publishing.

---

## Conditional Rule Builder

- Add the recommended rule:
  - Source question: Q1
  - Source answer: `No`
  - Target question: Q4
- Expected: rule appears in the rule list.
- Edit the rule target to Q3 and save.
- Edit it back to Q4 and save.

Known follow-up:

- Do not intentionally create a backward/self jump as part of the normal smoke test. Phase 4 currently tracks forward-only validation as a follow-up.

Pass:

- Rule creation and editing works for valid forward `JUMP_TO_QUESTION` behavior.

---

## Publish And User Visibility

- Click `Publish`.
- Expected:
  - Survey status changes to `published`.
  - No publish validation errors appear.

Open the user dashboard as a standard user:

- Log out as admin.
- Register or log in as a standard user.
- Open `/dashboard`.
- Expected:
  - The published survey appears.
  - Draft surveys do not appear.
  - Hidden tags are not visible anywhere in the user UI.

Pass:

- Published survey appears to standard users.
- Draft surveys stay hidden.
- Hidden tags are not shown to participants.

---

## User Survey-Taking Flow

Start the newly published survey as the standard user.

Path A: answer `Yes` on Q1.

- Expected next question: Q2.
- Answer Q2 with an integer.
- Answer or skip optional Q3.
- Answer Q4 with one or more options.
- Submit the survey.
- Expected: completed state is shown.

Path B with a different standard user: answer `No` on Q1.

- Expected next question: Q4 because of the jump rule.
- Answer Q4.
- Submit the survey.
- Expected: survey can complete without Q2/Q3.

Pass:

- Standard progression works.
- Conditional jump works.
- Required validation works.
- Completion works.

---

## Retire Behavior

As admin:

- Open `/admin`.
- Select the test survey.
- Click `Retire`.
- Expected: status changes to `retired`.

As a standard user who has not started the survey:

- Open `/dashboard`.
- Expected: the retired survey is not available to start.

As a standard user who started the survey before retirement:

- Resume the in-progress attempt.
- Expected: the attempt remains resumable and completable.

Pass:

- Retired surveys cannot be newly started.
- Existing attempts remain resumable/completable.

---

## Destructive Edit Policy Check

Do not run this on valuable data.

While the survey is published or retired:

- Try deleting a question or answer option from the admin builder.
- Current Phase 4 behavior may allow this.
- Expected for current implementation: deletion may succeed.
- Expected long-term policy: this should be blocked, versioned, or explicitly confirmed before production.

Record this as:

```txt
Known follow-up confirmed: published/retired destructive edit policy needed.
```

This corresponds to Phase 4 Claude review finding C1.

---

## Visual And Accessibility Review

Check desktop width:

- Survey list and builder workspace fit without overlap.
- Long survey/question/option text wraps.
- Buttons remain readable.
- Status pills do not overlap text.

Check narrow/mobile width:

- Admin panels stack vertically.
- Forms remain usable.
- Inputs and buttons do not overflow.

Keyboard pass:

- Tab through the admin builder.
- Confirm controls receive visible focus.
- Confirm forms can be submitted with keyboard.

Screen-reader/accessibility notes to inspect manually:

- Option and tag inline inputs should be reviewed because Phase 4 Claude review flagged placeholder-only fields as a minor accessibility issue.

---

## API/Network Spot Checks From Browser DevTools

During the UI test, inspect Network responses:

- Admin `/api/surveys` responses may include `answerTags`.
- User dashboard and survey-taking responses must not include `answerTags`.
- Failed publish attempts should return clear 400 errors.
- Non-admin admin-route attempts should return 403 from protected APIs if directly called.

Pass:

- Hidden tags only appear in admin responses.
- Errors are meaningful and do not leak stack traces.

---

## Results Template

Copy this section into the phase notes after testing.

```txt
Phase 4 UI Test Results

Date:
Tester:
Browser:
Database:

Admin route protection:
Pass/Fail:
Notes:

Survey creation/metadata:
Pass/Fail:
Notes:

Question CRUD/reorder:
Pass/Fail:
Notes:

Option CRUD/reorder:
Pass/Fail:
Notes:

Hidden tags:
Pass/Fail:
Notes:

Publish validation:
Pass/Fail:
Notes:

Conditional rule:
Pass/Fail:
Notes:

User survey-taking:
Pass/Fail:
Notes:

Retire behavior:
Pass/Fail:
Notes:

Hidden tag non-exposure:
Pass/Fail:
Notes:

Visual/accessibility:
Pass/Fail:
Notes:

Known follow-ups observed:
- C1 destructive edit policy:
- S1 insert-at-position/reorder smoke:
- S2 forward-only jumps:

Overall verdict:
```
