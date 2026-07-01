import express from "express";

import { requireAuth, requireRole, type AuthenticatedRequest } from "../middleware/auth.js";
import {
  addResponseAnswerReviewTag,
  addResponseAnswerReviewTagCategory,
  buildSurveyCsvExport,
  fetchAdminAttemptDetail,
  fetchAdminAttempts,
  fetchSurveyReportSummary,
  removeResponseAnswerReviewTagCategory,
  removeResponseAnswerReviewTag
} from "../services/surveyReporting.js";
import {
  readPositiveIntegerField,
  readPositiveIntegerParam,
  validateAttemptDateRange
} from "../services/validation.js";

export const surveyReportingRouter = express.Router();

const defaultAttemptsPageSize = 25;
const maxAttemptsPageSize = 100;

function readAttemptsPaginationParam(
  value: unknown,
  fallback: number,
  max: number,
  name: "page" | "pageSize"
): { ok: true; value: number } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true, value: fallback };
  }

  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    return { ok: false, error: `${name} must be a positive integer` };
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return { ok: false, error: `${name} must be a positive integer` };
  }

  return { ok: true, value: Math.min(parsed, max) };
}

surveyReportingRouter.get(
  "/:id/report",
  requireAuth,
  requireRole("admin"),
  async (req, res, next) => {
    try {
      const surveyId = readPositiveIntegerParam(req.params.id);

      if (!surveyId) {
        res.status(400).json({ error: "Survey id must be a positive integer" });
        return;
      }

      const rangeValidation = validateAttemptDateRange(req.query);

      if (!rangeValidation.ok) {
        res.status(400).json({ error: rangeValidation.error });
        return;
      }

      const report = await fetchSurveyReportSummary(surveyId, rangeValidation.value);

      if (!report) {
        res.status(404).json({ error: "Survey not found" });
        return;
      }

      res.json({ report });
    } catch (error) {
      next(error);
    }
  }
);

surveyReportingRouter.get(
  "/:id/attempts",
  requireAuth,
  requireRole("admin"),
  async (req, res, next) => {
    try {
      const surveyId = readPositiveIntegerParam(req.params.id);

      if (!surveyId) {
        res.status(400).json({ error: "Survey id must be a positive integer" });
        return;
      }

      const rangeValidation = validateAttemptDateRange(req.query);

      if (!rangeValidation.ok) {
        res.status(400).json({ error: rangeValidation.error });
        return;
      }

      const page = readAttemptsPaginationParam(
        req.query.page,
        1,
        Number.MAX_SAFE_INTEGER,
        "page"
      );
      const pageSize = readAttemptsPaginationParam(
        req.query.pageSize,
        defaultAttemptsPageSize,
        maxAttemptsPageSize,
        "pageSize"
      );

      if (!page.ok) {
        res.status(400).json({ error: page.error });
        return;
      }

      if (!pageSize.ok) {
        res.status(400).json({ error: pageSize.error });
        return;
      }

      const attemptsPage = await fetchAdminAttempts(surveyId, rangeValidation.value, {
        page: page.value,
        pageSize: pageSize.value
      });

      if (!attemptsPage) {
        res.status(404).json({ error: "Survey not found" });
        return;
      }

      res.json({ surveyId, attempts: attemptsPage.attempts, pagination: attemptsPage.pagination });
    } catch (error) {
      next(error);
    }
  }
);

surveyReportingRouter.get(
  "/:id/attempts/:attemptId",
  requireAuth,
  requireRole("admin"),
  async (req, res, next) => {
    try {
      const surveyId = readPositiveIntegerParam(req.params.id);
      const attemptId = readPositiveIntegerParam(req.params.attemptId);

      if (!surveyId || !attemptId) {
        res.status(400).json({ error: "Survey id and attempt id must be positive integers" });
        return;
      }

      const detail = await fetchAdminAttemptDetail(surveyId, attemptId);

      if (!detail) {
        res.status(404).json({ error: "Survey attempt not found" });
        return;
      }

      res.json(detail);
    } catch (error) {
      next(error);
    }
  }
);

surveyReportingRouter.post(
  "/:id/attempts/:attemptId/answers/:answerId/review-tags",
  requireAuth,
  requireRole("admin"),
  async (req, res, next) => {
    try {
      const surveyId = readPositiveIntegerParam(req.params.id);
      const attemptId = readPositiveIntegerParam(req.params.attemptId);
      const answerId = readPositiveIntegerParam(req.params.answerId);

      if (!surveyId || !attemptId || !answerId) {
        res.status(400).json({
          error: "Survey id, attempt id, and answer id must be positive integers"
        });
        return;
      }

      if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
        res.status(400).json({ error: "Request body is required" });
        return;
      }

      const tagDefinitionId = readPositiveIntegerField(
        req.body as Record<string, unknown>,
        "tagDefinitionId"
      );

      if (!tagDefinitionId) {
        res.status(400).json({ error: "tagDefinitionId must be a positive integer" });
        return;
      }

      const result = await addResponseAnswerReviewTag({
        answerId,
        assignedByUserId: (req as AuthenticatedRequest).user.id,
        attemptId,
        surveyId,
        tagDefinitionId
      });

      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }

      res.status(201).json({
        reviewTags: result.reviewTags,
        reviewTagGroupIds: result.reviewTagGroupIds
      });
    } catch (error) {
      next(error);
    }
  }
);

