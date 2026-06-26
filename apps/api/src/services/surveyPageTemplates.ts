import type {
  ConditionalLogicActionType,
  ConditionalLogicConditionOperator,
  SurveyPageTemplateDetail,
  SurveyPageTemplateSnapshot,
  SurveyPageTemplateSnapshotAnswerOption,
  SurveyPageTemplateSnapshotQuestion,
  SurveyPageTemplateSummary,
  SurveyQuestionType,
  SurveyTemplateExcludedLogicEntry
} from "@survey-portal/shared";

import {
  buildScaleValues,
  parseScaleOptionValue,
  type Queryable,
  type SurveyRecord
} from "./surveyRecords.js";
import {
  fetchNextPageDisplayOrder,
  registerTagDefinition,
  shiftPageDisplayOrdersForInsert
} from "./surveyBuilder.js";

const pageTemplateSchemaVersion = 1;

interface SurveyTemplateRecord {
  id: number;
  template_kind: "page";
  name: string;
  description: string | null;
  source_entity_kind: string | null;
  source_entity_id: number | null;
  source_survey_id: number | null;
  source_survey_title: string | null;
  source_page_title: string | null;
  payload_schema_version: number;
  payload: SurveyPageTemplateSnapshot;
  excluded_logic: SurveyTemplateExcludedLogicEntry[];
  created_by_user_id: number | null;
  updated_by_user_id: number | null;
  created_at: Date;
  updated_at: Date;
}

interface SurveyTemplateSummaryRecord {
  id: number;
  template_kind: "page";
  name: string;
  description: string | null;
  source_entity_kind: string | null;
  source_entity_id: number | null;
  source_survey_id: number | null;
  source_survey_title: string | null;
  source_page_title: string | null;
  payload_schema_version: number;
  question_count: number;
  excluded_logic_count: number;
  created_by_user_id: number | null;
  updated_by_user_id: number | null;
  created_at: Date;
  updated_at: Date;
}

interface PageSnapshotRow {
  id: number;
  title: string;
  description: string | null;
}

interface QuestionSnapshotRow {
  id: number;
  question_text: string;
  question_type: SurveyQuestionType;
  allow_other: boolean;
  display_order: number;
  is_required: boolean;
  help_text: string | null;
}

interface OptionSnapshotRow {
  id: number;
  question_id: number;
  option_text: string;
  display_order: number;
}

interface AnswerTagSnapshotRow {
  answer_option_id: number;
  tag_key: string;
  tag_value: string;
}

interface ValueTagSnapshotRow {
  question_id: number;
  integer_min: number | null;
  integer_max: number | null;
  tag_key: string;
  tag_value: string;
}

interface OtherTagSnapshotRow {
  question_id: number;
  tag_key: string;
  tag_value: string;
}

interface ExcludedLogicRow {
  id: number;
  condition_operator: ConditionalLogicConditionOperator;
  action_type: ConditionalLogicActionType;
  source_page_id: number | null;
  source_page_title: string | null;
  source_question_id: number | null;
  source_question_text: string | null;
  source_answer_option_id: number | null;
  source_answer_option_text: string | null;
  target_page_id: number | null;
  target_page_title: string | null;
  target_question_id: number | null;
  target_question_text: string | null;
  target_question_page_id: number | null;
  target_question_page_title: string | null;
}

function mapTemplateSummary(record: SurveyTemplateSummaryRecord): SurveyPageTemplateSummary {
  return {
    id: record.id,
    templateKind: record.template_kind,
    name: record.name,
    description: record.description,
    sourceEntityKind: record.source_entity_kind,
    sourceEntityId: record.source_entity_id,
    sourceSurveyId: record.source_survey_id,
    sourceSurveyTitle: record.source_survey_title,
    sourcePageTitle: record.source_page_title,
    payloadSchemaVersion: record.payload_schema_version,
    questionCount: record.question_count,
    excludedLogicCount: record.excluded_logic_count,
    createdByUserId: record.created_by_user_id,
    updatedByUserId: record.updated_by_user_id,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString()
  };
}

function mapTemplateDetail(record: SurveyTemplateRecord): SurveyPageTemplateDetail {
  return {
    ...mapTemplateSummary({
      ...record,
      question_count: record.payload.page.questions.length,
      excluded_logic_count: record.excluded_logic.length
    }),
    page: record.payload.page,
    excludedLogic: record.excluded_logic
  };
}

