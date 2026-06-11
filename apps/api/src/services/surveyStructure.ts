import type {
  AnswerOption,
  AnswerTag,
  ConditionalLogicRule,
  Survey,
  SurveyQuestion
} from "@survey-portal/shared";

import { pool } from "../db.js";
import {
  mapAnswerOptionRecord,
  mapAnswerTagRecord,
  mapConditionalLogicRuleRecord,
  mapSurveyQuestionRecord,
  mapSurveyRecord,
  type AnswerOptionRecord,
  type AnswerTagRecord,
  type ConditionalLogicRuleRecord,
  type SurveyQuestionRecord,
  type SurveyRecord
} from "./surveyRecords.js";

export interface FetchSurveyStructuresOptions {
  surveyId?: number;
  surveyIds?: number[];
  includeAllStatuses: boolean;
  includeHiddenTags: boolean;
}

export async function fetchSurveyStructures(options: FetchSurveyStructuresOptions): Promise<Survey[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (!options.includeAllStatuses) {
    conditions.push("status = 'published'");
  }

  if (options.surveyId !== undefined) {
    values.push(options.surveyId);
    conditions.push(`id = $${values.length}`);
  }

  if (options.surveyIds !== undefined) {
    if (options.surveyIds.length === 0) {
      return [];
    }

    values.push(options.surveyIds);
    conditions.push(`id = any($${values.length}::int[])`);
  }

  const surveysResult = await pool.query<SurveyRecord>(
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
     ${conditions.length > 0 ? `where ${conditions.join(" and ")}` : ""}
     order by id`,
    values
  );

  const surveyIds = surveysResult.rows.map((survey) => survey.id);

  if (surveyIds.length === 0) {
    return [];
  }

  const questionsResult = await pool.query<SurveyQuestionRecord>(
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
     where survey_id = any($1::int[])
     order by survey_id, display_order, id`,
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
             id,
             answer_option_id,
             tag_key,
             tag_value,
             created_at,
             updated_at
           from answer_tags
           where answer_option_id = any($1::int[])
           order by answer_option_id, tag_key, tag_value, id`,
          [optionIds]
        )
      : { rows: [] as AnswerTagRecord[] };

  const rulesResult = await pool.query<ConditionalLogicRuleRecord>(
    `select
       id,
       survey_id,
       source_question_id,
       source_answer_option_id,
       condition_operator,
       action_type,
       target_question_id,
       target_page_id,
       skip_target_in_normal_flow,
       created_at,
       updated_at
     from conditional_logic_rules
     where survey_id = any($1::int[])
     order by survey_id, id`,
    [surveyIds]
  );

  const tagsByOptionId = new Map<number, AnswerTag[]>();

  for (const tag of tagsResult.rows) {
    const mappedTag = mapAnswerTagRecord(tag);
    const tags = tagsByOptionId.get(tag.answer_option_id) ?? [];
    tags.push(mappedTag);
    tagsByOptionId.set(tag.answer_option_id, tags);
  }

  const optionsByQuestionId = new Map<number, AnswerOption[]>();

  for (const option of optionsResult.rows) {
    const mappedOption = mapAnswerOptionRecord(option);

    if (options.includeHiddenTags) {
      mappedOption.answerTags = tagsByOptionId.get(option.id) ?? [];
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

  return surveysResult.rows.map((survey) =>
    mapSurveyRecord(
      survey,
      questionsBySurveyId.get(survey.id) ?? [],
      rulesBySurveyId.get(survey.id) ?? []
    )
  );
}
