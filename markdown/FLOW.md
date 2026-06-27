# Development Flow

This document defines the sustainable development workflow for the Survey Portal MVP.

The goal is to keep implementation phases small, reviewable, secure, and aligned with the product and architecture baseline.

---

## Workflow Document Map

| File | Purpose |
| --- | --- |
| `prompts/MASTER_PRODUCT_CONTEXT.txt` | Product goals, roles, survey concepts, MVP boundaries |
| `markdown/ARCHITECTURE_PRINCIPLES.md` | Technical stack, architecture rules, security posture |
| `markdown/DATA_MODEL_VISION.md` | Data model vision and MVP schema guardrails |
| `markdown/GLOBAL_DEVELOPMENT_ENVIRONMENT.txt` | Local and deployment environment assumptions |
| `markdown/FLOW.md` | Phase workflow and AI-assisted development process |
| `markdown/CLIENT_REVIEW_INTAKE.md` | Client feedback intake and phase prompt drafting workflow |
| `markdown/REVIEW_CHECKLIST.md` | Quality gate for implementation and review |
| `markdown/ACCESSIBILITY_TEST_PLAN.md` | Repeatable public/user accessibility verification workflow |
| `markdown/ACCESSIBILITY_PRIMITIVES.md` | Public/user accessibility primitive usage rules |
| `markdown/PHASE_TEMPLATE.md` | Reusable phase log entry template |
| `markdown/PHASE_LOG.md` | Durable project memory and phase decisions |
| `markdown/FOLLOW_UPS.md` | Active deferred work and loose ends to revisit before future phases |
| `markdown/RELEASE_NOTES.md` | Release-note format, versioning source of truth, and deploy validation workflow |
| `markdown/CLAUDE_REVIEW_TEMPLATE.md` | Per-phase review handoff template |
| `prompts/PHASE_PROMPT_TEMPLATE.txt` | Reusable template for drafting new phase prompts |
| `prompts/prompt_X.txt` | Phase-specific implementation prompt |
| `notes/claude_handoff_phase_X.txt` | Per-phase review handoff artifact |
| `notes/claude_review_phase_X.txt` | Per-phase review output artifact |

The `markdown/` directory is for durable project workflow and reference documents. The `notes/` directory is for phase-specific handoffs, review outputs, and temporary-but-tracked project memory.

---

## Source Of Truth Order

When documents conflict, resolve them in this order:

1. Explicit human instruction for the current phase
2. `prompts/MASTER_PRODUCT_CONTEXT.txt`
3. `markdown/ARCHITECTURE_PRINCIPLES.md`
4. `markdown/DATA_MODEL_VISION.md`
5. `markdown/GLOBAL_DEVELOPMENT_ENVIRONMENT.txt`
6. Current `prompts/prompt_X.txt`
7. `markdown/FLOW.md`
8. `markdown/REVIEW_CHECKLIST.md`
9. `markdown/FOLLOW_UPS.md`
10. `markdown/RELEASE_NOTES.md` for release-note and production-publish process
11. Older entries in `markdown/PHASE_LOG.md`

If a conflict changes product direction, architecture, security posture, or deployment assumptions, update the durable reference document and record the decision in `markdown/PHASE_LOG.md`.

---

## Client Review Intake

When new feedback arrives from a client review, demo, manual QA session, or exploratory test pass, use `markdown/CLIENT_REVIEW_INTAKE.md` before implementation.

Recommended flow:

1. Capture raw feedback in `notes/client_review_YYYY-MM-DD.txt` when the feedback is more than a short chat message.
2. Triage each item by risk, product area, and implementation surface.
3. Split unrelated or high-risk work into separate phases.
4. Draft the next `prompts/prompt_X.txt` from `prompts/PHASE_PROMPT_TEMPLATE.txt`.
5. Freeze the prompt before implementation begins.

During brainstorming, keep work in notes and draft prompts. Begin source-code implementation only after the human developer starts the phase or confirms the active phase scope.

---

## Core Philosophy

Use AI tools as:

- implementation assistants
- review assistants
- architecture reinforcement
- documentation helpers

Do not use AI tools as autonomous product owners or final approvers.

The human developer remains responsible for:

- product direction
- architecture decisions
- testing acceptance
- deployment approval
- final commit and release decisions

---

## AI Tool Roles

### Codex

Codex is the implementation assistant.

Use Codex for:

- scaffolding
- feature implementation
- refactors
- wiring frontend, backend, and database layers
- creating review handoffs
- addressing approved review findings

Codex should:

- stay within the current phase scope
- follow the architecture and product documents
- avoid speculative future systems
- validate changes before declaring completion
- record durable decisions in `markdown/PHASE_LOG.md`