export async function listPageTemplates(queryable: Queryable): Promise<SurveyPageTemplateSummary[]> {
  const result = await queryable.query<SurveyTemplateSummaryRecord>(
    `select
       id,
       template_kind,
       name,
       description,
       source_entity_kind,
       source_entity_id,
       source_survey_id,
       source_survey_title,
       source_page_title,
       payload_schema_version,
       jsonb_array_length(payload->'page'->'questions') as question_count,
       jsonb_array_length(excluded_logic) as excluded_logic_count,
       created_by_user_id,
       updated_by_user_id,
       created_at,
       updated_at
     from survey_templates
     where template_kind = 'page'
     order by lower(name), id`
  );

  return result.rows.map(mapTemplateSummary);
}

export async function fetchPageTemplate(
  queryable: Queryable,
  templateId: number
): Promise<SurveyPageTemplateDetail | null> {
  const record = await fetchPageTemplateRecord(queryable, templateId);

  return record ? mapTemplateDetail(record) : null;
}

export async function updatePageTemplateMetadata(
  queryable: Queryable,
  templateId: number,
  input: { name: string; description: string | null; userId: number }
): Promise<SurveyPageTemplateDetail | null> {
  const result = await queryable.query<SurveyTemplateRecord>(
    `update survey_templates
     set name = $2,
         description = $3,
         updated_by_user_id = $4,
         updated_at = now()
     where id = $1
       and template_kind = 'page'
     returning
       id,
       template_kind,
       name,
       description,
       source_entity_kind,
       source_entity_id,
       source_survey_id,
       source_survey_title,
       source_page_title,
       payload_schema_version,
       payload,
       excluded_logic,
       created_by_user_id,
       updated_by_user_id,
       created_at,
       updated_at`,
    [templateId, input.name, input.description, input.userId]
  );

  return result.rows[0] ? mapTemplateDetail(result.rows[0]) : null;
}

export async function deletePageTemplate(
  queryable: Queryable,
  templateId: number
): Promise<boolean> {
  const result = await queryable.query(
    `delete from survey_templates
     where id = $1
       and template_kind = 'page'`,
    [templateId]
  );

  return (result.rowCount ?? 0) > 0;
}

export async function savePageTemplateFromSurveyPage(
  queryable: Queryable,
  input: {
    survey: SurveyRecord;
    pageId: number;
    name: string;
    description: string | null;
    pageTitle: string | null;
    userId: number;
  }
): Promise<SurveyPageTemplateDetail | null> {
  const snapshot = await buildPageTemplateSnapshot(queryable, input.survey.id, input.pageId);

  if (!snapshot) {
    return null;
  }

  const sourcePageTitle = snapshot.page.title;

  if (input.pageTitle !== null) {
    snapshot.page.title = input.pageTitle;
  }

  const excludedLogic = await buildExcludedLogicManifest(
    queryable,
    input.survey.id,
    input.pageId
  );

  const result = await queryable.query<SurveyTemplateRecord>(
    `insert into survey_templates (
       template_kind,
       name,
       description,
       source_entity_kind,
       source_entity_id,
       source_survey_id,
       source_survey_title,
       source_page_title,
       payload_schema_version,
       payload,
       excluded_logic,
       created_by_user_id,
       updated_by_user_id
     )
     values ('page', $1, $2, 'survey_page', $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $10)
     returning
       id,
       template_kind,
       name,
       description,
       source_entity_kind,
       source_entity_id,
       source_survey_id,
       source_survey_title,
       source_page_title,
       payload_schema_version,
       payload,
       excluded_logic,
       created_by_user_id,
       updated_by_user_id,
       created_at,
       updated_at`,
    [
      input.name,
      input.description,
      input.pageId,
      input.survey.id,
      input.survey.title,
      sourcePageTitle,
      pageTemplateSchemaVersion,
      JSON.stringify(snapshot),
      JSON.stringify(excludedLogic),
      input.userId
    ]
  );

  return mapTemplateDetail(result.rows[0]);
}

