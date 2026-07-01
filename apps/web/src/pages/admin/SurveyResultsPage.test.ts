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

  it("keeps the summary body behind an accessible disclosure control", () => {
    expect(source).toContain('aria-controls="results-summary-body"');
    expect(source).toContain("aria-expanded={isSummaryExpanded}");
    expect(source).toContain('id="results-summary-body"');
    expect(source).toContain("hidden={!isSummaryExpanded}");
    expect(source).toContain("results-summary-title-row");
    expect(source).toContain("results-summary-toggle");
    expect(source).toContain("results-summary-compact");
    expect(source).toContain("Collapse");
    expect(source).toContain("Expand");
  });

  it("loads paginated attempts separately from summary and tag catalog data", () => {
    expect(source).toContain("fetchSurveyAttempts(survey.id, range, {");
    expect(source).toContain("page: requestPage");
    expect(source).toContain("pageSize: attemptsPageSize");
    expect(source).toContain("setAttemptsPage(attemptsResponse.pagination.totalPages)");
    expect(source).toContain("setAttemptsPage(1)");
    expect(source).toContain("formatAttemptRange(attemptsPagination");
    expect(source).toContain("results-page-size-control");
    expect(source).toContain("results-attempt-table");
    expect(source).toContain('aria-label="Attempt pages"');
    expect(source).not.toContain("fetchSurveyAttempts(survey.id, range),");
  });
});
