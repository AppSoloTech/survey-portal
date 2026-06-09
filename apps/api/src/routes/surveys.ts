import express from "express";
import pg from "pg";
import type { PoolClient } from "pg";
import type {
  AnswerOption,
  AnswerTag,
  AnswerSurveyResponse,
  ConditionalLogicActionType,
  ConditionalLogicConditionOperator,
  ConditionalLogicRule,
  CompleteSurveyResponse,
  MySurveyResponse,
  MySurveysResponse,
  StartSurveyResponse,
  Survey,
  SurveyAttempt,
  SurveyAttemptStatus,
  SurveyQuestion,
  SurveyQuestionType,
  SurveyResponseAnswer,
  SurveyStatus
} from "@survey-portal/shared";

import { pool } from "../db.js";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middleware/auth.js";

const { DatabaseError } = pg;

export const surveysRouter = express.Router();
export const mySurveysRouter = express.Router();

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

    if (validation.value.status === "published") {
      res.status(400).json({ error: "Create the survey questions before publishing" });
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

    const existingSurvey = await fetchSurveyRecord(pool, id);

    if (!existingSurvey) {
      res.status(404).json({ error: "Survey not found" });
      return;
    }

    const draftTransitionValidation = await validateReturnToDraft(
      pool,
      existingSurvey,
      validation.value.status
    );

    if (!draftTransitionValidation.ok) {
      res.status(409).json({ error: draftTransitionValidation.error });
      return;
    }

    if (validation.value.status === "published") {
      const publishValidation = await validateSurveyCanPublish(pool, id);

      if (!publishValidation.ok) {
        res.status(400).json({ error: publishValidation.error });
        return;
      }
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

surveysRouter.patch("/:id/status", requireAuth, requireRole("admin"), async (req, res, next) => {
  const id = readPositiveIntegerParam(req.params.id);

  if (!id) {
    res.status(400).json({ error: "Survey id must be a positive integer" });
    return;
  }

  const validation = validateSurveyStatusBody(req.body);

  if (!validation.ok) {
    res.status(400).json({ error: validation.error });
    return;
  }

  const client = await pool.connect();

  try {
    await client.query("begin");

    const survey = await fetchSurveyRecord(client, id);

    if (!survey) {
      await client.query("rollback");
      res.status(404).json({ error: "Survey not found" });
      return;
    }

    const draftTransitionValidation = await validateReturnToDraft(
      client,
      survey,
      validation.value.status
    );

    if (!draftTransitionValidation.ok) {
      await client.query("rollback");
      res.status(409).json({ error: draftTransitionValidation.error });
      return;
    }

    if (validation.value.status === "published") {
      const publishValidation = await validateSurveyCanPublish(client, id);

      if (!publishValidation.ok) {
        await client.query("rollback");
        res.status(400).json({ error: publishValidation.error });
        return;
      }
    }

    await client.query(
      `update surveys
       set status = $2,
           updated_at = now(),
           published_at = case
             when $2 = 'published' then coalesce(published_at, now())
             when $2 = 'draft' then null
             else published_at
           end,
           retired_at = case
             when $2 = 'retired' then coalesce(retired_at, now())
             else null
           end
       where id = $1`,
      [id, validation.value.status]
    );

    await client.query("commit");

    const [updatedSurvey] = await fetchSurveyStructures({
      surveyId: id,
      includeAllStatuses: true,
      includeHiddenTags: true
    });

    res.json({ survey: updatedSurvey });
  } catch (error) {
    await client.query("rollback");
    next(error);
  } finally {
    client.release();
  }
});

surveysRouter.post("/:id/questions", requireAuth, requireRole("admin"), async (req, res, next) => {
  const surveyId = readPositiveIntegerParam(req.params.id);

  if (!surveyId) {
    res.status(400).json({ error: "Survey id must be a positive integer" });
    return;
  }

  const validation = validateQuestionBody(req.body);

  if (!validation.ok) {
    res.status(400).json({ error: validation.error });
    return;
  }

  const client = await pool.connect();

  try {
    await client.query("begin");

    const survey = await fetchSurveyRecord(client, surveyId);

    if (!survey) {
      await client.query("rollback");
      res.status(404).json({ error: "Survey not found" });
      return;
    }

    const displayOrder =
      validation.value.displayOrder ??
      (await fetchNextQuestionDisplayOrder(client, surveyId));

    await shiftQuestionDisplayOrdersForInsert(client, surveyId, displayOrder);
    await client.query(
      `insert into survey_questions (
         survey_id,
         question_text,
         question_type,
         display_order,
         is_required,
         help_text
       )
       values ($1, $2, $3, $4, $5, $6)`,
      [
        surveyId,
        validation.value.questionText,
        validation.value.questionType,
        displayOrder,
        validation.value.isRequired,
        validation.value.helpText
      ]
    );

    await client.query("commit");

    const [updatedSurvey] = await fetchSurveyStructures({
      surveyId,
      includeAllStatuses: true,
      includeHiddenTags: true
    });

    res.status(201).json({ survey: updatedSurvey });
  } catch (error) {
    await client.query("rollback");
    next(error);
  } finally {
    client.release();
  }
});

surveysRouter.patch(
  "/:id/questions/reorder",
  requireAuth,
  requireRole("admin"),
  async (req, res, next) => {
    const surveyId = readPositiveIntegerParam(req.params.id);

    if (!surveyId) {
      res.status(400).json({ error: "Survey id must be a positive integer" });
      return;
    }

    const validation = validateReorderBody(req.body, "questionIds");

    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const client = await pool.connect();

    try {
      await client.query("begin");

      const survey = await fetchSurveyRecord(client, surveyId);

      if (!survey) {
        await client.query("rollback");
        res.status(404).json({ error: "Survey not found" });
        return;
      }

      const orderValidation = await validateQuestionReorderIds(
        client,
        surveyId,
        validation.value.ids
      );

      if (!orderValidation.ok) {
        await client.query("rollback");
        res.status(400).json({ error: orderValidation.error });
        return;
      }

      await reorderQuestions(client, surveyId, validation.value.ids);
      await client.query("commit");

      const [updatedSurvey] = await fetchSurveyStructures({
        surveyId,
        includeAllStatuses: true,
        includeHiddenTags: true
      });

      res.json({ survey: updatedSurvey });
    } catch (error) {
      await client.query("rollback");
      next(error);
    } finally {
      client.release();
    }
  }
);

surveysRouter.put(
  "/:id/questions/:questionId",
  requireAuth,
  requireRole("admin"),
  async (req, res, next) => {
    const surveyId = readPositiveIntegerParam(req.params.id);
    const questionId = readPositiveIntegerParam(req.params.questionId);

    if (!surveyId || !questionId) {
      res.status(400).json({ error: "Survey id and question id must be positive integers" });
      return;
    }

    const validation = validateQuestionBody(req.body);

    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }

    try {
      const survey = await fetchSurveyRecord(pool, surveyId);
      const question = await fetchQuestionForSurvey(pool, questionId, surveyId);

      if (!survey || !question) {
        res.status(404).json({ error: "Question not found" });
        return;
      }

      if (
        survey.status !== "draft" &&
        question.question_type !== validation.value.questionType
      ) {
        res.status(400).json({ error: "Question type can only be changed before publishing" });
        return;
      }

      await pool.query(
        `update survey_questions
         set question_text = $3,
             question_type = $4,
             is_required = $5,
             help_text = $6,
             updated_at = now()
         where survey_id = $1
           and id = $2`,
        [
          surveyId,
          questionId,
          validation.value.questionText,
          validation.value.questionType,
          validation.value.isRequired,
          validation.value.helpText
        ]
      );

      const [updatedSurvey] = await fetchSurveyStructures({
        surveyId,
        includeAllStatuses: true,
        includeHiddenTags: true
      });

      res.json({ survey: updatedSurvey });
    } catch (error) {
      next(error);
    }
  }
);

surveysRouter.delete(
  "/:id/questions/:questionId",
  requireAuth,
  requireRole("admin"),
  async (req, res, next) => {
    const surveyId = readPositiveIntegerParam(req.params.id);
    const questionId = readPositiveIntegerParam(req.params.questionId);

    if (!surveyId || !questionId) {
      res.status(400).json({ error: "Survey id and question id must be positive integers" });
      return;
    }

    try {
      const survey = await fetchSurveyRecord(pool, surveyId);

      if (!survey) {
        res.status(404).json({ error: "Survey not found" });
        return;
      }

      if (survey.status !== "draft") {
        res.status(409).json({ error: "Questions can only be deleted from draft surveys" });
        return;
      }

      const question = await fetchQuestionForSurvey(pool, questionId, surveyId);

      if (!question) {
        res.status(404).json({ error: "Question not found" });
        return;
      }

      if (await questionHasSavedResponses(pool, question.id)) {
        res.status(409).json({ error: "Questions with saved responses cannot be deleted" });
        return;
      }

      const result = await pool.query(
        `delete from survey_questions
         where survey_id = $1
           and id = $2`,
        [surveyId, questionId]
      );

      if (result.rowCount === 0) {
        res.status(404).json({ error: "Question not found" });
        return;
      }

      const [updatedSurvey] = await fetchSurveyStructures({
        surveyId,
        includeAllStatuses: true,
        includeHiddenTags: true
      });

      res.json({ survey: updatedSurvey });
    } catch (error) {
      next(error);
    }
  }
);

surveysRouter.post(
  "/:id/questions/:questionId/options",
  requireAuth,
  requireRole("admin"),
  async (req, res, next) => {
    const surveyId = readPositiveIntegerParam(req.params.id);
    const questionId = readPositiveIntegerParam(req.params.questionId);

    if (!surveyId || !questionId) {
      res.status(400).json({ error: "Survey id and question id must be positive integers" });
      return;
    }

    const validation = validateAnswerOptionBody(req.body);

    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const client = await pool.connect();

    try {
      await client.query("begin");

      const question = await fetchQuestionForSurvey(client, questionId, surveyId);

      if (!question) {
        await client.query("rollback");
        res.status(404).json({ error: "Question not found" });
        return;
      }

      if (!isSelectionQuestionType(question.question_type)) {
        await client.query("rollback");
        res.status(400).json({ error: "Only selection questions can have answer options" });
        return;
      }

      const displayOrder =
        validation.value.displayOrder ??
        (await fetchNextOptionDisplayOrder(client, questionId));

      await shiftOptionDisplayOrdersForInsert(client, questionId, displayOrder);
      await client.query(
        `insert into answer_options (question_id, option_text, display_order)
         values ($1, $2, $3)`,
        [questionId, validation.value.optionText, displayOrder]
      );

      await client.query("commit");

      const [updatedSurvey] = await fetchSurveyStructures({
        surveyId,
        includeAllStatuses: true,
        includeHiddenTags: true
      });

      res.status(201).json({ survey: updatedSurvey });
    } catch (error) {
      await client.query("rollback");
      next(error);
    } finally {
      client.release();
    }
  }
);

surveysRouter.patch(
  "/:id/questions/:questionId/options/reorder",
  requireAuth,
  requireRole("admin"),
  async (req, res, next) => {
    const surveyId = readPositiveIntegerParam(req.params.id);
    const questionId = readPositiveIntegerParam(req.params.questionId);

    if (!surveyId || !questionId) {
      res.status(400).json({ error: "Survey id and question id must be positive integers" });
      return;
    }

    const validation = validateReorderBody(req.body, "optionIds");

    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const client = await pool.connect();

    try {
      await client.query("begin");

      const question = await fetchQuestionForSurvey(client, questionId, surveyId);

      if (!question) {
        await client.query("rollback");
        res.status(404).json({ error: "Question not found" });
        return;
      }

      const orderValidation = await validateOptionReorderIds(
        client,
        questionId,
        validation.value.ids
      );

      if (!orderValidation.ok) {
        await client.query("rollback");
        res.status(400).json({ error: orderValidation.error });
        return;
      }

      await reorderOptions(client, questionId, validation.value.ids);
      await client.query("commit");

      const [updatedSurvey] = await fetchSurveyStructures({
        surveyId,
        includeAllStatuses: true,
        includeHiddenTags: true
      });

      res.json({ survey: updatedSurvey });
    } catch (error) {
      await client.query("rollback");
      next(error);
    } finally {
      client.release();
    }
  }
);

surveysRouter.put(
  "/:id/questions/:questionId/options/:optionId",
  requireAuth,
  requireRole("admin"),
  async (req, res, next) => {
    const surveyId = readPositiveIntegerParam(req.params.id);
    const questionId = readPositiveIntegerParam(req.params.questionId);
    const optionId = readPositiveIntegerParam(req.params.optionId);

    if (!surveyId || !questionId || !optionId) {
      res.status(400).json({ error: "Survey, question, and option ids must be positive integers" });
      return;
    }

    const validation = validateAnswerOptionBody(req.body);

    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }

    try {
      const option = await fetchOptionForQuestion(pool, optionId, questionId, surveyId);

      if (!option) {
        res.status(404).json({ error: "Answer option not found" });
        return;
      }

      await pool.query(
        `update answer_options
         set option_text = $4,
             updated_at = now()
         where id = $1
           and question_id = $2
           and exists (
             select 1
             from survey_questions
             where survey_questions.id = answer_options.question_id
               and survey_questions.survey_id = $3
           )`,
        [optionId, questionId, surveyId, validation.value.optionText]
      );

      const [updatedSurvey] = await fetchSurveyStructures({
        surveyId,
        includeAllStatuses: true,
        includeHiddenTags: true
      });

      res.json({ survey: updatedSurvey });
    } catch (error) {
      next(error);
    }
  }
);

