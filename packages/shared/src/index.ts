export type UserRole = "user" | "admin";

export interface AuthUser {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  user: AuthUser;
}

export interface AuthMeResponse {
  user: AuthUser;
}

export interface PasswordResetMessageResponse {
  message: string;
}

export interface UserProfile {
  contactNumber: string | null;
  preferredContactMethod: string | null;
  contactNotes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface CurrentUserSurveyStats {
  available: number;
  inProgress: number;
  completed: number;
  lastActivityAt: string | null;
  completionRate: number;
}

export interface CurrentUserProfileResponse {
  user: AuthUser;
  profile: UserProfile;
  surveyStats: CurrentUserSurveyStats;
}

export interface UpdateCurrentUserProfileResponse {
  profile: UserProfile;
}

export type SurveyAttemptStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "abandoned";

export type SurveyStatus = "draft" | "published" | "retired";

export type SurveyQuestionType = "text" | "integer" | "single_select" | "multi_select" | "scale";

export const surveyQuestionTypeEstimateWeightsSeconds: Record<SurveyQuestionType, number> = {
  text: 90,
  integer: 30,
  single_select: 45,
  multi_select: 60,
  scale: 30
};

export function getSurveyQuestionTypeEstimateWeightSeconds(
  questionType: SurveyQuestionType
): number {
  return surveyQuestionTypeEstimateWeightsSeconds[questionType] ??
    surveyQuestionTypeEstimateWeightsSeconds.text;
}

export type ConditionalLogicConditionOperator = "equals" | "is_blank";

export type ConditionalLogicActionType =
  | "JUMP_TO_QUESTION"
  | "JUMP_TO_PAGE"
  | "SHOW_QUESTION"
  | "HIDE_QUESTION"
  | "HIDE_PAGE"
  | "END_SURVEY";

export interface AnswerTag {
  id: number;
  answerOptionId: number;
  tagKey: string;
  tagValue: string;
  createdAt: string;
  updatedAt: string;
}

// Hidden tag conditioned on the respondent's entered value, for questions
// without answer options. Integer questions use the optional inclusive
// bounds; text questions have null bounds and match any non-blank answer.
// Admin-only — like answerTags, never sent to participants.
export interface QuestionValueTag {
  id: number;
  questionId: number;
  integerMin: number | null;
  integerMax: number | null;
  tagKey: string;
  tagValue: string;
  createdAt: string;
  updatedAt: string;
}

// Hidden tags attached to the system-generated Other choice on a selection
// question. Admin-only — Other remains response text, not an answer option.
export interface QuestionOtherTag {
  id: number;
  questionId: number;
  tagKey: string;
  tagValue: string;
  createdAt: string;
  updatedAt: string;
}

// True when a saved response satisfies a value-tag's condition. Shared so
// reporting (SQL-side aggregate mirrors this) and per-attempt views agree.
export function valueTagMatchesResponse(
  question: Pick<SurveyQuestion, "questionType">,
  valueTag: Pick<QuestionValueTag, "integerMin" | "integerMax">,
  response: Pick<SurveyResponseAnswer, "answerText" | "answerInteger"> | undefined
): boolean {
  if (!response) {
    return false;
  }

  if (question.questionType === "text") {
    return Boolean(response.answerText?.trim());
  }

  if (question.questionType === "integer") {
    if (response.answerInteger === null) {
      return false;
    }

    return (
      (valueTag.integerMin === null || response.answerInteger >= valueTag.integerMin) &&
      (valueTag.integerMax === null || response.answerInteger <= valueTag.integerMax)
    );
  }

  return false;
}

export interface AnswerOption {
  id: number;
  questionId: number;
  optionText: string;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
  answerTags?: AnswerTag[];
}

export interface SurveyQuestion {
  id: number;
  surveyId: number;
  pageId: number;
  questionText: string;
  questionType: SurveyQuestionType;
  allowOther: boolean;
  scaleMin: number | null;
  scaleMax: number | null;
  displayOrder: number;
  isRequired: boolean;
  helpText: string | null;
  createdAt: string;
  updatedAt: string;
  answerOptions: AnswerOption[];
  // Populated for admins only, mirroring answerTags on options.
  valueTags?: QuestionValueTag[];
  // Populated for admins only when Allow Other is enabled on selection questions.
  otherTags?: QuestionOtherTag[];
}

export interface ConditionalLogicRule {
  id: number;
  surveyId: number;
  sourcePageId: number | null;
  sourceQuestionId: number;
  sourceAnswerOptionId: number | null;
  conditionOperator: ConditionalLogicConditionOperator;
  actionType: ConditionalLogicActionType;
  targetQuestionId: number | null;
  targetPageId: number | null;
  skipTargetInNormalFlow: boolean;
  // HIDE_PAGE only: when true, firing the trigger advances immediately to the
  // next visible page, leaving the rest of the trigger's page unanswered.
  advanceOnTrigger: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SurveyPage {
  id: number;
  surveyId: number;
  title: string;
  description: string | null;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Survey {
  id: number;
  title: string;
  description: string | null;
  status: SurveyStatus;
  categoryId: number | null;
  categoryName: string | null;
  createdByUserId: number | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  retiredAt: string | null;
  deletedAt: string | null;
  // Participant-safe survey-level completion estimate. Admin-only timing
  // audit fields are exposed separately through the Admin timing endpoint.
  effectiveEstimateSeconds: number;
  pages: SurveyPage[];
  // Flattened compatibility list sorted by page order, then question order.
  questions: SurveyQuestion[];
  conditionalLogicRules: ConditionalLogicRule[];
}

export type SurveyTimingEstimateSource = "admin_override" | "statistical" | "default";

export interface SurveyTimingSummary {
  derivedEstimateSeconds: number | null;
  defaultEstimateSeconds: number;
  adminOverrideSeconds: number | null;
  effectiveEstimateSeconds: number;
  sampleCount: number;
  estimateSource: SurveyTimingEstimateSource;
}

export interface SurveyTimingResponse {
  timing: SurveyTimingSummary;
}

export interface SurveyCategory {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface SurveyCategoriesResponse {
  categories: SurveyCategory[];
}

export interface SurveyCategoryResponse {
  category: SurveyCategory;
}

export interface TagDefinition {
  id: number;
  tagKey: string;
  tagValue: string;
  createdAt: string;
  updatedAt: string;
}

export interface TagDefinitionsResponse {
  tags: TagDefinition[];
}

export interface TagDefinitionResponse {
  tag: TagDefinition;
}

export interface AdminUserSummary {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface AdminUsersListResponse {
  users: AdminUserSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminUserRoleResponse {
  user: AdminUserSummary;
}

export interface AdminUserDetailResponse {
  user: AdminUserSummary;
  profile: UserProfile;
  surveyStats: CurrentUserSurveyStats;
}

export interface AdminUserPasswordResetResponse {
  message: string;
}

export interface SurveyListResponse {
  surveys: Survey[];
}

export interface SurveyResponse {
  survey: Survey;
}

export interface SurveyResponseAnswer {
  id: number;
  surveyAttemptId: number;
  questionId: number;
  answerText: string | null;
  answerInteger: number | null;
  selectedAnswerOptionIds: number[];
  otherText: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SurveyAttempt {
  id: number;
  surveyId: number;
  userId: number | null;
  anonymousLinkId: number | null;
  anonymousContactEmail: string | null;
  status: SurveyAttemptStatus;
  startedAt: string | null;
  lastActivityAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  responses: SurveyResponseAnswer[];
}

export interface SurveyAttemptSummary {
  attempt: SurveyAttempt | null;
  survey: Survey;
}

export interface SurveyAttemptDetail {
  attempt: SurveyAttempt;
  survey: Survey;
  currentQuestion: SurveyQuestion | null;
  currentPage: SurveyPage | null;
  currentPageQuestionIds: number[];
}

export interface SurveyAnswerRequestPayload {
  attemptId: number;
  questionId: number;
  answerText: string | null;
  answerInteger: number | null;
  selectedAnswerOptionIds: number[];
  isOtherSelected: boolean;
  otherText: string | null;
}

export interface SurveyPageAnswerRequestPayload {
  attemptId: number;
  answers: SurveyAnswerRequestPayload[];
}

export interface MySurveysResponse {
  surveys: SurveyAttemptSummary[];
}

export interface MySurveyResponse {
  attempt: SurveyAttempt;
  survey: Survey;
  currentQuestion: SurveyQuestion | null;
  currentPage: SurveyPage | null;
  currentPageQuestionIds: number[];
}

export interface StartSurveyResponse {
  attempt: SurveyAttempt;
  survey: Survey;
  currentQuestion: SurveyQuestion | null;
  currentPage: SurveyPage | null;
  currentPageQuestionIds: number[];
}

export interface AnonymousSurveyLink {
  id: number;
  surveyId: number;
  enabled: boolean;
  expiresAt: string | null;
  disabledAt: string | null;
  createdAt: string;
  updatedAt: string;
  publicUrl?: string;
}

export interface AnonymousSurveyLinkWithUrl extends AnonymousSurveyLink {
  publicUrl: string;
}

export interface AnonymousSurveyLinksResponse {
  links: AnonymousSurveyLink[];
}

export interface CreateAnonymousSurveyLinkResponse {
  link: AnonymousSurveyLinkWithUrl;
}

export interface DisableAnonymousSurveyLinkResponse {
  link: AnonymousSurveyLink;
}

export interface RotateAnonymousSurveyLinkResponse {
  disabledLink: AnonymousSurveyLink;
  link: AnonymousSurveyLinkWithUrl;
}

export interface AnonymousSurveyResponse {
  survey: Survey;
}

export interface StartAnonymousSurveyResponse extends StartSurveyResponse {
  attemptAccessToken: string;
}

export interface AnswerSurveyResponse {
  attempt: SurveyAttempt;
  currentQuestion: SurveyQuestion | null;
  currentPage: SurveyPage | null;
  currentPageQuestionIds: number[];
  isCompleteReady: boolean;
}

export interface CompleteSurveyResponse {
  attempt: SurveyAttempt;
}

export interface HealthResponse {
  status: "ok" | "unavailable";
  app: "survey-portal";
  runEnv: "dev" | "prod";
  timestamp: string;
  database: "connected" | "unavailable" | "not_checked";
}

export interface ReportParticipant {
  id: number | null;
  firstName: string;
  lastName: string;
  email: string;
  type: "user" | "anonymous";
}

export interface SurveyReportOptionStat {
  answerOptionId: number;
  optionText: string;
  displayOrder: number;
  selectionCount: number;
}

export interface SurveyReportQuestionStat {
  questionId: number;
  displayOrder: number;
  questionText: string;
  questionType: SurveyQuestionType;
  isRequired: boolean;
  answeredCount: number;
  blankCount: number;
  // Present for option-backed questions (selects and scales); empty for
  // text and integer questions.
  optionStats: SurveyReportOptionStat[];
  // Counts saved custom "Other" responses separately from real answer options.
  otherResponseCount: number;
}

// Admin-only rollup of hidden tag pairs implied by participants' selected
// options. selectionCount totals option selections carrying the pair;
// respondentCount is distinct attempts, so multi-select double-picks and
// multiple tagged questions in one attempt count once.
export interface SurveyReportTagStat {
  tagKey: string;
  tagValue: string;
  selectionCount: number;
  respondentCount: number;
}

export interface SurveyReportSummary {
  surveyId: number;
  title: string;
  status: SurveyStatus;
  attemptCounts: {
    inProgress: number;
    completed: number;
    abandoned: number;
    total: number;
  };
  completionRate: number;
  questionStats: SurveyReportQuestionStat[];
  tagStats: SurveyReportTagStat[];
}

export interface SurveyReportResponse {
  report: SurveyReportSummary;
}

export interface AdminAttemptSummary {
  attemptId: number;
  participant: ReportParticipant;
  status: SurveyAttemptStatus;
  startedAt: string | null;
  lastActivityAt: string | null;
  completedAt: string | null;
  answeredCount: number;
}

export interface SurveyAttemptsListResponse {
  surveyId: number;
  attempts: AdminAttemptSummary[];
}

export interface AdminAttemptAnswerOption {
  answerOptionId: number;
  optionText: string;
  hiddenTags: { tagKey: string; tagValue: string }[];
}

// answered: a meaningful response was saved.
// skipped_blank: a blank response row was intentionally saved for an
//   optional question.
// not_reached: no response row exists for this question.
export type AdminAttemptAnswerState = "answered" | "skipped_blank" | "not_reached";

export interface AdminAttemptAnswer {
  questionId: number;
  displayOrder: number;
  questionText: string;
  questionType: SurveyQuestionType;
  isRequired: boolean;
  state: AdminAttemptAnswerState;
  answerText: string | null;
  answerInteger: number | null;
  selectedOptions: AdminAttemptAnswerOption[];
  otherText: string | null;
  // Hidden tags attached to the question's system-generated Other choice.
  // Present only when otherText is non-null.
  otherTags: { tagKey: string; tagValue: string }[];
  // Hidden value tags whose condition this answer satisfies (text/integer
  // questions). Admin-only, like selectedOptions[].hiddenTags.
  valueTags: { tagKey: string; tagValue: string }[];
  // True when the question is revealed on the final path implied by the
  // attempt's saved answers. As of Phase 14, off-path answers are pruned at
  // save time, so this flag is a safety net: any answer that escaped pruning,
  // or a never-reached question, is reported as "not on final path".
  onFinalPath: boolean;
}

export interface AdminAttemptDetailResponse {
  surveyId: number;
  surveyTitle: string;
  participant: ReportParticipant;
  attempt: SurveyAttempt;
  answers: AdminAttemptAnswer[];
}

export function resolveNextQuestion(
  survey: Survey,
  question: SurveyQuestion,
  response: SurveyResponseAnswer | undefined,
  hiddenQuestionIds: ReadonlySet<number> = new Set()
): SurveyQuestion | null {
  // Only jump targets are statically excluded from the normal flow.
  // HIDE_QUESTION targets stay in the normal flow and are excluded per
  // attempt via hiddenQuestionIds once their trigger answer is given.
  const orderedQuestions = getOrderedQuestions(survey);
  const conditionalTargetQuestionIds = new Set(
    survey.conditionalLogicRules
      .filter((rule) => rule.actionType === "JUMP_TO_QUESTION" && rule.skipTargetInNormalFlow)
      .map((rule) => rule.targetQuestionId)
      .filter((targetQuestionId): targetQuestionId is number => targetQuestionId !== null)
  );
  const matchingRule = survey.conditionalLogicRules.find(
    (rule) =>
      rule.sourceQuestionId === question.id &&
      rule.actionType === "JUMP_TO_QUESTION" &&
      rule.targetQuestionId !== null &&
      doesRuleMatchResponse(rule, response)
  );

  const advanceFrom = (fromQuestion: SurveyQuestion): SurveyQuestion | null =>
    orderedQuestions
      .filter(
        (candidate) =>
          compareQuestionOrder(survey, candidate, fromQuestion) > 0 &&
          !conditionalTargetQuestionIds.has(candidate.id) &&
          !hiddenQuestionIds.has(candidate.id)
      )[0] ?? null;

  if (matchingRule?.targetQuestionId) {
    const target =
      survey.questions.find((candidate) => candidate.id === matchingRule.targetQuestionId) ?? null;

    // A jump target hidden by an active skip rule is bypassed: continue
    // forward from the target along the visible normal flow.
    if (target && hiddenQuestionIds.has(target.id)) {
      return advanceFrom(target);
    }

    return target;
  }

  return advanceFrom(question);
}

// Collects the questions hidden when the source question was just answered with
// the rule's trigger option: HIDE_QUESTION rules contribute their target
// question, while HIDE_PAGE rules expand to every question currently on the
// target page so a whole page is skipped through the same hidden-question set.
export function collectActivatedHiddenQuestionIds(
  survey: Survey,
  question: SurveyQuestion,
  response: SurveyResponseAnswer | undefined
): number[] {
  const hiddenQuestionIds: number[] = [];

  for (const rule of survey.conditionalLogicRules) {
    if (rule.sourceQuestionId !== question.id || !doesRuleMatchResponse(rule, response)) {
      continue;
    }

    if (rule.actionType === "HIDE_QUESTION" && rule.targetQuestionId !== null) {
      hiddenQuestionIds.push(rule.targetQuestionId);
    } else if (rule.actionType === "HIDE_PAGE" && rule.targetPageId !== null) {
      for (const pageQuestion of getQuestionsForPage(survey, rule.targetPageId)) {
        hiddenQuestionIds.push(pageQuestion.id);
      }
    }
  }

  return hiddenQuestionIds;
}

// True when answering this question triggers a HIDE_PAGE rule marked
// advanceOnTrigger, meaning the runtime should leave the rest of the current
// page and jump straight to the next visible page.
export function hasActivatedAdvancingPageSkip(
  survey: Survey,
  question: SurveyQuestion,
  response: SurveyResponseAnswer | undefined
): boolean {
  return survey.conditionalLogicRules.some(
    (rule) =>
      rule.actionType === "HIDE_PAGE" &&
      rule.advanceOnTrigger &&
      rule.targetPageId !== null &&
      rule.sourceQuestionId === question.id &&
      doesRuleMatchResponse(rule, response)
  );
}

export function doesRuleMatchResponse(
  rule: Pick<
    ConditionalLogicRule,
    "conditionOperator" | "sourceAnswerOptionId"
  >,
  response: SurveyResponseAnswer | undefined
): boolean {
  if (!response) {
    return false;
  }

  if (rule.conditionOperator === "equals") {
    return (
      rule.sourceAnswerOptionId !== null &&
      response.selectedAnswerOptionIds.includes(rule.sourceAnswerOptionId)
    );
  }

  if (rule.conditionOperator === "is_blank") {
    return !response.answerText?.trim();
  }

  return false;
}

export interface AttemptPathResult {
  path: SurveyQuestion[];
  hasLoop: boolean;
}

// Walks the navigation path implied by the saved responses. Questions
// without a response project forward along the normal flow, so the result
// is the exact path for completed attempts and a best-known projection for
// attempts still in progress. Skip-logic targets excluded from the normal
// flow never appear unless a saved answer jumps to them.
export function resolveAttemptPath(
  survey: Survey,
  responses: SurveyResponseAnswer[]
): AttemptPathResult {
  const responsesByQuestionId = new Map(
    responses.map((response) => [response.questionId, response])
  );
  const path: SurveyQuestion[] = [];
  const visitedQuestionIds = new Set<number>();
  // Skip rules activate incrementally along the walked path, so answers on
  // questions the walk never visits (stale off-path data) hide nothing, and
  // a hide can only ever affect questions after its source.
  const activeHiddenQuestionIds = new Set<number>();
  let question: SurveyQuestion | null = getOrderedQuestions(survey)[0] ?? null;

  while (question) {
    if (visitedQuestionIds.has(question.id)) {
      return { path, hasLoop: true };
    }

    visitedQuestionIds.add(question.id);
    path.push(question);

    const response = responsesByQuestionId.get(question.id);

    for (const hiddenQuestionId of collectActivatedHiddenQuestionIds(survey, question, response)) {
      activeHiddenQuestionIds.add(hiddenQuestionId);
    }

    question = resolveNextQuestion(survey, question, response, activeHiddenQuestionIds);
  }

  return { path, hasLoop: false };
}

export interface AttemptPagePathResult {
  path: SurveyPage[];
  visibleQuestionIdsByPageId: Record<number, number[]>;
  hasLoop: boolean;
}

export interface ProgressivePageState extends AttemptPagePathResult {
  currentPage: SurveyPage | null;
  currentQuestion: SurveyQuestion | null;
  currentPageQuestionIds: number[];
}

export interface SurveyRemainingTimeEstimate {
  copy: string;
  remainingPathWeightSeconds: number;
  remainingQuestionIds: number[];
  remainingSeconds: number;
  totalEstimateSeconds: number;
  totalPathWeightSeconds: number;
}

export function calculateSurveyRemainingTimeEstimate(input: {
  currentPageId: number | null;
  pagePath?: AttemptPagePathResult;
  responses: SurveyResponseAnswer[];
  survey: Survey;
}): SurveyRemainingTimeEstimate {
  const pagePath = input.pagePath ?? resolveAttemptPagePath(input.survey, input.responses);
  const questionsById = new Map(input.survey.questions.map((question) => [question.id, question]));
  const responsesByQuestionId = new Map(
    input.responses.map((response) => [response.questionId, response])
  );
  const pathPageIds = pagePath.path.map((page) => page.id);
  const currentPageIndex =
    input.currentPageId === null ? pathPageIds.length : pathPageIds.indexOf(input.currentPageId);
  const firstRemainingPageIndex = currentPageIndex >= 0 ? currentPageIndex : 0;
  const totalQuestionIds = uniqueNumbers(
    pagePath.path.flatMap((page) => pagePath.visibleQuestionIdsByPageId[page.id] ?? [])
  );
  const remainingQuestionIds = uniqueNumbers(
    pagePath.path.flatMap((page, pageIndex) => {
      if (pageIndex < firstRemainingPageIndex) {
        return [];
      }

      const visibleQuestionIds = pagePath.visibleQuestionIdsByPageId[page.id] ?? [];

      if (page.id !== input.currentPageId) {
        return visibleQuestionIds;
      }

      return visibleQuestionIds.filter((questionId) => {
        const question = questionsById.get(questionId);

        return question
          ? !hasProgressiveResponseForQuestion(question, responsesByQuestionId.get(questionId))
          : false;
      });
    })
  );
  const totalPathWeightSeconds = sumQuestionWeights(totalQuestionIds, questionsById);
  const remainingPathWeightSeconds = sumQuestionWeights(remainingQuestionIds, questionsById);
  const totalEstimateSeconds = Math.max(1, Math.round(input.survey.effectiveEstimateSeconds));
  const remainingSeconds =
    totalPathWeightSeconds > 0 && remainingPathWeightSeconds > 0
      ? Math.min(
          totalEstimateSeconds,
          Math.max(
            1,
            Math.round((remainingPathWeightSeconds / totalPathWeightSeconds) * totalEstimateSeconds)
          )
        )
      : 0;

  return {
    copy: formatRemainingTimeCopy(remainingSeconds),
    remainingPathWeightSeconds,
    remainingQuestionIds,
    remainingSeconds,
    totalEstimateSeconds,
    totalPathWeightSeconds
  };
}

export function formatRemainingTimeCopy(remainingSeconds: number): string {
  const safeSeconds = Math.max(0, Math.round(remainingSeconds));

  if (safeSeconds <= 15) {
    return "Almost done";
  }

  if (safeSeconds < 60) {
    return "Less than 1 min remaining";
  }

  const minutes = Math.max(1, Math.round(safeSeconds / 60));

  return `About ${minutes} min remaining`;
}

export function resolveAttemptPagePath(
  survey: Survey,
  responses: SurveyResponseAnswer[]
): AttemptPagePathResult {
  const state = resolveProgressivePageState(survey, responses);

  return {
    path: state.path,
    visibleQuestionIdsByPageId: state.visibleQuestionIdsByPageId,
    hasLoop: state.hasLoop
  };
}

export function resolveProgressivePageState(
  survey: Survey,
  responses: SurveyResponseAnswer[]
): ProgressivePageState {
  const responsesByQuestionId = new Map(
    responses.map((response) => [response.questionId, response])
  );
  const path: SurveyPage[] = [];
  const visibleQuestionIdsByPageId: Record<number, number[]> = {};
  const visitedPageIds = new Set<number>();
  const activeHiddenQuestionIds = new Set<number>();
  const normalFlowExcludedQuestionIds = getNormalFlowExcludedQuestionIds(survey);
  const jumpedToPageIds = new Set<number>();
  let page: SurveyPage | null = getOrderedPages(survey)[0] ?? null;

  pageLoop:
  while (page) {
    if (visitedPageIds.has(page.id)) {
      return {
        path,
        visibleQuestionIdsByPageId,
        currentPage: null,
        currentQuestion: null,
        currentPageQuestionIds: [],
        hasLoop: true
      };
    }

    visitedPageIds.add(page.id);
    path.push(page);

    const revealedQuestionIds: number[] = [];
    const wasReachedByJump = jumpedToPageIds.has(page.id);

    for (const question of getQuestionsForPage(survey, page.id)) {
      if (
        activeHiddenQuestionIds.has(question.id) ||
        (!wasReachedByJump && normalFlowExcludedQuestionIds.has(question.id))
      ) {
        continue;
      }

      revealedQuestionIds.push(question.id);
      const response = responsesByQuestionId.get(question.id);

      if (!hasProgressiveResponseForQuestion(question, response)) {
        visibleQuestionIdsByPageId[page.id] = revealedQuestionIds;
        appendProjectedPagePath(
          survey,
          page,
          activeHiddenQuestionIds,
          visitedPageIds,
          path,
          visibleQuestionIdsByPageId
        );

        return {
          path,
          visibleQuestionIdsByPageId,
          currentPage: page,
          currentQuestion: question,
          currentPageQuestionIds: revealedQuestionIds,
          hasLoop: false
        };
      }

      for (const hiddenQuestionId of collectActivatedHiddenQuestionIds(survey, question, response)) {
        activeHiddenQuestionIds.add(hiddenQuestionId);
      }

      const navigationTarget = resolveTriggeredNavigationPage(
        survey,
        page,
        responsesByQuestionId,
        activeHiddenQuestionIds,
        revealedQuestionIds
      );

      if (navigationTarget) {
        visibleQuestionIdsByPageId[page.id] = revealedQuestionIds;
        jumpedToPageIds.add(navigationTarget.id);
        page = navigationTarget;
        continue pageLoop;
      }

      // An "advance on trigger" HIDE_PAGE rule behaves like a jump: stop
      // revealing the rest of this page and move to the next visible page,
      // which getNextVisiblePage skips past the just-hidden target page(s).
      if (hasActivatedAdvancingPageSkip(survey, question, response)) {
        visibleQuestionIdsByPageId[page.id] = revealedQuestionIds;
        page = getNextVisiblePage(survey, page, activeHiddenQuestionIds);
        continue pageLoop;
      }
    }

    visibleQuestionIdsByPageId[page.id] = revealedQuestionIds;
    page = getNextVisiblePage(survey, page, activeHiddenQuestionIds);
  }

  return {
    path,
    visibleQuestionIdsByPageId,
    currentPage: null,
    currentQuestion: null,
    currentPageQuestionIds: [],
    hasLoop: false
  };
}

export function getOrderedPages(survey: Survey): SurveyPage[] {
  return [...survey.pages].sort(
    (left, right) => left.displayOrder - right.displayOrder || left.id - right.id
  );
}

export function getOrderedQuestions(survey: Survey): SurveyQuestion[] {
  const pageOrderById = new Map(
    getOrderedPages(survey).map((page, index) => [page.id, index])
  );

  return [...survey.questions].sort((left, right) => {
    const pageOrder =
      (pageOrderById.get(left.pageId) ?? Number.MAX_SAFE_INTEGER) -
      (pageOrderById.get(right.pageId) ?? Number.MAX_SAFE_INTEGER);

    return pageOrder || left.displayOrder - right.displayOrder || left.id - right.id;
  });
}

export function getQuestionsForPage(survey: Survey, pageId: number): SurveyQuestion[] {
  return getOrderedQuestions(survey).filter((question) => question.pageId === pageId);
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values)];
}

function sumQuestionWeights(
  questionIds: number[],
  questionsById: ReadonlyMap<number, SurveyQuestion>
): number {
  return questionIds.reduce((sum, questionId) => {
    const question = questionsById.get(questionId);

    return question
      ? sum + getSurveyQuestionTypeEstimateWeightSeconds(question.questionType)
      : sum;
  }, 0);
}

function compareQuestionOrder(
  survey: Survey,
  left: SurveyQuestion,
  right: SurveyQuestion
): number {
  const orderedIds = getOrderedQuestions(survey).map((question) => question.id);

  return orderedIds.indexOf(left.id) - orderedIds.indexOf(right.id);
}

function getNextVisiblePage(
  survey: Survey,
  page: SurveyPage,
  hiddenQuestionIds: ReadonlySet<number>
): SurveyPage | null {
  const orderedPages = getOrderedPages(survey);
  const currentIndex = orderedPages.findIndex((candidate) => candidate.id === page.id);
  const normalFlowExcludedPageIds = getNormalFlowExcludedPageIds(survey);
  const normalFlowExcludedQuestionIds = getNormalFlowExcludedQuestionIds(survey);

  if (currentIndex < 0) {
    return null;
  }

  return (
    orderedPages.slice(currentIndex + 1).find((candidate) =>
      !normalFlowExcludedPageIds.has(candidate.id) &&
      getQuestionsForPage(survey, candidate.id).some(
        (question) =>
          !hiddenQuestionIds.has(question.id) &&
          !normalFlowExcludedQuestionIds.has(question.id)
      )
    ) ?? null
  );
}

function getVisibleTargetPage(
  survey: Survey,
  page: SurveyPage,
  hiddenQuestionIds: ReadonlySet<number>
): SurveyPage | null {
  const hasVisibleQuestion = getQuestionsForPage(survey, page.id).some(
    (question) => !hiddenQuestionIds.has(question.id)
  );

  return hasVisibleQuestion ? page : getNextVisiblePage(survey, page, hiddenQuestionIds);
}

function resolveTriggeredNavigationPage(
  survey: Survey,
  page: SurveyPage,
  responsesByQuestionId: ReadonlyMap<number, SurveyResponseAnswer>,
  hiddenQuestionIds: ReadonlySet<number>,
  sourceQuestionIds: readonly number[]
): SurveyPage | null {
  const orderedPages = getOrderedPages(survey);
  const currentPageIndex = orderedPages.findIndex((candidate) => candidate.id === page.id);
  const sourceQuestionIdSet = new Set(sourceQuestionIds);
  const candidatePages: SurveyPage[] = [];

  for (const rule of survey.conditionalLogicRules) {
    if (
      !sourceQuestionIdSet.has(rule.sourceQuestionId) ||
      !(
        (rule.actionType === "JUMP_TO_PAGE" && rule.targetPageId !== null) ||
        (rule.actionType === "JUMP_TO_QUESTION" && rule.targetQuestionId !== null)
      )
    ) {
      continue;
    }

    const sourceQuestion = survey.questions.find(
      (candidate) => candidate.id === rule.sourceQuestionId
    );

    if (!sourceQuestion || hiddenQuestionIds.has(sourceQuestion.id)) {
      continue;
    }

    const response = responsesByQuestionId.get(rule.sourceQuestionId);

    if (!doesRuleMatchResponse(rule, response)) {
      continue;
    }

    const targetPage = resolveRuleTargetPage(survey, rule);

    if (!targetPage || targetPage.id === page.id) {
      continue;
    }

    const visibleTargetPage = getVisibleTargetPage(survey, targetPage, hiddenQuestionIds);
    const visibleTargetPageIndex = visibleTargetPage
      ? orderedPages.findIndex((candidate) => candidate.id === visibleTargetPage.id)
      : -1;

    if (visibleTargetPage && visibleTargetPageIndex > currentPageIndex) {
      candidatePages.push(visibleTargetPage);
    }
  }

  return (
    candidatePages.sort(
      (left, right) =>
        orderedPages.findIndex((candidate) => candidate.id === right.id) -
        orderedPages.findIndex((candidate) => candidate.id === left.id)
    )[0] ?? null
  );
}

function resolveRuleTargetPage(
  survey: Survey,
  rule: ConditionalLogicRule
): SurveyPage | null {
  if (rule.targetPageId) {
    return survey.pages.find((candidate) => candidate.id === rule.targetPageId) ?? null;
  }

  if (rule.targetQuestionId) {
    const targetQuestion = survey.questions.find(
      (candidate) => candidate.id === rule.targetQuestionId
    );

    return targetQuestion
      ? survey.pages.find((candidate) => candidate.id === targetQuestion.pageId) ?? null
      : null;
  }

  return null;
}

function appendProjectedPagePath(
  survey: Survey,
  currentPage: SurveyPage,
  hiddenQuestionIds: ReadonlySet<number>,
  visitedPageIds: Set<number>,
  path: SurveyPage[],
  visibleQuestionIdsByPageId: Record<number, number[]>
) {
  const orderedPages = getOrderedPages(survey);
  const currentPageIndex = orderedPages.findIndex((page) => page.id === currentPage.id);
  const normalFlowExcludedPageIds = getNormalFlowExcludedPageIds(survey);
  const normalFlowExcludedQuestionIds = getNormalFlowExcludedQuestionIds(survey);

  for (const page of orderedPages.slice(currentPageIndex + 1)) {
    if (visitedPageIds.has(page.id) || normalFlowExcludedPageIds.has(page.id)) {
      continue;
    }

    const visibleQuestionIds = getQuestionsForPage(survey, page.id)
      .filter(
        (question) =>
          !hiddenQuestionIds.has(question.id) &&
          !normalFlowExcludedQuestionIds.has(question.id)
      )
      .map((question) => question.id);

    if (visibleQuestionIds.length === 0) {
      continue;
    }

    visitedPageIds.add(page.id);
    path.push(page);
    visibleQuestionIdsByPageId[page.id] = visibleQuestionIds;
  }
}

function getNormalFlowExcludedQuestionIds(survey: Survey): Set<number> {
  return new Set(
    survey.conditionalLogicRules
      .filter(
        (rule) =>
          rule.skipTargetInNormalFlow &&
          rule.actionType === "JUMP_TO_QUESTION" &&
          rule.targetQuestionId !== null
      )
      .map((rule) => rule.targetQuestionId)
      .filter((targetQuestionId): targetQuestionId is number => targetQuestionId !== null)
  );
}

function getNormalFlowExcludedPageIds(survey: Survey): Set<number> {
  const pageIds = new Set<number>();

  for (const rule of survey.conditionalLogicRules) {
    if (
      !rule.skipTargetInNormalFlow ||
      rule.actionType !== "JUMP_TO_PAGE" ||
      rule.targetPageId === null
    ) {
      continue;
    }

    pageIds.add(rule.targetPageId);
  }

  return pageIds;
}

function hasProgressiveResponseForQuestion(
  question: SurveyQuestion,
  response: SurveyResponseAnswer | undefined
): boolean {
  if (!response) {
    return false;
  }

  if (!question.isRequired) {
    return true;
  }

  if (question.questionType === "text") {
    return Boolean(response.answerText?.trim());
  }

  if (question.questionType === "integer") {
    return Number.isInteger(response.answerInteger);
  }

  if (question.questionType === "single_select") {
    return response.selectedAnswerOptionIds.length === 1 || Boolean(response.otherText?.trim());
  }

  if (question.questionType === "scale") {
    return response.selectedAnswerOptionIds.length === 1 && Number.isInteger(response.answerInteger);
  }

  return response.selectedAnswerOptionIds.length > 0 || Boolean(response.otherText?.trim());
}
