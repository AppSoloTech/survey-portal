import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const releasesDir = path.join(rootDir, "markdown", "releases");
const semverPattern = /^\d+\.\d+\.\d+$/;
const releaseFilePattern = /^v(\d+\.\d+\.\d+)\.md$/;
const releaseHeadingPattern = /^# v(\d+\.\d+\.\d+) - (.+)$/;
const releaseDatePattern = /^Release date: (\d{4}-\d{2}-\d{2})$/;
const summaryPattern = /^Summary: (.+)$/;
const allowedSections = new Set(["Added", "Changed", "Fixed", "Security", "Operational Notes"]);

function main() {
  const [command, ...args] = process.argv.slice(2);

  try {
    if (command === "notes") {
      createCurrentReleaseNote();
      return;
    }

    if (command === "check") {
      const since = readSinceArg(args);
      checkReleaseNotes({ since });
      return;
    }

    throw new Error("Usage: node scripts/release-notes.mjs notes|check [--since <ref>]");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

export function createCurrentReleaseNote() {
  const version = readRootVersion(rootDir);
  validateSemver(version, "Root package.json version");
  mkdirSync(releasesDir, { recursive: true });

  const releasePath = path.join(releasesDir, `v${version}.md`);

  if (existsSync(releasePath)) {
    throw new Error(`${path.relative(rootDir, releasePath)} already exists`);
  }

  const today = new Date().toISOString().slice(0, 10);
  const content = `# v${version} - Release title\n\nRelease date: ${today}\n\nSummary: Replace this with a short release summary.\n\n## Added\n\n- Replace this with the user-facing or operational change.\n`;

  writeFileSync(releasePath, content, "utf8");
  console.log(`Created ${path.relative(rootDir, releasePath)}`);
}

export function checkReleaseNotes({ since } = {}) {
  const currentVersion = readRootVersion(rootDir);
  validateSemver(currentVersion, "Root package.json version");

  const releases = readReleaseFiles();

  if (releases.length === 0) {
    throw new Error("No release notes found in markdown/releases");
  }

  const latest = releases[0];

  if (latest.version !== currentVersion) {
    throw new Error(
      `Latest release note v${latest.version} does not match root package version ${currentVersion}`
    );
  }

  if (since) {
    checkFreshnessSince(since, currentVersion);
  }

  console.log(`Release notes OK for v${currentVersion}`);
}

export function parseReleaseNote(markdown, { expectedVersion, sourceName = "release note" } = {}) {
  const lines = markdown.replace(/\r\n/g, "\n").trim().split("\n");
  const headingMatch = lines[0]?.match(releaseHeadingPattern);

  if (!headingMatch) {
    throw new Error(`${sourceName} must start with "# vX.Y.Z - Title"`);
  }

  const version = headingMatch[1];
  const title = headingMatch[2].trim();

  validateSemver(version, `${sourceName} version`);

  if (!title) {
    throw new Error(`${sourceName} title cannot be blank`);
  }

  if (expectedVersion && version !== expectedVersion) {
    throw new Error(`${sourceName} heading version must match file name`);
  }

  const releaseDateLine = findRequiredLine(lines, releaseDatePattern, sourceName, "release date");
  const releasedAt = releaseDateLine.match(releaseDatePattern)?.[1] ?? "";

  validateDate(releasedAt, sourceName);

  const summaryLine = findRequiredLine(lines, summaryPattern, sourceName, "summary");
  const summary = summaryLine.match(summaryPattern)?.[1]?.trim() ?? "";

  if (!summary) {
    throw new Error(`${sourceName} summary cannot be blank`);
  }

  const sections = [];
  let currentSection = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.startsWith("## ")) {
      const heading = line.slice(3).trim();

      if (!allowedSections.has(heading)) {
        throw new Error(`${sourceName} has unsupported section "${heading}"`);
      }

      currentSection = { heading, items: [] };
      sections.push(currentSection);
      continue;
    }

    if (line.startsWith("- ")) {
      if (!currentSection) {
        throw new Error(`${sourceName} bullet items must be inside a section`);
      }

      const item = line.slice(2).trim();

      if (!item) {
        throw new Error(`${sourceName} bullet items cannot be blank`);
      }

      currentSection.items.push(item);
    }
  }

  if (sections.length === 0) {
    throw new Error(`${sourceName} must include at least one section`);
  }

  for (const section of sections) {
    if (section.items.length === 0) {
      throw new Error(`${sourceName} section "${section.heading}" must include bullet items`);
    }
  }

  return { version, releasedAt, title, summary, sections };
}

