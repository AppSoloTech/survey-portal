import {
  calculateSurveyRemainingTimeEstimate,
  getQuestionsForPage,
  resolveAttemptPagePath,
  resolveProgressivePageState,
  type ParticipantGlossaryEntry,
  type Survey,
  type SurveyAttempt,
  type SurveyAttemptActivityEventType,
  type SurveyAttemptStatus,
  type SurveyPage,
  type SurveyQuestion,
  type SurveyResponseAnswer
} from "@survey-portal/shared";
import {
  useEffect,
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  answerAnonymousSurvey,
  answerSurvey,
  completeAnonymousSurvey,
  completeSurvey,
  convertAnonymousSurveyAttempt,
  fetchAnonymousSurvey,
  fetchMySurvey,
  fetchMySurveys,
  recordAnonymousSurveyActivity,
  recordSurveyActivity,
  startAnonymousSurvey,
  startSurvey,
  submitAnonymousContactEmail
} from "../api/surveys.js";
import { useAuth } from "../auth/AuthContext.js";
import { AnimatedNumber } from "../components/AnimatedNumber.js";
import { InlineGlossaryText } from "../components/InlineGlossaryText.js";
import { prefersReducedMotion, useReveal } from "../motion/motion.js";

interface ActiveSurveyState {
  survey: Survey;
  glossaryEntries: ParticipantGlossaryEntry[];
  attempt: SurveyAttempt;
  attemptAccessToken: string | null;
  currentQuestion: SurveyQuestion | null;
  currentPage: SurveyPage | null;
  currentPageQuestionIds: number[];
}

interface AnonymousRegistrationDraft {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

type DraftAnswerMap<T> = Record<number, T>;
type DraftAnswerSetter<T> = Dispatch<SetStateAction<DraftAnswerMap<T>>>;

export function SurveyAttemptPage() {
  return <SurveyAttemptExperience mode="authenticated" />;
}

export function AnonymousSurveyAttemptPage() {
  return <SurveyAttemptExperience mode="anonymous" />;
}

function SurveyAttemptExperience({ mode }: { mode: "authenticated" | "anonymous" }) {
  const { surveyId: surveyIdParam, token: tokenParam } = useParams();
  const surveyId = readSurveyIdParam(surveyIdParam);
  const anonymousToken = tokenParam ?? null;
  const navigate = useNavigate();
  const { updateSessionUser } = useAuth();
  const [activeSurvey, setActiveSurvey] = useState<ActiveSurveyState | null>(null);
  const [answerTextByQuestionId, setAnswerTextByQuestionId] = useState<DraftAnswerMap<string>>({});
  const [answerIntegerByQuestionId, setAnswerIntegerByQuestionId] = useState<
    DraftAnswerMap<string>
  >({});
  const [selectedAnswerOptionIdsByQuestionId, setSelectedAnswerOptionIdsByQuestionId] = useState<
    DraftAnswerMap<number[]>
  >({});
  const [isOtherSelectedByQuestionId, setIsOtherSelectedByQuestionId] = useState<
    DraftAnswerMap<boolean>
  >({});
  const [otherTextByQuestionId, setOtherTextByQuestionId] = useState<DraftAnswerMap<string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isContactEmailSubmitting, setIsContactEmailSubmitting] = useState(false);
  const [isContactEmailModalOpen, setIsContactEmailModalOpen] = useState(false);
  const [contactEmailDraft, setContactEmailDraft] = useState("");
  const [contactEmailMessage, setContactEmailMessage] = useState<string | null>(null);
  const [contactEmailError, setContactEmailError] = useState<string | null>(null);
  const [anonymousRegistrationDraft, setAnonymousRegistrationDraft] =
    useState<AnonymousRegistrationDraft>({
      firstName: "",
      lastName: "",
      email: "",
      password: ""
    });
  const [anonymousRegistrationError, setAnonymousRegistrationError] = useState<string | null>(null);
  const [isAnonymousRegistrationSubmitting, setIsAnonymousRegistrationSubmitting] =
    useState(false);
  const [hasDeclinedAnonymousRegistration, setHasDeclinedAnonymousRegistration] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorQuestionId, setErrorQuestionId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const recordedResumeAttemptIdsRef = useRef<Set<number>>(new Set());
  const recordedPageEntryKeysRef = useRef<Set<string>>(new Set());

  // The page recovers its full state from the server on mount (and refresh):
  // resume an existing attempt when one exists, otherwise start fresh.
  // Abandoned attempts intentionally start a new attempt per the attempt
  // policy.
  useEffect(() => {
    if (mode === "authenticated" && surveyId === null) {
      setIsLoading(false);
      setLoadError("Survey not found");
      return;
    }

    if (mode === "anonymous" && !anonymousToken) {
      setIsLoading(false);
      setLoadError("Survey link unavailable");
      return;
    }

    let isActive = true;

    setIsLoading(true);
    setLoadError(null);
    setActiveSurvey(null);

    async function openAuthenticatedSurvey(id: number): Promise<ActiveSurveyState> {
      const summaries = await fetchMySurveys();
      const summary = summaries.surveys.find((item) => item.survey.id === id);

      if (summary?.attempt && summary.attempt.status !== "abandoned") {
        return {
          ...(await fetchMySurvey(summary.attempt.id)),
          attemptAccessToken: null
        };
      }

      return {
        ...(await startSurvey(id)),
        attemptAccessToken: null
      };
    }

    async function openAnonymousSurvey(token: string): Promise<ActiveSurveyState> {
      await fetchAnonymousSurvey(token);
      return startAnonymousSurvey(token);
    }

    const openPromise =
      mode === "authenticated"
        ? openAuthenticatedSurvey(surveyId as number)
        : openAnonymousSurvey(anonymousToken as string);

    openPromise
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
  }, [anonymousToken, mode, surveyId]);

