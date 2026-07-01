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
  createPublishedSkipSurvey,
  createTagDefinition,
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

async function seedReviewTagFixture(admin: TestSession) {
  let survey = await createDraftSurvey(app, admin, "Review tag survey");
  survey = await addQuestion(app, admin, survey.id, {
    questionText: "Tell us more"
  });
  survey = await setSurveyStatus(app, admin, survey.id, "published");

  const question = findQuestion(survey, "Tell us more");
  const user = await registerUser(app);
  const started = await startAttempt(app, user, survey.id);
  await submitAnswer(app, user, survey.id, {
    attemptId: started.attempt.id,
    questionId: question.id,
    answerText: "Needs follow-up with the regional team"
  });
  const tag = await createTagDefinition(app, admin, "review_theme", "follow_up");
  const detail = await request(app)
    .get(`/api/surveys/${survey.id}/attempts/${started.attempt.id}`)
    .set("Cookie", admin.cookie);
  const answer = detail.body.answers.find(
    (candidate: { questionText: string }) => candidate.questionText === question.questionText
  );

  if (!answer?.responseAnswerId) {
    throw new Error("Review tag fixture did not create a response answer");
  }

  return {
    answerId: answer.responseAnswerId as number,
    attemptId: started.attempt.id as number,
    question,
    survey,
    tag,
    user
  };
}

async function seedPaginatedAttemptsFixture(admin: TestSession, count = 28) {
  let survey = await createDraftSurvey(app, admin, "Paginated attempts survey");
  survey = await addQuestion(app, admin, survey.id, {
    questionText: "Any notes?",
    isRequired: false
  });
  survey = await setSurveyStatus(app, admin, survey.id, "published");
  const { pool } = await import("../src/db.js");
  const attemptIds: number[] = [];

  for (let index = 0; index < count; index += 1) {
    const userResult = await pool.query<{ id: number }>(
      `insert into users (first_name, last_name, email, password_hash)
       values ($1, $2, $3, $4)
       returning id`,
      ["Paged", `User ${index + 1}`, `paged.${survey.id}.${index + 1}@example.com`, "test-hash"]
    );
    const day = Math.min(index + 1, count);
    const startedAt =
      index >= count - 2
        ? "2026-01-28T12:00:00.000Z"
        : `2026-01-${String(day).padStart(2, "0")}T12:00:00.000Z`;
    const attemptResult = await pool.query<{ id: number }>(
      `insert into survey_attempts (
         survey_id,
         user_id,
         status,
         started_at,
         last_activity_at
       )
       values ($1, $2, 'in_progress', $3, $3)
       returning id`,
      [survey.id, userResult.rows[0].id, startedAt]
    );

    attemptIds.push(attemptResult.rows[0].id);
  }

  return { survey, attemptIds };
}

async function createTagGroup(
  admin: TestSession,
  name: string
): Promise<{ displayOrder: number; id: number; name: string }> {
  const response = await request(app)
    .post("/api/tags/groups")
    .set("Cookie", admin.cookie)
    .send({ name });

  if (response.status !== 201) {
    throw new Error(`Tag group create failed with ${response.status}: ${JSON.stringify(response.body)}`);
  }

  return response.body.group as { displayOrder: number; id: number; name: string };
}

