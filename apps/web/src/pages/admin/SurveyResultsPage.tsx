import {
  getOrderedQuestions,
  type AdminAttemptAnswer,
  type AdminAttemptDetailResponse,
  type AdminAttemptSummary,
  type Survey,
  type SurveyAttemptStatus,
  type SurveyReportOptionStat,
  type SurveyReportSummary,
  type SurveyReportTagStat
} from "@survey-portal/shared";
import { useEffect, useRef, useState } from "react";

import {
  fetchSurveyAttemptDetail,
  fetchSurveyAttempts,
  fetchSurveyReport,
  surveyExportCsvUrl
} from "../../api/surveys.js";
import { formatQuestionLocator } from "../../components/admin/SurveyBuilderComponents.js";
import { useSurveyWorkspace } from "./SurveyWorkspaceLayout.js";

// Results come back from the report/attempt APIs keyed by question id; order
// them by the survey's page-then-question flow and label them with the same
// P#-Q# locator the builder uses, so the page reads in survey order.
function questionOrderIndex(survey: Survey): Map<number, number> {
  return new Map(getOrderedQuestions(survey).map((question, index) => [question.id, index]));
}

function compareByQuestionOrder(
  orderIndex: Map<number, number>,
  leftQuestionId: number,
  rightQuestionId: number
): number {
  return (
    (orderIndex.get(leftQuestionId) ?? Number.MAX_SAFE_INTEGER) -
    (orderIndex.get(rightQuestionId) ?? Number.MAX_SAFE_INTEGER)
  );
}

function resultsQuestionLabel(
  survey: Survey,
  questionId: number,
  displayOrder: number,
  questionText: string
): string {
  const question = survey.questions.find((candidate) => candidate.id === questionId);
  const locator = question ? formatQuestionLocator(survey, question) : `Q${displayOrder}`;

  return `${locator} ${questionText}`;
}

export function SurveyResultsPage() {
  const { survey } = useSurveyWorkspace();
  const orderIndex = questionOrderIndex(survey);
  const [report, setReport] = useState<SurveyReportSummary | null>(null);
  const [attempts, setAttempts] = useState<AdminAttemptSummary[] | null>(null);
  const [detail, setDetail] = useState<AdminAttemptDetailResponse | null>(null);
  const [detailAttemptId, setDetailAttemptId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Inclusive started-at window applied to the report, attempts list, and
  // CSV export together so every number on the page describes one cohort.
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const dateRange = {
    from: fromDate || undefined,
    to: toDate || undefined
  };
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

    const range = { from: fromDate || undefined, to: toDate || undefined };

    Promise.all([fetchSurveyReport(survey.id, range), fetchSurveyAttempts(survey.id, range)])
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
  }, [survey.id, reloadKey, fromDate, toDate]);

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
              href={surveyExportCsvUrl(survey.id, dateRange)}
            >
              Export CSV
            </a>
          </div>
        </div>

        <div aria-label="Filter results by attempt start date" className="results-date-filter">
          <label>
            From
            <input
              max={toDate || undefined}
              onChange={(event) => setFromDate(event.target.value)}
              type="date"
              value={fromDate}
            />
          </label>
          <label>
            To
            <input
              min={fromDate || undefined}
              onChange={(event) => setToDate(event.target.value)}
              type="date"
              value={toDate}
            />
          </label>
          {fromDate || toDate ? (
            <button
              className="button-link compact-button ghost-button"
              onClick={() => {
                setFromDate("");
                setToDate("");
              }}
              type="button"
            >
              Clear dates
            </button>
          ) : null}
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
            {[...report.questionStats]
              .sort((left, right) =>
                compareByQuestionOrder(orderIndex, left.questionId, right.questionId)
              )
              .map((stat) => {
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
                    {resultsQuestionLabel(survey, stat.questionId, stat.displayOrder, stat.questionText)}
                  </span>
                  <span className="results-question-counts">
                    {formatCount(stat.answeredCount, "answer")}
                    {stat.blankCount > 0 ? `, ${stat.blankCount} blank` : ""}
                    {stat.otherResponseCount > 0
                      ? `, ${stat.otherResponseCount} other`
                      : ""}
                  </span>
                  <span aria-hidden="true" className="results-question-bar">
                    <span
                      className="results-question-bar-fill"
                      style={{ width: `${barPercent}%` }}
                    />
                  </span>
                  <OptionDistribution optionStats={stat.optionStats} />
                </div>
              );
            })}
          </div>
        ) : null}

        <TagRollup tagStats={report.tagStats} />
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
                  <span className="results-attempt-email">
                    {formatParticipantEmail(attempt.participant)}
                  </span>
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
        {detail ? <AttemptDetailPanel detail={detail} orderIndex={orderIndex} survey={survey} /> : null}
      </section>
    </div>
  );
}