  const sendActivityEvent = useCallback(
    (eventType: SurveyAttemptActivityEventType) => {
      if (!activeSurvey || activeSurvey.attempt.status !== "in_progress") {
        return;
      }

      const payload = {
        attemptId: activeSurvey.attempt.id,
        eventType,
        pageId: activeSurvey.currentPage?.id ?? null,
        questionId: activeSurvey.currentQuestion?.id ?? null,
        visibleQuestionIds: activeSurvey.currentPageQuestionIds
      };
      const request =
        mode === "anonymous" && anonymousToken && activeSurvey.attemptAccessToken
          ? recordAnonymousSurveyActivity({
              ...payload,
              token: anonymousToken,
              attemptAccessToken: activeSurvey.attemptAccessToken
            })
          : recordSurveyActivity({
              ...payload,
              surveyId: activeSurvey.survey.id
            });

      void request.catch(() => undefined);
    },
    [activeSurvey, anonymousToken, mode]
  );

  useEffect(() => {
    if (!activeSurvey || activeSurvey.attempt.status !== "in_progress") {
      return;
    }

    if (recordedResumeAttemptIdsRef.current.has(activeSurvey.attempt.id)) {
      return;
    }

    recordedResumeAttemptIdsRef.current.add(activeSurvey.attempt.id);
    sendActivityEvent("resume");
  }, [activeSurvey?.attempt.id, activeSurvey?.attempt.status, sendActivityEvent]);

  useEffect(() => {
    if (!activeSurvey?.currentPage || activeSurvey.attempt.status !== "in_progress") {
      return;
    }

    const pageEntryKey = `${activeSurvey.attempt.id}:${activeSurvey.currentPage.id}`;

    if (recordedPageEntryKeysRef.current.has(pageEntryKey)) {
      return;
    }

    recordedPageEntryKeysRef.current.add(pageEntryKey);
    sendActivityEvent("page_entry");
  }, [
    activeSurvey?.attempt.id,
    activeSurvey?.attempt.status,
    activeSurvey?.currentPage?.id,
    sendActivityEvent
  ]);