async function createGroupedTagDefinition(
  admin: TestSession,
  input: { groupId: number; tagKey: string; tagValue: string }
): Promise<{ emoji: string | null; groupId: number; id: number; tagKey: string; tagValue: string }> {
  const response = await request(app)
    .post("/api/tags")
    .set("Cookie", admin.cookie)
    .send(input);

  if (response.status !== 201) {
    throw new Error(`Tag create failed with ${response.status}: ${JSON.stringify(response.body)}`);
  }

  return response.body.tag as {
    emoji: string | null;
    groupId: number;
    id: number;
    tagKey: string;
    tagValue: string;
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
      `/api/surveys/${survey.id}/attempts/1/answers/1/review-tags`,
      `/api/surveys/${survey.id}/attempts/1/answers/1/review-tags/category`,
      `/api/surveys/${survey.id}/attempts/1/answers/1/review-tags/category/1`,
      `/api/surveys/${survey.id}/attempts/1/answers/1/review-tags/1`,
      `/api/surveys/${survey.id}/export.csv`
    ];

    for (const path of paths) {
      const unauthenticated = path.includes("review-tags")
        ? path.endsWith("/1") && !path.endsWith("category")
          ? await request(app).delete(path)
          : await request(app).post(path).send({ tagDefinitionId: 1 })
        : await request(app).get(path);
      expect(unauthenticated.status).toBe(401);

      const forbidden = path.includes("review-tags")
        ? path.endsWith("/1") && !path.endsWith("category")
          ? await request(app).delete(path).set("Cookie", user.cookie)
          : await request(app).post(path).set("Cookie", user.cookie).send({ tagDefinitionId: 1 })
        : await request(app).get(path).set("Cookie", user.cookie);
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
    expect(response.body.pagination).toMatchObject({
      page: 1,
      pageSize: 25,
      totalCount: 3,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false
    });
  });

  it("defaults to page 1 and page size 25 with bounded pagination metadata", async () => {
    const admin = await registerAdmin(app);
    const fixture = await seedPaginatedAttemptsFixture(admin, 28);

    const response = await request(app)
      .get(`/api/surveys/${fixture.survey.id}/attempts`)
      .set("Cookie", admin.cookie);

    expect(response.status).toBe(200);
    expect(response.body.attempts).toHaveLength(25);
    expect(response.body.pagination).toEqual({
      page: 1,
      pageSize: 25,
      totalCount: 28,
      totalPages: 2,
      hasNextPage: true,
      hasPreviousPage: false
    });
  });

  it("returns custom pages newest first with deterministic id tie-breaking", async () => {
    const admin = await registerAdmin(app);
    const fixture = await seedPaginatedAttemptsFixture(admin, 28);

    const firstPage = await request(app)
      .get(`/api/surveys/${fixture.survey.id}/attempts?page=1&pageSize=2`)
      .set("Cookie", admin.cookie);

    expect(firstPage.status).toBe(200);
    expect(firstPage.body.attempts.map((attempt: { attemptId: number }) => attempt.attemptId)).toEqual([
      fixture.attemptIds[27],
      fixture.attemptIds[26]
    ]);
    expect(firstPage.body.pagination).toEqual({
      page: 1,
      pageSize: 2,
      totalCount: 28,
      totalPages: 14,
      hasNextPage: true,
      hasPreviousPage: false
    });

    const secondPage = await request(app)
      .get(`/api/surveys/${fixture.survey.id}/attempts?page=2&pageSize=2`)
      .set("Cookie", admin.cookie);

    expect(secondPage.status).toBe(200);
    expect(
      secondPage.body.attempts.map((attempt: { attemptId: number }) => attempt.attemptId)
    ).toEqual([fixture.attemptIds[25], fixture.attemptIds[24]]);
    expect(secondPage.body.pagination).toMatchObject({
      page: 2,
      pageSize: 2,
      totalCount: 28,
      totalPages: 14,
      hasNextPage: true,
      hasPreviousPage: true
    });
  });

  it("validates pagination query parameters", async () => {
    const admin = await registerAdmin(app);
    const fixture = await seedReportingFixture(admin);

    for (const query of ["page=0", "page=abc", "pageSize=0", "pageSize=abc"]) {
      const response = await request(app)
        .get(`/api/surveys/${fixture.survey.id}/attempts?${query}`)
        .set("Cookie", admin.cookie);

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/must be a positive integer/);
    }
  });

  it("applies date-range filtering to attempts pagination metadata", async () => {
    const admin = await registerAdmin(app);
    const fixture = await seedPaginatedAttemptsFixture(admin, 28);

    const response = await request(app)
      .get(`/api/surveys/${fixture.survey.id}/attempts?from=2026-01-10&to=2026-01-14&page=1&pageSize=2`)
      .set("Cookie", admin.cookie);

    expect(response.status).toBe(200);
    expect(response.body.attempts).toHaveLength(2);
    expect(response.body.pagination).toEqual({
      page: 1,
      pageSize: 2,
      totalCount: 5,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: false
    });
  });

  it("returns an empty bounded page when the requested page is beyond the filtered result set", async () => {
    const admin = await registerAdmin(app);
    const fixture = await seedPaginatedAttemptsFixture(admin, 28);

    const response = await request(app)
      .get(`/api/surveys/${fixture.survey.id}/attempts?page=99&pageSize=10`)
      .set("Cookie", admin.cookie);

    expect(response.status).toBe(200);
    expect(response.body.attempts).toEqual([]);
    expect(response.body.pagination).toEqual({
      page: 99,
      pageSize: 10,
      totalCount: 28,
      totalPages: 3,
      hasNextPage: false,
      hasPreviousPage: true
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

  it("prunes answers left behind by a changed branch off the final path", async () => {
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
      answerText: "middle answer that becomes off-path"
    });
    // ...then change the branching answer so the middle question becomes
    // unreachable on the final path. Its stored answer must be pruned rather
    // than kept as history (reverses the Phase 8 keep-history decision).
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

    expect(middle).toMatchObject({ state: "not_reached", onFinalPath: false });
    expect(middle.answerText).toBeNull();
  });

  it("marks rule-skipped questions as not reached and off the final path", async () => {
    const admin = await registerAdmin(app);
    const fixture = await createPublishedSkipSurvey(app, admin);
    const user = await registerUser(app);

    const started = await startAttempt(app, user, fixture.survey.id);
    await submitAnswer(app, user, fixture.survey.id, {
      attemptId: started.attempt.id,
      questionId: fixture.triggerQuestion.id,
      selectedAnswerOptionIds: [fixture.skipOptionId]
    });
    await submitAnswer(app, user, fixture.survey.id, {
      attemptId: started.attempt.id,
      questionId: fixture.finalQuestion.id,
      answerText: "done"
    });
    await completeAttempt(app, user, fixture.survey.id, started.attempt.id);

    const response = await request(app)
      .get(`/api/surveys/${fixture.survey.id}/attempts/${started.attempt.id}`)
      .set("Cookie", admin.cookie);

    expect(response.status).toBe(200);

    const answersByText = new Map(
      response.body.answers.map((answer: { questionText: string }) => [
        answer.questionText,
        answer
      ])
    );

    expect(answersByText.get("Hidden A")).toMatchObject({
      state: "not_reached",
      onFinalPath: false
    });
    expect(answersByText.get("Hidden B")).toMatchObject({
      state: "not_reached",
      onFinalPath: false
    });
    expect(answersByText.get("Final")).toMatchObject({ state: "answered", onFinalPath: true });
  });

  it("prunes answers hidden by a later trigger change off the final path", async () => {
    const admin = await registerAdmin(app);
    const fixture = await createPublishedSkipSurvey(app, admin);
    const user = await registerUser(app);

    const started = await startAttempt(app, user, fixture.survey.id);
    // Take the keep path and answer the first hidden-able question...
    await submitAnswer(app, user, fixture.survey.id, {
      attemptId: started.attempt.id,
      questionId: fixture.triggerQuestion.id,
      selectedAnswerOptionIds: [fixture.keepOptionId]
    });
    await submitAnswer(app, user, fixture.survey.id, {
      attemptId: started.attempt.id,
      questionId: fixture.hiddenQuestionA.id,
      answerText: "answer that becomes hidden"
    });
    // ...then flip the trigger so the question is skipped by rule. Pruning is
    // "all off-path", so a HIDE_QUESTION-hidden answer is removed too (not just
    // jump-abandoned branches).
    await submitAnswer(app, user, fixture.survey.id, {
      attemptId: started.attempt.id,
      questionId: fixture.triggerQuestion.id,
      selectedAnswerOptionIds: [fixture.skipOptionId]
    });

    const response = await request(app)
      .get(`/api/surveys/${fixture.survey.id}/attempts/${started.attempt.id}`)
      .set("Cookie", admin.cookie);

    const hiddenA = response.body.answers.find(
      (answer: { questionText: string }) => answer.questionText === "Hidden A"
    );

    expect(hiddenA).toMatchObject({ state: "not_reached", onFinalPath: false });
    expect(hiddenA.answerText).toBeNull();
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

  it("reflects option tag edits for already answered published surveys", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);

    let survey = await createDraftSurvey(app, admin, "Published option tag report survey");
    survey = await addQuestion(app, admin, survey.id, {
      questionText: "Outcome?",
      questionType: "single_select"
    });
    const questionId = findQuestion(survey, "Outcome?").id;
    survey = await addOption(app, admin, survey.id, questionId, "Escalate");
    const option = findQuestion(survey, "Outcome?").answerOptions[0];
    survey = await addTag(app, admin, survey.id, questionId, option.id, "action", "initial");
    const tag = findQuestion(survey, "Outcome?").answerOptions[0].answerTags?.[0];

    if (!tag) {
      throw new Error("Option tag fixture was not created");
    }

    survey = await setSurveyStatus(app, admin, survey.id, "published");

    const started = await startAttempt(app, user, survey.id);
    await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId,
      selectedAnswerOptionIds: [option.id]
    });
    await completeAttempt(app, user, survey.id, started.attempt.id);

    const update = await request(app)
      .put(`/api/surveys/${survey.id}/questions/${questionId}/options/${option.id}/tags/${tag.id}`)
      .set("Cookie", admin.cookie)
      .send({ tagKey: "action", tagValue: "updated" });

    expect(update.status).toBe(200);

    const report = await request(app)
      .get(`/api/surveys/${survey.id}/report`)
      .set("Cookie", admin.cookie);

    expect(report.body.report.tagStats).toEqual([
      { tagKey: "action", tagValue: "updated", selectionCount: 1, respondentCount: 1 }
    ]);

    const detail = await request(app)
      .get(`/api/surveys/${survey.id}/attempts/${started.attempt.id}`)
      .set("Cookie", admin.cookie);

    expect(detail.body.answers[0].selectedOptions[0].hiddenTags).toEqual([
      { tagKey: "action", tagValue: "updated" }
    ]);

    const csv = await request(app)
      .get(`/api/surveys/${survey.id}/export.csv`)
      .set("Cookie", admin.cookie);

    expect(csv.text).toContain("action=updated");
    expect(csv.text).not.toContain("action=initial");
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

describe("response answer review tags", () => {
  it("adds, returns, dedupes, removes, and cascades catalog review tags", async () => {
    const admin = await registerAdmin(app);
    const fixture = await seedReviewTagFixture(admin);

    const addResponse = await request(app)
      .post(
        `/api/surveys/${fixture.survey.id}/attempts/${fixture.attemptId}/answers/${fixture.answerId}/review-tags`
      )
      .set("Cookie", admin.cookie)
      .send({ tagDefinitionId: fixture.tag.id });

    expect(addResponse.status).toBe(201);
    expect(addResponse.body.reviewTags).toHaveLength(1);
    expect(addResponse.body.reviewTags[0]).toMatchObject({
      tagDefinitionId: fixture.tag.id,
      tagKey: "review_theme",
      tagValue: "follow_up",
      assignedByUserId: admin.user.id
    });

    const duplicate = await request(app)
      .post(
        `/api/surveys/${fixture.survey.id}/attempts/${fixture.attemptId}/answers/${fixture.answerId}/review-tags`
      )
      .set("Cookie", admin.cookie)
      .send({ tagDefinitionId: fixture.tag.id });

    expect(duplicate.status).toBe(201);
    expect(duplicate.body.reviewTags).toHaveLength(1);

    const detail = await request(app)
      .get(`/api/surveys/${fixture.survey.id}/attempts/${fixture.attemptId}`)
      .set("Cookie", admin.cookie);
    const taggedAnswer = detail.body.answers.find(
      (answer: { responseAnswerId: number | null }) => answer.responseAnswerId === fixture.answerId
    );
    expect(taggedAnswer.reviewTags).toMatchObject([
      { tagDefinitionId: fixture.tag.id, tagKey: "review_theme", tagValue: "follow_up" }
    ]);

    const csv = await request(app)
      .get(`/api/surveys/${fixture.survey.id}/export.csv`)
      .set("Cookie", admin.cookie);
    expect(csv.text).toContain("review_theme=follow_up");

    const remove = await request(app)
      .delete(
        `/api/surveys/${fixture.survey.id}/attempts/${fixture.attemptId}/answers/${fixture.answerId}/review-tags/${fixture.tag.id}`
      )
      .set("Cookie", admin.cookie);

    expect(remove.status).toBe(200);
    expect(remove.body.reviewTags).toEqual([]);

    await request(app)
      .post(
        `/api/surveys/${fixture.survey.id}/attempts/${fixture.attemptId}/answers/${fixture.answerId}/review-tags`
      )
      .set("Cookie", admin.cookie)
      .send({ tagDefinitionId: fixture.tag.id });

    const { pool } = await import("../src/db.js");
    await pool.query(`delete from tag_definitions where id = $1`, [fixture.tag.id]);

    const afterCascade = await request(app)
      .get(`/api/surveys/${fixture.survey.id}/attempts/${fixture.attemptId}`)
      .set("Cookie", admin.cookie);
    const answerAfterCascade = afterCascade.body.answers.find(
      (answer: { responseAnswerId: number | null }) => answer.responseAnswerId === fixture.answerId
    );
    expect(answerAfterCascade.reviewTags).toEqual([]);
  });

  it("applies category review tags through a virtual all selector without creating all tags", async () => {
    const admin = await registerAdmin(app);
    const fixture = await seedReviewTagFixture(admin);
    await completeAttempt(app, fixture.user, fixture.survey.id, fixture.attemptId);
    const group = await createTagGroup(admin, "Review category");
    const firstTag = await createGroupedTagDefinition(admin, {
      groupId: group.id,
      tagKey: "review_category",
      tagValue: "first"
    });
    const secondTag = await createGroupedTagDefinition(admin, {
      groupId: group.id,
      tagKey: "review_category",
      tagValue: "second"
    });
    const ungroupedTag = await createTagDefinition(app, admin, "ungrouped_review", "outside");

    const addCategory = await request(app)
      .post(
        `/api/surveys/${fixture.survey.id}/attempts/${fixture.attemptId}/answers/${fixture.answerId}/review-tags/category`
      )
      .set("Cookie", admin.cookie)
      .send({ groupId: group.id });

    expect(addCategory.status).toBe(201);
    expect(addCategory.body.reviewTagGroupIds).toEqual([group.id]);
    expect(addCategory.body.reviewTags).toHaveLength(2);
    expect(addCategory.body.reviewTags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tagDefinitionId: firstTag.id,
          tagKey: "review_category",
          tagValue: "first",
          isManual: false
        }),
        expect.objectContaining({
          tagDefinitionId: secondTag.id,
          tagKey: "review_category",
          tagValue: "second",
          isManual: false
        })
      ])
    );
    expect(
      addCategory.body.reviewTags.some(
        (tag: { tagDefinitionId: number; tagValue: string }) =>
          tag.tagDefinitionId === ungroupedTag.id || tag.tagValue === "<ALL>"
      )
    ).toBe(false);

    const duplicate = await request(app)
      .post(
        `/api/surveys/${fixture.survey.id}/attempts/${fixture.attemptId}/answers/${fixture.answerId}/review-tags/category`
      )
      .set("Cookie", admin.cookie)
      .send({ groupId: group.id });

    expect(duplicate.status).toBe(201);
    expect(duplicate.body.reviewTagGroupIds).toEqual([group.id]);
    expect(duplicate.body.reviewTags).toHaveLength(2);

    const laterTag = await createGroupedTagDefinition(admin, {
      groupId: group.id,
      tagKey: "review_category",
      tagValue: "later"
    });

    const movedTag = await createTagDefinition(app, admin, "review_category", "moved");
    const moveResponse = await request(app)
      .patch(`/api/tags/${movedTag.id}/group`)
      .set("Cookie", admin.cookie)
      .send({ groupId: group.id, displayOrder: 1 });
    expect(moveResponse.status).toBe(200);

    const manualMovedTag = await createTagDefinition(app, admin, "review_category", "manual-moved");
    const manualMoveInResponse = await request(app)
      .patch(`/api/tags/${manualMovedTag.id}/group`)
      .set("Cookie", admin.cookie)
      .send({ groupId: group.id, displayOrder: 1 });
    expect(manualMoveInResponse.status).toBe(200);
    const markManual = await request(app)
      .post(
        `/api/surveys/${fixture.survey.id}/attempts/${fixture.attemptId}/answers/${fixture.answerId}/review-tags`
      )
      .set("Cookie", admin.cookie)
      .send({ tagDefinitionId: manualMovedTag.id });
    expect(markManual.status).toBe(201);

    const editedIntoGroupTag = await createTagDefinition(app, admin, "review_category", "edited-in");
    const editResponse = await request(app)
      .put(`/api/tags/${editedIntoGroupTag.id}`)
      .set("Cookie", admin.cookie)
      .send({
        groupId: group.id,
        tagKey: editedIntoGroupTag.tagKey,
        tagValue: editedIntoGroupTag.tagValue
      });
    expect(editResponse.status).toBe(200);

    const moveOutResponse = await request(app)
      .patch(`/api/tags/${movedTag.id}/group`)
      .set("Cookie", admin.cookie)
      .send({ groupId: null, displayOrder: 1 });
    expect(moveOutResponse.status).toBe(200);
    const manualMoveOutResponse = await request(app)
      .patch(`/api/tags/${manualMovedTag.id}/group`)
      .set("Cookie", admin.cookie)
      .send({ groupId: null, displayOrder: 1 });
    expect(manualMoveOutResponse.status).toBe(200);

    const catalog = await request(app).get("/api/tags").set("Cookie", admin.cookie);
    expect(catalog.body.tags).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ tagValue: "<ALL>" })])
    );

    const detail = await request(app)
      .get(`/api/surveys/${fixture.survey.id}/attempts/${fixture.attemptId}`)
      .set("Cookie", admin.cookie);
    const taggedAnswer = detail.body.answers.find(
      (answer: { responseAnswerId: number | null }) => answer.responseAnswerId === fixture.answerId
    );
    const manualMovedReviewTag = taggedAnswer.reviewTags.find(
      (tag: { tagDefinitionId: number }) => tag.tagDefinitionId === manualMovedTag.id
    );
    expect(manualMovedReviewTag).toEqual(expect.objectContaining({ isManual: true }));
    expect(taggedAnswer.reviewTagGroupIds).toEqual([group.id]);
    expect(taggedAnswer.reviewTags.map((tag: { tagValue: string }) => tag.tagValue)).toEqual([
      "edited-in",
      "first",
      "later",
      "manual-moved",
      "second"
    ]);

    const csv = await request(app)
      .get(`/api/surveys/${fixture.survey.id}/export.csv`)
      .set("Cookie", admin.cookie);
    expect(csv.text).toContain("review_category=first");
    expect(csv.text).toContain("review_category=edited-in");
    expect(csv.text).toContain("review_category=later");
    expect(csv.text).not.toContain("review_category=moved");
    expect(csv.text).toContain("review_category=manual-moved");
    expect(csv.text).toContain("review_category=second");
    expect(csv.text).not.toContain("<ALL>");
  });

  it("stops category review tag auto-apply and removes only inherited tags", async () => {
    const admin = await registerAdmin(app);
    const fixture = await seedReviewTagFixture(admin);
    const group = await createTagGroup(admin, "Stop review category");
    const inheritedTag = await createGroupedTagDefinition(admin, {
      groupId: group.id,
      tagKey: "stop_category",
      tagValue: "inherited"
    });
    const manualTag = await createGroupedTagDefinition(admin, {
      groupId: group.id,
      tagKey: "stop_category",
      tagValue: "manual"
    });

    const addCategory = await request(app)
      .post(
        `/api/surveys/${fixture.survey.id}/attempts/${fixture.attemptId}/answers/${fixture.answerId}/review-tags/category`
      )
      .set("Cookie", admin.cookie)
      .send({ groupId: group.id });
    expect(addCategory.status).toBe(201);
    expect(addCategory.body.reviewTags).toHaveLength(2);

    const markManual = await request(app)
      .post(
        `/api/surveys/${fixture.survey.id}/attempts/${fixture.attemptId}/answers/${fixture.answerId}/review-tags`
      )
      .set("Cookie", admin.cookie)
      .send({ tagDefinitionId: manualTag.id });
    expect(markManual.status).toBe(201);

    const stop = await request(app)
      .delete(
        `/api/surveys/${fixture.survey.id}/attempts/${fixture.attemptId}/answers/${fixture.answerId}/review-tags/category/${group.id}`
      )
      .set("Cookie", admin.cookie);
    expect(stop.status).toBe(200);
    expect(stop.body.reviewTagGroupIds).toEqual([]);
    expect(stop.body.reviewTags).toEqual([
      expect.objectContaining({ tagDefinitionId: manualTag.id, tagValue: "manual", isManual: true })
    ]);
    expect(
      stop.body.reviewTags.some(
        (tag: { tagDefinitionId: number }) => tag.tagDefinitionId === inheritedTag.id
      )
    ).toBe(false);

    const futureTag = await createGroupedTagDefinition(admin, {
      groupId: group.id,
      tagKey: "stop_category",
      tagValue: "future"
    });
    const detail = await request(app)
      .get(`/api/surveys/${fixture.survey.id}/attempts/${fixture.attemptId}`)
      .set("Cookie", admin.cookie);
    const taggedAnswer = detail.body.answers.find(
      (answer: { responseAnswerId: number | null }) => answer.responseAnswerId === fixture.answerId
    );
    expect(
      taggedAnswer.reviewTags.some(
        (tag: { tagDefinitionId: number }) => tag.tagDefinitionId === futureTag.id
      )
    ).toBe(false);
  });

  it("deleting a category removes inherited-only review tags and preserves manual tags", async () => {
    const admin = await registerAdmin(app);
    const fixture = await seedReviewTagFixture(admin);
    const group = await createTagGroup(admin, "Deleted review category");
    const inheritedTag = await createGroupedTagDefinition(admin, {
      groupId: group.id,
      tagKey: "delete_category",
      tagValue: "inherited"
    });
    const manualTag = await createGroupedTagDefinition(admin, {
      groupId: group.id,
      tagKey: "delete_category",
      tagValue: "manual"
    });

    const addCategory = await request(app)
      .post(
        `/api/surveys/${fixture.survey.id}/attempts/${fixture.attemptId}/answers/${fixture.answerId}/review-tags/category`
      )
      .set("Cookie", admin.cookie)
      .send({ groupId: group.id });
    expect(addCategory.status).toBe(201);
    expect(addCategory.body.reviewTags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tagDefinitionId: inheritedTag.id, isManual: false }),
        expect.objectContaining({ tagDefinitionId: manualTag.id, isManual: false })
      ])
    );

    const markManual = await request(app)
      .post(
        `/api/surveys/${fixture.survey.id}/attempts/${fixture.attemptId}/answers/${fixture.answerId}/review-tags`
      )
      .set("Cookie", admin.cookie)
      .send({ tagDefinitionId: manualTag.id });
    expect(markManual.status).toBe(201);

    const deleteGroup = await request(app)
      .delete(`/api/tags/groups/${group.id}`)
      .set("Cookie", admin.cookie);
    expect(deleteGroup.status).toBe(200);

    const detail = await request(app)
      .get(`/api/surveys/${fixture.survey.id}/attempts/${fixture.attemptId}`)
      .set("Cookie", admin.cookie);
    const taggedAnswer = detail.body.answers.find(
      (answer: { responseAnswerId: number | null }) => answer.responseAnswerId === fixture.answerId
    );
    expect(taggedAnswer.reviewTagGroupIds).toEqual([]);
    expect(taggedAnswer.reviewTags).toEqual([
      expect.objectContaining({ tagDefinitionId: manualTag.id, tagValue: "manual", isManual: true })
    ]);
    expect(
      taggedAnswer.reviewTags.some(
        (tag: { tagDefinitionId: number }) => tag.tagDefinitionId === inheritedTag.id
      )
    ).toBe(false);
  });

  it("binds empty category review tags for future tags and 404s unknown groups", async () => {
    const admin = await registerAdmin(app);
    const fixture = await seedReviewTagFixture(admin);
    const emptyGroup = await createTagGroup(admin, "Empty review category");

    const empty = await request(app)
      .post(
        `/api/surveys/${fixture.survey.id}/attempts/${fixture.attemptId}/answers/${fixture.answerId}/review-tags/category`
      )
      .set("Cookie", admin.cookie)
      .send({ groupId: emptyGroup.id });
    expect(empty.status).toBe(201);
    expect(empty.body.reviewTagGroupIds).toEqual([emptyGroup.id]);
    expect(empty.body.reviewTags).toEqual([]);

    const futureTag = await createGroupedTagDefinition(admin, {
      groupId: emptyGroup.id,
      tagKey: "empty_category",
      tagValue: "future"
    });
    const detail = await request(app)
      .get(`/api/surveys/${fixture.survey.id}/attempts/${fixture.attemptId}`)
      .set("Cookie", admin.cookie);
    const taggedAnswer = detail.body.answers.find(
      (answer: { responseAnswerId: number | null }) => answer.responseAnswerId === fixture.answerId
    );
    expect(taggedAnswer.reviewTags).toEqual([
      expect.objectContaining({ tagDefinitionId: futureTag.id, tagValue: "future" })
    ]);

    const unknown = await request(app)
      .post(
        `/api/surveys/${fixture.survey.id}/attempts/${fixture.attemptId}/answers/${fixture.answerId}/review-tags/category`
      )
      .set("Cookie", admin.cookie)
      .send({ groupId: emptyGroup.id + 1_000_000 });
    expect(unknown.status).toBe(404);
    expect(unknown.body.error).toBe("Tag category not found");
  });

  it("rejects wrong ownership, unknown tags, and non-text answers", async () => {
    const admin = await registerAdmin(app);
    const fixture = await seedReviewTagFixture(admin);
    let otherSurvey = await createDraftSurvey(app, admin, "Other review survey");
    otherSurvey = await addQuestion(app, admin, otherSurvey.id, { questionText: "Other text" });
    const missingTagId = fixture.tag.id + 1_000_000;

    const wrongSurvey = await request(app)
      .post(
        `/api/surveys/${otherSurvey.id}/attempts/${fixture.attemptId}/answers/${fixture.answerId}/review-tags`
      )
      .set("Cookie", admin.cookie)
      .send({ tagDefinitionId: fixture.tag.id });
    expect(wrongSurvey.status).toBe(404);

    const unknownTag = await request(app)
      .post(
        `/api/surveys/${fixture.survey.id}/attempts/${fixture.attemptId}/answers/${fixture.answerId}/review-tags`
      )
      .set("Cookie", admin.cookie)
      .send({ tagDefinitionId: missingTagId });
    expect(unknownTag.status).toBe(404);

    let integerSurvey = await createDraftSurvey(app, admin, "Integer review survey");
    integerSurvey = await addQuestion(app, admin, integerSurvey.id, {
      questionText: "How many?",
      questionType: "integer"
    });
    integerSurvey = await setSurveyStatus(app, admin, integerSurvey.id, "published");
    const integerQuestion = findQuestion(integerSurvey, "How many?");
    const integerUser = await registerUser(app);
    const integerStarted = await startAttempt(app, integerUser, integerSurvey.id);
    await submitAnswer(app, integerUser, integerSurvey.id, {
      attemptId: integerStarted.attempt.id,
      questionId: integerQuestion.id,
      answerInteger: 7
    });
    const integerDetail = await request(app)
      .get(`/api/surveys/${integerSurvey.id}/attempts/${integerStarted.attempt.id}`)
      .set("Cookie", admin.cookie);
    const integerAnswer = integerDetail.body.answers.find(
      (answer: { questionText: string }) => answer.questionText === "How many?"
    );

    const nonText = await request(app)
      .post(
        `/api/surveys/${integerSurvey.id}/attempts/${integerStarted.attempt.id}/answers/${integerAnswer.responseAnswerId}/review-tags`
      )
      .set("Cookie", admin.cookie)
      .send({ tagDefinitionId: fixture.tag.id });
    expect(nonText.status).toBe(400);
    expect(nonText.body.error).toBe("Review tags can only be applied to answered text responses");

    const group = await createTagGroup(admin, "Non-text review category");
    const nonTextCategory = await request(app)
      .post(
        `/api/surveys/${integerSurvey.id}/attempts/${integerStarted.attempt.id}/answers/${integerAnswer.responseAnswerId}/review-tags/category`
      )
      .set("Cookie", admin.cookie)
      .send({ groupId: group.id });
    expect(nonTextCategory.status).toBe(400);
    expect(nonTextCategory.body.error).toBe(
      "Review tags can only be applied to answered text responses"
    );
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
      "participant_email_status",
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
      "other_text",
      "hidden_tags",
      "review_tags",
      "on_final_path"
    ]);

    // completer saved 2 responses, in-progress user saved 2 (one blank),
    // abandoned user saved none.
    expect(lines).toHaveLength(1 + 4);

    const completerRows = lines.filter((line) =>
      line.includes(fixture.completer.user.email)
    );
    expect(completerRows).toHaveLength(2);
    expect(completerRows[0]).toContain(",verified_account,");
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

