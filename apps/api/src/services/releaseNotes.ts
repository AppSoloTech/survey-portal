import type { SoftwareReleaseNote, SoftwareReleaseNotesResponse } from "@survey-portal/shared";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

interface ParsedPackageJson {
  version?: unknown;
}

const releaseFilePattern = /^v(\d+\.\d+\.\d+)\.md$/;
const releaseHeadingPattern = /^# v(\d+\.\d+\.\d+) - (.+)$/;
const releaseDatePattern = /^Release date: (\d{4}-\d{2}-\d{2})$/;
const summaryPattern = /^Summary: (.+)$/;
const allowedSections = new Set(["Added", "Changed", "Fixed", "Security", "Operational Notes"]);

export function buildSoftwareReleaseNotesResponse(
  rootDir = findRepositoryRoot()
): SoftwareReleaseNotesResponse {
  const currentVersion = readRootPackageVersion(rootDir);
  const releases = readSoftwareReleaseNotes(rootDir);

  return {
    currentVersion,
    releases
  };
}

export function readSoftwareReleaseNotes(rootDir = findRepositoryRoot()): SoftwareReleaseNote[] {
  const releasesDir = path.join(rootDir, "markdown", "releases");

  if (!existsSync(releasesDir)) {
    return [];
  }

  return readdirSync(releasesDir)
    .filter((fileName) => releaseFilePattern.test(fileName))
    .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))
    .map((fileName) => {
      const fullPath = path.join(releasesDir, fileName);
      const expectedVersion = fileName.match(releaseFilePattern)?.[1] ?? "";

      return parseSoftwareReleaseNote(readFileSync(fullPath, "utf8"), {
        expectedVersion,
        sourceName: fileName
      });
    });
}

export function parseSoftwareReleaseNote(
  markdown: string,
  {
    expectedVersion,
    sourceName = "release note"
  }: { expectedVersion?: string; sourceName?: string } = {}
): SoftwareReleaseNote {
  const lines = markdown.replace(/\r\n/g, "\n").trim().split("\n");
  const headingMatch = lines[0]?.match(releaseHeadingPattern);

  if (!headingMatch) {
    throw new Error(`${sourceName} must start with "# vX.Y.Z - Title"`);
  }

  const version = headingMatch[1];
  const title = headingMatch[2].trim();

  if (expectedVersion && version !== expectedVersion) {
    throw new Error(`${sourceName} heading version must match file name`);
  }

  const releaseDateLine = findRequiredLine(lines, releaseDatePattern, sourceName, "release date");
  const releasedAt = releaseDateLine.match(releaseDatePattern)?.[1] ?? "";

  const parsedDate = new Date(`${releasedAt}T00:00:00.000Z`);

  if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== releasedAt) {
    throw new Error(`${sourceName} release date must be a valid YYYY-MM-DD date`);
  }

  const summaryLine = findRequiredLine(lines, summaryPattern, sourceName, "summary");
  const summary = summaryLine.match(summaryPattern)?.[1].trim() ?? "";

  if (!summary) {
    throw new Error(`${sourceName} summary cannot be blank`);
  }

  const sections: SoftwareReleaseNote["sections"] = [];
  let currentSection: SoftwareReleaseNote["sections"][number] | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.startsWith("## ")) {
      const heading = line.slice(3).trim();

      if (!allowedSections.has(heading)) {
        throw new Error(`${sourceName} has unsupported section "${heading}"`);
      }

      currentSection = {
        heading,
        items: []
      };
      sections.push(currentSection);
      continue;
    }

    if (line === "-" || line.startsWith("- ")) {
      if (!currentSection) {
        throw new Error(`${sourceName} bullet items must be inside a section`);
      }

      const item = line.slice(1).trim();

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
    if (!section.heading || section.items.length === 0) {
      throw new Error(`${sourceName} section "${section.heading}" must include bullet items`);
    }
  }

  return {
    version,
    releasedAt,
    title,
    summary,
    sections
  };
}

export function readRootPackageVersion(rootDir = findRepositoryRoot()): string {
  const packageJson = JSON.parse(
    readFileSync(path.join(rootDir, "package.json"), "utf8")
  ) as ParsedPackageJson;

  if (typeof packageJson.version !== "string") {
    throw new Error("Root package.json version must be a string");
  }

  return packageJson.version;
}

function findRequiredLine(
  lines: string[],
  pattern: RegExp,
  sourceName: string,
  label: string
): string {
  const line = lines.find((candidate) => pattern.test(candidate.trim()));

  if (!line) {
    throw new Error(`${sourceName} must include ${label}`);
  }

  return line.trim();
}

function findRepositoryRoot(): string {
  let currentDir = process.cwd();

  for (let depth = 0; depth < 8; depth += 1) {
    if (
      existsSync(path.join(currentDir, "package.json")) &&
      existsSync(path.join(currentDir, "markdown"))
    ) {
      return currentDir;
    }

    const parent = path.dirname(currentDir);

    if (parent === currentDir) {
      break;
    }

    currentDir = parent;
  }

  throw new Error("Could not locate repository root for release notes");
}