surveysRouter.delete(
  "/:id/questions/:questionId/options/:optionId",
  requireAuth,
  requireRole("admin"),
  async (req, res, next) => {
    const surveyId = readPositiveIntegerParam(req.params.id);
    const questionId = readPositiveIntegerParam(req.params.questionId);
    const optionId = readPositiveIntegerParam(req.params.optionId);

    if (!surveyId || !questionId || !optionId) {
      res.status(400).json({ error: "Survey, question, and option ids must be positive integers" });
      return;
    }

    try {
      const survey = await fetchSurveyRecord(pool, surveyId);

      if (!survey) {
        res.status(404).json({ error: "Survey not found" });
        return;
      }

      if (survey.status !== "draft") {
        res.status(409).json({ error: "Answer options can only be deleted from draft surveys" });
        return;
      }

      const option = await fetchOptionForQuestion(pool, optionId, questionId, surveyId);

      if (!option) {
        res.status(404).json({ error: "Answer option not found" });
        return;
      }

      if (await optionHasSavedSelections(pool, option.id)) {
        res.status(409).json({ error: "Answer options with saved responses cannot be deleted" });
        return;
      }

      const result = await pool.query(
        `delete from answer_options
         where id = $1
           and question_id = $2
           and exists (
             select 1
             from survey_questions
             where survey_questions.id = answer_options.question_id
               and survey_questions.survey_id = $3
           )`,
        [optionId, questionId, surveyId]
      );

      if (result.rowCount === 0) {
        res.status(404).json({ error: "Answer option not found" });
        return;
      }

      const [updatedSurvey] = await fetchSurveyStructures({
        surveyId,
        includeAllStatuses: true,
        includeHiddenTags: true
      });

      res.json({ survey: updatedSurvey });
    } catch (error) {
      next(error);
    }
  }
);

