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
| `markdown/REVIEW_CHECKLIST.md` | Quality gate for implementation and review |
| `markdown/PHASE_TEMPLATE.md` | Reusable phase log entry template |
| `markdown/PHASE_LOG.md` | Durable project memory and phase decisions |
| `markdown/CLAUDE_REVIEW_TEMPLATE.md` | Per-phase review handoff template |
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
9. Older entries in `markdown/PHASE_LOG.md`

If a conflict changes product direction, architecture, security posture, or deployment assumptions, update the durable reference document and record the decision in `markdown/PHASE_LOG.md`.

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
- `markdown/REVIEW_CHECKLIST.md`
- current `prompts/prompt_X.txt`
- recent entries in `markdown/PHASE_LOG.md`

Confirm:

- phase goals
- non-goals
- expected user roles
- security boundaries
- database ownership boundaries
- data-model boundaries and deferred future entities
- expected validation commands

### Step 2 - Revalidate Roadmap Alignment

Before continuing to an older prompt, confirm whether it should be:

- implemented as written
- revised before implementation
- split into smaller phases
- deferred
- discarded because it no longer matches product direction

Record the decision in `markdown/PHASE_LOG.md` when it affects future work.

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
phase-3-survey-builder
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
- run build and relevant tests
- confirm database migrations are reviewed
- confirm rollback expectations are understood

---

## Prompt Organization

Prompt files live in:

```txt
prompts/
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
- review findings are addressed or intentionally deferred
- `markdown/PHASE_LOG.md` is updated
- no real secrets are committed
- the phase can be reviewed from a clean diff

Completion is not defined only by compilation or an AI summary.
