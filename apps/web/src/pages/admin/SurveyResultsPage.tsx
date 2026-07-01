import {
  getOrderedQuestions,
  type AdminAttemptAnswer,
  type AdminAttemptDetailResponse,
  type AdminAttemptReviewTag,
  type AdminAttemptSummary,
  type PaginationMetadata,
  type Survey,
  type SurveyAttemptStatus,
  type TagCatalogGroup,
  type TagDefinition,
  type SurveyReportOptionStat,
  type SurveyReportSummary,
  type SurveyReportTagStat
} from "@survey-portal/shared";
import { useEffect, useRef, useState } from "react";

import {
  addAnswerReviewTag,
  addAnswerReviewTagCategory,
  fetchSurveyAttemptDetail,
  fetchSurveyAttempts,
  fetchSurveyReport,
  removeAnswerReviewTagCategory,
  removeAnswerReviewTag,
  surveyExportCsvUrl
} from "../../api/surveys.js";
import { fetchTagDefinitions } from "../../api/tags.js";
import { formatQuestionLocator } from "../../components/admin/SurveyBuilderComponents.js";
import { useToast } from "../../components/ToastProvider.js";
import { useSurveyWorkspace } from "./SurveyWorkspaceLayout.js";

const categoryAllValuePrefix = "category-all:";
const attemptsPageSizeOptions = [25, 50, 100];
const defaultAttemptsPagination: PaginationMetadata = {
  page: 1,
  pageSize: 25,
  totalCount: 0,
  totalPages: 0,
  hasNextPage: false,
  hasPreviousPage: false
};

