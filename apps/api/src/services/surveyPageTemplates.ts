import type {
  ConditionalLogicActionType,
  ConditionalLogicConditionOperator,
  SurveyPageTemplateDetail,
  SurveyPageTemplateSnapshot,
  SurveyPageTemplateSnapshotAnswerOption,
  SurveyPageTemplateSnapshotQuestion,
  SurveyPageTemplateSummary,
  SurveyQuestionTemplateDetail,
  SurveyQuestionTemplateSnapshot,
  SurveyTemplateDetail,
  SurveyTemplateExcludedLogicEntry,
  SurveyTemplateKind,
  SurveyTemplateSummary,
  SurveyQuestionType
} from "@survey-portal/shared";

import {
  buildScaleValues,
  parseScaleOptionValue,
  type Queryable,
  type SurveyRecord
} from "./surveyRecords.js";
import {
  fetchNextPageDisplayOrder,
  fetchNextQuestionDisplayOrder,
  registerTagDefinition,
  shiftPageDisplayOrdersForInsert,
  shiftQuestionDisplayOrdersForInsert
} from "./surveyBuilder.js";

const templateSchemaVersion = 1;

type SurveyTemplatePayload = SurveyPageTemplateSnapshot | SurveyQuestionTemplateSnapshot;

interface SurveyTemplateRecord {
  id: number;
  template_kind: SurveyTemplateKind;
  name: string;
  description: string | null;
  source_entity_kind: string | null;
  source_entity_id: number | null;
  source_survey_id: number | null;
  source_survey_title: string | null;
  source_page_title: string | null;
  source_question_title: string | null;
  payload_schema_version: number;
  payload: SurveyTemplatePayload;
  excluded_logic: SurveyTemplateExcludedLogicEntry[];
  created_by_user_id: number | null;
  updated_by_user_id: number | null;
  created_at: Date;
  updated_at: Date;
}

