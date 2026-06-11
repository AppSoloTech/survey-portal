import type { SurveyStatus } from "@survey-portal/shared";
import pg from "pg";

import {
  buildScaleValues,
  deriveScaleRange,
  fetchAnswerOptionsForQuestion,
  fetchQuestionForSurvey,
  fetchSurveyRecord,
  hasContiguousScaleValues,
  mapAnswerOptionRecord,
  parseScaleOptionValue,
  type Queryable,
  type SurveyRecord
} from "./surveyRecords.js";
import {
  isSelectionQuestionType,
  sameIdSet,
  type ConditionalRuleBodyValue,
  type QuestionBodyValue,
  type ValidationResult
} from "./validation.js";

const { DatabaseError } = pg;

export async function validateReturnToDraft(
  queryable: Queryable,
  survey: SurveyRecord,
  nextStatus: SurveyStatus
): Promise<ValidationResult<undefined>> {
  if (nextStatus !== "draft" || survey.status === "draft") {
    return { ok: true, value: undefined };
  }

  if (await surveyHasAttempts(queryable, survey.id)) {
    return { ok: false, error: "Surveys with attempts cannot be returned to draft" };
  }

  return { ok: true, value: undefined };
}

export async function surveyHasAttempts(queryable: Queryable, surveyId: number): Promise<boolean> {
  const result = await queryable.query<{ exists: boolean }>(
    `select exists (
       select 1
       from survey_attempts
       where survey_id = $1
     ) as exists`,
    [surveyId]
  );

  return result.rows[0]?.exists ?? false;
}

export async function questionHasSavedResponses(
  queryable: Queryable,
  questionId: number
): Promise<boolean> {
  const result = await queryable.query<{ exists: boolean }>(
    `select exists (
       select 1
       from survey_response_answers
       where question_id = $1
     ) as exists`,
    [questionId]
  );

  return result.rows[0]?.exists ?? false;
}

export async function optionHasSavedSelections(queryable: Queryable, optionId: number): Promise<boolean> {
  const result = await queryable.query<{ exists: boolean }>(
    `select exists (
       select 1
       from survey_response_selected_options
       where answer_option_id = $1
     ) as exists`,
    [optionId]
  );

  return result.rows[0]?.exists ?? false;
}

export async function fetchNextQuestionDisplayOrder(
  queryable: Queryable,
  surveyId: number
): Promise<number> {
  const result = await queryable.query<{ next_display_order: number }>(
    `select coalesce(max(display_order), 0) + 1 as next_display_order
     from survey_questions
     where survey_id = $1`,
    [surveyId]
  );

  return result.rows[0]?.next_display_order ?? 1;
}

export async function fetchNextOptionDisplayOrder(
  queryable: Queryable,
  questionId: number
): Promise<number> {
  const result = await queryable.query<{ next_display_order: number }>(
    `select coalesce(max(display_order), 0) + 1 as next_display_order
     from answer_options
     where question_id = $1`,
    [questionId]
  );

  return result.rows[0]?.next_display_order ?? 1;
}

export async function shiftQuestionDisplayOrdersForInsert(
  queryable: Queryable,
  surveyId: number,
  displayOrder: number
): Promise<void> {
  const offsetResult = await queryable.query<{ offset: number }>(
    `select coalesce(max(display_order), 0) + 1000 as offset
     from survey_questions
     where survey_id = $1`,
    [surveyId]
  );
  const offset = offsetResult.rows[0]?.offset ?? 1000;

  await queryable.query(
    `update survey_questions
     set display_order = display_order + $2
     where survey_id = $1`,
    [surveyId, offset]
  );

  await queryable.query(
    `update survey_questions
     set display_order = case
           when display_order - $3 >= $2 then display_order - $3 + 1
           else display_order - $3
         end,
         updated_at = now()
     where survey_id = $1`,
    [surveyId, displayOrder, offset]
  );
}

export async function shiftOptionDisplayOrdersForInsert(
  queryable: Queryable,
  questionId: number,
  displayOrder: number
): Promise<void> {
  const offsetResult = await queryable.query<{ offset: number }>(
    `select coalesce(max(display_order), 0) + 1000 as offset
     from answer_options
     where question_id = $1`,
    [questionId]
  );
  const offset = offsetResult.rows[0]?.offset ?? 1000;

  await queryable.query(
    `update answer_options
     set display_order = display_order + $2
     where question_id = $1`,
    [questionId, offset]
  );

  await queryable.query(
    `update answer_options
     set display_order = case
           when display_order - $3 >= $2 then display_order - $3 + 1
           else display_order - $3
         end,
         updated_at = now()
     where question_id = $1`,
    [questionId, displayOrder, offset]
  );
}

export async function validateQuestionReorderIds(
  queryable: Queryable,
  surveyId: number,
  questionIds: number[]
): Promise<ValidationResult<undefined>> {
  const result = await queryable.query<{ id: number }>(
    `select id
     from survey_questions
     where survey_id = $1
     order by display_order, id`,
    [surveyId]
  );

  const existingIds = result.rows.map((row) => row.id);

  if (!sameIdSet(existingIds, questionIds)) {
    return { ok: false, error: "questionIds must include every question in this survey exactly once" };
  }

  return { ok: true, value: undefined };
}

