import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import {
  addQuestion,
  addValueTag,
  collectObjectKeys,
  completeAttempt,
  createDraftSurvey,
  duplicateSurvey,
  findQuestion,
  registerAdmin,
  registerUser,
  setSurveyStatus,
  startAttempt,
  submitAnswer,
  type TestSession
} from "./helpers/factories.js";

const app = createApp();

// Draft survey with one integer and one text question, value tags on both:
//   findings >= 5            -> severity=high
//   findings 0..0            -> severity=none
//   blocker (any non-blank)  -> blocker=reported
async function seedValueTagSurvey(admin: TestSession) {
  let survey = await createDraftSurvey(app, admin, "Value tag survey");
  survey = await addQuestion(app, admin, survey.id, {
    questionText: "Findings",
    questionType: "integer"
  });
  survey = await addQuestion(app, admin, survey.id, {
    questionText: "Blocker",
    questionType: "text",
    isRequired: false
  });

  const findings = findQuestion(survey, "Findings");
  const blocker = findQuestion(survey, "Blocker");

  survey = await addValueTag(app, admin, survey.id, findings.id, {
    tagKey: "severity",
    tagValue: "high",
    integerMin: 5
  });
  survey = await addValueTag(app, admin, survey.id, findings.id, {
    tagKey: "severity",
    tagValue: "none",
    integerMin: 0,
    integerMax: 0
  });
  survey = await addValueTag(app, admin, survey.id, blocker.id, {
    tagKey: "blocker",
    tagValue: "reported"
  });

  return { survey, findings, blocker };
}

describe("question value tag CRUD", () => {
  it("creates and deletes value tags on integer and text questions", async () => {
    const admin = await registerAdmin(app);
    const { survey, findings } = await seedValueTagSurvey(admin);

    const findingsTags = findQuestion(survey, "Findings").valueTags ?? [];

    expect(findingsTags).toHaveLength(2);
    expect(findingsTags[0]).toMatchObject({
      tagKey: "severity",
      integerMin: 5,
      integerMax: null
    });
    expect(findQuestion(survey, "Blocker").valueTags).toHaveLength(1);

    const deleteResponse = await request(app)
      .delete(
        `/api/surveys/${survey.id}/questions/${findings.id}/value-tags/${findingsTags[0].id}`
      )
      .set("Cookie", admin.cookie);

    expect(deleteResponse.status).toBe(200);
    expect(findQuestion(deleteResponse.body.survey, "Findings").valueTags).toHaveLength(1);
  });

  it("registers value tag pairs in the tag catalog", async () => {
    const admin = await registerAdmin(app);
    await seedValueTagSurvey(admin);

    const catalog = await request(app).get("/api/tags").set("Cookie", admin.cookie);

    expect(catalog.status).toBe(200);
    expect(catalog.body.tags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tagKey: "severity", tagValue: "high" }),
        expect.objectContaining({ tagKey: "blocker", tagValue: "reported" })
      ])
    );
  });

  it("rejects value tags on selection questions and bad bounds", async () => {
    const admin = await registerAdmin(app);
    let survey = await createDraftSurvey(app, admin);
    survey = await addQuestion(app, admin, survey.id, {
      questionText: "Choice",
      questionType: "single_select"
    });
    survey = await addQuestion(app, admin, survey.id, { questionText: "Comment" });
    survey = await addQuestion(app, admin, survey.id, {
      questionText: "Count",
      questionType: "integer"
    });

    const onSelect = await request(app)
      .post(`/api/surveys/${survey.id}/questions/${findQuestion(survey, "Choice").id}/value-tags`)
      .set("Cookie", admin.cookie)
      .send({ tagKey: "a", tagValue: "b" });

    expect(onSelect.status).toBe(400);
    expect(onSelect.body.error).toMatch(/only supported on text and integer/);

    const textWithBounds = await request(app)
      .post(`/api/surveys/${survey.id}/questions/${findQuestion(survey, "Comment").id}/value-tags`)
      .set("Cookie", admin.cookie)
      .send({ tagKey: "a", tagValue: "b", integerMin: 1 });

    expect(textWithBounds.status).toBe(400);
    expect(textWithBounds.body.error).toBe("Text questions do not support integer bounds");

    const invertedBounds = await request(app)
      .post(`/api/surveys/${survey.id}/questions/${findQuestion(survey, "Count").id}/value-tags`)
      .set("Cookie", admin.cookie)
      .send({ tagKey: "a", tagValue: "b", integerMin: 5, integerMax: 1 });

    expect(invertedBounds.status).toBe(400);
    expect(invertedBounds.body.error).toBe("integerMin must be less than or equal to integerMax");
  });

  it("locks value tags after publishing", async () => {
    const admin = await registerAdmin(app);
    const { survey, findings } = await seedValueTagSurvey(admin);
    await setSurveyStatus(app, admin, survey.id, "published");

    const response = await request(app)
      .post(`/api/surveys/${survey.id}/questions/${findings.id}/value-tags`)
      .set("Cookie", admin.cookie)
      .send({ tagKey: "late", tagValue: "tag" });

    expect(response.status).toBe(409);
  });

  it("copies value tags when duplicating a survey", async () => {
    const admin = await registerAdmin(app);
    const { survey } = await seedValueTagSurvey(admin);

    const copy = await duplicateSurvey(app, admin, survey.id);
    const copiedFindings = findQuestion(copy, "Findings");

    expect(copiedFindings.id).not.toBe(findQuestion(survey, "Findings").id);
    expect(copiedFindings.valueTags).toHaveLength(2);
    expect(copiedFindings.valueTags?.[0]).toMatchObject({
      questionId: copiedFindings.id,
      tagKey: "severity"
    });
  });
});

