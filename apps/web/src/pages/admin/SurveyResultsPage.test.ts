import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { categoryAllValue } from "./SurveyResultsPage.js";

const source = readFileSync(new URL("./SurveyResultsPage.tsx", import.meta.url), "utf8");

describe("SurveyResultsPage review tag helpers", () => {
  it("uses a virtual category all selector instead of a catalog tag row", () => {
    expect(categoryAllValue(42)).toBe("category-all:42");
    expect(source).toContain("{\"<ALL>\"} - Apply all in {group.name}");
    expect(source).toContain("Auto-applying all in {group.name}");
    expect(source).toContain("Stop");
    expect(source).toContain("tag.isManual");
    expect(source).toContain("Managed by auto-applied category");
    expect(source).toContain("addAnswerReviewTagCategory");
    expect(source).toContain("removeAnswerReviewTagCategory");
    expect(source).not.toContain("tagValue: \"<ALL>\"");
  });
});
