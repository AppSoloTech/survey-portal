import type { SurveyTemplateKind } from "@survey-portal/shared";
import express from "express";

import { pool } from "../db.js";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middleware/auth.js";
import {
  deleteTemplate,
  fetchTemplate,
  listTemplates,
  updateTemplateMetadata
} from "../services/surveyPageTemplates.js";
import {
  readPositiveIntegerParam,
  validatePageTemplateBody
} from "../services/validation.js";

export const adminTemplatesRouter = express.Router();

function parseKind(value: unknown): SurveyTemplateKind | null | "invalid" {
  if (value === undefined || value === null || value === "" || value === "all") {
    return null;
  }

  if (value === "page" || value === "question") {
    return value;
  }

  return "invalid";
}

adminTemplatesRouter.get("/", requireAuth, requireRole("admin"), async (req, res, next) => {
  const kind = parseKind(req.query.kind);

  if (kind === "invalid") {
    res.status(400).json({ error: "Template kind must be page, question, or all" });
    return;
  }

  try {
    res.json({
      templates: await listTemplates(pool, {
        kind,
        search: typeof req.query.search === "string" ? req.query.search : null
      })
    });
  } catch (error) {
    next(error);
  }
});

adminTemplatesRouter.get("/:templateId", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const templateId = readPositiveIntegerParam(req.params.templateId);

    if (!templateId) {
      res.status(400).json({ error: "Template id must be a positive integer" });
      return;
    }

    const template = await fetchTemplate(pool, templateId);

    if (!template) {
      res.status(404).json({ error: "Template not found" });
      return;
    }

    res.json({ template });
  } catch (error) {
    next(error);
  }
});

adminTemplatesRouter.put("/:templateId", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const templateId = readPositiveIntegerParam(req.params.templateId);

    if (!templateId) {
      res.status(400).json({ error: "Template id must be a positive integer" });
      return;
    }

    const validation = validatePageTemplateBody(req.body);

    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const user = (req as AuthenticatedRequest).user;
    const template = await updateTemplateMetadata(pool, templateId, {
      name: validation.value.name,
      description: validation.value.description,
      userId: user.id
    });

    if (!template) {
      res.status(404).json({ error: "Template not found" });
      return;
    }

    res.json({ template });
  } catch (error) {
    next(error);
  }
});

adminTemplatesRouter.delete("/:templateId", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const templateId = readPositiveIntegerParam(req.params.templateId);

    if (!templateId) {
      res.status(400).json({ error: "Template id must be a positive integer" });
      return;
    }

    if (!(await deleteTemplate(pool, templateId))) {
      res.status(404).json({ error: "Template not found" });
      return;
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
