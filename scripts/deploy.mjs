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
import { existsSync, readFileSync, readdirSync } from "node:fs";

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

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(rootDir, relativePath), "utf8"));
}

function readLatestReleaseSummary() {
  const releasesDir = path.join(rootDir, "markdown", "releases");

  if (!existsSync(releasesDir)) {
    return null;
  }

  const fileName = readdirSync(releasesDir)
    .filter((candidate) => /^v\d+\.\d+\.\d+\.md$/.test(candidate))
    .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))[0];

  if (!fileName) {
    return null;
  }

  const content = readFileSync(path.join(releasesDir, fileName), "utf8");
  const title = content.match(/^# v\d+\.\d+\.\d+ - (.+)$/m)?.[1] ?? "Untitled release";
  const releaseDate = content.match(/^Release date: (\d{4}-\d{2}-\d{2})$/m)?.[1] ?? "unknown date";

  return { fileName, releaseDate, title };
}

function printDeployPreflight({ ahead }) {
  const packageJson = readJson("package.json");
  const release = readLatestReleaseSummary();
  const migrationsDir = path.join(rootDir, "database", "migrations");
  const migrationCount = existsSync(migrationsDir)
    ? readdirSync(migrationsDir).filter((fileName) => fileName.endsWith(".sql")).length
    : 0;
  const changedFiles = git(["diff", "--name-only", "origin/main...HEAD"])
    .split(/\r?\n/)
    .map((fileName) => fileName.trim())
    .filter(Boolean);
  const changedMigrations = changedFiles.filter(
    (fileName) => fileName.startsWith("database/migrations/") && fileName.endsWith(".sql")
  );

  console.log("Deploy preflight");
  console.log(`- Branch: main`);
  console.log(`- Version: ${packageJson.version}`);
  console.log(
    release
      ? `- Latest release note: ${release.fileName} (${release.releaseDate}) — ${release.title}`
      : "- Latest release note: none found"
  );
  console.log(`- Commits ahead of origin/main: ${ahead}`);
  console.log(`- Migration files: ${migrationCount}`);
  console.log(
    changedMigrations.length > 0
      ? `- New/changed migrations in push: ${changedMigrations.join(", ")}`
      : "- New/changed migrations in push: none"
  );
  console.log("");
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

printDeployPreflight({ ahead });

if (ahead === 0) {
  console.log("Nothing to push; origin/main already matches local main.");
  console.log("Continuing to the hosted database check...");
} else {
  console.log("Validating release notes for the production push...");

  const releaseCheck = spawnSync(
    process.execPath,
    [path.join(__dirname, "release-notes.mjs"), "check", "--since", "origin/main"],
    { cwd: rootDir, stdio: "inherit" }
  );

  if (releaseCheck.status !== 0) {
    fail("Release-note validation failed; origin/main was not updated.");
  }

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
