import express from "express";

import { pool } from "../db.js";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middleware/auth.js";
import {
  deletePageTemplate,
  fetchPageTemplate,
  listPageTemplates,
  updatePageTemplateMetadata
} from "../services/surveyPageTemplates.js";
import {
  readPositiveIntegerParam,
  validatePageTemplateBody
} from "../services/validation.js";

export const adminPageTemplatesRouter = express.Router();

adminPageTemplatesRouter.get("/", requireAuth, requireRole("admin"), async (_req, res, next) => {
  try {
    res.json({ templates: await listPageTemplates(pool) });
  } catch (error) {
    next(error);
  }
});

adminPageTemplatesRouter.get("/:templateId", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const templateId = readPositiveIntegerParam(req.params.templateId);

    if (!templateId) {
      res.status(400).json({ error: "Template id must be a positive integer" });
      return;
    }

    const template = await fetchPageTemplate(pool, templateId);

    if (!template) {
      res.status(404).json({ error: "Template not found" });
      return;
    }

    res.json({ template });
  } catch (error) {
    next(error);
  }
});

adminPageTemplatesRouter.put("/:templateId", requireAuth, requireRole("admin"), async (req, res, next) => {
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
    const template = await updatePageTemplateMetadata(pool, templateId, {
      ...validation.value,
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

adminPageTemplatesRouter.delete("/:templateId", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const templateId = readPositiveIntegerParam(req.params.templateId);

    if (!templateId) {
      res.status(400).json({ error: "Template id must be a positive integer" });
      return;
    }

    if (!(await deletePageTemplate(pool, templateId))) {
      res.status(404).json({ error: "Template not found" });
      return;
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