interface SurveyTemplateSummaryRecord {
  id: number;
  template_kind: SurveyTemplateKind;
  name: string;
  description: string | null;
  source_entity_kind: string | null;
  source_entity_id: number | null;
  source_survey_id: number | null;
  source_survey_title: string | null;
  source_page_title: string | null;
  source_question_title: string | null;
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

interface QuestionWithPageSnapshotRow extends QuestionSnapshotRow {
  page_id: number;
  page_title: string;
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

function mapTemplateSummary(record: SurveyTemplateSummaryRecord): SurveyTemplateSummary {
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
    sourceQuestionTitle: record.source_question_title,
    payloadSchemaVersion: record.payload_schema_version,
    questionCount: record.question_count,
    excludedLogicCount: record.excluded_logic_count,
    createdByUserId: record.created_by_user_id,
    updatedByUserId: record.updated_by_user_id,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString()
  };
}

function questionCountFromPayload(payload: SurveyTemplatePayload): number {
  return payload.kind === "page" ? payload.page.questions.length : 1;
}

function mapTemplateDetail(record: SurveyTemplateRecord): SurveyTemplateDetail {
  const summary = mapTemplateSummary({
    ...record,
    question_count: questionCountFromPayload(record.payload),
    excluded_logic_count: record.excluded_logic.length
  });

  if (record.payload.kind === "page") {
    return {
      ...summary,
      page: record.payload.page,
      excludedLogic: record.excluded_logic
    };
  }

  return {
    ...summary,
    question: record.payload.question,
    excludedLogic: record.excluded_logic
  };
}

export async function listTemplates(
  queryable: Queryable,
  input: { kind?: SurveyTemplateKind | null; search?: string | null } = {}
): Promise<SurveyTemplateSummary[]> {
  const normalizedSearch = input.search?.trim() ? input.search.trim() : null;
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
       source_question_title,
       payload_schema_version,
       case
         when template_kind = 'page' then jsonb_array_length(payload->'page'->'questions')
         else 1
       end as question_count,
       jsonb_array_length(excluded_logic) as excluded_logic_count,
       created_by_user_id,
       updated_by_user_id,
       created_at,
       updated_at
     from survey_templates
     where ($1::text is null or template_kind = $1)
       and (
         $2::text is null
         or lower(name) like '%' || lower($2) || '%'
         or lower(coalesce(description, '')) like '%' || lower($2) || '%'
         or lower(coalesce(source_survey_title, '')) like '%' || lower($2) || '%'
         or lower(coalesce(source_page_title, '')) like '%' || lower($2) || '%'
         or lower(coalesce(source_question_title, '')) like '%' || lower($2) || '%'
       )
     order by template_kind, lower(name), id`,
    [input.kind ?? null, normalizedSearch]
  );

  return result.rows.map(mapTemplateSummary);
}

export async function listPageTemplates(queryable: Queryable): Promise<SurveyPageTemplateSummary[]> {
  return (await listTemplates(queryable, { kind: "page" })) as SurveyPageTemplateSummary[];
}

export async function fetchTemplate(
  queryable: Queryable,
  templateId: number
): Promise<SurveyTemplateDetail | null> {
  const record = await fetchTemplateRecord(queryable, templateId);

  return record ? mapTemplateDetail(record) : null;
}

export async function fetchPageTemplate(
  queryable: Queryable,
  templateId: number
): Promise<SurveyPageTemplateDetail | null> {
  const record = await fetchTemplateRecord(queryable, templateId, "page");

  return record ? (mapTemplateDetail(record) as SurveyPageTemplateDetail) : null;
}

export async function updateTemplateMetadata(
  queryable: Queryable,
  templateId: number,
  input: { name: string; description: string | null; userId: number; kind?: SurveyTemplateKind }
): Promise<SurveyTemplateDetail | null> {
  const result = await queryable.query<SurveyTemplateRecord>(
    `update survey_templates
     set name = $2,
         description = $3,
         updated_by_user_id = $4,
         updated_at = now()
     where id = $1
       and ($5::text is null or template_kind = $5)
     returning
       ${templateRecordColumns}`,
    [templateId, input.name, input.description, input.userId, input.kind ?? null]
  );

  return result.rows[0] ? mapTemplateDetail(result.rows[0]) : null;
}

export async function updatePageTemplateMetadata(
  queryable: Queryable,
  templateId: number,
  input: { name: string; description: string | null; userId: number }
): Promise<SurveyPageTemplateDetail | null> {
  const template = await updateTemplateMetadata(queryable, templateId, { ...input, kind: "page" });

  return template ? (template as SurveyPageTemplateDetail) : null;
}

export async function deleteTemplate(
  queryable: Queryable,
  templateId: number,
  kind?: SurveyTemplateKind
): Promise<boolean> {
  const result = await queryable.query(
    `delete from survey_templates
     where id = $1
       and ($2::text is null or template_kind = $2)`,
    [templateId, kind ?? null]
  );

  return (result.rowCount ?? 0) > 0;
}

export async function deletePageTemplate(
  queryable: Queryable,
  templateId: number
): Promise<boolean> {
  return deleteTemplate(queryable, templateId, "page");
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

  const excludedLogic = await buildPageExcludedLogicManifest(
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
       source_question_title,
       payload_schema_version,
       payload,
       excluded_logic,
       created_by_user_id,
       updated_by_user_id
     )
     values ('page', $1, $2, 'survey_page', $3, $4, $5, $6, null, $7, $8::jsonb, $9::jsonb, $10, $10)
     returning
       ${templateRecordColumns}`,
    [
      input.name,
      input.description,
      input.pageId,
      input.survey.id,
      input.survey.title,
      sourcePageTitle,
      templateSchemaVersion,
      JSON.stringify(snapshot),
      JSON.stringify(excludedLogic),
      input.userId
    ]
  );

  return mapTemplateDetail(result.rows[0]) as SurveyPageTemplateDetail;
}

