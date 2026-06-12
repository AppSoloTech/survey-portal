import type {
  AdminAttemptAnswer,
  AdminAttemptDetailResponse,
  AdminAttemptSummary,
  SurveyAttemptStatus,
  SurveyReportSummary
} from "@survey-portal/shared";
import { useEffect, useRef, useState } from "react";

import {
  fetchSurveyAttemptDetail,
  fetchSurveyAttempts,
  fetchSurveyReport,
  surveyExportCsvUrl
} from "../../api/surveys.js";
import { useSurveyWorkspace } from "./SurveyWorkspaceLayout.js";

export function SurveyResultsPage() {
  const { survey } = useSurveyWorkspace();
  const [report, setReport] = useState<SurveyReportSummary | null>(null);
  const [attempts, setAttempts] = useState<AdminAttemptSummary[] | null>(null);
  const [detail, setDetail] = useState<AdminAttemptDetailResponse | null>(null);
  const [detailAttemptId, setDetailAttemptId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Detail requests can resolve out of order when rows are clicked quickly;
  // only the most recent request may apply its result.
  const detailRequestIdRef = useRef(0);

  useEffect(() => {
    let isActive = true;

    detailRequestIdRef.current += 1;
    setIsLoading(true);
    setError(null);
    setDetail(null);
    setDetailAttemptId(null);

    Promise.all([fetchSurveyReport(survey.id), fetchSurveyAttempts(survey.id)])
      .then(([reportResponse, attemptsResponse]) => {
        if (isActive) {
          setReport(reportResponse.report);
          setAttempts(attemptsResponse.attempts);
        }
      })
      .catch((loadError) => {
        if (isActive) {
          setError(loadError instanceof Error ? loadError.message : "Could not load results");
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
  }, [survey.id, reloadKey]);

  async function handleViewAnswers(attemptId: number) {
    if (detailAttemptId === attemptId) {
      detailRequestIdRef.current += 1;
      setDetail(null);
      setDetailAttemptId(null);
      setIsDetailLoading(false);
      return;
    }

    const requestId = detailRequestIdRef.current + 1;
    detailRequestIdRef.current = requestId;

    setIsDetailLoading(true);
    setDetailAttemptId(attemptId);
    setDetail(null);
    setError(null);

    try {
      const response = await fetchSurveyAttemptDetail(survey.id, attemptId);

      if (detailRequestIdRef.current === requestId) {
        setDetail(response);
      }
    } catch (detailError) {
      if (detailRequestIdRef.current === requestId) {
        setError(detailError instanceof Error ? detailError.message : "Could not load answers");
        setDetailAttemptId(null);
      }
    } finally {
      if (detailRequestIdRef.current === requestId) {
        setIsDetailLoading(false);
      }
    }
  }

  if (isLoading) {
    return <p className="status muted">Loading results...</p>;
  }

  if (error && !report) {
    return <p className="status error">{error}</p>;
  }

  if (!report || !attempts) {
    return <p className="status error">Could not load results.</p>;
  }

  return (
    <div className="builder-workspace">
      <section className="builder-form results-summary-panel">
        <div className="builder-section-heading">
          <div>
            <p className="eyebrow">Results</p>
            <h3>Completion summary</h3>
            <p className="builder-heading-note">
              Counts cover every attempt of this survey. Hidden tags shown here are
              internal metadata and are never visible to participants.
            </p>
          </div>
          <div className="inline-actions">
            <button
              className="button-link compact-button ghost-button"
              onClick={() => setReloadKey((key) => key + 1)}
              type="button"
            >
              Refresh
            </button>
            <a
              className="button-link compact-button secondary-button"
              href={surveyExportCsvUrl(survey.id)}
            >
              Export CSV
            </a>
          </div>
        </div>

        <dl className="results-summary-grid" aria-label="Attempt counts">
          <div>
            <dt>Completed</dt>
            <dd>{report.attemptCounts.completed}</dd>
          </div>
          <div>
            <dt>In progress</dt>
            <dd>{report.attemptCounts.inProgress}</dd>
          </div>
          <div>
            <dt>Abandoned</dt>
            <dd>{report.attemptCounts.abandoned}</dd>
          </div>
          <div>
            <dt>Completion rate</dt>
            <dd>{formatPercent(report.completionRate)}</dd>
          </div>
        </dl>

        {report.questionStats.length > 0 ? (
          <div className="results-question-stats">
            <h4>Answers per question</h4>
            {report.questionStats.map((stat) => {
              // Bars scale against the most-answered question so the list
              // reads as a drop-off funnel through the survey.
              const maxAnswered = Math.max(
                1,
                ...report.questionStats.map((each) => each.answeredCount)
              );
              const barPercent = Math.round((stat.answeredCount / maxAnswered) * 100);

              return (
                <div className="results-question-stat-row" key={stat.questionId}>
                  <span className="results-question-label">
                    {stat.displayOrder}. {stat.questionText}
                  </span>
                  <span className="results-question-counts">
                    {formatCount(stat.answeredCount, "answer")}
                    {stat.blankCount > 0 ? `, ${stat.blankCount} blank` : ""}
                  </span>
                  <span aria-hidden="true" className="results-question-bar">
                    <span
                      className="results-question-bar-fill"
                      style={{ width: `${barPercent}%` }}
                    />
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}
      </section>

      <section className="builder-form results-attempts-panel">
        <div className="builder-section-heading">
          <div>
            <p className="eyebrow">Attempts</p>
            <h3>Participant attempts</h3>
          </div>
        </div>

        {error ? <p className="status error">{error}</p> : null}

        {attempts.length === 0 ? (
          <div className="builder-empty-state">
            <strong>No attempts yet</strong>
            <span>
              Results appear here once participants start the published survey.
            </span>
          </div>
        ) : (
          <div className="results-attempt-list">
            {attempts.map((attempt) => (
              <div className="results-attempt-row" key={attempt.attemptId}>
                <div className="results-attempt-main">
                  <strong>
                    {attempt.participant.firstName} {attempt.participant.lastName}
                  </strong>
                  <span className="results-attempt-email">{attempt.participant.email}</span>
                  <div className="results-attempt-meta">
                    <span>Started {formatDateTime(attempt.startedAt)}</span>
                    <span>
                      {attempt.status === "completed"
                        ? `Completed ${formatDateTime(attempt.completedAt)}`
                        : `Last activity ${formatDateTime(attempt.lastActivityAt)}`}
                    </span>
                    <span>{formatCount(attempt.answeredCount, "answer")} saved</span>
                  </div>
                </div>
                <div className="results-attempt-actions">
                  <span className={`status-pill ${attempt.status}`}>
                    {formatAttemptStatus(attempt.status)}
                  </span>
                  <button
                    className="button-link compact-button secondary-button"
                    disabled={isDetailLoading && detailAttemptId === attempt.attemptId}
                    onClick={() => void handleViewAnswers(attempt.attemptId)}
                    type="button"
                  >
                    {detailAttemptId === attempt.attemptId && detail
                      ? "Hide answers"
                      : "View answers"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {isDetailLoading ? <p className="status muted">Loading answers...</p> : null}
        {detail ? <AttemptDetailPanel detail={detail} /> : null}
      </section>
    </div>
  );
}

function AttemptDetailPanel({ detail }: { detail: AdminAttemptDetailResponse }) {
  return (
    <div className="results-detail-panel" aria-label="Attempt answers">
      <div className="results-detail-heading">
        <div>
          <p className="option-subheading">Answers</p>
          <h4>
            {detail.participant.firstName} {detail.participant.lastName} —{" "}
            {detail.surveyTitle}
          </h4>
        </div>
        <span className={`status-pill ${detail.attempt.status}`}>
          {formatAttemptStatus(detail.attempt.status)}
        </span>
      </div>

      {detail.answers.map((answer) => (
        <div className="results-answer-row" key={answer.questionId}>
          <div className="results-answer-heading">
            <span className="results-question-label">
              {answer.displayOrder}. {answer.questionText}
            </span>
            <AnswerStateBadge answer={answer} />
          </div>
          <AnswerValue answer={answer} />
        </div>
      ))}
    </div>
  );
}

function AnswerStateBadge({ answer }: { answer: AdminAttemptAnswer }) {
  if (answer.state === "answered") {
    return answer.onFinalPath ? (
      <span className="answer-state-badge answered">Answered</span>
    ) : (
      <span className="answer-state-badge off-path">Not on final path</span>
    );
  }

  if (answer.state === "skipped_blank") {
    return <span className="answer-state-badge skipped">Skipped (blank)</span>;
  }

  return answer.onFinalPath ? (
    <span className="answer-state-badge pending">Not answered yet</span>
  ) : (
    <span className="answer-state-badge skipped">Never reached</span>
  );
}

function AnswerValue({ answer }: { answer: AdminAttemptAnswer }) {
  if (answer.state === "not_reached") {
    return null;
  }

  if (answer.state === "skipped_blank") {
    return <p className="results-answer-value muted">No answer was provided.</p>;
  }

  if (answer.selectedOptions.length > 0) {
    return (
      <div className="results-selected-options">
        {answer.selectedOptions.map((option) => (
          <span className="results-selected-option" key={option.answerOptionId}>
            <span>{option.optionText}</span>
            {option.hiddenTags.map((tag) => (
              <span className="results-hidden-tag" key={`${tag.tagKey}:${tag.tagValue}`}>
                {tag.tagKey}: {tag.tagValue}
              </span>
            ))}
          </span>
        ))}
      </div>
    );
  }

  if (answer.answerText !== null) {
    return <p className="results-answer-value">{answer.answerText}</p>;
  }

  if (answer.answerInteger !== null) {
    return <p className="results-answer-value">{answer.answerInteger}</p>;
  }

  return null;
}

function formatAttemptStatus(status: SurveyAttemptStatus): string {
  return status.replace("_", " ");
}

function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function formatCount(count: number, singularLabel: string): string {
  return `${count} ${singularLabel}${count === 1 ? "" : "s"}`;
}

function formatDateTime(isoDate: string | null): string {
  if (!isoDate) {
    return "—";
  }

  const parsed = new Date(isoDate);

  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString();
}
