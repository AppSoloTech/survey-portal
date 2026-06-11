import type { PoolClient } from "pg";
import type {
  AnswerOption,
  AnswerTag,
  ConditionalLogicActionType,
  ConditionalLogicConditionOperator,
  ConditionalLogicRule,
  Survey,
  SurveyAttempt,
  SurveyAttemptStatus,
  SurveyQuestion,
  SurveyQuestionType,
  SurveyResponseAnswer,
  SurveyStatus
} from "@survey-portal/shared";

export interface SurveyRecord {
  id: number;
  title: string;
  description: string | null;
  status: SurveyStatus;
  created_by_user_id: number | null;
  created_at: Date;
  updated_at: Date;
  published_at: Date | null;
  retired_at: Date | null;
}

export interface SurveyQuestionRecord {
  id: number;
  survey_id: number;
  question_text: string;
  question_type: SurveyQuestionType;
  display_order: number;
  is_required: boolean;
  help_text: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface AnswerOptionRecord {
  id: number;
  question_id: number;
  option_text: string;
  display_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface AnswerTagRecord {
  id: number;
  answer_option_id: number;
  tag_key: string;
  tag_value: string;
  created_at: Date;
  updated_at: Date;
}

export interface ConditionalLogicRuleRecord {
  id: number;
  survey_id: number;
  source_question_id: number;
  source_answer_option_id: number;
  condition_operator: ConditionalLogicConditionOperator;
  action_type: ConditionalLogicActionType;
  target_question_id: number | null;
  target_page_id: number | null;
  skip_target_in_normal_flow: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface SurveyAttemptRecord {
  id: number;
  survey_id: number;
  user_id: number;
  status: SurveyAttemptStatus;
  started_at: Date | null;
  last_activity_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface SurveyResponseAnswerRecord {
  id: number;
  survey_attempt_id: number;
  question_id: number;
  answer_text: string | null;
  answer_integer: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface SelectedOptionRecord {
  survey_response_answer_id: number;
  answer_option_id: number;
}

export interface Queryable {
  query: PoolClient["query"];
}

export function mapSurveyRecord(
  record: SurveyRecord,
  questions: SurveyQuestion[],
  conditionalLogicRules: ConditionalLogicRule[]
): Survey {
  return {
    id: record.id,
    title: record.title,
    description: record.description,
    status: record.status,
    createdByUserId: record.created_by_user_id,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString(),
    publishedAt: record.published_at?.toISOString() ?? null,
    retiredAt: record.retired_at?.toISOString() ?? null,
    questions,
    conditionalLogicRules
  };
}

export function mapSurveyQuestionRecord(
  record: SurveyQuestionRecord,
  answerOptions: AnswerOption[]
): SurveyQuestion {
  const scaleRange = deriveScaleRange(record.question_type, answerOptions);

  return {
    id: record.id,
    surveyId: record.survey_id,
    questionText: record.question_text,
    questionType: record.question_type,
    scaleMin: scaleRange?.min ?? null,
    scaleMax: scaleRange?.max ?? null,
    displayOrder: record.display_order,
    isRequired: record.is_required,
    helpText: record.help_text,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString(),
    answerOptions
  };
}

export function mapAnswerOptionRecord(record: AnswerOptionRecord): AnswerOption {
  return {
    id: record.id,
    questionId: record.question_id,
    optionText: record.option_text,
    displayOrder: record.display_order,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString()
  };
}

export function deriveScaleRange(
  questionType: SurveyQuestionType,
  answerOptions: AnswerOption[]
): { min: number; max: number } | null {
  if (questionType !== "scale" || answerOptions.length === 0) {
    return null;
  }

  const values = answerOptions
    .map((option) => parseScaleOptionValue(option.optionText))
    .filter((value): value is number => value !== null);

  if (values.length === 0) {
    return null;
  }

  return {
    min: Math.min(...values),
    max: Math.max(...values)
  };
}

export function mapAnswerTagRecord(record: AnswerTagRecord): AnswerTag {
  return {
    id: record.id,
    answerOptionId: record.answer_option_id,
    tagKey: record.tag_key,
    tagValue: record.tag_value,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString()
  };
}

export function mapConditionalLogicRuleRecord(record: ConditionalLogicRuleRecord): ConditionalLogicRule {
  return {
    id: record.id,
    surveyId: record.survey_id,
    sourceQuestionId: record.source_question_id,
    sourceAnswerOptionId: record.source_answer_option_id,
    conditionOperator: record.condition_operator,
    actionType: record.action_type,
    targetQuestionId: record.target_question_id,
    targetPageId: record.target_page_id,
    skipTargetInNormalFlow: record.skip_target_in_normal_flow,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString()
  };
}

export async function fetchSurveyRecord(
  queryable: Queryable,
  surveyId: number
): Promise<SurveyRecord | null> {
  const result = await queryable.query<SurveyRecord>(
    `select
       id,
       title,
       description,
       status,
       created_by_user_id,
       created_at,
       updated_at,
       published_at,
       retired_at
     from surveys
     where id = $1`,
    [surveyId]
  );

  return result.rows[0] ?? null;
}

export async function fetchOptionForQuestion(
  queryable: Queryable,
  optionId: number,
  questionId: number,
  surveyId: number
): Promise<AnswerOptionRecord | null> {
  const result = await queryable.query<AnswerOptionRecord>(
    `select
       answer_options.id,
       answer_options.question_id,
       answer_options.option_text,
       answer_options.display_order,
       answer_options.created_at,
       answer_options.updated_at
     from answer_options
     join survey_questions on survey_questions.id = answer_options.question_id
     where answer_options.id = $1
       and answer_options.question_id = $2
       and survey_questions.survey_id = $3`,
    [optionId, questionId, surveyId]
  );

  return result.rows[0] ?? null;
}

export async function fetchAnswerOptionsForQuestion(
  queryable: Queryable,
  questionId: number
): Promise<AnswerOptionRecord[]> {
  const result = await queryable.query<AnswerOptionRecord>(
    `select
       id,
       question_id,
       option_text,
       display_order,
       created_at,
       updated_at
     from answer_options
     where question_id = $1
     order by display_order, id`,
    [questionId]
  );

  return result.rows;
}

export async function deleteAnswerOptionsForQuestion(
  queryable: Queryable,
  questionId: number
): Promise<void> {
  await queryable.query(
    `delete from answer_options
     where question_id = $1`,
    [questionId]
  );
}

export async function fetchTagForOption(
  queryable: Queryable,
  tagId: number,
  optionId: number,
  questionId: number,
  surveyId: number
): Promise<AnswerTagRecord | null> {
  const result = await queryable.query<AnswerTagRecord>(
    `select
       answer_tags.id,
       answer_tags.answer_option_id,
       answer_tags.tag_key,
       answer_tags.tag_value,
       answer_tags.created_at,
       answer_tags.updated_at
     from answer_tags
     join answer_options on answer_options.id = answer_tags.answer_option_id
     join survey_questions on survey_questions.id = answer_options.question_id
     where answer_tags.id = $1
       and answer_options.id = $2
       and survey_questions.id = $3
       and survey_questions.survey_id = $4`,
    [tagId, optionId, questionId, surveyId]
  );

  return result.rows[0] ?? null;
}

export async function fetchConditionalRuleForSurvey(
  queryable: Queryable,
  ruleId: number,
  surveyId: number
): Promise<ConditionalLogicRuleRecord | null> {
  const result = await queryable.query<ConditionalLogicRuleRecord>(
    `select
       id,
       survey_id,
       source_question_id,
       source_answer_option_id,
       condition_operator,
       action_type,
       target_question_id,
       target_page_id,
       created_at,
       updated_at
     from conditional_logic_rules
     where id = $1
       and survey_id = $2`,
    [ruleId, surveyId]
  );

  return result.rows[0] ?? null;
}

export async function fetchQuestionForSurvey(
  queryable: Queryable,
  questionId: number,
  surveyId: number
): Promise<SurveyQuestionRecord | null> {
  const result = await queryable.query<SurveyQuestionRecord>(
    `select
       id,
       survey_id,
       question_text,
       question_type,
       display_order,
       is_required,
       help_text,
       created_at,
       updated_at
     from survey_questions
     where id = $1
       and survey_id = $2`,
    [questionId, surveyId]
  );

  return result.rows[0] ?? null;
}

export function buildScaleValues(min: number, max: number): number[] {
  return Array.from({ length: max - min + 1 }, (_, index) => min + index);
}

export function parseScaleOptionValue(value: string): number | null {
  if (!/^-?\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function hasContiguousScaleValues(optionTexts: string[]): boolean {
  const values = optionTexts.map(parseScaleOptionValue);

  if (values.some((value) => value === null)) {
    return false;
  }

  const numericValues = values as number[];
  const uniqueValues = new Set(numericValues);

  if (uniqueValues.size !== numericValues.length) {
    return false;
  }

  const min = Math.min(...numericValues);
  const max = Math.max(...numericValues);

  return numericValues.length === max - min + 1;
}

export function mapSurveyAttemptRecord(
  record: SurveyAttemptRecord,
  responses: SurveyResponseAnswer[]
): SurveyAttempt {
  return {
    id: record.id,
    surveyId: record.survey_id,
    userId: record.user_id,
    status: record.status,
    startedAt: record.started_at?.toISOString() ?? null,
    lastActivityAt: record.last_activity_at?.toISOString() ?? null,
    completedAt: record.completed_at?.toISOString() ?? null,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString(),
    responses
  };
}

export function mapSurveyResponseAnswerRecord(
  record: SurveyResponseAnswerRecord,
  selectedAnswerOptionIds: number[]
): SurveyResponseAnswer {
  return {
    id: record.id,
    surveyAttemptId: record.survey_attempt_id,
    questionId: record.question_id,
    answerText: record.answer_text,
    answerInteger: record.answer_integer,
    selectedAnswerOptionIds,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString()
  };
}
