import express from "express";

import { pool } from "../db.js";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middleware/auth.js";
import {
  categoryExists,
  countPagesForSurvey,
  duplicateSurveyTree,
  fetchFirstPageForSurvey,
  fetchNextOptionDisplayOrder,
  fetchNextPageDisplayOrder,
  fetchNextQuestionDisplayOrder,
  fetchPageForSurvey,
  isAnswerTagUniqueViolation,
  isQuestionOtherTagUniqueViolation,
  moveQuestionToPage,
  optionHasSavedSelections,
  pageHasQuestions,
  questionHasSavedResponses,
  registerTagDefinition,
  reorderOptions,
  reorderPages,
  reorderQuestions,
  shiftPageDisplayOrdersForInsert,
  shiftOptionDisplayOrdersForInsert,
  shiftQuestionDisplayOrdersForInsert,
  validatePageReorderIds,
  syncScaleAnswerOptions,
  validateConditionalRuleReferences,
  validateOptionReorderIds,
  validateQuestionReorderIds,
  validateReturnToDraft,
  validateSurveyCanPublish
} from "../services/surveyBuilder.js";
import {
  insertQuestionTemplateIntoSurveyPage,
  insertPageTemplateIntoSurvey,
  saveQuestionTemplateFromSurveyQuestion,
  savePageTemplateFromSurveyPage
} from "../services/surveyPageTemplates.js";
import {
  deleteAnswerOptionsForQuestion,
  fetchConditionalRuleForSurvey,
  fetchOptionForQuestion,
  fetchOtherTagForQuestion,
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
  validateQuestionValueTagBody,
  validatePageTemplateBody,
  validatePageTemplateInsertBody,
  validateQuestionTemplateBody,
  validateQuestionBody,
  validateReorderBody,
  validateSurveyPageBody,
  validateSurveyBody,
  validateSurveyStatusBody,
  validateSurveyTimingOverrideBody
} from "../services/validation.js";
import {
  clearSurveyTimingOverride,
  fetchSurveyTimingSummary,
  setSurveyTimingOverride
} from "../services/surveyTiming.js";

export const surveyBuilderRouter = express.Router();

