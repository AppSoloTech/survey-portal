import express from "express";

import { pool } from "../db.js";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middleware/auth.js";
import {
  fetchNextOptionDisplayOrder,
  fetchNextQuestionDisplayOrder,
  hasScaleRangeChanged,
  isAnswerTagUniqueViolation,
  optionHasSavedSelections,
  questionHasSavedResponses,
  reorderOptions,
  reorderQuestions,
  shiftOptionDisplayOrdersForInsert,
  shiftQuestionDisplayOrdersForInsert,
  syncScaleAnswerOptions,
  validateConditionalRuleReferences,
  validateOptionReorderIds,
  validateQuestionReorderIds,
  validateReturnToDraft,
  validateSurveyCanPublish
} from "../services/surveyBuilder.js";
import {
  deleteAnswerOptionsForQuestion,
  fetchConditionalRuleForSurvey,
  fetchOptionForQuestion,
  fetchQuestionForSurvey,
  fetchSurveyRecord,
  fetchTagForOption
} from "../services/surveyRecords.js";
import { fetchSurveyStructures } from "../services/surveyStructure.js";
import {
  isSelectionQuestionType,
  readPositiveIntegerParam,
  validateAnswerOptionBody,
  validateAnswerTagBody,
  validateConditionalRuleBody,
  validateQuestionBody,
  validateReorderBody,
  validateSurveyBody,
  validateSurveyStatusBody
} from "../services/validation.js";

export const surveyBuilderRouter = express.Router();

surveyBuilderRouter.post("/", requireAuth, requireRole("admin"), async (req, res, next) => {
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

surveyBuilderRouter.put("/:id", requireAuth, requireRole("admin"), async (req, res, next) => {
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

surveyBuilderRouter.patch("/:id/status", requireAuth, requireRole("admin"), async (req, res, next) => {
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

surveyBuilderRouter.post("/:id/questions", requireAuth, requireRole("admin"), async (req, res, next) => {
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

    if (survey.status !== "draft") {
      await client.query("rollback");
      res.status(409).json({ error: "Questions can only be added to draft surveys" });
      return;
    }

    const displayOrder =
      validation.value.displayOrder ??
      (await fetchNextQuestionDisplayOrder(client, surveyId));

    await shiftQuestionDisplayOrdersForInsert(client, surveyId, displayOrder);
    const questionResult = await client.query<{ id: number }>(
      `insert into survey_questions (
         survey_id,
         question_text,
         question_type,
         display_order,
         is_required,
         help_text
       )
       values ($1, $2, $3, $4, $5, $6)
       returning id`,
      [
        surveyId,
        validation.value.questionText,
        validation.value.questionType,
        displayOrder,
        validation.value.isRequired,
        validation.value.helpText
      ]
    );

    if (validation.value.questionType === "scale") {
      await syncScaleAnswerOptions(client, questionResult.rows[0].id, {
        min: validation.value.scaleMin,
        max: validation.value.scaleMax
      });
    }

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

surveyBuilderRouter.patch(
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

surveyBuilderRouter.put(
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

    const client = await pool.connect();

    try {
      await client.query("begin");

      const survey = await fetchSurveyRecord(client, surveyId);
      const question = await fetchQuestionForSurvey(client, questionId, surveyId);

      if (!survey || !question) {
        await client.query("rollback");
        res.status(404).json({ error: "Question not found" });
        return;
      }

      if (
        survey.status !== "draft" &&
        question.question_type !== validation.value.questionType
      ) {
        await client.query("rollback");
        res.status(400).json({ error: "Question type can only be changed before publishing" });
        return;
      }

      if (
        survey.status !== "draft" &&
        question.question_type === "scale" &&
        (await hasScaleRangeChanged(client, question.id, validation.value))
      ) {
        await client.query("rollback");
        res.status(409).json({ error: "Scale ranges can only be changed before publishing" });
        return;
      }

      await client.query(
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

      if (survey.status === "draft" && validation.value.questionType === "scale") {
        await syncScaleAnswerOptions(client, questionId, {
          min: validation.value.scaleMin,
          max: validation.value.scaleMax
        });
      }

      if (
        survey.status === "draft" &&
        question.question_type === "scale" &&
        validation.value.questionType !== "scale"
      ) {
        await deleteAnswerOptionsForQuestion(client, questionId);
      }

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

surveyBuilderRouter.delete(
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

surveyBuilderRouter.post(
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
        res.status(400).json({ error: "Only single-select and multi-select questions can have manually managed answer options" });
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

surveyBuilderRouter.patch(
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

      if (question.question_type === "scale") {
        await client.query("rollback");
        res.status(400).json({ error: "Scale value order is managed through the scale range" });
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

surveyBuilderRouter.put(
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
      const question = await fetchQuestionForSurvey(pool, questionId, surveyId);

      if (!option || !question) {
        res.status(404).json({ error: "Answer option not found" });
        return;
      }

      if (question.question_type === "scale") {
        res.status(400).json({ error: "Scale values are managed through the scale range" });
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

surveyBuilderRouter.delete(
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
      const question = await fetchQuestionForSurvey(pool, questionId, surveyId);

      if (!option || !question) {
        res.status(404).json({ error: "Answer option not found" });
        return;
      }

      if (question.question_type === "scale") {
        res.status(400).json({ error: "Scale values are managed through the scale range" });
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

surveyBuilderRouter.post(
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

surveyBuilderRouter.put(
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

surveyBuilderRouter.delete(
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

surveyBuilderRouter.post("/:id/rules", requireAuth, requireRole("admin"), async (req, res, next) => {
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
         target_question_id,
         skip_target_in_normal_flow
       )
       values ($1, $2, $3, 'equals', 'JUMP_TO_QUESTION', $4, $5)`,
      [
        surveyId,
        validation.value.sourceQuestionId,
        validation.value.sourceAnswerOptionId,
        validation.value.targetQuestionId,
        validation.value.skipTargetInNormalFlow
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

surveyBuilderRouter.put(
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
             skip_target_in_normal_flow = $6,
             target_page_id = null,
             updated_at = now()
         where survey_id = $1
           and id = $2`,
        [
          surveyId,
          ruleId,
          validation.value.sourceQuestionId,
          validation.value.sourceAnswerOptionId,
          validation.value.targetQuestionId,
          validation.value.skipTargetInNormalFlow
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

surveyBuilderRouter.delete(
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
