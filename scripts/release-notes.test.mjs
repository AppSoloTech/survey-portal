import assert from "node:assert/strict";
import test from "node:test";

import {
  buildReleaseNoteFromDraft,
  checkReleaseNotes,
  parseReleaseNote,
  parseUnreleasedNote,
  resolveNextVersion,
  validatePublishableDraft
} from "./release-notes.mjs";

test("parseReleaseNote accepts the committed release-note shape", () => {
  const parsed = parseReleaseNote(
    `# v2.3.4 - Parser Test\n\nRelease date: 2026-06-25\n\nSummary: Parser coverage for release notes.\n\n## Added\n\n- A parser test.\n`,
    { expectedVersion: "2.3.4", sourceName: "v2.3.4.md" }
  );

  assert.equal(parsed.version, "2.3.4");
  assert.equal(parsed.title, "Parser Test");
  assert.deepEqual(parsed.sections, [{ heading: "Added", items: ["A parser test."] }]);
});

test("parseReleaseNote rejects unsupported section names", () => {
  assert.throws(
    () =>
      parseReleaseNote(
        `# v2.3.4 - Parser Test\n\nRelease date: 2026-06-25\n\nSummary: Parser coverage for release notes.\n\n## Random\n\n- A parser test.\n`,
        { expectedVersion: "2.3.4", sourceName: "v2.3.4.md" }
      ),
    /unsupported section/
  );
});

test("parseReleaseNote rejects blank bullet items", () => {
  assert.throws(
    () =>
      parseReleaseNote(
        `# v2.3.4 - Parser Test\n\nRelease date: 2026-06-25\n\nSummary: Parser coverage for release notes.\n\n## Added\n\n-   \n`,
        { expectedVersion: "2.3.4", sourceName: "v2.3.4.md" }
      ),
    /bullet items cannot be blank/
  );
});

test("parseUnreleasedNote accepts a draft note and builds a versioned note", () => {
  const draft = parseUnreleasedNote(
    `# Unreleased\n\nRelease title: Draft Automation\n\nSummary: Draft notes are promoted into a versioned release.\n\n## Changed\n\n- Agents maintain the draft release note during implementation.\n`,
    { sourceName: "unreleased.md" }
  );

  assert.deepEqual(draft, {
    title: "Draft Automation",
    summary: "Draft notes are promoted into a versioned release.",
    sections: [
      {
        heading: "Changed",
        items: ["Agents maintain the draft release note during implementation."]
      }
    ]
  });

  const release = parseReleaseNote(
    buildReleaseNoteFromDraft(draft, {
      releaseDate: "2026-06-25",
      version: "2.3.5"
    }),
    { expectedVersion: "2.3.5", sourceName: "v2.3.5.md" }
  );

  assert.equal(release.title, "Draft Automation");
  assert.equal(release.releasedAt, "2026-06-25");
});

test("resolveNextVersion supports semver bumps and explicit versions", () => {
  assert.equal(resolveNextVersion("2.3.4", "patch"), "2.3.5");
  assert.equal(resolveNextVersion("2.3.4", "minor"), "2.4.0");
  assert.equal(resolveNextVersion("2.3.4", "major"), "3.0.0");
  assert.equal(resolveNextVersion("2.3.4", "2.5.0"), "2.5.0");
});

test("validatePublishableDraft rejects placeholder draft text", () => {
  const draft = parseUnreleasedNote(
    `# Unreleased\n\nRelease title: Next Release\n\nSummary: Replace this with a short summary before running \`npm run release:prepare\`.\n\n## Changed\n\n- Add release-note bullets here during implementation.\n`,
    { sourceName: "unreleased.md" }
  );

  assert.throws(
    () => validatePublishableDraft(draft, "unreleased.md"),
    /release title|placeholder/
  );
});

test("checkReleaseNotes validates the current committed release notes", () => {
  assert.doesNotThrow(() => checkReleaseNotes());
});
