import type { SurveyQuestionType, SurveyStatus } from "@survey-portal/shared";

const surveyTitleMaxLength = 180;
const surveyDescriptionMaxLength = 1200;
const questionTextMaxLength = 500;
const questionHelpTextMaxLength = 500;
const answerOptionTextMaxLength = 240;
const otherAnswerTextMaxLength = answerOptionTextMaxLength;
const answerTagKeyMaxLength = 80;
const answerTagValueMaxLength = 180;
const scaleRangeMaxValueCount = 21;
const categoryNameMaxLength = 120;
const surveyPageTitleMaxLength = 180;
const surveyPageDescriptionMaxLength = 600;
const anonymousContactEmailMaxLength = 320;

export function validateSurveyBody(body: unknown): ValidationResult<{
  title: string;
  description: string | null;
  status: SurveyStatus;
  categoryId: number | null;
}> {
  if (!isRecord(body)) {
    return { ok: false, error: "Request body is required" };
  }

  const title = readTextField(body, "title");
  const description = readOptionalTextField(body, "description");
  const status = readTextField(body, "status") || "draft";
  const categoryId = readOptionalPositiveIntegerField(body, "categoryId");

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

  if (categoryId === false) {
    return { ok: false, error: "categoryId must be a positive integer" };
  }

  return {
    ok: true,
    value: {
      title,
      description,
      status,
      categoryId
    }
  };
}

export function validateCategoryBody(body: unknown): ValidationResult<{ name: string }> {
  if (!isRecord(body)) {
    return { ok: false, error: "Request body is required" };
  }

  const name = readTextField(body, "name");

  if (!name) {
    return { ok: false, error: "Category name is required" };
  }

  if (name.length > categoryNameMaxLength) {
    return { ok: false, error: `Category name must be ${categoryNameMaxLength} characters or fewer` };
  }

  return { ok: true, value: { name } };
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
  allowOther: boolean;
  scaleMin: number | null;
  scaleMax: number | null;
  pageId: number | null;
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
  const pageId = readOptionalPositiveIntegerField(body, "pageId");
  const scaleMin = readOptionalIntegerField(body, "scaleMin");
  const scaleMax = readOptionalIntegerField(body, "scaleMax");
  const isRequired = body.isRequired === undefined ? true : body.isRequired;
  const allowOther = body.allowOther === undefined ? false : body.allowOther;

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

  if (pageId === false) {
    return { ok: false, error: "pageId must be a positive integer" };
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

  if (typeof allowOther !== "boolean") {
    return { ok: false, error: "allowOther must be true or false" };
  }

  if (allowOther && !isOtherSupportedQuestionType(questionType)) {
    return { ok: false, error: "allowOther is only supported for single_select and multi_select questions" };
  }

  if (typeof isRequired !== "boolean") {
    return { ok: false, error: "isRequired must be true or false" };
  }

  return {
    ok: true,
    value: {
      questionText,
      questionType,
      allowOther,
      scaleMin: questionType === "scale" ? scaleMin : null,
      scaleMax: questionType === "scale" ? scaleMax : null,
      pageId,
      displayOrder,
      isRequired,
      helpText
    }
  };
}

export function validateSurveyPageBody(body: unknown): ValidationResult<{
  title: string;
  description: string | null;
  displayOrder: number | null;
}> {
  if (!isRecord(body)) {
    return { ok: false, error: "Request body is required" };
  }

  const title = readTextField(body, "title");
  const description = readOptionalTextField(body, "description");
  const displayOrder = readOptionalPositiveIntegerField(body, "displayOrder");

  if (!title) {
    return { ok: false, error: "Page title is required" };
  }

  if (title.length > surveyPageTitleMaxLength) {
    return { ok: false, error: `Page title must be ${surveyPageTitleMaxLength} characters or fewer` };
  }

  if (description && description.length > surveyPageDescriptionMaxLength) {
    return {
      ok: false,
      error: `Page description must be ${surveyPageDescriptionMaxLength} characters or fewer`
    };
  }

  if (displayOrder === false) {
    return { ok: false, error: "Display order must be a positive integer" };
  }

  return { ok: true, value: { title, description, displayOrder } };
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

// Body for hidden value tags on integer/text questions. Bounds are only
// meaningful for integer questions; the route layer enforces the per-type
// shape since it knows the question.
export function validateQuestionValueTagBody(body: unknown): ValidationResult<{
  tagKey: string;
  tagValue: string;
  integerMin: number | null;
  integerMax: number | null;
}> {
  const tagValidation = validateAnswerTagBody(body);

  if (!tagValidation.ok) {
    return tagValidation;
  }

  const record = body as Record<string, unknown>;
  const integerMin = readOptionalIntegerField(record, "integerMin");
  const integerMax = readOptionalIntegerField(record, "integerMax");

  if (integerMin === false || integerMax === false) {
    return { ok: false, error: "integerMin and integerMax must be whole numbers" };
  }

  if (integerMin !== null && integerMax !== null && integerMin > integerMax) {
    return { ok: false, error: "integerMin must be less than or equal to integerMax" };
  }

  return {
    ok: true,
    value: {
      tagKey: tagValidation.value.tagKey,
      tagValue: tagValidation.value.tagValue,
      integerMin,
      integerMax
    }
  };
}

// Optional from/to query parameters for reporting endpoints. Both are
// inclusive calendar dates in YYYY-MM-DD form.
export function validateAttemptDateRange(query: {
  from?: unknown;
  to?: unknown;
}): ValidationResult<{ from?: string; to?: string }> {
  const range: { from?: string; to?: string } = {};

  for (const field of ["from", "to"] as const) {
    const value = query[field];

    if (value === undefined || value === "") {
      continue;
    }

    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return { ok: false, error: `${field} must be a date in YYYY-MM-DD format` };
    }

    const parsed = new Date(`${value}T00:00:00Z`);

    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      return { ok: false, error: `${field} must be a valid calendar date` };
    }

    range[field] = value;
  }

  if (range.from && range.to && range.from > range.to) {
    return { ok: false, error: "from must be on or before to" };
  }

  return { ok: true, value: range };
}

