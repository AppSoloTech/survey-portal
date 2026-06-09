import express from "express";
import type {
  AnswerOption,
  AnswerTag,
  ConditionalLogicActionType,
  ConditionalLogicConditionOperator,
  ConditionalLogicRule,
  Survey,
  SurveyQuestion,
  SurveyQuestionType,
  SurveyStatus
} from "@survey-portal/shared";

import { pool } from "../db.js";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middleware/auth.js";

export const surveysRouter = express.Router();

surveysRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const requester = (req as AuthenticatedRequest).user;
    const isAdmin = requester?.role === "admin";
    const surveys = await fetchSurveyStructures({
      includeAllStatuses: isAdmin,
      includeHiddenTags: isAdmin
    });

    res.json({ surveys });
  } catch (error) {
    next(error);
  }
});

surveysRouter.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const id = readPositiveIntegerParam(req.params.id);

    if (!id) {
      res.status(400).json({ error: "Survey id must be a positive integer" });
      return;
    }

    const requester = (req as AuthenticatedRequest).user;
    const isAdmin = requester?.role === "admin";
    const surveys = await fetchSurveyStructures({
      surveyId: id,
      includeAllStatuses: isAdmin,
      includeHiddenTags: isAdmin
    });
    const survey = surveys[0];

    if (!survey) {
      res.status(404).json({ error: "Survey not found" });
      return;
    }

    res.json({ survey });
  } catch (error) {
    next(error);
  }
});

surveysRouter.post("/", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const validation = validateSurveyBody(req.body);

    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const user = (req as AuthenticatedRequest).user;
    const result = await pool.query<{ id: number }>(
      `insert into surveys (
         title,
         description,
         status,
         created_by_user_id,
         published_at,
         retired_at
       )
       values (
         $1,
         $2,
         $3,
         $4,
         case when $3 = 'published' then now() else null end,
         case when $3 = 'retired' then now() else null end
       )
       returning id`,
      [
        validation.value.title,
        validation.value.description,
        validation.value.status,
        user.id
      ]
    );

    const [survey] = await fetchSurveyStructures({
      surveyId: result.rows[0].id,
      includeAllStatuses: true,
      includeHiddenTags: true
    });

    res.status(201).json({ survey });
  } catch (error) {
    next(error);
  }
});

surveysRouter.put("/:id", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const id = readPositiveIntegerParam(req.params.id);

    if (!id) {
      res.status(400).json({ error: "Survey id must be a positive integer" });
      return;
    }

    const validation = validateSurveyBody(req.body);

    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const result = await pool.query<{ id: number }>(
      `with existing as (
         select id, published_at, retired_at
         from surveys
         where id = $1
       )
       update surveys
       set
         title = $2,
         description = $3,
         status = $4,
         updated_at = now(),
         published_at = case
           when $4 = 'published' then coalesce(existing.published_at, now())
           when $4 = 'retired' then existing.published_at
           else null
         end,
         retired_at = case
           when $4 = 'retired' then coalesce(existing.retired_at, now())
           else null
         end
       from existing
       where surveys.id = existing.id
       returning surveys.id`,
      [id, validation.value.title, validation.value.description, validation.value.status]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: "Survey not found" });
      return;
    }

    const [survey] = await fetchSurveyStructures({
      surveyId: id,
      includeAllStatuses: true,
      includeHiddenTags: true
    });

    res.json({ survey });
  } catch (error) {
    next(error);
  }
});

interface SurveyRecord {
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

interface SurveyQuestionRecord {
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

interface AnswerOptionRecord {
  id: number;
  question_id: number;
  option_text: string;
  display_order: number;
  created_at: Date;
  updated_at: Date;
}

interface AnswerTagRecord {
  id: number;
  answer_option_id: number;
  tag_key: string;
  tag_value: string;
  created_at: Date;
  updated_at: Date;
}

interface ConditionalLogicRuleRecord {
  id: number;
  survey_id: number;
  source_question_id: number;
  source_answer_option_id: number;
  condition_operator: ConditionalLogicConditionOperator;
  action_type: ConditionalLogicActionType;
  target_question_id: number | null;
  target_page_id: number | null;
  created_at: Date;
  updated_at: Date;
}

interface FetchSurveyStructuresOptions {
  surveyId?: number;
  includeAllStatuses: boolean;
  includeHiddenTags: boolean;
}

async function fetchSurveyStructures(options: FetchSurveyStructuresOptions): Promise<Survey[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (!options.includeAllStatuses) {
    conditions.push("status = 'published'");
  }

  if (options.surveyId !== undefined) {
    values.push(options.surveyId);
    conditions.push(`id = $${values.length}`);
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

function mapSurveyRecord(
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

function mapSurveyQuestionRecord(
  record: SurveyQuestionRecord,
  answerOptions: AnswerOption[]
): SurveyQuestion {
  return {
    id: record.id,
    surveyId: record.survey_id,
    questionText: record.question_text,
    questionType: record.question_type,
    displayOrder: record.display_order,
    isRequired: record.is_required,
    helpText: record.help_text,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString(),
    answerOptions
  };
}

function mapAnswerOptionRecord(record: AnswerOptionRecord): AnswerOption {
  return {
    id: record.id,
    questionId: record.question_id,
    optionText: record.option_text,
    displayOrder: record.display_order,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString()
  };
}

function mapAnswerTagRecord(record: AnswerTagRecord): AnswerTag {
  return {
    id: record.id,
    answerOptionId: record.answer_option_id,
    tagKey: record.tag_key,
    tagValue: record.tag_value,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString()
  };
}

function mapConditionalLogicRuleRecord(record: ConditionalLogicRuleRecord): ConditionalLogicRule {
  return {
    id: record.id,
    surveyId: record.survey_id,
    sourceQuestionId: record.source_question_id,
    sourceAnswerOptionId: record.source_answer_option_id,
    conditionOperator: record.condition_operator,
    actionType: record.action_type,
    targetQuestionId: record.target_question_id,
    targetPageId: record.target_page_id,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString()
  };
}

function validateSurveyBody(body: unknown): ValidationResult<{
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

function readPositiveIntegerParam(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readTextField(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  return typeof value === "string" ? value.trim() : "";
}

function readOptionalTextField(body: Record<string, unknown>, field: string): string | null {
  const value = body[field];

  if (value === null || value === undefined) {
    return null;
  }

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isSurveyStatus(value: string): value is SurveyStatus {
  return value === "draft" || value === "published" || value === "retired";
}
