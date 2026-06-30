import {
  getQuestionsForPage,
  type CompleteSurveyResponse,
  type ConvertAnonymousSurveyAttemptResponse,
  type SurveyAttemptActivityResponse
} from "@survey-portal/shared";
import express from "express";
import pg from "pg";
import { rateLimit } from "express-rate-limit";

import {
  hashPassword,
  mapUserRecord,
  setAuthCookie,
  type UserRecord
} from "../auth.js";
import { config } from "../config.js";
import { pool } from "../db.js";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middleware/auth.js";
import {
  AnonymousSurveyUnavailableError,
  buildAnonymousAnswerSurveyResponse,
  buildAnonymousAttemptDetail,
  buildStartAnonymousSurveyResponse,
  fetchAttemptForAnonymousOwner,
  fetchAttemptWithResponses,
  insertAnonymousSurveyAttempt,
  pruneOffPathAnswers,
  saveAnswer,
  savePageAnswers,
  validateAnswerForQuestion,
  validateReachedRequiredQuestions
} from "../services/surveyAttempts.js";
import {
  createAnonymousSurveyLink,
  disableAnonymousSurveyLink,
  fetchAvailableAnonymousSurveyLink,
  generateAnonymousAttemptToken,
  hashAnonymousAttemptToken,
  listAnonymousSurveyDirectory,
  listAnonymousSurveyLinks,
  rotateAnonymousSurveyLink,
  updateAnonymousSurveyLinkDirectoryListing
} from "../services/anonymousSurveys.js";
import {
  fetchQuestionForSurvey,
  type Queryable,
  type SurveyAttemptRecord
} from "../services/surveyRecords.js";
import { fetchSurveyStructures } from "../services/surveyStructure.js";
import { PostgresRateLimitStore } from "../services/rateLimitStore.js";
import {
  recordSurveyAttemptActivity,
  recordSurveyAttemptActivityBestEffort,
  touchSurveyAttemptActivity,
  validateSurveyAttemptActivityContext,
  type SurveyAttemptActivityContext
} from "../services/surveyActivity.js";
import {
  isRecord,
  validateAnonymousContactEmailBody,
  readPositiveIntegerParam,
  validateAnswerBody,
  validateCompleteBody,
  validatePageAnswerBody,
  validateRegistrationBody,
  validateSurveyAttemptActivityBody
} from "../services/validation.js";

export const anonymousSurveyAdminRouter = express.Router();
export const anonymousSurveyDirectoryRouter = express.Router();
export const anonymousSurveyPublicRouter = express.Router();
const anonymousSurveyRateLimitStore = new PostgresRateLimitStore(
  "anonymous_survey_public",
  config.anonymousSurveyRateLimitWindowMs
);
const anonymousSurveyRegisterRateLimitStore = new PostgresRateLimitStore(
  "anonymous_survey_register",
  config.authRateLimitWindowMs
);
const { DatabaseError } = pg;

const anonymousSurveyRateLimiter = rateLimit({
  windowMs: config.anonymousSurveyRateLimitWindowMs,
  limit: config.anonymousSurveyRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  store: anonymousSurveyRateLimitStore,
  handler: (_req, res) => {
    res.status(429).json({ error: "Too many anonymous survey requests. Please try again later." });
  }
});

const anonymousSurveyRegisterRateLimiter = rateLimit({
  windowMs: config.authRateLimitWindowMs,
  limit: config.authRegisterRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  store: anonymousSurveyRegisterRateLimitStore,
  handler: (_req, res) => {
    res.status(429).json({ error: "Too many registration attempts. Please try again later." });
  }
});

anonymousSurveyPublicRouter.use(anonymousSurveyRateLimiter);

anonymousSurveyDirectoryRouter.get("/", async (_req, res, next) => {
  try {
    res.json({ surveys: await listAnonymousSurveyDirectory() });
  } catch (error) {
    next(error);
  }
});

