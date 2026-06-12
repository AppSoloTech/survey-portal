# Seeds

Seed files are for safe local development data only. They must not contain
production user data, tokens, secrets, or client-owned survey content.

Do not run these seed files against hosted, shared, staging, or production
databases. The Phase 2 seed intentionally creates a known local admin account
and resets that account password each time it is reapplied.

Do not apply seed files directly with `psql -f`. Use `npm run db:reset` for
disposable local development databases so the script-level `RUN_ENV`, host, and
hosted-URL guards execute before any seed SQL runs. Hosted environments should
use `npm run admin:provision` to create or promote admins.

## Phase 2 Local Seed

Apply after migrations:

```bash
npm run db:reset
```

The Phase 2 seed creates:

- admin account: `admin@example.test`
- local password: `AdminPass123!`
- published test survey with text, integer, single-select, and multi-select questions
- sample hidden answer tags
- one sample `JUMP_TO_QUESTION` conditional rule

## Straight Survey Seed (0002)

Applied automatically by the same `npm run db:reset` run. Creates two
published surveys with linear flows for dashboard and long-attempt testing:

- "Employee Onboarding Experience" — 8 questions
- "Workplace Satisfaction Survey" — 10 questions
- mixed question types (single/multi select, scale, integer, text)
- no conditional rules and no hidden tags
