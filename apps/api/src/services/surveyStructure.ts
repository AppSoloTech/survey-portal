import type {
  AnswerOption,
  AnswerTag,
  ConditionalLogicRule,
  HiddenTagAllBinding,
  QuestionValueTag,
  QuestionOtherTag,
  Survey,
  SurveyQuestion
} from "@survey-portal/shared";

import { pool } from "../db.js";
import {
  mapAnswerOptionRecord,
  mapAnswerTagRecord,
  mapConditionalLogicRuleRecord,
  mapHiddenTagAllBindingRecord,
  mapQuestionOtherTagRecord,
  mapQuestionValueTagRecord,
  mapSurveyPageRecord,
  mapSurveyQuestionRecord,
  mapSurveyRecord,
  type AnswerOptionRecord,
  type AnswerTagRecord,
  type ConditionalLogicRuleRecord,
  type HiddenTagAllBindingRecord,
  type QuestionOtherTagRecord,
  type QuestionValueTagRecord,
  type SurveyPageRecord,
  type SurveyQuestionRecord,
  type SurveyRecord
} from "./surveyRecords.js";
import { buildSurveyTimingSummaries } from "./surveyTiming.js";

export interface FetchSurveyStructuresOptions {
  surveyId?: number;
  surveyIds?: number[];
  includeAllStatuses: boolean;
  includeHiddenTags: boolean;
  includeDeleted?: boolean;
}