anonymousSurveyAdminRouter.get(
  "/:id/anonymous-links",
  requireAuth,
  requireRole("admin"),
  async (req, res, next) => {
    try {
      const surveyId = readPositiveIntegerParam(req.params.id);

      if (!surveyId) {
        res.status(400).json({ error: "Survey id must be a positive integer" });
        return;
      }

      res.json({ links: await listAnonymousSurveyLinks(surveyId) });
    } catch (error) {
      next(error);
    }
  }
);

anonymousSurveyAdminRouter.post(
  "/:id/anonymous-links",
  requireAuth,
  requireRole("admin"),
  async (req, res, next) => {
    try {
      const surveyId = readPositiveIntegerParam(req.params.id);

      if (!surveyId) {
        res.status(400).json({ error: "Survey id must be a positive integer" });
        return;
      }

      const expiresAtValidation = readOptionalExpiresAt(req.body);

      if (!expiresAtValidation.ok) {
        res.status(400).json({ error: expiresAtValidation.error });
        return;
      }

      const user = (req as AuthenticatedRequest).user;
      const created = await createAnonymousSurveyLink({
        surveyId,
        createdByUserId: user.id,
        expiresAt: expiresAtValidation.value
      });

      if (!created) {
        res.status(409).json({ error: "Anonymous links can only be created for published surveys" });
        return;
      }

      res.status(201).json({
        link: {
          ...created.link,
          publicUrl: created.publicUrl
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

anonymousSurveyAdminRouter.patch(
  "/:id/anonymous-links/:linkId/disable",
  requireAuth,
  requireRole("admin"),
  async (req, res, next) => {
    try {
      const surveyId = readPositiveIntegerParam(req.params.id);
      const linkId = readPositiveIntegerParam(req.params.linkId);

      if (!surveyId || !linkId) {
        res.status(400).json({ error: "Survey id and link id must be positive integers" });
        return;
      }

      const link = await disableAnonymousSurveyLink({ surveyId, linkId });

      if (!link) {
        res.status(404).json({ error: "Anonymous survey link not found" });
        return;
      }

      res.json({ link });
    } catch (error) {
      next(error);
    }
  }
);

anonymousSurveyAdminRouter.patch(
  "/:id/anonymous-links/:linkId/public-directory",
  requireAuth,
  requireRole("admin"),
  async (req, res, next) => {
    try {
      const surveyId = readPositiveIntegerParam(req.params.id);
      const linkId = readPositiveIntegerParam(req.params.linkId);

      if (!surveyId || !linkId) {
        res.status(400).json({ error: "Survey id and link id must be positive integers" });
        return;
      }

      if (!isRecord(req.body) || typeof req.body.listedInPublicDirectory !== "boolean") {
        res.status(400).json({ error: "listedInPublicDirectory must be a boolean" });
        return;
      }

      const link = await updateAnonymousSurveyLinkDirectoryListing({
        surveyId,
        linkId,
        listedInPublicDirectory: req.body.listedInPublicDirectory
      });

      if (!link) {
        res.status(404).json({ error: "Anonymous survey link not found" });
        return;
      }

      res.json({ link });
    } catch (error) {
      next(error);
    }
  }
);

anonymousSurveyAdminRouter.post(
  "/:id/anonymous-links/:linkId/rotate",
  requireAuth,
  requireRole("admin"),
  async (req, res, next) => {
    try {
      const surveyId = readPositiveIntegerParam(req.params.id);
      const linkId = readPositiveIntegerParam(req.params.linkId);

      if (!surveyId || !linkId) {
        res.status(400).json({ error: "Survey id and link id must be positive integers" });
        return;
      }

      const expiresAtValidation = readOptionalExpiresAt(req.body);

      if (!expiresAtValidation.ok) {
        res.status(400).json({ error: expiresAtValidation.error });
        return;
      }

      const user = (req as AuthenticatedRequest).user;
      const rotated = await rotateAnonymousSurveyLink({
        surveyId,
        linkId,
        createdByUserId: user.id,
        expiresAt: expiresAtValidation.value
      });

      if (!rotated) {
        res.status(404).json({ error: "Enabled anonymous survey link not found" });
        return;
      }

      res.status(201).json({
        disabledLink: rotated.disabledLink,
        link: {
          ...rotated.link,
          publicUrl: rotated.publicUrl
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

anonymousSurveyPublicRouter.get("/:token", async (req, res, next) => {
  try {
    const link = await fetchAvailableAnonymousSurveyLink(req.params.token);

    if (!link) {
      res.status(404).json({ error: "Anonymous survey link is unavailable" });
      return;
    }

    const [survey] = await fetchSurveyStructures({
      surveyId: link.survey_id,
      includeAllStatuses: false,
      includeHiddenTags: false
    });

    if (!survey) {
      res.status(404).json({ error: "Anonymous survey link is unavailable" });
      return;
    }

    res.json({ survey });
  } catch (error) {
    handleAnonymousPublicError(error, res, next);
  }
});

anonymousSurveyPublicRouter.post("/:token/start", async (req, res, next) => {
  try {
    const link = await fetchAvailableAnonymousSurveyLink(req.params.token);

    if (!link) {
      res.status(404).json({ error: "Anonymous survey link is unavailable" });
      return;
    }

    const accessToken = generateAnonymousAttemptToken();
    const startedAttempt = await insertAnonymousSurveyAttempt({
      surveyId: link.survey_id,
      anonymousLinkId: link.id,
      accessTokenHash: accessToken.tokenHash
    });
    const response = await buildStartAnonymousSurveyResponse({
      attemptId: startedAttempt.attemptId,
      anonymousLinkId: link.id,
      accessToken: accessToken.token,
      accessTokenHash: accessToken.tokenHash
    });

    res.status(201).json(response);
  } catch (error) {
    handleAnonymousPublicError(error, res, next);
  }
});

anonymousSurveyPublicRouter.post("/:token/activity", async (req, res, next) => {
  const validation = validateSurveyAttemptActivityBody(req.body);

  if (!validation.ok) {
    res.status(400).json({ error: validation.error });
    return;
  }

  try {
    const owner = await resolveAnonymousOwner(req.params.token, req.body);

    if (!owner.ok) {
      res.status(owner.status).json({ error: owner.error });
      return;
    }

    const attempt = await fetchAttemptForAnonymousOwner(
      pool,
      validation.value.attemptId,
      owner.link.id,
      owner.accessTokenHash,
      owner.link.survey_id
    );

    if (!attempt) {
      res.status(404).json({ error: "Survey attempt not found" });
      return;
    }

    if (attempt.status === "completed") {
      res.status(409).json({ error: "Completed attempts cannot accept activity events" });
      return;
    }

    if (attempt.status === "abandoned") {
      res.status(409).json({ error: "Abandoned attempts cannot accept activity events" });
      return;
    }

    const contextIsValid = await validateSurveyAttemptActivityContext(pool, {
      surveyId: owner.link.survey_id,
      pageId: validation.value.pageId,
      questionId: validation.value.questionId,
      visibleQuestionIds: validation.value.visibleQuestionIds
    });

    if (!contextIsValid) {
      res.status(400).json({ error: "Activity context does not belong to this survey" });
      return;
    }

    await recordSurveyAttemptActivity(pool, {
      attemptId: attempt.id,
      surveyId: owner.link.survey_id,
      eventType: validation.value.eventType,
      pageId: validation.value.pageId,
      questionId: validation.value.questionId,
      visibleQuestionIds: validation.value.visibleQuestionIds
    });
    await touchSurveyAttemptActivity(pool, attempt.id);

    const response: SurveyAttemptActivityResponse = { ok: true };
    res.json(response);
  } catch (error) {
    handleAnonymousPublicError(error, res, next);
  }
});

anonymousSurveyPublicRouter.post("/:token/answer", async (req, res, next) => {
  const validation = validateAnswerBody(req.body);

  if (!validation.ok) {
    res.status(400).json({ error: validation.error });
    return;
  }

  let owner: Awaited<ReturnType<typeof resolveAnonymousOwner>>;

  try {
    owner = await resolveAnonymousOwner(req.params.token, req.body);
  } catch (error) {
    handleAnonymousPublicError(error, res, next);
    return;
  }

  if (!owner.ok) {
    res.status(owner.status).json({ error: owner.error });
    return;
  }

  const client = await pool.connect();

  try {
    await client.query("begin");

    const attempt = await fetchAttemptForAnonymousOwner(
      client,
      validation.value.attemptId,
      owner.link.id,
      owner.accessTokenHash,
      owner.link.survey_id
    );

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
      owner.link.survey_id
    );

    if (!question) {
      await client.query("rollback");
      res.status(400).json({ error: "Question does not belong to this survey" });
      return;
    }

    const answerValidation = await validateAnswerForQuestion(client, question, validation.value);

    if (!answerValidation.ok) {
      await client.query("rollback");
      res.status(400).json({ error: answerValidation.error });
      return;
    }

    await saveAnswer(client, attempt.id, question, answerValidation.value);
    const activityContext: SurveyAttemptActivityContext = {
      attemptId: attempt.id,
      surveyId: owner.link.survey_id,
      eventType: "answer_save",
      pageId: question.page_id,
      questionId: question.id,
      visibleQuestionIds: [question.id]
    };

    const [survey] = await fetchSurveyStructures({
      surveyId: owner.link.survey_id,
      includeAllStatuses: true,
      includeHiddenTags: false
    });

    if (survey) {
      await pruneOffPathAnswers(client, survey, attempt.id);
    }

    await touchAttempt(client, attempt.id);
    await client.query("commit");
    recordSurveyAttemptActivityBestEffort(activityContext);

    const response = await buildAnonymousAnswerSurveyResponse(
      attempt.id,
      owner.link.id,
      owner.accessTokenHash
    );
    res.json(response);
  } catch (error) {
    await client.query("rollback");
    handleAnonymousPublicError(error, res, next);
  } finally {
    client.release();
  }
});

anonymousSurveyPublicRouter.post("/:token/pages/:pageId/answer", async (req, res, next) => {
  const pageId = readPositiveIntegerParam(req.params.pageId);

  if (!pageId) {
    res.status(400).json({ error: "Page id must be a positive integer" });
    return;
  }

  const validation = validatePageAnswerBody(req.body);

  if (!validation.ok) {
    res.status(400).json({ error: validation.error });
    return;
  }

  let owner: Awaited<ReturnType<typeof resolveAnonymousOwner>>;

  try {
    owner = await resolveAnonymousOwner(req.params.token, req.body);
  } catch (error) {
    handleAnonymousPublicError(error, res, next);
    return;
  }

  if (!owner.ok) {
    res.status(owner.status).json({ error: owner.error });
    return;
  }

  const client = await pool.connect();

  try {
    await client.query("begin");

    const attempt = await fetchAttemptForAnonymousOwner(
      client,
      validation.value.attemptId,
      owner.link.id,
      owner.accessTokenHash,
      owner.link.survey_id
    );

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

    const [survey] = await fetchSurveyStructures({
      surveyId: owner.link.survey_id,
      includeAllStatuses: true,
      includeHiddenTags: false
    });

    if (!survey) {
      await client.query("rollback");
      res.status(404).json({ error: "Survey not found" });
      return;
    }

    const saveValidation = await savePageAnswers(
      client,
      survey,
      pageId,
      attempt.id,
      validation.value
    );

    if (!saveValidation.ok) {
      await client.query("rollback");
      res.status(400).json({ error: saveValidation.error });
      return;
    }

    await pruneOffPathAnswers(client, survey, attempt.id);
    const activityContext: SurveyAttemptActivityContext = {
      attemptId: attempt.id,
      surveyId: owner.link.survey_id,
      eventType: "answer_save",
      pageId,
      questionId: null,
      visibleQuestionIds: getQuestionsForPage(survey, pageId).map((question) => question.id)
    };
    await touchAttempt(client, attempt.id);
    await client.query("commit");
    recordSurveyAttemptActivityBestEffort(activityContext);

    const response = await buildAnonymousAnswerSurveyResponse(
      attempt.id,
      owner.link.id,
      owner.accessTokenHash
    );
    res.json(response);
  } catch (error) {
    await client.query("rollback");
    handleAnonymousPublicError(error, res, next);
  } finally {
    client.release();
  }
});

anonymousSurveyPublicRouter.post("/:token/complete", async (req, res, next) => {
  const validation = validateCompleteBody(req.body);

  if (!validation.ok) {
    res.status(400).json({ error: validation.error });
    return;
  }

  try {
    const owner = await resolveAnonymousOwner(req.params.token, req.body);

    if (!owner.ok) {
      res.status(owner.status).json({ error: owner.error });
      return;
    }

    const attempt = await fetchAttemptForAnonymousOwner(
      pool,
      validation.value.attemptId,
      owner.link.id,
      owner.accessTokenHash,
      owner.link.survey_id
    );

    if (!attempt) {
      res.status(404).json({ error: "Survey attempt not found" });
      return;
    }

    if (attempt.status === "completed") {
      const completedAttempt = await buildAnonymousAttemptDetail(
        attempt.id,
        owner.link.id,
        owner.accessTokenHash
      );
      const existingResponse: CompleteSurveyResponse = {
        attempt: completedAttempt.attempt,
        issueProfileProgress: completedAttempt.issueProfileProgress,
        issueProfileEmojiCollection: completedAttempt.issueProfileEmojiCollection
      };
      res.json(existingResponse);
      return;
    }

    if (attempt.status === "abandoned") {
      res.status(409).json({ error: "Abandoned attempts cannot be completed" });
      return;
    }

    const detail = await buildAnonymousAttemptDetail(
      attempt.id,
      owner.link.id,
      owner.accessTokenHash
    );
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
         and anonymous_link_id = $2
         and anonymous_access_token_hash = $3
       returning
         id,
         survey_id,
         user_id,
         anonymous_link_id,
         anonymous_access_token_hash,
         anonymous_contact_email,
         status,
         started_at,
         last_activity_at,
         completed_at,
         created_at,
         updated_at`,
      [attempt.id, owner.link.id, owner.accessTokenHash]
    );
    recordSurveyAttemptActivityBestEffort({
      attemptId: updateResult.rows[0].id,
      surveyId: owner.link.survey_id,
      eventType: "completion",
      pageId: null,
      questionId: null,
      visibleQuestionIds: []
    });

    const completedAttempt = await buildAnonymousAttemptDetail(
      updateResult.rows[0].id,
      owner.link.id,
      owner.accessTokenHash
    );
    const response: CompleteSurveyResponse = {
      attempt: completedAttempt.attempt,
      issueProfileProgress: completedAttempt.issueProfileProgress,
      issueProfileEmojiCollection: completedAttempt.issueProfileEmojiCollection
    };
    res.json(response);
  } catch (error) {
    handleAnonymousPublicError(error, res, next);
  }
});

anonymousSurveyPublicRouter.post(
  "/:token/register",
  anonymousSurveyRegisterRateLimiter,
  async (req, res, next) => {
    const registrationValidation = validateRegistrationBody(req.body);

    if (!registrationValidation.ok) {
      res.status(400).json({ error: registrationValidation.error });
      return;
    }

    const completionValidation = validateCompleteBody(req.body);

    if (!completionValidation.ok) {
      res.status(400).json({ error: completionValidation.error });
      return;
    }

    try {
      const owner = await resolveAnonymousOwner(req.params.token, req.body);

      if (!owner.ok) {
        res.status(owner.status).json({ error: owner.error });
        return;
      }

      const passwordHash = await hashPassword(registrationValidation.value.password);
      const client = await pool.connect();
      let didCommit = false;

      try {
        await client.query("begin");

        const attemptResult = await client.query<SurveyAttemptRecord>(
          `select
             id,
             survey_id,
             user_id,
             anonymous_link_id,
             anonymous_access_token_hash,
             anonymous_contact_email,
             status,
             started_at,
             last_activity_at,
             completed_at,
             created_at,
             updated_at
           from survey_attempts
           where id = $1
             and survey_id = $2
             and user_id is null
             and anonymous_link_id = $3
             and anonymous_access_token_hash = $4
           for update`,
          [
            completionValidation.value.attemptId,
            owner.link.survey_id,
            owner.link.id,
            owner.accessTokenHash
          ]
        );
        const attempt = attemptResult.rows[0];

        if (!attempt) {
          await client.query("rollback");
          res.status(404).json({ error: "Survey attempt not found" });
          return;
        }

        if (attempt.status !== "completed") {
          await client.query("rollback");
          res.status(409).json({ error: "Only completed anonymous attempts can be registered" });
          return;
        }

        const userResult = await client.query<UserRecord>(
          `insert into users (first_name, last_name, email, password_hash, role)
           values ($1, $2, $3, $4, 'user')
           returning id, first_name, last_name, email, role, session_version, created_at, updated_at`,
          [
            registrationValidation.value.firstName,
            registrationValidation.value.lastName,
            registrationValidation.value.email,
            passwordHash
          ]
        );
        const user = mapUserRecord(userResult.rows[0]);

        const updateResult = await client.query<SurveyAttemptRecord>(
          `update survey_attempts
           set user_id = $1,
               anonymous_link_id = null,
               anonymous_access_token_hash = null,
               anonymous_contact_email = null,
               updated_at = now()
           where id = $2
             and survey_id = $3
             and user_id is null
             and anonymous_link_id = $4
             and anonymous_access_token_hash = $5
             and status = 'completed'
           returning
             id,
             survey_id,
             user_id,
             anonymous_link_id,
             anonymous_access_token_hash,
             anonymous_contact_email,
             status,
             started_at,
             last_activity_at,
             completed_at,
             created_at,
             updated_at`,
          [user.id, attempt.id, owner.link.survey_id, owner.link.id, owner.accessTokenHash]
        );

        if (updateResult.rowCount !== 1) {
          await client.query("rollback");
          res.status(404).json({ error: "Survey attempt not found" });
          return;
        }

        const convertedAttempt = await fetchAttemptWithResponses(
          updateResult.rows[0].id,
          user.id,
          client
        );

        if (!convertedAttempt) {
          await client.query("rollback");
          res.status(404).json({ error: "Survey attempt not found" });
          return;
        }

        await client.query("commit");
        didCommit = true;

        const response: ConvertAnonymousSurveyAttemptResponse = {
          user,
          attempt: convertedAttempt
        };

        setAuthCookie(res, user, userResult.rows[0].session_version);
        res.status(201).json(response);
      } catch (error) {
        if (!didCommit) {
          await client.query("rollback");
        }

        if (isUniqueEmailError(error)) {
          res.status(409).json({ error: "Email is already registered" });
          return;
        }

        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      handleAnonymousPublicError(error, res, next);
    }
  }
);

anonymousSurveyPublicRouter.post("/:token/contact-email", async (req, res, next) => {
  const validation = validateAnonymousContactEmailBody(req.body);

  if (!validation.ok) {
    res.status(400).json({ error: validation.error });
    return;
  }

  try {
    const owner = await resolveAnonymousOwner(req.params.token, req.body);

    if (!owner.ok) {
      res.status(owner.status).json({ error: owner.error });
      return;
    }

    const attempt = await fetchAttemptForAnonymousOwner(
      pool,
      validation.value.attemptId,
      owner.link.id,
      owner.accessTokenHash,
      owner.link.survey_id
    );

    if (!attempt) {
      res.status(404).json({ error: "Survey attempt not found" });
      return;
    }

    if (attempt.status !== "completed") {
      res.status(409).json({ error: "Follow-up email can be saved after completion" });
      return;
    }

    const updateResult = await pool.query<{ id: number }>(
      `update survey_attempts
       set anonymous_contact_email = $1,
           last_activity_at = now(),
           updated_at = now()
       where id = $2
         and anonymous_link_id = $3
         and anonymous_access_token_hash = $4
         and survey_id = $5
       returning id`,
      [
        validation.value.email,
        attempt.id,
        owner.link.id,
        owner.accessTokenHash,
        owner.link.survey_id
      ]
    );

    if (updateResult.rowCount !== 1) {
      res.status(404).json({ error: "Survey attempt not found" });
      return;
    }

    const detail = await buildAnonymousAttemptDetail(
      attempt.id,
      owner.link.id,
      owner.accessTokenHash
    );
    const response: CompleteSurveyResponse = {
      attempt: detail.attempt,
      issueProfileProgress: detail.issueProfileProgress,
      issueProfileEmojiCollection: detail.issueProfileEmojiCollection
    };
    res.json(response);
  } catch (error) {
    handleAnonymousPublicError(error, res, next);
  }
});

export async function resetAnonymousSurveyRateLimiterForTests(): Promise<void> {
  await Promise.all([
    anonymousSurveyRateLimitStore.resetAll(),
    anonymousSurveyRegisterRateLimitStore.resetAll()
  ]);
}

async function resolveAnonymousOwner(
  token: string,
  body: unknown
): Promise<
  | {
      ok: true;
      link: NonNullable<Awaited<ReturnType<typeof fetchAvailableAnonymousSurveyLink>>>;
      accessTokenHash: string;
    }
  | { ok: false; status: number; error: string }
> {
  const link = await fetchAvailableAnonymousSurveyLink(token);

  if (!link) {
    return { ok: false, status: 404, error: "Anonymous survey link is unavailable" };
  }

  const accessToken = isRecord(body) && typeof body.attemptAccessToken === "string"
    ? body.attemptAccessToken
    : "";
  const accessTokenHash = hashAnonymousAttemptToken(accessToken);

  if (!accessTokenHash) {
    return { ok: false, status: 400, error: "Anonymous attempt token is required" };
  }

  return { ok: true, link, accessTokenHash };
}

async function touchAttempt(queryable: Queryable, attemptId: number): Promise<void> {
  await queryable.query(
    `update survey_attempts
     set last_activity_at = now(),
         updated_at = now()
     where id = $1`,
    [attemptId]
  );
}

function readOptionalExpiresAt(body: unknown): { ok: true; value: Date | null } | { ok: false; error: string } {
  if (!isRecord(body) || body.expiresAt === undefined || body.expiresAt === null || body.expiresAt === "") {
    return { ok: true, value: null };
  }

  if (typeof body.expiresAt !== "string") {
    return { ok: false, error: "expiresAt must be an ISO date string" };
  }

  const expiresAt = new Date(body.expiresAt);

  if (Number.isNaN(expiresAt.getTime())) {
    return { ok: false, error: "expiresAt must be a valid date" };
  }

  return { ok: true, value: expiresAt };
}

function handleAnonymousPublicError(
  error: unknown,
  res: express.Response,
  next: express.NextFunction
): void {
  if (error instanceof AnonymousSurveyUnavailableError) {
    res.status(404).json({ error: "Anonymous survey link is unavailable" });
    return;
  }

  next(error);
}

function isUniqueEmailError(error: unknown): boolean {
  return error instanceof DatabaseError && error.constraint === "users_email_unique";
}
