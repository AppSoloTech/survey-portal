import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { pool } from "../src/db.js";
import {
  fetchAttemptActivitySummary,
  fetchSurveyActivitySummary,
  recordSurveyAttemptActivity,
  surveyAttemptActivityIdleGapCapSeconds
} from "../src/services/surveyActivity.js";
import {
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

describe("survey attempt activity instrumentation", () => {
  it("records authenticated activity only for owned attempts", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const otherUser = await registerUser(app);
    const survey = await createPublishedActivitySurvey(admin);
    const question = findQuestion(survey, "Activity question");
    const started = await startAttempt(app, user, survey.id);

    const forbidden = await request(app)
      .post(`/api/surveys/${survey.id}/activity`)
      .set("Cookie", otherUser.cookie)
      .send({
        attemptId: started.attempt.id,
        eventType: "page_entry",
        pageId: survey.pages[0].id,
        questionId: question.id,
        visibleQuestionIds: [question.id]
      });

    expect(forbidden.status).toBe(404);

    const response = await request(app)
      .post(`/api/surveys/${survey.id}/activity`)
      .set("Cookie", user.cookie)
      .send({
        attemptId: started.attempt.id,
        eventType: "page_entry",
        pageId: survey.pages[0].id,
        questionId: question.id,
        visibleQuestionIds: [question.id],
        answerText: "raw answer text should be ignored"
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });

    const events = await pool.query<{
      event_type: string;
      page_id: number | null;
      question_id: number | null;
      visible_question_ids: number[];
    }>(
      `select event_type, page_id, question_id, visible_question_ids
       from survey_attempt_activity_events
       where survey_attempt_id = $1`,
      [started.attempt.id]
    );

    expect(events.rows).toEqual([
      {
        event_type: "page_entry",
        page_id: survey.pages[0].id,
        question_id: question.id,
        visible_question_ids: [question.id]
      }
    ]);
  });

  it("requires a valid anonymous link and attempt token before recording activity", async () => {
    const admin = await registerAdmin(app);
    const survey = await createPublishedActivitySurvey(admin);
    const question = findQuestion(survey, "Activity question");
    const link = await createAnonymousLink(admin.cookie, survey.id);
    const started = await request(app).post(`/api/anonymous-surveys/${link.token}/start`).send({});

    expect(started.status).toBe(201);

    const invalidToken = await request(app)
      .post(`/api/anonymous-surveys/${link.token}/activity`)
      .send({
        attemptAccessToken: "aat.invalid",
        attemptId: started.body.attempt.id,
        eventType: "resume",
        pageId: survey.pages[0].id,
        questionId: question.id,
        visibleQuestionIds: [question.id]
      });

    expect(invalidToken.status).toBe(404);

    const valid = await request(app)
      .post(`/api/anonymous-surveys/${link.token}/activity`)
      .send({
        attemptAccessToken: started.body.attemptAccessToken,
        attemptId: started.body.attempt.id,
        eventType: "resume",
        pageId: survey.pages[0].id,
        questionId: question.id,
        visibleQuestionIds: [question.id]
      });

    expect(valid.status).toBe(200);

    const count = await pool.query<{ count: string }>(
      `select count(*)::text as count
       from survey_attempt_activity_events
       where survey_attempt_id = $1`,
      [started.body.attempt.id]
    );

    expect(Number(count.rows[0].count)).toBe(1);
  });

  it("rejects activity events for completed and abandoned attempts", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const survey = await createPublishedActivitySurvey(admin);
    const first = await startAttempt(app, user, survey.id);

    await pool.query(`update survey_attempts set status = 'completed' where id = $1`, [
      first.attempt.id
    ]);

    const completed = await request(app)
      .post(`/api/surveys/${survey.id}/activity`)
      .set("Cookie", user.cookie)
      .send({
        attemptId: first.attempt.id,
        eventType: "heartbeat",
        pageId: null,
        questionId: null,
        visibleQuestionIds: []
      });

    expect(completed.status).toBe(409);

    await pool.query(`update survey_attempts set status = 'abandoned' where id = $1`, [
      first.attempt.id
    ]);

    const abandoned = await request(app)
      .post(`/api/surveys/${survey.id}/activity`)
      .set("Cookie", user.cookie)
      .send({
        attemptId: first.attempt.id,
        eventType: "heartbeat",
        pageId: null,
        questionId: null,
        visibleQuestionIds: []
      });

    expect(abandoned.status).toBe(409);
  });

  it("caps long idle gaps when summarizing active seconds by attempt and survey", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const otherUser = await registerUser(app);
    const survey = await createPublishedActivitySurvey(admin);
    const first = await startAttempt(app, user, survey.id);
    const second = await startAttempt(app, otherUser, survey.id);

    await recordActivitySequence(first.attempt.id, survey.id, [
      ["page_entry", "2026-01-01T12:00:00.000Z"],
      ["answer_save", "2026-01-01T12:01:00.000Z"],
      ["resume", "2026-01-01T12:20:00.000Z"],
      ["completion", "2026-01-01T12:21:00.000Z"]
    ]);
    await recordActivitySequence(second.attempt.id, survey.id, [
      ["page_entry", "2026-01-01T12:00:00.000Z"],
      ["answer_save", "2026-01-01T12:00:30.000Z"],
      ["completion", "2026-01-01T12:02:00.000Z"]
    ]);

    const firstSummary = await fetchAttemptActivitySummary(first.attempt.id);
    const surveySummary = await fetchSurveyActivitySummary(survey.id);

    expect(surveyAttemptActivityIdleGapCapSeconds).toBe(300);
    expect(firstSummary?.activeSeconds).toBe(60 + 300 + 60);
    expect(firstSummary?.eventCount).toBe(4);
    expect(surveySummary.activeSeconds).toBe(60 + 300 + 60 + 30 + 90);
    expect(surveySummary.eventCount).toBe(7);
    expect(surveySummary.attemptCount).toBe(2);
  });

  it("keeps activity internals out of participant attempt payloads", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const survey = await createPublishedActivitySurvey(admin);
    const question = findQuestion(survey, "Activity question");
    const started = await startAttempt(app, user, survey.id);

    await request(app)
      .post(`/api/surveys/${survey.id}/activity`)
      .set("Cookie", user.cookie)
      .send({
        attemptId: started.attempt.id,
        eventType: "page_entry",
        pageId: survey.pages[0].id,
        questionId: question.id,
        visibleQuestionIds: [question.id]
      });

    const detail = await request(app)
      .get(`/api/my-surveys/${started.attempt.id}`)
      .set("Cookie", user.cookie);
    const keys = collectObjectKeys(detail.body);

    expect(detail.status).toBe(200);
    expect(keys.has("activityEvents")).toBe(false);
    expect(keys.has("activeSeconds")).toBe(false);
    expect(keys.has("visibleQuestionIds")).toBe(false);
    expect(keys.has("eventType")).toBe(false);
  });
});