export async function saveQuestionTemplateFromSurveyQuestion(
  queryable: Queryable,
  input: {
    survey: SurveyRecord;
    questionId: number;
    name: string;
    description: string | null;
    questionText: string | null;
    userId: number;
  }
): Promise<SurveyQuestionTemplateDetail | null> {
  const source = await fetchQuestionSnapshotSource(queryable, input.survey.id, input.questionId);

  if (!source) {
    return null;
  }

  const snapshotMap = await buildQuestionSnapshotMap(queryable, [source]);
  const question = snapshotMap.get(source.id);

  if (!question) {
    return null;
  }

  const sourceQuestionTitle = question.questionText;

  if (input.questionText !== null) {
    question.questionText = input.questionText;
  }

  const snapshot: SurveyQuestionTemplateSnapshot = {
    schemaVersion: templateSchemaVersion,
    kind: "question",
    question
  };
  const excludedLogic = await buildQuestionExcludedLogicManifest(
    queryable,
    input.survey.id,
    input.questionId,
    source.page_id
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
       source_question_title,
       payload_schema_version,
       payload,
       excluded_logic,
       created_by_user_id,
       updated_by_user_id
     )
     values ('question', $1, $2, 'survey_question', $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $11)
     returning
       ${templateRecordColumns}`,
    [
      input.name,
      input.description,
      input.questionId,
      input.survey.id,
      input.survey.title,
      source.page_title,
      sourceQuestionTitle,
      templateSchemaVersion,
      JSON.stringify(snapshot),
      JSON.stringify(excludedLogic),
      input.userId
    ]
  );

  return mapTemplateDetail(result.rows[0]) as SurveyQuestionTemplateDetail;
}

export async function insertPageTemplateIntoSurvey(
  queryable: Queryable,
  input: {
    surveyId: number;
    templateId: number;
    displayOrder: number | null;
  }
): Promise<"template-not-found" | void> {
  const template = await fetchTemplateRecord(queryable, input.templateId, "page");

  if (!template || template.payload.kind !== "page") {
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
    await insertQuestionSnapshot(queryable, input.surveyId, newPageId, question, question.displayOrder);
  }
}

export async function insertQuestionTemplateIntoSurveyPage(
  queryable: Queryable,
  input: {
    surveyId: number;
    pageId: number;
    templateId: number;
    displayOrder: number | null;
  }
): Promise<"template-not-found" | void> {
  const template = await fetchTemplateRecord(queryable, input.templateId, "question");

  if (!template || template.payload.kind !== "question") {
    return "template-not-found";
  }

  const displayOrder =
    input.displayOrder ?? (await fetchNextQuestionDisplayOrder(queryable, input.pageId));

  await shiftQuestionDisplayOrdersForInsert(queryable, input.pageId, displayOrder);
  await insertQuestionSnapshot(
    queryable,
    input.surveyId,
    input.pageId,
    template.payload.question,
    displayOrder
  );
}

const templateRecordColumns = `
  id,
  template_kind,
  name,
  description,
  source_entity_kind,
  source_entity_id,
  source_survey_id,
  source_survey_title,
  source_page_title,
  source_question_title,
  payload_schema_version,
  payload,
  excluded_logic,
  created_by_user_id,
  updated_by_user_id,
  created_at,
  updated_at
`;

async function fetchTemplateRecord(
  queryable: Queryable,
  templateId: number,
  kind?: SurveyTemplateKind
): Promise<SurveyTemplateRecord | null> {
  const result = await queryable.query<SurveyTemplateRecord>(
    `select
       ${templateRecordColumns}
     from survey_templates
     where id = $1
       and ($2::text is null or template_kind = $2)`,
    [templateId, kind ?? null]
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
  const questionSnapshots = await buildQuestionSnapshotMap(queryable, questionsResult.rows);

  return {
    schemaVersion: templateSchemaVersion,
    kind: "page",
    page: {
      title: page.title,
      description: page.description,
      questions: questionsResult.rows.flatMap((question) => {
        const snapshot = questionSnapshots.get(question.id);
        return snapshot ? [snapshot] : [];
      })
    }
  };
}

async function fetchQuestionSnapshotSource(
  queryable: Queryable,
  surveyId: number,
  questionId: number
): Promise<QuestionWithPageSnapshotRow | null> {
  const result = await queryable.query<QuestionWithPageSnapshotRow>(
    `select
       questions.id,
       questions.question_text,
       questions.question_type,
       questions.allow_other,
       questions.display_order,
       questions.is_required,
       questions.help_text,
       questions.page_id,
       pages.title as page_title
     from survey_questions questions
     join survey_pages pages
       on pages.id = questions.page_id
      and pages.survey_id = questions.survey_id
     where questions.id = $1
       and questions.survey_id = $2`,
    [questionId, surveyId]
  );

  return result.rows[0] ?? null;
}

async function buildQuestionSnapshotMap(
  queryable: Queryable,
  questions: QuestionSnapshotRow[]
): Promise<Map<number, SurveyPageTemplateSnapshotQuestion>> {
  const questionIds = questions.map((question) => question.id);

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

  return new Map(
    questions.map((question) => {
      const answerOptions = optionsByQuestionId.get(question.id) ?? [];
      const scaleRange = deriveScaleRange(question.question_type, answerOptions);

      return [
        question.id,
        {
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
        }
      ];
    })
  );
}

async function insertQuestionSnapshot(
  queryable: Queryable,
  surveyId: number,
  pageId: number,
  question: SurveyPageTemplateSnapshotQuestion,
  displayOrder: number
): Promise<number> {
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
      surveyId,
      pageId,
      question.questionText,
      question.questionType,
      question.allowOther,
      displayOrder,
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

  return newQuestionId;
}

async function buildPageExcludedLogicManifest(
  queryable: Queryable,
  surveyId: number,
  pageId: number
): Promise<SurveyTemplateExcludedLogicEntry[]> {
  const result = await fetchExcludedLogicRows(
    queryable,
    `rules.survey_id = $1
       and (
         coalesce(rules.source_page_id, source_question.page_id) = $2
         or target_question.page_id = $2
         or rules.target_page_id = $2
       )`,
    [surveyId, pageId]
  );

  return result.rows.map((rule) => mapExcludedLogicRule(rule, pageId));
}

async function buildQuestionExcludedLogicManifest(
  queryable: Queryable,
  surveyId: number,
  questionId: number,
  pageId: number
): Promise<SurveyTemplateExcludedLogicEntry[]> {
  const optionResult = await queryable.query<{ id: number }>(
    `select id
     from answer_options
     where question_id = $1`,
    [questionId]
  );
  const optionIds = optionResult.rows.map((option) => option.id);
  const result = await fetchExcludedLogicRows(
    queryable,
    `rules.survey_id = $1
       and (
         rules.source_question_id = $2
         or rules.target_question_id = $2
         or ($3::int[] <> '{}'::int[] and rules.source_answer_option_id = any($3::int[]))
       )`,
    [surveyId, questionId, optionIds]
  );

  return result.rows.map((rule) => mapExcludedLogicRule(rule, pageId));
}

async function fetchExcludedLogicRows(
  queryable: Queryable,
  whereSql: string,
  values: unknown[]
): Promise<{ rows: ExcludedLogicRow[] }> {
  return queryable.query<ExcludedLogicRow>(
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
     where ${whereSql}
     order by rules.id`,
    values
  );
}

function mapExcludedLogicRule(
  rule: ExcludedLogicRow,
  sourcePageId: number
): SurveyTemplateExcludedLogicEntry {
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
      rule.source_page_id !== sourcePageId || (targetPageId !== null && targetPageId !== sourcePageId)
  };
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
