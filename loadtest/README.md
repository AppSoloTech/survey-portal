# CLI Performance Testing

Phase 50 adds an operator-run harness. The app remains a report viewer only:
there are no browser controls to start, stop, or schedule load tests, and no
Azure runner resources are created.

## Prerequisites

- Apply the Phase 49 migration before persisting results.
  - Hosted: `npm run db:migrate:hosted`
  - Local/dev: `npm run db:migrate`
- Install k6 separately for HTTP load scenarios. See the official Grafana k6
  install docs: `https://grafana.com/docs/k6/latest/set-up/install-k6/`.
- Copy `.env.loadtest.example` to `.env.loadtest` and fill in target settings.
- Run hosted tests only during an approved window.

Check local readiness with:

```bash
npm run loadtest:doctor -- --dev
```

`loadtest:doctor` verifies `.env.loadtest`, target guard parsing, and whether
`k6` is available on `PATH`.

## Safety Model

- `.env.loadtest` is parsed explicitly. The harness does not read `.env`.
- Localhost HTTP or DB targets require `--dev`.
- Hosted writes require an interactive confirmation or `--yes`.
- Hosted PostgreSQL uses TLS with `rejectUnauthorized: true`.
- Generated manifests and reports are ignored:
  - `loadtest/.manifest.<run_key>.json`
  - `loadtest/reports/`

## Operator Workflow

```bash
npm run loadtest:seed -- --run-key lt-YYYYMMDD --yes
npm run loadtest:run -- --run-key lt-YYYYMMDD --profile smoke --yes
npm run loadtest:suite -- --run-key lt-YYYYMMDD --suite small --yes
npm run loadtest:db -- --run-key lt-YYYYMMDD --yes
npm run loadtest:teardown -- --run-key lt-YYYYMMDD --dry-run
npm run loadtest:teardown -- --run-key lt-YYYYMMDD --yes
```

For local development targets, add `--dev`:

```bash
npm run loadtest:seed -- --dev --run-key local-smoke
npm run loadtest:run -- --dev --run-key local-smoke --persistence-smoke
npm run loadtest:suite -- --dev --run-key local-smoke --persistence-smoke
```

`--persistence-smoke` writes a started row, samples PostgreSQL, writes local
artifacts, and completes the row without invoking k6. Use it only to verify
Phase 49 persistence and reporting plumbing.

## Seed Data

`loadtest:seed` creates clearly namespaced fake data:

- `LOADTEST <run_key>` survey/category names
- `loadtest+<run_key>-...@example.invalid` users
- a published survey with text, integer, single-select, and multi-select
  questions
- completed registered attempts for read-heavy Admin reporting endpoints
- an enabled anonymous public token for write-heavy k6 flows

The ignored manifest records created IDs, the fake Admin credentials, and the
anonymous token needed by `loadtest:run`.

## HTTP Profiles

The k6 script supports:

- `smoke`: low-volume read-heavy path
- `read-heavy`: Admin reporting and export reads
- `write-heavy`: anonymous start, page answer, complete
- `mixed`: read-heavy plus anonymous completion traffic

`smoke` uses fixed VUs. Non-smoke profiles use `ramping-vus` and read stages
from `LOADTEST_RAMPING_STAGES`, a one-line JSON array such as:

```txt
[{"duration":"1m","target":10},{"duration":"2m","target":25},{"duration":"2m","target":50},{"duration":"1m","target":0}]
```

Write-heavy tests use the anonymous public flow by default so each iteration
gets a fresh attempt. Do not use one shared registered user for repeated
completion load; the app intentionally returns 409 after a registered user has
completed the same survey.

## Anonymous Rate Limits

Anonymous public routes share:

- `ANONYMOUS_SURVEY_RATE_LIMIT_WINDOW_MS`
- `ANONYMOUS_SURVEY_RATE_LIMIT_MAX`

