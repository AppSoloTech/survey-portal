import type { SurveyQuestionType, SurveyStatus } from "@survey-portal/shared";

const surveyTitleMaxLength = 180;
const surveyDescriptionMaxLength = 1200;
const questionTextMaxLength = 500;
const questionHelpTextMaxLength = 500;
const answerOptionTextMaxLength = 240;
const answerTagKeyMaxLength = 80;
const answerTagValueMaxLength = 180;
const scaleRangeMaxValueCount = 21;

export function validateSurveyBody(body: unknown): ValidationResult<{
  title: string;
  description: string | null;
  status: SurveyStatus;
}> {
  if (!isRecord(body)) {
    return { ok: false, error: "Request body is required" };
  }

  const title = readTextField(body, "title");
  const description = readOptionalTextField(body, "description");
  const status = readTextField(body, "status") || "draft";

  if (!title) {
    return { ok: false, error: "Title is required" };
  }

  if (title.length > surveyTitleMaxLength) {
    return { ok: false, error: `Title must be ${surveyTitleMaxLength} characters or fewer` };
  }

  if (description && description.length > surveyDescriptionMaxLength) {
    return {
      ok: false,
      error: `Description must be ${surveyDescriptionMaxLength} characters or fewer`
    };
  }

  if (!isSurveyStatus(status)) {
    return { ok: false, error: "Status must be draft, published, or retired" };
  }

  return {
    ok: true,
    value: {
      title,
      description,
      status
    }
  };
}

export function validateSurveyStatusBody(body: unknown): ValidationResult<{ status: SurveyStatus }> {
  if (!isRecord(body)) {
    return { ok: false, error: "Request body is required" };
  }

  const status = readTextField(body, "status");

  if (!isSurveyStatus(status)) {
    return { ok: false, error: "Status must be draft, published, or retired" };
  }

  return { ok: true, value: { status } };
}

export interface QuestionBodyValue {
  questionText: string;
  questionType: SurveyQuestionType;
  scaleMin: number | null;
  scaleMax: number | null;
  displayOrder: number | null;
  isRequired: boolean;
  helpText: string | null;
}

export function validateQuestionBody(body: unknown): ValidationResult<QuestionBodyValue> {
  if (!isRecord(body)) {
    return { ok: false, error: "Request body is required" };
  }

  const questionText = readTextField(body, "questionText");
  const questionType = readTextField(body, "questionType");
  const helpText = readOptionalTextField(body, "helpText");
  const displayOrder = readOptionalPositiveIntegerField(body, "displayOrder");
  const scaleMin = readOptionalIntegerField(body, "scaleMin");
  const scaleMax = readOptionalIntegerField(body, "scaleMax");
  const isRequired = body.isRequired === undefined ? true : body.isRequired;

  if (!questionText) {
    return { ok: false, error: "Question text is required" };
  }

  if (questionText.length > questionTextMaxLength) {
    return { ok: false, error: `Question text must be ${questionTextMaxLength} characters or fewer` };
  }

  if (helpText && helpText.length > questionHelpTextMaxLength) {
    return { ok: false, error: `Help text must be ${questionHelpTextMaxLength} characters or fewer` };
  }

  if (!isSurveyQuestionType(questionType)) {
    return { ok: false, error: "Question type must be text, integer, single_select, multi_select, or scale" };
  }

  if (displayOrder === false) {
    return { ok: false, error: "Display order must be a positive integer" };
  }

  if (scaleMin === false || scaleMax === false) {
    return { ok: false, error: "Scale minimum and maximum must be whole numbers" };
  }

  if (questionType === "scale") {
    if (scaleMin === null || scaleMax === null) {
      return { ok: false, error: "Scale minimum and maximum are required" };
    }

    if (scaleMax <= scaleMin) {
      return { ok: false, error: "Scale maximum must be greater than scale minimum" };
    }

    if (scaleMax - scaleMin + 1 > scaleRangeMaxValueCount) {
      return { ok: false, error: `Scale range can include at most ${scaleRangeMaxValueCount} values` };
    }
  }

  if (typeof isRequired !== "boolean") {
    return { ok: false, error: "isRequired must be true or false" };
  }

  return {
    ok: true,
    value: {
      questionText,
      questionType,
      scaleMin: questionType === "scale" ? scaleMin : null,
      scaleMax: questionType === "scale" ? scaleMax : null,
      displayOrder,
      isRequired,
      helpText
    }
  };
}