function readReleaseFiles() {
  if (!existsSync(releasesDir)) {
    return [];
  }

  return readdirSync(releasesDir)
    .filter((fileName) => releaseFilePattern.test(fileName))
    .map((fileName) => {
      const expectedVersion = fileName.match(releaseFilePattern)?.[1] ?? "";
      const release = parseReleaseNote(readFileSync(path.join(releasesDir, fileName), "utf8"), {
        expectedVersion,
        sourceName: fileName
      });

      return { ...release, fileName };
    })
    .sort((left, right) => compareVersions(right.version, left.version));
}

function checkFreshnessSince(since, currentVersion) {
  if (/^0+$/.test(since)) {
    return;
  }

  if (!gitRefExists(since)) {
    throw new Error(`Could not resolve git ref for release freshness check: ${since}`);
  }

  const changedFiles = git(["diff", "--name-only", `${since}...HEAD`])
    .split(/\r?\n/)
    .map((fileName) => fileName.trim())
    .filter(Boolean);

  if (changedFiles.length === 0) {
    return;
  }

  const previousPackageJson = git(["show", `${since}:package.json`]);
  const previousVersion = JSON.parse(previousPackageJson).version;

  if (typeof previousVersion !== "string") {
    throw new Error(`Could not read package version from ${since}`);
  }

  const currentReleaseFile = `markdown/releases/v${currentVersion}.md`;

  if (previousVersion === currentVersion) {
    const productionChanges = changedFiles.filter(
      (fileName) =>
        !fileName.startsWith("notes/") &&
        !fileName.startsWith("markdown/releases/") &&
        fileName !== "markdown/PHASE_LOG.md"
    );

    if (productionChanges.length > 0) {
      throw new Error(
        `Production changes require a root package.json version bump and ${currentReleaseFile}`
      );
    }

    return;
  }

  if (!changedFiles.includes("package.json")) {
    throw new Error("Release version changed without package.json appearing in the push diff");
  }

  if (!changedFiles.includes(currentReleaseFile)) {
    throw new Error(`Release version changed without updating ${currentReleaseFile}`);
  }
}

function readSinceArg(args) {
  const index = args.indexOf("--since");

  if (index === -1) {
    return undefined;
  }

  const value = args[index + 1];

  if (!value) {
    throw new Error("--since requires a git ref");
  }

  return value;
}

function readRootVersion(directory) {
  const parsed = JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8"));

  if (typeof parsed.version !== "string") {
    throw new Error("Root package.json version must be a string");
  }

  return parsed.version;
}

function validateSemver(version, label) {
  if (!semverPattern.test(version)) {
    throw new Error(`${label} must be MAJOR.MINOR.PATCH`);
  }
}

function validateDate(date, sourceName) {
  const parsed = new Date(`${date}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error(`${sourceName} release date must be a valid YYYY-MM-DD date`);
  }
}

function findRequiredLine(lines, pattern, sourceName, label) {
  const line = lines.find((candidate) => pattern.test(candidate.trim()));

  if (!line) {
    throw new Error(`${sourceName} must include ${label}`);
  }

  return line.trim();
}

function compareVersions(left, right) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);

  for (let index = 0; index < 3; index += 1) {
    const difference = leftParts[index] - rightParts[index];

    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

function gitRefExists(ref) {
  const result = spawnSync("git", ["rev-parse", "--verify", `${ref}^{commit}`], {
    cwd: rootDir,
    encoding: "utf8"
  });

  return result.status === 0;
}

function git(args) {
  const result = spawnSync("git", args, { cwd: rootDir, encoding: "utf8" });

  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
  }

  return result.stdout.trim();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
