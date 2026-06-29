# Unreleased

Release title: Next Release

Summary: Replace this with a short summary before running `npm run release:prepare`.

## Added

- Added an Admin-only read API foundation for stored command-line performance test reports.
- Added an operator-run CLI harness for seeding load-test data, running local/k6 performance checks, and persisting summarized reports.

## Operational Notes

- Hosted environments must run `npm run db:migrate:hosted` before Phase 50 CLI performance test runs can persist hosted results.
- Configure `.env.loadtest` from `.env.loadtest.example`; hosted load-test writes require an approved test window and explicit confirmation.
