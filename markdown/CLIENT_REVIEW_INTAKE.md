# Client Review Intake

Use this workflow when feedback arrives from a client review, demo, manual test
pass, or exploratory QA session.

The goal is to keep raw feedback visible while still converting work into small,
reviewable phase prompts before implementation begins.

---

## Where Feedback Goes

Raw feedback may be saved in:

```txt
notes/client_review_YYYY-MM-DD.txt
```

Use `notes/` for phase-specific or meeting-specific material. Do not commit
production secrets, credentials, private health information, or client-owned
survey response data. Summarize sensitive details instead.

Reusable decisions, accepted deferrals, and durable process updates belong in:

- `markdown/PHASE_LOG.md`
- `markdown/FOLLOW_UPS.md`
- durable reference docs under `markdown/`

---

## Intake Workflow

### 1. Capture Raw Notes

Keep the client's wording intact where practical. Do not rewrite feedback into
implementation tasks too early.

For each item, preserve:

- what the client said
- where they saw it
- expected behavior, if stated
- screenshot, route, account role, browser width, or data setup, if relevant
- whether it blocks delivery, is polish, or is a future idea

### 2. Triage Before Prompting

Group each item as one of:

- bug or regression
- security, privacy, or data-visibility risk
- broken workflow
- feature request
- UX polish
- reporting or data question
- deployment/setup issue
- unclear item needing confirmation

Flag whether the item touches:

- database schema or migrations
- API contracts
- participant-facing survey behavior
- hidden-tag visibility
- authentication or authorization
- production deployment or secrets
- existing tests or manual validation plans

### 3. Split Into Phases

Prefer smaller phases when feedback spans multiple surfaces.

Split work when items:

- touch unrelated user workflows
- require different review lenses, such as security vs. visual polish
- require schema/API changes plus unrelated frontend work
- depend on a product decision the client has not confirmed
- would make validation too broad for one review cycle

It is acceptable to batch tightly related issues into one list-driven phase,
especially when using `prompts/prompt_10.txt` as the pattern.

### 4. Draft A Phase Prompt

Create the next prompt in:

```txt
prompts/prompt_X.txt
```

Start from:

```txt
prompts/PHASE_PROMPT_TEMPLATE.txt
```

The prompt should include:

- source note path
- received feedback summary
- scope and non-goals
- assumptions
- open questions
- implementation priorities
- acceptance criteria
- validation expectations
- required documentation updates
- review handoff path

### 5. Freeze Before Implementation

During brainstorming, keep editing the intake notes or draft prompt. Do not
start source-code implementation until the human developer explicitly starts the
phase or confirms the prompt is ready to execute.

Good start phrase:

```txt
Start prompts/prompt_X.txt
```

If the human gives a clear implementation request without that phrase, Codex may
still proceed, but should first restate the active phase scope and assumptions.

---

## Prompt Quality Bar

A phase prompt is ready when:

- every feedback item is fixed, deferred, or explicitly out of scope
- risky changes are called out before implementation
- non-goals prevent accidental expansion
- expected tests and manual checks are named
- the review assistant can understand what changed without reading chat history
- `markdown/FOLLOW_UPS.md` has a home for accepted deferrals

