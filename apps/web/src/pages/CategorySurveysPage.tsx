import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { AlertMessage } from "../components/AlertMessage.js";
import { PaginationRow } from "../components/PaginationRow.js";
import { SurveySummaryCard } from "../components/SurveySummaryCard.js";
import { useMySurveys } from "../hooks/useMySurveys.js";
import { useReveal } from "../motion/motion.js";
import { summariesForCategory } from "./dashboardGrouping.js";

const cardsPerPage = 9;

export function CategorySurveysPage() {
  const { categoryId: categoryIdParam } = useParams();
  const { summaries, isLoading, error } = useMySurveys();
  const [page, setPage] = useState(1);

  const categoryId = Number(categoryIdParam);
  const categorySummaries = useMemo(
    () => (Number.isInteger(categoryId) ? summariesForCategory(summaries, categoryId) : []),
    [categoryId, summaries]
  );
  const categoryName = categorySummaries[0]?.survey.categoryName ?? null;

  const pageCount = Math.max(1, Math.ceil(categorySummaries.length / cardsPerPage));
  const safePage = Math.min(page, pageCount);
  const pagedSummaries = categorySummaries.slice(
    (safePage - 1) * cardsPerPage,
    safePage * cardsPerPage
  );
  const revealRef = useReveal<HTMLElement>([isLoading, safePage]);

  return (
    <section className="page dashboard-page" ref={revealRef}>
      <nav aria-label="Breadcrumb" className="attempt-breadcrumbs">
        <Link to="/dashboard">Dashboard</Link>
        <span aria-hidden="true">/</span>
        <span className="attempt-breadcrumb-current">{categoryName ?? "Survey group"}</span>
      </nav>

      <div className="page-header">
        <p className="eyebrow">Survey group</p>
        <h1>{categoryName ?? "Survey group"}</h1>
        {categorySummaries.length > 0 ? (
          <p>
            {categorySummaries.length}{" "}
            {categorySummaries.length === 1 ? "survey" : "surveys"} in this group.
          </p>
        ) : null}
      </div>

      {error ? <AlertMessage variant="error">{error}</AlertMessage> : null}
      {isLoading ? <AlertMessage variant="info">Loading surveys...</AlertMessage> : null}
      {!isLoading && categorySummaries.length === 0 ? (
        <div className="builder-empty-state">
          <strong>No surveys in this group</strong>
          <span>
            The group may have been removed or its surveys unpublished.{" "}
            <Link to="/dashboard">Back to dashboard</Link>
          </span>
        </div>
      ) : null}

      <div className="survey-grid">
        {pagedSummaries.map((summary) => (
          <div data-reveal key={summary.survey.id}>
            <SurveySummaryCard summary={summary} />
          </div>
        ))}
      </div>

      <PaginationRow onPageChange={setPage} page={safePage} pageCount={pageCount} />
    </section>
  );
}
