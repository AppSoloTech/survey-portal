# Tag Catalog Seed

Snapshot of the production tag catalog (category groups + tag definitions),
captured **2026-06-25** and reproduced in local development databases as seed
data so the local catalog mirrors production's grouped structure.

## What is seeded

The production database accumulated 63 tag definitions but left them all
ungrouped ("Holding Area"). A one-time job bucketed them into 8 category groups
named after each tag's `tag_key` (the bold prefix in the admin catalog, e.g.
`Equity`, `Federal Civil Rights`). That grouped result is the snapshot.

| # | Group (`tag_groups.name`) | Tags |
|---|---|---|
| 1 | Equity | 8 |
| 2 | Federal Civil Rights | 6 |
| 3 | HCBS | 11 |
| 4 | Health, Safety, and Cost | 10 |
| 5 | Labor and Workforce | 5 |
| 6 | Medicaid / 1115 Waiver | 11 |
| 7 | NJDDD Administrative Practice | 11 |
| 8 | OPIA/administrative accountability | 1 |

Total: **8 groups, 63 tag definitions.**

## Where it lives

- [`database/seeds/0004_tag_catalog_seed.sql`](../database/seeds/0004_tag_catalog_seed.sql)
  — the seed. Inserts the 8 groups, then inserts the 63 tag definitions and
  links each to its group with a per-group `display_order`.

It is applied automatically, after migrations, by any run that applies the
`database/seeds/` directory in filename order — in practice `npm run db:reset`
(see [`scripts/reset-local-db.mjs`](../scripts/reset-local-db.mjs)). Because it
sorts after `0003`, the production catalog is the last seed to touch
`tag_definitions`, so its grouping wins.

### Idempotency

Re-running the seed never duplicates or drifts:

- Groups upsert by `name` (`tag_groups_name_unique`), refreshing `display_order`.
- Tag definitions upsert by `(tag_key, tag_value)`
  (`tag_definitions_key_value_unique`), refreshing `group_id` and
  `display_order`.

Earlier local seeds (`0001`, `0003`) still attach hidden `answer_tags` and
`question_value_tags` to their test-survey options — those drive runner and
reporting tests — but they no longer register those tags in the catalog. So on a
fresh `db:reset` the catalog holds exactly the 63 grouped production tags and
nothing else.

## How the snapshot was produced

1. **Group production tags** — [`scripts/group-tags-by-key.mjs`](../scripts/group-tags-by-key.mjs)
   reads `.env.prod` only, refuses non-hosted hosts, dry-runs by default, and
   with `--yes` creates one group per distinct `tag_key` and assigns every tag's
   `group_id` in a single transaction.

   ```bash
   node scripts/group-tags-by-key.mjs        # dry run, prints the plan
   node scripts/group-tags-by-key.mjs --yes  # apply to the hosted database
   ```

2. **Copy to seed data** — the grouped rows were read back from production
   (`tag_groups` and `tag_definitions`) and serialized into
   `0004_tag_catalog_seed.sql`.

## Refreshing the snapshot

When the production catalog changes and the seed should catch up:

1. Re-run the grouping job against production if new ungrouped tags exist.
2. Read `tag_groups` (`name`, `display_order`) and `tag_definitions`
   (`tag_key`, `tag_value`, `group_id`, `display_order`) from production.
3. Regenerate `database/seeds/0004_tag_catalog_seed.sql` from those rows
   (same upsert shape as now) and update the counts/date above.
4. Verify with `npm run db:reset` against a local database.

Seed files are local-development data only and must never be applied to hosted,
shared, staging, or production databases — see
[`database/seeds/README.md`](../database/seeds/README.md).
