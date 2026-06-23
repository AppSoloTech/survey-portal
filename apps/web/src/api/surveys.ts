import type {
  AdminAttemptDetailResponse,
  AnonymousSurveyLinksResponse,
  AnonymousSurveyResponse,
  AnswerSurveyResponse,
  CompleteSurveyResponse,
  CreateAnonymousSurveyLinkResponse,
  DisableAnonymousSurveyLinkResponse,
  MySurveyResponse,
  MySurveysResponse,
  RotateAnonymousSurveyLinkResponse,
  StartAnonymousSurveyResponse,
  StartSurveyResponse,
  SurveyAnswerRequestPayload,
  SurveyAttemptsListResponse,
  SurveyListResponse,
  SurveyQuestionType,
  SurveyReportResponse,
  SurveyResponse,
  SurveyStatus
} from "@survey-portal/shared";

import { apiRequest } from "./client.js";

export async function fetchMySurveys(): Promise<MySurveysResponse> {
  return apiRequest<MySurveysResponse>("/api/my-surveys");
}

export async function fetchMySurvey(attemptId: number): Promise<MySurveyResponse> {
  return apiRequest<MySurveyResponse>(`/api/my-surveys/${attemptId}`);
}

export async function startSurvey(surveyId: number): Promise<StartSurveyResponse> {
  return apiRequest<StartSurveyResponse>(`/api/surveys/${surveyId}/start`, {
    method: "POST"
  });
}

export async function answerSurvey(input: {
  surveyId: number;
} & SurveyAnswerRequestPayload): Promise<AnswerSurveyResponse> {
  return apiRequest<AnswerSurveyResponse>(`/api/surveys/${input.surveyId}/answer`, {
    body: JSON.stringify({
      attemptId: input.attemptId,
      questionId: input.questionId,
      answerText: input.answerText,
      answerInteger: input.answerInteger,
      selectedAnswerOptionIds: input.selectedAnswerOptionIds,
      isOtherSelected: input.isOtherSelected,
      otherText: input.otherText
    }),
    method: "POST"
  });
}

export async function answerSurveyPage(input: {
  surveyId: number;
  attemptId: number;
  pageId: number;
  answers: {
    questionId: number;
    answerText: string | null;
    answerInteger: number | null;
    selectedAnswerOptionIds: number[];
    isOtherSelected: boolean;
    otherText: string | null;
  }[];
}): Promise<AnswerSurveyResponse> {
  return apiRequest<AnswerSurveyResponse>(
    `/api/surveys/${input.surveyId}/pages/${input.pageId}/answer`,
    {
      body: JSON.stringify({
        attemptId: input.attemptId,
        answers: input.answers
      }),
      method: "POST"
    }
  );
}

export async function completeSurvey(input: {
  surveyId: number;
  attemptId: number;
}): Promise<CompleteSurveyResponse> {
  return apiRequest<CompleteSurveyResponse>(`/api/surveys/${input.surveyId}/complete`, {
    body: JSON.stringify({
      attemptId: input.attemptId
    }),
    method: "POST"
  });
}

export async function fetchAnonymousSurvey(token: string): Promise<AnonymousSurveyResponse> {
  return apiRequest<AnonymousSurveyResponse>(
    `/api/anonymous-surveys/${encodeURIComponent(token)}`
  );
}

export async function startAnonymousSurvey(token: string): Promise<StartAnonymousSurveyResponse> {
  return apiRequest<StartAnonymousSurveyResponse>(
    `/api/anonymous-surveys/${encodeURIComponent(token)}/start`,
    { method: "POST" }
  );
}

export async function answerAnonymousSurvey(input: {
  token: string;
  attemptAccessToken: string;
} & SurveyAnswerRequestPayload): Promise<AnswerSurveyResponse> {
  return apiRequest<AnswerSurveyResponse>(
    `/api/anonymous-surveys/${encodeURIComponent(input.token)}/answer`,
    {
      body: JSON.stringify({
        attemptAccessToken: input.attemptAccessToken,
        attemptId: input.attemptId,
        questionId: input.questionId,
        answerText: input.answerText,
        answerInteger: input.answerInteger,
        selectedAnswerOptionIds: input.selectedAnswerOptionIds,
        isOtherSelected: input.isOtherSelected,
        otherText: input.otherText
      }),
      method: "POST"
    }
  );
}

