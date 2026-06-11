import type { SurveyCategory } from "@survey-portal/shared";
import express from "express";

import { pool } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { isCategoryNameUniqueViolation } from "../services/surveyBuilder.js";
import { readPositiveIntegerParam, validateCategoryBody } from "../services/validation.js";

interface SurveyCategoryRecord {
  id: number;
  name: string;
  created_at: Date;
  updated_at: Date;
}

function mapSurveyCategoryRecord(record: SurveyCategoryRecord): SurveyCategory {
  return {
    id: record.id,
    name: record.name,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString()
  };
}

export const categoriesRouter = express.Router();

categoriesRouter.get("/", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const result = await pool.query<SurveyCategoryRecord>(
      `select id, name, created_at, updated_at
       from survey_categories
       order by lower(name), id`
    );

    res.json({ categories: result.rows.map(mapSurveyCategoryRecord) });
  } catch (error) {
    next(error);
  }
});

categoriesRouter.post("/", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const validation = validateCategoryBody(req.body);

    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const result = await pool.query<SurveyCategoryRecord>(
      `insert into survey_categories (name)
       values ($1)
       returning id, name, created_at, updated_at`,
      [validation.value.name]
    );

    res.status(201).json({ category: mapSurveyCategoryRecord(result.rows[0]) });
  } catch (error) {
    if (isCategoryNameUniqueViolation(error)) {
      res.status(409).json({ error: "Category already exists" });
      return;
    }

    next(error);
  }
});

categoriesRouter.put("/:id", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const id = readPositiveIntegerParam(req.params.id);

    if (!id) {
      res.status(400).json({ error: "Category id must be a positive integer" });
      return;
    }

    const validation = validateCategoryBody(req.body);

    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const result = await pool.query<SurveyCategoryRecord>(
      `update survey_categories
       set name = $2,
           updated_at = now()
       where id = $1
       returning id, name, created_at, updated_at`,
      [id, validation.value.name]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: "Category not found" });
      return;
    }

    res.json({ category: mapSurveyCategoryRecord(result.rows[0]) });
  } catch (error) {
    if (isCategoryNameUniqueViolation(error)) {
      res.status(409).json({ error: "Category already exists" });
      return;
    }

    next(error);
  }
});

categoriesRouter.delete("/:id", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const id = readPositiveIntegerParam(req.params.id);

    if (!id) {
      res.status(400).json({ error: "Category id must be a positive integer" });
      return;
    }

    // surveys.category_id has on delete set null, so assigned surveys
    // simply become uncategorized.
    const result = await pool.query<SurveyCategoryRecord>(
      `delete from survey_categories
       where id = $1
       returning id, name, created_at, updated_at`,
      [id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: "Category not found" });
      return;
    }

    res.json({ category: mapSurveyCategoryRecord(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});
