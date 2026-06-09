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

export type SurveyQuestionType = "text" | "integer" | "single_select" | "multi_select";

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
  createdAt: string;
  updatedAt: string;
}

export interface Survey {
  id: number;
  title: string;
  description: string | null;
  status: SurveyStatus;
  createdByUserId: number | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  retiredAt: string | null;
  questions: SurveyQuestion[];
  conditionalLogicRules: ConditionalLogicRule[];
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
  status: "ok";
  app: "survey-portal";
  runEnv: "dev" | "prod";
  timestamp: string;
}