export type ConditionalRuleActionType =
  | "JUMP_TO_QUESTION"
  | "HIDE_QUESTION"
  | "JUMP_TO_PAGE"
  | "HIDE_PAGE";
export type ConditionalRuleConditionOperator = "equals" | "is_blank";

export interface ConditionalRuleBodyValue {
  sourcePageId: number | null;
  sourceQuestionId: number;
  sourceAnswerOptionId: number | null;
  targetQuestionId: number | null;
  targetPageId: number | null;
  conditionOperator: ConditionalRuleConditionOperator;
  actionType: ConditionalRuleActionType;
  skipTargetInNormalFlow: boolean;
  advanceOnTrigger: boolean;
}

export function validateConditionalRuleBody(
  body: unknown
): ValidationResult<ConditionalRuleBodyValue> {
  if (!isRecord(body)) {
    return { ok: false, error: "Request body is required" };
  }

  const sourceQuestionId = readPositiveIntegerField(body, "sourceQuestionId");
  const sourcePageId = readOptionalPositiveIntegerField(body, "sourcePageId");
  const sourceAnswerOptionId = readPositiveIntegerField(body, "sourceAnswerOptionId");
  const targetQuestionId = readOptionalPositiveIntegerField(body, "targetQuestionId");
  const targetPageId = readOptionalPositiveIntegerField(body, "targetPageId");
  const skipTargetInNormalFlowValue = body.skipTargetInNormalFlow;
  const advanceOnTriggerValue = body.advanceOnTrigger;
  const conditionOperator = readTextField(body, "conditionOperator") || "equals";
  const actionType = readTextField(body, "actionType") || "JUMP_TO_QUESTION";

  if (!sourceQuestionId) {
    return {
      ok: false,
      error: "Source question is required"
    };
  }

  if (sourcePageId === false) {
    return { ok: false, error: "sourcePageId must be a positive integer" };
  }

  if (targetQuestionId === false) {
    return { ok: false, error: "targetQuestionId must be a positive integer" };
  }

  if (targetPageId === false) {
    return { ok: false, error: "targetPageId must be a positive integer" };
  }

  if (conditionOperator !== "equals" && conditionOperator !== "is_blank") {
    return { ok: false, error: "Condition operator must be equals or is_blank" };
  }

  if (
    actionType !== "JUMP_TO_QUESTION" &&
    actionType !== "HIDE_QUESTION" &&
    actionType !== "JUMP_TO_PAGE" &&
    actionType !== "HIDE_PAGE"
  ) {
    return {
      ok: false,
      error: "Action type must be JUMP_TO_QUESTION, JUMP_TO_PAGE, HIDE_QUESTION, or HIDE_PAGE"
    };
  }

  if (conditionOperator === "equals" && !sourceAnswerOptionId) {
    return {
      ok: false,
      error: "Source answer option is required for equals rules"
    };
  }

  if (conditionOperator === "is_blank") {
    if (sourceAnswerOptionId) {
      return {
        ok: false,
        error: "Blank text rules cannot include a source answer option"
      };
    }

    if (actionType !== "HIDE_QUESTION" && actionType !== "HIDE_PAGE") {
      return { ok: false, error: "Blank text rules can only skip questions or pages" };
    }
  }

  if (actionType === "JUMP_TO_PAGE" || actionType === "HIDE_PAGE") {
    if (targetPageId === null) {
      return { ok: false, error: "Target page is required for page rules" };
    }

    if (targetQuestionId !== null) {
      return { ok: false, error: "Page rules cannot include a target question" };
    }
  } else if (targetQuestionId === null) {
    return { ok: false, error: "Target question is required" };
  }

  if (
    skipTargetInNormalFlowValue !== undefined &&
    typeof skipTargetInNormalFlowValue !== "boolean"
  ) {
    return { ok: false, error: "skipTargetInNormalFlow must be true or false" };
  }

  if (advanceOnTriggerValue !== undefined && typeof advanceOnTriggerValue !== "boolean") {
    return { ok: false, error: "advanceOnTrigger must be true or false" };
  }

  return {
    ok: true,
    value: {
      sourceQuestionId,
      sourcePageId,
      sourceAnswerOptionId: conditionOperator === "is_blank" ? null : sourceAnswerOptionId,
      targetPageId:
        actionType === "JUMP_TO_PAGE" || actionType === "HIDE_PAGE" ? targetPageId : null,
      targetQuestionId,
      conditionOperator,
      actionType,
      // HIDE_QUESTION/HIDE_PAGE targets must stay in the normal flow — they are
      // only skipped per attempt when the trigger answer is selected. The static
      // skip flag is a jump-rule concept, so it is forced off for skips.
      skipTargetInNormalFlow:
        actionType === "HIDE_QUESTION" || actionType === "HIDE_PAGE"
          ? false
          : typeof skipTargetInNormalFlowValue === "boolean"
            ? skipTargetInNormalFlowValue
            : true,
      // "Advance on trigger" only applies to HIDE_PAGE; it is meaningless (and
      // forced off) for every other action type.
      advanceOnTrigger:
        actionType === "HIDE_PAGE" && advanceOnTriggerValue === true
    }
  };
}