surveysRouter.post(
  "/:id/questions/:questionId/options/:optionId/tags",
  requireAuth,
  requireRole("admin"),
  async (req, res, next) => {
    const surveyId = readPositiveIntegerParam(req.params.id);
    const questionId = readPositiveIntegerParam(req.params.questionId);
    const optionId = readPositiveIntegerParam(req.params.optionId);

    if (!surveyId || !questionId || !optionId) {
      res.status(400).json({ error: "Survey, question, and option ids must be positive integers" });
      return;
    }

    const validation = validateAnswerTagBody(req.body);

    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }

    try {
      const option = await fetchOptionForQuestion(pool, optionId, questionId, surveyId);

      if (!option) {
        res.status(404).json({ error: "Answer option not found" });
        return;
      }

      await pool.query(
        `insert into answer_tags (answer_option_id, tag_key, tag_value)
         values ($1, $2, $3)`,
        [optionId, validation.value.tagKey, validation.value.tagValue]
      );

      const [updatedSurvey] = await fetchSurveyStructures({
        surveyId,
        includeAllStatuses: true,
        includeHiddenTags: true
      });

      res.status(201).json({ survey: updatedSurvey });
    } catch (error) {
      if (isAnswerTagUniqueViolation(error)) {
        res.status(409).json({ error: "Answer tag already exists for this option" });
        return;
      }

      next(error);
    }
  }
);

surveysRouter.put(
  "/:id/questions/:questionId/options/:optionId/tags/:tagId",
  requireAuth,
  requireRole("admin"),
  async (req, res, next) => {
    const surveyId = readPositiveIntegerParam(req.params.id);
    const questionId = readPositiveIntegerParam(req.params.questionId);
    const optionId = readPositiveIntegerParam(req.params.optionId);
    const tagId = readPositiveIntegerParam(req.params.tagId);

    if (!surveyId || !questionId || !optionId || !tagId) {
      res.status(400).json({ error: "Survey, question, option, and tag ids must be positive integers" });
      return;
    }

    const validation = validateAnswerTagBody(req.body);

    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }

    try {
      const tag = await fetchTagForOption(pool, tagId, optionId, questionId, surveyId);

      if (!tag) {
        res.status(404).json({ error: "Answer tag not found" });
        return;
      }

      await pool.query(
        `update answer_tags
         set tag_key = $3,
             tag_value = $4,
             updated_at = now()
         where id = $1
           and answer_option_id = $2`,
        [tagId, optionId, validation.value.tagKey, validation.value.tagValue]
      );

      const [updatedSurvey] = await fetchSurveyStructures({
        surveyId,
        includeAllStatuses: true,
        includeHiddenTags: true
      });

      res.json({ survey: updatedSurvey });
    } catch (error) {
      if (isAnswerTagUniqueViolation(error)) {
        res.status(409).json({ error: "Answer tag already exists for this option" });
        return;
      }

      next(error);
    }
  }
);