export async function validateOptionReorderIds(
  queryable: Queryable,
  questionId: number,
  optionIds: number[]
): Promise<ValidationResult<undefined>> {
  const result = await queryable.query<{ id: number }>(
    `select id
     from answer_options
     where question_id = $1
     order by display_order, id`,
    [questionId]
  );

  const existingIds = result.rows.map((row) => row.id);

  if (!sameIdSet(existingIds, optionIds)) {
    return { ok: false, error: "optionIds must include every option for this question exactly once" };
  }

  return { ok: true, value: undefined };
}

export async function reorderQuestions(
  queryable: Queryable,
  surveyId: number,
  questionIds: number[]
): Promise<void> {
  const offsetResult = await queryable.query<{ offset: number }>(
    `select coalesce(max(display_order), 0) + 1000 as offset
     from survey_questions
     where survey_id = $1`,
    [surveyId]
  );
  const offset = offsetResult.rows[0]?.offset ?? 1000;

  await queryable.query(
    `update survey_questions
     set display_order = display_order + $2
     where survey_id = $1`,
    [surveyId, offset]
  );

  await applyDisplayOrderValues(queryable, {
    tableName: "survey_questions",
    parentColumn: "survey_id",
    parentId: surveyId,
    ids: questionIds
  });
}

export async function reorderOptions(
  queryable: Queryable,
  questionId: number,
  optionIds: number[]
): Promise<void> {
  const offsetResult = await queryable.query<{ offset: number }>(
    `select coalesce(max(display_order), 0) + 1000 as offset
     from answer_options
     where question_id = $1`,
    [questionId]
  );
  const offset = offsetResult.rows[0]?.offset ?? 1000;

  await queryable.query(
    `update answer_options
     set display_order = display_order + $2
     where question_id = $1`,
    [questionId, offset]
  );

  await applyDisplayOrderValues(queryable, {
    tableName: "answer_options",
    parentColumn: "question_id",
    parentId: questionId,
    ids: optionIds
  });
}

export async function syncScaleAnswerOptions(
  queryable: Queryable,
  questionId: number,
  range: { min: number | null; max: number | null }
): Promise<void> {
  if (range.min === null || range.max === null) {
    return;
  }

  const desiredValues = buildScaleValues(range.min, range.max);
  const desiredValueSet = new Set(desiredValues);
  const existingOptions = await fetchAnswerOptionsForQuestion(queryable, questionId);
  const keepOptionIdByValue = new Map<number, number>();
  const deleteIds: number[] = [];

  for (const option of existingOptions) {
    const value = parseScaleOptionValue(option.option_text);

    if (
      value !== null &&
      desiredValueSet.has(value) &&
      !keepOptionIdByValue.has(value)
    ) {
      keepOptionIdByValue.set(value, option.id);
    } else {
      deleteIds.push(option.id);
    }
  }

  if (deleteIds.length > 0) {
    await queryable.query(
      `delete from answer_options
       where question_id = $1
         and id = any($2::int[])`,
      [questionId, deleteIds]
    );
  }

  const offsetResult = await queryable.query<{ offset: number }>(
    `select coalesce(max(display_order), 0) + 1000 as offset
     from answer_options
     where question_id = $1`,
    [questionId]
  );
  const offset = offsetResult.rows[0]?.offset ?? 1000;

  await queryable.query(
    `update answer_options
     set display_order = display_order + $2
     where question_id = $1`,
    [questionId, offset]
  );

  for (const [index, value] of desiredValues.entries()) {
    const optionId = keepOptionIdByValue.get(value);
    const displayOrder = index + 1;

    if (optionId) {
      await queryable.query(
        `update answer_options
         set option_text = $3,
             display_order = $4,
             updated_at = now()
         where question_id = $1
           and id = $2`,
        [questionId, optionId, String(value), displayOrder]
      );
    } else {
      await queryable.query(
        `insert into answer_options (question_id, option_text, display_order)
         values ($1, $2, $3)`,
        [questionId, String(value), displayOrder]
      );
    }
  }
}

export async function hasScaleRangeChanged(
  queryable: Queryable,
  questionId: number,
  nextQuestion: QuestionBodyValue
): Promise<boolean> {
  const existingOptions = await fetchAnswerOptionsForQuestion(queryable, questionId);
  const existingRange = deriveScaleRange("scale", existingOptions.map(mapAnswerOptionRecord));

  if (!existingRange) {
    return false;
  }

  return (
    existingRange.min !== nextQuestion.scaleMin ||
    existingRange.max !== nextQuestion.scaleMax
  );
}

