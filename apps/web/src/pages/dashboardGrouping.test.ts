import type { Survey, SurveyAttempt, SurveyAttemptSummary } from "@survey-portal/shared";
import { describe, expect, it } from "vitest";

import {
  filterSummaries,
  groupDashboardSummaries,
  summariesForCategory
} from "./dashboardGrouping.js";

let nextSurveyId = 1;

function buildSummary(overrides: {
  categoryId?: number | null;
  categoryName?: string | null;
  attemptStatus?: SurveyAttempt["status"] | null;
}): SurveyAttemptSummary {
  const surveyId = nextSurveyId++;
  const survey = {
    id: surveyId,
    title: `Survey ${surveyId}`,
    description: null,
    status: "published",
    categoryId: overrides.categoryId ?? null,
    categoryName: overrides.categoryName ?? null,
    createdByUserId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    publishedAt: null,
    retiredAt: null,
    deletedAt: null,
    questions: [],
    conditionalLogicRules: []
  } as unknown as Survey;

  const attempt = overrides.attemptStatus
    ? ({ id: surveyId, status: overrides.attemptStatus } as unknown as SurveyAttempt)
    : null;

  return { survey, attempt };
}

describe("groupDashboardSummaries", () => {
  it("returns one group per category sorted alphabetically", () => {
    const { groups } = groupDashboardSummaries([
      buildSummary({ categoryId: 2, categoryName: "Onboarding" }),
      buildSummary({ categoryId: 1, categoryName: "Compliance" }),
      buildSummary({ categoryId: 2, categoryName: "Onboarding" })
    ]);

    expect(groups.map((group) => group.categoryName)).toEqual(["Compliance", "Onboarding"]);
    expect(groups[1]).toMatchObject({ categoryId: 2, surveyCount: 2 });
  });

  it("counts completed attempts per group", () => {
    const { groups } = groupDashboardSummaries([
      buildSummary({ categoryId: 1, categoryName: "Compliance", attemptStatus: "completed" }),
      buildSummary({ categoryId: 1, categoryName: "Compliance", attemptStatus: "in_progress" }),
      buildSummary({ categoryId: 1, categoryName: "Compliance" })
    ]);

    expect(groups[0]).toMatchObject({ surveyCount: 3, completedCount: 1 });
  });

  it("keeps uncategorized surveys out of groups", () => {
    const { groups, ungrouped } = groupDashboardSummaries([
      buildSummary({ categoryId: 1, categoryName: "Compliance" }),
      buildSummary({}),
      buildSummary({})
    ]);

    expect(groups).toHaveLength(1);
    expect(ungrouped).toHaveLength(2);
  });

  it("handles an empty summary list", () => {
    expect(groupDashboardSummaries([])).toEqual({ groups: [], ungrouped: [] });
  });
});

describe("filterSummaries", () => {
  it("returns everything for a blank query", () => {
    const summaries = [buildSummary({}), buildSummary({})];

    expect(filterSummaries(summaries, "")).toHaveLength(2);
    expect(filterSummaries(summaries, "   ")).toHaveLength(2);
  });

  it("matches title, description, and category name case-insensitively", () => {
    const byTitle = buildSummary({});
    byTitle.survey.title = "Employee Onboarding";
    const byDescription = buildSummary({});
    byDescription.survey.description = "Annual COMPLIANCE review";
    const byCategory = buildSummary({ categoryId: 1, categoryName: "Workplace" });
    const noMatch = buildSummary({});

    const summaries = [byTitle, byDescription, byCategory, noMatch];

    expect(filterSummaries(summaries, "onboarding")).toEqual([byTitle]);
    expect(filterSummaries(summaries, "compliance")).toEqual([byDescription]);
    expect(filterSummaries(summaries, "workplace")).toEqual([byCategory]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterSummaries([buildSummary({})], "zzz-no-match")).toEqual([]);
  });
});

describe("summariesForCategory", () => {
  it("returns only surveys in the requested category", () => {
    const summaries = [
      buildSummary({ categoryId: 1, categoryName: "Compliance" }),
      buildSummary({ categoryId: 2, categoryName: "Onboarding" }),
      buildSummary({})
    ];

    const matches = summariesForCategory(summaries, 1);

    expect(matches).toHaveLength(1);
    expect(matches[0].survey.categoryId).toBe(1);
  });
});
