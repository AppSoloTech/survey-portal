import {
  getQuestionsForPage,
  resolveAttemptPagePath,
  resolveProgressivePageState,
  type Survey,
  type SurveyAttempt,
  type SurveyAttemptStatus,
  type SurveyPage,
  type SurveyQuestion,
  type SurveyResponseAnswer
} from "@survey-portal/shared";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type FormEvent,
  type SetStateAction
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  answerSurvey,
  completeSurvey,
  fetchMySurvey,
  fetchMySurveys,
  startSurvey
} from "../api/surveys.js";
import { AnimatedNumber } from "../components/AnimatedNumber.js";
import { prefersReducedMotion, useReveal } from "../motion/motion.js";

interface ActiveSurveyState {
  survey: Survey;
  attempt: SurveyAttempt;
  currentQuestion: SurveyQuestion | null;
  currentPage: SurveyPage | null;
  currentPageQuestionIds: number[];
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

  async function handleSubmitAnswer(question: SurveyQuestion, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeSurvey?.currentPage) {
      return;
    }

    const answerText = answerTextByQuestionId[question.id] ?? "";
    const answerInteger = answerIntegerByQuestionId[question.id] ?? "";
    const selectedAnswerOptionIds = selectedAnswerOptionIdsByQuestionId[question.id] ?? [];
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
      const isUpdatingReviewedQuestion = question.id !== activeSurvey.currentQuestion?.id;
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
        currentQuestion:
          isUpdatingReviewedQuestion && response.currentPage === null
            ? activeSurvey.currentQuestion
            : response.currentQuestion,
        currentPage:
          isUpdatingReviewedQuestion && response.currentPage === null
            ? activeSurvey.currentPage
            : response.currentPage,
        currentPageQuestionIds:
          isUpdatingReviewedQuestion && response.currentPage === null
            ? activeSurvey.currentPageQuestionIds
            : response.currentPageQuestionIds
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
        currentQuestion: null,
        currentPage: null,
        currentPageQuestionIds: []
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

    const { path } = resolveAttemptPagePath(activeSurvey.survey, activeSurvey.attempt.responses);
    const currentIndex = activeSurvey.currentPage
      ? path.findIndex((page) => page.id === activeSurvey.currentPage?.id)
      : path.length;
    const previousPage = currentIndex > 0 ? path[currentIndex - 1] ?? null : null;

    if (previousPage) {
      const { visibleQuestionIdsByPageId } = resolveAttemptPagePath(
        activeSurvey.survey,
        activeSurvey.attempt.responses
      );

      setActiveSurvey({
        ...activeSurvey,
        currentPage: previousPage,
        currentQuestion: null,
        currentPageQuestionIds:
          visibleQuestionIdsByPageId[previousPage.id] ??
          getQuestionsForPage(activeSurvey.survey, previousPage.id).map((question) => question.id)
      });
      setError(null);
    }
  }

  function handleResume() {
    if (!activeSurvey) {
      return;
    }

    const state = resolveProgressivePageState(
      activeSurvey.survey,
      activeSurvey.attempt.responses
    );

    setActiveSurvey({
      ...activeSurvey,
      currentPage: state.currentPage,
      currentQuestion: state.currentQuestion,
      currentPageQuestionIds: state.currentPageQuestionIds
    });
    setError(null);
  }

  function handleSelection(question: SurveyQuestion, optionId: number, checked: boolean) {
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

  function handleTextChange(questionId: number, value: string) {
    setDraftAnswer(setAnswerTextByQuestionId, questionId, value);
  }

  function handleIntegerChange(questionId: number, value: string) {
    setDraftAnswer(setAnswerIntegerByQuestionId, questionId, value);
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
            answerIntegerByQuestionId={answerIntegerByQuestionId}
            answerTextByQuestionId={answerTextByQuestionId}
            isSubmitting={isSubmitting}
            onClose={handleClose}
            onComplete={() => void handleComplete()}
            onIntegerChange={handleIntegerChange}
            onPrevious={handlePrevious}
            onResume={handleResume}
            onSelectionChange={handleSelection}
            onSubmit={handleSubmitAnswer}
            onTextChange={handleTextChange}
            selectedAnswerOptionIdsByQuestionId={selectedAnswerOptionIdsByQuestionId}
          />
        </div>
      ) : null}
    </section>
  );
}