### Claude Code

Claude Code is the review and architecture validation assistant.

Use Claude Code for:

- reviewing diffs
- identifying architectural drift
- identifying product or UX drift
- identifying overengineering
- checking auth, authorization, and data exposure risks
- checking environment and deployment safety
- reviewing test gaps

Claude Code should not:

- rewrite large sections without explicit approval
- redesign the architecture without approval
- introduce unrelated frameworks
- override durable project documents

---

## Phase Execution Flow

Each phase should follow this lifecycle.

### Step 1 - Review Context

Before implementation, read:

- `prompts/MASTER_PRODUCT_CONTEXT.txt`
- `markdown/ARCHITECTURE_PRINCIPLES.md`
- `markdown/DATA_MODEL_VISION.md`
- `markdown/GLOBAL_DEVELOPMENT_ENVIRONMENT.txt`
- `markdown/FLOW.md`
- `markdown/CLIENT_REVIEW_INTAKE.md` when the phase comes from client feedback
- `markdown/REVIEW_CHECKLIST.md`
- `markdown/FOLLOW_UPS.md`
- current `prompts/prompt_X.txt`
- recent entries in `markdown/PHASE_LOG.md`
- for page-based survey phases, confirm whether the work changes the durable
  survey experience decision in `markdown/DATA_MODEL_VISION.md`

Confirm:

- phase goals
- non-goals
- expected user roles
- security boundaries
- database ownership boundaries
- data-model boundaries and deferred future entities
- expected validation commands
- active follow-ups that should be fixed, deferred again, or folded into the phase scope

### Step 2 - Revalidate Roadmap Alignment

Before continuing to an older prompt, confirm whether it should be:

- implemented as written
- revised before implementation
- split into smaller phases
- deferred
- discarded because it no longer matches product direction

Record the decision in `markdown/PHASE_LOG.md` when it affects future work.

Review `markdown/FOLLOW_UPS.md` before implementation and decide whether any active follow-up should be included in the current phase. If a phase introduces new deferred work, add it to `markdown/FOLLOW_UPS.md` before commit readiness.

### Step 3 - Create Or Checkout A Phase Branch

Use a dedicated branch for each phase unless the change is intentionally tiny and the human developer approves working on the current branch.

Recommended naming:

```txt
phase-X-short-name
```

Examples:

```txt
phase-0-foundation
phase-1-auth
phase-2-survey-schema
phase-3-user-survey-experience
phase-4-admin-survey-builder
```

Typical command flow:

```bash
git status
git checkout main
git checkout -b phase-X-short-name
```

Do not switch branches with unrelated uncommitted work present unless the human developer decides how to handle it.

### Step 4 - Create A Checkpoint

Before implementation:

```bash
git status
git add .
git commit -m "checkpoint before phase X"
```

If unrelated uncommitted changes exist, do not include them without confirming they belong to the phase.

### Step 5 - Implement With Codex

Keep implementation scoped to the phase prompt.

Codex closeout rule:

- After implementing any `prompts/prompt_X.txt`, Codex must generate
  `notes/claude_handoff_phase_X.txt` before claiming the phase implementation is
  complete.
- The final implementation summary must mention the handoff path.
- This requirement applies even when Claude review will happen later.

Prefer:

- simple full-stack TypeScript
- React frontend served by Express for production
- REST APIs under `/api`
- PostgreSQL as the source of truth
- database-driven survey definitions
- server-side auth and authorization checks
- environment-variable configuration

Avoid:

- microservices
- queues or event buses
- hardcoded survey logic
- hidden tags shown to participants
- frontend-only authorization
- production secrets in source control
- broad rewrites unrelated to the phase

If the phase prompt conflicts with durable reference documents, pause and resolve the conflict before implementation.

### Step 6 - Manual Review And Validation

Before Claude review:

- inspect changed files
- inspect dependency changes
- verify secrets were not committed
- run available validation commands
- manually test changed workflows when practical

Common commands once the project is scaffolded:

```bash
npm install
npm run typecheck
npm run build
npm run lint
npm run dev
```

If a command is unavailable, record why and add the expected future command if known.

### Step 7 - Prepare Claude Handoff

After every prompt implementation, Codex must prepare a phase-specific Claude handoff before the phase is considered ready for review or commit.

Prepare:

```txt
notes/claude_handoff_phase_X.txt
```

Use `markdown/CLAUDE_REVIEW_TEMPLATE.md`.

The handoff must include:

- phase scope
- non-goals
- known tradeoffs
- commands run and results
- manual testing performed
- diff instructions, including untracked files
- specific questions for review
- required review output path

The handoff must explicitly instruct Claude Code to write the full review to:

