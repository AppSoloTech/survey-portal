import type { SurveyAttemptSummary } from "@survey-portal/shared";

export interface CategoryGroupSummary {
  categoryId: number;
  categoryName: string;
  surveyCount: number;
  completedCount: number;
}

export interface GroupedDashboard {
  groups: CategoryGroupSummary[];
  ungrouped: SurveyAttemptSummary[];
}

// One entry per category (alphabetical) plus the surveys that have no
// category, which keep rendering as plain survey cards on the dashboard.
export function groupDashboardSummaries(summaries: SurveyAttemptSummary[]): GroupedDashboard {
  const groupsById = new Map<number, CategoryGroupSummary>();
  const ungrouped: SurveyAttemptSummary[] = [];

  for (const summary of summaries) {
    const { categoryId, categoryName } = summary.survey;

    if (categoryId === null || categoryName === null) {
      ungrouped.push(summary);
      continue;
    }

    const group = groupsById.get(categoryId) ?? {
      categoryId,
      categoryName,
      surveyCount: 0,
      completedCount: 0
    };
    group.surveyCount += 1;

    if (summary.attempt?.status === "completed") {
      group.completedCount += 1;
    }

    groupsById.set(categoryId, group);
  }

  return {
    groups: [...groupsById.values()].sort((left, right) =>
      left.categoryName.localeCompare(right.categoryName)
    ),
    ungrouped
  };
}

export function summariesForCategory(
  summaries: SurveyAttemptSummary[],
  categoryId: number
): SurveyAttemptSummary[] {
  return summaries.filter((summary) => summary.survey.categoryId === categoryId);
}
