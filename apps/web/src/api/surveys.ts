import type {
  AnswerSurveyResponse,
  CompleteSurveyResponse,
  MySurveyResponse,
  MySurveysResponse,
  StartSurveyResponse,
  SurveyListResponse,
  SurveyQuestionType,
  SurveyResponse,
  SurveyStatus
} from "@survey-portal/shared";

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
}): Promise<SurveyResponse> {
  return apiRequest<SurveyResponse>("/api/surveys", {
    body: JSON.stringify({
      title: input.title,
      description: input.description,
      status: input.status ?? "draft"
    }),
    method: "POST"
  });
}

export async function updateSurveyMetadata(input: {
  surveyId: number;
  title: string;
  description: string | null;
  status: SurveyStatus;
}): Promise<SurveyResponse> {
  return apiRequest<SurveyResponse>(`/api/surveys/${input.surveyId}`, {
    body: JSON.stringify({
      title: input.title,
      description: input.description,
      status: input.status
    }),
    method: "PUT"
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

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init.headers
    }
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return response.json() as Promise<T>;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    return typeof body.error === "string" ? body.error : "Request failed";
  } catch {
    return "Request failed";
  }
}