describe("report option distribution and tag rollup", () => {
  it("counts selections per answer option", async () => {
    const admin = await registerAdmin(app);
    const fixture = await seedReportingFixture(admin);

    const response = await request(app)
      .get(`/api/surveys/${fixture.survey.id}/report`)
      .set("Cookie", admin.cookie);

    expect(response.status).toBe(200);

    const routeStat = response.body.report.questionStats.find(
      (stat: { questionText: string }) => stat.questionText === "Route"
    );
    const countsByOption = new Map(
      routeStat.optionStats.map((option: { optionText: string; selectionCount: number }) => [
        option.optionText,
        option.selectionCount
      ])
    );

    expect(countsByOption.get("Jump")).toBe(1);
    expect(countsByOption.get("Stay")).toBe(1);

    const textStat = response.body.report.questionStats.find(
      (stat: { questionText: string }) => stat.questionText === "Target"
    );

    expect(textStat.optionStats).toEqual([]);
  });

  it("excludes pruned off-path answers from aggregate counts", async () => {
    const admin = await registerAdmin(app);
    const fixture = await createPublishedJumpSurvey(app, admin);
    const user = await registerUser(app);

    // Branch to the Stay path and answer the middle question, then switch the
    // route to Jump (pruning the Stay-branch answer) and complete on Target.
    const started = await startAttempt(app, user, fixture.survey.id);
    await submitAnswer(app, user, fixture.survey.id, {
      attemptId: started.attempt.id,
      questionId: fixture.routeQuestion.id,
      selectedAnswerOptionIds: [fixture.stayOptionId]
    });
    await submitAnswer(app, user, fixture.survey.id, {
      attemptId: started.attempt.id,
      questionId: fixture.middleQuestion.id,
      answerText: "off-path answer"
    });
    await submitAnswer(app, user, fixture.survey.id, {
      attemptId: started.attempt.id,
      questionId: fixture.routeQuestion.id,
      selectedAnswerOptionIds: [fixture.jumpOptionId]
    });
    await submitAnswer(app, user, fixture.survey.id, {
      attemptId: started.attempt.id,
      questionId: fixture.targetQuestion.id,
      answerText: "target"
    });
    await completeAttempt(app, user, fixture.survey.id, started.attempt.id);

    const response = await request(app)
      .get(`/api/surveys/${fixture.survey.id}/report`)
      .set("Cookie", admin.cookie);

    expect(response.status).toBe(200);

    // The pruned Middle answer no longer inflates the answered count, and the
    // overwritten Route selection leaves no stale "Stay" tally.
    const middleStat = response.body.report.questionStats.find(
      (stat: { questionText: string }) => stat.questionText === "Middle"
    );

    expect(middleStat).toMatchObject({ answeredCount: 0, blankCount: 0 });

    const routeStat = response.body.report.questionStats.find(
      (stat: { questionText: string }) => stat.questionText === "Route"
    );
    const countsByOption = new Map(
      routeStat.optionStats.map((option: { optionText: string; selectionCount: number }) => [
        option.optionText,
        option.selectionCount
      ])
    );

    expect(countsByOption.get("Jump")).toBe(1);
    expect(countsByOption.get("Stay")).toBe(0);
  });

  it("rolls up hidden tag pairs with selection and respondent counts", async () => {
    const admin = await registerAdmin(app);
    let survey = await createDraftSurvey(app, admin, "Tag rollup survey");
    survey = await addQuestion(app, admin, survey.id, {
      questionText: "Pick",
      questionType: "single_select"
    });
    const pickId = findQuestion(survey, "Pick").id;
    survey = await addOption(app, admin, survey.id, pickId, "Secure");
    survey = await addOption(app, admin, survey.id, pickId, "Finance");

    const pick = findQuestion(survey, "Pick");
    const secureOption = pick.answerOptions.find((option) => option.optionText === "Secure");
    const financeOption = pick.answerOptions.find((option) => option.optionText === "Finance");

    if (!secureOption || !financeOption) {
      throw new Error("Options were not created");
    }

    survey = await addTag(app, admin, survey.id, pick.id, secureOption.id, "area", "security");
    survey = await addTag(app, admin, survey.id, pick.id, secureOption.id, "review_required", "true");
    survey = await addTag(app, admin, survey.id, pick.id, financeOption.id, "area", "finance");
    survey = await setSurveyStatus(app, admin, survey.id, "published");

    for (let participant = 0; participant < 2; participant += 1) {
      const user = await registerUser(app);
      const started = await startAttempt(app, user, survey.id);
      await submitAnswer(app, user, survey.id, {
        attemptId: started.attempt.id,
        questionId: pick.id,
        selectedAnswerOptionIds: [secureOption.id]
      });
      await completeAttempt(app, user, survey.id, started.attempt.id);
    }

    const response = await request(app)
      .get(`/api/surveys/${survey.id}/report`)
      .set("Cookie", admin.cookie);

    expect(response.status).toBe(200);
    expect(response.body.report.tagStats).toEqual([
      { tagKey: "area", tagValue: "finance", selectionCount: 0, respondentCount: 0 },
      { tagKey: "area", tagValue: "security", selectionCount: 2, respondentCount: 2 },
      { tagKey: "review_required", tagValue: "true", selectionCount: 2, respondentCount: 2 }
    ]);
  });
});