export function validateAnswerOptionBody(body: unknown): ValidationResult<{
  optionText: string;
  displayOrder: number | null;
}> {
  if (!isRecord(body)) {
    return { ok: false, error: "Request body is required" };
  }

  const optionText = readTextField(body, "optionText");
  const displayOrder = readOptionalPositiveIntegerField(body, "displayOrder");

  if (!optionText) {
    return { ok: false, error: "Answer option text is required" };
  }

  if (optionText.length > answerOptionTextMaxLength) {
    return { ok: false, error: `Answer option text must be ${answerOptionTextMaxLength} characters or fewer` };
  }

  if (displayOrder === false) {
    return { ok: false, error: "Display order must be a positive integer" };
  }

  return {
    ok: true,
    value: {
      optionText,
      displayOrder
    }
  };
}

export function validateAnswerTagBody(body: unknown): ValidationResult<{
  tagKey: string;
  tagValue: string;
}> {
  if (!isRecord(body)) {
    return { ok: false, error: "Request body is required" };
  }

  const tagKey = readTextField(body, "tagKey");
  const tagValue = readTextField(body, "tagValue");

  if (!tagKey || !tagValue) {
    return { ok: false, error: "Tag key and value are required" };
  }

  if (tagKey.length > answerTagKeyMaxLength) {
    return { ok: false, error: `Tag key must be ${answerTagKeyMaxLength} characters or fewer` };
  }

  if (tagValue.length > answerTagValueMaxLength) {
    return { ok: false, error: `Tag value must be ${answerTagValueMaxLength} characters or fewer` };
  }

  return {
    ok: true,
    value: {
      tagKey,
      tagValue
    }
  };
}

export interface ConditionalRuleBodyValue {
  sourceQuestionId: number;
  sourceAnswerOptionId: number;
  targetQuestionId: number;
  skipTargetInNormalFlow: boolean;
}

export function validateConditionalRuleBody(
  body: unknown
): ValidationResult<ConditionalRuleBodyValue> {
  if (!isRecord(body)) {
    return { ok: false, error: "Request body is required" };
  }

  const sourceQuestionId = readPositiveIntegerField(body, "sourceQuestionId");
  const sourceAnswerOptionId = readPositiveIntegerField(body, "sourceAnswerOptionId");
  const targetQuestionId = readPositiveIntegerField(body, "targetQuestionId");
  const skipTargetInNormalFlowValue = body.skipTargetInNormalFlow;
  const conditionOperator = readTextField(body, "conditionOperator") || "equals";
  const actionType = readTextField(body, "actionType") || "JUMP_TO_QUESTION";

  if (!sourceQuestionId || !sourceAnswerOptionId || !targetQuestionId) {
    return {
      ok: false,
      error: "Source question, source answer option, and target question are required"
    };
  }

  if (conditionOperator !== "equals") {
    return { ok: false, error: "Condition operator must be equals" };
  }

  if (actionType !== "JUMP_TO_QUESTION") {
    return { ok: false, error: "Action type must be JUMP_TO_QUESTION" };
  }

  if (
    skipTargetInNormalFlowValue !== undefined &&
    typeof skipTargetInNormalFlowValue !== "boolean"
  ) {
    return { ok: false, error: "skipTargetInNormalFlow must be true or false" };
  }

  return {
    ok: true,
    value: {
      sourceQuestionId,
      sourceAnswerOptionId,
      targetQuestionId,
      skipTargetInNormalFlow:
        typeof skipTargetInNormalFlowValue === "boolean" ? skipTargetInNormalFlowValue : true
    }
  };
}

export function validateReorderBody(
  body: unknown,
  field: "questionIds" | "optionIds"
): ValidationResult<{ ids: number[] }> {
  if (!isRecord(body)) {
    return { ok: false, error: "Request body is required" };
  }

  const ids = readPositiveIntegerArray(body[field], field);

  if (!ids.ok) {
    return ids;
  }

  if (ids.value.length === 0) {
    return { ok: false, error: `${field} must include at least one id` };
  }

  return { ok: true, value: { ids: ids.value } };
}

export interface AnswerRequestValue {
  attemptId: number;
  questionId: number;
  answerText: string | null;
  answerInteger: number | null;
  selectedAnswerOptionIds: number[];
}

export interface NormalizedAnswerValue {
  answerText: string | null;
  answerInteger: number | null;
  selectedAnswerOptionIds: number[];
}