export async function completeAnonymousSurvey(input: {
  token: string;
  attemptAccessToken: string;
  attemptId: number;
}): Promise<CompleteSurveyResponse> {
  return apiRequest<CompleteSurveyResponse>(
    `/api/anonymous-surveys/${encodeURIComponent(input.token)}/complete`,
    {
      body: JSON.stringify({
        attemptAccessToken: input.attemptAccessToken,
        attemptId: input.attemptId
      }),
      method: "POST"
    }
  );
}

export async function submitAnonymousContactEmail(input: {
  token: string;
  attemptAccessToken: string;
  attemptId: number;
  email: string;
}): Promise<CompleteSurveyResponse> {
  return apiRequest<CompleteSurveyResponse>(
    `/api/anonymous-surveys/${encodeURIComponent(input.token)}/contact-email`,
    {
      body: JSON.stringify({
        attemptAccessToken: input.attemptAccessToken,
        attemptId: input.attemptId,
        email: input.email
      }),
      method: "POST"
    }
  );
}

export async function fetchAnonymousSurveyLinks(
  surveyId: number
): Promise<AnonymousSurveyLinksResponse> {
  return apiRequest<AnonymousSurveyLinksResponse>(`/api/surveys/${surveyId}/anonymous-links`);
}

export async function createAnonymousSurveyLink(input: {
  surveyId: number;
  expiresAt?: string | null;
}): Promise<CreateAnonymousSurveyLinkResponse> {
  return apiRequest<CreateAnonymousSurveyLinkResponse>(
    `/api/surveys/${input.surveyId}/anonymous-links`,
    {
      body: JSON.stringify({ expiresAt: input.expiresAt ?? null }),
      method: "POST"
    }
  );
}

export async function disableAnonymousSurveyLink(input: {
  surveyId: number;
  linkId: number;
}): Promise<DisableAnonymousSurveyLinkResponse> {
  return apiRequest<DisableAnonymousSurveyLinkResponse>(
    `/api/surveys/${input.surveyId}/anonymous-links/${input.linkId}/disable`,
    { method: "PATCH" }
  );
}

export async function rotateAnonymousSurveyLink(input: {
  surveyId: number;
  linkId: number;
  expiresAt?: string | null;
}): Promise<RotateAnonymousSurveyLinkResponse> {
  return apiRequest<RotateAnonymousSurveyLinkResponse>(
    `/api/surveys/${input.surveyId}/anonymous-links/${input.linkId}/rotate`,
    {
      body: JSON.stringify({ expiresAt: input.expiresAt ?? null }),
      method: "POST"
    }
  );
}

export async function fetchAdminSurveys(): Promise<SurveyListResponse> {
  return apiRequest<SurveyListResponse>("/api/surveys");
}

export async function fetchAdminSurvey(surveyId: number): Promise<SurveyResponse> {
  return apiRequest<SurveyResponse>(`/api/surveys/${surveyId}`);
}

export async function createSurvey(input: {
  title: string;
  description: string | null;
  status?: SurveyStatus;
  categoryId?: number | null;
}): Promise<SurveyResponse> {
  return apiRequest<SurveyResponse>("/api/surveys", {
    body: JSON.stringify({
      title: input.title,
      description: input.description,
      status: input.status ?? "draft",
      categoryId: input.categoryId ?? null
    }),
    method: "POST"
  });
}

export async function updateSurveyMetadata(input: {
  surveyId: number;
  title: string;
  description: string | null;
  status: SurveyStatus;
  categoryId: number | null;
}): Promise<SurveyResponse> {
  return apiRequest<SurveyResponse>(`/api/surveys/${input.surveyId}`, {
    body: JSON.stringify({
      title: input.title,
      description: input.description,
      status: input.status,
      categoryId: input.categoryId
    }),
    method: "PUT"
  });
}

export async function deleteSurvey(surveyId: number): Promise<SurveyResponse> {
  return apiRequest<SurveyResponse>(`/api/surveys/${surveyId}`, {
    method: "DELETE"
  });
}

export async function duplicateSurvey(surveyId: number): Promise<SurveyResponse> {
  return apiRequest<SurveyResponse>(`/api/surveys/${surveyId}/duplicate`, {
    method: "POST"
  });
}

export async function updateSurveyStatus(input: {
  surveyId: number;
  status: SurveyStatus;
}): Promise<SurveyResponse> {
  return apiRequest<SurveyResponse>(`/api/surveys/${input.surveyId}/status`, {
    body: JSON.stringify({ status: input.status }),
    method: "PATCH"
  });
}

