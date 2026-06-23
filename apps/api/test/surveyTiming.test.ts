import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { calculateDefaultEstimateSeconds } from "../src/services/surveyTiming.js";
import {
  addOption,
  addQuestion,
  collectObjectKeys,
  createDraftSurvey,
  findQuestion,
  registerAdmin,
  registerUser,
  setSurveyStatus,
  startAttempt
} from "./helpers/factories.js";

const app = createApp();

describe("survey timing estimates", () => {
  it("falls back to a question-weighted default when no valid completed sample exists", async () => {
    const admin = await registerAdmin(app);
    const survey = await createPublishedTimingSurvey(admin);

    const response = await request(app)
      .get(`/api/surveys/${survey.id}/timing`)
      .set("Cookie", admin.cookie);

    expect(response.status).toBe(200);
    expect(response.body.timing).toEqual({
      derivedEstimateSeconds: null,
      defaultEstimateSeconds: calculateDefaultEstimateSeconds(survey),
      adminOverrideSeconds: null,
      effectiveEstimateSeconds: calculateDefaultEstimateSeconds(survey),
      sampleCount: 0,
      estimateSource: "default"
    });
  });

  it("derives the median estimate from valid completed attempts and ignores invalid samples", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const survey = await createPublishedTimingSurvey(admin);
    const { pool } = await import("../src/db.js");

    await insertAttemptSample({ surveyId: survey.id, userId: user.user.id, status: "completed", seconds: 120 });
    await insertAttemptSample({ surveyId: survey.id, userId: user.user.id, status: "completed", seconds: 180 });
    await insertAttemptSample({ surveyId: survey.id, userId: user.user.id, status: "completed", seconds: 240 });
    await insertAttemptSample({ surveyId: survey.id, userId: user.user.id, status: "in_progress", seconds: 600 });
    await insertAttemptSample({ surveyId: survey.id, userId: user.user.id, status: "abandoned", seconds: 900 });
    await pool.query(
      `insert into survey_attempts (survey_id, user_id, status, started_at, completed_at, last_activity_at)
       values
         ($1, $2, 'completed', null, now(), now()),
         ($1, $2, 'completed', now(), null, now()),
         ($1, $2, 'completed', now(), now(), now()),
         ($1, $2, 'completed', now(), now() + interval '5 hours', now())`,
      [survey.id, user.user.id]
    );

    const response = await request(app)
      .get(`/api/surveys/${survey.id}/timing`)
      .set("Cookie", admin.cookie);

    expect(response.status).toBe(200);
    expect(response.body.timing.derivedEstimateSeconds).toBe(180);
    expect(response.body.timing.sampleCount).toBe(3);
    expect(response.body.timing.effectiveEstimateSeconds).toBe(180);
    expect(response.body.timing.estimateSource).toBe("statistical");
  });

  it("saves and clears an admin override with precedence over statistical and default estimates", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const survey = await createPublishedTimingSurvey(admin);

    await insertAttemptSample({ surveyId: survey.id, userId: user.user.id, status: "completed", seconds: 180 });

    const saveResponse = await request(app)
      .put(`/api/surveys/${survey.id}/timing`)
      .set("Cookie", admin.cookie)
      .send({ adminOverrideMinutes: 9 });

    expect(saveResponse.status).toBe(200);
    expect(saveResponse.body.timing.adminOverrideSeconds).toBe(540);
    expect(saveResponse.body.timing.effectiveEstimateSeconds).toBe(540);
    expect(saveResponse.body.timing.estimateSource).toBe("admin_override");

    const clearResponse = await request(app)
      .delete(`/api/surveys/${survey.id}/timing`)
      .set("Cookie", admin.cookie);

    expect(clearResponse.status).toBe(200);
    expect(clearResponse.body.timing.adminOverrideSeconds).toBeNull();
    expect(clearResponse.body.timing.effectiveEstimateSeconds).toBe(180);
    expect(clearResponse.body.timing.estimateSource).toBe("statistical");
  });

  it("allows timing overrides on published surveys without unlocking structural edits", async () => {
    const admin = await registerAdmin(app);
    const survey = await createPublishedTimingSurvey(admin);

    const saveResponse = await request(app)
      .put(`/api/surveys/${survey.id}/timing`)
      .set("Cookie", admin.cookie)
      .send({ adminOverrideMinutes: 7 });

    expect(saveResponse.status).toBe(200);

    const structuralResponse = await request(app)
      .post(`/api/surveys/${survey.id}/questions`)
      .set("Cookie", admin.cookie)
      .send({ questionText: "Blocked", questionType: "text", isRequired: true });

    expect(structuralResponse.status).toBe(409);
  });

  it("rejects timing metadata and override mutations for non-admin users", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const survey = await createPublishedTimingSurvey(admin);

    const getResponse = await request(app)
      .get(`/api/surveys/${survey.id}/timing`)
      .set("Cookie", user.cookie);
    const putResponse = await request(app)
      .put(`/api/surveys/${survey.id}/timing`)
      .set("Cookie", user.cookie)
      .send({ adminOverrideMinutes: 4 });

    expect(getResponse.status).toBe(403);
    expect(putResponse.status).toBe(403);
  });

  it("keeps admin timing audit fields out of participant survey payloads", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const survey = await createPublishedTimingSurvey(admin);

    await request(app)
      .put(`/api/surveys/${survey.id}/timing`)
      .set("Cookie", admin.cookie)
      .send({ adminOverrideMinutes: 5 });

    const surveyResponse = await request(app)
      .get(`/api/surveys/${survey.id}`)
      .set("Cookie", user.cookie);
    const startResponse = await startAttempt(app, user, survey.id);
    const surveyKeys = collectObjectKeys(surveyResponse.body);
    const startKeys = collectObjectKeys(startResponse);

    expect(surveyResponse.status).toBe(200);
    expect(surveyResponse.body.survey.effectiveEstimateSeconds).toBe(300);
    expect(startResponse.survey.effectiveEstimateSeconds).toBe(300);

    for (const key of [
      "derivedEstimateSeconds",
      "defaultEstimateSeconds",
      "adminOverrideSeconds",
      "sampleCount",
      "estimateSource"
    ]) {
      expect(surveyKeys.has(key)).toBe(false);
      expect(startKeys.has(key)).toBe(false);
    }
  });
});