function SurveyRunner({
  activeSurvey,
  answerIntegerByQuestionId,
  answerTextByQuestionId,
  isSubmitting,
  onClose,
  onComplete,
  onIntegerChange,
  onPrevious,
  onResume,
  onSelectionChange,
  onSubmit,
  onTextChange,
  selectedAnswerOptionIdsByQuestionId
}: {
  activeSurvey: ActiveSurveyState;
  answerIntegerByQuestionId: DraftAnswerMap<string>;
  answerTextByQuestionId: DraftAnswerMap<string>;
  isSubmitting: boolean;
  onClose: () => void;
  onComplete: () => void;
  onIntegerChange: (questionId: number, value: string) => void;
  onPrevious: () => void;
  onResume: () => void;
  onSelectionChange: (question: SurveyQuestion, optionId: number, checked: boolean) => void;
  onSubmit: (question: SurveyQuestion, event: FormEvent<HTMLFormElement>) => void;
  onTextChange: (questionId: number, value: string) => void;
  selectedAnswerOptionIdsByQuestionId: DraftAnswerMap<number[]>;
}) {
  const { survey, attempt, currentPage, currentQuestion, currentPageQuestionIds } = activeSurvey;
  // Each question (and the completion panel) cascades in as it appears.
  // Two refs because the runner renders either a <form> or a <div> panel.
  const revealRef = useReveal<HTMLDivElement>([currentPage?.id ?? null, attempt.status]);
  const formRevealRef = useReveal<HTMLDivElement>([currentPage?.id ?? null]);
  // The resolved path counts only questions the participant actually visits:
  // skip-logic targets excluded from the normal flow are not part of the
  // total unless an answer jumps to them.
  const { path } = resolveAttemptPagePath(survey, attempt.responses);
  const currentIndex = currentPage
    ? path.findIndex((page) => page.id === currentPage.id)
    : path.length;
  const previousPage = currentIndex > 0 ? path[currentIndex - 1] ?? null : null;

  if (!currentPage) {
    const savedAnswerCount = countSavedAnswers(survey, attempt, path);
    const isCompleted = attempt.status === "completed";

    return (
      <div className="completion-panel" ref={revealRef}>
        <div className="completion-heading" data-reveal>
          <div>
            <p className="eyebrow">{survey.title}</p>
            <h3>{isCompleted ? "Survey submitted" : "Ready to submit"}</h3>
          </div>
          <span className={`status-pill ${attempt.status}`}>{formatAttemptStatus(attempt.status)}</span>
        </div>

        <dl className="completion-summary" aria-label="Survey attempt summary" data-reveal>
          <div>
            <dt>Answered</dt>
            <dd>
              <AnimatedNumber value={savedAnswerCount} />
            </dd>
          </div>
          <div>
            <dt>Pages on your path</dt>
            <dd>
              <AnimatedNumber value={path.length} />
            </dd>
          </div>
        </dl>

        <div className="completion-note" data-reveal>
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
            disabled={!previousPage || isSubmitting || attempt.status === "completed"}
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
  const questionsById = new Map(survey.questions.map((question) => [question.id, question]));
  const pageQuestions = currentPageQuestionIds
    .map((questionId) => questionsById.get(questionId))
    .filter((question): question is SurveyQuestion => Boolean(question));
  const activeQuestionId = currentQuestion?.id ?? null;
  const isReviewingPreviousPage = activeQuestionId === null;

  return (
    <div
      className="question-form"
      key={currentPage.id}
      ref={formRevealRef}
    >
      <div className="question-progress" data-reveal>
        <div>
          <p className="eyebrow">{survey.title}</p>
          <h3>
            Page {progressValue} of {path.length}
          </h3>
          <p className="muted">{currentPage.title}</p>
        </div>
        <div
          aria-valuemax={path.length}
          aria-valuemin={0}
          aria-valuenow={progressValue}
          className="progress-track"
          role="progressbar"
        >
          <span
            className="progress-fill"
            style={{ width: `${Math.round((progressValue / Math.max(path.length, 1)) * 100)}%` }}
          />
        </div>
      </div>

      {currentPage.description ? <p className="muted">{currentPage.description}</p> : null}

      {pageQuestions.map((question) => {
        const isActiveQuestion = question.id === activeQuestionId;

        return (
        <form
          className={isActiveQuestion ? "question-step active" : "question-step answered"}
          id={`question-form-${question.id}`}
          key={question.id}
          onSubmit={(event) => onSubmit(question, event)}
        >
          <fieldset>
            <legend className="visually-hidden">{question.questionText}</legend>
            <h4 aria-hidden="true" className="question-prompt">
              {question.questionText}
            </h4>
            {question.helpText ? <p className="muted">{question.helpText}</p> : null}
            {renderQuestionControl({
              answerInteger: answerIntegerByQuestionId[question.id] ?? "",
              answerText: answerTextByQuestionId[question.id] ?? "",
              currentQuestion: question,
              onIntegerChange,
              onSelectionChange,
              onTextChange,
              selectedAnswerOptionIds: selectedAnswerOptionIdsByQuestionId[question.id] ?? []
            })}
            {!isActiveQuestion ? (
              <div className="question-step-actions">
                <button
                  className="button-link secondary-button compact-button"
                  disabled={isSubmitting}
                  type="submit"
                >
                  {isSubmitting ? "Saving..." : "Update answer"}
                </button>
              </div>
            ) : null}
          </fieldset>
        </form>
        );
      })}

      <div className="survey-actions" data-reveal>
        <button
          className="button-link secondary-button"
          disabled={!previousPage || isSubmitting}
          onClick={onPrevious}
          type="button"
        >
          Previous
        </button>
        {currentQuestion ? (
          <button
            className="button-link primary-button"
            disabled={isSubmitting}
            form={`question-form-${currentQuestion.id}`}
            type="submit"
          >
            {isSubmitting ? "Saving..." : "Continue"}
          </button>
        ) : isReviewingPreviousPage ? (
          <button
            className="button-link primary-button"
            disabled={isSubmitting}
            onClick={onResume}
            type="button"
          >
            Resume
          </button>
        ) : null}
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
  onIntegerChange: (questionId: number, value: string) => void;
  onSelectionChange: (question: SurveyQuestion, optionId: number, checked: boolean) => void;
  onTextChange: (questionId: number, value: string) => void;
  selectedAnswerOptionIds: number[];
}) {
  if (currentQuestion.questionType === "text") {
    return (
      <textarea
        key={currentQuestion.id}
        onChange={(event) => onTextChange(currentQuestion.id, event.target.value)}
        required={currentQuestion.isRequired}
        value={answerText}
      />
    );
  }

  if (currentQuestion.questionType === "integer") {
    return (
      <IntegerStepperControl
        key={currentQuestion.id}
        onChange={(value) => onIntegerChange(currentQuestion.id, value)}
        question={currentQuestion}
        value={answerInteger}
      />
    );
  }

  if (currentQuestion.questionType === "scale") {
    return (
      <ScaleSliderControl
        key={currentQuestion.id}
        onSelect={(optionId) => onSelectionChange(currentQuestion, optionId, true)}
        question={currentQuestion}
        selectedAnswerOptionIds={selectedAnswerOptionIds}
      />
    );
  }

  return (
    <div className="option-list">
      {currentQuestion.answerOptions.map((option) => (
        <label className="option-row" data-reveal key={option.id}>
          <input
            checked={selectedAnswerOptionIds.includes(option.id)}
            name={`question-${currentQuestion.id}`}
            onChange={(event) =>
              onSelectionChange(currentQuestion, option.id, event.target.checked)
            }
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
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Re-trigger the value-pop animation each time a stepper button fires.
  function bump() {
    const node = inputRef.current;

    if (!node || prefersReducedMotion()) {
      return;
    }

    node.classList.remove("bump");
    void node.offsetWidth;
    node.classList.add("bump");
  }

  function step(delta: number) {
    const parsed = value.trim() ? Number(value) : 0;
    const base = Number.isInteger(parsed) ? parsed : 0;
    onChange(String(base + delta));
    bump();
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
          ref={inputRef}
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

  // Drives the track's gradient fill up to the thumb position.
  const fillPercent = max > min ? ((sliderValue - min) / (max - min)) * 100 : 0;
  const tickCount = max - min + 1;

  return (
    <div className="scale-slider-control">
      <div className="scale-slider-header">
        <span
          className={selectedValue === null ? "scale-slider-value empty" : "scale-slider-value"}
          key={selectedValue ?? "none"}
        >
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
        className={selectedValue === null ? "scale-slider unset" : "scale-slider"}
        max={max}
        min={min}
        onChange={(event) => selectValue(Number(event.target.value))}
        onClick={(event) => selectValue(Number(event.currentTarget.value))}
        step={1}
        style={{ "--fill": `${fillPercent}%` } as CSSProperties}
        type="range"
        value={sliderValue}
      />
      {tickCount >= 3 && tickCount <= 21 ? (
        <div aria-hidden="true" className="scale-slider-ticks">
          {Array.from({ length: tickCount }, (_, index) => (
            <span
              className={
                selectedValue !== null && min + index <= selectedValue ? "tick filled" : "tick"
              }
              key={index}
            />
          ))}
        </div>
      ) : null}
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
function countSavedAnswers(
  survey: Survey,
  attempt: SurveyAttempt,
  path: SurveyPage[]
): number {
  const pathQuestionIds = new Set(
    path.flatMap((page) => getQuestionsForPage(survey, page.id).map((question) => question.id))
  );

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