surveysRouter.delete(
  "/:id/questions/:questionId/options/:optionId/tags/:tagId",
  requireAuth,
  requireRole("admin"),
  async (req, res, next) => {
    const surveyId = readPositiveIntegerParam(req.params.id);
    const questionId = readPositiveIntegerParam(req.params.questionId);
    const optionId = readPositiveIntegerParam(req.params.optionId);
    const tagId = readPositiveIntegerParam(req.params.tagId);

    if (!surveyId || !questionId || !optionId || !tagId) {
      res.status(400).json({ error: "Survey, question, option, and tag ids must be positive integers" });
      return;
    }

    try {
      const result = await pool.query(
        `delete from answer_tags
         where id = $1
           and answer_option_id = $2
           and exists (
             select 1
             from answer_options
             join survey_questions on survey_questions.id = answer_options.question_id
             where answer_options.id = answer_tags.answer_option_id
               and answer_options.id = $2
               and survey_questions.id = $3
               and survey_questions.survey_id = $4
           )`,
        [tagId, optionId, questionId, surveyId]
      );

      if (result.rowCount === 0) {
        res.status(404).json({ error: "Answer tag not found" });
        return;
      }

      const [updatedSurvey] = await fetchSurveyStructures({
        surveyId,
        includeAllStatuses: true,
        includeHiddenTags: true
      });

      res.json({ survey: updatedSurvey });
    } catch (error) {
      next(error);
    }
  }
);

surveysRouter.post("/:id/rules", requireAuth, requireRole("admin"), async (req, res, next) => {
  const surveyId = readPositiveIntegerParam(req.params.id);

  if (!surveyId) {
    res.status(400).json({ error: "Survey id must be a positive integer" });
    return;
  }

  const validation = validateConditionalRuleBody(req.body);

  if (!validation.ok) {
    res.status(400).json({ error: validation.error });
    return;
  }

  try {
    const referenceValidation = await validateConditionalRuleReferences(
      pool,
      surveyId,
      validation.value
    );

    if (!referenceValidation.ok) {
      res.status(400).json({ error: referenceValidation.error });
      return;
    }

    await pool.query(
      `insert into conditional_logic_rules (
         survey_id,
         source_question_id,
         source_answer_option_id,
         condition_operator,
         action_type,
         target_question_id
       )
       values ($1, $2, $3, 'equals', 'JUMP_TO_QUESTION', $4)`,
      [
        surveyId,
        validation.value.sourceQuestionId,
        validation.value.sourceAnswerOptionId,
        validation.value.targetQuestionId
      ]
    );

    const [updatedSurvey] = await fetchSurveyStructures({
      surveyId,
      includeAllStatuses: true,
      includeHiddenTags: true
    });

    res.status(201).json({ survey: updatedSurvey });
  } catch (error) {
    next(error);
  }
});

surveysRouter.put(
  "/:id/rules/:ruleId",
  requireAuth,
  requireRole("admin"),
  async (req, res, next) => {
    const surveyId = readPositiveIntegerParam(req.params.id);
    const ruleId = readPositiveIntegerParam(req.params.ruleId);

    if (!surveyId || !ruleId) {
      res.status(400).json({ error: "Survey id and rule id must be positive integers" });
      return;
    }

    const validation = validateConditionalRuleBody(req.body);

    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }

    try {
      const existingRule = await fetchConditionalRuleForSurvey(pool, ruleId, surveyId);

      if (!existingRule) {
        res.status(404).json({ error: "Conditional rule not found" });
        return;
      }

      const referenceValidation = await validateConditionalRuleReferences(
        pool,
        surveyId,
        validation.value
      );

      if (!referenceValidation.ok) {
        res.status(400).json({ error: referenceValidation.error });
        return;
      }

      await pool.query(
        `update conditional_logic_rules
         set source_question_id = $3,
             source_answer_option_id = $4,
             condition_operator = 'equals',
             action_type = 'JUMP_TO_QUESTION',
             target_question_id = $5,
             target_page_id = null,
             updated_at = now()
         where survey_id = $1
           and id = $2`,
        [
          surveyId,
          ruleId,
          validation.value.sourceQuestionId,
          validation.value.sourceAnswerOptionId,
          validation.value.targetQuestionId
        ]
      );

      const [updatedSurvey] = await fetchSurveyStructures({
        surveyId,
        includeAllStatuses: true,
        includeHiddenTags: true
      });

      res.json({ survey: updatedSurvey });
    } catch (error) {
      next(error);
    }
  }
);

surveysRouter.delete(
  "/:id/rules/:ruleId",
  requireAuth,
  requireRole("admin"),
  async (req, res, next) => {
    const surveyId = readPositiveIntegerParam(req.params.id);
    const ruleId = readPositiveIntegerParam(req.params.ruleId);

    if (!surveyId || !ruleId) {
      res.status(400).json({ error: "Survey id and rule id must be positive integers" });
      return;
    }

    try {
      const result = await pool.query(
        `delete from conditional_logic_rules
         where survey_id = $1
           and id = $2`,
        [surveyId, ruleId]
      );

      if (result.rowCount === 0) {
        res.status(404).json({ error: "Conditional rule not found" });
        return;
      }

      const [updatedSurvey] = await fetchSurveyStructures({
        surveyId,
        includeAllStatuses: true,
        includeHiddenTags: true
      });

      res.json({ survey: updatedSurvey });
    } catch (error) {
      next(error);
    }
  }
);

surveysRouter.post("/:id/start", requireAuth, async (req, res, next) => {
  try {
    const surveyId = readPositiveIntegerParam(req.params.id);

    if (!surveyId) {
      res.status(400).json({ error: "Survey id must be a positive integer" });
      return;
    }

    const user = (req as AuthenticatedRequest).user;
    const existingAttempt = await fetchActiveAttempt(user.id, surveyId);

    if (existingAttempt) {
      const response = await buildStartSurveyResponse(existingAttempt.id, user.id);
      res.json(response);
      return;
    }

    const surveyResult = await pool.query<{ id: number }>(
      `select id
       from surveys
       where id = $1
         and status = 'published'`,
      [surveyId]
    );

    if (surveyResult.rowCount === 0) {
      res.status(404).json({ error: "Published survey not found" });
      return;
    }

    const startedAttempt = await insertSurveyAttemptOrFetchActive(surveyId, user.id);

    const response = await buildStartSurveyResponse(startedAttempt.attemptId, user.id);
    res.status(startedAttempt.created ? 201 : 200).json(response);
  } catch (error) {
    next(error);
  }
});