export async function createSurveyPage(input: {
  surveyId: number;
  title: string;
  description: string | null;
  displayOrder?: number | null;
}): Promise<SurveyResponse> {
  return apiRequest<SurveyResponse>(`/api/surveys/${input.surveyId}/pages`, {
    body: JSON.stringify({
      title: input.title,
      description: input.description,
      displayOrder: input.displayOrder ?? null
    }),
    method: "POST"
  });
}

export async function updateSurveyPage(input: {
  surveyId: number;
  pageId: number;
  title: string;
  description: string | null;
}): Promise<SurveyResponse> {
  return apiRequest<SurveyResponse>(`/api/surveys/${input.surveyId}/pages/${input.pageId}`, {
    body: JSON.stringify({
      title: input.title,
      description: input.description
    }),
    method: "PUT"
  });
}

export async function deleteSurveyPage(input: {
  surveyId: number;
  pageId: number;
}): Promise<SurveyResponse> {
  return apiRequest<SurveyResponse>(`/api/surveys/${input.surveyId}/pages/${input.pageId}`, {
    method: "DELETE"
  });
}

export async function reorderSurveyPages(input: {
  surveyId: number;
  pageIds: number[];
}): Promise<SurveyResponse> {
  return apiRequest<SurveyResponse>(`/api/surveys/${input.surveyId}/pages/reorder`, {
    body: JSON.stringify({ pageIds: input.pageIds }),
    method: "PATCH"
  });
}

export async function createQuestion(input: {
  surveyId: number;
  pageId?: number | null;
  questionText: string;
  questionType: SurveyQuestionType;
  scaleMin?: number | null;
  scaleMax?: number | null;
  isRequired: boolean;
  helpText: string | null;
  allowOther?: boolean;
}): Promise<SurveyResponse> {
  return apiRequest<SurveyResponse>(`/api/surveys/${input.surveyId}/questions`, {
    body: JSON.stringify({
      questionText: input.questionText,
      questionType: input.questionType,
      pageId: input.pageId ?? null,
      scaleMin: input.scaleMin ?? null,
      scaleMax: input.scaleMax ?? null,
      isRequired: input.isRequired,
      helpText: input.helpText,
      allowOther: input.allowOther ?? false
    }),
    method: "POST"
  });
}

export async function updateQuestion(input: {
  surveyId: number;
  questionId: number;
  questionText: string;
  questionType: SurveyQuestionType;
  scaleMin?: number | null;
  scaleMax?: number | null;
  isRequired: boolean;
  helpText: string | null;
  allowOther?: boolean;
}): Promise<SurveyResponse> {
  return apiRequest<SurveyResponse>(
    `/api/surveys/${input.surveyId}/questions/${input.questionId}`,
    {
      body: JSON.stringify({
        questionText: input.questionText,
        questionType: input.questionType,
        scaleMin: input.scaleMin ?? null,
        scaleMax: input.scaleMax ?? null,
        isRequired: input.isRequired,
        helpText: input.helpText,
        allowOther: input.allowOther ?? false
      }),
      method: "PUT"
    }
  );
}

export async function deleteQuestion(input: {
  surveyId: number;
  questionId: number;
}): Promise<SurveyResponse> {
  return apiRequest<SurveyResponse>(
    `/api/surveys/${input.surveyId}/questions/${input.questionId}`,
    { method: "DELETE" }
  );
}

export async function reorderQuestions(input: {
  surveyId: number;
  pageId?: number | null;
  questionIds: number[];
}): Promise<SurveyResponse> {
  const path = input.pageId
    ? `/api/surveys/${input.surveyId}/pages/${input.pageId}/questions/reorder`
    : `/api/surveys/${input.surveyId}/questions/reorder`;

  return apiRequest<SurveyResponse>(path, {
    body: JSON.stringify({ questionIds: input.questionIds }),
    method: "PATCH"
  });
}

export async function moveQuestionToPage(input: {
  surveyId: number;
  questionId: number;
  pageId: number;
  displayOrder?: number | null;
}): Promise<SurveyResponse> {
  return apiRequest<SurveyResponse>(
    `/api/surveys/${input.surveyId}/questions/${input.questionId}/page`,
    {
      body: JSON.stringify({
        pageId: input.pageId,
        displayOrder: input.displayOrder ?? null
      }),
      method: "PATCH"
    }
  );
}