export function validateAnswerBody(body: unknown): ValidationResult<AnswerRequestValue> {
  if (!isRecord(body)) {
    return { ok: false, error: "Request body is required" };
  }

  const attemptId = readPositiveIntegerField(body, "attemptId");
  const questionId = readPositiveIntegerField(body, "questionId");

  if (!attemptId || !questionId) {
    return { ok: false, error: "Attempt id and question id are required" };
  }

  const answerTextValue = body.answerText;
  const answerIntegerValue = body.answerInteger;
  const selectedAnswerOptionIdsValue = body.selectedAnswerOptionIds;

  if (
    answerTextValue !== undefined &&
    answerTextValue !== null &&
    typeof answerTextValue !== "string"
  ) {
    return { ok: false, error: "answerText must be a string" };
  }

  if (
    answerIntegerValue !== undefined &&
    answerIntegerValue !== null &&
    !Number.isInteger(answerIntegerValue)
  ) {
    return { ok: false, error: "answerInteger must be an integer" };
  }

  const selectedAnswerOptionIds = readPositiveIntegerArray(selectedAnswerOptionIdsValue);

  if (!selectedAnswerOptionIds.ok) {
    return { ok: false, error: selectedAnswerOptionIds.error };
  }

  return {
    ok: true,
    value: {
      attemptId,
      questionId,
      answerText:
        typeof answerTextValue === "string" && answerTextValue.trim()
          ? answerTextValue.trim()
          : null,
      answerInteger:
        typeof answerIntegerValue === "number" && Number.isInteger(answerIntegerValue)
          ? answerIntegerValue
          : null,
      selectedAnswerOptionIds: selectedAnswerOptionIds.value
    }
  };
}

export function validateCompleteBody(body: unknown): ValidationResult<{ attemptId: number }> {
  if (!isRecord(body)) {
    return { ok: false, error: "Request body is required" };
  }

  const attemptId = readPositiveIntegerField(body, "attemptId");

  if (!attemptId) {
    return { ok: false, error: "Attempt id is required" };
  }

  return {
    ok: true,
    value: { attemptId }
  };
}

export function readPositiveIntegerParam(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function readPositiveIntegerField(body: Record<string, unknown>, field: string): number | null {
  const value = body[field];
  return Number.isSafeInteger(value) && typeof value === "number" && value > 0
    ? value
    : null;
}

export function readOptionalPositiveIntegerField(
  body: Record<string, unknown>,
  field: string
): number | null | false {
  const value = body[field];

  if (value === undefined || value === null) {
    return null;
  }

  return Number.isSafeInteger(value) && typeof value === "number" && value > 0
    ? value
    : false;
}

export function readOptionalIntegerField(
  body: Record<string, unknown>,
  field: string
): number | null | false {
  const value = body[field];

  if (value === undefined || value === null || value === "") {
    return null;
  }

  return Number.isSafeInteger(value) && typeof value === "number" ? value : false;
}

export function readPositiveIntegerArray(
  value: unknown,
  field = "selectedAnswerOptionIds"
): ValidationResult<number[]> {
  if (value === undefined || value === null) {
    return { ok: true, value: [] };
  }

  if (!Array.isArray(value)) {
    return { ok: false, error: `${field} must be an array` };
  }

  const ids = new Set<number>();

  for (const item of value) {
    if (!Number.isSafeInteger(item) || typeof item !== "number" || item <= 0) {
      return { ok: false, error: `${field} must contain positive integers` };
    }

    ids.add(item);
  }

  return { ok: true, value: [...ids] };
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function readTextField(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  return typeof value === "string" ? value.trim() : "";
}

export function readOptionalTextField(body: Record<string, unknown>, field: string): string | null {
  const value = body[field];

  if (value === null || value === undefined) {
    return null;
  }

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function isSurveyStatus(value: string): value is SurveyStatus {
  return value === "draft" || value === "published" || value === "retired";
}

export function isSurveyQuestionType(value: string): value is SurveyQuestionType {
  return (
    value === "text" ||
    value === "integer" ||
    value === "single_select" ||
    value === "multi_select" ||
    value === "scale"
  );
}

export function isSelectionQuestionType(value: SurveyQuestionType): boolean {
  return value === "single_select" || value === "multi_select";
}

export function sameIdSet(left: number[], right: number[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const rightIds = new Set(right);

  if (rightIds.size !== right.length) {
    return false;
  }

  return left.every((id) => rightIds.has(id));
}
