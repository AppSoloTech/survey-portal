// Ships code and database together: pushes main (which triggers the GitHub
// Actions build and Azure deploy) and then applies pending migrations to the
// hosted database via scripts/migrate-hosted.mjs.
//
// Each half also works on its own:
//   git push origin main          code only
//   npm run db:migrate:hosted     database only
//
// Usage:
//   npm run deploy                push, then migrate (asks to confirm)
//   npm run deploy -- --yes       push, then migrate without prompting
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function git(args) {
  const result = spawnSync("git", args, { cwd: rootDir, encoding: "utf8" });

  if (result.status !== 0) {
    fail(`git ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
  }

  return result.stdout.trim();
}

const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);

if (branch !== "main") {
  fail(`Deploys ship from main; current branch is ${branch}.`);
}

if (git(["status", "--porcelain"]) !== "") {
  fail("Working tree is not clean. Commit or stash changes before deploying.");
}

git(["fetch", "origin", "main"]);

const counts = git(["rev-list", "--left-right", "--count", "origin/main...HEAD"]).split(/\s+/);
const behind = Number(counts[0]);
const ahead = Number(counts[1]);

if (behind > 0) {
  fail(`Local main is ${behind} commit(s) behind origin/main. Pull and reconcile first.`);
}

if (ahead === 0) {
  console.log("Nothing to push; origin/main already matches local main.");
  console.log("Continuing to the hosted database check...");
} else {
  console.log(`Pushing ${ahead} commit(s) to origin/main (triggers the Azure deploy workflow)...`);

  const push = spawnSync("git", ["push", "origin", "main"], { cwd: rootDir, stdio: "inherit" });

  if (push.status !== 0) {
    fail("git push failed; hosted database was not touched.");
  }
}

console.log("");

const migrateArgs = [path.join(__dirname, "migrate-hosted.mjs")];

if (process.argv.includes("--yes")) {
  migrateArgs.push("--yes");
}

const migrate = spawnSync(process.execPath, migrateArgs, { cwd: rootDir, stdio: "inherit" });

process.exit(migrate.status ?? 1);
