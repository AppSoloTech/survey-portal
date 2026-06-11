import type { SurveyAttemptStatus, SurveyAttemptSummary } from "@survey-portal/shared";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { fetchMySurveys } from "../api/surveys.js";

const surveysPerPage = 9;
const allCategoriesFilter = "__all__";
const uncategorizedLabel = "More surveys";

export function UserDashboard() {
  const navigate = useNavigate();
  const [summaries, setSummaries] = useState<SurveyAttemptSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState(allCategoriesFilter);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let isActive = true;

    fetchMySurveys()
      .then((response) => {
        if (isActive) {
          setSummaries(response.surveys);
        }
      })
      .catch((loadError) => {
        if (isActive) {
          setError(loadError instanceof Error ? loadError.message : "Could not load surveys");
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  const categoryNames = useMemo(() => {
    const names = new Set<string>();

    for (const summary of summaries) {
      if (summary.survey.categoryName) {
        names.add(summary.survey.categoryName);
      }
    }

    return [...names].sort((left, right) => left.localeCompare(right));
  }, [summaries]);

  const filteredSummaries = useMemo(() => {
    if (categoryFilter === allCategoriesFilter) {
      return summaries;
    }

    return summaries.filter(
      (summary) => (summary.survey.categoryName ?? uncategorizedLabel) === categoryFilter
    );
  }, [categoryFilter, summaries]);

  const pageCount = Math.max(1, Math.ceil(filteredSummaries.length / surveysPerPage));
  const safePage = Math.min(page, pageCount);
  const pagedSummaries = filteredSummaries.slice(
    (safePage - 1) * surveysPerPage,
    safePage * surveysPerPage
  );

  const groupedSummaries = useMemo(() => {
    const groups = new Map<string, SurveyAttemptSummary[]>();

    for (const summary of pagedSummaries) {
      const groupName = summary.survey.categoryName ?? uncategorizedLabel;
      const group = groups.get(groupName) ?? [];
      group.push(summary);
      groups.set(groupName, group);
    }

    // Named categories first (alphabetical), the uncategorized group last.
    return [...groups.entries()].sort(([left], [right]) => {
      if (left === uncategorizedLabel) {
        return 1;
      }

      if (right === uncategorizedLabel) {
        return -1;
      }

      return left.localeCompare(right);
    });
  }, [pagedSummaries]);

  function handleFilterChange(filter: string) {
    setCategoryFilter(filter);
    setPage(1);
  }

  function openSurvey(summary: SurveyAttemptSummary) {
    navigate(`/surveys/${summary.survey.id}/attempt`);
  }

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

      {categoryNames.length > 0 ? (
        <div aria-label="Filter surveys by category" className="category-filter-row" role="group">
          <FilterChip
            isActive={categoryFilter === allCategoriesFilter}
            label="All surveys"
            onClick={() => handleFilterChange(allCategoriesFilter)}
          />
          {categoryNames.map((name) => (
            <FilterChip
              isActive={categoryFilter === name}
              key={name}
              label={name}
              onClick={() => handleFilterChange(name)}
            />
          ))}
          {summaries.some((summary) => !summary.survey.categoryName) ? (
            <FilterChip
              isActive={categoryFilter === uncategorizedLabel}
              label={uncategorizedLabel}
              onClick={() => handleFilterChange(uncategorizedLabel)}
            />
          ) : null}
        </div>
      ) : null}

      {groupedSummaries.map(([groupName, groupSummaries]) => (
        <div className="survey-category-group" key={groupName}>
          {categoryNames.length > 0 ? <h3 className="survey-category-title">{groupName}</h3> : null}
          <div className="survey-grid">
            {groupSummaries.map((summary) => (
              <article className="survey-card" key={summary.survey.id}>
                <div>
                  <h4>{summary.survey.title}</h4>
                  {summary.survey.description ? <p>{summary.survey.description}</p> : null}
                </div>
                <div className="survey-card-footer">
                  <span className={`status-pill ${summary.attempt?.status ?? "not_started"}`}>
                    {formatAttemptStatus(summary.attempt?.status ?? "not_started")}
                  </span>
                  <button
                    className={`button-link compact-button ${getSurveyActionButtonClass(
                      summary.attempt?.status
                    )}`}
                    onClick={() => openSurvey(summary)}
                    type="button"
                  >
                    {getSurveyActionLabel(summary.attempt?.status)}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      ))}

      {pageCount > 1 ? (
        <div className="pagination-row" aria-label="Survey pages">
          <button
            className="button-link compact-button secondary-button"
            disabled={safePage <= 1}
            onClick={() => setPage(safePage - 1)}
            type="button"
          >
            Previous
          </button>
          <span className="pagination-status">
            Page {safePage} of {pageCount}
          </span>
          <button
            className="button-link compact-button secondary-button"
            disabled={safePage >= pageCount}
            onClick={() => setPage(safePage + 1)}
            type="button"
          >
            Next
          </button>
        </div>
      ) : null}
    </section>
  );
}

function FilterChip({
  isActive,
  label,
  onClick
}: {
  isActive: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={isActive}
      className={isActive ? "category-filter-chip active" : "category-filter-chip"}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function getSurveyActionLabel(status: SurveyAttemptStatus | undefined): string {
  if (status === "completed") {
    return "View completed";
  }

  if (status === "in_progress" || status === "not_started") {
    return status === "in_progress" ? "Resume survey" : "Start survey";
  }

  return "Start survey";
}

function getSurveyActionButtonClass(status: SurveyAttemptStatus | undefined): string {
  return status === "completed" ? "secondary-button" : "primary-button";
}

function formatAttemptStatus(status: SurveyAttemptStatus): string {
  return status.replace("_", " ");
}