export function categoryAllValue(groupId: number): string {
  return `${categoryAllValuePrefix}${groupId}`;
}

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
  const toast = useToast();
  const { survey } = useSurveyWorkspace();
  const orderIndex = questionOrderIndex(survey);
  const [report, setReport] = useState<SurveyReportSummary | null>(null);
  const [attempts, setAttempts] = useState<AdminAttemptSummary[] | null>(null);
  const [attemptsPagination, setAttemptsPagination] =
    useState<PaginationMetadata>(defaultAttemptsPagination);
  const [detail, setDetail] = useState<AdminAttemptDetailResponse | null>(null);
  const [tagCatalog, setTagCatalog] = useState<TagDefinition[]>([]);
  const [tagGroups, setTagGroups] = useState<TagCatalogGroup[]>([]);
  const [ungroupedTags, setUngroupedTags] = useState<TagDefinition[]>([]);
  const [detailAttemptId, setDetailAttemptId] = useState<number | null>(null);
  const [attemptsPage, setAttemptsPage] = useState(1);
  const [attemptsPageSize, setAttemptsPageSize] = useState(25);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(true);
  const [isSummaryLoading, setIsSummaryLoading] = useState(true);
  const [isAttemptsLoading, setIsAttemptsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [pendingReviewMutations, setPendingReviewMutations] = useState<Set<string>>(new Set());
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [attemptsError, setAttemptsError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
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

    setIsSummaryLoading(true);
    setSummaryError(null);

    const range = { from: fromDate || undefined, to: toDate || undefined };

    Promise.all([fetchSurveyReport(survey.id, range), fetchTagDefinitions()])
      .then(([reportResponse, tagResponse]) => {
        if (isActive) {
          setReport(reportResponse.report);
          setTagCatalog(tagResponse.tags);
          setTagGroups(tagResponse.groups);
          setUngroupedTags(tagResponse.ungroupedTags);
        }
      })
      .catch((loadError) => {
        if (isActive) {
          setSummaryError(
            loadError instanceof Error ? loadError.message : "Could not load results summary"
          );
        }
      })
      .finally(() => {
        if (isActive) {
          setIsSummaryLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [survey.id, reloadKey, fromDate, toDate]);

  useEffect(() => {
    let isActive = true;
    const requestPage = attemptsPage;
    const range = { from: fromDate || undefined, to: toDate || undefined };

    detailRequestIdRef.current += 1;
    setIsAttemptsLoading(true);
    setAttemptsError(null);
    setDetail(null);
    setDetailAttemptId(null);
    setIsDetailLoading(false);

    fetchSurveyAttempts(survey.id, range, {
      page: requestPage,
      pageSize: attemptsPageSize
    })
      .then((attemptsResponse) => {
        if (!isActive) {
          return;
        }

        if (
          attemptsResponse.pagination.totalPages > 0 &&
          requestPage > attemptsResponse.pagination.totalPages
        ) {
          setAttemptsPage(attemptsResponse.pagination.totalPages);
          return;
        }

        setAttempts(attemptsResponse.attempts);
        setAttemptsPagination(attemptsResponse.pagination);
      })
      .catch((loadError) => {
        if (isActive) {
          setAttemptsError(
            loadError instanceof Error ? loadError.message : "Could not load attempts"
          );
        }
      })
      .finally(() => {
        if (isActive) {
          setIsAttemptsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [survey.id, reloadKey, fromDate, toDate, attemptsPage, attemptsPageSize]);

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
    setDetailError(null);

    try {
      const response = await fetchSurveyAttemptDetail(survey.id, attemptId);

      if (detailRequestIdRef.current === requestId) {
        setDetail(response);
      }
    } catch (detailError) {
      if (detailRequestIdRef.current === requestId) {
        setDetailError(detailError instanceof Error ? detailError.message : "Could not load answers");
        setDetailAttemptId(null);
      }
    } finally {
      if (detailRequestIdRef.current === requestId) {
        setIsDetailLoading(false);
      }
    }
  }

  async function handleAddReviewTag(answer: AdminAttemptAnswer, tagDefinitionId: number) {
    if (!answer.responseAnswerId || !detail) {
      return;
    }

    const mutationKey = `${answer.responseAnswerId}:add`;
    setPendingReviewMutations((current) => new Set(current).add(mutationKey));
    setDetailError(null);

    try {
      const response = await addAnswerReviewTag({
        answerId: answer.responseAnswerId,
        attemptId: detail.attempt.id,
        surveyId: survey.id,
        tagDefinitionId
      });
      updateDetailReviewTags(
        answer.responseAnswerId,
        response.reviewTags,
        response.reviewTagGroupIds
      );
      toast.success("Review tag added");
    } catch (mutationError) {
      toast.error(mutationError instanceof Error ? mutationError.message : "Could not add tag");
      void refreshTagCatalog();
    } finally {
      clearPendingReviewMutation(mutationKey);
    }
  }

  async function handleAddReviewTagCategory(answer: AdminAttemptAnswer, groupId: number) {
    if (!answer.responseAnswerId || !detail) {
      return;
    }

    const mutationKey = `${answer.responseAnswerId}:add`;
    setPendingReviewMutations((current) => new Set(current).add(mutationKey));
    setDetailError(null);

    try {
      const response = await addAnswerReviewTagCategory({
        answerId: answer.responseAnswerId,
        attemptId: detail.attempt.id,
        groupId,
        surveyId: survey.id
      });
      updateDetailReviewTags(
        answer.responseAnswerId,
        response.reviewTags,
        response.reviewTagGroupIds
      );
      toast.success("Review tags added");
    } catch (mutationError) {
      toast.error(mutationError instanceof Error ? mutationError.message : "Could not add tags");
      void refreshTagCatalog();
    } finally {
      clearPendingReviewMutation(mutationKey);
    }
  }

  async function handleRemoveReviewTag(answer: AdminAttemptAnswer, tagDefinitionId: number) {
    if (!answer.responseAnswerId || !detail) {
      return;
    }

    const mutationKey = `${answer.responseAnswerId}:remove:${tagDefinitionId}`;
    setPendingReviewMutations((current) => new Set(current).add(mutationKey));
    setDetailError(null);

    try {
      const response = await removeAnswerReviewTag({
        answerId: answer.responseAnswerId,
        attemptId: detail.attempt.id,
        surveyId: survey.id,
        tagDefinitionId
      });
      updateDetailReviewTags(
        answer.responseAnswerId,
        response.reviewTags,
        response.reviewTagGroupIds
      );
      toast.success("Review tag removed");
    } catch (mutationError) {
      toast.error(mutationError instanceof Error ? mutationError.message : "Could not remove tag");
      void refreshTagCatalog();
    } finally {
      clearPendingReviewMutation(mutationKey);
    }
  }

  async function handleRemoveReviewTagCategory(answer: AdminAttemptAnswer, groupId: number) {
    if (!answer.responseAnswerId || !detail) {
      return;
    }

    const mutationKey = `${answer.responseAnswerId}:remove-category:${groupId}`;
    setPendingReviewMutations((current) => new Set(current).add(mutationKey));
    setDetailError(null);

    try {
      const response = await removeAnswerReviewTagCategory({
        answerId: answer.responseAnswerId,
        attemptId: detail.attempt.id,
        groupId,
        surveyId: survey.id
      });
      updateDetailReviewTags(
        answer.responseAnswerId,
        response.reviewTags,
        response.reviewTagGroupIds
      );
      toast.success("Category auto-apply stopped");
    } catch (mutationError) {
      toast.error(
        mutationError instanceof Error ? mutationError.message : "Could not stop auto-apply"
      );
      void refreshTagCatalog();
    } finally {
      clearPendingReviewMutation(mutationKey);
    }
  }

  async function refreshTagCatalog() {
    try {
      const tagResponse = await fetchTagDefinitions();
      setTagCatalog(tagResponse.tags);
      setTagGroups(tagResponse.groups);
      setUngroupedTags(tagResponse.ungroupedTags);
    } catch {
      // The original mutation error toast is more useful than a second failure.
    }
  }

  function clearPendingReviewMutation(mutationKey: string) {
    setPendingReviewMutations((current) => {
      const next = new Set(current);
      next.delete(mutationKey);
      return next;
    });
  }

  function updateDetailReviewTags(
    answerId: number,
    reviewTags: AdminAttemptReviewTag[],
    reviewTagGroupIds: number[]
  ) {
    setDetail((current) =>
      current
        ? {
            ...current,
            answers: current.answers.map((answer) =>
              answer.responseAnswerId === answerId
                ? { ...answer, reviewTags, reviewTagGroupIds }
                : answer
            )
          }
        : current
    );
  }

  if (isSummaryLoading && !report) {
    return <p className="status muted">Loading results...</p>;
  }

  if (summaryError && !report) {
    return <p className="status error">{summaryError}</p>;
  }

  if (!report) {
    return <p className="status error">Could not load results.</p>;
  }

  return (
    <div className="builder-workspace">
      <section
        className={`builder-form results-summary-panel${
          isSummaryExpanded ? "" : " collapsed"
        }`}
      >
        <div className="builder-section-heading">
          <div>
            <p className="eyebrow">Results</p>
            <div className="results-summary-title-row">
              <h3>Completion summary</h3>
              <button
                aria-controls="results-summary-body"
                aria-expanded={isSummaryExpanded}
                className="results-summary-toggle"
                onClick={() => setIsSummaryExpanded((current) => !current)}
                type="button"
              >
                <span aria-hidden="true" className="results-summary-toggle-indicator">
                  {isSummaryExpanded ? "-" : "+"}
                </span>
                <span>{isSummaryExpanded ? "Collapse" : "Expand"}</span>
              </button>
            </div>
            <p className="builder-heading-note">
              Counts cover every attempt of this assessment. Hidden tags shown here are
              internal metadata and are never visible to participants.
            </p>
            {!isSummaryExpanded ? (
              <div className="results-summary-compact" aria-label="Collapsed summary counts">
                <span>{report.attemptCounts.completed} completed</span>
                <span>{report.attemptCounts.inProgress} in progress</span>
                <span>{report.attemptCounts.abandoned} abandoned</span>
                <span>{formatPercent(report.completionRate)} rate</span>
              </div>
            ) : null}
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
              onChange={(event) => {
                setAttemptsPage(1);
                setFromDate(event.target.value);
              }}
              type="date"
              value={fromDate}
            />
          </label>
          <label>
            To
            <input
              min={fromDate || undefined}
              onChange={(event) => {
                setAttemptsPage(1);
                setToDate(event.target.value);
              }}
              type="date"
              value={toDate}
            />
          </label>
          {fromDate || toDate ? (
            <button
              className="button-link compact-button ghost-button"
              onClick={() => {
                setAttemptsPage(1);
                setFromDate("");
                setToDate("");
              }}
              type="button"
            >
              Clear dates
            </button>
          ) : null}
        </div>

        {summaryError ? <p className="status error">{summaryError}</p> : null}
        {isSummaryLoading ? <p className="status muted">Refreshing summary...</p> : null}

        <div className="results-summary-body" hidden={!isSummaryExpanded} id="results-summary-body">
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
        </div>
      </section>

      <section className="builder-form results-attempts-panel">
        <div className="builder-section-heading">
          <div>
            <p className="eyebrow">Attempts</p>
            <h3>Participant attempts</h3>
            <p className="builder-heading-note">
              {formatAttemptRange(attemptsPagination, attempts?.length ?? 0)}
            </p>
          </div>
          <label className="results-page-size-control">
            Rows
            <select
              onChange={(event) => {
                setAttemptsPage(1);
                setAttemptsPageSize(Number(event.target.value));
              }}
              value={attemptsPageSize}
            >
              {attemptsPageSizeOptions.map((pageSize) => (
                <option key={pageSize} value={pageSize}>
                  {pageSize}
                </option>
              ))}
            </select>
          </label>
        </div>

        {attemptsError ? <p className="status error">{attemptsError}</p> : null}
        {detailError ? <p className="status error">{detailError}</p> : null}
        {isAttemptsLoading ? <p className="status muted">Loading attempts...</p> : null}

        {!isAttemptsLoading && !attemptsError && (attempts?.length ?? 0) === 0 ? (
          <div className="builder-empty-state">
            <strong>No attempts yet</strong>
            <span>
              Results appear here once participants match the selected date range.
            </span>
          </div>
        ) : null}

        {attempts && attempts.length > 0 ? (
          <div className="results-attempt-table" role="table" aria-label="Participant attempts">
            <div className="results-attempt-table-head" role="row">
              <span role="columnheader">Participant</span>
              <span role="columnheader">Status</span>
              <span role="columnheader">Started</span>
              <span role="columnheader">Activity</span>
              <span role="columnheader">Answers</span>
              <span role="columnheader">Review</span>
            </div>
            <div className="results-attempt-list" role="rowgroup">
              {attempts.map((attempt) => (
              <div className="results-attempt-row" key={attempt.attemptId}>
                <div className="results-attempt-main" role="cell" data-label="Participant">
                  <strong>
                    {attempt.participant.firstName} {attempt.participant.lastName}
                  </strong>
                  <span className="results-attempt-email">
                    {formatParticipantEmail(attempt.participant)}
                  </span>
                </div>
                <div role="cell" data-label="Status">
                  <span className={`status-pill ${attempt.status}`}>
                    {formatAttemptStatus(attempt.status)}
                  </span>
                </div>
                <span role="cell" data-label="Started">
                  {formatDateTime(attempt.startedAt)}
                </span>
                <span role="cell" data-label="Activity">
                  {attempt.status === "completed"
                    ? formatDateTime(attempt.completedAt)
                    : formatDateTime(attempt.lastActivityAt)}
                </span>
                <span role="cell" data-label="Answers">
                  {formatCount(attempt.answeredCount, "answer")}
                </span>
                <div className="results-attempt-actions" role="cell" data-label="Review">
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
          </div>
        ) : null}

        <div className="pagination-row results-pagination-row" aria-label="Attempt pages">
          <button
            className="button-link compact-button secondary-button"
            disabled={isAttemptsLoading || !attemptsPagination.hasPreviousPage}
            onClick={() => setAttemptsPage((page) => Math.max(1, page - 1))}
            type="button"
          >
            Previous
          </button>
          <span aria-atomic="true" aria-live="polite" className="pagination-status" role="status">
            {attemptsPagination.totalPages > 0
              ? `Page ${attemptsPagination.page} of ${attemptsPagination.totalPages}`
              : "Page 0 of 0"}
          </span>
          <button
            className="button-link compact-button secondary-button"
            disabled={isAttemptsLoading || !attemptsPagination.hasNextPage}
            onClick={() => setAttemptsPage((page) => page + 1)}
            type="button"
          >
            Next
          </button>
        </div>

        {isDetailLoading ? <p className="status muted">Loading answers...</p> : null}
        {detail ? (
          <AttemptDetailPanel
            detail={detail}
            onAddReviewTagCategory={handleAddReviewTagCategory}
            onAddReviewTag={handleAddReviewTag}
            onRemoveReviewTagCategory={handleRemoveReviewTagCategory}
            onRemoveReviewTag={handleRemoveReviewTag}
            orderIndex={orderIndex}
            pendingReviewMutations={pendingReviewMutations}
            survey={survey}
            tagCatalog={tagCatalog}
            tagGroups={tagGroups}
            ungroupedTags={ungroupedTags}
          />
        ) : null}
      </section>
    </div>
  );
}

function AttemptDetailPanel({
  detail,
  onAddReviewTagCategory,
  onAddReviewTag,
  onRemoveReviewTagCategory,
  onRemoveReviewTag,
  orderIndex,
  pendingReviewMutations,
  survey,
  tagCatalog,
  tagGroups,
  ungroupedTags
}: {
  detail: AdminAttemptDetailResponse;
  onAddReviewTagCategory: (answer: AdminAttemptAnswer, groupId: number) => Promise<void>;
  onAddReviewTag: (answer: AdminAttemptAnswer, tagDefinitionId: number) => Promise<void>;
  onRemoveReviewTagCategory: (answer: AdminAttemptAnswer, groupId: number) => Promise<void>;
  onRemoveReviewTag: (answer: AdminAttemptAnswer, tagDefinitionId: number) => Promise<void>;
  orderIndex: Map<number, number>;
  pendingReviewMutations: ReadonlySet<string>;
  survey: Survey;
  tagCatalog: TagDefinition[];
  tagGroups: TagCatalogGroup[];
  ungroupedTags: TagDefinition[];
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
          <AnswerValue
            answer={answer}
            onAddReviewTagCategory={onAddReviewTagCategory}
            onAddReviewTag={onAddReviewTag}
            onRemoveReviewTagCategory={onRemoveReviewTagCategory}
            onRemoveReviewTag={onRemoveReviewTag}
            pendingReviewMutations={pendingReviewMutations}
            tagCatalog={tagCatalog}
            tagGroups={tagGroups}
            ungroupedTags={ungroupedTags}
          />
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
  if (participant.type === "anonymous" && participant.email === "Anonymous survey link") {
    return "Anonymous assessment link";
  }

  if (participant.type === "anonymous" && participant.email !== "Anonymous survey link") {
    return `Unverified follow-up: ${participant.email}`;
  }

  return participant.email;
}

function AnswerValue({
  answer,
  onAddReviewTagCategory,
  onAddReviewTag,
  onRemoveReviewTagCategory,
  onRemoveReviewTag,
  pendingReviewMutations,
  tagCatalog,
  tagGroups,
  ungroupedTags
}: {
  answer: AdminAttemptAnswer;
  onAddReviewTagCategory: (answer: AdminAttemptAnswer, groupId: number) => Promise<void>;
  onAddReviewTag: (answer: AdminAttemptAnswer, tagDefinitionId: number) => Promise<void>;
  onRemoveReviewTagCategory: (answer: AdminAttemptAnswer, groupId: number) => Promise<void>;
  onRemoveReviewTag: (answer: AdminAttemptAnswer, tagDefinitionId: number) => Promise<void>;
  pendingReviewMutations: ReadonlySet<string>;
  tagCatalog: TagDefinition[];
  tagGroups: TagCatalogGroup[];
  ungroupedTags: TagDefinition[];
}) {
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
        {answer.otherText ? <OtherAnswerValue answer={answer} /> : null}
      </>
    );
  }

  if (answer.otherText) {
    return <OtherAnswerValue answer={answer} />;
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
        <ReviewTagEditor
          answer={answer}
          onAddReviewTagCategory={onAddReviewTagCategory}
          onAddReviewTag={onAddReviewTag}
          onRemoveReviewTagCategory={onRemoveReviewTagCategory}
          onRemoveReviewTag={onRemoveReviewTag}
          pendingReviewMutations={pendingReviewMutations}
          tagCatalog={tagCatalog}
          tagGroups={tagGroups}
          ungroupedTags={ungroupedTags}
        />
      </>
    );
  }

  return null;
}

function ReviewTagEditor({
  answer,
  onAddReviewTagCategory,
  onAddReviewTag,
  onRemoveReviewTagCategory,
  onRemoveReviewTag,
  pendingReviewMutations,
  tagCatalog,
  tagGroups,
  ungroupedTags
}: {
  answer: AdminAttemptAnswer;
  onAddReviewTagCategory: (answer: AdminAttemptAnswer, groupId: number) => Promise<void>;
  onAddReviewTag: (answer: AdminAttemptAnswer, tagDefinitionId: number) => Promise<void>;
  onRemoveReviewTagCategory: (answer: AdminAttemptAnswer, groupId: number) => Promise<void>;
  onRemoveReviewTag: (answer: AdminAttemptAnswer, tagDefinitionId: number) => Promise<void>;
  pendingReviewMutations: ReadonlySet<string>;
  tagCatalog: TagDefinition[];
  tagGroups: TagCatalogGroup[];
  ungroupedTags: TagDefinition[];
}) {
  if (
    answer.state !== "answered" ||
    answer.questionType !== "text" ||
    !answer.responseAnswerId ||
    !answer.answerText?.trim()
  ) {
    return null;
  }

  const appliedTagIds = new Set(answer.reviewTags.map((tag) => tag.tagDefinitionId));
  const appliedGroupIds = new Set(answer.reviewTagGroupIds);
  const boundGroups = tagGroups.filter((group) => appliedGroupIds.has(group.id));
  const availableTags = tagCatalog.filter((tag) => !appliedTagIds.has(tag.id));
  const availableCategoryGroups = tagGroups.filter((group) => !appliedGroupIds.has(group.id));
  const isAdding = pendingReviewMutations.has(`${answer.responseAnswerId}:add`);
  const availableOptionCount = availableTags.length + availableCategoryGroups.length;
  const groupedAvailableTags = tagGroups
    .filter((group) => !appliedGroupIds.has(group.id))
    .map((group) => ({
      ...group,
      tags: group.tags.filter((tag) => !appliedTagIds.has(tag.id))
    }));
  const availableUngroupedTags = ungroupedTags.filter((tag) => !appliedTagIds.has(tag.id));

  return (
    <div className="results-review-tags" aria-label="Review tags" role="group">
      <div className="results-review-tag-list">
        {answer.reviewTags.length === 0 ? (
          <span className="results-review-empty">No review tags yet</span>
        ) : (
          answer.reviewTags.map((tag) => {
            const mutationKey = `${answer.responseAnswerId}:remove:${tag.tagDefinitionId}`;
            const isRemoving = pendingReviewMutations.has(mutationKey);

            return (
              <span
                className="results-review-tag"
                key={tag.tagDefinitionId}
                title={tag.isManual ? undefined : "Managed by auto-applied category"}
              >
                {tag.tagKey}: {tag.tagValue}
                {tag.isManual ? (
                  <button
                    aria-label={`Remove review tag ${tag.tagKey}: ${tag.tagValue}`}
                    className="results-review-tag-remove"
                    disabled={isRemoving}
                    onClick={() => void onRemoveReviewTag(answer, tag.tagDefinitionId)}
                    type="button"
                  >
                    &times;
                  </button>
                ) : null}
              </span>
            );
          })
        )}
      </div>
      {boundGroups.length > 0 ? (
        <div className="results-review-tag-list" aria-label="Auto-applied tag categories">
          {boundGroups.map((group) => {
            const mutationKey = `${answer.responseAnswerId}:remove-category:${group.id}`;
            const isRemoving = pendingReviewMutations.has(mutationKey);

            return (
              <span className="results-review-tag" key={group.id}>
                Auto-applying all in {group.name}
                <button
                  aria-label={`Stop auto-applying all review tags in ${group.name}`}
                  className="results-review-tag-remove results-review-tag-stop"
                  disabled={isRemoving}
                  onClick={() => void onRemoveReviewTagCategory(answer, group.id)}
                  type="button"
                >
                  Stop
                </button>
              </span>
            );
          })}
        </div>
      ) : null}
      <label className="results-review-tag-picker">
        Add review tag
        <select
          disabled={isAdding || availableOptionCount === 0}
          onChange={(event) => {
            const selection = event.target.value;
            event.target.value = "";

            if (selection.startsWith(categoryAllValuePrefix)) {
              const groupId = Number(selection.slice(categoryAllValuePrefix.length));

              if (Number.isSafeInteger(groupId) && groupId > 0) {
                void onAddReviewTagCategory(answer, groupId);
              }
              return;
            }

            const tagDefinitionId = Number(selection);

            if (Number.isSafeInteger(tagDefinitionId) && tagDefinitionId > 0) {
              void onAddReviewTag(answer, tagDefinitionId);
            }
          }}
          value=""
        >
          <option value="">
            {availableOptionCount === 0 ? "All catalog tags applied" : "Select a tag"}
          </option>
          {groupedAvailableTags.map((group) => (
            <optgroup key={group.id} label={group.name}>
              <option value={categoryAllValue(group.id)}>
                {"<ALL>"} - Apply all in {group.name}
              </option>
              {group.tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.tagKey}: {tag.tagValue}
                </option>
              ))}
            </optgroup>
          ))}
          {availableUngroupedTags.length > 0 ? (
            <optgroup label="Ungrouped">
              {availableUngroupedTags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.tagKey}: {tag.tagValue}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
      </label>
    </div>
  );
}

function OtherAnswerValue({ answer }: { answer: AdminAttemptAnswer }) {
  return (
    <>
      <p className="results-answer-value">Other: {answer.otherText}</p>
      {answer.otherTags.length > 0 ? (
        <div className="results-selected-options">
          {answer.otherTags.map((tag) => (
            <span className="results-hidden-tag" key={`${tag.tagKey}:${tag.tagValue}`}>
              {tag.tagKey}: {tag.tagValue}
            </span>
          ))}
        </div>
      ) : null}
    </>
  );
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

// Admin-only rollup of hidden tag category/value pairs implied by selected
// options, Other answers, and value-tagged text/integer answers.
function TagRollup({ tagStats }: { tagStats: SurveyReportTagStat[] }) {
  if (tagStats.length === 0) {
    return null;
  }

  const maxSelections = Math.max(1, ...tagStats.map((stat) => stat.selectionCount));

  return (
    <div className="results-tag-rollup">
      <h4>Hidden tag rollup</h4>
      <p className="builder-heading-note">
        How often participant answers carried each hidden tag category/value pair.
        The respondent count includes each attempt once. Never shown to participants.
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

function formatAttemptRange(pagination: PaginationMetadata, visibleCount: number): string {
  if (pagination.totalCount === 0) {
    return "0 attempts";
  }

  if (visibleCount === 0) {
    return `${formatCount(pagination.totalCount, "attempt")} total`;
  }

  const firstVisible = (pagination.page - 1) * pagination.pageSize + 1;
  const lastVisible = Math.min(firstVisible + visibleCount - 1, pagination.totalCount);

  return `Showing ${firstVisible}-${lastVisible} of ${formatCount(
    pagination.totalCount,
    "attempt"
  )}`;
}

function formatDateTime(isoDate: string | null): string {
  if (!isoDate) {
    return "—";
  }

  const parsed = new Date(isoDate);

  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString();
}