export async function insertPageTemplateIntoSurvey(
  queryable: Queryable,
  input: {
    surveyId: number;
    templateId: number;
    displayOrder: number | null;
  }
): Promise<"template-not-found" | void> {
  const template = await fetchPageTemplateRecord(queryable, input.templateId);

  if (!template) {
    return "template-not-found";
  }

  const snapshot = template.payload;
  const displayOrder =
    input.displayOrder ?? (await fetchNextPageDisplayOrder(queryable, input.surveyId));

  await shiftPageDisplayOrdersForInsert(queryable, input.surveyId, displayOrder);

  const pageResult = await queryable.query<{ id: number }>(
    `insert into survey_pages (survey_id, title, description, display_order)
     values ($1, $2, $3, $4)
     returning id`,
    [input.surveyId, snapshot.page.title, snapshot.page.description, displayOrder]
  );
  const newPageId = pageResult.rows[0].id;

  for (const question of snapshot.page.questions) {
    const questionResult = await queryable.query<{ id: number }>(
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
        input.surveyId,
        newPageId,
        question.questionText,
        question.questionType,
        question.allowOther,
        question.displayOrder,
        question.isRequired,
        question.helpText
      ]
    );
    const newQuestionId = questionResult.rows[0].id;

    for (const option of optionsForInsert(question)) {
      const optionResult = await queryable.query<{ id: number }>(
        `insert into answer_options (question_id, option_text, display_order)
         values ($1, $2, $3)
         returning id`,
        [newQuestionId, option.optionText, option.displayOrder]
      );
      const newOptionId = optionResult.rows[0].id;

      for (const tag of option.answerTags) {
        await queryable.query(
          `insert into answer_tags (answer_option_id, tag_key, tag_value)
           values ($1, $2, $3)`,
          [newOptionId, tag.tagKey, tag.tagValue]
        );
        await registerTagDefinition(queryable, tag.tagKey, tag.tagValue);
      }
    }

    for (const valueTag of question.valueTags) {
      await queryable.query(
        `insert into question_value_tags (question_id, integer_min, integer_max, tag_key, tag_value)
         values ($1, $2, $3, $4, $5)`,
        [
          newQuestionId,
          valueTag.integerMin,
          valueTag.integerMax,
          valueTag.tagKey,
          valueTag.tagValue
        ]
      );
      await registerTagDefinition(queryable, valueTag.tagKey, valueTag.tagValue);
    }

    for (const otherTag of question.otherTags) {
      await queryable.query(
        `insert into question_other_tags (question_id, tag_key, tag_value)
         values ($1, $2, $3)`,
        [newQuestionId, otherTag.tagKey, otherTag.tagValue]
      );
      await registerTagDefinition(queryable, otherTag.tagKey, otherTag.tagValue);
    }
  }
}

async function fetchPageTemplateRecord(
  queryable: Queryable,
  templateId: number
): Promise<SurveyTemplateRecord | null> {
  const result = await queryable.query<SurveyTemplateRecord>(
    `select
       id,
       template_kind,
       name,
       description,
       source_entity_kind,
       source_entity_id,
       source_survey_id,
       source_survey_title,
       source_page_title,
       payload_schema_version,
       payload,
       excluded_logic,
       created_by_user_id,
       updated_by_user_id,
       created_at,
       updated_at
     from survey_templates
     where id = $1
       and template_kind = 'page'`,
    [templateId]
  );

  return result.rows[0] ?? null;
}