surveysRouter.post("/:id/answer", requireAuth, async (req, res, next) => {
  const surveyId = readPositiveIntegerParam(req.params.id);

  if (!surveyId) {
    res.status(400).json({ error: "Survey id must be a positive integer" });
    return;
  }

  const validation = validateAnswerBody(req.body);

  if (!validation.ok) {
    res.status(400).json({ error: validation.error });
    return;
  }

  const user = (req as AuthenticatedRequest).user;
  const client = await pool.connect();

  try {
    await client.query("begin");

    const attempt = await fetchAttemptForUser(client, validation.value.attemptId, user.id, surveyId);

    if (!attempt) {
      await client.query("rollback");
      res.status(404).json({ error: "Survey attempt not found" });
      return;
    }

    if (attempt.status === "completed") {
      await client.query("rollback");
      res.status(409).json({ error: "Completed attempts cannot accept new answers" });
      return;
    }

    if (attempt.status === "abandoned") {
      await client.query("rollback");
      res.status(409).json({ error: "Abandoned attempts cannot accept new answers" });
      return;
    }

    const question = await fetchQuestionForSurvey(
      client,
      validation.value.questionId,
      surveyId
    );

    if (!question) {
      await client.query("rollback");
      res.status(400).json({ error: "Question does not belong to this survey" });
      return;
    }

    const answerValidation = await validateAnswerForQuestion(
      client,
      question,
      validation.value
    );

    if (!answerValidation.ok) {
      await client.query("rollback");
      res.status(400).json({ error: answerValidation.error });
      return;
    }

    await saveAnswer(client, attempt.id, question, answerValidation.value);
    await client.query(
      `update survey_attempts
       set last_activity_at = now(),
           updated_at = now()
       where id = $1`,
      [attempt.id]
    );
    await client.query("commit");

    const response = await buildAnswerSurveyResponse(attempt.id, user.id);
    res.json(response);
  } catch (error) {
    await client.query("rollback");
    next(error);
  } finally {
    client.release();
  }
});

surveysRouter.post("/:id/complete", requireAuth, async (req, res, next) => {
  const surveyId = readPositiveIntegerParam(req.params.id);

  if (!surveyId) {
    res.status(400).json({ error: "Survey id must be a positive integer" });
    return;
  }

  const validation = validateCompleteBody(req.body);

  if (!validation.ok) {
    res.status(400).json({ error: validation.error });
    return;
  }

  const user = (req as AuthenticatedRequest).user;

  try {
    const attempt = await fetchAttemptForUser(pool, validation.value.attemptId, user.id, surveyId);

    if (!attempt) {
      res.status(404).json({ error: "Survey attempt not found" });
      return;
    }

    if (attempt.status === "completed") {
      const completedAttempt = await fetchAttemptWithResponses(attempt.id, user.id);

      if (!completedAttempt) {
        res.status(404).json({ error: "Survey attempt not found" });
        return;
      }

      const existingResponse: CompleteSurveyResponse = { attempt: completedAttempt };
      res.json(existingResponse);
      return;
    }

    if (attempt.status === "abandoned") {
      res.status(409).json({ error: "Abandoned attempts cannot be completed" });
      return;
    }

    const detail = await buildAttemptDetail(attempt.id, user.id);
    const completionValidation = validateReachedRequiredQuestions(detail.survey, detail.attempt);

    if (!completionValidation.ok) {
      res.status(400).json({ error: completionValidation.error });
      return;
    }

    const updateResult = await pool.query<SurveyAttemptRecord>(
      `update survey_attempts
       set status = 'completed',
           completed_at = now(),
           last_activity_at = now(),
           updated_at = now()
       where id = $1
         and user_id = $2
       returning
         id,
         survey_id,
         user_id,
         status,
         started_at,
         last_activity_at,
         completed_at,
         created_at,
         updated_at`,
      [attempt.id, user.id]
    );

    const completedAttempt = await fetchAttemptWithResponses(updateResult.rows[0].id, user.id);

    if (!completedAttempt) {
      res.status(404).json({ error: "Survey attempt not found" });
      return;
    }

    const response: CompleteSurveyResponse = { attempt: completedAttempt };
    res.json(response);
  } catch (error) {
    next(error);
  }
});

mySurveysRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const response = await buildMySurveysResponse(user.id);
    res.json(response);
  } catch (error) {
    next(error);
  }
});