async function applyDisplayOrderValues(
  queryable: Queryable,
  options: {
    tableName: "survey_questions" | "answer_options";
    parentColumn: "survey_id" | "question_id";
    parentId: number;
    ids: number[];
  }
): Promise<void> {
  if (options.ids.length === 0) {
    return;
  }

  const valuesSql = options.ids
    .map((_, index) => {
      const idParam = index * 2 + 2;
      const orderParam = index * 2 + 3;
      return `($${idParam}::int, $${orderParam}::int)`;
    })
    .join(", ");
  const values = options.ids.flatMap((id, index) => [id, index + 1]);

  await queryable.query(
    `update ${options.tableName}
     set display_order = ordered.display_order,
         updated_at = now()
     from (values ${valuesSql}) as ordered(id, display_order)
     where ${options.tableName}.id = ordered.id
       and ${options.tableName}.${options.parentColumn} = $1`,
    [options.parentId, ...values]
  );
}

export async function validateSurveyCanPublish(
  queryable: Queryable,
  surveyId: number
): Promise<ValidationResult<undefined>> {
  const questionCountResult = await queryable.query<{ count: string }>(
    `select count(*)::text as count
     from survey_questions
     where survey_id = $1`,
    [surveyId]
  );

  if (Number(questionCountResult.rows[0]?.count ?? 0) === 0) {
    return { ok: false, error: "Add at least one question before publishing" };
  }

  const selectionWithoutOptionsResult = await queryable.query<{ id: number }>(
    `select survey_questions.id
       from survey_questions
       left join answer_options on answer_options.question_id = survey_questions.id
       where survey_questions.survey_id = $1
       and survey_questions.question_type in ('single_select', 'multi_select', 'scale')
     group by survey_questions.id
     having count(answer_options.id) = 0
     limit 1`,
    [surveyId]
  );

  if (selectionWithoutOptionsResult.rows[0]) {
    return { ok: false, error: "Selection and scale questions need answer options before publishing" };
  }

  const scaleQuestionsResult = await queryable.query<{ id: number }>(
    `select id
     from survey_questions
     where survey_id = $1
       and question_type = 'scale'`,
    [surveyId]
  );

  for (const question of scaleQuestionsResult.rows) {
    const options = await fetchAnswerOptionsForQuestion(queryable, question.id);

    if (!hasContiguousScaleValues(options.map((option) => option.option_text))) {
      return { ok: false, error: "Scale questions need a contiguous numeric range before publishing" };
    }
  }

  const invalidRuleResult = await queryable.query<{ id: number }>(
    `select conditional_logic_rules.id
     from conditional_logic_rules
     left join survey_questions source_question
       on source_question.id = conditional_logic_rules.source_question_id
      and source_question.survey_id = conditional_logic_rules.survey_id
     left join answer_options source_option
       on source_option.id = conditional_logic_rules.source_answer_option_id
      and source_option.question_id = conditional_logic_rules.source_question_id
     left join survey_questions target_question
       on target_question.id = conditional_logic_rules.target_question_id
      and target_question.survey_id = conditional_logic_rules.survey_id
     where conditional_logic_rules.survey_id = $1
       and (
         source_question.id is null
         or source_option.id is null
         or target_question.id is null
         or target_question.display_order <= source_question.display_order
         or source_question.question_type not in ('single_select', 'multi_select')
         or conditional_logic_rules.condition_operator <> 'equals'
         or conditional_logic_rules.action_type <> 'JUMP_TO_QUESTION'
       )
     limit 1`,
    [surveyId]
  );

  if (invalidRuleResult.rows[0]) {
    return { ok: false, error: "Conditional rules must reference valid questions and options in this survey" };
  }

  return { ok: true, value: undefined };
}

export async function validateConditionalRuleReferences(
  queryable: Queryable,
  surveyId: number,
  value: ConditionalRuleBodyValue
): Promise<ValidationResult<undefined>> {
  const survey = await fetchSurveyRecord(queryable, surveyId);

  if (!survey) {
    return { ok: false, error: "Survey not found" };
  }

  const sourceQuestion = await fetchQuestionForSurvey(
    queryable,
    value.sourceQuestionId,
    surveyId
  );

  if (!sourceQuestion) {
    return { ok: false, error: "Source question must belong to this survey" };
  }

  if (!isSelectionQuestionType(sourceQuestion.question_type)) {
    return { ok: false, error: "Source question must be single_select or multi_select" };
  }

  const optionResult = await queryable.query<{ id: number }>(
    `select id
     from answer_options
     where id = $1
       and question_id = $2`,
    [value.sourceAnswerOptionId, sourceQuestion.id]
  );

  if (!optionResult.rows[0]) {
    return { ok: false, error: "Source answer option must belong to the source question" };
  }

  const targetQuestion = await fetchQuestionForSurvey(
    queryable,
    value.targetQuestionId,
    surveyId
  );

  if (!targetQuestion) {
    return { ok: false, error: "Target question must belong to this survey" };
  }

  if (targetQuestion.display_order <= sourceQuestion.display_order) {
    return { ok: false, error: "Target question must come after the source question" };
  }

  return { ok: true, value: undefined };
}

export function isAnswerTagUniqueViolation(error: unknown): boolean {
  return (
    error instanceof DatabaseError &&
    error.code === "23505" &&
    error.constraint === "answer_tags_key_value_unique"
  );
}
