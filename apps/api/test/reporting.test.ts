import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import {
  addOption,
  addQuestion,
  addTag,
  completeAttempt,
  createDraftSurvey,
  createPublishedJumpSurvey,
  findQuestion,
  registerAdmin,
  registerUser,
  setSurveyStatus,
  startAttempt,
  submitAnswer,
  type TestSession
} from "./helpers/factories.js";

const app = createApp();

// Shared fixture: a jump survey with three participants —
//   completer: answered "Jump" (Q2 skipped), answered target, completed
//   inProgressUser: answered "Stay", blank-skipped the optional middle question
//   abandonedUser: started, then the attempt was marked abandoned
async function seedReportingFixture(admin: TestSession) {
  const fixture = await createPublishedJumpSurvey(app, admin);
  const completer = await registerUser(app);
  const inProgressUser = await registerUser(app);
  const abandonedUser = await registerUser(app);

  const completerStart = await startAttempt(app, completer, fixture.survey.id);
  await submitAnswer(app, completer, fixture.survey.id, {
    attemptId: completerStart.attempt.id,
    questionId: fixture.routeQuestion.id,
    selectedAnswerOptionIds: [fixture.jumpOptionId]
  });
  await submitAnswer(app, completer, fixture.survey.id, {
    attemptId: completerStart.attempt.id,
    questionId: fixture.targetQuestion.id,
    answerText: "target, with a \"quoted\" answer"
  });
  await completeAttempt(app, completer, fixture.survey.id, completerStart.attempt.id);

  const inProgressStart = await startAttempt(app, inProgressUser, fixture.survey.id);
  await submitAnswer(app, inProgressUser, fixture.survey.id, {
    attemptId: inProgressStart.attempt.id,
    questionId: fixture.routeQuestion.id,
    selectedAnswerOptionIds: [fixture.stayOptionId]
  });
  await submitAnswer(app, inProgressUser, fixture.survey.id, {
    attemptId: inProgressStart.attempt.id,
    questionId: fixture.middleQuestion.id,
    answerText: null
  });

  const abandonedStart = await startAttempt(app, abandonedUser, fixture.survey.id);
  const { pool } = await import("../src/db.js");
  await pool.query(`update survey_attempts set status = 'abandoned' where id = $1`, [
    abandonedStart.attempt.id
  ]);

  return {
    ...fixture,
    completer,
    completerAttemptId: completerStart.attempt.id,
    inProgressUser,
    inProgressAttemptId: inProgressStart.attempt.id,
    abandonedUser,
    abandonedAttemptId: abandonedStart.attempt.id
  };
}

describe("reporting authorization", () => {
  it("requires admin role on every reporting endpoint", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const { survey } = await createPublishedJumpSurvey(app, admin);

    const paths = [
      `/api/surveys/${survey.id}/report`,
      `/api/surveys/${survey.id}/attempts`,
      `/api/surveys/${survey.id}/attempts/1`,
      `/api/surveys/${survey.id}/export.csv`
    ];

    for (const path of paths) {
      const unauthenticated = await request(app).get(path);
      expect(unauthenticated.status).toBe(401);

      const forbidden = await request(app).get(path).set("Cookie", user.cookie);
      expect(forbidden.status).toBe(403);
    }
  });

  it("returns 404 for unknown surveys", async () => {
    const admin = await registerAdmin(app);

    for (const path of [
      "/api/surveys/999/report",
      "/api/surveys/999/attempts",
      "/api/surveys/999/attempts/1",
      "/api/surveys/999/export.csv"
    ]) {
      const response = await request(app).get(path).set("Cookie", admin.cookie);
      expect(response.status).toBe(404);
    }
  });
});