// Soft-deleted surveys are retained for analytics but closed to builder
// changes. Runs after the role check so it never leaks survey state to
// non-admin callers.
async function rejectDeletedSurvey(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<void> {
  const surveyId = readPositiveIntegerParam(req.params.id);

  if (!surveyId) {
    next();
    return;
  }

  try {
    const result = await pool.query<{ deleted_at: Date | null }>(
      `select deleted_at
       from surveys
       where id = $1`,
      [surveyId]
    );

    if (result.rows[0]?.deleted_at) {
      res.status(409).json({ error: "Survey has been deleted" });
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
}

// Structural mutations (questions, options, tags, rules) are draft-only:
// published surveys are immutable so in-progress participant paths and
// historical analytics labels cannot change. Editing a published survey
// means duplicating it into a new draft. Metadata/category updates and
// status changes stay separately allowed. This guard also covers the
// deleted check so structural routes need a single lookup.
async function rejectStructurallyLockedSurvey(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<void> {
  const surveyId = readPositiveIntegerParam(req.params.id);

  if (!surveyId) {
    next();
    return;
  }

  try {
    const result = await pool.query<{ status: string; deleted_at: Date | null }>(
      `select status, deleted_at
       from surveys
       where id = $1`,
      [surveyId]
    );
    const survey = result.rows[0];

    if (survey?.deleted_at) {
      res.status(409).json({ error: "Survey has been deleted" });
      return;
    }

    if (survey && survey.status !== "draft") {
      res.status(409).json({
        error:
          "Survey structure can only be edited while the survey is a draft. Create an editable draft copy to make changes"
      });
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
}

// Hidden-tag metadata is admin-only and safe to correct on published surveys:
// reporting derives tags from current metadata, while participant response rows
// and survey structure stay untouched. Retired surveys remain archival.
async function rejectTagMetadataLockedSurvey(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<void> {
  const surveyId = readPositiveIntegerParam(req.params.id);

  if (!surveyId) {
    next();
    return;
  }

  try {
    const result = await pool.query<{ status: string; deleted_at: Date | null }>(
      `select status, deleted_at
       from surveys
       where id = $1`,
      [surveyId]
    );
    const survey = result.rows[0];

    if (survey?.deleted_at) {
      res.status(409).json({ error: "Survey has been deleted" });
      return;
    }

    if (survey && survey.status === "retired") {
      res.status(409).json({
        error: "Hidden tags can only be edited while the survey is a draft or published"
      });
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
}

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

    if (
      validation.value.categoryId !== null &&
      !(await categoryExists(pool, validation.value.categoryId))
    ) {
      res.status(400).json({ error: "Category not found" });
      return;
    }

    const user = (req as AuthenticatedRequest).user;
    const result = await pool.query<{ id: number }>(
      `insert into surveys (
         title,
         description,
         status,
         category_id,
         created_by_user_id,
         published_at,
         retired_at
       )
       values (
         $1,
         $2,
         $3,
         $4,
         $5,
         case when $3 = 'published' then now() else null end,
         case when $3 = 'retired' then now() else null end
       )
       returning id`,
      [
        validation.value.title,
        validation.value.description,
        validation.value.status,
        validation.value.categoryId,
        user.id
      ]
    );
    await pool.query(
      `insert into survey_pages (survey_id, title, description, display_order)
       values ($1, 'Page 1', null, 1)`,
      [result.rows[0].id]
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

surveyBuilderRouter.put("/:id", requireAuth, requireRole("admin"), rejectDeletedSurvey, async (req, res, next) => {
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

    if (
      validation.value.categoryId !== null &&
      !(await categoryExists(pool, validation.value.categoryId))
    ) {
      res.status(400).json({ error: "Category not found" });
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
         category_id = $5,
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
      [
        id,
        validation.value.title,
        validation.value.description,
        validation.value.status,
        validation.value.categoryId
      ]
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

surveyBuilderRouter.patch("/:id/status", requireAuth, requireRole("admin"), rejectDeletedSurvey, async (req, res, next) => {
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

surveyBuilderRouter.get("/:id/timing", requireAuth, requireRole("admin"), rejectDeletedSurvey, async (req, res, next) => {
  try {
    const id = readPositiveIntegerParam(req.params.id);

    if (!id) {
      res.status(400).json({ error: "Survey id must be a positive integer" });
      return;
    }

    const timing = await fetchSurveyTimingSummary(id);

    if (!timing) {
      res.status(404).json({ error: "Survey not found" });
      return;
    }

    res.json({ timing });
  } catch (error) {
    next(error);
  }
});

surveyBuilderRouter.put("/:id/timing", requireAuth, requireRole("admin"), rejectDeletedSurvey, async (req, res, next) => {
  try {
    const id = readPositiveIntegerParam(req.params.id);

    if (!id) {
      res.status(400).json({ error: "Survey id must be a positive integer" });
      return;
    }

    const validation = validateSurveyTimingOverrideBody(req.body);

    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const survey = await fetchSurveyRecord(pool, id);

    if (!survey) {
      res.status(404).json({ error: "Survey not found" });
      return;
    }

    const user = (req as AuthenticatedRequest).user;
    await setSurveyTimingOverride({
      surveyId: id,
      userId: user.id,
      adminOverrideSeconds: validation.value.adminOverrideMinutes * 60
    });

    const timing = await fetchSurveyTimingSummary(id);
    res.json({ timing });
  } catch (error) {
    next(error);
  }
});

surveyBuilderRouter.delete("/:id/timing", requireAuth, requireRole("admin"), rejectDeletedSurvey, async (req, res, next) => {
  try {
    const id = readPositiveIntegerParam(req.params.id);

    if (!id) {
      res.status(400).json({ error: "Survey id must be a positive integer" });
      return;
    }

    const survey = await fetchSurveyRecord(pool, id);

    if (!survey) {
      res.status(404).json({ error: "Survey not found" });
      return;
    }

    await clearSurveyTimingOverride(id);

    const timing = await fetchSurveyTimingSummary(id);
    res.json({ timing });
  } catch (error) {
    next(error);
  }
});

// Soft delete: the survey disappears from every list and participant flow
// but its rows (attempts, responses, tags) all remain for analytics.
surveyBuilderRouter.delete("/:id", requireAuth, requireRole("admin"), rejectDeletedSurvey, async (req, res, next) => {
  try {
    const id = readPositiveIntegerParam(req.params.id);

    if (!id) {
      res.status(400).json({ error: "Survey id must be a positive integer" });
      return;
    }

    const result = await pool.query(
      `update surveys
       set deleted_at = now(),
           updated_at = now()
       where id = $1
         and deleted_at is null`,
      [id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: "Survey not found" });
      return;
    }

    const [survey] = await fetchSurveyStructures({
      surveyId: id,
      includeAllStatuses: true,
      includeHiddenTags: true,
      includeDeleted: true
    });

    res.json({ survey });
  } catch (error) {
    next(error);
  }
});

// Published surveys are immutable, so "editing" one means duplicating it
// into an independent draft that can be revised and published on its own.
surveyBuilderRouter.post("/:id/duplicate", requireAuth, requireRole("admin"), rejectDeletedSurvey, async (req, res, next) => {
  const id = readPositiveIntegerParam(req.params.id);

  if (!id) {
    res.status(400).json({ error: "Survey id must be a positive integer" });
    return;
  }

  const user = (req as AuthenticatedRequest).user;
  const client = await pool.connect();

  try {
    await client.query("begin");

    const newSurveyId = await duplicateSurveyTree(client, id, user.id);

    if (!newSurveyId) {
      await client.query("rollback");
      res.status(404).json({ error: "Survey not found" });
      return;
    }

    await client.query("commit");

    const [survey] = await fetchSurveyStructures({
      surveyId: newSurveyId,
      includeAllStatuses: true,
      includeHiddenTags: true
    });

    res.status(201).json({ survey });
  } catch (error) {
    await client.query("rollback");
    next(error);
  } finally {
    client.release();
  }
});

surveyBuilderRouter.post(
  "/:id/pages",
  requireAuth,
  requireRole("admin"),
  rejectStructurallyLockedSurvey,
  async (req, res, next) => {
    const surveyId = readPositiveIntegerParam(req.params.id);

    if (!surveyId) {
      res.status(400).json({ error: "Survey id must be a positive integer" });
      return;
    }

    const validation = validateSurveyPageBody(req.body);

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
        validation.value.displayOrder ?? (await fetchNextPageDisplayOrder(client, surveyId));

      await shiftPageDisplayOrdersForInsert(client, surveyId, displayOrder);
      await client.query(
        `insert into survey_pages (survey_id, title, description, display_order)
         values ($1, $2, $3, $4)`,
        [surveyId, validation.value.title, validation.value.description, displayOrder]
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
  "/:id/pages/reorder",
  requireAuth,
  requireRole("admin"),
  rejectStructurallyLockedSurvey,
  async (req, res, next) => {
    const surveyId = readPositiveIntegerParam(req.params.id);

    if (!surveyId) {
      res.status(400).json({ error: "Survey id must be a positive integer" });
      return;
    }

    const validation = validateReorderBody(req.body, "pageIds");

    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }

    try {
      const orderValidation = await validatePageReorderIds(pool, surveyId, validation.value.ids);

      if (!orderValidation.ok) {
        res.status(400).json({ error: orderValidation.error });
        return;
      }

      await reorderPages(pool, surveyId, validation.value.ids);

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
  "/:id/pages/:pageId/template",
  requireAuth,
  requireRole("admin"),
  rejectDeletedSurvey,
  async (req, res, next) => {
    const surveyId = readPositiveIntegerParam(req.params.id);
    const pageId = readPositiveIntegerParam(req.params.pageId);

    if (!surveyId || !pageId) {
      res.status(400).json({ error: "Survey id and page id must be positive integers" });
      return;
    }

    const validation = validatePageTemplateBody(req.body);

    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }

    try {
      const survey = await fetchSurveyRecord(pool, surveyId);

      if (!survey) {
        res.status(404).json({ error: "Survey not found" });
        return;
      }

      const user = (req as AuthenticatedRequest).user;
      const template = await savePageTemplateFromSurveyPage(pool, {
        survey,
        pageId,
        ...validation.value,
        userId: user.id
      });

      if (!template) {
        res.status(404).json({ error: "Page not found" });
        return;
      }

      res.status(201).json({ template });
    } catch (error) {
      next(error);
    }
  }
);

surveyBuilderRouter.post(
  "/:id/questions/:questionId/template",
  requireAuth,
  requireRole("admin"),
  rejectDeletedSurvey,
  async (req, res, next) => {
    const surveyId = readPositiveIntegerParam(req.params.id);
    const questionId = readPositiveIntegerParam(req.params.questionId);

    if (!surveyId || !questionId) {
      res.status(400).json({ error: "Survey id and question id must be positive integers" });
      return;
    }

    const validation = validateQuestionTemplateBody(req.body);

    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }

    try {
      const survey = await fetchSurveyRecord(pool, surveyId);

      if (!survey) {
        res.status(404).json({ error: "Survey not found" });
        return;
      }

      const user = (req as AuthenticatedRequest).user;
      const template = await saveQuestionTemplateFromSurveyQuestion(pool, {
        survey,
        questionId,
        ...validation.value,
        userId: user.id
      });

      if (!template) {
        res.status(404).json({ error: "Question not found" });
        return;
      }

      res.status(201).json({ template });
    } catch (error) {
      next(error);
    }
  }
);

surveyBuilderRouter.post(
  "/:id/page-templates/:templateId/insert",
  requireAuth,
  requireRole("admin"),
  rejectStructurallyLockedSurvey,
  async (req, res, next) => {
    const surveyId = readPositiveIntegerParam(req.params.id);
    const templateId = readPositiveIntegerParam(req.params.templateId);

    if (!surveyId || !templateId) {
      res.status(400).json({ error: "Survey id and template id must be positive integers" });
      return;
    }

    const validation = validatePageTemplateInsertBody(req.body);

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

      const insertResult = await insertPageTemplateIntoSurvey(client, {
        surveyId,
        templateId,
        displayOrder: validation.value.displayOrder
      });

      if (insertResult === "template-not-found") {
        await client.query("rollback");
        res.status(404).json({ error: "Template not found" });
        return;
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
  }
);

surveyBuilderRouter.post(
  "/:id/pages/:pageId/question-templates/:templateId/insert",
  requireAuth,
  requireRole("admin"),
  rejectStructurallyLockedSurvey,
  async (req, res, next) => {
    const surveyId = readPositiveIntegerParam(req.params.id);
    const pageId = readPositiveIntegerParam(req.params.pageId);
    const templateId = readPositiveIntegerParam(req.params.templateId);

    if (!surveyId || !pageId || !templateId) {
      res.status(400).json({ error: "Survey id, page id, and template id must be positive integers" });
      return;
    }

    const validation = validatePageTemplateInsertBody(req.body);

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

      const page = await fetchPageForSurvey(client, pageId, surveyId);

      if (!page) {
        await client.query("rollback");
        res.status(404).json({ error: "Page not found" });
        return;
      }

      const insertResult = await insertQuestionTemplateIntoSurveyPage(client, {
        surveyId,
        pageId,
        templateId,
        displayOrder: validation.value.displayOrder
      });

      if (insertResult === "template-not-found") {
        await client.query("rollback");
        res.status(404).json({ error: "Template not found" });
        return;
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
  }
);

surveyBuilderRouter.put(
  "/:id/pages/:pageId",
  requireAuth,
  requireRole("admin"),
  rejectStructurallyLockedSurvey,
  async (req, res, next) => {
    const surveyId = readPositiveIntegerParam(req.params.id);
    const pageId = readPositiveIntegerParam(req.params.pageId);

    if (!surveyId || !pageId) {
      res.status(400).json({ error: "Survey id and page id must be positive integers" });
      return;
    }

    const validation = validateSurveyPageBody(req.body);

    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }

    try {
      const page = await fetchPageForSurvey(pool, pageId, surveyId);

      if (!page) {
        res.status(404).json({ error: "Page not found" });
        return;
      }

      await pool.query(
        `update survey_pages
         set title = $3,
             description = $4,
             updated_at = now()
         where survey_id = $1
           and id = $2`,
        [surveyId, pageId, validation.value.title, validation.value.description]
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
  "/:id/pages/:pageId",
  requireAuth,
  requireRole("admin"),
  rejectStructurallyLockedSurvey,
  async (req, res, next) => {
    const surveyId = readPositiveIntegerParam(req.params.id);
    const pageId = readPositiveIntegerParam(req.params.pageId);

    if (!surveyId || !pageId) {
      res.status(400).json({ error: "Survey id and page id must be positive integers" });
      return;
    }

    try {
      const page = await fetchPageForSurvey(pool, pageId, surveyId);

      if (!page) {
        res.status(404).json({ error: "Page not found" });
        return;
      }

      if ((await countPagesForSurvey(pool, surveyId)) <= 1) {
        res.status(409).json({ error: "A survey must keep at least one page" });
        return;
      }

      if (await pageHasQuestions(pool, pageId)) {
        res.status(409).json({ error: "Only empty pages can be deleted" });
        return;
      }

      await pool.query(
        `delete from survey_pages
         where survey_id = $1
           and id = $2`,
        [surveyId, pageId]
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

surveyBuilderRouter.patch(
  "/:id/pages/:pageId/questions/reorder",
  requireAuth,
  requireRole("admin"),
  rejectStructurallyLockedSurvey,
  async (req, res, next) => {
    const surveyId = readPositiveIntegerParam(req.params.id);
    const pageId = readPositiveIntegerParam(req.params.pageId);

    if (!surveyId || !pageId) {
      res.status(400).json({ error: "Survey id and page id must be positive integers" });
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

      const page = await fetchPageForSurvey(client, pageId, surveyId);

      if (!page) {
        await client.query("rollback");
        res.status(404).json({ error: "Page not found" });
        return;
      }

      const orderValidation = await validateQuestionReorderIds(
        client,
        pageId,
        validation.value.ids
      );

      if (!orderValidation.ok) {
        await client.query("rollback");
        res.status(400).json({ error: orderValidation.error });
        return;
      }

      await reorderQuestions(client, pageId, validation.value.ids);
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

surveyBuilderRouter.post("/:id/questions", requireAuth, requireRole("admin"), rejectStructurallyLockedSurvey, async (req, res, next) => {
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

    const page =
      validation.value.pageId !== null
        ? await fetchPageForSurvey(client, validation.value.pageId, surveyId)
        : await fetchFirstPageForSurvey(client, surveyId);

    if (!page) {
      await client.query("rollback");
      res.status(400).json({ error: "Page must belong to this survey" });
      return;
    }

    const displayOrder =
      validation.value.displayOrder ??
      (await fetchNextQuestionDisplayOrder(client, page.id));

    await shiftQuestionDisplayOrdersForInsert(client, page.id, displayOrder);
    const questionResult = await client.query<{ id: number }>(
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
        page.id,
        validation.value.questionText,
        validation.value.questionType,
        validation.value.allowOther,
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
  rejectStructurallyLockedSurvey,
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

      // Legacy compatibility route from the one-question-per-page builder.
      // New callers should use /pages/:pageId/questions/reorder; this path
      // only reorders questions on the first page.
      const firstPage = await fetchFirstPageForSurvey(client, surveyId);

      if (!firstPage) {
        await client.query("rollback");
        res.status(404).json({ error: "Page not found" });
        return;
      }

      const orderValidation = await validateQuestionReorderIds(
        client,
        firstPage.id,
        validation.value.ids
      );

      if (!orderValidation.ok) {
        await client.query("rollback");
        res.status(400).json({ error: orderValidation.error });
        return;
      }

      await reorderQuestions(client, firstPage.id, validation.value.ids);
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
  rejectStructurallyLockedSurvey,
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

      await client.query(
        `update survey_questions
         set question_text = $3,
             question_type = $4,
             allow_other = $5,
             is_required = $6,
             help_text = $7,
             updated_at = now()
         where survey_id = $1
           and id = $2`,
        [
          surveyId,
          questionId,
          validation.value.questionText,
          validation.value.questionType,
          validation.value.allowOther,
          validation.value.isRequired,
          validation.value.helpText
        ]
      );

      if (validation.value.questionType === "scale") {
        await syncScaleAnswerOptions(client, questionId, {
          min: validation.value.scaleMin,
          max: validation.value.scaleMax
        });
      }

      if (question.question_type === "scale" && validation.value.questionType !== "scale") {
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

surveyBuilderRouter.patch(
  "/:id/questions/:questionId/page",
  requireAuth,
  requireRole("admin"),
  rejectStructurallyLockedSurvey,
  async (req, res, next) => {
    const surveyId = readPositiveIntegerParam(req.params.id);
    const questionId = readPositiveIntegerParam(req.params.questionId);

    if (!surveyId || !questionId) {
      res.status(400).json({ error: "Survey id and question id must be positive integers" });
      return;
    }

    const pageId =
      typeof req.body === "object" && req.body !== null
        ? readPositiveIntegerParam(String((req.body as { pageId?: unknown }).pageId ?? ""))
        : null;
    const displayOrder =
      typeof req.body === "object" && req.body !== null
        ? readPositiveIntegerParam(String((req.body as { displayOrder?: unknown }).displayOrder ?? ""))
        : null;

    if (!pageId) {
      res.status(400).json({ error: "pageId must be a positive integer" });
      return;
    }

    const client = await pool.connect();

    try {
      await client.query("begin");

      const question = await fetchQuestionForSurvey(client, questionId, surveyId);
      const page = await fetchPageForSurvey(client, pageId, surveyId);

      if (!question || !page) {
        await client.query("rollback");
        res.status(404).json({ error: "Question or page not found" });
        return;
      }

      const nextDisplayOrder =
        displayOrder ?? (await fetchNextQuestionDisplayOrder(client, pageId));

      if (question.page_id === pageId) {
        const orderResult = await client.query<{ id: number }>(
          `select id
           from survey_questions
           where page_id = $1
           order by display_order, id`,
          [pageId]
        );
        const ids = orderResult.rows.map((row) => row.id).filter((id) => id !== questionId);
        ids.splice(Math.min(nextDisplayOrder - 1, ids.length), 0, questionId);
        await reorderQuestions(client, pageId, ids);
      } else {
        await moveQuestionToPage(client, questionId, question.page_id, pageId, nextDisplayOrder);
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
  rejectStructurallyLockedSurvey,
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
  rejectStructurallyLockedSurvey,
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
  rejectStructurallyLockedSurvey,
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
  rejectStructurallyLockedSurvey,
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
  rejectStructurallyLockedSurvey,
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
  rejectTagMetadataLockedSurvey,
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
      await registerTagDefinition(pool, validation.value.tagKey, validation.value.tagValue);

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
  rejectTagMetadataLockedSurvey,
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
      await registerTagDefinition(pool, validation.value.tagKey, validation.value.tagValue);

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
  rejectTagMetadataLockedSurvey,
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

// Other hidden tags are question-level metadata for the system-generated
// Other choice. The question must currently support and enable Other.
surveyBuilderRouter.post(
  "/:id/questions/:questionId/other-tags",
  requireAuth,
  requireRole("admin"),
  rejectTagMetadataLockedSurvey,
  async (req, res, next) => {
    const surveyId = readPositiveIntegerParam(req.params.id);
    const questionId = readPositiveIntegerParam(req.params.questionId);

    if (!surveyId || !questionId) {
      res.status(400).json({ error: "Survey and question ids must be positive integers" });
      return;
    }

    const validation = validateAnswerTagBody(req.body);

    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }

    try {
      const question = await fetchQuestionForSurvey(pool, questionId, surveyId);

      if (!question) {
        res.status(404).json({ error: "Question not found" });
        return;
      }

      if (
        (question.question_type !== "single_select" && question.question_type !== "multi_select") ||
        !question.allow_other
      ) {
        res.status(400).json({
          error: "Other hidden tags require Allow Other on a single-select or multi-select question"
        });
        return;
      }

      await pool.query(
        `insert into question_other_tags (question_id, tag_key, tag_value)
         values ($1, $2, $3)`,
        [questionId, validation.value.tagKey, validation.value.tagValue]
      );
      await registerTagDefinition(pool, validation.value.tagKey, validation.value.tagValue);

      const [updatedSurvey] = await fetchSurveyStructures({
        surveyId,
        includeAllStatuses: true,
        includeHiddenTags: true
      });

      res.status(201).json({ survey: updatedSurvey });
    } catch (error) {
      if (isQuestionOtherTagUniqueViolation(error)) {
        res.status(409).json({ error: "Other hidden tag already exists for this question" });
        return;
      }

      next(error);
    }
  }
);

surveyBuilderRouter.put(
  "/:id/questions/:questionId/other-tags/:tagId",
  requireAuth,
  requireRole("admin"),
  rejectTagMetadataLockedSurvey,
  async (req, res, next) => {
    const surveyId = readPositiveIntegerParam(req.params.id);
    const questionId = readPositiveIntegerParam(req.params.questionId);
    const tagId = readPositiveIntegerParam(req.params.tagId);

    if (!surveyId || !questionId || !tagId) {
      res.status(400).json({ error: "Survey, question, and tag ids must be positive integers" });
      return;
    }

    const validation = validateAnswerTagBody(req.body);

    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }

    try {
      const question = await fetchQuestionForSurvey(pool, questionId, surveyId);

      if (!question) {
        res.status(404).json({ error: "Question not found" });
        return;
      }

      if (
        (question.question_type !== "single_select" && question.question_type !== "multi_select") ||
        !question.allow_other
      ) {
        res.status(400).json({
          error: "Other hidden tags require Allow Other on a single-select or multi-select question"
        });
        return;
      }

      const tag = await fetchOtherTagForQuestion(pool, tagId, questionId, surveyId);

      if (!tag) {
        res.status(404).json({ error: "Other hidden tag not found" });
        return;
      }

      await pool.query(
        `update question_other_tags
         set tag_key = $3,
             tag_value = $4,
             updated_at = now()
         where id = $1
           and question_id = $2`,
        [tagId, questionId, validation.value.tagKey, validation.value.tagValue]
      );
      await registerTagDefinition(pool, validation.value.tagKey, validation.value.tagValue);

      const [updatedSurvey] = await fetchSurveyStructures({
        surveyId,
        includeAllStatuses: true,
        includeHiddenTags: true
      });

      res.json({ survey: updatedSurvey });
    } catch (error) {
      if (isQuestionOtherTagUniqueViolation(error)) {
        res.status(409).json({ error: "Other hidden tag already exists for this question" });
        return;
      }

      next(error);
    }
  }
);

surveyBuilderRouter.delete(
  "/:id/questions/:questionId/other-tags/:tagId",
  requireAuth,
  requireRole("admin"),
  rejectTagMetadataLockedSurvey,
  async (req, res, next) => {
    const surveyId = readPositiveIntegerParam(req.params.id);
    const questionId = readPositiveIntegerParam(req.params.questionId);
    const tagId = readPositiveIntegerParam(req.params.tagId);

    if (!surveyId || !questionId || !tagId) {
      res.status(400).json({ error: "Survey, question, and tag ids must be positive integers" });
      return;
    }

    try {
      const result = await pool.query(
        `delete from question_other_tags
         where id = $1
           and question_id = $2
           and exists (
             select 1
             from survey_questions
             where survey_questions.id = $2
               and survey_questions.survey_id = $3
           )`,
        [tagId, questionId, surveyId]
      );

      if (result.rowCount === 0) {
        res.status(404).json({ error: "Other hidden tag not found" });
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

// Value tags: hidden tags conditioned on the respondent's entered value,
// for questions without answer options (text and integer types). These remain
// admin-only metadata and may be maintained on draft or published surveys.
surveyBuilderRouter.post(
  "/:id/questions/:questionId/value-tags",
  requireAuth,
  requireRole("admin"),
  rejectTagMetadataLockedSurvey,
  async (req, res, next) => {
    const surveyId = readPositiveIntegerParam(req.params.id);
    const questionId = readPositiveIntegerParam(req.params.questionId);

    if (!surveyId || !questionId) {
      res.status(400).json({ error: "Survey and question ids must be positive integers" });
      return;
    }

    const validation = validateQuestionValueTagBody(req.body);

    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }

    try {
      const question = await fetchQuestionForSurvey(pool, questionId, surveyId);

      if (!question) {
        res.status(404).json({ error: "Question not found" });
        return;
      }

      if (question.question_type !== "text" && question.question_type !== "integer") {
        res.status(400).json({
          error: "Value tags are only supported on text and integer questions; tag the answer options instead"
        });
        return;
      }

      if (
        question.question_type === "text" &&
        (validation.value.integerMin !== null || validation.value.integerMax !== null)
      ) {
        res.status(400).json({ error: "Text questions do not support integer bounds" });
        return;
      }

      await pool.query(
        `insert into question_value_tags (question_id, integer_min, integer_max, tag_key, tag_value)
         values ($1, $2, $3, $4, $5)`,
        [
          questionId,
          validation.value.integerMin,
          validation.value.integerMax,
          validation.value.tagKey,
          validation.value.tagValue
        ]
      );
      await registerTagDefinition(pool, validation.value.tagKey, validation.value.tagValue);

      const [updatedSurvey] = await fetchSurveyStructures({
        surveyId,
        includeAllStatuses: true,
        includeHiddenTags: true
      });

      res.status(201).json({ survey: updatedSurvey });
    } catch (error) {
      next(error);
    }
  }
);

surveyBuilderRouter.put(
  "/:id/questions/:questionId/value-tags/:valueTagId",
  requireAuth,
  requireRole("admin"),
  rejectTagMetadataLockedSurvey,
  async (req, res, next) => {
    const surveyId = readPositiveIntegerParam(req.params.id);
    const questionId = readPositiveIntegerParam(req.params.questionId);
    const valueTagId = readPositiveIntegerParam(req.params.valueTagId);

    if (!surveyId || !questionId || !valueTagId) {
      res.status(400).json({ error: "Survey, question, and value tag ids must be positive integers" });
      return;
    }

    const validation = validateQuestionValueTagBody(req.body);

    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }

    try {
      const question = await fetchQuestionForSurvey(pool, questionId, surveyId);

      if (!question) {
        res.status(404).json({ error: "Question not found" });
        return;
      }

      if (question.question_type !== "text" && question.question_type !== "integer") {
        res.status(400).json({
          error: "Value tags are only supported on text and integer questions; tag the answer options instead"
        });
        return;
      }

      if (
        question.question_type === "text" &&
        (validation.value.integerMin !== null || validation.value.integerMax !== null)
      ) {
        res.status(400).json({ error: "Text questions do not support integer bounds" });
        return;
      }

      const result = await pool.query(
        `update question_value_tags
         set integer_min = $3,
             integer_max = $4,
             tag_key = $5,
             tag_value = $6,
             updated_at = now()
         where id = $1
           and question_id = $2`,
        [
          valueTagId,
          questionId,
          validation.value.integerMin,
          validation.value.integerMax,
          validation.value.tagKey,
          validation.value.tagValue
        ]
      );

      if (result.rowCount === 0) {
        res.status(404).json({ error: "Value tag not found" });
        return;
      }

      await registerTagDefinition(pool, validation.value.tagKey, validation.value.tagValue);

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
  "/:id/questions/:questionId/value-tags/:valueTagId",
  requireAuth,
  requireRole("admin"),
  rejectTagMetadataLockedSurvey,
  async (req, res, next) => {
    const surveyId = readPositiveIntegerParam(req.params.id);
    const questionId = readPositiveIntegerParam(req.params.questionId);
    const valueTagId = readPositiveIntegerParam(req.params.valueTagId);

    if (!surveyId || !questionId || !valueTagId) {
      res.status(400).json({ error: "Survey, question, and value tag ids must be positive integers" });
      return;
    }

    try {
      const result = await pool.query(
        `delete from question_value_tags
         where id = $1
           and question_id = $2
           and exists (
             select 1
             from survey_questions
             where survey_questions.id = $2
               and survey_questions.survey_id = $3
           )`,
        [valueTagId, questionId, surveyId]
      );

      if (result.rowCount === 0) {
        res.status(404).json({ error: "Value tag not found" });
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

surveyBuilderRouter.post("/:id/rules", requireAuth, requireRole("admin"), rejectStructurallyLockedSurvey, async (req, res, next) => {
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
        surveyId,
        validation.value.sourcePageId,
        validation.value.sourceQuestionId,
        validation.value.sourceAnswerOptionId,
        validation.value.conditionOperator,
        validation.value.actionType,
        validation.value.targetQuestionId,
        validation.value.targetPageId,
        validation.value.skipTargetInNormalFlow,
        validation.value.advanceOnTrigger
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
  rejectStructurallyLockedSurvey,
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
             source_page_id = $4,
             source_answer_option_id = $5,
             condition_operator = $6,
             action_type = $7,
             target_question_id = $8,
             target_page_id = $9,
             skip_target_in_normal_flow = $10,
             advance_on_trigger = $11,
             updated_at = now()
         where survey_id = $1
           and id = $2`,
        [
          surveyId,
          ruleId,
          validation.value.sourceQuestionId,
          validation.value.sourcePageId,
          validation.value.sourceAnswerOptionId,
          validation.value.conditionOperator,
          validation.value.actionType,
          validation.value.targetQuestionId,
          validation.value.targetPageId,
          validation.value.skipTargetInNormalFlow,
          validation.value.advanceOnTrigger
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
  rejectStructurallyLockedSurvey,
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
