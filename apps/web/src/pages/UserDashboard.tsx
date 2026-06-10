import {
  resolveNextQuestion,
  type Survey,
  type SurveyAttempt,
  type SurveyAttemptStatus,
  type SurveyAttemptSummary,
  type SurveyQuestion,
  type SurveyResponseAnswer
} from "@survey-portal/shared";
import { useEffect, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";

import {
  answerSurvey,
  completeSurvey,
  fetchMySurvey,
  fetchMySurveys,
  startSurvey
} from "../api/surveys.js";
import { useAuth } from "../auth/AuthContext.js";

interface ActiveSurveyState {
  survey: Survey;
  attempt: SurveyAttempt;
  currentQuestion: SurveyQuestion | null;
}

type DraftAnswerMap<T> = Record<number, T>;
type DraftAnswerSetter<T> = Dispatch<SetStateAction<DraftAnswerMap<T>>>;

export function UserDashboard() {
  const { logout, user } = useAuth();
  const [summaries, setSummaries] = useState<SurveyAttemptSummary[]>([]);
  const [activeSurvey, setActiveSurvey] = useState<ActiveSurveyState | null>(null);
  const [answerTextByQuestionId, setAnswerTextByQuestionId] = useState<DraftAnswerMap<string>>({});
  const [answerIntegerByQuestionId, setAnswerIntegerByQuestionId] = useState<
    DraftAnswerMap<string>
  >({});
  const [selectedAnswerOptionIdsByQuestionId, setSelectedAnswerOptionIdsByQuestionId] = useState<
    DraftAnswerMap<number[]>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentQuestionId = activeSurvey?.currentQuestion?.id ?? null;
  const answerText = currentQuestionId ? answerTextByQuestionId[currentQuestionId] ?? "" : "";
  const answerInteger = currentQuestionId ? answerIntegerByQuestionId[currentQuestionId] ?? "" : "";
  const selectedAnswerOptionIds = currentQuestionId
    ? selectedAnswerOptionIdsByQuestionId[currentQuestionId] ?? []
    : [];

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

  useEffect(() => {
    if (!activeSurvey) {
      setAnswerTextByQuestionId({});
      setAnswerIntegerByQuestionId({});
      setSelectedAnswerOptionIdsByQuestionId({});
      return;
    }

    setAnswerTextByQuestionId((current) =>
      hydrateDrafts(current, activeSurvey.attempt, (response) => response.answerText ?? "")
    );
    setAnswerIntegerByQuestionId((current) =>
      hydrateDrafts(current, activeSurvey.attempt, (response) =>
        response.answerInteger === null || response.answerInteger === undefined
          ? ""
          : String(response.answerInteger)
      )
    );
    setSelectedAnswerOptionIdsByQuestionId((current) =>
      hydrateDrafts(current, activeSurvey.attempt, (response) => [
        ...response.selectedAnswerOptionIds
      ])
    );
  }, [activeSurvey?.attempt]);

  async function reloadSummaries() {
    const response = await fetchMySurveys();
    setSummaries(response.surveys);
  }

  async function handleStart(summary: SurveyAttemptSummary) {
    setError(null);
    setIsSubmitting(true);

    try {
      const response = summary.attempt
        ? await fetchMySurvey(summary.attempt.id)
        : await startSurvey(summary.survey.id);
      setActiveSurvey(response);
      await reloadSummaries();
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Could not open survey");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmitAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeSurvey?.currentQuestion) {
      return;
    }

    const question = activeSurvey.currentQuestion;
    const integerValue = answerInteger.trim() ? Number(answerInteger) : null;

    if (
      question.questionType === "integer" &&
      integerValue !== null &&
      !Number.isInteger(integerValue)
    ) {
      setError("Enter a whole number");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await answerSurvey({
        surveyId: activeSurvey.survey.id,
        attemptId: activeSurvey.attempt.id,
        questionId: question.id,
        answerText: question.questionType === "text" ? answerText : null,
        answerInteger: question.questionType === "integer" ? integerValue : null,
        selectedAnswerOptionIds:
          question.questionType === "single_select" || question.questionType === "multi_select"
            ? selectedAnswerOptionIds
            : []
      });

      setActiveSurvey({
        survey: activeSurvey.survey,
        attempt: response.attempt,
        currentQuestion: response.currentQuestion
      });
      await reloadSummaries();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not save answer");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleComplete() {
    if (!activeSurvey) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await completeSurvey({
        surveyId: activeSurvey.survey.id,
        attemptId: activeSurvey.attempt.id
      });
      setActiveSurvey({
        survey: activeSurvey.survey,
        attempt: response.attempt,
        currentQuestion: null
      });
      await reloadSummaries();
    } catch (completeError) {
      setError(completeError instanceof Error ? completeError.message : "Could not submit survey");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handlePrevious() {
    if (!activeSurvey) {
      return;
    }

    const previousQuestion = findPreviousQuestion(
      activeSurvey.survey,
      activeSurvey.attempt,
      activeSurvey.currentQuestion
    );

    if (previousQuestion) {
      setActiveSurvey({
        ...activeSurvey,
        currentQuestion: previousQuestion
      });
      setError(null);
    }
  }

  function handleSelection(optionId: number, checked: boolean) {
    const question = activeSurvey?.currentQuestion;

    if (!question) {
      return;
    }

    if (question.questionType === "single_select") {
      setSelectedAnswerOptionIdsByQuestionId((current) => ({
        ...current,
        [question.id]: [optionId]
      }));
      return;
    }

    setSelectedAnswerOptionIdsByQuestionId((current) => {
      const selectedIds = current[question.id] ?? [];

      return {
        ...current,
        [question.id]: checked
          ? [...selectedIds, optionId]
          : selectedIds.filter((id) => id !== optionId)
      };
    });
  }

  function handleTextChange(value: string) {
    if (!activeSurvey?.currentQuestion) {
      return;
    }

    const questionId = activeSurvey.currentQuestion.id;

    setDraftAnswer(setAnswerTextByQuestionId, questionId, value);
  }

  function handleIntegerChange(value: string) {
    if (!activeSurvey?.currentQuestion) {
      return;
    }

    const questionId = activeSurvey.currentQuestion.id;

    setDraftAnswer(setAnswerIntegerByQuestionId, questionId, value);
  }

  function handleCloseSurvey() {
    setActiveSurvey(null);
    setAnswerTextByQuestionId({});
    setAnswerIntegerByQuestionId({});
    setSelectedAnswerOptionIdsByQuestionId({});
  }

  return (
    <section className="page dashboard-page">
      <div className="page-header">
        <p className="eyebrow">User portal</p>
        <h2>Survey Dashboard</h2>
        <p>Browse available surveys, resume saved progress, and submit completed attempts.</p>
      </div>

      {user ? (
        <div className="profile-strip">
          <span>
            {user.firstName} {user.lastName}
          </span>
          <span>{user.email}</span>
          <button className="button-link compact-button" onClick={logout} type="button">
            Logout
          </button>
        </div>
      ) : null}

      {error ? <p className="status error">{error}</p> : null}

      <div className="survey-workspace">
        <div className="survey-list-panel">
          <h3>My surveys</h3>
          {isLoading ? <p className="status muted">Loading surveys...</p> : null}
          {!isLoading && summaries.length === 0 ? (
            <p className="status muted">No published surveys are available.</p>
          ) : null}
          <div className="survey-list">
            {summaries.map((summary) => (
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
                    className="button-link compact-button"
                    disabled={isSubmitting}
                    onClick={() => void handleStart(summary)}
                    type="button"
                  >
                    {getSurveyActionLabel(summary.attempt?.status)}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="survey-runner-panel">
          {activeSurvey ? (
            <SurveyRunner
              activeSurvey={activeSurvey}
              answerInteger={answerInteger}
              answerText={answerText}
              isSubmitting={isSubmitting}
              onClose={handleCloseSurvey}
              onComplete={() => void handleComplete()}
              onIntegerChange={handleIntegerChange}
              onPrevious={handlePrevious}
              onSelectionChange={handleSelection}
              onSubmit={handleSubmitAnswer}
              onTextChange={handleTextChange}
              selectedAnswerOptionIds={selectedAnswerOptionIds}
            />
          ) : (
            <p className="status muted">Select a survey to begin or resume.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function SurveyRunner({
  activeSurvey,
  answerInteger,
  answerText,
  isSubmitting,
  onClose,
  onComplete,
  onIntegerChange,
  onPrevious,
  onSelectionChange,
  onSubmit,
  onTextChange,
  selectedAnswerOptionIds
}: {
  activeSurvey: ActiveSurveyState;
  answerInteger: string;
  answerText: string;
  isSubmitting: boolean;
  onClose: () => void;
  onComplete: () => void;
  onIntegerChange: (value: string) => void;
  onPrevious: () => void;
  onSelectionChange: (optionId: number, checked: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTextChange: (value: string) => void;
  selectedAnswerOptionIds: number[];
}) {
  const { survey, attempt, currentQuestion } = activeSurvey;
  const previousQuestion = findPreviousQuestion(survey, attempt, currentQuestion);

  if (!currentQuestion) {
    return (
      <div className="completion-panel">
        <p className="eyebrow">{survey.title}</p>
        <h3>{attempt.status === "completed" ? "Survey submitted" : "Ready to submit"}</h3>
        <p className="muted">
          {attempt.status === "completed"
            ? "Your responses are saved as a completed attempt."
            : "All reached questions have saved responses."}
        </p>
        <div className="survey-actions">
          <button
            className="button-link"
            disabled={!previousQuestion || isSubmitting || attempt.status === "completed"}
            onClick={onPrevious}
            type="button"
          >
            Previous
          </button>
          <button
            className="button-link"
            disabled={isSubmitting || attempt.status === "completed"}
            onClick={onComplete}
            type="button"
          >
            {isSubmitting ? "Submitting..." : "Submit survey"}
          </button>
          <button className="button-link" disabled={isSubmitting} onClick={onClose} type="button">
            Back to surveys
          </button>
        </div>
      </div>
    );
  }

  const questionIndex = survey.questions.findIndex((question) => question.id === currentQuestion.id);
  const progressValue = questionIndex >= 0 ? questionIndex + 1 : 1;

  return (
    <form className="question-form" key={currentQuestion.id} onSubmit={onSubmit}>
      <div className="question-progress">
        <div>
          <p className="eyebrow">{survey.title}</p>
          <h3>
            Question {progressValue} of {survey.questions.length}
          </h3>
        </div>
        <progress max={survey.questions.length} value={progressValue} />
      </div>

      <fieldset>
        <legend>{currentQuestion.questionText}</legend>
        {currentQuestion.helpText ? <p className="muted">{currentQuestion.helpText}</p> : null}
        {renderQuestionControl({
          answerInteger,
          answerText,
          currentQuestion,
          onIntegerChange,
          onSelectionChange,
          onTextChange,
          selectedAnswerOptionIds
        })}
      </fieldset>

      <div className="survey-actions">
        <button
          className="button-link"
          disabled={!previousQuestion || isSubmitting}
          onClick={onPrevious}
          type="button"
        >
          Previous
        </button>
        <button className="button-link" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Saving..." : "Next"}
        </button>
      </div>
    </form>
  );
}

function renderQuestionControl({
  answerInteger,
  answerText,
  currentQuestion,
  onIntegerChange,
  onSelectionChange,
  onTextChange,
  selectedAnswerOptionIds
}: {
  answerInteger: string;
  answerText: string;
  currentQuestion: SurveyQuestion;
  onIntegerChange: (value: string) => void;
  onSelectionChange: (optionId: number, checked: boolean) => void;
  onTextChange: (value: string) => void;
  selectedAnswerOptionIds: number[];
}) {
  if (currentQuestion.questionType === "text") {
    return (
      <textarea
        key={currentQuestion.id}
        onChange={(event) => onTextChange(event.target.value)}
        required={currentQuestion.isRequired}
        value={answerText}
      />
    );
  }

  if (currentQuestion.questionType === "integer") {
    return (
      <div className="integer-answer-control">
        <input
          inputMode="numeric"
          key={currentQuestion.id}
          onChange={(event) => onIntegerChange(event.target.value)}
          placeholder="Enter a whole number"
          required={currentQuestion.isRequired}
          step={1}
          type="number"
          value={answerInteger}
        />
        <p className="input-helper-text">Use digits only. Decimals are not accepted.</p>
      </div>
    );
  }

  return (
    <div className="option-list">
      {currentQuestion.answerOptions.map((option) => (
        <label className="option-row" key={option.id}>
          <input
            checked={selectedAnswerOptionIds.includes(option.id)}
            name={`question-${currentQuestion.id}`}
            onChange={(event) => onSelectionChange(option.id, event.target.checked)}
            required={
              currentQuestion.questionType === "single_select" &&
              currentQuestion.isRequired &&
              selectedAnswerOptionIds.length === 0
            }
            type={currentQuestion.questionType === "single_select" ? "radio" : "checkbox"}
          />
          <span>{option.optionText}</span>
        </label>
      ))}
    </div>
  );
}

function findPreviousQuestion(
  survey: Survey,
  attempt: SurveyAttempt,
  currentQuestion: SurveyQuestion | null
): SurveyQuestion | null {
  const responsesByQuestionId = new Map(
    attempt.responses.map((response) => [response.questionId, response])
  );
  const path: SurveyQuestion[] = [];
  let question = findFirstQuestion(survey);
  const visitedQuestionIds = new Set<number>();

  while (question) {
    if (visitedQuestionIds.has(question.id)) {
      return null;
    }

    visitedQuestionIds.add(question.id);

    if (currentQuestion && question.id === currentQuestion.id) {
      return path[path.length - 1] ?? null;
    }

    path.push(question);
    question = resolveNextQuestion(survey, question, responsesByQuestionId.get(question.id));
  }

  return currentQuestion === null ? path[path.length - 1] ?? null : null;
}

function findFirstQuestion(survey: Survey): SurveyQuestion | null {
  return (
    [...survey.questions].sort(
      (left, right) => left.displayOrder - right.displayOrder || left.id - right.id
    )[0] ?? null
  );
}

function hydrateDrafts<T>(
  current: DraftAnswerMap<T>,
  attempt: SurveyAttempt,
  mapResponse: (response: SurveyResponseAnswer) => T
): DraftAnswerMap<T> {
  const next = { ...current };

  for (const response of attempt.responses) {
    next[response.questionId] = mapResponse(response);
  }

  return next;
}

function setDraftAnswer<T>(
  setter: DraftAnswerSetter<T>,
  questionId: number,
  value: T
) {
  setter((current) => ({
    ...current,
    [questionId]: value
  }));
}

function getSurveyActionLabel(status: SurveyAttemptStatus | undefined): string {
  if (status === "completed") {
    return "View";
  }

  if (status === "in_progress" || status === "not_started") {
    return "Resume";
  }

  return "Start";
}

function formatAttemptStatus(status: SurveyAttemptStatus): string {
  return status.replace("_", " ");
}