describe("GET /api/surveys/:id/report", () => {
  it("aggregates attempt counts, completion rate, and question stats", async () => {
    const admin = await registerAdmin(app);
    const fixture = await seedReportingFixture(admin);

    const response = await request(app)
      .get(`/api/surveys/${fixture.survey.id}/report`)
      .set("Cookie", admin.cookie);

    expect(response.status).toBe(200);

    const report = response.body.report;
    expect(report.attemptCounts).toEqual({
      inProgress: 1,
      completed: 1,
      abandoned: 1,
      total: 3
    });
    expect(report.completionRate).toBeCloseTo(1 / 3);

    const statsByText = new Map(
      report.questionStats.map((stat: { questionText: string }) => [stat.questionText, stat])
    );

    // Route was answered by both active participants; the abandoned attempt
    // never answered anything.
    expect(statsByText.get("Route")).toMatchObject({ answeredCount: 2, blankCount: 0 });
    // Middle was blank-skipped once.
    expect(statsByText.get("Middle")).toMatchObject({ answeredCount: 0, blankCount: 1 });
    // Target was answered once via the jump path.
    expect(statsByText.get("Target")).toMatchObject({ answeredCount: 1, blankCount: 0 });
  });

  it("reports zero counts for surveys without attempts", async () => {
    const admin = await registerAdmin(app);
    let survey = await createDraftSurvey(app, admin, "Quiet survey");
    survey = await addQuestion(app, admin, survey.id, { questionText: "Anything?" });

    const response = await request(app)
      .get(`/api/surveys/${survey.id}/report`)
      .set("Cookie", admin.cookie);

    expect(response.status).toBe(200);
    expect(response.body.report.attemptCounts.total).toBe(0);
    expect(response.body.report.completionRate).toBe(0);
  });
});

describe("GET /api/surveys/:id/attempts", () => {
  it("lists attempts with participant identity, status, and answered counts", async () => {
    const admin = await registerAdmin(app);
    const fixture = await seedReportingFixture(admin);

    const response = await request(app)
      .get(`/api/surveys/${fixture.survey.id}/attempts`)
      .set("Cookie", admin.cookie);

    expect(response.status).toBe(200);
    expect(response.body.attempts).toHaveLength(3);

    const byAttemptId = new Map(
      response.body.attempts.map((attempt: { attemptId: number }) => [attempt.attemptId, attempt])
    );

    expect(byAttemptId.get(fixture.completerAttemptId)).toMatchObject({
      status: "completed",
      answeredCount: 2,
      participant: { email: fixture.completer.user.email }
    });
    expect(byAttemptId.get(fixture.inProgressAttemptId)).toMatchObject({
      status: "in_progress",
      answeredCount: 1
    });
    expect(byAttemptId.get(fixture.abandonedAttemptId)).toMatchObject({
      status: "abandoned",
      answeredCount: 0
    });
  });
});