surveyReportingRouter.post(
  "/:id/attempts/:attemptId/answers/:answerId/review-tags/category",
  requireAuth,
  requireRole("admin"),
  async (req, res, next) => {
    try {
      const surveyId = readPositiveIntegerParam(req.params.id);
      const attemptId = readPositiveIntegerParam(req.params.attemptId);
      const answerId = readPositiveIntegerParam(req.params.answerId);

      if (!surveyId || !attemptId || !answerId) {
        res.status(400).json({
          error: "Survey id, attempt id, and answer id must be positive integers"
        });
        return;
      }

      if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
        res.status(400).json({ error: "Request body is required" });
        return;
      }

      const groupId = readPositiveIntegerField(req.body as Record<string, unknown>, "groupId");

      if (!groupId) {
        res.status(400).json({ error: "groupId must be a positive integer" });
        return;
      }

      const result = await addResponseAnswerReviewTagCategory({
        answerId,
        assignedByUserId: (req as AuthenticatedRequest).user.id,
        attemptId,
        groupId,
        surveyId
      });

      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }

      res.status(201).json({
        reviewTags: result.reviewTags,
        reviewTagGroupIds: result.reviewTagGroupIds
      });
    } catch (error) {
      next(error);
    }
  }
);

surveyReportingRouter.delete(
  "/:id/attempts/:attemptId/answers/:answerId/review-tags/category/:groupId",
  requireAuth,
  requireRole("admin"),
  async (req, res, next) => {
    try {
      const surveyId = readPositiveIntegerParam(req.params.id);
      const attemptId = readPositiveIntegerParam(req.params.attemptId);
      const answerId = readPositiveIntegerParam(req.params.answerId);
      const groupId = readPositiveIntegerParam(req.params.groupId);

      if (!surveyId || !attemptId || !answerId || !groupId) {
        res.status(400).json({
          error: "Survey id, attempt id, answer id, and tag category id must be positive integers"
        });
        return;
      }

      const result = await removeResponseAnswerReviewTagCategory({
        answerId,
        attemptId,
        groupId,
        surveyId
      });

      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }

      res.json({
        reviewTags: result.reviewTags,
        reviewTagGroupIds: result.reviewTagGroupIds
      });
    } catch (error) {
      next(error);
    }
  }
);

surveyReportingRouter.delete(
  "/:id/attempts/:attemptId/answers/:answerId/review-tags/:tagDefinitionId",
  requireAuth,
  requireRole("admin"),
  async (req, res, next) => {
    try {
      const surveyId = readPositiveIntegerParam(req.params.id);
      const attemptId = readPositiveIntegerParam(req.params.attemptId);
      const answerId = readPositiveIntegerParam(req.params.answerId);
      const tagDefinitionId = readPositiveIntegerParam(req.params.tagDefinitionId);

      if (!surveyId || !attemptId || !answerId || !tagDefinitionId) {
        res.status(400).json({
          error: "Survey id, attempt id, answer id, and tag definition id must be positive integers"
        });
        return;
      }

      const result = await removeResponseAnswerReviewTag({
        answerId,
        attemptId,
        surveyId,
        tagDefinitionId
      });

      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }

      res.json({
        reviewTags: result.reviewTags,
        reviewTagGroupIds: result.reviewTagGroupIds
      });
    } catch (error) {
      next(error);
    }
  }
);

surveyReportingRouter.get(
  "/:id/export.csv",
  requireAuth,
  requireRole("admin"),
  async (req, res, next) => {
    try {
      const surveyId = readPositiveIntegerParam(req.params.id);

      if (!surveyId) {
        res.status(400).json({ error: "Survey id must be a positive integer" });
        return;
      }

      const rangeValidation = validateAttemptDateRange(req.query);

      if (!rangeValidation.ok) {
        res.status(400).json({ error: rangeValidation.error });
        return;
      }

      const csvExport = await buildSurveyCsvExport(surveyId, rangeValidation.value);

      if (!csvExport) {
        res.status(404).json({ error: "Survey not found" });
        return;
      }

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${csvExport.filename}"`);
      res.send(csvExport.content);
    } catch (error) {
      next(error);
    }
  }
);