async function buildPageTemplateSnapshot(
  queryable: Queryable,
  surveyId: number,
  pageId: number
): Promise<SurveyPageTemplateSnapshot | null> {
  const pageResult = await queryable.query<PageSnapshotRow>(
    `select id, title, description
     from survey_pages
     where id = $1
       and survey_id = $2`,
    [pageId, surveyId]
  );
  const page = pageResult.rows[0];

  if (!page) {
    return null;
  }

  const questionsResult = await queryable.query<QuestionSnapshotRow>(
    `select id, question_text, question_type, allow_other, display_order, is_required, help_text
     from survey_questions
     where survey_id = $1
       and page_id = $2
     order by display_order, id`,
    [surveyId, pageId]
  );
  const questionIds = questionsResult.rows.map((question) => question.id);

  const optionsResult =
    questionIds.length > 0
      ? await queryable.query<OptionSnapshotRow>(
          `select id, question_id, option_text, display_order
           from answer_options
           where question_id = any($1::int[])
           order by question_id, display_order, id`,
          [questionIds]
        )
      : { rows: [] as OptionSnapshotRow[] };
  const optionIds = optionsResult.rows.map((option) => option.id);

  const answerTagsResult =
    optionIds.length > 0
      ? await queryable.query<AnswerTagSnapshotRow>(
          `select answer_option_id, tag_key, tag_value
           from answer_tags
           where answer_option_id = any($1::int[])
           order by answer_option_id, tag_key, tag_value, id`,
          [optionIds]
        )
      : { rows: [] as AnswerTagSnapshotRow[] };

  const valueTagsResult =
    questionIds.length > 0
      ? await queryable.query<ValueTagSnapshotRow>(
          `select question_id, integer_min, integer_max, tag_key, tag_value
           from question_value_tags
           where question_id = any($1::int[])
           order by question_id, tag_key, tag_value, id`,
          [questionIds]
        )
      : { rows: [] as ValueTagSnapshotRow[] };

  const otherTagsResult =
    questionIds.length > 0
      ? await queryable.query<OtherTagSnapshotRow>(
          `select question_id, tag_key, tag_value
           from question_other_tags
           where question_id = any($1::int[])
           order by question_id, tag_key, tag_value, id`,
          [questionIds]
        )
      : { rows: [] as OtherTagSnapshotRow[] };

  const answerTagsByOptionId = new Map<number, SurveyPageTemplateSnapshotAnswerOption["answerTags"]>();

  for (const tag of answerTagsResult.rows) {
    const tags = answerTagsByOptionId.get(tag.answer_option_id) ?? [];
    tags.push({ tagKey: tag.tag_key, tagValue: tag.tag_value });
    answerTagsByOptionId.set(tag.answer_option_id, tags);
  }

  const optionsByQuestionId = new Map<number, SurveyPageTemplateSnapshotAnswerOption[]>();

  for (const option of optionsResult.rows) {
    const options = optionsByQuestionId.get(option.question_id) ?? [];
    options.push({
      optionText: option.option_text,
      displayOrder: option.display_order,
      answerTags: answerTagsByOptionId.get(option.id) ?? []
    });
    optionsByQuestionId.set(option.question_id, options);
  }

  const valueTagsByQuestionId = new Map<number, SurveyPageTemplateSnapshotQuestion["valueTags"]>();

  for (const tag of valueTagsResult.rows) {
    const tags = valueTagsByQuestionId.get(tag.question_id) ?? [];
    tags.push({
      integerMin: tag.integer_min,
      integerMax: tag.integer_max,
      tagKey: tag.tag_key,
      tagValue: tag.tag_value
    });
    valueTagsByQuestionId.set(tag.question_id, tags);
  }

  const otherTagsByQuestionId = new Map<number, SurveyPageTemplateSnapshotQuestion["otherTags"]>();

  for (const tag of otherTagsResult.rows) {
    const tags = otherTagsByQuestionId.get(tag.question_id) ?? [];
    tags.push({ tagKey: tag.tag_key, tagValue: tag.tag_value });
    otherTagsByQuestionId.set(tag.question_id, tags);
  }

  const questions = questionsResult.rows.map((question) => {
    const answerOptions = optionsByQuestionId.get(question.id) ?? [];
    const scaleRange = deriveScaleRange(question.question_type, answerOptions);

    return {
      questionText: question.question_text,
      questionType: question.question_type,
      allowOther: question.allow_other,
      scaleMin: scaleRange?.min ?? null,
      scaleMax: scaleRange?.max ?? null,
      displayOrder: question.display_order,
      isRequired: question.is_required,
      helpText: question.help_text,
      answerOptions,
      valueTags: valueTagsByQuestionId.get(question.id) ?? [],
      otherTags: otherTagsByQuestionId.get(question.id) ?? []
    };
  });

  return {
    schemaVersion: pageTemplateSchemaVersion,
    kind: "page",
    page: {
      title: page.title,
      description: page.description,
      questions
    }
  };
}