describe("GET /api/surveys/:id/attempts/:attemptId", () => {
  it("returns answers in survey order with jump-skipped questions marked", async () => {
    const admin = await registerAdmin(app);
    const fixture = await seedReportingFixture(admin);

    const response = await request(app)
      .get(`/api/surveys/${fixture.survey.id}/attempts/${fixture.completerAttemptId}`)
      .set("Cookie", admin.cookie);

    expect(response.status).toBe(200);
    expect(response.body.participant.email).toBe(fixture.completer.user.email);

    const answers = response.body.answers;
    expect(answers.map((answer: { questionText: string }) => answer.questionText)).toEqual([
      "Route",
      "Middle",
      "Target"
    ]);

    const [route, middle, target] = answers;
    expect(route).toMatchObject({ state: "answered", onFinalPath: true });
    expect(route.selectedOptions[0].optionText).toBe("Jump");
    // Middle was jumped over: no response row and off the final path.
    expect(middle).toMatchObject({ state: "not_reached", onFinalPath: false });
    expect(target).toMatchObject({ state: "answered", onFinalPath: true });
    expect(target.answerText).toContain("quoted");
  });

  it("marks blank optional responses as skipped_blank", async () => {
    const admin = await registerAdmin(app);
    const fixture = await seedReportingFixture(admin);

    const response = await request(app)
      .get(`/api/surveys/${fixture.survey.id}/attempts/${fixture.inProgressAttemptId}`)
      .set("Cookie", admin.cookie);

    expect(response.status).toBe(200);

    const middle = response.body.answers.find(
      (answer: { questionText: string }) => answer.questionText === "Middle"
    );

    expect(middle).toMatchObject({ state: "skipped_blank", onFinalPath: true });
  });

  it("marks answers left behind by a changed branch as off the final path", async () => {
    const admin = await registerAdmin(app);
    const fixture = await createPublishedJumpSurvey(app, admin);
    const user = await registerUser(app);

    const started = await startAttempt(app, user, fixture.survey.id);
    // First take the normal path and answer the middle question...
    await submitAnswer(app, user, fixture.survey.id, {
      attemptId: started.attempt.id,
      questionId: fixture.routeQuestion.id,
      selectedAnswerOptionIds: [fixture.stayOptionId]
    });
    await submitAnswer(app, user, fixture.survey.id, {
      attemptId: started.attempt.id,
      questionId: fixture.middleQuestion.id,
      answerText: "middle answer kept as history"
    });
    // ...then change the branching answer so the middle question becomes
    // unreachable on the final path.
    await submitAnswer(app, user, fixture.survey.id, {
      attemptId: started.attempt.id,
      questionId: fixture.routeQuestion.id,
      selectedAnswerOptionIds: [fixture.jumpOptionId]
    });

    const response = await request(app)
      .get(`/api/surveys/${fixture.survey.id}/attempts/${started.attempt.id}`)
      .set("Cookie", admin.cookie);

    const middle = response.body.answers.find(
      (answer: { questionText: string }) => answer.questionText === "Middle"
    );

    expect(middle).toMatchObject({ state: "answered", onFinalPath: false });
    expect(middle.answerText).toBe("middle answer kept as history");
  });

  it("includes hidden tags on selected options for admins", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);

    let survey = await createDraftSurvey(app, admin, "Tagged report survey");
    survey = await addQuestion(app, admin, survey.id, {
      questionText: "Compliant?",
      questionType: "single_select"
    });
    const questionId = findQuestion(survey, "Compliant?").id;
    survey = await addOption(app, admin, survey.id, questionId, "No");
    const noOption = findQuestion(survey, "Compliant?").answerOptions[0];
    survey = await addTag(app, admin, survey.id, questionId, noOption.id, "compliance_result", "violation");
    survey = await setSurveyStatus(app, admin, survey.id, "published");

    const started = await startAttempt(app, user, survey.id);
    await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId,
      selectedAnswerOptionIds: [noOption.id]
    });

    const response = await request(app)
      .get(`/api/surveys/${survey.id}/attempts/${started.attempt.id}`)
      .set("Cookie", admin.cookie);

    expect(response.status).toBe(200);
    expect(response.body.answers[0].selectedOptions[0].hiddenTags).toEqual([
      { tagKey: "compliance_result", tagValue: "violation" }
    ]);
  });

  it("returns 404 when the attempt belongs to a different survey", async () => {
    const admin = await registerAdmin(app);
    const fixture = await seedReportingFixture(admin);
    let otherSurvey = await createDraftSurvey(app, admin, "Other survey");
    otherSurvey = await addQuestion(app, admin, otherSurvey.id, { questionText: "Q" });

    const response = await request(app)
      .get(`/api/surveys/${otherSurvey.id}/attempts/${fixture.completerAttemptId}`)
      .set("Cookie", admin.cookie);

    expect(response.status).toBe(404);
  });
});

describe("GET /api/surveys/:id/export.csv", () => {
  it("exports one row per saved response with quoting and hidden tags", async () => {
    const admin = await registerAdmin(app);
    const fixture = await seedReportingFixture(admin);

    const response = await request(app)
      .get(`/api/surveys/${fixture.survey.id}/export.csv`)
      .set("Cookie", admin.cookie);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.headers["content-disposition"]).toBe(
      `attachment; filename="survey-${fixture.survey.id}-responses.csv"`
    );

    const lines = response.text.trimEnd().split("\r\n");
    const header = lines[0].split(",");

    expect(header).toEqual([
      "survey_id",
      "survey_title",
      "attempt_id",
      "participant_email",
      "participant_name",
      "attempt_status",
      "started_at",
      "completed_at",
      "question_order",
      "question_text",
      "question_type",
      "answer_state",
      "answer_text",
      "answer_integer",
      "selected_options",
      "hidden_tags",
      "on_final_path"
    ]);

    // completer saved 2 responses, in-progress user saved 2 (one blank),
    // abandoned user saved none.
    expect(lines).toHaveLength(1 + 4);

    const completerRows = lines.filter((line) =>
      line.includes(fixture.completer.user.email)
    );
    expect(completerRows).toHaveLength(2);
    expect(completerRows[1]).toContain('"target, with a ""quoted"" answer"');

    const blankRow = lines.find((line) => line.includes("skipped_blank"));
    expect(blankRow).toContain(fixture.inProgressUser.user.email);
  });

  it("exports only the header for surveys without responses", async () => {
    const admin = await registerAdmin(app);
    let survey = await createDraftSurvey(app, admin, "Empty export");
    survey = await addQuestion(app, admin, survey.id, { questionText: "Q" });

    const response = await request(app)
      .get(`/api/surveys/${survey.id}/export.csv`)
      .set("Cookie", admin.cookie);

    expect(response.status).toBe(200);
    expect(response.text.trimEnd().split("\r\n")).toHaveLength(1);
  });
});