describe("value tag participant isolation", () => {
  it("never exposes value tags to participants", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const { survey, findings } = await seedValueTagSurvey(admin);
    await setSurveyStatus(app, admin, survey.id, "published");

    const started = await startAttempt(app, user, survey.id);
    const answered = await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: findings.id,
      answerInteger: 7
    });

    for (const payload of [started, answered]) {
      const keys = collectObjectKeys(payload);

      expect(keys.has("tagKey")).toBe(false);
      expect(keys.has("tagValue")).toBe(false);
      expect(keys.has("valueTags")).toBe(false);
    }

    const mySurveys = await request(app).get("/api/my-surveys").set("Cookie", user.cookie);
    const myKeys = collectObjectKeys(mySurveys.body);

    expect(myKeys.has("valueTags")).toBe(false);
    expect(myKeys.has("tagKey")).toBe(false);
  });
});

describe("value tags in reporting", () => {
  it("rolls value tags into tagStats, attempt detail, and CSV", async () => {
    const admin = await registerAdmin(app);
    const { survey, findings, blocker } = await seedValueTagSurvey(admin);
    await setSurveyStatus(app, admin, survey.id, "published");

    // Participant A: 7 findings (severity=high) and a blocker note.
    const userA = await registerUser(app);
    const startedA = await startAttempt(app, userA, survey.id);
    await submitAnswer(app, userA, survey.id, {
      attemptId: startedA.attempt.id,
      questionId: findings.id,
      answerInteger: 7
    });
    await submitAnswer(app, userA, survey.id, {
      attemptId: startedA.attempt.id,
      questionId: blocker.id,
      answerText: "Waiting on budget"
    });
    await completeAttempt(app, userA, survey.id, startedA.attempt.id);

    // Participant B: 0 findings (severity=none), blank blocker.
    const userB = await registerUser(app);
    const startedB = await startAttempt(app, userB, survey.id);
    await submitAnswer(app, userB, survey.id, {
      attemptId: startedB.attempt.id,
      questionId: findings.id,
      answerInteger: 0
    });
    await submitAnswer(app, userB, survey.id, {
      attemptId: startedB.attempt.id,
      questionId: blocker.id,
      answerText: null
    });
    await completeAttempt(app, userB, survey.id, startedB.attempt.id);

    const report = await request(app)
      .get(`/api/surveys/${survey.id}/report`)
      .set("Cookie", admin.cookie);

    expect(report.status).toBe(200);
    expect(report.body.report.tagStats).toEqual([
      { tagKey: "blocker", tagValue: "reported", selectionCount: 1, respondentCount: 1 },
      { tagKey: "severity", tagValue: "high", selectionCount: 1, respondentCount: 1 },
      { tagKey: "severity", tagValue: "none", selectionCount: 1, respondentCount: 1 }
    ]);

    const detail = await request(app)
      .get(`/api/surveys/${survey.id}/attempts/${startedA.attempt.id}`)
      .set("Cookie", admin.cookie);

    const detailAnswers = new Map(
      detail.body.answers.map((answer: { questionText: string }) => [
        answer.questionText,
        answer
      ])
    );

    expect(detailAnswers.get("Findings")).toMatchObject({
      valueTags: [{ tagKey: "severity", tagValue: "high" }]
    });
    expect(detailAnswers.get("Blocker")).toMatchObject({
      valueTags: [{ tagKey: "blocker", tagValue: "reported" }]
    });

    const csv = await request(app)
      .get(`/api/surveys/${survey.id}/export.csv`)
      .set("Cookie", admin.cookie);

    expect(csv.status).toBe(200);
    expect(csv.text).toContain("severity=high");
    expect(csv.text).toContain("blocker=reported");
  });
});
