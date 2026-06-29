import { existsSync, readFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  confirmWriteIfNeeded,
  loadtestDir,
  printTargetSummary,
  resolveLoadtestConfig
} from "./lib/env.mjs";
import { createLoadtestPool } from "./lib/pg.mjs";

async function main() {
  const config = resolveLoadtestConfig();
  const manifest = readManifest(config.runKey);
  const dryRun = config.cli.dryRun || !config.yes;
  printTargetSummary(config, dryRun ? "dry-run teardown load-test data" : "teardown load-test data");

  if (!dryRun) {
    await confirmWriteIfNeeded(config, "Teardown load-test data");
  }

  const pool = createLoadtestPool(config);

  try {
    const counts = await collectDeleteCounts(pool, manifest);
    printCounts(counts, dryRun);

    if (!dryRun) {
      await deleteManifestedData(pool, manifest);
      unlinkSync(manifestPath(config.runKey));
      console.log(`Deleted load-test data and manifest for ${config.runKey}`);
    } else {
      console.log("Dry run only. Pass --yes to delete these rows.");
    }
  } finally {
    await pool.end();
  }
}

function readManifest(runKey) {
  const filePath = manifestPath(runKey);

  if (!existsSync(filePath)) {
    throw new Error(`Manifest not found: ${filePath}`);
  }

  return JSON.parse(readFileSync(filePath, "utf8"));
}

function manifestPath(runKey) {
  return path.join(loadtestDir, `.manifest.${runKey}.json`);
}

async function collectDeleteCounts(pool, manifest) {
  const surveyIds = [manifest.surveyId].filter(Boolean);
  const userIds = [manifest.admin?.id, ...(manifest.users ?? []).map((user) => user.id)].filter(Boolean);
  const userEmails = [
    manifest.admin?.email,
    ...(manifest.users ?? []).map((user) => user.email)
  ].filter(Boolean);

  const [surveys, users, runs] = await Promise.all([
    pool.query(
      `select count(*)::int as count
       from surveys
       where id = any($1::int[])
         and title like $2`,
      [surveyIds, `${manifest.marker}%`]
    ),
    pool.query(
      `select count(*)::int as count
       from users
       where id = any($1::int[])
         and email = any($2::text[])`,
      [userIds, userEmails]
    ),
    pool.query(
      `select count(*)::int as count
       from performance_test_runs
       where run_key = $1
          or run_key like $2`,
      [manifest.runKey, `${manifest.runKey}-%`]
    )
  ]);

  return {
    surveys: surveys.rows[0].count,
    users: users.rows[0].count,
    performanceRuns: runs.rows[0].count
  };
}

function printCounts(counts, dryRun) {
  console.log(`${dryRun ? "Would delete" : "Deleting"}:`);
  console.log(`  surveys: ${counts.surveys}`);
  console.log(`  users: ${counts.users}`);
  console.log(`  performance runs: ${counts.performanceRuns}`);
}

async function deleteManifestedData(pool, manifest) {
  const client = await pool.connect();
  const surveyIds = [manifest.surveyId].filter(Boolean);
  const userIds = [manifest.admin?.id, ...(manifest.users ?? []).map((user) => user.id)].filter(Boolean);
  const userEmails = [
    manifest.admin?.email,
    ...(manifest.users ?? []).map((user) => user.email)
  ].filter(Boolean);

  try {
    await client.query("begin");
    await client.query(
      `delete from performance_test_runs
       where run_key = $1
          or run_key like $2`,
      [manifest.runKey, `${manifest.runKey}-%`]
    );
    await client.query(
      `delete from surveys
       where id = any($1::int[])
         and title like $2`,
      [surveyIds, `${manifest.marker}%`]
    );
    await client.query(
      `delete from survey_categories
       where id = $1
         and name like $2`,
      [manifest.categoryId, `${manifest.marker}%`]
    );
    await client.query(
      `delete from users
       where id = any($1::int[])
         and email = any($2::text[])`,
      [userIds, userEmails]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      `loadtest:teardown failed: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  });
}
