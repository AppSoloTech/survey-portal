# Claude Review Handoff Template

Use this template after Codex implementation and before applying review fixes.

Save the completed handoff at:

```txt
notes/claude_handoff_phase_X.txt
```

Do not save phase-specific handoffs in `markdown/`. The `markdown/` directory holds reusable workflow/reference documents. The `notes/` directory holds per-phase AI handoffs and review outputs.

`notes/` is tracked project memory for phase-specific handoffs and reviews. After review fixes are handled, summarize the durable review outcome in `markdown/PHASE_LOG.md`.

---

# Claude Review Handoff — Phase X

Claude Code instructions:

- Read this handoff and the reference documents before reviewing.
- Review the current phase diff only.
- Write the full review to the path listed below.
- After writing the file, summarize the result in chat.
- Do not leave the review only in chat.
- Do not modify source files during review unless the human developer explicitly asks for fixes.

## Review Output Requirement

Write the full review to:

```txt
notes/claude_review_phase_X.txt
```

Then summarize the result in chat. Do not leave the review only in chat.

## Review Goal

Please review this phase for:

- architectural consistency
- product UX alignment
- maintainability
- unnecessary complexity
- security concerns
- auth and data exchange security concerns
- app environment safety

## Reference Documents

Read these before reviewing:

- `markdown/ARCHITECTURE_PRINCIPLES.md`
- `markdown/DATA_MODEL_VISION.md`
- `markdown/FLOW.md`
- `markdown/REVIEW_CHECKLIST.md`
- `markdown/PHASE_LOG.md`
- `prompts/MASTER_PRODUCT_CONTEXT.txt`
- `markdown/GLOBAL_DEVELOPMENT_ENVIRONMENT.txt`
- `prompts/prompt_X.txt`

## Phase Scope

Implemented:

- Item 1
- Item 2
- Item 3

Non-goals:

- Item 1
- Item 2

Known tradeoffs:

- Tradeoff 1
- Tradeoff 2

Deferred work:

- Deferred item with reason

## Diff To Review

Run or inspect:

```bash
git diff
git ls-files --others --exclude-standard
```

If the phase started from a checkpoint commit, include:

```bash
git diff CHECKPOINT_SHA..HEAD
```

## Validation Already Run

Commands:

```bash
# command
```

Results:

- Passed:
- Failed:
- Not run:

Manual testing:

- Test 1
- Test 2

## Specific Questions

Did this violate DATA_MODEL_VISION.md?

Did any schema changes:
- break entity relationships?
- duplicate data unnecessarily?
- bypass hidden tag rules?
- introduce hardcoded survey logic?
- weaken conditional rule flexibility?

Are survey entities still database-driven?

Are reporting requirements still achievable from the current schema?

## Requested Output Format

Write `notes/claude_review_phase_X.txt` using this format:

1. Critical issues
2. Suggested improvements
3. Acceptable tradeoffs
4. Questions or assumptions
5. Product UX alignment notes
6. Commit readiness
