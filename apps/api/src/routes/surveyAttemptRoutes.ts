import type { CompleteSurveyResponse } from "@survey-portal/shared";
import express from "express";

import { pool } from "../db.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import {
  buildAnswerSurveyResponse,
  buildAttemptDetail,
  buildStartSurveyResponse,
  fetchActiveAttempt,
  fetchAttemptForUser,
  fetchCompletedAttempt,
  fetchAttemptWithResponses,
  insertSurveyAttemptOrFetchActive,
  saveAnswer,
  validateAnswerForQuestion,
  validateReachedRequiredQuestions
} from "../services/surveyAttempts.js";
import { fetchQuestionForSurvey, type SurveyAttemptRecord } from "../services/surveyRecords.js";
import {
  readPositiveIntegerParam,
  validateAnswerBody,
  validateCompleteBody
} from "../services/validation.js";

export const surveyAttemptRouter = express.Router();

surveyAttemptRouter.post("/:id/start", requireAuth, async (req, res, next) => {
  try {
    const surveyId = readPositiveIntegerParam(req.params.id);

    if (!surveyId) {
      res.status(400).json({ error: "Survey id must be a positive integer" });
      return;
    }

    const user = (req as AuthenticatedRequest).user;
    const surveyResult = await pool.query<{ status: string; deleted_at: Date | null }>(
      `select status, deleted_at
       from surveys
       where id = $1`,
      [surveyId]
    );
    const surveyRow = surveyResult.rows[0];

    if (!surveyRow || surveyRow.deleted_at) {
      res.status(404).json({ error: "Published survey not found" });
      return;
    }

    const existingAttempt = await fetchActiveAttempt(user.id, surveyId);

    if (existingAttempt) {
      const response = await buildStartSurveyResponse(existingAttempt.id, user.id);
      res.json(response);
      return;
    }

    if (surveyRow.status !== "published") {
      res.status(404).json({ error: "Published survey not found" });
      return;
    }

    const completedAttempt = await fetchCompletedAttempt(user.id, surveyId);

    if (completedAttempt) {
      res.status(409).json({ error: "This survey has already been completed" });
      return;
    }

    const startedAttempt = await insertSurveyAttemptOrFetchActive(surveyId, user.id);

    const response = await buildStartSurveyResponse(startedAttempt.attemptId, user.id);
    res.status(startedAttempt.created ? 201 : 200).json(response);
  } catch (error) {
    next(error);
  }
});

surveyAttemptRouter.post("/:id/answer", requireAuth, async (req, res, next) => {
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

    const surveyRow = await client.query<{ deleted_at: Date | null }>(
      `select deleted_at
       from surveys
       where id = $1`,
      [surveyId]
    );

    if (surveyRow.rows[0]?.deleted_at) {
      await client.query("rollback");
      res.status(409).json({ error: "Survey has been deleted" });
      return;
    }

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

surveyAttemptRouter.post("/:id/complete", requireAuth, async (req, res, next) => {
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
    const surveyRow = await pool.query<{ deleted_at: Date | null }>(
      `select deleted_at
       from surveys
       where id = $1`,
      [surveyId]
    );

    if (surveyRow.rows[0]?.deleted_at) {
      res.status(409).json({ error: "Survey has been deleted" });
      return;
    }

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