export async function createAnswerOption(input: {
  surveyId: number;
  questionId: number;
  optionText: string;
}): Promise<SurveyResponse> {
  return apiRequest<SurveyResponse>(
    `/api/surveys/${input.surveyId}/questions/${input.questionId}/options`,
    {
      body: JSON.stringify({ optionText: input.optionText }),
      method: "POST"
    }
  );
}

export async function updateAnswerOption(input: {
  surveyId: number;
  questionId: number;
  optionId: number;
  optionText: string;
}): Promise<SurveyResponse> {
  return apiRequest<SurveyResponse>(
    `/api/surveys/${input.surveyId}/questions/${input.questionId}/options/${input.optionId}`,
    {
      body: JSON.stringify({ optionText: input.optionText }),
      method: "PUT"
    }
  );
}

export async function deleteAnswerOption(input: {
  surveyId: number;
  questionId: number;
  optionId: number;
}): Promise<SurveyResponse> {
  return apiRequest<SurveyResponse>(
    `/api/surveys/${input.surveyId}/questions/${input.questionId}/options/${input.optionId}`,
    { method: "DELETE" }
  );
}

export async function reorderAnswerOptions(input: {
  surveyId: number;
  questionId: number;
  optionIds: number[];
}): Promise<SurveyResponse> {
  return apiRequest<SurveyResponse>(
    `/api/surveys/${input.surveyId}/questions/${input.questionId}/options/reorder`,
    {
      body: JSON.stringify({ optionIds: input.optionIds }),
      method: "PATCH"
    }
  );
}

export async function createAnswerTag(input: {
  surveyId: number;
  questionId: number;
  optionId: number;
  tagKey: string;
  tagValue: string;
}): Promise<SurveyResponse> {
  return apiRequest<SurveyResponse>(
    `/api/surveys/${input.surveyId}/questions/${input.questionId}/options/${input.optionId}/tags`,
    {
      body: JSON.stringify({ tagKey: input.tagKey, tagValue: input.tagValue }),
      method: "POST"
    }
  );
}

export async function updateAnswerTag(input: {
  surveyId: number;
  questionId: number;
  optionId: number;
  tagId: number;
  tagKey: string;
  tagValue: string;
}): Promise<SurveyResponse> {
  return apiRequest<SurveyResponse>(
    `/api/surveys/${input.surveyId}/questions/${input.questionId}/options/${input.optionId}/tags/${input.tagId}`,
    {
      body: JSON.stringify({ tagKey: input.tagKey, tagValue: input.tagValue }),
      method: "PUT"
    }
  );
}

export async function deleteAnswerTag(input: {
  surveyId: number;
  questionId: number;
  optionId: number;
  tagId: number;
}): Promise<SurveyResponse> {
  return apiRequest<SurveyResponse>(
    `/api/surveys/${input.surveyId}/questions/${input.questionId}/options/${input.optionId}/tags/${input.tagId}`,
    { method: "DELETE" }
  );
}

export type ConditionalRuleActionType =
  | "JUMP_TO_QUESTION"
  | "JUMP_TO_PAGE"
  | "HIDE_QUESTION"
  | "HIDE_PAGE";
export type ConditionalRuleConditionOperator = "equals" | "is_blank";

export async function createQuestionValueTag(input: {
  surveyId: number;
  questionId: number;
  tagKey: string;
  tagValue: string;
  integerMin: number | null;
  integerMax: number | null;
}): Promise<SurveyResponse> {
  return apiRequest<SurveyResponse>(
    `/api/surveys/${input.surveyId}/questions/${input.questionId}/value-tags`,
    {
      body: JSON.stringify({
        tagKey: input.tagKey,
        tagValue: input.tagValue,
        integerMin: input.integerMin,
        integerMax: input.integerMax
      }),
      method: "POST"
    }
  );
}

export async function deleteQuestionValueTag(input: {
  surveyId: number;
  questionId: number;
  valueTagId: number;
}): Promise<SurveyResponse> {
  return apiRequest<SurveyResponse>(
    `/api/surveys/${input.surveyId}/questions/${input.questionId}/value-tags/${input.valueTagId}`,
    { method: "DELETE" }
  );
}

