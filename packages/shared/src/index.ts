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

export type SurveyAttemptStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "abandoned";

export type SurveyStatus = "draft" | "published" | "retired";

export type SurveyQuestionType = "text" | "integer" | "single_select" | "multi_select" | "scale";

export type ConditionalLogicConditionOperator = "equals";

export type ConditionalLogicActionType =
  | "JUMP_TO_QUESTION"
  | "JUMP_TO_PAGE"
  | "SHOW_QUESTION"
  | "HIDE_QUESTION"
  | "END_SURVEY";

export interface AnswerTag {
  id: number;
  answerOptionId: number;
  tagKey: string;
  tagValue: string;
  createdAt: string;
  updatedAt: string;
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
  questionText: string;
  questionType: SurveyQuestionType;
  scaleMin: number | null;
  scaleMax: number | null;
  displayOrder: number;
  isRequired: boolean;
  helpText: string | null;
  createdAt: string;
  updatedAt: string;
  answerOptions: AnswerOption[];
}

export interface ConditionalLogicRule {
  id: number;
  surveyId: number;
  sourceQuestionId: number;
  sourceAnswerOptionId: number;
  conditionOperator: ConditionalLogicConditionOperator;
  actionType: ConditionalLogicActionType;
  targetQuestionId: number | null;
  targetPageId: number | null;
  skipTargetInNormalFlow: boolean;
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
  questions: SurveyQuestion[];
  conditionalLogicRules: ConditionalLogicRule[];
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
  createdAt: string;
  updatedAt: string;
}

export interface SurveyAttempt {
  id: number;
  surveyId: number;
  userId: number;
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
}

export interface MySurveysResponse {
  surveys: SurveyAttemptSummary[];
}

export interface MySurveyResponse {
  attempt: SurveyAttempt;
  survey: Survey;
  currentQuestion: SurveyQuestion | null;
}

export interface StartSurveyResponse {
  attempt: SurveyAttempt;
  survey: Survey;
  currentQuestion: SurveyQuestion | null;
}

export interface AnswerSurveyResponse {
  attempt: SurveyAttempt;
  currentQuestion: SurveyQuestion | null;
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
  id: number;
  firstName: string;
  lastName: string;
  email: string;
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
  // True when the question sits on the navigation path implied by the
  // attempt's saved answers. Saved answers off this path are kept as
  // historical data and reported as "not on final path".
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
  const conditionalTargetQuestionIds = new Set(
    survey.conditionalLogicRules
      .filter((rule) => rule.actionType === "JUMP_TO_QUESTION" && rule.skipTargetInNormalFlow)
      .map((rule) => rule.targetQuestionId)
      .filter((targetQuestionId): targetQuestionId is number => targetQuestionId !== null)
  );
  const matchingRule = survey.conditionalLogicRules.find(
    (rule) =>
      rule.sourceQuestionId === question.id &&
      rule.conditionOperator === "equals" &&
      rule.actionType === "JUMP_TO_QUESTION" &&
      rule.targetQuestionId !== null &&
      response?.selectedAnswerOptionIds.includes(rule.sourceAnswerOptionId)
  );

  const advanceFrom = (fromQuestion: SurveyQuestion): SurveyQuestion | null =>
    survey.questions
      .filter(
        (candidate) =>
          candidate.displayOrder > fromQuestion.displayOrder &&
          !conditionalTargetQuestionIds.has(candidate.id) &&
          !hiddenQuestionIds.has(candidate.id)
      )
      .sort((left, right) => left.displayOrder - right.displayOrder || left.id - right.id)[0] ??
    null;

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

// Collects the questions hidden by HIDE_QUESTION rules whose source question
// was just answered with the rule's trigger option.
export function collectActivatedHiddenQuestionIds(
  survey: Survey,
  question: SurveyQuestion,
  response: SurveyResponseAnswer | undefined
): number[] {
  return survey.conditionalLogicRules
    .filter(
      (rule) =>
        rule.actionType === "HIDE_QUESTION" &&
        rule.conditionOperator === "equals" &&
        rule.targetQuestionId !== null &&
        rule.sourceQuestionId === question.id &&
        response?.selectedAnswerOptionIds.includes(rule.sourceAnswerOptionId) === true
    )
    .map((rule) => rule.targetQuestionId)
    .filter((targetQuestionId): targetQuestionId is number => targetQuestionId !== null);
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
  let question: SurveyQuestion | null =
    [...survey.questions].sort(
      (left, right) => left.displayOrder - right.displayOrder || left.id - right.id
    )[0] ?? null;

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
