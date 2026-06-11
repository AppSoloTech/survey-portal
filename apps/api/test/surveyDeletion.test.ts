import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import {
  completeAttempt,
  createPublishedJumpSurvey,
  deleteSurvey,
  registerAdmin,
  registerUser,
  startAttempt,
  submitAnswer
} from "./helpers/factories.js";

const app = createApp();

describe("survey soft delete", () => {
  it("rejects non-admin delete requests", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const { survey } = await createPublishedJumpSurvey(app, admin);

    const response = await request(app)
      .delete(`/api/surveys/${survey.id}`)
      .set("Cookie", user.cookie);

    expect(response.status).toBe(403);
  });

  it("soft deletes a survey and returns the deleted record", async () => {
    const admin = await registerAdmin(app);
    const { survey } = await createPublishedJumpSurvey(app, admin);

    const deleted = await deleteSurvey(app, admin, survey.id);

    expect(deleted.id).toBe(survey.id);
    expect(deleted.deletedAt).toEqual(expect.any(String));
    expect(deleted.status).toBe("published");

    const repeatResponse = await request(app)
      .delete(`/api/surveys/${survey.id}`)
      .set("Cookie", admin.cookie);
    expect(repeatResponse.status).toBe(409);
    expect(repeatResponse.body).toEqual({ error: "Survey has been deleted" });
  });

  it("hides deleted surveys from survey lists for admins and participants", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const { survey } = await createPublishedJumpSurvey(app, admin);

    await deleteSurvey(app, admin, survey.id);

    const adminList = await request(app).get("/api/surveys").set("Cookie", admin.cookie);
    expect(adminList.status).toBe(200);
    expect(
      adminList.body.surveys.some((item: { id: number }) => item.id === survey.id)
    ).toBe(false);

    const userList = await request(app).get("/api/surveys").set("Cookie", user.cookie);
    expect(userList.status).toBe(200);
    expect(
      userList.body.surveys.some((item: { id: number }) => item.id === survey.id)
    ).toBe(false);
  });

  it("removes deleted surveys from my-surveys even after a completed attempt", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const { survey, routeQuestion, stayOptionId, middleQuestion } =
      await createPublishedJumpSurvey(app, admin);

    const started = await startAttempt(app, user, survey.id);
    await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: routeQuestion.id,
      selectedAnswerOptionIds: [stayOptionId]
    });
    await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: middleQuestion.id,
      answerText: "done"
    });
    await completeAttempt(app, user, survey.id, started.attempt.id);

    await deleteSurvey(app, admin, survey.id);

    const mySurveys = await request(app).get("/api/my-surveys").set("Cookie", user.cookie);
    expect(mySurveys.status).toBe(200);
    expect(
      mySurveys.body.surveys.some(
        (item: { survey: { id: number } }) => item.survey.id === survey.id
      )
    ).toBe(false);

    const myAttempt = await request(app)
      .get(`/api/my-surveys/${started.attempt.id}`)
      .set("Cookie", user.cookie);
    expect(myAttempt.status).toBe(404);
  });

  it("blocks starts, answers, and completion on deleted surveys", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const { survey, routeQuestion, stayOptionId } = await createPublishedJumpSurvey(app, admin);

    const started = await startAttempt(app, user, survey.id);

    await deleteSurvey(app, admin, survey.id);

    await startAttempt(app, user, survey.id, 404);

    const answerResponse = await request(app)
      .post(`/api/surveys/${survey.id}/answer`)
      .set("Cookie", user.cookie)
      .send({
        attemptId: started.attempt.id,
        questionId: routeQuestion.id,
        selectedAnswerOptionIds: [stayOptionId]
      });
    expect(answerResponse.status).toBe(409);
    expect(answerResponse.body).toEqual({ error: "Survey has been deleted" });

    const completeResponse = await request(app)
      .post(`/api/surveys/${survey.id}/complete`)
      .set("Cookie", user.cookie)
      .send({ attemptId: started.attempt.id });
    expect(completeResponse.status).toBe(409);
    expect(completeResponse.body).toEqual({ error: "Survey has been deleted" });
  });

  it("blocks builder mutations on deleted surveys", async () => {
    const admin = await registerAdmin(app);
    const { survey } = await createPublishedJumpSurvey(app, admin);

    await deleteSurvey(app, admin, survey.id);

    const updateResponse = await request(app)
      .put(`/api/surveys/${survey.id}`)
      .set("Cookie", admin.cookie)
      .send({ title: "Renamed", status: "published" });
    expect(updateResponse.status).toBe(409);
    expect(updateResponse.body).toEqual({ error: "Survey has been deleted" });

    const statusResponse = await request(app)
      .patch(`/api/surveys/${survey.id}/status`)
      .set("Cookie", admin.cookie)
      .send({ status: "retired" });
    expect(statusResponse.status).toBe(409);
  });

  it("keeps admin analytics access and database rows after deletion", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const { survey, routeQuestion, stayOptionId, middleQuestion } =
      await createPublishedJumpSurvey(app, admin);

    const started = await startAttempt(app, user, survey.id);
    await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: routeQuestion.id,
      selectedAnswerOptionIds: [stayOptionId]
    });
    await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: middleQuestion.id,
      answerText: "kept"
    });
    await completeAttempt(app, user, survey.id, started.attempt.id);

    await deleteSurvey(app, admin, survey.id);

    // Admins can still resolve the survey, report, and attempt detail by id.
    const surveyResponse = await request(app)
      .get(`/api/surveys/${survey.id}`)
      .set("Cookie", admin.cookie);
    expect(surveyResponse.status).toBe(200);
    expect(surveyResponse.body.survey.deletedAt).toEqual(expect.any(String));

    const reportResponse = await request(app)
      .get(`/api/surveys/${survey.id}/report`)
      .set("Cookie", admin.cookie);
    expect(reportResponse.status).toBe(200);
    expect(reportResponse.body.report.attemptCounts.completed).toBe(1);

    const attemptDetailResponse = await request(app)
      .get(`/api/surveys/${survey.id}/attempts/${started.attempt.id}`)
      .set("Cookie", admin.cookie);
    expect(attemptDetailResponse.status).toBe(200);

    // Participants cannot resolve the deleted survey by id.
    const participantResponse = await request(app)
      .get(`/api/surveys/${survey.id}`)
      .set("Cookie", user.cookie);
    expect(participantResponse.status).toBe(404);

    // All rows are retained; the delete only stamps deleted_at.
    const { pool } = await import("../src/db.js");
    const attemptRows = await pool.query(
      `select count(*)::int as count from survey_attempts where survey_id = $1`,
      [survey.id]
    );
    expect(attemptRows.rows[0].count).toBe(1);

    const answerRows = await pool.query(
      `select count(*)::int as count
       from survey_response_answers
       join survey_attempts on survey_attempts.id = survey_response_answers.survey_attempt_id
       where survey_attempts.survey_id = $1`,
      [survey.id]
    );
    expect(answerRows.rows[0].count).toBe(2);

    const questionRows = await pool.query(
      `select count(*)::int as count from survey_questions where survey_id = $1`,
      [survey.id]
    );
    expect(questionRows.rows[0].count).toBe(3);
  });
});
