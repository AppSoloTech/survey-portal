import {
  resolveAttemptPath,
  type Survey,
  type SurveyAttempt,
  type SurveyAttemptStatus,
  type SurveyQuestion,
  type SurveyResponseAnswer
} from "@survey-portal/shared";
import { useEffect, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  answerSurvey,
  completeSurvey,
  fetchMySurvey,
  fetchMySurveys,
  startSurvey
} from "../api/surveys.js";

interface ActiveSurveyState {
  survey: Survey;
  attempt: SurveyAttempt;
  currentQuestion: SurveyQuestion | null;
}

type DraftAnswerMap<T> = Record<number, T>;
type DraftAnswerSetter<T> = Dispatch<SetStateAction<DraftAnswerMap<T>>>;

export function SurveyAttemptPage() {
  const { surveyId: surveyIdParam } = useParams();
  const surveyId = readSurveyIdParam(surveyIdParam);
  const navigate = useNavigate();
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
  const [loadError, setLoadError] = useState<string | null>(null);

  // The page recovers its full state from the server on mount (and refresh):
  // resume an existing attempt when one exists, otherwise start fresh.
  // Abandoned attempts intentionally start a new attempt per the attempt
  // policy.
  useEffect(() => {
    if (surveyId === null) {
      setIsLoading(false);
      setLoadError("Survey not found");
      return;
    }

    let isActive = true;

    setIsLoading(true);
    setLoadError(null);
    setActiveSurvey(null);

    async function openSurvey(id: number): Promise<ActiveSurveyState> {
      const summaries = await fetchMySurveys();
      const summary = summaries.surveys.find((item) => item.survey.id === id);

      if (summary?.attempt && summary.attempt.status !== "abandoned") {
        return fetchMySurvey(summary.attempt.id);
      }

      return startSurvey(id);
    }

    openSurvey(surveyId)
      .then((response) => {
        if (isActive) {
          setActiveSurvey(response);
        }
      })
      .catch((openError) => {
        if (isActive) {
          setLoadError(openError instanceof Error ? openError.message : "Could not open survey");
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
  }, [surveyId]);

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

  const currentQuestionId = activeSurvey?.currentQuestion?.id ?? null;
  const answerText = currentQuestionId ? answerTextByQuestionId[currentQuestionId] ?? "" : "";
  const answerInteger = currentQuestionId ? answerIntegerByQuestionId[currentQuestionId] ?? "" : "";
  const selectedAnswerOptionIds = currentQuestionId
    ? selectedAnswerOptionIdsByQuestionId[currentQuestionId] ?? []
    : [];

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

    if (
      question.questionType === "scale" &&
      question.isRequired &&
      selectedAnswerOptionIds.length === 0
    ) {
      setError("Choose a value on the scale");
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
          question.questionType === "single_select" ||
          question.questionType === "multi_select" ||
          question.questionType === "scale"
            ? selectedAnswerOptionIds
            : []
      });

      setActiveSurvey({
        survey: activeSurvey.survey,
        attempt: response.attempt,
        currentQuestion: response.currentQuestion
      });
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

    const { path } = resolveAttemptPath(activeSurvey.survey, activeSurvey.attempt.responses);
    const currentIndex = activeSurvey.currentQuestion
      ? path.findIndex((question) => question.id === activeSurvey.currentQuestion?.id)
      : path.length;
    const previousQuestion = currentIndex > 0 ? path[currentIndex - 1] ?? null : null;

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

    if (question.questionType === "single_select" || question.questionType === "scale") {
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

    setDraftAnswer(setAnswerTextByQuestionId, activeSurvey.currentQuestion.id, value);
  }

  function handleIntegerChange(value: string) {
    if (!activeSurvey?.currentQuestion) {
      return;
    }

    setDraftAnswer(setAnswerIntegerByQuestionId, activeSurvey.currentQuestion.id, value);
  }

  function handleClose() {
    navigate("/dashboard");
  }

  return (
    <section className="page attempt-page">
      <nav aria-label="Breadcrumb" className="attempt-breadcrumbs">
        <Link to="/dashboard">Dashboard</Link>
        <span aria-hidden="true">/</span>
        <span className="attempt-breadcrumb-current">
          {activeSurvey?.survey.title ?? "Survey"}
        </span>
      </nav>

      {error ? <p className="status error">{error}</p> : null}
      {isLoading ? <p className="status muted">Opening survey...</p> : null}

      {!isLoading && loadError ? (
        <div className="builder-empty-state">
          <strong>{loadError}</strong>
          <span>The survey may be unavailable or already completed.</span>
          <div className="inline-actions">
            <Link className="button-link compact-button primary-button" to="/dashboard">
              Back to dashboard
            </Link>
          </div>
        </div>
      ) : null}

      {activeSurvey ? (
        <div className="attempt-surface">
          <SurveyRunner
            activeSurvey={activeSurvey}
            answerInteger={answerInteger}
            answerText={answerText}
            isSubmitting={isSubmitting}
            onClose={handleClose}
            onComplete={() => void handleComplete()}
            onIntegerChange={handleIntegerChange}
            onPrevious={handlePrevious}
            onSelectionChange={handleSelection}
            onSubmit={handleSubmitAnswer}
            onTextChange={handleTextChange}
            selectedAnswerOptionIds={selectedAnswerOptionIds}
          />
        </div>
      ) : null}
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
  // The resolved path counts only questions the participant actually visits:
  // skip-logic targets excluded from the normal flow are not part of the
  // total unless an answer jumps to them.
  const { path } = resolveAttemptPath(survey, attempt.responses);
  const currentIndex = currentQuestion
    ? path.findIndex((question) => question.id === currentQuestion.id)
    : path.length;
  const previousQuestion = currentIndex > 0 ? path[currentIndex - 1] ?? null : null;

  if (!currentQuestion) {
    const savedAnswerCount = countSavedAnswers(attempt, path);
    const isCompleted = attempt.status === "completed";

    return (
      <div className="completion-panel">
        <div className="completion-heading">
          <div>
            <p className="eyebrow">{survey.title}</p>
            <h3>{isCompleted ? "Survey submitted" : "Ready to submit"}</h3>
          </div>
          <span className={`status-pill ${attempt.status}`}>{formatAttemptStatus(attempt.status)}</span>
        </div>

        <dl className="completion-summary" aria-label="Survey attempt summary">
          <div>
            <dt>Answered</dt>
            <dd>{savedAnswerCount}</dd>
          </div>
          <div>
            <dt>Questions on your path</dt>
            <dd>{path.length}</dd>
          </div>
        </dl>

        <div className="completion-note">
          <strong>{isCompleted ? "Your attempt is complete." : "Review before submitting."}</strong>
          <span>
            {isCompleted
              ? "Your responses are saved as a completed attempt."
              : "You can go back to review saved answers before submitting the survey."}
          </span>
        </div>
        <div className="survey-actions">
          <button
            className="button-link secondary-button"
            disabled={!previousQuestion || isSubmitting || attempt.status === "completed"}
            onClick={onPrevious}
            type="button"
          >
            Previous
          </button>
          <button
            className="button-link primary-button"
            disabled={isSubmitting || attempt.status === "completed"}
            onClick={onComplete}
            type="button"
          >
            {isSubmitting ? "Submitting..." : "Submit survey"}
          </button>
          <button
            className="button-link ghost-button"
            disabled={isSubmitting}
            onClick={onClose}
            type="button"
          >
            Back to surveys
          </button>
        </div>
      </div>
    );
  }

  const progressValue = currentIndex >= 0 ? currentIndex + 1 : 1;

  return (
    <form className="question-form" key={currentQuestion.id} onSubmit={onSubmit}>
      <div className="question-progress">
        <div>
          <p className="eyebrow">{survey.title}</p>
          <h3>
            Question {progressValue} of {path.length}
          </h3>
        </div>
        <progress max={path.length} value={progressValue} />
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
          className="button-link secondary-button"
          disabled={!previousQuestion || isSubmitting}
          onClick={onPrevious}
          type="button"
        >
          Previous
        </button>
        <button className="button-link primary-button" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Saving..." : "Next"}
        </button>
        <button
          className="button-link ghost-button"
          disabled={isSubmitting}
          onClick={onClose}
          type="button"
        >
          Back to surveys
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
      <IntegerStepperControl
        key={currentQuestion.id}
        onChange={onIntegerChange}
        question={currentQuestion}
        value={answerInteger}
      />
    );
  }

  if (currentQuestion.questionType === "scale") {
    return (
      <ScaleSliderControl
        key={currentQuestion.id}
        onSelect={(optionId) => onSelectionChange(optionId, true)}
        question={currentQuestion}
        selectedAnswerOptionIds={selectedAnswerOptionIds}
      />
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

function IntegerStepperControl({
  onChange,
  question,
  value
}: {
  onChange: (value: string) => void;
  question: SurveyQuestion;
  value: string;
}) {
  function step(delta: number) {
    const parsed = value.trim() ? Number(value) : 0;
    const base = Number.isInteger(parsed) ? parsed : 0;
    onChange(String(base + delta));
  }

  return (
    <div className="integer-answer-control">
      <div className="integer-stepper">
        <button
          aria-label="Decrease value"
          className="integer-stepper-button"
          onClick={() => step(-1)}
          type="button"
        >
          &minus;
        </button>
        <input
          inputMode="numeric"
          onChange={(event) => onChange(event.target.value)}
          placeholder="0"
          required={question.isRequired}
          step={1}
          type="number"
          value={value}
        />
        <button
          aria-label="Increase value"
          className="integer-stepper-button"
          onClick={() => step(1)}
          type="button"
        >
          +
        </button>
      </div>
      <p className="input-helper-text">Whole numbers only. Use the buttons or type a number.</p>
    </div>
  );
}

function ScaleSliderControl({
  onSelect,
  question,
  selectedAnswerOptionIds
}: {
  onSelect: (optionId: number) => void;
  question: SurveyQuestion;
  selectedAnswerOptionIds: number[];
}) {
  const sortedOptions = [...question.answerOptions].sort(
    (left, right) => left.displayOrder - right.displayOrder || left.id - right.id
  );
  const values = sortedOptions
    .map((option) => Number(option.optionText))
    .filter((value) => Number.isInteger(value));
  const min = question.scaleMin ?? (values.length > 0 ? Math.min(...values) : 0);
  const max = question.scaleMax ?? (values.length > 0 ? Math.max(...values) : 10);
  const selectedOption = sortedOptions.find((option) =>
    selectedAnswerOptionIds.includes(option.id)
  );
  const selectedValue = selectedOption ? Number(selectedOption.optionText) : null;
  const sliderValue = selectedValue ?? min;

  function selectValue(value: number) {
    const option = sortedOptions.find((item) => item.optionText === String(value));

    if (option) {
      onSelect(option.id);
    }
  }

  return (
    <div className="scale-slider-control">
      <div className="scale-slider-header">
        <span className={selectedValue === null ? "scale-slider-value empty" : "scale-slider-value"}>
          {selectedValue ?? "–"}
        </span>
        <span className="input-helper-text">
          {selectedValue === null
            ? "Drag or tap the slider to choose a value"
            : "Selected value"}
        </span>
      </div>
      <input
        aria-label={`Scale from ${min} to ${max}`}
        className="scale-slider"
        max={max}
        min={min}
        onChange={(event) => selectValue(Number(event.target.value))}
        onClick={(event) => selectValue(Number(event.currentTarget.value))}
        step={1}
        type="range"
        value={sliderValue}
      />
      <div className="scale-slider-labels" aria-hidden="true">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
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

// Counts saved answers that sit on the resolved path so the summary numbers
// always reconcile with "Questions on your path".
function countSavedAnswers(attempt: SurveyAttempt, path: SurveyQuestion[]): number {
  const pathQuestionIds = new Set(path.map((question) => question.id));

  return new Set(
    attempt.responses
      .filter((response) => pathQuestionIds.has(response.questionId))
      .map((response) => response.questionId)
  ).size;
}

function formatAttemptStatus(status: SurveyAttemptStatus): string {
  return status.replace("_", " ");
}

function readSurveyIdParam(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