export async function fetchSurveyStructures(options: FetchSurveyStructuresOptions): Promise<Survey[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (!options.includeAllStatuses) {
    conditions.push("surveys.status = 'published'");
  }

  if (!options.includeDeleted) {
    conditions.push("surveys.deleted_at is null");
  }

  if (options.surveyId !== undefined) {
    values.push(options.surveyId);
    conditions.push(`surveys.id = $${values.length}`);
  }

  if (options.surveyIds !== undefined) {
    if (options.surveyIds.length === 0) {
      return [];
    }

    values.push(options.surveyIds);
    conditions.push(`surveys.id = any($${values.length}::int[])`);
  }

  const surveysResult = await pool.query<SurveyRecord>(
    `select
       surveys.id,
       surveys.title,
       surveys.description,
       surveys.status,
       surveys.category_id,
       survey_categories.name as category_name,
       surveys.created_by_user_id,
       surveys.created_at,
       surveys.updated_at,
       surveys.published_at,
       surveys.retired_at,
       surveys.deleted_at
     from surveys
     left join survey_categories on survey_categories.id = surveys.category_id
     ${conditions.length > 0 ? `where ${conditions.join(" and ")}` : ""}
     order by surveys.id`,
    values
  );

  const surveyIds = surveysResult.rows.map((survey) => survey.id);

  if (surveyIds.length === 0) {
    return [];
  }

  const pagesResult = await pool.query<SurveyPageRecord>(
    `select
       id,
       survey_id,
       title,
       description,
       display_order,
       created_at,
       updated_at
     from survey_pages
     where survey_id = any($1::int[])
     order by survey_id, display_order, id`,
    [surveyIds]
  );

  const questionsResult = await pool.query<SurveyQuestionRecord>(
    `select
       survey_questions.id,
       survey_questions.survey_id,
       survey_questions.page_id,
       question_text,
       question_type,
       allow_other,
       survey_questions.display_order,
       is_required,
       help_text,
       survey_questions.created_at,
       survey_questions.updated_at
     from survey_questions
     join survey_pages on survey_pages.id = survey_questions.page_id
     where survey_questions.survey_id = any($1::int[])
     order by
       survey_questions.survey_id,
       survey_pages.display_order,
       survey_questions.display_order,
       survey_questions.id`,
    [surveyIds]
  );

  const questionIds = questionsResult.rows.map((question) => question.id);
  const optionsResult =
    questionIds.length > 0
      ? await pool.query<AnswerOptionRecord>(
          `select
             id,
             question_id,
             option_text,
             display_order,
             created_at,
             updated_at
           from answer_options
           where question_id = any($1::int[])
           order by question_id, display_order, id`,
          [questionIds]
        )
      : { rows: [] as AnswerOptionRecord[] };

  const optionIds = optionsResult.rows.map((option) => option.id);
  const tagsResult =
    options.includeHiddenTags && optionIds.length > 0
      ? await pool.query<AnswerTagRecord>(
          `select
             answer_tags.id,
             answer_tags.answer_option_id,
             answer_tags.tag_key,
             answer_tags.tag_value,
             tag_definitions.emoji,
             answer_tags.is_manual,
             answer_tags.created_at,
             answer_tags.updated_at
           from answer_tags
           left join tag_definitions
             on tag_definitions.tag_key = answer_tags.tag_key
            and tag_definitions.tag_value = answer_tags.tag_value
           where answer_tags.answer_option_id = any($1::int[])
           order by answer_tags.answer_option_id, answer_tags.tag_key, answer_tags.tag_value, answer_tags.id`,
          [optionIds]
        )
      : { rows: [] as AnswerTagRecord[] };

  const valueTagsResult =
    options.includeHiddenTags && questionIds.length > 0
      ? await pool.query<QuestionValueTagRecord>(
          `select
             question_value_tags.id,
             question_value_tags.question_id,
             question_value_tags.integer_min,
             question_value_tags.integer_max,
             question_value_tags.tag_key,
             question_value_tags.tag_value,
             tag_definitions.emoji,
             question_value_tags.is_manual,
             question_value_tags.created_at,
             question_value_tags.updated_at
           from question_value_tags
           left join tag_definitions
             on tag_definitions.tag_key = question_value_tags.tag_key
            and tag_definitions.tag_value = question_value_tags.tag_value
           where question_value_tags.question_id = any($1::int[])
           order by question_value_tags.question_id, question_value_tags.tag_key, question_value_tags.tag_value, question_value_tags.id`,
          [questionIds]
        )
      : { rows: [] as QuestionValueTagRecord[] };

  const otherTagsResult =
    options.includeHiddenTags && questionIds.length > 0
      ? await pool.query<QuestionOtherTagRecord>(
          `select
             question_other_tags.id,
             question_other_tags.question_id,
             question_other_tags.tag_key,
             question_other_tags.tag_value,
             tag_definitions.emoji,
             question_other_tags.is_manual,
             question_other_tags.created_at,
             question_other_tags.updated_at
           from question_other_tags
           left join tag_definitions
             on tag_definitions.tag_key = question_other_tags.tag_key
            and tag_definitions.tag_value = question_other_tags.tag_value
           where question_other_tags.question_id = any($1::int[])
           order by question_other_tags.question_id, question_other_tags.tag_key, question_other_tags.tag_value, question_other_tags.id`,
          [questionIds]
        )
      : { rows: [] as QuestionOtherTagRecord[] };

  const hiddenTagAllBindingsResult =
    options.includeHiddenTags && (optionIds.length > 0 || questionIds.length > 0)
      ? await pool.query<HiddenTagAllBindingRecord>(
          `select
             id,
             target_type,
             answer_option_id,
             question_id,
             integer_min,
             integer_max,
             tag_key,
             created_at,
             updated_at
           from hidden_tag_all_bindings
           where (answer_option_id = any($1::int[]))
              or (question_id = any($2::int[]))
           order by target_type, tag_key, id`,
          [optionIds, questionIds]
        )
      : { rows: [] as HiddenTagAllBindingRecord[] };

  const rulesResult = await pool.query<ConditionalLogicRuleRecord>(
    `select
       id,
       survey_id,
       source_page_id,
       source_question_id,
       source_answer_option_id,
       condition_operator,
       action_type,
       target_question_id,
       target_page_id,
       skip_target_in_normal_flow,
       advance_on_trigger,
       created_at,
       updated_at
     from conditional_logic_rules
     where survey_id = any($1::int[])
     order by survey_id, id`,
    [surveyIds]
  );

  const valueTagsByQuestionId = new Map<number, QuestionValueTag[]>();

  for (const valueTag of valueTagsResult.rows) {
    const mapped = mapQuestionValueTagRecord(valueTag);
    const tags = valueTagsByQuestionId.get(valueTag.question_id) ?? [];
    tags.push(mapped);
    valueTagsByQuestionId.set(valueTag.question_id, tags);
  }

  const otherTagsByQuestionId = new Map<number, QuestionOtherTag[]>();

  for (const otherTag of otherTagsResult.rows) {
    const mapped = mapQuestionOtherTagRecord(otherTag);
    const tags = otherTagsByQuestionId.get(otherTag.question_id) ?? [];
    tags.push(mapped);
    otherTagsByQuestionId.set(otherTag.question_id, tags);
  }

  const tagsByOptionId = new Map<number, AnswerTag[]>();

  for (const tag of tagsResult.rows) {
    const mappedTag = mapAnswerTagRecord(tag);
    const tags = tagsByOptionId.get(tag.answer_option_id) ?? [];
    tags.push(mappedTag);
    tagsByOptionId.set(tag.answer_option_id, tags);
  }

  const allBindingsByOptionId = new Map<number, HiddenTagAllBinding[]>();
  const otherAllBindingsByQuestionId = new Map<number, HiddenTagAllBinding[]>();
  const valueAllBindingsByQuestionId = new Map<number, HiddenTagAllBinding[]>();

  for (const binding of hiddenTagAllBindingsResult.rows) {
    const mappedBinding = mapHiddenTagAllBindingRecord(binding);

    if (binding.target_type === "answer_option" && binding.answer_option_id !== null) {
      const bindings = allBindingsByOptionId.get(binding.answer_option_id) ?? [];
      bindings.push(mappedBinding);
      allBindingsByOptionId.set(binding.answer_option_id, bindings);
    } else if (binding.target_type === "question_other" && binding.question_id !== null) {
      const bindings = otherAllBindingsByQuestionId.get(binding.question_id) ?? [];
      bindings.push(mappedBinding);
      otherAllBindingsByQuestionId.set(binding.question_id, bindings);
    } else if (binding.target_type === "question_value" && binding.question_id !== null) {
      const bindings = valueAllBindingsByQuestionId.get(binding.question_id) ?? [];
      bindings.push(mappedBinding);
      valueAllBindingsByQuestionId.set(binding.question_id, bindings);
    }
  }

  const optionsByQuestionId = new Map<number, AnswerOption[]>();

  for (const option of optionsResult.rows) {
    const mappedOption = mapAnswerOptionRecord(option);

    if (options.includeHiddenTags) {
      mappedOption.answerTags = tagsByOptionId.get(option.id) ?? [];
      mappedOption.answerTagAllBindings = allBindingsByOptionId.get(option.id) ?? [];
    }

    const optionsForQuestion = optionsByQuestionId.get(option.question_id) ?? [];
    optionsForQuestion.push(mappedOption);
    optionsByQuestionId.set(option.question_id, optionsForQuestion);
  }

  const questionsBySurveyId = new Map<number, SurveyQuestion[]>();

  for (const question of questionsResult.rows) {
    const mappedQuestion = mapSurveyQuestionRecord(
      question,
      optionsByQuestionId.get(question.id) ?? []
    );

    if (options.includeHiddenTags) {
      mappedQuestion.valueTags = valueTagsByQuestionId.get(question.id) ?? [];
      mappedQuestion.otherTags = otherTagsByQuestionId.get(question.id) ?? [];
      mappedQuestion.valueTagAllBindings = valueAllBindingsByQuestionId.get(question.id) ?? [];
      mappedQuestion.otherTagAllBindings = otherAllBindingsByQuestionId.get(question.id) ?? [];
    }

    const questionsForSurvey = questionsBySurveyId.get(question.survey_id) ?? [];
    questionsForSurvey.push(mappedQuestion);
    questionsBySurveyId.set(question.survey_id, questionsForSurvey);
  }

  const rulesBySurveyId = new Map<number, ConditionalLogicRule[]>();

  for (const rule of rulesResult.rows) {
    const mappedRule = mapConditionalLogicRuleRecord(rule);
    const rulesForSurvey = rulesBySurveyId.get(rule.survey_id) ?? [];
    rulesForSurvey.push(mappedRule);
    rulesBySurveyId.set(rule.survey_id, rulesForSurvey);
  }

  const pagesBySurveyId = new Map<number, ReturnType<typeof mapSurveyPageRecord>[]>();

  for (const page of pagesResult.rows) {
    const pagesForSurvey = pagesBySurveyId.get(page.survey_id) ?? [];
    pagesForSurvey.push(mapSurveyPageRecord(page));
    pagesBySurveyId.set(page.survey_id, pagesForSurvey);
  }

  const surveys = surveysResult.rows.map((survey) =>
    mapSurveyRecord(
      survey,
      pagesBySurveyId.get(survey.id) ?? [],
      questionsBySurveyId.get(survey.id) ?? [],
      rulesBySurveyId.get(survey.id) ?? [],
      0
    )
  );
  const timingBySurveyId = await buildSurveyTimingSummaries(surveys);

  return surveys.map((survey) => ({
    ...survey,
    effectiveEstimateSeconds:
      timingBySurveyId.get(survey.id)?.effectiveEstimateSeconds ?? survey.effectiveEstimateSeconds
  }));
}