The default limit is conservative for normal public usage. For meaningful
anonymous write-load tests, temporarily raise `ANONYMOUS_SURVEY_RATE_LIMIT_MAX`
in App Service settings for the approved test window, then reset it afterward.
If a future conversion scenario uses anonymous `/register`, remember it is also
governed by `AUTH_REGISTER_RATE_LIMIT_MAX`.

## Capacity Suites

`loadtest:suite` runs multiple child profiles under one suite key, persists one
`performance_test_suites` row, links each child `performance_test_runs` row, and
stores bounded `performance_test_samples` rows for k6-shaped HTTP evidence and
SQL summaries.

```bash
npm run loadtest:suite -- --run-key lt-YYYYMMDD --suite small --yes
npm run loadtest:suite -- --run-key lt-YYYYMMDD --suite standard --include-direct-db --yes
npm run loadtest:suite -- --run-key lt-YYYYMMDD --suite capacity --max-vus 75 --allow-capacity --yes
```

Presets:

- `small`: smoke plus mixed/read/write stages up to 10 VUs.
- `standard`: mixed/read/write stages bracketing roughly 25 VUs.
- `capacity`: operator-defined upper bound, requiring `--allow-capacity` or
  `LOADTEST_SUITE_ALLOW_CAPACITY=true`.

Useful options:

- `--suite-key <key>`: defaults to `<run-key>-suite`.
- `--profiles mixed,read-heavy,write-heavy`: override preset profiles.
- `--suite-stages '[{"label":"10vu","duration":"1m","targetVus":10}]'`
- `--early-stop-error-rate 0.05`
- `--early-stop-p95-ms 2000`
- `--include-direct-db true`
- `--persistence-smoke`

The suite intentionally runs stage-sized child tests instead of storing raw k6
event streams. This gives bracketed evidence for the first degradation range
without implying exact per-bucket p95 values when k6 streaming output is not
being aggregated. Each sample row carries caveats when metrics are approximate
or unavailable.

Hosted suite runs still require interactive confirmation or `--yes`. Write-heavy
suite profiles use fresh anonymous attempts per iteration; raise
`ANONYMOUS_SURVEY_RATE_LIMIT_MAX` only for the approved test window and reset it
afterward.

## SQL Metrics

The harness samples PostgreSQL through the load-test DB connection:

- `pg_stat_activity`: active, total, and waiting connections
- `pg_stat_database`: transaction and block read/hit deltas

If permissions are insufficient, the run still persists HTTP/DB summaries and
marks SQL metrics as unavailable.

For hosted PostgreSQL, prefer granting the load-test role `pg_monitor` /
`pg_read_all_stats` or using the same DB role as the app during the approved
test window. Otherwise `pg_stat_activity.state` can be hidden for sessions owned
by other roles, undercounting active app connections. Set
`LOADTEST_APP_DB_POOL_MAX` and `LOADTEST_APP_INSTANCE_COUNT` so app-pool
classification matches the deployed App Service scale-out shape.
The database-pressure connection threshold scales from that same configured
pool ceiling instead of using a fixed connection count.

## Artifacts And Persistence

Each run writes:

- `performance_test_runs` summary row
- `loadtest/reports/<run_key>.summary.json`
- `loadtest/reports/<run_key>.report.md`
- k6 summary JSON when k6 runs

Each suite additionally writes:

- `performance_test_suites` aggregate row
- linked child `performance_test_runs` rows
- bounded `performance_test_samples` rows
- `loadtest/reports/<suite_key>.summary.json`
- `loadtest/reports/<suite_key>.report.md`

Full raw k6 event streams are not stored in PostgreSQL.

If a run is interrupted after persistence starts, the harness attempts to mark
the row `aborted`. If the process is force-killed, operators may need to inspect
and manually mark stale `running` rows.

Do not put a real reusable personal/admin password in `LOADTEST_ADMIN_PASSWORD`.
Use a dedicated fake load-test Admin account or let `loadtest:seed` create one.
