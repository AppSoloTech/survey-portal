# Seeds

Seed files are for safe local development data only. They must not contain
production user data, tokens, secrets, or client-owned survey content.

Do not run these seed files against hosted, shared, staging, or production
databases. The Phase 2 seed intentionally creates a known local admin account
and resets that account password each time it is reapplied.

## Phase 2 Local Seed

Apply after migrations:

```bash
psql "$DATABASE_URL" -f database/seeds/0001_phase_2_seed.sql
```

The Phase 2 seed creates:

- admin account: `admin@example.test`
- local password: `AdminPass123!`
- published test survey with text, integer, single-select, and multi-select questions
- sample hidden answer tags
- one sample `JUMP_TO_QUESTION` conditional rule
