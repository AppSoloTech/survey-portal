import type { SurveyAttemptStatus, SurveyAttemptSummary } from "@survey-portal/shared";
import { useNavigate } from "react-router-dom";

export function SurveySummaryCard({ summary }: { summary: SurveyAttemptSummary }) {
  const navigate = useNavigate();
  const status = summary.attempt?.status ?? "not_started";

  return (
    <article className="survey-card">
      <div>
        <h4>{summary.survey.title}</h4>
        {summary.survey.description ? <p>{summary.survey.description}</p> : null}
      </div>
      <div className="survey-card-footer">
        <span className={`status-pill ${status}`}>{formatAttemptStatus(status)}</span>
        <button
          className={`button-link compact-button ${getSurveyActionButtonClass(
            summary.attempt?.status
          )}`}
          onClick={() => navigate(`/surveys/${summary.survey.id}/attempt`)}
          type="button"
        >
          {getSurveyActionLabel(summary.attempt?.status)}
          <span className="visually-hidden">: {summary.survey.title}</span>
        </button>
      </div>
    </article>
  );
}

function getSurveyActionLabel(status: SurveyAttemptStatus | undefined): string {
  if (status === "completed") {
    return "View completed";
  }

  return status === "in_progress" ? "Resume assessment" : "Start assessment";
}

function getSurveyActionButtonClass(status: SurveyAttemptStatus | undefined): string {
  return status === "completed" ? "secondary-button" : "primary-button";
}

function formatAttemptStatus(status: SurveyAttemptStatus): string {
  return status.replace("_", " ");
}