  useEffect(() => {
    if (!activeSurvey || activeSurvey.attempt.status !== "in_progress") {
      return;
    }

    const heartbeatId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        sendActivityEvent("heartbeat");
      }
    }, 60_000);

    return () => {
      window.clearInterval(heartbeatId);
    };
  }, [activeSurvey?.attempt.id, activeSurvey?.attempt.status, sendActivityEvent]);

  useEffect(() => {
    if (!activeSurvey) {
      setAnswerTextByQuestionId({});
      setAnswerIntegerByQuestionId({});
      setSelectedAnswerOptionIdsByQuestionId({});
      setIsOtherSelectedByQuestionId({});
      setOtherTextByQuestionId({});
      setContactEmailDraft("");
      setContactEmailMessage(null);
      setContactEmailError(null);
      setIsContactEmailModalOpen(false);
      setErrorQuestionId(null);
      setAnonymousRegistrationDraft({
        firstName: "",
        lastName: "",
        email: "",
        password: ""
      });
      setAnonymousRegistrationError(null);
      setHasDeclinedAnonymousRegistration(false);
      return;
    }

    if (activeSurvey.attempt.status !== "completed") {
      setAnonymousRegistrationError(null);
      setHasDeclinedAnonymousRegistration(false);
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
    setIsOtherSelectedByQuestionId((current) =>
      hydrateDrafts(current, activeSurvey.attempt, (response) =>
        Boolean(response.otherText?.trim())
      )
    );
    setOtherTextByQuestionId((current) =>
      hydrateDrafts(current, activeSurvey.attempt, (response) => response.otherText ?? "")
    );
  }, [activeSurvey?.attempt]);

  useEffect(() => {
    if (mode !== "anonymous" || activeSurvey?.attempt.status !== "completed") {
      return;
    }

    setContactEmailDraft(activeSurvey.attempt.anonymousContactEmail ?? "");
  }, [activeSurvey?.attempt.anonymousContactEmail, activeSurvey?.attempt.status, mode]);

  async function handleSubmitAnswer(question: SurveyQuestion, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeSurvey?.currentPage) {
      return;
    }

    const answerText = answerTextByQuestionId[question.id] ?? "";
    const answerInteger = answerIntegerByQuestionId[question.id] ?? "";
    const selectedAnswerOptionIds = selectedAnswerOptionIdsByQuestionId[question.id] ?? [];
    const isOtherSelected = isOtherSelectedByQuestionId[question.id] ?? false;
    const otherText = otherTextByQuestionId[question.id] ?? "";
    const integerValue = answerInteger.trim() ? Number(answerInteger) : null;

    if (
      question.questionType === "integer" &&
      integerValue !== null &&
      !Number.isInteger(integerValue)
    ) {
      setError("Enter a whole number");
      setErrorQuestionId(question.id);
      return;
    }

    if (
      question.questionType === "scale" &&
      question.isRequired &&
      selectedAnswerOptionIds.length === 0
    ) {
      setError("Choose a value on the scale");
      setErrorQuestionId(question.id);
      return;
    }

    setError(null);
    setErrorQuestionId(null);
    setIsSubmitting(true);

    try {
      const isUpdatingReviewedQuestion = question.id !== activeSurvey.currentQuestion?.id;
      const answerInput = {
        attemptId: activeSurvey.attempt.id,
        questionId: question.id,
        answerText: question.questionType === "text" ? answerText : null,
        answerInteger: question.questionType === "integer" ? integerValue : null,
        selectedAnswerOptionIds:
          question.questionType === "single_select" ||
          question.questionType === "multi_select" ||
          question.questionType === "scale"
            ? selectedAnswerOptionIds
            : [],
        isOtherSelected:
          (question.questionType === "single_select" || question.questionType === "multi_select") &&
          question.allowOther
            ? isOtherSelected
            : false,
        otherText:
          (question.questionType === "single_select" || question.questionType === "multi_select") &&
          question.allowOther &&
          isOtherSelected
            ? otherText
            : null
      };
      const response =
        mode === "anonymous" && anonymousToken && activeSurvey.attemptAccessToken
          ? await answerAnonymousSurvey({
              ...answerInput,
              token: anonymousToken,
              attemptAccessToken: activeSurvey.attemptAccessToken
            })
          : await answerSurvey({
              ...answerInput,
              surveyId: activeSurvey.survey.id
            });

      setActiveSurvey({
        survey: activeSurvey.survey,
        glossaryEntries: activeSurvey.glossaryEntries,
        attempt: response.attempt,
        attemptAccessToken: activeSurvey.attemptAccessToken,
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
      setErrorQuestionId(question.id);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleComplete() {
    if (!activeSurvey) {
      return;
    }

    setError(null);
    setErrorQuestionId(null);
    setIsSubmitting(true);

    try {
      const response =
        mode === "anonymous" && anonymousToken && activeSurvey.attemptAccessToken
          ? await completeAnonymousSurvey({
              token: anonymousToken,
              attemptAccessToken: activeSurvey.attemptAccessToken,
              attemptId: activeSurvey.attempt.id
            })
          : await completeSurvey({
              surveyId: activeSurvey.survey.id,
              attemptId: activeSurvey.attempt.id
            });
      setActiveSurvey({
        survey: activeSurvey.survey,
        glossaryEntries: activeSurvey.glossaryEntries,
        attempt: response.attempt,
        attemptAccessToken: activeSurvey.attemptAccessToken,
        currentQuestion: null,
        currentPage: null,
        currentPageQuestionIds: []
      });
      if (mode === "anonymous" && !response.attempt.anonymousContactEmail) {
        setContactEmailMessage(null);
        setContactEmailError(null);
        setIsContactEmailModalOpen(false);
        setAnonymousRegistrationError(null);
        setHasDeclinedAnonymousRegistration(false);
      }
    } catch (completeError) {
      setError(completeError instanceof Error ? completeError.message : "Could not submit survey");
      setErrorQuestionId(null);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmitAnonymousContactEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      mode !== "anonymous" ||
      !anonymousToken ||
      !activeSurvey?.attemptAccessToken ||
      activeSurvey.attempt.status !== "completed"
    ) {
      return;
    }

    const email = contactEmailDraft.trim();

    if (!email) {
      return;
    }

    setContactEmailError(null);
    setContactEmailMessage(null);
    setIsContactEmailSubmitting(true);

    try {
      const response = await submitAnonymousContactEmail({
        token: anonymousToken,
        attemptAccessToken: activeSurvey.attemptAccessToken,
        attemptId: activeSurvey.attempt.id,
        email
      });

      setActiveSurvey({
        ...activeSurvey,
        attempt: response.attempt
      });
      setContactEmailMessage("Email saved");
      setIsContactEmailModalOpen(false);
    } catch (submitError) {
      setContactEmailError(
        submitError instanceof Error ? submitError.message : "Could not save email"
      );
    } finally {
      setIsContactEmailSubmitting(false);
    }
  }

  async function handleSubmitAnonymousRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      mode !== "anonymous" ||
      !anonymousToken ||
      !activeSurvey?.attemptAccessToken ||
      activeSurvey.attempt.status !== "completed"
    ) {
      return;
    }

    setAnonymousRegistrationError(null);
    setIsAnonymousRegistrationSubmitting(true);

    try {
      const response = await convertAnonymousSurveyAttempt({
        token: anonymousToken,
        attemptAccessToken: activeSurvey.attemptAccessToken,
        attemptId: activeSurvey.attempt.id,
        ...anonymousRegistrationDraft
      });

      updateSessionUser(response.user);
      setActiveSurvey({
        ...activeSurvey,
        attempt: response.attempt,
        attemptAccessToken: null
      });
      navigate("/dashboard", { replace: true });
    } catch (submitError) {
      setAnonymousRegistrationError(
        submitError instanceof Error ? submitError.message : "Could not create account"
      );
    } finally {
      setIsAnonymousRegistrationSubmitting(false);
    }
  }

  function handleOpenContactEmailModal() {
    setContactEmailError(null);
    setContactEmailMessage(null);
    setIsContactEmailModalOpen(true);
  }

  function handleSkipContactEmail() {
    setContactEmailError(null);
    setIsContactEmailModalOpen(false);
  }

  function handleDeclineAnonymousRegistration() {
    setAnonymousRegistrationError(null);
    setHasDeclinedAnonymousRegistration(true);
    setIsContactEmailModalOpen(true);
  }

  function handleAnonymousRegistrationDraftChange(
    field: keyof AnonymousRegistrationDraft,
    value: string
  ) {
    setAnonymousRegistrationDraft((current) => ({ ...current, [field]: value }));
    setAnonymousRegistrationError(null);
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
      setErrorQuestionId(null);
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
    setErrorQuestionId(null);
  }

  function clearQuestionError(questionId: number) {
    if (errorQuestionId === questionId) {
      setError(null);
      setErrorQuestionId(null);
    }
  }

  function handleSelection(question: SurveyQuestion, optionId: number, checked: boolean) {
    clearQuestionError(question.id);

    if (question.questionType === "single_select" || question.questionType === "scale") {
      setSelectedAnswerOptionIdsByQuestionId((current) => ({
        ...current,
        [question.id]: [optionId]
      }));
      if (question.questionType === "single_select") {
        setDraftAnswer<boolean>(setIsOtherSelectedByQuestionId, question.id, false);
      }
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
    clearQuestionError(questionId);
    setDraftAnswer(setAnswerTextByQuestionId, questionId, value);
  }

  function handleIntegerChange(questionId: number, value: string) {
    clearQuestionError(questionId);
    setDraftAnswer(setAnswerIntegerByQuestionId, questionId, value);
  }

  function handleOtherSelection(question: SurveyQuestion, checked: boolean) {
    clearQuestionError(question.id);
    setDraftAnswer(setIsOtherSelectedByQuestionId, question.id, checked);

    if (checked && question.questionType === "single_select") {
      setDraftAnswer<number[]>(setSelectedAnswerOptionIdsByQuestionId, question.id, []);
    }
  }

  function handleOtherTextChange(questionId: number, value: string) {
    clearQuestionError(questionId);
    setDraftAnswer(setOtherTextByQuestionId, questionId, value);
  }

  function handleClose() {
    navigate(mode === "anonymous" ? "/" : "/dashboard");
  }

  return (
    <section className="page attempt-page">
      <nav aria-label="Breadcrumb" className="attempt-breadcrumbs">
        <Link to={mode === "anonymous" ? "/" : "/dashboard"}>
          {mode === "anonymous" ? "Home" : "Dashboard"}
        </Link>
        <span aria-hidden="true">/</span>
        <span className="attempt-breadcrumb-current">
          {activeSurvey?.survey.title ?? "Survey"}
        </span>
      </nav>

      {error && errorQuestionId === null ? (
        <p className="status error" role="alert">
          {error}
        </p>
      ) : null}
      {isLoading ? (
        <p aria-live="polite" className="status muted" role="status">
          Opening survey...
        </p>
      ) : null}

      {!isLoading && loadError ? (
        <div className="builder-empty-state" role="alert">
          <strong>{loadError}</strong>
          <span>The survey may be unavailable or already completed.</span>
          <div className="inline-actions">
            <Link
              className="button-link compact-button primary-button"
              to={mode === "anonymous" ? "/" : "/dashboard"}
            >
              {mode === "anonymous" ? "Back home" : "Back to dashboard"}
            </Link>
          </div>
        </div>
      ) : null}

      {activeSurvey ? (
        <div className="attempt-surface">
          <SurveyRunner
            activeSurvey={activeSurvey}
            anonymousRegistrationDraft={anonymousRegistrationDraft}
            anonymousRegistrationError={anonymousRegistrationError}
            answerIntegerByQuestionId={answerIntegerByQuestionId}
            answerTextByQuestionId={answerTextByQuestionId}
            contactEmailMessage={contactEmailMessage}
            error={error}
            errorQuestionId={errorQuestionId}
            hasDeclinedAnonymousRegistration={hasDeclinedAnonymousRegistration}
            isAnonymous={mode === "anonymous"}
            isAnonymousRegistrationSubmitting={isAnonymousRegistrationSubmitting}
            isSubmitting={isSubmitting}
            onClose={handleClose}
            onComplete={() => void handleComplete()}
            onAnonymousRegistrationChange={handleAnonymousRegistrationDraftChange}
            onDeclineAnonymousRegistration={handleDeclineAnonymousRegistration}
            onOpenContactEmailModal={handleOpenContactEmailModal}
            onIntegerChange={handleIntegerChange}
            onOtherSelectionChange={handleOtherSelection}
            onOtherTextChange={handleOtherTextChange}
            onPrevious={handlePrevious}
            onResume={handleResume}
            onSelectionChange={handleSelection}
            onSubmit={handleSubmitAnswer}
            onSubmitAnonymousRegistration={(event) =>
              void handleSubmitAnonymousRegistration(event)
            }
            onTextChange={handleTextChange}
            selectedAnswerOptionIdsByQuestionId={selectedAnswerOptionIdsByQuestionId}
            isOtherSelectedByQuestionId={isOtherSelectedByQuestionId}
            otherTextByQuestionId={otherTextByQuestionId}
          />
          {mode === "anonymous" && activeSurvey.attempt.status === "completed" ? (
            <AnonymousContactEmailModal
              email={contactEmailDraft}
              error={contactEmailError}
              isOpen={isContactEmailModalOpen}
              isSubmitting={isContactEmailSubmitting}
              onChange={(value) => {
                setContactEmailDraft(value);
                setContactEmailError(null);
                setContactEmailMessage(null);
              }}
              onSkip={handleSkipContactEmail}
              onSubmit={(event) => void handleSubmitAnonymousContactEmail(event)}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function SurveyRunner({
  activeSurvey,
  anonymousRegistrationDraft,
  anonymousRegistrationError,
  answerIntegerByQuestionId,
  answerTextByQuestionId,
  contactEmailMessage,
  error,
  errorQuestionId,
  hasDeclinedAnonymousRegistration,
  isAnonymous,
  isAnonymousRegistrationSubmitting,
  isOtherSelectedByQuestionId,
  isSubmitting,
  onClose,
  onComplete,
  onAnonymousRegistrationChange,
  onDeclineAnonymousRegistration,
  onOpenContactEmailModal,
  onIntegerChange,
  onOtherSelectionChange,
  onOtherTextChange,
  onPrevious,
  onResume,
  onSelectionChange,
  onSubmit,
  onSubmitAnonymousRegistration,
  onTextChange,
  otherTextByQuestionId,
  selectedAnswerOptionIdsByQuestionId
}: {
  activeSurvey: ActiveSurveyState;
  anonymousRegistrationDraft: AnonymousRegistrationDraft;
  anonymousRegistrationError: string | null;
  answerIntegerByQuestionId: DraftAnswerMap<string>;
  answerTextByQuestionId: DraftAnswerMap<string>;
  contactEmailMessage: string | null;
  error: string | null;
  errorQuestionId: number | null;
  hasDeclinedAnonymousRegistration: boolean;
  isAnonymous: boolean;
  isAnonymousRegistrationSubmitting: boolean;
  isOtherSelectedByQuestionId: DraftAnswerMap<boolean>;
  isSubmitting: boolean;
  onClose: () => void;
  onComplete: () => void;
  onAnonymousRegistrationChange: (field: keyof AnonymousRegistrationDraft, value: string) => void;
  onDeclineAnonymousRegistration: () => void;
  onOpenContactEmailModal: () => void;
  onIntegerChange: (questionId: number, value: string) => void;
  onOtherSelectionChange: (question: SurveyQuestion, checked: boolean) => void;
  onOtherTextChange: (questionId: number, value: string) => void;
  onPrevious: () => void;
  onResume: () => void;
  onSelectionChange: (question: SurveyQuestion, optionId: number, checked: boolean) => void;
  onSubmit: (question: SurveyQuestion, event: FormEvent<HTMLFormElement>) => void;
  onSubmitAnonymousRegistration: (event: FormEvent<HTMLFormElement>) => void;
  onTextChange: (questionId: number, value: string) => void;
  selectedAnswerOptionIdsByQuestionId: DraftAnswerMap<number[]>;
  otherTextByQuestionId: DraftAnswerMap<string>;
}) {
  const {
    survey,
    glossaryEntries,
    attempt,
    currentPage,
    currentQuestion,
    currentPageQuestionIds
  } = activeSurvey;
  // Each question (and the completion panel) cascades in as it appears.
  // Two refs because the runner renders either a <form> or a <div> panel.
  const revealRef = useReveal<HTMLDivElement>([currentPage?.id ?? null, attempt.status]);
  const formRevealRef = useReveal<HTMLDivElement>([currentPage?.id ?? null]);
  // The resolved path counts only questions the participant actually visits:
  // skip-logic targets excluded from the normal flow are not part of the
  // total unless an answer jumps to them.
  const pagePath = resolveAttemptPagePath(survey, attempt.responses);
  const { path } = pagePath;
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
        {isAnonymous && isCompleted && attempt.userId === null ? (
          <div className="contact-email-summary" data-reveal>
            {!hasDeclinedAnonymousRegistration && !attempt.anonymousContactEmail ? (
              <AnonymousRegistrationPanel
                draft={anonymousRegistrationDraft}
                error={anonymousRegistrationError}
                isSubmitting={isAnonymousRegistrationSubmitting}
                onChange={onAnonymousRegistrationChange}
                onDecline={onDeclineAnonymousRegistration}
                onSubmit={onSubmitAnonymousRegistration}
              />
            ) : contactEmailMessage || attempt.anonymousContactEmail ? (
              <p aria-live="polite" className="status muted" role="status">
                {contactEmailMessage ?? `Follow-up email saved as ${attempt.anonymousContactEmail}`}
              </p>
            ) : (
              <button
                className="button-link secondary-button compact-button"
                onClick={onOpenContactEmailModal}
                type="button"
              >
                Add follow-up email
              </button>
            )}
          </div>
        ) : null}
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

  const remainingEstimate = calculateSurveyRemainingTimeEstimate({
    currentPageId: currentPage.id,
    pagePath,
    responses: attempt.responses,
    survey
  });
  const progressPercent =
    remainingEstimate.totalEstimateSeconds > 0
      ? Math.round(
          ((remainingEstimate.totalEstimateSeconds - remainingEstimate.remainingSeconds) /
            remainingEstimate.totalEstimateSeconds) *
            100
        )
      : 0;
  const progressValue = Math.max(0, Math.min(100, progressPercent));
  const totalPathPages = Math.max(path.length, 1);
  const currentPathPageNumber =
    currentIndex >= 0 ? Math.min(currentIndex + 1, totalPathPages) : totalPathPages;
  const progressContextId = `survey-progress-context-${attempt.id}`;
  const progressTimeId = `survey-progress-time-${attempt.id}`;
  const progressValueText = `Page ${currentPathPageNumber} of ${totalPathPages} on your current survey path, ${progressValue}% complete. ${remainingEstimate.copy}`;
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
          <h3>{currentPage.title}</h3>
          <p className="progress-context" id={progressContextId}>
            Page {currentPathPageNumber} of {totalPathPages} on your current survey path
          </p>
          <p aria-live="polite" className="remaining-time-label" id={progressTimeId}>
            {remainingEstimate.copy}
          </p>
        </div>
        <progress
          aria-describedby={`${progressContextId} ${progressTimeId}`}
          aria-label="Survey progress"
          aria-valuetext={progressValueText}
          className="survey-progress-meter"
          max={100}
          value={progressValue}
        >
          {progressValue}%
        </progress>
      </div>

      {currentPage.description ? <p className="muted">{currentPage.description}</p> : null}

      {pageQuestions.map((question) => {
        const isActiveQuestion = question.id === activeQuestionId;
        const questionIds = getQuestionAccessibilityIds(question.id);
        const questionError = errorQuestionId === question.id ? error : null;
        const questionDescription = joinIds(
          question.helpText ? questionIds.helpId : null,
          questionError ? questionIds.errorId : null
        );

        return (
          <form
            className={isActiveQuestion ? "question-step active" : "question-step answered"}
            id={`question-form-${question.id}`}
            key={question.id}
            onSubmit={(event) => onSubmit(question, event)}
          >
            <fieldset
              aria-describedby={questionDescription}
              aria-labelledby={questionIds.promptId}
            >
              <legend className="question-prompt" id={questionIds.promptId}>
                <InlineGlossaryText entries={glossaryEntries} text={question.questionText} />
              </legend>
              {question.helpText ? (
                <p className="muted" id={questionIds.helpId}>
                  {question.helpText}
                </p>
              ) : null}
              {renderQuestionControl({
                accessibilityIds: questionIds,
                answerInteger: answerIntegerByQuestionId[question.id] ?? "",
                answerText: answerTextByQuestionId[question.id] ?? "",
                currentQuestion: question,
                describedBy: questionDescription,
                hasError: Boolean(questionError),
                onIntegerChange,
                onOtherSelectionChange,
                onOtherTextChange,
                onSelectionChange,
                onTextChange,
                selectedAnswerOptionIds: selectedAnswerOptionIdsByQuestionId[question.id] ?? [],
                isOtherSelected: isOtherSelectedByQuestionId[question.id] ?? false,
                otherText: otherTextByQuestionId[question.id] ?? ""
              })}
              {questionError ? (
                <p className="status error question-error" id={questionIds.errorId} role="alert">
                  {questionError}
                </p>
              ) : null}
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

function AnonymousRegistrationPanel({
  draft,
  error,
  isSubmitting,
  onChange,
  onDecline,
  onSubmit
}: {
  draft: AnonymousRegistrationDraft;
  error: string | null;
  isSubmitting: boolean;
  onChange: (field: keyof AnonymousRegistrationDraft, value: string) => void;
  onDecline: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="anonymous-registration-panel" onSubmit={onSubmit}>
      <div className="anonymous-registration-heading">
        <p className="eyebrow">Save to an account</p>
        <h4>Create an account for this completed survey?</h4>
        <p className="muted">
          Your saved responses will move into your new account and appear in your survey history.
        </p>
      </div>
      <div className="anonymous-registration-grid">
        <label>
          <span>First name</span>
          <input
            autoComplete="given-name"
            onChange={(event) => onChange("firstName", event.target.value)}
            required
            type="text"
            value={draft.firstName}
          />
        </label>
        <label>
          <span>Last name</span>
          <input
            autoComplete="family-name"
            onChange={(event) => onChange("lastName", event.target.value)}
            required
            type="text"
            value={draft.lastName}
          />
        </label>
        <label>
          <span>Email</span>
          <input
            autoComplete="email"
            inputMode="email"
            onChange={(event) => onChange("email", event.target.value)}
            required
            type="email"
            value={draft.email}
          />
        </label>
        <label>
          <span>Password</span>
          <input
            autoComplete="new-password"
            minLength={8}
            onChange={(event) => onChange("password", event.target.value)}
            required
            type="password"
            value={draft.password}
          />
        </label>
      </div>
      {error ? (
        <p className="status error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="anonymous-registration-actions">
        <button
          className="button-link ghost-button"
          disabled={isSubmitting}
          onClick={onDecline}
          type="button"
        >
          Continue anonymously
        </button>
        <button className="button-link primary-button" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Creating account..." : "Create account"}
        </button>
      </div>
    </form>
  );
}

function AnonymousContactEmailModal({
  email,
  error,
  isOpen,
  isSubmitting,
  onChange,
  onSkip,
  onSubmit
}: {
  email: string;
  error: string | null;
  isOpen: boolean;
  isSubmitting: boolean;
  onChange: (value: string) => void;
  onSkip: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form
        aria-describedby="anonymous-contact-email-description"
        aria-labelledby="anonymous-contact-email-title"
        aria-modal="true"
        className="contact-email-modal"
        onSubmit={onSubmit}
        role="dialog"
      >
        <div className="contact-email-modal-heading">
          <p className="eyebrow">Optional</p>
          <h3 id="anonymous-contact-email-title">Share an email for follow-up?</h3>
        </div>
        <p className="muted" id="anonymous-contact-email-description">
          Enter an email if you would like the survey owner to contact you about this survey.
          This address is optional and will be visible to the survey owner.
        </p>
        <label>
          <span id="anonymous-contact-email-label">Email</span>
          <input
            aria-describedby={joinIds(
              "anonymous-contact-email-description",
              error ? "anonymous-contact-email-error" : null
            )}
            aria-invalid={error ? "true" : undefined}
            aria-labelledby="anonymous-contact-email-label"
            autoComplete="email"
            inputMode="email"
            onChange={(event) => onChange(event.target.value)}
            placeholder="name@example.com"
            type="email"
            value={email}
          />
        </label>
        {error ? (
          <p className="status error" id="anonymous-contact-email-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="contact-email-modal-actions">
          <button
            className="button-link ghost-button"
            disabled={isSubmitting}
            onClick={onSkip}
            type="button"
          >
            Skip
          </button>
          <button
            className="button-link primary-button"
            disabled={isSubmitting || !email.trim()}
            type="submit"
          >
            {isSubmitting ? "Saving..." : "Save email"}
          </button>
        </div>
      </form>
    </div>
  );
}

function renderQuestionControl({
  accessibilityIds,
  answerInteger,
  answerText,
  currentQuestion,
  describedBy,
  hasError,
  isOtherSelected,
  onIntegerChange,
  onOtherSelectionChange,
  onOtherTextChange,
  onSelectionChange,
  onTextChange,
  otherText,
  selectedAnswerOptionIds
}: {
  accessibilityIds: QuestionAccessibilityIds;
  answerInteger: string;
  answerText: string;
  currentQuestion: SurveyQuestion;
  describedBy: string | undefined;
  hasError: boolean;
  isOtherSelected: boolean;
  onIntegerChange: (questionId: number, value: string) => void;
  onOtherSelectionChange: (question: SurveyQuestion, checked: boolean) => void;
  onOtherTextChange: (questionId: number, value: string) => void;
  onSelectionChange: (question: SurveyQuestion, optionId: number, checked: boolean) => void;
  onTextChange: (questionId: number, value: string) => void;
  otherText: string;
  selectedAnswerOptionIds: number[];
}) {
  if (currentQuestion.questionType === "text") {
    return (
      <textarea
        aria-describedby={describedBy}
        aria-invalid={hasError ? "true" : undefined}
        aria-labelledby={accessibilityIds.promptId}
        id={accessibilityIds.controlId}
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
        accessibilityIds={accessibilityIds}
        describedBy={describedBy}
        hasError={hasError}
        key={currentQuestion.id}
        onChange={(value) => onIntegerChange(currentQuestion.id, value)}
        question={currentQuestion}
        value={answerInteger}
      />
    );
  }

  if (currentQuestion.questionType === "scale") {
    return (
      <ScaleRadioControl
        accessibilityIds={accessibilityIds}
        describedBy={describedBy}
        hasError={hasError}
        key={currentQuestion.id}
        onSelect={(optionId) => onSelectionChange(currentQuestion, optionId, true)}
        question={currentQuestion}
        selectedAnswerOptionIds={selectedAnswerOptionIds}
      />
    );
  }

  return (
    <div className="option-list">
      {currentQuestion.answerOptions.map((option) => {
        const optionLabelId = `${accessibilityIds.controlId}-option-${option.id}-label`;

        return (
          <label className="option-row" data-reveal key={option.id}>
            <input
              aria-describedby={describedBy}
              aria-invalid={hasError ? "true" : undefined}
              aria-labelledby={`${accessibilityIds.promptId} ${optionLabelId}`}
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
            <span id={optionLabelId}>{option.optionText}</span>
          </label>
        );
      })}
      {currentQuestion.allowOther ? (
        <label className="option-row option-row-other" data-reveal>
          <input
            aria-describedby={describedBy}
            aria-invalid={hasError ? "true" : undefined}
            aria-labelledby={`${accessibilityIds.promptId} ${accessibilityIds.otherOptionLabelId}`}
            checked={isOtherSelected}
            name={`question-${currentQuestion.id}`}
            onChange={(event) =>
              onOtherSelectionChange(currentQuestion, event.target.checked)
            }
            required={
              currentQuestion.questionType === "single_select" &&
              currentQuestion.isRequired &&
              selectedAnswerOptionIds.length === 0 &&
              !isOtherSelected
            }
            type={currentQuestion.questionType === "single_select" ? "radio" : "checkbox"}
          />
          <span id={accessibilityIds.otherOptionLabelId}>Other</span>
          <input
            aria-describedby={describedBy}
            aria-invalid={hasError ? "true" : undefined}
            aria-labelledby={`${accessibilityIds.promptId} ${accessibilityIds.otherTextLabelId}`}
            disabled={!isOtherSelected}
            onChange={(event) => onOtherTextChange(currentQuestion.id, event.target.value)}
            placeholder="Enter your answer"
            required={isOtherSelected}
            type="text"
            value={otherText}
          />
          <span className="visually-hidden" id={accessibilityIds.otherTextLabelId}>
            Other answer text
          </span>
        </label>
      ) : null}
    </div>
  );
}

function IntegerStepperControl({
  accessibilityIds,
  describedBy,
  hasError,
  onChange,
  question,
  value
}: {
  accessibilityIds: QuestionAccessibilityIds;
  describedBy: string | undefined;
  hasError: boolean;
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
          aria-label={`Decrease answer for ${question.questionText}`}
          className="integer-stepper-button"
          onClick={() => step(-1)}
          type="button"
        >
          &minus;
        </button>
        <input
          aria-describedby={joinIds(describedBy, accessibilityIds.helperId)}
          aria-invalid={hasError ? "true" : undefined}
          aria-labelledby={accessibilityIds.promptId}
          id={accessibilityIds.controlId}
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
          aria-label={`Increase answer for ${question.questionText}`}
          className="integer-stepper-button"
          onClick={() => step(1)}
          type="button"
        >
          +
        </button>
      </div>
      <p className="input-helper-text" id={accessibilityIds.helperId}>
        Whole numbers only. Use the buttons or type a number.
      </p>
    </div>
  );
}

function ScaleRadioControl({
  accessibilityIds,
  describedBy,
  hasError,
  onSelect,
  question,
  selectedAnswerOptionIds
}: {
  accessibilityIds: QuestionAccessibilityIds;
  describedBy: string | undefined;
  hasError: boolean;
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
  const selectedValue = selectedOption?.optionText ?? null;
  const helperText =
    selectedValue === null
      ? `Choose one value from ${min} to ${max}`
      : `Selected value: ${selectedValue}`;

  return (
    <div className="scale-answer-field">
      <div className="scale-answer-header">
        <span
          className={selectedValue === null ? "scale-answer-value empty" : "scale-answer-value"}
          key={selectedValue ?? "none"}
        >
          {selectedValue ?? "-"}
        </span>
        <span className="input-helper-text" id={accessibilityIds.helperId}>
          {helperText}
        </span>
      </div>
      <div className="scale-answer-control">
        {sortedOptions.map((option) => {
          const optionLabelId = `${accessibilityIds.controlId}-scale-${option.id}-label`;

          return (
            <label className="scale-answer-option" key={option.id}>
              <input
                aria-describedby={joinIds(describedBy, accessibilityIds.helperId)}
                aria-invalid={hasError ? "true" : undefined}
                aria-labelledby={`${accessibilityIds.promptId} ${optionLabelId}`}
                aria-required={question.isRequired ? "true" : undefined}
                checked={selectedAnswerOptionIds.includes(option.id)}
                name={`question-${question.id}`}
                onChange={() => onSelect(option.id)}
                type="radio"
              />
              <span id={optionLabelId}>{option.optionText}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

interface QuestionAccessibilityIds {
  controlId: string;
  errorId: string;
  helpId: string;
  helperId: string;
  otherOptionLabelId: string;
  otherTextLabelId: string;
  promptId: string;
}

function getQuestionAccessibilityIds(questionId: number): QuestionAccessibilityIds {
  return {
    controlId: `question-${questionId}-control`,
    errorId: `question-${questionId}-error`,
    helpId: `question-${questionId}-help`,
    helperId: `question-${questionId}-input-helper`,
    otherOptionLabelId: `question-${questionId}-other-option-label`,
    otherTextLabelId: `question-${questionId}-other-text-label`,
    promptId: `question-${questionId}-prompt`
  };
}

function joinIds(...ids: Array<string | null | undefined>): string | undefined {
  const joined = ids.filter((id): id is string => Boolean(id)).join(" ");
  return joined || undefined;
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
