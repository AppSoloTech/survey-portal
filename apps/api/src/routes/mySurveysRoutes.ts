import express from "express";

import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { buildMySurveyResponse, buildMySurveysResponse } from "../services/surveyAttempts.js";
import { readPositiveIntegerParam } from "../services/validation.js";

export const mySurveysRouter = express.Router();

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
