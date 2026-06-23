import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("SurveyAttemptPage participant progress copy", () => {
  it("does not render numeric page or question progress labels in the runner", () => {
    const source = readFileSync(new URL("./SurveyAttemptPage.tsx", import.meta.url), "utf8");

    expect(source).not.toMatch(/Page\s*\{[^}]+\}\s*of\s*\{[^}]+\}/);
    expect(source).not.toMatch(/Question\s*\{[^}]+\}\s*of\s*\{[^}]+\}/);
  });
});
