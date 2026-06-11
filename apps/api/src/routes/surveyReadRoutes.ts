import express from "express";

import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { fetchSurveyStructures } from "../services/surveyStructure.js";
import { readPositiveIntegerParam } from "../services/validation.js";

export const surveyReadRouter = express.Router();

surveyReadRouter.get("/", requireAuth, async (req, res, next) => {
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

surveyReadRouter.get("/:id", requireAuth, async (req, res, next) => {
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
      includeHiddenTags: isAdmin,
      includeDeleted: isAdmin
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
