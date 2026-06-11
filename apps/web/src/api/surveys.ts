import type {
  AdminAttemptDetailResponse,
  AnswerSurveyResponse,
  CompleteSurveyResponse,
  MySurveyResponse,
  MySurveysResponse,
  StartSurveyResponse,
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
  attemptId: number;
  questionId: number;
  answerText: string | null;
  answerInteger: number | null;
  selectedAnswerOptionIds: number[];
}): Promise<AnswerSurveyResponse> {
  return apiRequest<AnswerSurveyResponse>(`/api/surveys/${input.surveyId}/answer`, {
    body: JSON.stringify({
      attemptId: input.attemptId,
      questionId: input.questionId,
      answerText: input.answerText,
      answerInteger: input.answerInteger,
      selectedAnswerOptionIds: input.selectedAnswerOptionIds
    }),
    method: "POST"
  });
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

export async function createQuestion(input: {
  surveyId: number;
  questionText: string;
  questionType: SurveyQuestionType;
  scaleMin?: number | null;
  scaleMax?: number | null;
  isRequired: boolean;
  helpText: string | null;
}): Promise<SurveyResponse> {
  return apiRequest<SurveyResponse>(`/api/surveys/${input.surveyId}/questions`, {
    body: JSON.stringify({
      questionText: input.questionText,
      questionType: input.questionType,
      scaleMin: input.scaleMin ?? null,
      scaleMax: input.scaleMax ?? null,
      isRequired: input.isRequired,
      helpText: input.helpText
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
        helpText: input.helpText
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
  questionIds: number[];
}): Promise<SurveyResponse> {
  return apiRequest<SurveyResponse>(`/api/surveys/${input.surveyId}/questions/reorder`, {
    body: JSON.stringify({ questionIds: input.questionIds }),
    method: "PATCH"
  });
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

export async function createConditionalRule(input: {
  surveyId: number;
  sourceQuestionId: number;
  sourceAnswerOptionId: number;
  targetQuestionId: number;
  skipTargetInNormalFlow: boolean;
}): Promise<SurveyResponse> {
  return apiRequest<SurveyResponse>(`/api/surveys/${input.surveyId}/rules`, {
    body: JSON.stringify({
      sourceQuestionId: input.sourceQuestionId,
      sourceAnswerOptionId: input.sourceAnswerOptionId,
      targetQuestionId: input.targetQuestionId,
      skipTargetInNormalFlow: input.skipTargetInNormalFlow,
      conditionOperator: "equals",
      actionType: "JUMP_TO_QUESTION"
    }),
    method: "POST"
  });
}

export async function updateConditionalRule(input: {
  surveyId: number;
  ruleId: number;
  sourceQuestionId: number;
  sourceAnswerOptionId: number;
  targetQuestionId: number;
  skipTargetInNormalFlow: boolean;
}): Promise<SurveyResponse> {
  return apiRequest<SurveyResponse>(`/api/surveys/${input.surveyId}/rules/${input.ruleId}`, {
    body: JSON.stringify({
      sourceQuestionId: input.sourceQuestionId,
      sourceAnswerOptionId: input.sourceAnswerOptionId,
      targetQuestionId: input.targetQuestionId,
      skipTargetInNormalFlow: input.skipTargetInNormalFlow,
      conditionOperator: "equals",
      actionType: "JUMP_TO_QUESTION"
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

export async function fetchSurveyReport(surveyId: number): Promise<SurveyReportResponse> {
  return apiRequest<SurveyReportResponse>(`/api/surveys/${surveyId}/report`);
}

export async function fetchSurveyAttempts(surveyId: number): Promise<SurveyAttemptsListResponse> {
  return apiRequest<SurveyAttemptsListResponse>(`/api/surveys/${surveyId}/attempts`);
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
export function surveyExportCsvUrl(surveyId: number): string {
  return `/api/surveys/${surveyId}/export.csv`;
}