async function createPublishedTimingSurvey(admin: Awaited<ReturnType<typeof registerAdmin>>) {
  let survey = await createDraftSurvey(app, admin, "Timing survey");
  const pageId = survey.pages[0].id;

  survey = await addQuestion(app, admin, survey.id, {
    questionText: "Describe the site",
    questionType: "text",
    pageId
  });
  survey = await addQuestion(app, admin, survey.id, {
    questionText: "How many exits?",
    questionType: "integer",
    pageId
  });
  survey = await addQuestion(app, admin, survey.id, {
    questionText: "Priority",
    questionType: "single_select",
    pageId
  });

  const selectQuestion = findQuestion(survey, "Priority");
  survey = await addOption(app, admin, survey.id, selectQuestion.id, "Low");
  survey = await addOption(app, admin, survey.id, selectQuestion.id, "High");

  return setSurveyStatus(app, admin, survey.id, "published");
}

async function insertAttemptSample(input: {
  surveyId: number;
  userId: number;
  status: "completed" | "in_progress" | "abandoned";
  seconds: number;
}): Promise<void> {
  const { pool } = await import("../src/db.js");

  await pool.query(
    `insert into survey_attempts (
       survey_id,
       user_id,
       status,
       started_at,
       completed_at,
       last_activity_at
     )
     values (
       $1,
       $2,
       $3,
       timestamp '2026-01-01 12:00:00',
       timestamp '2026-01-01 12:00:00' + ($4::int * interval '1 second'),
       timestamp '2026-01-01 12:00:00' + ($4::int * interval '1 second')
     )`,
    [input.surveyId, input.userId, input.status, input.seconds]
  );
}