```txt
notes/claude_review_phase_X.txt
```

Do not rely on chat-only review output. The durable review file is required project memory.

### Step 8 - Claude Review

Ask Claude Code to review using the handoff:

```txt
Please perform a code review for phase X using notes/claude_handoff_phase_X.txt.
Write the full review to notes/claude_review_phase_X.txt, then summarize the result in chat.
```

Claude should review:

- architectural consistency
- product alignment
- maintainability
- unnecessary complexity
- security concerns
- auth and authorization correctness
- data exposure risks
- environment safety
- test coverage and validation gaps

Claude must write the full review to the phase-specific path named in the handoff:

```txt
notes/claude_review_phase_X.txt
```

Claude may summarize in chat after writing the file, but the file is the source of record.

### Step 9 - Human Decision

The human developer decides:

- which review findings must be fixed now
- which can be deferred
- which are accepted tradeoffs
- which are rejected

Do not blindly apply all review suggestions.

### Step 10 - Targeted Fixes

Use Codex for:

- approved fixes
- scoped cleanup
- limited refactors

Avoid:

- broad rewrites
- architecture redesign
- unrelated polish
- expanding phase scope

### Step 11 - Final Testing

Run the relevant checks again after fixes.

Minimum expectations once available:

- typecheck passes
- build passes
- backend starts
- frontend starts
- `/api/health` responds
- affected routes or workflows were manually exercised
- no real secrets are committed

### Step 12 - Update Phase Log

Update `markdown/PHASE_LOG.md` with:

- what was built
- important decisions
- issues encountered
- review findings
- accepted fixes
- deferred work and reasons
- validation commands and results
- paths to handoff and review artifacts
- commit readiness

If Claude review has not been run yet, record the handoff path and mark the review as pending. Do not leave the review artifact status ambiguous.

Use `markdown/PHASE_TEMPLATE.md` for new entries.

### Step 13 - Commit Phase

After successful validation and review decisions:

```bash
git add .
git commit -m "complete phase X"
```

---

## Deployment Flow

The MVP target is Azure:

- one Azure App Service for the Express app and served React build
- Azure PostgreSQL Flexible Server for production data
- Azure App Service configuration for production environment variables

Deployment is not part of a phase unless the phase prompt explicitly says so.

Before any production deployment:

- verify production secrets are only in Azure configuration
- verify `.env` is ignored
- verify `.env.example` contains placeholders only
- verify production-bound coding sessions updated
  `markdown/releases/unreleased.md` with admin-readable draft notes
- run `npm run release:prepare` to bump the root app version and promote the
  draft into `markdown/releases/vX.Y.Z.md`
- run `npm run release:check`
- run build and relevant tests
- confirm database migrations are reviewed
- confirm rollback expectations are understood

Release-note commands:

```bash
npm run release:draft
npm run release:prepare
npm run release:notes
npm run release:check
```

`npm run deploy` validates release notes against `origin/main` before pushing.
Direct pushes to `main` are validated by the GitHub Actions production workflow
before the Azure deploy step.

---

## Prompt Organization

Prompt files live in:

```txt
prompts/
```

Use this template for new phase prompts:

```txt
prompts/PHASE_PROMPT_TEMPLATE.txt
```

Naming convention:

```txt
prompt_0.txt
prompt_1.txt
prompt_2.txt
```

Each phase prompt should:

- reference durable architecture and product docs
- reference `markdown/DATA_MODEL_VISION.md` when database schema, survey flow, response storage, reporting, or conditional logic are involved
- define phase scope clearly
- define non-goals clearly
- name expected validation steps
- call out security-sensitive work
- avoid ambiguous terminology
- avoid future features unless explicitly part of the phase

---

## Development Priority Order

Prioritize:

1. Security and data protection
2. Architecture correctness
3. Maintainability
4. Product fit
5. Validation and operational reliability
6. UX clarity
7. Performance optimization
8. Advanced features

---

## Definition Of Done

A phase is complete when:

- phase requirements are implemented
- non-goals were respected
- validation commands were run or explicitly documented as unavailable
- relevant manual tests were performed
- `notes/claude_handoff_phase_X.txt` exists
- Codex has mentioned `notes/claude_handoff_phase_X.txt` in the implementation closeout
- `notes/claude_review_phase_X.txt` exists, or the phase log explicitly says Claude review is pending
- review findings are addressed or intentionally deferred
- `markdown/PHASE_LOG.md` is updated
- production-bound changes update `markdown/releases/unreleased.md`, or have
  already been promoted into a matching versioned release note under
  `markdown/releases/`
- no real secrets are committed
- the phase can be reviewed from a clean diff

Completion is not defined only by compilation or an AI summary.
