import assert from "node:assert/strict";
import test from "node:test";

import { checkReleaseNotes, parseReleaseNote } from "./release-notes.mjs";

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

test("checkReleaseNotes validates the current committed release notes", () => {
  assert.doesNotThrow(() => checkReleaseNotes());
});
