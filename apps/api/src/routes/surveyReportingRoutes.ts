import express from "express";

import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  buildSurveyCsvExport,
  fetchAdminAttemptDetail,
  fetchAdminAttempts,
  fetchSurveyReportSummary
} from "../services/surveyReporting.js";
import { readPositiveIntegerParam } from "../services/validation.js";

export const surveyReportingRouter = express.Router();

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

      const report = await fetchSurveyReportSummary(surveyId);

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

      const attempts = await fetchAdminAttempts(surveyId);

      if (!attempts) {
        res.status(404).json({ error: "Survey not found" });
        return;
      }

      res.json({ surveyId, attempts });
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

      const csvExport = await buildSurveyCsvExport(surveyId);

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