async function buildExcludedLogicManifest(
  queryable: Queryable,
  surveyId: number,
  pageId: number
): Promise<SurveyTemplateExcludedLogicEntry[]> {
  const result = await queryable.query<ExcludedLogicRow>(
    `select
       rules.id,
       rules.condition_operator,
       rules.action_type,
       coalesce(rules.source_page_id, source_question.page_id) as source_page_id,
       source_page.title as source_page_title,
       source_question.id as source_question_id,
       source_question.question_text as source_question_text,
       source_option.id as source_answer_option_id,
       source_option.option_text as source_answer_option_text,
       rules.target_page_id,
       target_page.title as target_page_title,
       target_question.id as target_question_id,
       target_question.question_text as target_question_text,
       target_question.page_id as target_question_page_id,
       target_question_page.title as target_question_page_title
     from conditional_logic_rules rules
     left join survey_questions source_question
       on source_question.id = rules.source_question_id
      and source_question.survey_id = rules.survey_id
     left join survey_pages source_page
       on source_page.id = coalesce(rules.source_page_id, source_question.page_id)
      and source_page.survey_id = rules.survey_id
     left join answer_options source_option
       on source_option.id = rules.source_answer_option_id
      and source_option.question_id = rules.source_question_id
     left join survey_questions target_question
       on target_question.id = rules.target_question_id
      and target_question.survey_id = rules.survey_id
     left join survey_pages target_question_page
       on target_question_page.id = target_question.page_id
      and target_question_page.survey_id = rules.survey_id
     left join survey_pages target_page
       on target_page.id = rules.target_page_id
      and target_page.survey_id = rules.survey_id
     where rules.survey_id = $1
       and (
         coalesce(rules.source_page_id, source_question.page_id) = $2
         or target_question.page_id = $2
         or rules.target_page_id = $2
       )
     order by rules.id`,
    [surveyId, pageId]
  );

  return result.rows.map((rule) => {
    const targetPageId = rule.target_page_id ?? rule.target_question_page_id;
    const targetPageTitle = rule.target_page_title ?? rule.target_question_page_title;

    return {
      sourceRuleId: rule.id,
      conditionLabel: formatConditionLabel(rule),
      actionLabel: formatActionLabel(rule),
      source: {
        pageId: rule.source_page_id,
        pageTitle: rule.source_page_title,
        questionId: rule.source_question_id,
        questionText: rule.source_question_text,
        answerOptionId: rule.source_answer_option_id,
        answerOptionText: rule.source_answer_option_text
      },
      target: {
        pageId: targetPageId,
        pageTitle: targetPageTitle,
        questionId: rule.target_question_id,
        questionText: rule.target_question_text,
        answerOptionId: null,
        answerOptionText: null
      },
      crossesPageBoundary:
        rule.source_page_id !== pageId || (targetPageId !== null && targetPageId !== pageId)
    };
  });
}

function deriveScaleRange(
  questionType: SurveyQuestionType,
  answerOptions: SurveyPageTemplateSnapshotAnswerOption[]
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

  return { min: Math.min(...values), max: Math.max(...values) };
}

function optionsForInsert(
  question: SurveyPageTemplateSnapshotQuestion
): SurveyPageTemplateSnapshotAnswerOption[] {
  if (
    question.questionType === "scale" &&
    question.scaleMin !== null &&
    question.scaleMax !== null
  ) {
    const existingTagsByText = new Map(
      question.answerOptions.map((option) => [option.optionText, option.answerTags])
    );

    return buildScaleValues(question.scaleMin, question.scaleMax).map((value, index) => ({
      optionText: String(value),
      displayOrder: index + 1,
      answerTags: existingTagsByText.get(String(value)) ?? []
    }));
  }

  return question.answerOptions;
}

function formatConditionLabel(rule: ExcludedLogicRow): string {
  if (rule.condition_operator === "is_blank") {
    return `${rule.source_question_text ?? "Question"} is blank`;
  }

  return `${rule.source_question_text ?? "Question"} equals ${rule.source_answer_option_text ?? "option"}`;
}

function formatActionLabel(rule: ExcludedLogicRow): string {
  const target =
    rule.target_question_text ??
    rule.target_page_title ??
    rule.target_question_page_title ??
    "target";

  switch (rule.action_type) {
    case "HIDE_PAGE":
      return `Hide page ${target}`;
    case "HIDE_QUESTION":
      return `Hide question ${target}`;
    case "JUMP_TO_PAGE":
      return `Jump to page ${target}`;
    case "JUMP_TO_QUESTION":
      return `Jump to question ${target}`;
    case "END_SURVEY":
      return "End survey";
    case "SHOW_QUESTION":
      return `Show question ${target}`;
  }
}