function AttemptDetailPanel({
  detail,
  orderIndex,
  survey
}: {
  detail: AdminAttemptDetailResponse;
  orderIndex: Map<number, number>;
  survey: Survey;
}) {
  return (
    <div className="results-detail-panel" aria-label="Attempt answers">
      <div className="results-detail-heading">
        <div>
          <p className="option-subheading">Answers</p>
          <h4>
            {detail.participant.firstName} {detail.participant.lastName} —{" "}
            {detail.surveyTitle}
          </h4>
          <span className="results-attempt-email">
            {formatParticipantEmail(detail.participant)}
          </span>
        </div>
        <span className={`status-pill ${detail.attempt.status}`}>
          {formatAttemptStatus(detail.attempt.status)}
        </span>
      </div>

      {[...detail.answers]
        .sort((left, right) =>
          compareByQuestionOrder(orderIndex, left.questionId, right.questionId)
        )
        .map((answer) => (
        <div className="results-answer-row" key={answer.questionId}>
          <div className="results-answer-heading">
            <span className="results-question-label">
              {resultsQuestionLabel(survey, answer.questionId, answer.displayOrder, answer.questionText)}
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

function formatParticipantEmail(participant: { email: string; type: "user" | "anonymous" }): string {
  if (participant.type === "anonymous" && participant.email !== "Anonymous survey link") {
    return `Unverified follow-up: ${participant.email}`;
  }

  return participant.email;
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
      <>
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
        {answer.otherText ? (
          <p className="results-answer-value">Other: {answer.otherText}</p>
        ) : null}
      </>
    );
  }

  if (answer.otherText) {
    return <p className="results-answer-value">Other: {answer.otherText}</p>;
  }

  if (answer.answerText !== null || answer.answerInteger !== null) {
    return (
      <>
        <p className="results-answer-value">{answer.answerText ?? answer.answerInteger}</p>
        {answer.valueTags.length > 0 ? (
          <div className="results-selected-options">
            {answer.valueTags.map((tag) => (
              <span className="results-hidden-tag" key={`${tag.tagKey}:${tag.tagValue}`}>
                {tag.tagKey}: {tag.tagValue}
              </span>
            ))}
          </div>
        ) : null}
      </>
    );
  }

  return null;
}

function formatAttemptStatus(status: SurveyAttemptStatus): string {
  return status.replace("_", " ");
}

// Per-option selection bars for select/scale questions, scaled within the
// question so the most-picked option fills the track.
function OptionDistribution({ optionStats }: { optionStats: SurveyReportOptionStat[] }) {
  if (optionStats.length === 0) {
    return null;
  }

  const maxSelections = Math.max(1, ...optionStats.map((option) => option.selectionCount));

  return (
    <div className="results-option-distribution">
      {optionStats.map((option) => (
        <div className="results-option-row" key={option.answerOptionId}>
          <span className="results-option-label">{option.optionText}</span>
          <span className="results-question-counts">{option.selectionCount}</span>
          <span aria-hidden="true" className="results-question-bar">
            <span
              className="results-question-bar-fill results-option-bar-fill"
              style={{ width: `${Math.round((option.selectionCount / maxSelections) * 100)}%` }}
            />
          </span>
        </div>
      ))}
    </div>
  );
}

// Admin-only rollup of hidden tag pairs implied by selected options.
function TagRollup({ tagStats }: { tagStats: SurveyReportTagStat[] }) {
  if (tagStats.length === 0) {
    return null;
  }

  const maxSelections = Math.max(1, ...tagStats.map((stat) => stat.selectionCount));

  return (
    <div className="results-tag-rollup">
      <h4>Hidden tag rollup</h4>
      <p className="builder-heading-note">
        How often participants selected options carrying each hidden tag pair.
        Respondents counts each attempt once. Never shown to participants.
      </p>
      {tagStats.map((stat) => (
        <div className="results-question-stat-row" key={`${stat.tagKey}:${stat.tagValue}`}>
          <span className="results-tag-pair">
            <span className="results-hidden-tag">
              {stat.tagKey}={stat.tagValue}
            </span>
          </span>
          <span className="results-question-counts">
            {formatCount(stat.selectionCount, "selection")} ·{" "}
            {formatCount(stat.respondentCount, "respondent")}
          </span>
          <span aria-hidden="true" className="results-question-bar">
            <span
              className="results-question-bar-fill"
              style={{ width: `${Math.round((stat.selectionCount / maxSelections) * 100)}%` }}
            />
          </span>
        </div>
      ))}
    </div>
  );
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