export async function createConditionalRule(input: {
  surveyId: number;
  sourcePageId?: number | null;
  sourceQuestionId: number;
  sourceAnswerOptionId: number | null;
  targetQuestionId?: number | null;
  targetPageId?: number | null;
  conditionOperator?: ConditionalRuleConditionOperator;
  actionType?: ConditionalRuleActionType;
  skipTargetInNormalFlow: boolean;
  advanceOnTrigger?: boolean;
}): Promise<SurveyResponse> {
  return apiRequest<SurveyResponse>(`/api/surveys/${input.surveyId}/rules`, {
    body: JSON.stringify({
      sourcePageId: input.sourcePageId ?? null,
      sourceQuestionId: input.sourceQuestionId,
      sourceAnswerOptionId: input.sourceAnswerOptionId,
      targetQuestionId: input.targetQuestionId ?? null,
      targetPageId: input.targetPageId ?? null,
      skipTargetInNormalFlow: input.skipTargetInNormalFlow,
      advanceOnTrigger: input.advanceOnTrigger ?? false,
      conditionOperator: input.conditionOperator ?? "equals",
      actionType: input.actionType ?? "JUMP_TO_QUESTION"
    }),
    method: "POST"
  });
}

export async function updateConditionalRule(input: {
  surveyId: number;
  ruleId: number;
  sourcePageId?: number | null;
  sourceQuestionId: number;
  sourceAnswerOptionId: number | null;
  targetQuestionId?: number | null;
  targetPageId?: number | null;
  conditionOperator?: ConditionalRuleConditionOperator;
  actionType?: ConditionalRuleActionType;
  skipTargetInNormalFlow: boolean;
  advanceOnTrigger?: boolean;
}): Promise<SurveyResponse> {
  return apiRequest<SurveyResponse>(`/api/surveys/${input.surveyId}/rules/${input.ruleId}`, {
    body: JSON.stringify({
      sourcePageId: input.sourcePageId ?? null,
      sourceQuestionId: input.sourceQuestionId,
      sourceAnswerOptionId: input.sourceAnswerOptionId,
      targetQuestionId: input.targetQuestionId ?? null,
      targetPageId: input.targetPageId ?? null,
      skipTargetInNormalFlow: input.skipTargetInNormalFlow,
      advanceOnTrigger: input.advanceOnTrigger ?? false,
      conditionOperator: input.conditionOperator ?? "equals",
      actionType: input.actionType ?? "JUMP_TO_QUESTION"
    }),
    method: "PUT"
  });
}

export async function deleteConditionalRule(input: {
  surveyId: number;
  ruleId: number;
}): Promise<SurveyResponse> {
  return apiRequest<SurveyResponse>(`/api/surveys/${input.surveyId}/rules/${input.ruleId}`, {
    method: "DELETE"
  });
}

// Optional inclusive YYYY-MM-DD bounds filtering report data by when
// attempts started.
export interface AttemptDateRange {
  from?: string;
  to?: string;
}

function rangeQueryString(range?: AttemptDateRange): string {
  const params = new URLSearchParams();

  if (range?.from) {
    params.set("from", range.from);
  }

  if (range?.to) {
    params.set("to", range.to);
  }

  const query = params.toString();

  return query ? `?${query}` : "";
}

export async function fetchSurveyReport(
  surveyId: number,
  range?: AttemptDateRange
): Promise<SurveyReportResponse> {
  return apiRequest<SurveyReportResponse>(
    `/api/surveys/${surveyId}/report${rangeQueryString(range)}`
  );
}

export async function fetchSurveyAttempts(
  surveyId: number,
  range?: AttemptDateRange
): Promise<SurveyAttemptsListResponse> {
  return apiRequest<SurveyAttemptsListResponse>(
    `/api/surveys/${surveyId}/attempts${rangeQueryString(range)}`
  );
}

export async function fetchSurveyAttemptDetail(
  surveyId: number,
  attemptId: number
): Promise<AdminAttemptDetailResponse> {
  return apiRequest<AdminAttemptDetailResponse>(
    `/api/surveys/${surveyId}/attempts/${attemptId}`
  );
}

// The export is a plain authenticated download; cookie auth rides along on
// same-origin navigation, so a regular link works in dev (via the vite
// proxy) and production.
export function surveyExportCsvUrl(surveyId: number, range?: AttemptDateRange): string {
  return `/api/surveys/${surveyId}/export.csv${rangeQueryString(range)}`;
}