async function createPublishedActivitySurvey(admin: Awaited<ReturnType<typeof registerAdmin>>) {
  let survey = await createDraftSurvey(app, admin, "Activity survey");

  survey = await addQuestion(app, admin, survey.id, {
    questionText: "Activity question",
    pageId: survey.pages[0].id
  });

  return setSurveyStatus(app, admin, survey.id, "published");
}

async function createAnonymousLink(cookie: string, surveyId: number): Promise<{
  link: { id: number; enabled: boolean; publicUrl: string };
  token: string;
}> {
  const response = await request(app)
    .post(`/api/surveys/${surveyId}/anonymous-links`)
    .set("Cookie", cookie)
    .send({});

  if (response.status !== 201) {
    throw new Error(`Anonymous link create failed with ${response.status}: ${JSON.stringify(response.body)}`);
  }

  const publicUrl = response.body.link.publicUrl as string;
  const token = publicUrl.split("/").at(-1);

  if (!token) {
    throw new Error(`Could not parse anonymous token from ${publicUrl}`);
  }

  return { link: response.body.link, token };
}

async function recordActivitySequence(
  attemptId: number,
  surveyId: number,
  events: [Parameters<typeof recordSurveyAttemptActivity>[1]["eventType"], string][]
): Promise<void> {
  for (const [eventType, occurredAt] of events) {
    await recordSurveyAttemptActivity(pool, {
      attemptId,
      surveyId,
      eventType,
      pageId: null,
      questionId: null,
      visibleQuestionIds: [],
      occurredAt: new Date(occurredAt)
    });
  }
}
