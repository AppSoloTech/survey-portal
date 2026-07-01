import type { SurveyStatus } from "@survey-portal/shared";
import pg from "pg";

import {
  buildScaleValues,
  fetchAnswerOptionsForQuestion,
  fetchQuestionForSurvey,
  fetchSurveyRecord,
  hasContiguousScaleValues,
  parseScaleOptionValue,
  type Queryable,
  type SurveyRecord
} from "./surveyRecords.js";
import {
  isSelectionQuestionType,
  sameIdSet,
  type ConditionalRuleBodyValue,
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
  pageId: number
): Promise<number> {
  const result = await queryable.query<{ next_display_order: number }>(
    `select coalesce(max(display_order), 0) + 1 as next_display_order
     from survey_questions
     where page_id = $1`,
    [pageId]
  );

  return result.rows[0]?.next_display_order ?? 1;
}

export async function fetchNextPageDisplayOrder(
  queryable: Queryable,
  surveyId: number
): Promise<number> {
  const result = await queryable.query<{ next_display_order: number }>(
    `select coalesce(max(display_order), 0) + 1 as next_display_order
     from survey_pages
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
  pageId: number,
  displayOrder: number
): Promise<void> {
  const offsetResult = await queryable.query<{ offset: number }>(
    `select coalesce(max(display_order), 0) + 1000 as offset
     from survey_questions
     where page_id = $1`,
    [pageId]
  );
  const offset = offsetResult.rows[0]?.offset ?? 1000;

  await queryable.query(
    `update survey_questions
     set display_order = display_order + $2
     where page_id = $1`,
    [pageId, offset]
  );

  await queryable.query(
    `update survey_questions
     set display_order = case
           when display_order - $3 >= $2 then display_order - $3 + 1
           else display_order - $3
         end,
         updated_at = now()
     where page_id = $1`,
    [pageId, displayOrder, offset]
  );
}

export async function shiftPageDisplayOrdersForInsert(
  queryable: Queryable,
  surveyId: number,
  displayOrder: number
): Promise<void> {
  const offsetResult = await queryable.query<{ offset: number }>(
    `select coalesce(max(display_order), 0) + 1000 as offset
     from survey_pages
     where survey_id = $1`,
    [surveyId]
  );
  const offset = offsetResult.rows[0]?.offset ?? 1000;

  await queryable.query(
    `update survey_pages
     set display_order = display_order + $2
     where survey_id = $1`,
    [surveyId, offset]
  );

  await queryable.query(
    `update survey_pages
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
  pageId: number,
  questionIds: number[]
): Promise<ValidationResult<undefined>> {
  const result = await queryable.query<{ id: number }>(
    `select id
     from survey_questions
     where page_id = $1
     order by display_order, id`,
    [pageId]
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

export async function validatePageReorderIds(
  queryable: Queryable,
  surveyId: number,
  pageIds: number[]
): Promise<ValidationResult<undefined>> {
  const result = await queryable.query<{ id: number }>(
    `select id
     from survey_pages
     where survey_id = $1
     order by display_order, id`,
    [surveyId]
  );
  const existingIds = result.rows.map((row) => row.id);

  if (!sameIdSet(existingIds, pageIds)) {
    return { ok: false, error: "pageIds must include every page in this survey exactly once" };
  }

  return { ok: true, value: undefined };
}

export async function reorderQuestions(
  queryable: Queryable,
  pageId: number,
  questionIds: number[]
): Promise<void> {
  const offsetResult = await queryable.query<{ offset: number }>(
    `select coalesce(max(display_order), 0) + 1000 as offset
     from survey_questions
     where page_id = $1`,
    [pageId]
  );
  const offset = offsetResult.rows[0]?.offset ?? 1000;

  await queryable.query(
    `update survey_questions
     set display_order = display_order + $2
     where page_id = $1`,
    [pageId, offset]
  );

  await applyDisplayOrderValues(queryable, {
    tableName: "survey_questions",
    parentColumn: "page_id",
    parentId: pageId,
    ids: questionIds
  });
}

export async function reorderPages(
  queryable: Queryable,
  surveyId: number,
  pageIds: number[]
): Promise<void> {
  const offsetResult = await queryable.query<{ offset: number }>(
    `select coalesce(max(display_order), 0) + 1000 as offset
     from survey_pages
     where survey_id = $1`,
    [surveyId]
  );
  const offset = offsetResult.rows[0]?.offset ?? 1000;

  await queryable.query(
    `update survey_pages
     set display_order = display_order + $2
     where survey_id = $1`,
    [surveyId, offset]
  );

  await applyDisplayOrderValues(queryable, {
    tableName: "survey_pages",
    parentColumn: "survey_id",
    parentId: surveyId,
    ids: pageIds
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

async function applyDisplayOrderValues(
  queryable: Queryable,
  options: {
    tableName: "survey_pages" | "survey_questions" | "answer_options";
    parentColumn: "survey_id" | "page_id" | "question_id";
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
     left join survey_pages source_page
       on source_page.id = coalesce(conditional_logic_rules.source_page_id, source_question.page_id)
      and source_page.survey_id = conditional_logic_rules.survey_id
       left join answer_options source_option
       on source_option.id = conditional_logic_rules.source_answer_option_id
      and source_option.question_id = conditional_logic_rules.source_question_id
     left join survey_questions target_question
       on target_question.id = conditional_logic_rules.target_question_id
      and target_question.survey_id = conditional_logic_rules.survey_id
     left join survey_pages target_question_page
       on target_question_page.id = target_question.page_id
      and target_question_page.survey_id = conditional_logic_rules.survey_id
     left join survey_pages target_page
       on target_page.id = conditional_logic_rules.target_page_id
      and target_page.survey_id = conditional_logic_rules.survey_id
     where conditional_logic_rules.survey_id = $1
       and (
         source_question.id is null
         or source_page.id is null
         or (
           conditional_logic_rules.action_type in ('JUMP_TO_QUESTION', 'HIDE_QUESTION')
           and (
             target_question.id is null
             or target_question_page.id is null
             or target_question_page.display_order < source_page.display_order
             or (
               target_question_page.display_order = source_page.display_order
               and target_question.display_order <= source_question.display_order
             )
           )
         )
         or (
           conditional_logic_rules.action_type in ('JUMP_TO_PAGE', 'HIDE_PAGE')
           and (
             target_page.id is null
             or target_page.display_order <= source_page.display_order
           )
         )
         or conditional_logic_rules.condition_operator not in ('equals', 'is_blank')
         or (
           conditional_logic_rules.condition_operator = 'equals'
           and (
             source_option.id is null
             or source_question.question_type not in ('single_select', 'multi_select')
           )
         )
         or (
           conditional_logic_rules.condition_operator = 'is_blank'
           and (
             conditional_logic_rules.source_answer_option_id is not null
             or source_question.question_type <> 'text'
             or conditional_logic_rules.action_type not in ('HIDE_QUESTION', 'HIDE_PAGE')
           )
         )
         or conditional_logic_rules.action_type not in ('JUMP_TO_QUESTION', 'HIDE_QUESTION', 'JUMP_TO_PAGE', 'HIDE_PAGE')
         or (
           conditional_logic_rules.action_type in ('HIDE_QUESTION', 'HIDE_PAGE')
           and conditional_logic_rules.skip_target_in_normal_flow
         )
       )
     limit 1`,
    [surveyId]
  );

  if (invalidRuleResult.rows[0]) {
    return { ok: false, error: "Conditional rules must reference valid questions and options in this survey" };
  }

  return { ok: true, value: undefined };
}

export async function fetchPageForSurvey(
  queryable: Queryable,
  pageId: number,
  surveyId: number
): Promise<{ id: number; display_order: number } | null> {
  const result = await queryable.query<{ id: number; display_order: number }>(
    `select id, display_order
     from survey_pages
     where id = $1
       and survey_id = $2`,
    [pageId, surveyId]
  );

  return result.rows[0] ?? null;
}

export async function fetchFirstPageForSurvey(
  queryable: Queryable,
  surveyId: number
): Promise<{ id: number; display_order: number } | null> {
  const result = await queryable.query<{ id: number; display_order: number }>(
    `select id, display_order
     from survey_pages
     where survey_id = $1
     order by display_order, id
     limit 1`,
    [surveyId]
  );

  return result.rows[0] ?? null;
}

export async function pageHasQuestions(queryable: Queryable, pageId: number): Promise<boolean> {
  const result = await queryable.query<{ exists: boolean }>(
    `select exists (
       select 1
       from survey_questions
       where page_id = $1
     ) as exists`,
    [pageId]
  );

  return result.rows[0]?.exists ?? false;
}

export async function countPagesForSurvey(queryable: Queryable, surveyId: number): Promise<number> {
  const result = await queryable.query<{ count: string }>(
    `select count(*)::text as count
     from survey_pages
     where survey_id = $1`,
    [surveyId]
  );

  return Number(result.rows[0]?.count ?? 0);
}

export async function moveQuestionToPage(
  queryable: Queryable,
  questionId: number,
  fromPageId: number,
  toPageId: number,
  displayOrder: number
): Promise<void> {
  await shiftQuestionDisplayOrdersForInsert(queryable, toPageId, displayOrder);
  await queryable.query(
    `update survey_questions
     set page_id = $2,
         display_order = $3,
         updated_at = now()
     where id = $1`,
    [questionId, toPageId, displayOrder]
  );
  await normalizeQuestionOrders(queryable, fromPageId);
}

export async function normalizeQuestionOrders(queryable: Queryable, pageId: number): Promise<void> {
  const result = await queryable.query<{ id: number }>(
    `select id
     from survey_questions
     where page_id = $1
     order by display_order, id`,
    [pageId]
  );

  await reorderQuestions(queryable, pageId, result.rows.map((row) => row.id));
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

  if (value.conditionOperator === "equals") {
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
  } else {
    if (sourceQuestion.question_type !== "text") {
      return { ok: false, error: "Blank text rules must use a text source question" };
    }

    if (value.actionType !== "HIDE_QUESTION" && value.actionType !== "HIDE_PAGE") {
      return { ok: false, error: "Blank text rules can only skip questions or pages" };
    }
  }

  const sourcePage = await fetchPageForSurvey(queryable, sourceQuestion.page_id, surveyId);

  if (!sourcePage) {
    return { ok: false, error: "Source page must belong to this survey" };
  }

  if (value.sourcePageId !== null && value.sourcePageId !== sourceQuestion.page_id) {
    return { ok: false, error: "Source question must belong to the source page" };
  }

  if (value.actionType === "JUMP_TO_PAGE" || value.actionType === "HIDE_PAGE") {
    if (value.targetPageId === null) {
      return { ok: false, error: "Target page is required for page rules" };
    }

    const targetPage = await fetchPageForSurvey(queryable, value.targetPageId, surveyId);

    if (!targetPage) {
      return { ok: false, error: "Target page must belong to this survey" };
    }

    if (targetPage.display_order <= sourcePage.display_order) {
      return { ok: false, error: "Target page must come after the source page" };
    }

    return { ok: true, value: undefined };
  }

  const targetQuestion = await fetchQuestionForSurvey(
    queryable,
    value.targetQuestionId ?? 0,
    surveyId
  );

  if (!targetQuestion) {
    return { ok: false, error: "Target question must belong to this survey" };
  }

  const targetPage = await fetchPageForSurvey(queryable, targetQuestion.page_id, surveyId);

  if (
    !targetPage ||
    targetPage.display_order < sourcePage.display_order ||
    (targetPage.display_order === sourcePage.display_order &&
      targetQuestion.display_order <= sourceQuestion.display_order)
  ) {
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

export function isQuestionOtherTagUniqueViolation(error: unknown): boolean {
  return (
    error instanceof DatabaseError &&
    error.code === "23505" &&
    error.constraint === "question_other_tags_key_value_unique"
  );
}

export function isTagDefinitionUniqueViolation(error: unknown): boolean {
  return (
    error instanceof DatabaseError &&
    error.code === "23505" &&
    error.constraint === "tag_definitions_key_value_unique"
  );
}

export function isCategoryNameUniqueViolation(error: unknown): boolean {
  return (
    error instanceof DatabaseError &&
    error.code === "23505" &&
    error.constraint === "survey_categories_name_unique_idx"
  );
}

export async function categoryExists(queryable: Queryable, categoryId: number): Promise<boolean> {
  const result = await queryable.query<{ exists: boolean }>(
    `select exists (
       select 1
       from survey_categories
       where id = $1
     ) as exists`,
    [categoryId]
  );

  return result.rows[0]?.exists ?? false;
}

// The tag catalog is a registry: builder tag writes register their key/value
// pair so it becomes a reusable suggestion. Existing pairs are left untouched.
export async function registerTagDefinition(
  queryable: Queryable,
  tagKey: string,
  tagValue: string
): Promise<void> {
  await queryable.query(
    `insert into tag_definitions (tag_key, tag_value, group_id, display_order)
     select $1, $2, null, coalesce(max(display_order), 0) + 1
     from tag_definitions
     where group_id is null
     on conflict (tag_key, tag_value) do nothing`,
    [tagKey, tagValue]
  );
}

type HiddenTagAllBindingTargetType = "answer_option" | "question_other" | "question_value";

interface HiddenTagAllBindingInput {
  targetType: HiddenTagAllBindingTargetType;
  answerOptionId?: number;
  questionId?: number;
  integerMin?: number | null;
  integerMax?: number | null;
  tagKey: string;
}

interface HiddenTagAllBindingRow {
  id: number;
  target_type: HiddenTagAllBindingTargetType;
  answer_option_id: number | null;
  question_id: number | null;
  integer_min: number | null;
  integer_max: number | null;
  tag_key: string;
}

async function fetchHiddenTagAllBinding(
  queryable: Queryable,
  input: HiddenTagAllBindingInput
): Promise<HiddenTagAllBindingRow | null> {
  const result = await queryable.query<HiddenTagAllBindingRow>(
    `select id, target_type, answer_option_id, question_id, integer_min, integer_max, tag_key
     from hidden_tag_all_bindings
     where target_type = $1
       and answer_option_id is not distinct from $2
       and question_id is not distinct from $3
       and integer_min is not distinct from $4
       and integer_max is not distinct from $5
       and tag_key = $6`,
    [
      input.targetType,
      input.answerOptionId ?? null,
      input.questionId ?? null,
      input.integerMin ?? null,
      input.integerMax ?? null,
      input.tagKey
    ]
  );

  return result.rows[0] ?? null;
}

async function applyHiddenTagAllBindingSources(
  queryable: Queryable,
  bindingId: number
): Promise<void> {
  await queryable.query(
    `insert into hidden_tag_all_binding_tags (binding_id, tag_value)
     select bindings.id, tag_definitions.tag_value
     from hidden_tag_all_bindings bindings
     join tag_definitions
       on tag_definitions.tag_key = bindings.tag_key
     where bindings.id = $1
       and lower(tag_definitions.tag_value) not in ('all', '<all>')
     on conflict (binding_id, tag_value) do nothing`,
    [bindingId]
  );

  await applyHiddenTagAllBindingEffectiveTags(queryable, bindingId);
}

async function applyHiddenTagAllBindingEffectiveTags(
  queryable: Queryable,
  bindingId: number
): Promise<void> {
  await queryable.query(
    `insert into answer_tags (answer_option_id, tag_key, tag_value, is_manual)
     select bindings.answer_option_id, bindings.tag_key, sources.tag_value, false
     from hidden_tag_all_bindings bindings
     join hidden_tag_all_binding_tags sources
       on sources.binding_id = bindings.id
     where bindings.id = $1
       and bindings.target_type = 'answer_option'
     on conflict (answer_option_id, tag_key, tag_value) do nothing`,
    [bindingId]
  );

  await queryable.query(
    `insert into question_other_tags (question_id, tag_key, tag_value, is_manual)
     select bindings.question_id, bindings.tag_key, sources.tag_value, false
     from hidden_tag_all_bindings bindings
     join hidden_tag_all_binding_tags sources
       on sources.binding_id = bindings.id
     where bindings.id = $1
       and bindings.target_type = 'question_other'
     on conflict (question_id, tag_key, tag_value) do nothing`,
    [bindingId]
  );

  await queryable.query(
    `insert into question_value_tags (
       question_id,
       integer_min,
       integer_max,
       tag_key,
       tag_value,
       is_manual
     )
     select
       bindings.question_id,
       bindings.integer_min,
       bindings.integer_max,
       bindings.tag_key,
       sources.tag_value,
       false
     from hidden_tag_all_bindings bindings
     join hidden_tag_all_binding_tags sources
       on sources.binding_id = bindings.id
     where bindings.id = $1
       and bindings.target_type = 'question_value'
       and not exists (
         select 1
         from question_value_tags existing_target
         where existing_target.question_id = bindings.question_id
           and existing_target.integer_min is not distinct from bindings.integer_min
           and existing_target.integer_max is not distinct from bindings.integer_max
           and existing_target.tag_key = bindings.tag_key
           and existing_target.tag_value = sources.tag_value
       )`,
    [bindingId]
  );
}

export async function createHiddenTagAllBinding(
  queryable: Queryable,
  input: HiddenTagAllBindingInput
): Promise<void> {
  const result = await queryable.query<{ id: number }>(
    `insert into hidden_tag_all_bindings (
       target_type,
       answer_option_id,
       question_id,
       integer_min,
       integer_max,
       tag_key
     )
     values ($1, $2, $3, $4, $5, $6)
     on conflict do nothing
     returning id`,
    [
      input.targetType,
      input.answerOptionId ?? null,
      input.questionId ?? null,
      input.integerMin ?? null,
      input.integerMax ?? null,
      input.tagKey
    ]
  );

  const bindingId = result.rows[0]?.id ?? (await fetchHiddenTagAllBinding(queryable, input))?.id;

  if (!bindingId) {
    throw new Error("Unable to create hidden tag subscription");
  }

  await applyHiddenTagAllBindingSources(queryable, bindingId);
}

export async function deleteHiddenTagAllBinding(
  queryable: Queryable,
  input: HiddenTagAllBindingInput
): Promise<boolean> {
  const binding = await fetchHiddenTagAllBinding(queryable, input);

  if (!binding) {
    return false;
  }

  await queryable.query(
    `delete from hidden_tag_all_bindings
     where id = $1`,
    [binding.id]
  );

  await cleanupInheritedHiddenTagsForBinding(queryable, binding);

  return true;
}

async function cleanupInheritedHiddenTagsForBinding(
  queryable: Queryable,
  binding: HiddenTagAllBindingRow
): Promise<void> {
  if (binding.target_type === "answer_option") {
    await queryable.query(
      `delete from answer_tags target
       where target.answer_option_id = $1
         and target.tag_key = $2
         and target.is_manual = false
         and not exists (
           select 1
           from hidden_tag_all_bindings bindings
           join hidden_tag_all_binding_tags sources
             on sources.binding_id = bindings.id
           where bindings.target_type = 'answer_option'
             and bindings.answer_option_id = target.answer_option_id
             and bindings.tag_key = target.tag_key
             and sources.tag_value = target.tag_value
         )`,
      [binding.answer_option_id, binding.tag_key]
    );
  } else if (binding.target_type === "question_other") {
    await queryable.query(
      `delete from question_other_tags target
       where target.question_id = $1
         and target.tag_key = $2
         and target.is_manual = false
         and not exists (
           select 1
           from hidden_tag_all_bindings bindings
           join hidden_tag_all_binding_tags sources
             on sources.binding_id = bindings.id
           where bindings.target_type = 'question_other'
             and bindings.question_id = target.question_id
             and bindings.tag_key = target.tag_key
             and sources.tag_value = target.tag_value
         )`,
      [binding.question_id, binding.tag_key]
    );
  } else {
    await queryable.query(
      `delete from question_value_tags target
       where target.question_id = $1
         and target.integer_min is not distinct from $2
         and target.integer_max is not distinct from $3
         and target.tag_key = $4
         and target.is_manual = false
         and not exists (
           select 1
           from hidden_tag_all_bindings bindings
           join hidden_tag_all_binding_tags sources
             on sources.binding_id = bindings.id
           where bindings.target_type = 'question_value'
             and bindings.question_id = target.question_id
             and bindings.integer_min is not distinct from target.integer_min
             and bindings.integer_max is not distinct from target.integer_max
             and bindings.tag_key = target.tag_key
             and sources.tag_value = target.tag_value
         )`,
      [binding.question_id, binding.integer_min, binding.integer_max, binding.tag_key]
    );
  }
}

export async function removeHiddenTagAllValueFromBindings(
  queryable: Queryable,
  input: { tagKey: string; tagValue: string }
): Promise<void> {
  const bindingsResult = await queryable.query<HiddenTagAllBindingRow>(
    `select distinct bindings.id,
            bindings.target_type,
            bindings.answer_option_id,
            bindings.question_id,
            bindings.integer_min,
            bindings.integer_max,
            bindings.tag_key
     from hidden_tag_all_bindings bindings
     join hidden_tag_all_binding_tags sources
       on sources.binding_id = bindings.id
     where bindings.tag_key = $1
       and sources.tag_value = $2`,
    [input.tagKey, input.tagValue]
  );

  await queryable.query(
    `delete from hidden_tag_all_binding_tags sources
     using hidden_tag_all_bindings bindings
     where bindings.id = sources.binding_id
       and bindings.tag_key = $1
       and sources.tag_value = $2`,
    [input.tagKey, input.tagValue]
  );

  for (const binding of bindingsResult.rows) {
    await cleanupInheritedHiddenTagsForBinding(queryable, binding);
  }
}

export async function applyTagDefinitionToHiddenAllTargets(
  queryable: Queryable,
  input: { tagKey: string; tagValue: string }
): Promise<void> {
  await queryable.query(
    `insert into hidden_tag_all_binding_tags (binding_id, tag_value)
     select id, $2
     from hidden_tag_all_bindings
     where tag_key = $1
     on conflict (binding_id, tag_value) do nothing`,
    [input.tagKey, input.tagValue]
  );

  await queryable.query(
    `insert into answer_tags (answer_option_id, tag_key, tag_value, is_manual)
     select bindings.answer_option_id, bindings.tag_key, sources.tag_value, false
     from hidden_tag_all_bindings bindings
     join hidden_tag_all_binding_tags sources
       on sources.binding_id = bindings.id
     where bindings.target_type = 'answer_option'
       and bindings.tag_key = $1
       and sources.tag_value = $2
     on conflict (answer_option_id, tag_key, tag_value) do nothing`,
    [input.tagKey, input.tagValue]
  );

  await queryable.query(
    `insert into question_other_tags (question_id, tag_key, tag_value, is_manual)
     select bindings.question_id, bindings.tag_key, sources.tag_value, false
     from hidden_tag_all_bindings bindings
     join hidden_tag_all_binding_tags sources
       on sources.binding_id = bindings.id
     where bindings.target_type = 'question_other'
       and bindings.tag_key = $1
       and sources.tag_value = $2
     on conflict (question_id, tag_key, tag_value) do nothing`,
    [input.tagKey, input.tagValue]
  );

  await queryable.query(
    `insert into question_value_tags (
       question_id,
       integer_min,
       integer_max,
       tag_key,
       tag_value,
       is_manual
     )
     select
       bindings.question_id,
       bindings.integer_min,
       bindings.integer_max,
       bindings.tag_key,
       sources.tag_value,
       false
     from hidden_tag_all_bindings bindings
     join hidden_tag_all_binding_tags sources
       on sources.binding_id = bindings.id
     where bindings.target_type = 'question_value'
       and bindings.tag_key = $1
       and sources.tag_value = $2
       and not exists (
       select 1
       from question_value_tags existing_target
       where existing_target.question_id = bindings.question_id
         and existing_target.integer_min is not distinct from bindings.integer_min
         and existing_target.integer_max is not distinct from bindings.integer_max
         and existing_target.tag_key = bindings.tag_key
         and existing_target.tag_value = sources.tag_value
     )`,
    [input.tagKey, input.tagValue]
  );
}

const duplicateTitleSuffix = " (copy)";
const duplicateTitleMaxLength = 180;

// Copies a survey's metadata, questions, options, hidden tags, and
// conditional rules into a brand-new draft survey. Rule foreign keys are
// remapped onto the cloned questions and options. Attempts are never copied:
// the clone is an independent survey with its own attempt history.
export async function duplicateSurveyTree(
  queryable: Queryable,
  surveyId: number,
  createdByUserId: number
): Promise<number | null> {
  const surveyResult = await queryable.query<{ id: number }>(
    `insert into surveys (title, description, status, category_id, created_by_user_id)
     select left(title || $2, $3), description, 'draft', category_id, $4
     from surveys
     where id = $1
     returning id`,
    [surveyId, duplicateTitleSuffix, duplicateTitleMaxLength, createdByUserId]
  );
  const newSurveyId = surveyResult.rows[0]?.id;

  if (!newSurveyId) {
    return null;
  }

  const questionsResult = await queryable.query<{
    id: number;
    page_id: number;
    question_text: string;
    question_type: string;
    allow_other: boolean;
    display_order: number;
    is_required: boolean;
    help_text: string | null;
  }>(
    `select id, page_id, question_text, question_type, allow_other, display_order, is_required, help_text
     from survey_questions
     where survey_id = $1
     order by page_id, display_order, id`,
    [surveyId]
  );
  const pagesResult = await queryable.query<{
    id: number;
    title: string;
    description: string | null;
    display_order: number;
  }>(
    `select id, title, description, display_order
     from survey_pages
     where survey_id = $1
     order by display_order, id`,
    [surveyId]
  );
  const pageIdMap = new Map<number, number>();

  for (const page of pagesResult.rows) {
    const inserted = await queryable.query<{ id: number }>(
      `insert into survey_pages (survey_id, title, description, display_order)
       values ($1, $2, $3, $4)
       returning id`,
      [newSurveyId, page.title, page.description, page.display_order]
    );
    pageIdMap.set(page.id, inserted.rows[0].id);
  }

  const questionIdMap = new Map<number, number>();

  for (const question of questionsResult.rows) {
    const newPageId = pageIdMap.get(question.page_id);

    if (!newPageId) {
      throw new Error("Survey duplicate failed to remap a page reference");
    }

    const inserted = await queryable.query<{ id: number }>(
      `insert into survey_questions (
         survey_id,
         page_id,
         question_text,
         question_type,
         allow_other,
         display_order,
         is_required,
         help_text
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning id`,
      [
        newSurveyId,
        newPageId,
        question.question_text,
        question.question_type,
        question.allow_other,
        question.display_order,
        question.is_required,
        question.help_text
      ]
    );
    questionIdMap.set(question.id, inserted.rows[0].id);
  }

  const optionsResult = await queryable.query<{
    id: number;
    question_id: number;
    option_text: string;
    display_order: number;
  }>(
    `select answer_options.id, answer_options.question_id, answer_options.option_text, answer_options.display_order
     from answer_options
     join survey_questions on survey_questions.id = answer_options.question_id
     where survey_questions.survey_id = $1
     order by answer_options.question_id, answer_options.display_order, answer_options.id`,
    [surveyId]
  );
  const optionIdMap = new Map<number, number>();

  for (const option of optionsResult.rows) {
    const newQuestionId = questionIdMap.get(option.question_id);

    if (!newQuestionId) {
      continue;
    }

    const inserted = await queryable.query<{ id: number }>(
      `insert into answer_options (question_id, option_text, display_order)
       values ($1, $2, $3)
       returning id`,
      [newQuestionId, option.option_text, option.display_order]
    );
    optionIdMap.set(option.id, inserted.rows[0].id);
  }

  const tagsResult = await queryable.query<{
    answer_option_id: number;
    tag_key: string;
    tag_value: string;
    is_manual: boolean;
  }>(
    `select answer_tags.answer_option_id, answer_tags.tag_key, answer_tags.tag_value, answer_tags.is_manual
     from answer_tags
     join answer_options on answer_options.id = answer_tags.answer_option_id
     join survey_questions on survey_questions.id = answer_options.question_id
     where survey_questions.survey_id = $1
     order by answer_tags.id`,
    [surveyId]
  );

  for (const tag of tagsResult.rows) {
    const newOptionId = optionIdMap.get(tag.answer_option_id);

    if (!newOptionId) {
      continue;
    }

    await queryable.query(
      `insert into answer_tags (answer_option_id, tag_key, tag_value, is_manual)
       values ($1, $2, $3, $4)`,
      [newOptionId, tag.tag_key, tag.tag_value, tag.is_manual]
    );
  }

  const valueTagsResult = await queryable.query<{
    question_id: number;
    integer_min: number | null;
    integer_max: number | null;
    tag_key: string;
    tag_value: string;
    is_manual: boolean;
  }>(
    `select question_id, integer_min, integer_max, tag_key, tag_value, is_manual
     from question_value_tags
     join survey_questions on survey_questions.id = question_value_tags.question_id
     where survey_questions.survey_id = $1
     order by question_value_tags.id`,
    [surveyId]
  );

  for (const valueTag of valueTagsResult.rows) {
    const newQuestionId = questionIdMap.get(valueTag.question_id);

    if (!newQuestionId) {
      continue;
    }

    await queryable.query(
      `insert into question_value_tags (question_id, integer_min, integer_max, tag_key, tag_value, is_manual)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        newQuestionId,
        valueTag.integer_min,
        valueTag.integer_max,
        valueTag.tag_key,
        valueTag.tag_value,
        valueTag.is_manual
      ]
    );
  }

  const otherTagsResult = await queryable.query<{
    question_id: number;
    tag_key: string;
    tag_value: string;
    is_manual: boolean;
  }>(
    `select question_other_tags.question_id,
            question_other_tags.tag_key,
            question_other_tags.tag_value,
            question_other_tags.is_manual
     from question_other_tags
     join survey_questions on survey_questions.id = question_other_tags.question_id
     where survey_questions.survey_id = $1
     order by question_other_tags.id`,
    [surveyId]
  );

  for (const otherTag of otherTagsResult.rows) {
    const newQuestionId = questionIdMap.get(otherTag.question_id);

    if (!newQuestionId) {
      continue;
    }

    await queryable.query(
      `insert into question_other_tags (question_id, tag_key, tag_value, is_manual)
       values ($1, $2, $3, $4)`,
      [newQuestionId, otherTag.tag_key, otherTag.tag_value, otherTag.is_manual]
    );
  }

  const allBindingsResult = await queryable.query<{
    id: number;
    target_type: HiddenTagAllBindingTargetType;
    answer_option_id: number | null;
    question_id: number | null;
    integer_min: number | null;
    integer_max: number | null;
    tag_key: string;
  }>(
    `select bindings.id,
            bindings.target_type,
            bindings.answer_option_id,
            bindings.question_id,
            bindings.integer_min,
            bindings.integer_max,
            bindings.tag_key
     from hidden_tag_all_bindings bindings
     left join answer_options
       on answer_options.id = bindings.answer_option_id
     left join survey_questions option_questions
       on option_questions.id = answer_options.question_id
     left join survey_questions direct_questions
       on direct_questions.id = bindings.question_id
     where option_questions.survey_id = $1
        or direct_questions.survey_id = $1
     order by bindings.id`,
    [surveyId]
  );
  const allBindingIdMap = new Map<number, number>();

  for (const binding of allBindingsResult.rows) {
    const newOptionId =
      binding.answer_option_id === null ? null : optionIdMap.get(binding.answer_option_id);
    const newQuestionId =
      binding.question_id === null ? null : questionIdMap.get(binding.question_id);

    if (
      (binding.target_type === "answer_option" && !newOptionId) ||
      (binding.target_type !== "answer_option" && !newQuestionId)
    ) {
      continue;
    }

    const inserted = await queryable.query<{ id: number }>(
      `insert into hidden_tag_all_bindings (
         target_type,
         answer_option_id,
         question_id,
         integer_min,
         integer_max,
         tag_key
       )
       values ($1, $2, $3, $4, $5, $6)
       returning id`,
      [
        binding.target_type,
        newOptionId,
        newQuestionId,
        binding.integer_min,
        binding.integer_max,
        binding.tag_key
      ]
    );
    allBindingIdMap.set(binding.id, inserted.rows[0].id);
  }

  const allBindingSourcesResult = await queryable.query<{
    binding_id: number;
    tag_value: string;
  }>(
    `select sources.binding_id, sources.tag_value
     from hidden_tag_all_binding_tags sources
     where sources.binding_id = any($1::int[])
     order by sources.id`,
    [allBindingsResult.rows.map((binding) => binding.id)]
  );

  for (const source of allBindingSourcesResult.rows) {
    const newBindingId = allBindingIdMap.get(source.binding_id);

    if (!newBindingId) {
      continue;
    }

    await queryable.query(
      `insert into hidden_tag_all_binding_tags (binding_id, tag_value)
       values ($1, $2)
       on conflict (binding_id, tag_value) do nothing`,
      [newBindingId, source.tag_value]
    );
  }

  const rulesResult = await queryable.query<{
    source_page_id: number | null;
    source_question_id: number;
    source_answer_option_id: number | null;
    condition_operator: string;
    action_type: string;
    target_question_id: number | null;
    target_page_id: number | null;
    skip_target_in_normal_flow: boolean;
    advance_on_trigger: boolean;
  }>(
    `select
       source_page_id,
       source_question_id,
       source_answer_option_id,
       condition_operator,
       action_type,
       target_question_id,
       target_page_id,
       skip_target_in_normal_flow,
       advance_on_trigger
     from conditional_logic_rules
     where survey_id = $1
     order by id`,
    [surveyId]
  );

  for (const rule of rulesResult.rows) {
    const newSourceQuestionId = questionIdMap.get(rule.source_question_id);
    const newSourcePageId =
      rule.source_page_id === null ? null : pageIdMap.get(rule.source_page_id);
    const newSourceOptionId =
      rule.source_answer_option_id === null ? null : optionIdMap.get(rule.source_answer_option_id);
    const newTargetQuestionId =
      rule.target_question_id === null ? null : questionIdMap.get(rule.target_question_id);
    const newTargetPageId =
      rule.target_page_id === null ? null : pageIdMap.get(rule.target_page_id);

    if (
      !newSourceQuestionId ||
      newSourcePageId === undefined ||
      newSourceOptionId === undefined ||
      (rule.target_question_id !== null && !newTargetQuestionId) ||
      (rule.target_page_id !== null && !newTargetPageId)
    ) {
      throw new Error("Survey duplicate failed to remap a conditional rule reference");
    }

    await queryable.query(
      `insert into conditional_logic_rules (
         survey_id,
         source_page_id,
         source_question_id,
         source_answer_option_id,
         condition_operator,
         action_type,
         target_question_id,
         target_page_id,
         skip_target_in_normal_flow,
         advance_on_trigger
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        newSurveyId,
        newSourcePageId,
        newSourceQuestionId,
        newSourceOptionId,
        rule.condition_operator,
        rule.action_type,
        newTargetQuestionId ?? null,
        newTargetPageId ?? null,
        rule.skip_target_in_normal_flow,
        rule.advance_on_trigger
      ]
    );
  }

  return newSurveyId;
}
