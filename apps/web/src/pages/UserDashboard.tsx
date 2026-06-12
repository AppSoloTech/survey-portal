import type { SurveyAttemptSummary } from "@survey-portal/shared";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { PaginationRow } from "../components/PaginationRow.js";
import { SurveySummaryCard } from "../components/SurveySummaryCard.js";
import { useMySurveys } from "../hooks/useMySurveys.js";
import {
  filterSummaries,
  groupDashboardSummaries,
  type CategoryGroupSummary
} from "./dashboardGrouping.js";

const cardsPerPage = 9;

type DashboardCard =
  | { kind: "group"; group: CategoryGroupSummary }
  | { kind: "survey"; summary: SurveyAttemptSummary };

export function UserDashboard() {
  const { summaries, isLoading, error } = useMySurveys();
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");

  // Category groups render first as drillable cards; uncategorized surveys
  // keep their plain survey-card presentation after them. The search filter
  // runs before grouping, so group cards reflect matching surveys only.
  const cards = useMemo<DashboardCard[]>(() => {
    const { groups, ungrouped } = groupDashboardSummaries(filterSummaries(summaries, query));

    return [
      ...groups.map((group): DashboardCard => ({ kind: "group", group })),
      ...ungrouped.map((summary): DashboardCard => ({ kind: "survey", summary }))
    ];
  }, [query, summaries]);

  const pageCount = Math.max(1, Math.ceil(cards.length / cardsPerPage));
  const safePage = Math.min(page, pageCount);
  const pagedCards = cards.slice((safePage - 1) * cardsPerPage, safePage * cardsPerPage);

  return (
    <section className="page dashboard-page">
      <div className="page-header">
        <p className="eyebrow">User portal</p>
        <h2>Survey Dashboard</h2>
        <p>Browse available surveys, resume saved progress, and review completed attempts.</p>
      </div>

      {error ? <p className="status error">{error}</p> : null}
      {isLoading ? <p className="status muted">Loading surveys...</p> : null}
      {!isLoading && summaries.length === 0 ? (
        <p className="status muted">No published surveys are available.</p>
      ) : null}

      <ResumeNudge summaries={summaries} />

      {summaries.length > 0 ? (
        <div className="dashboard-search">
          <label>
            <span className="visually-hidden">Search surveys</span>
            <input
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Search surveys and groups..."
              type="search"
              value={query}
            />
          </label>
        </div>
      ) : null}

      {!isLoading && summaries.length > 0 && cards.length === 0 ? (
        <p className="status muted">No surveys match "{query.trim()}".</p>
      ) : null}

      <div className="survey-grid">
        {pagedCards.map((card) =>
          card.kind === "group" ? (
            <CategoryGroupCard group={card.group} key={`category-${card.group.categoryId}`} />
          ) : (
            <SurveySummaryCard key={`survey-${card.summary.survey.id}`} summary={card.summary} />
          )
        )}
      </div>

      <PaginationRow onPageChange={setPage} page={safePage} pageCount={pageCount} />
    </section>
  );
}

// Banner for the most recently touched in-progress attempt so returning
// participants can jump straight back in without scanning the grid.
function ResumeNudge({ summaries }: { summaries: SurveyAttemptSummary[] }) {
  const navigate = useNavigate();
  const inProgress = summaries
    .filter((summary) => summary.attempt?.status === "in_progress")
    .sort((left, right) =>
      (right.attempt?.lastActivityAt ?? "").localeCompare(left.attempt?.lastActivityAt ?? "")
    );
  const latest = inProgress[0];

  if (!latest) {
    return null;
  }

  const others = inProgress.length - 1;

  return (
    <div className="resume-nudge">
      <div>
        <strong>Pick up where you left off</strong>
        <span>
          "{latest.survey.title}" is still in progress
          {others > 0 ? ` (and ${others} other ${others === 1 ? "survey" : "surveys"})` : ""}.
        </span>
      </div>
      <button
        className="button-link compact-button primary-button"
        onClick={() => navigate(`/surveys/${latest.survey.id}/attempt`)}
        type="button"
      >
        Resume survey
      </button>
    </div>
  );
}

function CategoryGroupCard({ group }: { group: CategoryGroupSummary }) {
  const navigate = useNavigate();

  return (
    <article className="survey-card category-card">
      <div>
        <p className="eyebrow">Survey group</p>
        <h4>{group.categoryName}</h4>
        <p>
          {group.completedCount} of {group.surveyCount} completed
        </p>
      </div>
      <div className="survey-card-footer">
        <span className="status-pill">
          {group.surveyCount === 1 ? "1 survey" : `${group.surveyCount} surveys`}
        </span>
        <button
          className="button-link compact-button primary-button"
          onClick={() => navigate(`/dashboard/category/${group.categoryId}`)}
          type="button"
        >
          View surveys
        </button>
      </div>
    </article>
  );
}