mySurveysRouter.get("/:attemptId", requireAuth, async (req, res, next) => {
  try {
    const attemptId = readPositiveIntegerParam(req.params.attemptId);

    if (!attemptId) {
      res.status(400).json({ error: "Attempt id must be a positive integer" });
      return;
    }

    const user = (req as AuthenticatedRequest).user;
    const response = await buildMySurveyResponse(attemptId, user.id);

    if (!response) {
      res.status(404).json({ error: "Survey attempt not found" });
      return;
    }

    res.json(response);
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

interface SurveyAttemptRecord {
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

interface SurveyResponseAnswerRecord {
  id: number;
  survey_attempt_id: number;
  question_id: number;
  answer_text: string | null;
  answer_integer: number | null;
  created_at: Date;
  updated_at: Date;
}

interface SelectedOptionRecord {
  survey_response_answer_id: number;
  answer_option_id: number;
}

interface Queryable {
  query: PoolClient["query"];
}

interface FetchSurveyStructuresOptions {
  surveyId?: number;
  surveyIds?: number[];
  includeAllStatuses: boolean;
  includeHiddenTags: boolean;
}

const surveyTitleMaxLength = 180;
const surveyDescriptionMaxLength = 1200;
const questionTextMaxLength = 500;
const questionHelpTextMaxLength = 500;
const answerOptionTextMaxLength = 240;
const answerTagKeyMaxLength = 80;
const answerTagValueMaxLength = 180;

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

async function fetchSurveyRecord(
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

async function fetchOptionForQuestion(
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

async function fetchTagForOption(
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

async function fetchConditionalRuleForSurvey(
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

async function validateReturnToDraft(
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

async function surveyHasAttempts(queryable: Queryable, surveyId: number): Promise<boolean> {
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

async function questionHasSavedResponses(
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

async function optionHasSavedSelections(queryable: Queryable, optionId: number): Promise<boolean> {
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

async function fetchNextQuestionDisplayOrder(
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

async function fetchNextOptionDisplayOrder(
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

async function shiftQuestionDisplayOrdersForInsert(
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

async function shiftOptionDisplayOrdersForInsert(
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

async function validateQuestionReorderIds(
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

async function validateOptionReorderIds(
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

async function reorderQuestions(
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

async function reorderOptions(
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

async function validateSurveyCanPublish(
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
       and survey_questions.question_type in ('single_select', 'multi_select')
     group by survey_questions.id
     having count(answer_options.id) = 0
     limit 1`,
    [surveyId]
  );

  if (selectionWithoutOptionsResult.rows[0]) {
    return { ok: false, error: "Selection questions need at least one answer option before publishing" };
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

async function validateConditionalRuleReferences(
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

async function insertSurveyAttemptOrFetchActive(
  surveyId: number,
  userId: number
): Promise<{ attemptId: number; created: boolean }> {
  try {
    const result = await pool.query<{ id: number }>(
      `insert into survey_attempts (
         survey_id,
         user_id,
         status,
         started_at,
         last_activity_at
       )
       values ($1, $2, 'in_progress', now(), now())
       returning id`,
      [surveyId, userId]
    );

    return {
      attemptId: result.rows[0].id,
      created: true
    };
  } catch (error) {
    if (!isActiveAttemptUniqueViolation(error)) {
      throw error;
    }

    const existingAttempt = await fetchActiveAttempt(userId, surveyId);

    if (!existingAttempt) {
      throw error;
    }

    return {
      attemptId: existingAttempt.id,
      created: false
    };
  }
}

async function fetchActiveAttempt(
  userId: number,
  surveyId: number
): Promise<SurveyAttemptRecord | null> {
  const result = await pool.query<SurveyAttemptRecord>(
    `select
       id,
       survey_id,
       user_id,
       status,
       started_at,
       last_activity_at,
       completed_at,
       created_at,
       updated_at
     from survey_attempts
     where user_id = $1
       and survey_id = $2
       and status in ('not_started', 'in_progress')
     order by updated_at desc, id desc
     limit 1`,
    [userId, surveyId]
  );

  return result.rows[0] ?? null;
}

async function fetchAttemptForUser(
  queryable: Queryable,
  attemptId: number,
  userId: number,
  surveyId: number
): Promise<SurveyAttemptRecord | null> {
  const result = await queryable.query<SurveyAttemptRecord>(
    `select
       id,
       survey_id,
       user_id,
       status,
       started_at,
       last_activity_at,
       completed_at,
       created_at,
       updated_at
     from survey_attempts
     where id = $1
       and user_id = $2
       and survey_id = $3`,
    [attemptId, userId, surveyId]
  );

  return result.rows[0] ?? null;
}

async function fetchQuestionForSurvey(
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

async function buildStartSurveyResponse(
  attemptId: number,
  userId: number
): Promise<StartSurveyResponse> {
  const detail = await buildAttemptDetail(attemptId, userId);

  return {
    attempt: detail.attempt,
    survey: detail.survey,
    currentQuestion: detail.currentQuestion
  };
}

async function buildAnswerSurveyResponse(
  attemptId: number,
  userId: number
): Promise<AnswerSurveyResponse> {
  const detail = await buildAttemptDetail(attemptId, userId);

  return {
    attempt: detail.attempt,
    currentQuestion: detail.currentQuestion,
    isCompleteReady: detail.currentQuestion === null
  };
}

async function buildMySurveyResponse(
  attemptId: number,
  userId: number
): Promise<MySurveyResponse | null> {
  const attempt = await fetchAttemptWithResponses(attemptId, userId);

  if (!attempt) {
    return null;
  }

  const [survey] = await fetchSurveyStructures({
    surveyId: attempt.surveyId,
    includeAllStatuses: true,
    includeHiddenTags: false
  });

  if (!survey || survey.status === "draft") {
    return null;
  }

  return {
    attempt,
    survey,
    currentQuestion: determineCurrentQuestion(survey, attempt)
  };
}

async function buildAttemptDetail(
  attemptId: number,
  userId: number
): Promise<{
  attempt: SurveyAttempt;
  survey: Survey;
  currentQuestion: SurveyQuestion | null;
}> {
  const response = await buildMySurveyResponse(attemptId, userId);

  if (!response) {
    throw new Error("Survey attempt not found");
  }

  return response;
}

async function buildMySurveysResponse(userId: number): Promise<MySurveysResponse> {
  const surveyIdResult = await pool.query<{ id: number }>(
    `with survey_scope as (
       select id
       from surveys
       where status = 'published'
       union
       select surveys.id
       from survey_attempts
       join surveys on surveys.id = survey_attempts.survey_id
       where survey_attempts.user_id = $1
         and surveys.status <> 'draft'
     )
     select id
     from survey_scope
     order by id`,
    [userId]
  );
  const surveyIds = surveyIdResult.rows.map((row) => row.id);

  if (surveyIds.length === 0) {
    return { surveys: [] };
  }

  const surveys = await fetchSurveyStructures({
    surveyIds,
    includeAllStatuses: true,
    includeHiddenTags: false
  });
  const attempts = await fetchAttemptsForSurveyIds(userId, surveyIds);
  const attemptsBySurveyId = new Map<number, SurveyAttempt>();

  for (const attempt of attempts) {
    if (!attemptsBySurveyId.has(attempt.surveyId)) {
      attemptsBySurveyId.set(attempt.surveyId, attempt);
    }
  }

  return {
    surveys: surveys.map((survey) => ({
      survey,
      attempt: attemptsBySurveyId.get(survey.id) ?? null
    }))
  };
}

async function fetchAttemptWithResponses(
  attemptId: number,
  userId: number
): Promise<SurveyAttempt | null> {
  const attempts = await fetchAttemptsByCondition(
    `survey_attempts.id = $2`,
    [userId, attemptId]
  );

  return attempts[0] ?? null;
}

async function fetchAttemptsForSurveyIds(
  userId: number,
  surveyIds: number[]
): Promise<SurveyAttempt[]> {
  if (surveyIds.length === 0) {
    return [];
  }

  return fetchAttemptsByCondition(
    `survey_attempts.survey_id = any($2::int[])`,
    [userId, surveyIds]
  );
}

async function fetchAttemptsByCondition(
  condition: string,
  values: unknown[]
): Promise<SurveyAttempt[]> {
  const attemptsResult = await pool.query<SurveyAttemptRecord>(
    `select
       survey_attempts.id,
       survey_attempts.survey_id,
       survey_attempts.user_id,
       survey_attempts.status,
       survey_attempts.started_at,
       survey_attempts.last_activity_at,
       survey_attempts.completed_at,
       survey_attempts.created_at,
       survey_attempts.updated_at
     from survey_attempts
     where survey_attempts.user_id = $1
       and ${condition}
     order by
       survey_attempts.survey_id,
       case
         when survey_attempts.status in ('not_started', 'in_progress') then 0
         else 1
       end,
       survey_attempts.updated_at desc,
       survey_attempts.id desc`,
    values
  );
  const attemptIds = attemptsResult.rows.map((attempt) => attempt.id);

  if (attemptIds.length === 0) {
    return [];
  }

  const responsesResult = await pool.query<SurveyResponseAnswerRecord>(
    `select
       id,
       survey_attempt_id,
       question_id,
       answer_text,
       answer_integer,
       created_at,
       updated_at
     from survey_response_answers
     where survey_attempt_id = any($1::int[])
     order by id`,
    [attemptIds]
  );
  const responseIds = responsesResult.rows.map((response) => response.id);
  const selectedOptionsResult =
    responseIds.length > 0
      ? await pool.query<SelectedOptionRecord>(
          `select
             survey_response_answer_id,
             answer_option_id
           from survey_response_selected_options
           where survey_response_answer_id = any($1::int[])
           order by survey_response_answer_id, answer_option_id`,
          [responseIds]
        )
      : { rows: [] as SelectedOptionRecord[] };
  const selectedOptionsByResponseId = new Map<number, number[]>();

  for (const selectedOption of selectedOptionsResult.rows) {
    const selectedIds =
      selectedOptionsByResponseId.get(selectedOption.survey_response_answer_id) ?? [];
    selectedIds.push(selectedOption.answer_option_id);
    selectedOptionsByResponseId.set(
      selectedOption.survey_response_answer_id,
      selectedIds
    );
  }

  const responsesByAttemptId = new Map<number, SurveyResponseAnswer[]>();

  for (const response of responsesResult.rows) {
    const mappedResponse = mapSurveyResponseAnswerRecord(
      response,
      selectedOptionsByResponseId.get(response.id) ?? []
    );
    const responses = responsesByAttemptId.get(response.survey_attempt_id) ?? [];
    responses.push(mappedResponse);
    responsesByAttemptId.set(response.survey_attempt_id, responses);
  }

  return attemptsResult.rows.map((attempt) =>
    mapSurveyAttemptRecord(attempt, responsesByAttemptId.get(attempt.id) ?? [])
  );
}

function mapSurveyAttemptRecord(
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

function mapSurveyResponseAnswerRecord(
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

function validateSurveyStatusBody(body: unknown): ValidationResult<{ status: SurveyStatus }> {
  if (!isRecord(body)) {
    return { ok: false, error: "Request body is required" };
  }

  const status = readTextField(body, "status");

  if (!isSurveyStatus(status)) {
    return { ok: false, error: "Status must be draft, published, or retired" };
  }

  return { ok: true, value: { status } };
}

interface QuestionBodyValue {
  questionText: string;
  questionType: SurveyQuestionType;
  displayOrder: number | null;
  isRequired: boolean;
  helpText: string | null;
}

function validateQuestionBody(body: unknown): ValidationResult<QuestionBodyValue> {
  if (!isRecord(body)) {
    return { ok: false, error: "Request body is required" };
  }

  const questionText = readTextField(body, "questionText");
  const questionType = readTextField(body, "questionType");
  const helpText = readOptionalTextField(body, "helpText");
  const displayOrder = readOptionalPositiveIntegerField(body, "displayOrder");
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
    return { ok: false, error: "Question type must be text, integer, single_select, or multi_select" };
  }

  if (displayOrder === false) {
    return { ok: false, error: "Display order must be a positive integer" };
  }

  if (typeof isRequired !== "boolean") {
    return { ok: false, error: "isRequired must be true or false" };
  }

  return {
    ok: true,
    value: {
      questionText,
      questionType,
      displayOrder,
      isRequired,
      helpText
    }
  };
}

function validateAnswerOptionBody(body: unknown): ValidationResult<{
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

function validateAnswerTagBody(body: unknown): ValidationResult<{
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

interface ConditionalRuleBodyValue {
  sourceQuestionId: number;
  sourceAnswerOptionId: number;
  targetQuestionId: number;
}

function validateConditionalRuleBody(
  body: unknown
): ValidationResult<ConditionalRuleBodyValue> {
  if (!isRecord(body)) {
    return { ok: false, error: "Request body is required" };
  }

  const sourceQuestionId = readPositiveIntegerField(body, "sourceQuestionId");
  const sourceAnswerOptionId = readPositiveIntegerField(body, "sourceAnswerOptionId");
  const targetQuestionId = readPositiveIntegerField(body, "targetQuestionId");
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

  return {
    ok: true,
    value: {
      sourceQuestionId,
      sourceAnswerOptionId,
      targetQuestionId
    }
  };
}

function validateReorderBody(
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

interface AnswerRequestValue {
  attemptId: number;
  questionId: number;
  answerText: string | null;
  answerInteger: number | null;
  selectedAnswerOptionIds: number[];
}

interface NormalizedAnswerValue {
  answerText: string | null;
  answerInteger: number | null;
  selectedAnswerOptionIds: number[];
}

function validateAnswerBody(body: unknown): ValidationResult<AnswerRequestValue> {
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

function validateCompleteBody(body: unknown): ValidationResult<{ attemptId: number }> {
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

async function validateAnswerForQuestion(
  queryable: Queryable,
  question: SurveyQuestionRecord,
  value: AnswerRequestValue
): Promise<ValidationResult<NormalizedAnswerValue>> {
  if (question.question_type === "text") {
    if (question.is_required && !value.answerText) {
      return { ok: false, error: "A text answer is required" };
    }

    return {
      ok: true,
      value: {
        answerText: value.answerText,
        answerInteger: null,
        selectedAnswerOptionIds: []
      }
    };
  }

  if (question.question_type === "integer") {
    if (question.is_required && value.answerInteger === null) {
      return { ok: false, error: "An integer answer is required" };
    }

    return {
      ok: true,
      value: {
        answerText: null,
        answerInteger: value.answerInteger,
        selectedAnswerOptionIds: []
      }
    };
  }

  if (question.question_type === "single_select") {
    if (question.is_required && value.selectedAnswerOptionIds.length !== 1) {
      return { ok: false, error: "Select exactly one answer option" };
    }

    if (!question.is_required && value.selectedAnswerOptionIds.length > 1) {
      return { ok: false, error: "Select no more than one answer option" };
    }
  }

  if (question.question_type === "multi_select") {
    if (question.is_required && value.selectedAnswerOptionIds.length === 0) {
      return { ok: false, error: "Select at least one answer option" };
    }
  }

  if (value.selectedAnswerOptionIds.length > 0) {
    const optionsResult = await queryable.query<{ count: string }>(
      `select count(*)::text as count
       from answer_options
       where question_id = $1
         and id = any($2::int[])`,
      [question.id, value.selectedAnswerOptionIds]
    );
    const matchingOptionCount = Number(optionsResult.rows[0]?.count ?? 0);

    if (matchingOptionCount !== value.selectedAnswerOptionIds.length) {
      return { ok: false, error: "Selected answer options must belong to the question" };
    }
  }

  return {
    ok: true,
    value: {
      answerText: null,
      answerInteger: null,
      selectedAnswerOptionIds: value.selectedAnswerOptionIds
    }
  };
}

async function saveAnswer(
  queryable: Queryable,
  attemptId: number,
  question: SurveyQuestionRecord,
  value: NormalizedAnswerValue
): Promise<void> {
  const responseResult = await queryable.query<{ id: number }>(
    `insert into survey_response_answers (
       survey_attempt_id,
       question_id,
       answer_text,
       answer_integer
     )
     values ($1, $2, $3, $4)
     on conflict (survey_attempt_id, question_id)
     do update
     set answer_text = excluded.answer_text,
         answer_integer = excluded.answer_integer,
         updated_at = now()
     returning id`,
    [attemptId, question.id, value.answerText, value.answerInteger]
  );
  const responseAnswerId = responseResult.rows[0].id;

  await queryable.query(
    `delete from survey_response_selected_options
     where survey_response_answer_id = $1`,
    [responseAnswerId]
  );

  if (value.selectedAnswerOptionIds.length > 0) {
    await queryable.query(
      `insert into survey_response_selected_options (
         survey_response_answer_id,
         answer_option_id
       )
       select $1, unnest($2::int[])`,
      [responseAnswerId, value.selectedAnswerOptionIds]
    );
  }
}

function validateReachedRequiredQuestions(
  survey: Survey,
  attempt: SurveyAttempt
): ValidationResult<undefined> {
  const responsesByQuestionId = buildResponseMap(attempt);
  let question = findFirstQuestion(survey);
  const visitedQuestionIds = new Set<number>();

  while (question) {
    if (visitedQuestionIds.has(question.id)) {
      return { ok: false, error: "Survey navigation contains a loop" };
    }

    visitedQuestionIds.add(question.id);

    const response = responsesByQuestionId.get(question.id);

    if (question.isRequired && !hasMeaningfulResponse(question, response)) {
      return { ok: false, error: `Required question ${question.displayOrder} is unanswered` };
    }

    question = resolveNextQuestion(survey, question, response);
  }

  return { ok: true, value: undefined };
}

function determineCurrentQuestion(
  survey: Survey,
  attempt: SurveyAttempt
): SurveyQuestion | null {
  if (attempt.status === "completed") {
    return null;
  }

  const responsesByQuestionId = buildResponseMap(attempt);
  let question = findFirstQuestion(survey);
  const visitedQuestionIds = new Set<number>();

  while (question) {
    if (visitedQuestionIds.has(question.id)) {
      return null;
    }

    visitedQuestionIds.add(question.id);

    const response = responsesByQuestionId.get(question.id);

    if (!response || (question.isRequired && !hasMeaningfulResponse(question, response))) {
      return question;
    }

    question = resolveNextQuestion(survey, question, response);
  }

  return null;
}

function resolveNextQuestion(
  survey: Survey,
  question: SurveyQuestion,
  response: SurveyResponseAnswer | undefined
): SurveyQuestion | null {
  const matchingRule = survey.conditionalLogicRules.find(
    (rule) =>
      rule.sourceQuestionId === question.id &&
      rule.conditionOperator === "equals" &&
      rule.actionType === "JUMP_TO_QUESTION" &&
      rule.targetQuestionId !== null &&
      response?.selectedAnswerOptionIds.includes(rule.sourceAnswerOptionId)
  );

  if (matchingRule?.targetQuestionId) {
    return survey.questions.find((candidate) => candidate.id === matchingRule.targetQuestionId) ?? null;
  }

  return (
    survey.questions
      .filter((candidate) => candidate.displayOrder > question.displayOrder)
      .sort((left, right) => left.displayOrder - right.displayOrder || left.id - right.id)[0] ??
    null
  );
}

function findFirstQuestion(survey: Survey): SurveyQuestion | null {
  return (
    [...survey.questions].sort(
      (left, right) => left.displayOrder - right.displayOrder || left.id - right.id
    )[0] ?? null
  );
}

function buildResponseMap(attempt: SurveyAttempt): Map<number, SurveyResponseAnswer> {
  return new Map(attempt.responses.map((response) => [response.questionId, response]));
}

function hasMeaningfulResponse(
  question: SurveyQuestion,
  response: SurveyResponseAnswer | undefined
): boolean {
  if (!response) {
    return false;
  }

  if (question.questionType === "text") {
    return Boolean(response.answerText?.trim());
  }

  if (question.questionType === "integer") {
    return Number.isInteger(response.answerInteger);
  }

  if (question.questionType === "single_select") {
    return response.selectedAnswerOptionIds.length === 1;
  }

  return response.selectedAnswerOptionIds.length > 0;
}

function readPositiveIntegerParam(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function readPositiveIntegerField(body: Record<string, unknown>, field: string): number | null {
  const value = body[field];
  return Number.isSafeInteger(value) && typeof value === "number" && value > 0
    ? value
    : null;
}

function readOptionalPositiveIntegerField(
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

function readPositiveIntegerArray(
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

function isSurveyQuestionType(value: string): value is SurveyQuestionType {
  return (
    value === "text" ||
    value === "integer" ||
    value === "single_select" ||
    value === "multi_select"
  );
}

function isSelectionQuestionType(value: SurveyQuestionType): boolean {
  return value === "single_select" || value === "multi_select";
}

function sameIdSet(left: number[], right: number[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const rightIds = new Set(right);

  if (rightIds.size !== right.length) {
    return false;
  }

  return left.every((id) => rightIds.has(id));
}

function isActiveAttemptUniqueViolation(error: unknown): boolean {
  return (
    error instanceof DatabaseError &&
    error.code === "23505" &&
    error.constraint === "survey_attempts_one_active_per_user_survey_idx"
  );
}

function isAnswerTagUniqueViolation(error: unknown): boolean {
  return (
    error instanceof DatabaseError &&
    error.code === "23505" &&
    error.constraint === "answer_tags_key_value_unique"
  );
}