describe("report date-range filter", () => {
  it("filters counts, stats, attempts, and CSV rows by attempt start date", async () => {
    const admin = await registerAdmin(app);
    const fixture = await seedReportingFixture(admin);
    const { pool } = await import("../src/db.js");

    // Move the completed attempt into January 2026; the other two attempts
    // keep today's start date.
    await pool.query(`update survey_attempts set started_at = '2026-01-15T12:00:00Z' where id = $1`, [
      fixture.completerAttemptId
    ]);

    const january = "from=2026-01-01&to=2026-01-31";
    const reportResponse = await request(app)
      .get(`/api/surveys/${fixture.survey.id}/report?${january}`)
      .set("Cookie", admin.cookie);

    expect(reportResponse.status).toBe(200);
    expect(reportResponse.body.report.attemptCounts).toEqual({
      inProgress: 0,
      completed: 1,
      abandoned: 0,
      total: 1
    });

    const routeStat = reportResponse.body.report.questionStats.find(
      (stat: { questionText: string }) => stat.questionText === "Route"
    );

    // Only the January attempt's answer counts; its "Jump" selection is the
    // only one inside the range.
    expect(routeStat.answeredCount).toBe(1);
    expect(
      routeStat.optionStats.find(
        (option: { optionText: string }) => option.optionText === "Stay"
      ).selectionCount
    ).toBe(0);

    const attemptsResponse = await request(app)
      .get(`/api/surveys/${fixture.survey.id}/attempts?${january}`)
      .set("Cookie", admin.cookie);

    expect(attemptsResponse.status).toBe(200);
    expect(attemptsResponse.body.attempts).toHaveLength(1);
    expect(attemptsResponse.body.attempts[0].attemptId).toBe(fixture.completerAttemptId);

    const csvResponse = await request(app)
      .get(`/api/surveys/${fixture.survey.id}/export.csv?${january}`)
      .set("Cookie", admin.cookie);

    expect(csvResponse.status).toBe(200);

    const csvLines = csvResponse.text.trimEnd().split("\r\n");
    const attemptIdColumn = csvLines.slice(1).map((line) => line.split(",")[2]);

    expect(new Set(attemptIdColumn)).toEqual(new Set([String(fixture.completerAttemptId)]));

    const emptyRange = await request(app)
      .get(`/api/surveys/${fixture.survey.id}/report?from=2020-01-01&to=2020-12-31`)
      .set("Cookie", admin.cookie);

    expect(emptyRange.body.report.attemptCounts.total).toBe(0);
  });

  it("rejects malformed or inverted ranges", async () => {
    const admin = await registerAdmin(app);
    const fixture = await seedReportingFixture(admin);

    const malformed = await request(app)
      .get(`/api/surveys/${fixture.survey.id}/report?from=banana`)
      .set("Cookie", admin.cookie);

    expect(malformed.status).toBe(400);
    expect(malformed.body.error).toBe("from must be a date in YYYY-MM-DD format");

    const inverted = await request(app)
      .get(`/api/surveys/${fixture.survey.id}/attempts?from=2026-02-01&to=2026-01-01`)
      .set("Cookie", admin.cookie);

    expect(inverted.status).toBe(400);
    expect(inverted.body.error).toBe("from must be on or before to");

    const invalidDay = await request(app)
      .get(`/api/surveys/${fixture.survey.id}/export.csv?to=2026-02-30`)
      .set("Cookie", admin.cookie);

    expect(invalidDay.status).toBe(400);
    expect(invalidDay.body.error).toBe("to must be a valid calendar date");
  });
});