export function validateReorderBody(
  body: unknown,
  field: "pageIds" | "questionIds" | "optionIds"
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
  isOtherSelected: boolean;
  otherText: string | null;
}

export interface PageAnswerRequestValue {
  attemptId: number;
  answers: AnswerRequestValue[];
}

export interface NormalizedAnswerValue {
  answerText: string | null;
  answerInteger: number | null;
  selectedAnswerOptionIds: number[];
  otherText: string | null;
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
  const isOtherSelectedValue = body.isOtherSelected;
  const otherTextValue = body.otherText;

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

  if (
    isOtherSelectedValue !== undefined &&
    typeof isOtherSelectedValue !== "boolean"
  ) {
    return { ok: false, error: "isOtherSelected must be true or false" };
  }

  if (
    otherTextValue !== undefined &&
    otherTextValue !== null &&
    typeof otherTextValue !== "string"
  ) {
    return { ok: false, error: "otherText must be a string" };
  }

  const otherText =
    typeof otherTextValue === "string" && otherTextValue.trim()
      ? otherTextValue.trim()
      : null;

  if (otherText && otherText.length > otherAnswerTextMaxLength) {
    return { ok: false, error: `Other text must be ${otherAnswerTextMaxLength} characters or fewer` };
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
      selectedAnswerOptionIds: selectedAnswerOptionIds.value,
      isOtherSelected: isOtherSelectedValue === true || otherText !== null,
      otherText
    }
  };
}

export function validatePageAnswerBody(body: unknown): ValidationResult<PageAnswerRequestValue> {
  if (!isRecord(body)) {
    return { ok: false, error: "Request body is required" };
  }

  const attemptId = readPositiveIntegerField(body, "attemptId");

  if (!attemptId) {
    return { ok: false, error: "Attempt id is required" };
  }

  if (!Array.isArray(body.answers)) {
    return { ok: false, error: "answers must be an array" };
  }

  const answers: AnswerRequestValue[] = [];
  const seenQuestionIds = new Set<number>();

  for (const answer of body.answers) {
    const validation = validateAnswerBody({ ...(isRecord(answer) ? answer : {}), attemptId });

    if (!validation.ok) {
      return validation;
    }

    if (seenQuestionIds.has(validation.value.questionId)) {
      return { ok: false, error: "Each question can be answered only once per page submit" };
    }

    seenQuestionIds.add(validation.value.questionId);
    answers.push(validation.value);
  }

  return { ok: true, value: { attemptId, answers } };
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

export function validateAnonymousContactEmailBody(
  body: unknown
): ValidationResult<{ attemptId: number; email: string }> {
  if (!isRecord(body)) {
    return { ok: false, error: "Request body is required" };
  }

  const attemptId = readPositiveIntegerField(body, "attemptId");
  const email = readTextField(body, "email").toLowerCase();

  if (!attemptId) {
    return { ok: false, error: "Attempt id is required" };
  }

  if (!email) {
    return { ok: false, error: "Email is required" };
  }

  if (email.length > anonymousContactEmailMaxLength) {
    return {
      ok: false,
      error: `Email must be ${anonymousContactEmailMaxLength} characters or fewer`
    };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Email must be a valid address" };
  }

  return { ok: true, value: { attemptId, email } };
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

export function isOtherSupportedQuestionType(value: SurveyQuestionType): boolean {
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
