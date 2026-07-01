import {
  calculateSurveyRemainingTimeEstimate,
  getQuestionsForPage,
  resolveAttemptPagePath,
  resolveProgressivePageState,
  type ParticipantGlossaryEntry,
  type Survey,
  type SurveyAttempt,
  type SurveyIssueProfileEmojiCollection,
  type SurveyIssueProfileProgress,
  type SurveyAttemptActivityEventType,
  type SurveyAttemptStatus,
  type SurveyPage,
  type SurveyQuestion,
  type SurveyResponseAnswer
} from "@survey-portal/shared";
import {
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
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
import { AccessibleModal } from "../components/AccessibleModal.js";
import { InlineGlossaryText } from "../components/InlineGlossaryText.js";
import { gsap, prefersReducedMotion, useReveal } from "../motion/motion.js";

interface ActiveSurveyState {
  survey: Survey;
  glossaryEntries: ParticipantGlossaryEntry[];
  issueProfileProgress: SurveyIssueProfileProgress;
  issueProfileEmojiCollection: SurveyIssueProfileEmojiCollection;
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
type SurveyReviewStatusFilter = "all" | "answered" | "unanswered";

interface SurveyReviewQuestionRow {
  answerSummary: string;
  id: string;
  isAnswered: boolean;
  pageId: number;
  pageTitle: string;
  question: SurveyQuestion;
  searchText: string;
}

interface SurveyReviewPageGroup {
  answeredCount: number;
  id: number;
  page: SurveyPage;
  rows: SurveyReviewQuestionRow[];
  unansweredCount: number;
}

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
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [returnToReviewQuestionId, setReturnToReviewQuestionId] = useState<number | null>(null);
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
      setLoadError("Assessment not found");
      return;
    }

    if (mode === "anonymous" && !anonymousToken) {
      setIsLoading(false);
      setLoadError("Assessment link unavailable");
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
          setLoadError(openError instanceof Error ? openError.message : "Could not open assessment");
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
      setIsReviewOpen(false);
      setReturnToReviewQuestionId(null);
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
      const shouldReturnToReview = returnToReviewQuestionId === question.id;
      const isUpdatingReviewedQuestion = question.id !== activeSurvey.currentQuestion?.id;
      const isNavigationSourceQuestion = activeSurvey.survey.conditionalLogicRules.some(
        (rule) => rule.sourceQuestionId === question.id
      );
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
      const shouldPreserveReviewedPage =
        isUpdatingReviewedQuestion && !isNavigationSourceQuestion && response.currentPage === null;

      setActiveSurvey({
        survey: activeSurvey.survey,
        glossaryEntries: activeSurvey.glossaryEntries,
        issueProfileProgress: response.issueProfileProgress,
        issueProfileEmojiCollection: response.issueProfileEmojiCollection,
        attempt: response.attempt,
        attemptAccessToken: activeSurvey.attemptAccessToken,
        currentQuestion:
          shouldPreserveReviewedPage
            ? activeSurvey.currentQuestion
            : response.currentQuestion,
        currentPage:
          shouldPreserveReviewedPage
            ? activeSurvey.currentPage
            : response.currentPage,
        currentPageQuestionIds:
          shouldPreserveReviewedPage
            ? activeSurvey.currentPageQuestionIds
            : response.currentPageQuestionIds
      });
      if (shouldReturnToReview) {
        const updatedPagePath = resolveAttemptPagePath(
          activeSurvey.survey,
          response.attempt.responses
        );
        const isEditedQuestionStillVisible = updatedPagePath.path.some((page) =>
          updatedPagePath.visibleQuestionIdsByPageId[page.id]?.includes(question.id)
        );

        setReturnToReviewQuestionId(null);
        setIsReviewOpen(isEditedQuestionStillVisible);
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not save answer");
      setErrorQuestionId(question.id);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleOpenReview() {
    setIsReviewOpen(true);
    setReturnToReviewQuestionId(null);
    setError(null);
    setErrorQuestionId(null);
  }

  function handleCloseReview() {
    setIsReviewOpen(false);
    setReturnToReviewQuestionId(null);
  }

  function handleEditFromReview(questionId: number) {
    if (!activeSurvey || activeSurvey.attempt.status === "completed") {
      return;
    }

    const pagePath = resolveAttemptPagePath(activeSurvey.survey, activeSurvey.attempt.responses);
    const targetQuestion = activeSurvey.survey.questions.find((question) => question.id === questionId);
    const targetPage = pagePath.path.find((page) =>
      pagePath.visibleQuestionIdsByPageId[page.id]?.includes(questionId)
    );
    const visibleQuestionIds =
      targetPage ? pagePath.visibleQuestionIdsByPageId[targetPage.id] ?? [] : [];

    if (!targetQuestion || !targetPage || !visibleQuestionIds.includes(questionId)) {
      return;
    }

    setActiveSurvey({
      ...activeSurvey,
      currentPage: targetPage,
      currentQuestion: targetQuestion,
      currentPageQuestionIds: visibleQuestionIds
    });
    setIsReviewOpen(false);
    setReturnToReviewQuestionId(questionId);
    setError(null);
    setErrorQuestionId(null);
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
        issueProfileProgress: response.issueProfileProgress,
        issueProfileEmojiCollection: response.issueProfileEmojiCollection,
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
      setError(completeError instanceof Error ? completeError.message : "Could not submit assessment");
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
        issueProfileProgress: response.issueProfileProgress,
        issueProfileEmojiCollection: response.issueProfileEmojiCollection,
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
          {activeSurvey?.survey.title ?? "Assessment"}
        </span>
      </nav>
      <h1 className="visually-hidden">
        {activeSurvey?.survey.title ??
          (mode === "anonymous" ? "Anonymous assessment attempt" : "Assessment attempt")}
      </h1>

      {error && errorQuestionId === null ? (
        <p className="status error" role="alert">
          {error}
        </p>
      ) : null}
      {isLoading ? (
        <p aria-live="polite" className="status muted" role="status">
          Opening assessment...
        </p>
      ) : null}

      {!isLoading && loadError ? (
        <div className="builder-empty-state" role="alert">
          <strong>{loadError}</strong>
          <span>The assessment may be unavailable or already completed.</span>
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
          <div className="issue-profile-sticky-shell">
            <IssueProfileThermometer
              burstKey={getIssueProfileBurstKey(activeSurvey)}
              displayFillPercent={getIssueProfileDisplayFillPercent(activeSurvey)}
              emojiCollection={activeSurvey.issueProfileEmojiCollection}
              isReadyToSubmit={isIssueProfileReadyToSubmit(activeSurvey)}
              progress={activeSurvey.issueProfileProgress}
            />
          </div>
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
            isReviewOpen={isReviewOpen}
            isSubmitting={isSubmitting}
            onClose={handleClose}
            onComplete={() => void handleComplete()}
            onAnonymousRegistrationChange={handleAnonymousRegistrationDraftChange}
            onCloseReview={handleCloseReview}
            onDeclineAnonymousRegistration={handleDeclineAnonymousRegistration}
            onEditFromReview={handleEditFromReview}
            onOpenReview={handleOpenReview}
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
  isReviewOpen,
  isSubmitting,
  onClose,
  onComplete,
  onAnonymousRegistrationChange,
  onCloseReview,
  onDeclineAnonymousRegistration,
  onEditFromReview,
  onOpenReview,
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
  isReviewOpen: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onComplete: () => void;
  onAnonymousRegistrationChange: (field: keyof AnonymousRegistrationDraft, value: string) => void;
  onCloseReview: () => void;
  onDeclineAnonymousRegistration: () => void;
  onEditFromReview: (questionId: number) => void;
  onOpenReview: () => void;
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

  if (isReviewOpen) {
    return (
      <SurveyReviewPanel
        attempt={attempt}
        canSubmit={currentPage === null && attempt.status !== "completed"}
        isSubmitting={isSubmitting}
        onCloseReview={onCloseReview}
        onComplete={onComplete}
        onEditQuestion={onEditFromReview}
        pagePath={pagePath}
        survey={survey}
      />
    );
  }

  if (!currentPage) {
    const savedAnswerCount = countSavedAnswers(survey, attempt, path);
    const isCompleted = attempt.status === "completed";

    return (
      <div className="completion-panel" ref={revealRef}>
        <div className="completion-heading" data-reveal>
          <div>
            <p className="eyebrow">{survey.title}</p>
            <h3>{isCompleted ? "Assessment submitted" : "Ready to submit"}</h3>
          </div>
          <span className={`status-pill ${attempt.status}`}>{formatAttemptStatus(attempt.status)}</span>
        </div>

        <dl className="completion-summary" aria-label="Assessment attempt summary" data-reveal>
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
              : "You can go back to review saved answers before submitting the assessment."}
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
            className="button-link secondary-button"
            disabled={isSubmitting}
            onClick={onOpenReview}
            type="button"
          >
            Review answers
          </button>
          <button
            className="button-link primary-button"
            disabled={isSubmitting || attempt.status === "completed"}
            onClick={onComplete}
            type="button"
          >
            {isSubmitting ? "Submitting..." : "Submit assessment"}
          </button>
          <button
            className="button-link ghost-button"
            disabled={isSubmitting}
            onClick={onClose}
            type="button"
          >
            Back to assessments
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
  const progressTimeId = `survey-progress-time-${attempt.id}`;
  const questionsById = new Map(survey.questions.map((question) => [question.id, question]));
  const pageQuestions = currentPageQuestionIds
    .map((questionId) => questionsById.get(questionId))
    .filter((question): question is SurveyQuestion => Boolean(question));
  const activeQuestionId = currentQuestion?.id ?? null;
  const isReviewingPreviousPage = activeQuestionId === null;
  const responseQuestionIds = new Set(attempt.responses.map((response) => response.questionId));
  const activeQuestionHasSavedResponse = activeQuestionId !== null && responseQuestionIds.has(activeQuestionId);

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
          <p aria-live="polite" className="remaining-time-label" id={progressTimeId}>
            {remainingEstimate.copy}
          </p>
        </div>
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
            {isSubmitting ? "Saving..." : activeQuestionHasSavedResponse ? "Update answer" : "Continue"}
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
          Back to assessments
        </button>
        <button
          className="button-link secondary-button"
          disabled={isSubmitting}
          onClick={onOpenReview}
          type="button"
        >
          Review answers
        </button>
      </div>
    </div>
  );
}

function SurveyReviewPanel({
  attempt,
  canSubmit,
  isSubmitting,
  onCloseReview,
  onComplete,
  onEditQuestion,
  pagePath,
  survey
}: {
  attempt: SurveyAttempt;
  canSubmit: boolean;
  isSubmitting: boolean;
  onCloseReview: () => void;
  onComplete: () => void;
  onEditQuestion: (questionId: number) => void;
  pagePath: ReturnType<typeof resolveAttemptPagePath>;
  survey: Survey;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<SurveyReviewStatusFilter>("all");
  const groups = useMemo(
    () => buildSurveyReviewGroups(survey, attempt, pagePath),
    [attempt, pagePath, survey]
  );
  const totalQuestionCount = groups.reduce((sum, group) => sum + group.rows.length, 0);
  const answeredCount = groups.reduce((sum, group) => sum + group.answeredCount, 0);
  const unansweredCount = totalQuestionCount - answeredCount;
  const isLargeReview = totalQuestionCount > 20;
  const normalizedSearch = normalizeReviewSearchText(searchQuery);
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      rows: group.rows.filter((row) => {
        const matchesStatus =
          statusFilter === "all" ||
          (statusFilter === "answered" && row.isAnswered) ||
          (statusFilter === "unanswered" && !row.isAnswered);
        const matchesSearch =
          !normalizedSearch ||
          row.searchText.includes(normalizedSearch) ||
          normalizeReviewSearchText(group.page.title).includes(normalizedSearch);

        return matchesStatus && matchesSearch;
      })
    }))
    .filter((group) => group.rows.length > 0);
  const isCompleted = attempt.status === "completed";

  return (
    <div className="survey-review-panel">
      <div className="survey-review-heading">
        <div>
          <p className="eyebrow">{survey.title}</p>
          <h3>Review answers</h3>
          <p className="muted">
            {isCompleted
              ? "This completed assessment is read-only."
              : "Check your saved answers by page before submitting. You can edit any visible question on your current path."}
          </p>
        </div>
        <dl className="survey-review-totals" aria-label="Answer review summary">
          <div>
            <dt>Answered</dt>
            <dd>{answeredCount}</dd>
          </div>
          <div>
            <dt>Unanswered</dt>
            <dd>{unansweredCount}</dd>
          </div>
        </dl>
      </div>

      <div className="survey-review-controls" aria-label="Filter review answers">
        <label className="survey-review-search">
          <span>Search answers</span>
          <input
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search page, question, or answer"
            type="search"
            value={searchQuery}
          />
        </label>
        <fieldset className="survey-review-filter">
          <legend>Status</legend>
          {(["all", "unanswered", "answered"] as SurveyReviewStatusFilter[]).map((filter) => (
            <label key={filter}>
              <input
                checked={statusFilter === filter}
                onChange={() => setStatusFilter(filter)}
                type="radio"
              />
              <span>{formatReviewStatusFilter(filter)}</span>
            </label>
          ))}
        </fieldset>
      </div>

      <div className="survey-review-groups">
        {visibleGroups.length === 0 ? (
          <div className="builder-empty-state">
            <strong>No matching answers</strong>
            <span>Adjust the search or status filter to review more questions.</span>
          </div>
        ) : (
          visibleGroups.map((group) => (
            <details
              className="survey-review-group"
              key={group.id}
              open={
                !isLargeReview ||
                normalizedSearch.length > 0 ||
                statusFilter !== "all" ||
                group.unansweredCount > 0
              }
            >
              <summary>
                <span>{group.page.title}</span>
                <small>
                  {group.answeredCount} answered, {group.unansweredCount} unanswered
                </small>
              </summary>
              <div className="survey-review-row-list">
                {group.rows.map((row) => (
                  <article className="survey-review-row" key={row.id}>
                    <div className="survey-review-row-main">
                      <span
                        className={
                          row.isAnswered
                            ? "survey-review-status answered"
                            : "survey-review-status unanswered"
                        }
                      >
                        {row.isAnswered ? "Answered" : "Unanswered"}
                      </span>
                      <h4>{row.question.questionText}</h4>
                      <p>{row.answerSummary}</p>
                    </div>
                    <button
                      aria-label={`Edit answer for ${row.question.questionText}`}
                      className="button-link secondary-button compact-button"
                      disabled={isSubmitting || isCompleted}
                      onClick={() => onEditQuestion(row.question.id)}
                      type="button"
                    >
                      Edit
                    </button>
                  </article>
                ))}
              </div>
            </details>
          ))
        )}
      </div>

      <div className="survey-actions">
        <button
          className="button-link secondary-button"
          disabled={isSubmitting}
          onClick={onCloseReview}
          type="button"
        >
          Back to survey
        </button>
        {canSubmit ? (
          <button
            className="button-link primary-button"
            disabled={isSubmitting}
            onClick={onComplete}
            type="button"
          >
            {isSubmitting ? "Submitting..." : "Submit assessment"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function buildSurveyReviewGroups(
  survey: Survey,
  attempt: SurveyAttempt,
  pagePath: ReturnType<typeof resolveAttemptPagePath>
): SurveyReviewPageGroup[] {
  const questionsById = new Map(survey.questions.map((question) => [question.id, question]));
  const responsesByQuestionId = new Map(
    attempt.responses.map((response) => [response.questionId, response])
  );

  return pagePath.path
    .map((page) => {
      const rows = (pagePath.visibleQuestionIdsByPageId[page.id] ?? [])
        .map((questionId) => {
          const question = questionsById.get(questionId);

          if (!question) {
            return null;
          }

          const response = responsesByQuestionId.get(question.id);
          const answerSummary = getParticipantAnswerSummary(question, response);
          const isAnswered = answerSummary !== "Unanswered";
          const row: SurveyReviewQuestionRow = {
            answerSummary,
            id: `${page.id}:${question.id}`,
            isAnswered,
            pageId: page.id,
            pageTitle: page.title,
            question,
            searchText: normalizeReviewSearchText(
              [page.title, question.questionText, answerSummary].join(" ")
            )
          };

          return row;
        })
        .filter((row): row is SurveyReviewQuestionRow => Boolean(row));
      const answeredCount = rows.filter((row) => row.isAnswered).length;

      return {
        answeredCount,
        id: page.id,
        page,
        rows,
        unansweredCount: rows.length - answeredCount
      };
    })
    .filter((group) => group.rows.length > 0);
}

function getParticipantAnswerSummary(
  question: SurveyQuestion,
  response: SurveyResponseAnswer | undefined
): string {
  if (!response) {
    return "Unanswered";
  }

  if (question.questionType === "text") {
    return response.answerText?.trim() || "Unanswered";
  }

  if (question.questionType === "integer") {
    return Number.isInteger(response.answerInteger) ? String(response.answerInteger) : "Unanswered";
  }

  const selectedOptionIds = new Set(response.selectedAnswerOptionIds);
  const selectedOptionText = [...question.answerOptions]
    .sort((left, right) => left.displayOrder - right.displayOrder || left.id - right.id)
    .filter((option) => selectedOptionIds.has(option.id))
    .map((option) => option.optionText.trim())
    .filter(Boolean);
  const otherText = response.otherText?.trim();
  const visibleAnswers = otherText ? [...selectedOptionText, `Other: ${otherText}`] : selectedOptionText;

  return visibleAnswers.length > 0 ? visibleAnswers.join(", ") : "Unanswered";
}

function normalizeReviewSearchText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function formatReviewStatusFilter(filter: SurveyReviewStatusFilter): string {
  if (filter === "answered") {
    return "Answered";
  }

  if (filter === "unanswered") {
    return "Unanswered";
  }

  return "All";
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
        <h4>Create an account for this completed assessment?</h4>
        <p className="muted">
          Your saved responses will move into your new account and appear in your assessment history.
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

function getIssueProfileDisplayFillPercent(activeSurvey: ActiveSurveyState): number {
  return isIssueProfileReadyToSubmit(activeSurvey)
    ? 100
    : activeSurvey.issueProfileProgress.fillPercent;
}

function isIssueProfileReadyToSubmit(activeSurvey: ActiveSurveyState): boolean {
  return (
    activeSurvey.currentPage === null &&
    activeSurvey.attempt.status !== "completed" &&
    activeSurvey.issueProfileProgress.identifiedCategoryCount > 0
  );
}

function getIssueProfileBurstKey(activeSurvey: ActiveSurveyState): string | null {
  if (!isIssueProfileReadyToSubmit(activeSurvey)) {
    return null;
  }

  return [
    activeSurvey.attempt.id,
    activeSurvey.issueProfileEmojiCollection.totalCount,
    ...activeSurvey.attempt.responses.map((response) => `${response.questionId}:${response.updatedAt}`)
  ].join("|");
}

function IssueProfileThermometer({
  burstKey,
  displayFillPercent,
  emojiCollection,
  isReadyToSubmit,
  progress
}: {
  burstKey: string | null;
  displayFillPercent: number;
  emojiCollection: SurveyIssueProfileEmojiCollection;
  isReadyToSubmit: boolean;
  progress: SurveyIssueProfileProgress;
}) {
  const label = getIssueProfileLabel(progress.status, isReadyToSubmit);
  const safeDisplayFillPercent = Math.max(0, Math.min(100, Math.round(displayFillPercent)));
  const shouldShowEmojiCollection = isReadyToSubmit && emojiCollection.totalCount > 0;
  const [activeBurstKey, setActiveBurstKey] = useState<string | null>(null);
  const valueText =
    isReadyToSubmit
      ? "Profile complete, review and submit when ready"
      : progress.status === "empty"
      ? "Issue profile in progress, no profile signal identified yet"
      : progress.status === "building"
        ? `Profile building, thermometer visualization ${safeDisplayFillPercent}% filled`
        : progress.status === "complete"
          ? "Profile complete, thermometer visualization filled"
          : "Assessment submitted, no profile details identified";

  useEffect(() => {
    if (!shouldShowEmojiCollection || !burstKey) {
      setActiveBurstKey(null);
      return undefined;
    }

    setActiveBurstKey(burstKey);

    const timeoutId = window.setTimeout(() => {
      setActiveBurstKey(null);
    }, 4600);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [burstKey, shouldShowEmojiCollection]);

  return (
    <>
      <div
        aria-label="Issue profile progress"
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={safeDisplayFillPercent}
        aria-valuetext={valueText}
        className={`issue-profile-thermometer ${progress.status}${isReadyToSubmit ? " ready completion-stage" : ""}`}
        data-reveal
        role="progressbar"
      >
        <IssueProfileThermometerVisual
          fillPercent={safeDisplayFillPercent}
          isReadyToSubmit={isReadyToSubmit}
        >
          {shouldShowEmojiCollection && activeBurstKey ? (
            <IssueProfileEmojiBurst collection={emojiCollection} key={activeBurstKey} />
          ) : null}
        </IssueProfileThermometerVisual>
        <div className="issue-profile-thermometer-copy">
          <span>{label}</span>
          <small>{getIssueProfileDetail(progress.status, isReadyToSubmit)}</small>
          {shouldShowEmojiCollection ? (
            <IssueProfileEmojiCollection collection={emojiCollection} />
          ) : null}
        </div>
      </div>
      {activeBurstKey ? (
        <span aria-live="polite" className="visually-hidden" role="status">
          Issue profile details collected
        </span>
      ) : null}
    </>
  );
}

function IssueProfileThermometerVisual({
  children,
  fillPercent,
  isReadyToSubmit
}: {
  children?: ReactNode;
  fillPercent: number;
  isReadyToSubmit: boolean;
}) {
  const broken = isReadyToSubmit;
  const tubeTop = broken ? 4 : 16;
  const tubeHeight = broken ? 116 : 104;
  const tubeFillHeight = Math.round((tubeHeight * fillPercent) / 100);
  const tubeFillY = tubeTop + tubeHeight - tubeFillHeight;
  const bulbFillScale = fillPercent > 0 ? 1 : 0;
  const heat = Math.round(fillPercent) / 100;
  // The tube keeps an intact rounded cap while the survey is in progress and
  // only splits into a jagged broken rim once the profile is ready — the same
  // moment the burst animation plays. Both the glass rim and the dark inner
  // well share this silhouette so they stay aligned in either state.
  const intactSilhouette =
    "M35 27 a13 13 0 0 1 26 0 V118.25 A22 22 0 1 1 35 118.25 Z";
  const brokenSilhouette =
    "M35 16 L38 7 L41.5 14 L45 5 L48.5 12 L52 6 L55.5 15 L58.5 9 L61 17 V118.25 A22 22 0 1 1 35 118.25 Z";
  const silhouette = broken ? brokenSilhouette : intactSilhouette;

  return (
    <span aria-hidden="true" className="issue-profile-thermometer-visual">
      <svg
        className="issue-profile-thermometer-svg"
        focusable="false"
        style={{ "--thermo-heat": heat } as CSSProperties}
        viewBox="0 0 96 168"
      >
        <defs>
          <linearGradient
            gradientUnits="userSpaceOnUse"
            id="issue-profile-thermometer-gradient"
            x1="48"
            x2="48"
            y1="151"
            y2="16"
          >
            <stop offset="0%" stopColor="var(--info)" />
            <stop offset="26%" stopColor="var(--accent)" />
            <stop offset="52%" stopColor="var(--warn)" />
            <stop offset="76%" stopColor="var(--danger-soft)" />
            <stop offset="100%" stopColor="var(--danger)" />
          </linearGradient>
          <clipPath id="issue-profile-thermometer-tube-clip">
            {broken ? (
              <path d="M37 16 L39.5 7 L42.5 14 L45.5 5 L48.5 12 L51.5 6 L54.5 15 L57 9 L59 17 V126 H37 Z" />
            ) : (
              <rect height="110" rx="11" width="22" x="37" y="16" />
            )}
          </clipPath>
        </defs>
        {isReadyToSubmit ? (
          <g className="issue-profile-burst-rays">
            <path d="M48 8 L48 -12" />
            <path d="M40 6 L31 -12" />
            <path d="M56 8 L66 -10" />
            <path d="M33 12 L14 3" />
            <path d="M60 13 L80 5" />
          </g>
        ) : null}
        <path className="issue-profile-thermometer-well" d={silhouette} />
        <path className="issue-profile-thermometer-glass" d={silhouette} />
        <g clipPath="url(#issue-profile-thermometer-tube-clip)">
          <rect
            className="issue-profile-thermometer-fill"
            height={tubeFillHeight}
            width="22"
            x="37"
            y={tubeFillY}
          />
          {fillPercent > 0 ? (
            <ellipse
              className="issue-profile-thermometer-meniscus"
              cx="48"
              cy={tubeFillY}
              rx="11"
              ry="4"
            />
          ) : null}
          <rect className="issue-profile-thermometer-shine" height="98" width="5" x="41" y="20" />
        </g>
        <circle
          className="issue-profile-thermometer-bulb-fill"
          cx="48"
          cy="136"
          r="15"
          style={{ transform: `scale(${bulbFillScale})` }}
        />
        <path
          className="issue-profile-thermometer-neck-fill"
          d="M37 112 h22 v26 h-22z"
          style={{ opacity: fillPercent > 0 ? 1 : 0 }}
        />
        <g className="issue-profile-thermometer-ticks">
          <path d="M46 36 h10" />
          <path d="M41 48 h15" />
          <path d="M46 60 h10" />
          <path d="M41 72 h15" />
          <path d="M46 84 h10" />
          <path d="M41 96 h15" />
          <path d="M46 108 h10" />
        </g>
        <path
          className="issue-profile-thermometer-crack"
          d="M48 16 l-5 -6 l7 3 l-3 -8 l8 7"
        />
      </svg>
      {children}
    </span>
  );
}

function IssueProfileEmojiCollection({
  collection
}: {
  collection: SurveyIssueProfileEmojiCollection;
}) {
  const visibleItems = collection.items.slice(0, 8);
  const hiddenItemCount = Math.max(0, collection.items.length - visibleItems.length);

  return (
    <span className="issue-profile-emoji-collection">
      {visibleItems.map((item) => (
        <span className="issue-profile-emoji-chip" key={item.emoji}>
          <span aria-hidden="true">{item.emoji}</span>
          <span className="visually-hidden">
            {item.emoji} {item.count} collected
          </span>
          <small aria-hidden="true">×{item.count}</small>
        </span>
      ))}
      {hiddenItemCount > 0 ? (
        <span className="issue-profile-emoji-chip overflow">
          <span aria-hidden="true">+{hiddenItemCount}</span>
          <span className="visually-hidden">
            {hiddenItemCount} more issue profile detail types collected
          </span>
        </span>
      ) : null}
    </span>
  );
}

function IssueProfileEmojiBurst({
  collection
}: {
  collection: SurveyIssueProfileEmojiCollection;
}) {
  const burstRef = useRef<HTMLSpanElement | null>(null);
  const particles = useMemo(() => buildEmojiBurstParticles(collection), [collection]);
  const sparks = useMemo(
    () => buildEmojiBurstSparks(collection, particles.length),
    [collection, particles.length]
  );
  const shards = useMemo(() => buildThermometerBreakoffShards(), []);
  const puffs = useMemo(() => buildThermometerBreakoffPuffs(), []);

  useLayoutEffect(() => {
    const root = burstRef.current;

    if (!root || prefersReducedMotion()) {
      return;
    }

    const cap = root.querySelector(".issue-profile-thermometer-cap-break");
    const shardTargets = Array.from(
      root.querySelectorAll<HTMLElement>(".issue-profile-thermometer-shard")
    );
    const puffTargets = Array.from(root.querySelectorAll<HTMLElement>(".issue-profile-burst-puff"));
    const sparkTargets = Array.from(root.querySelectorAll<HTMLElement>(".issue-profile-burst-spark"));
    const emojiTargets = Array.from(root.querySelectorAll<HTMLElement>(".issue-profile-emoji-particle"));

    const timeline = gsap.timeline();

    timeline
      .set(root, { autoAlpha: 1 })
      .fromTo(
        cap,
        { autoAlpha: 1, rotate: 0, scale: 1, x: 0, xPercent: -50, y: 0 },
        {
          autoAlpha: 0,
          duration: 1.18,
          ease: "power3.out",
          rotate: 44,
          scale: 0.82,
          x: 16,
          y: -84
        },
        0.02
      )
      .fromTo(
        shardTargets,
        {
          autoAlpha: 0,
          rotate: 0,
          scale: 0.55,
          x: 0,
          xPercent: -50,
          y: 0
        },
        {
          autoAlpha: 0,
          duration: 1.32,
          ease: "power2.out",
          keyframes: [
            {
              autoAlpha: 1,
              duration: 0.12,
              scale: 1,
              x: (index: number) => shards[index]?.peakX ?? 0,
              y: (index: number) => shards[index]?.liftY ?? -42
            },
            {
              autoAlpha: 0,
              duration: 1.2,
              rotate: (index: number) => shards[index]?.rotate ?? 28,
              scale: 0.62,
              x: (index: number) => shards[index]?.x ?? 0,
              y: (index: number) => shards[index]?.fallY ?? 36
            }
          ]
        },
        0.05
      )
      .fromTo(
        puffTargets,
        { autoAlpha: 0, scale: 0.22, x: 0, xPercent: -50, y: 0 },
        {
          autoAlpha: 0,
          duration: 1.1,
          ease: "power2.out",
          keyframes: [
            {
              autoAlpha: 0.46,
              duration: 0.2,
              scale: 1,
              x: (index: number) => puffs[index]?.x ?? 0,
              y: (index: number) => puffs[index]?.y ?? -28
            },
            {
              autoAlpha: 0,
              duration: 0.9,
              scale: (index: number) => puffs[index]?.scale ?? 1.7,
              x: (index: number) => puffs[index]?.x ?? 0,
              y: (index: number) => (puffs[index]?.y ?? -28) - 12
            }
          ]
        },
        0
      )
      .fromTo(
        sparkTargets,
        { autoAlpha: 0, scale: 0.35, x: 0, xPercent: -50, y: 0 },
        {
          autoAlpha: 0,
          duration: 1.22,
          ease: "power2.out",
          keyframes: [
            {
              autoAlpha: 0.95,
              duration: 0.16,
              scale: 1.1,
              x: (index: number) => sparks[index]?.peakX ?? 0,
              y: (index: number) => sparks[index]?.liftY ?? -48
            },
            {
              autoAlpha: 0,
              duration: 1.06,
              scale: 0.35,
              x: (index: number) => sparks[index]?.x ?? 0,
              y: (index: number) => sparks[index]?.fallY ?? 22
            }
          ]
        },
        0.03
      )
      .fromTo(
        emojiTargets,
        { autoAlpha: 0, rotate: 0, scale: 0.55, x: 0, xPercent: -50, y: 0 },
        {
          autoAlpha: 0,
          duration: 2.3,
          ease: "none",
          keyframes: [
            {
              autoAlpha: 1,
              duration: 0.28,
              ease: "power2.out",
              scale: 1.08,
              x: (index: number) => particles[index]?.xPeak ?? 0,
              y: (index: number) => particles[index]?.liftY ?? -72
            },
            {
              autoAlpha: 1,
              duration: 0.38,
              ease: "power1.inOut",
              rotate: (index: number) => particles[index]?.rotateFall ?? 0,
              scale: 1,
              x: (index: number) => particles[index]?.xFall ?? 0,
              y: (index: number) => particles[index]?.midY ?? 24
            },
            {
              autoAlpha: 0.92,
              duration: 0.82,
              rotate: (index: number) => particles[index]?.rotateFinal ?? 0,
              scale: 0.9,
              x: (index: number) => (particles[index]?.x ?? 0) + (particles[index]?.driftSoft ?? 0),
              y: (index: number) => (particles[index]?.fallY ?? 110) + 28
            },
            {
              autoAlpha: 0,
              duration: 0.82,
              rotate: (index: number) => particles[index]?.rotateFinal ?? 0,
              scale: 0.78,
              x: (index: number) => (particles[index]?.x ?? 0) + (particles[index]?.drift ?? 0),
              y: (index: number) => (particles[index]?.fallY ?? 110) + 94
            }
          ],
          stagger: 0.048
        },
        0.12
      );

    return () => {
      timeline.kill();
    };
  }, [particles, puffs, shards, sparks]);

  return (
    <span aria-hidden="true" className="issue-profile-emoji-burst" ref={burstRef}>
      <span className="issue-profile-thermometer-cap-break" />
      {puffs.map((puff) => (
        <span
          className="issue-profile-burst-puff"
          key={puff.id}
          style={
            {
              "--puff-size": `${puff.size}px`
            } as CSSProperties
          }
        />
      ))}
      {shards.map((shard) => (
        <span
          className="issue-profile-thermometer-shard"
          key={shard.id}
          style={
            {
              "--shard-height": `${shard.height}px`,
              "--shard-width": `${shard.width}px`
            } as CSSProperties
          }
        />
      ))}
      {sparks.map((spark) => (
        <span
          className="issue-profile-burst-spark"
          key={spark.id}
          style={
            {
              "--spark-delay": `${spark.delay}ms`,
              "--spark-fall-y": `${spark.fallY}px`,
              "--spark-lift-y": `${spark.liftY}px`,
              "--spark-peak-x": `${spark.peakX}px`,
              "--spark-size": `${spark.size}px`,
              "--spark-x": `${spark.x}px`
            } as CSSProperties
          }
        />
      ))}
      {particles.map((particle) => (
        <span
          className="issue-profile-emoji-particle"
          key={particle.id}
          style={
            {
              "--burst-delay": `${particle.delay}ms`,
              "--burst-drift": `${particle.drift}px`,
              "--burst-drift-soft": `${particle.driftSoft}px`,
              "--burst-fall-y": `${particle.fallY}px`,
              "--burst-lift-y": `${particle.liftY}px`,
              "--burst-mid-y": `${particle.midY}px`,
              "--burst-rotate-fall": `${particle.rotateFall}deg`,
              "--burst-rotate-final": `${particle.rotateFinal}deg`,
              "--burst-rotate-peak": `${particle.rotatePeak}deg`,
              "--burst-x": `${particle.x}px`,
              "--burst-x-fall": `${particle.xFall}px`,
              "--burst-x-peak": `${particle.xPeak}px`
            } as CSSProperties
          }
        >
          {particle.emoji}
        </span>
      ))}
    </span>
  );
}

function buildEmojiBurstParticles(
  collection: SurveyIssueProfileEmojiCollection,
  maxParticles = 40
): Array<{
  delay: number;
  drift: number;
  driftSoft: number;
  emoji: string;
  fallY: number;
  id: string;
  liftY: number;
  midY: number;
  rotateFall: number;
  rotateFinal: number;
  rotatePeak: number;
  x: number;
  xFall: number;
  xPeak: number;
}> {
  const particleCount = Math.min(maxParticles, collection.totalCount);

  if (particleCount <= 0) {
    return [];
  }

  const particles: Array<{
    delay: number;
    drift: number;
    driftSoft: number;
    emoji: string;
    fallY: number;
    id: string;
    liftY: number;
    midY: number;
    rotateFall: number;
    rotateFinal: number;
    rotatePeak: number;
    x: number;
    xFall: number;
    xPeak: number;
  }> = [];

  for (let index = 0; index < particleCount; index += 1) {
    const targetWeight = (index / particleCount) * collection.totalCount;
    let cursor = 0;
    const item =
      collection.items.find((candidate) => {
        cursor += candidate.count;
        return cursor > targetWeight;
      }) ?? collection.items[0];
    const side = index % 2 === 0 ? -1 : 1;
    const spread = 26 + (index % 8) * 11;
    const lift = 76 + (index % 7) * 16;
    const fall = 110 + (index % 6) * 22;
    const rotate = side * (16 + (index % 8) * 7);
    const drift = side * (6 + (index % 5) * 4);

    particles.push({
      delay: (index % 12) * 48,
      drift,
      driftSoft: Math.round(drift * 0.72),
      emoji: item.emoji,
      fallY: fall,
      id: `${item.emoji}-${index}`,
      liftY: -lift,
      midY: Math.round(-lift * 0.22 + 24),
      rotateFall: Math.round(rotate * 0.82),
      rotateFinal: Math.round(rotate * 1.18),
      rotatePeak: Math.round(rotate * 0.56),
      x: side * spread,
      xFall: Math.round(side * spread * 0.95),
      xPeak: Math.round(side * spread * 0.72)
    });
  }

  return particles;
}

function buildEmojiBurstSparks(
  collection: SurveyIssueProfileEmojiCollection,
  emojiParticleCount: number,
  maxSparks = 32
): Array<{
  delay: number;
  fallY: number;
  id: string;
  liftY: number;
  peakX: number;
  size: number;
  x: number;
}> {
  const sparkCount = Math.min(maxSparks, Math.max(0, emojiParticleCount, collection.totalCount));

  return Array.from({ length: sparkCount }, (_, index) => {
    const side = index % 2 === 0 ? -1 : 1;
    const spread = 14 + (index % 9) * 8;
    const lift = 64 + (index % 6) * 14;
    const fall = 28 + (index % 5) * 14;

    return {
      delay: 30 + (index % 10) * 42,
      fallY: fall,
      id: `spark-${index}`,
      liftY: -lift,
      peakX: Math.round(side * spread * 0.82),
      size: 3 + (index % 3),
      x: side * spread
    };
  });
}

function buildThermometerBreakoffShards(): Array<{
  fallY: number;
  height: number;
  id: string;
  liftY: number;
  peakX: number;
  rotate: number;
  width: number;
  x: number;
}> {
  return [
    { fallY: 42, height: 10, id: "shard-left", liftY: -66, peakX: -26, rotate: -74, width: 5, x: -42 },
    { fallY: 32, height: 12, id: "shard-mid-left", liftY: -78, peakX: -12, rotate: -38, width: 4, x: -20 },
    { fallY: 54, height: 9, id: "shard-center", liftY: -90, peakX: 3, rotate: 22, width: 5, x: 8 },
    { fallY: 38, height: 11, id: "shard-mid-right", liftY: -76, peakX: 17, rotate: 48, width: 4, x: 28 },
    { fallY: 46, height: 8, id: "shard-right", liftY: -62, peakX: 31, rotate: 82, width: 5, x: 46 }
  ];
}

function buildThermometerBreakoffPuffs(): Array<{
  id: string;
  scale: number;
  size: number;
  x: number;
  y: number;
}> {
  return [
    { id: "puff-left", scale: 1.85, size: 26, x: -26, y: -36 },
    { id: "puff-center", scale: 2.1, size: 30, x: 0, y: -48 },
    { id: "puff-right", scale: 1.75, size: 24, x: 26, y: -34 }
  ];
}

function getIssueProfileLabel(
  status: SurveyIssueProfileProgress["status"],
  isReadyToSubmit: boolean
): string {
  if (isReadyToSubmit) {
    return "Profile complete";
  }

  if (status === "building") {
    return "Profile building";
  }

  if (status === "complete") {
    return "Profile complete";
  }

  if (status === "complete_empty") {
    return "Assessment submitted";
  }

  return "Issue profile in progress";
}

function getIssueProfileDetail(
  status: SurveyIssueProfileProgress["status"],
  isReadyToSubmit: boolean
): string {
  if (isReadyToSubmit) {
    return "Review and submit when ready";
  }

  if (status === "building") {
    return "Assessment insights are being assembled";
  }

  if (status === "complete") {
    return "Assessment insight profile is ready";
  }

  if (status === "complete_empty") {
    return "No profile details were identified";
  }

  return "Assessment insights will build as you answer";
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
    <AccessibleModal
      descriptionId="anonymous-contact-email-description"
      labelledBy="anonymous-contact-email-title"
      onClose={onSkip}
    >
      <form className="contact-email-modal-form" onSubmit={onSubmit}>
        <div className="contact-email-modal-heading">
          <p className="eyebrow">Optional</p>
          <h3 id="anonymous-contact-email-title">Share an email for follow-up?</h3>
        </div>
        <p className="muted" id="anonymous-contact-email-description">
          Enter an email if you would like the assessment owner to contact you about this
          assessment. This address is optional and will be visible to the assessment owner.
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
            data-autofocus
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
    </AccessibleModal>
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
