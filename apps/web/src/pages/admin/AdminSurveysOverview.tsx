import type { Survey } from "@survey-portal/shared";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { createSurvey, fetchAdminSurveys } from "../../api/surveys.js";
import { readFormText, readNullableFormText } from "../../components/admin/builderForm.js";

export function AdminSurveysOverview() {
  const navigate = useNavigate();
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    fetchAdminSurveys()
      .then((response) => {
        if (isActive) {
          setSurveys(response.surveys);
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

  async function handleCreateSurvey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await createSurvey({
        title: readFormText(data, "title"),
        description: readNullableFormText(data, "description")
      });

      navigate(`/admin/surveys/${response.survey.id}/setup`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Request failed");
      setIsSubmitting(false);
    }
  }

  return (
    <section className="page admin-builder-page">
      <div className="page-header">
        <p className="eyebrow">Admin portal</p>
        <h2>Surveys</h2>
        <p>
          Create, maintain, publish, and retire data-driven surveys. Open a survey to
          work on its setup, questions, logic, and preview.
        </p>
      </div>

      {error ? <p className="status error">{error}</p> : null}

      <div className="admin-overview-layout">
        <form className="builder-form compact-builder-form" onSubmit={handleCreateSurvey}>
          <h3>Create survey</h3>
          <label>
            Title
            <input name="title" required />
          </label>
          <label>
            Description
            <textarea name="description" rows={3} />
          </label>
          <button
            className="button-link compact-button primary-button"
            disabled={isSubmitting}
            type="submit"
          >
            Create draft survey
          </button>
          <p className="builder-heading-note">
            New surveys start as drafts and open in the survey workspace.
          </p>
        </form>

        <div className="overview-survey-list" aria-label="Admin survey list">
          {isLoading ? <p className="status muted">Loading surveys...</p> : null}
          {!isLoading && surveys.length === 0 ? (
            <div className="builder-empty-state">
              <strong>No surveys yet</strong>
              <span>Create the first survey to start building questions and logic.</span>
            </div>
          ) : null}
          {surveys.map((survey) => (
            <Link
              className="overview-survey-row"
              key={survey.id}
              to={`/admin/surveys/${survey.id}`}
            >
              <div className="overview-survey-main">
                <strong>{survey.title}</strong>
                <div className="overview-survey-meta">
                  <span>{formatCount(survey.questions.length, "question")}</span>
                  <span>{formatCount(survey.conditionalLogicRules.length, "jump rule")}</span>
                  <span>Updated {formatDate(survey.updatedAt)}</span>
                </div>
              </div>
              <span className={`status-pill ${survey.status}`}>{survey.status}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function formatCount(count: number, singularLabel: string): string {
  return `${count} ${singularLabel}${count === 1 ? "" : "s"}`;
}

function formatDate(isoDate: string): string {
  const parsed = new Date(isoDate);
  return Number.isNaN(parsed.getTime()) ? "recently" : parsed.toLocaleDateString();
}
