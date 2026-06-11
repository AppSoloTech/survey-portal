import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import {
  addOption,
  addQuestion,
  addTag,
  collectObjectKeys,
  completeAttempt,
  createDraftSurvey,
  createPublishedJumpSurvey,
  deleteSurvey,
  duplicateSurvey,
  findQuestion,
  registerAdmin,
  registerUser,
  setSurveyStatus,
  startAttempt,
  submitAnswer
} from "./helpers/factories.js";

const app = createApp();

describe("survey duplicate", () => {
  it("rejects non-admin duplicate requests", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const { survey } = await createPublishedJumpSurvey(app, admin);

    const response = await request(app)
      .post(`/api/surveys/${survey.id}/duplicate`)
      .set("Cookie", user.cookie)
      .send({});

    expect(response.status).toBe(403);
  });

  it("clones a published survey into an independent draft with remapped rules", async () => {
    const admin = await registerAdmin(app);
    const { survey } = await createPublishedJumpSurvey(app, admin);

    const clone = await duplicateSurvey(app, admin, survey.id);

    expect(clone.id).not.toBe(survey.id);
    expect(clone.title).toBe(`${survey.title} (copy)`);
    expect(clone.status).toBe("draft");
    expect(clone.publishedAt).toBeNull();
    expect(clone.deletedAt).toBeNull();

    expect(clone.questions).toHaveLength(survey.questions.length);
    expect(clone.conditionalLogicRules).toHaveLength(survey.conditionalLogicRules.length);

    const cloneQuestionIds = new Set(clone.questions.map((question) => question.id));
    const cloneOptionIds = new Set(
      clone.questions.flatMap((question) => question.answerOptions.map((option) => option.id))
    );
    const originalQuestionIds = new Set(survey.questions.map((question) => question.id));

    for (const question of clone.questions) {
      expect(question.surveyId).toBe(clone.id);
      expect(originalQuestionIds.has(question.id)).toBe(false);
    }

    // Every rule reference must resolve inside the clone: a missed remap
    // would silently corrupt skip logic.
    for (const rule of clone.conditionalLogicRules) {
      expect(rule.surveyId).toBe(clone.id);
      expect(cloneQuestionIds.has(rule.sourceQuestionId)).toBe(true);
      expect(cloneOptionIds.has(rule.sourceAnswerOptionId)).toBe(true);

      if (rule.targetQuestionId !== null) {
        expect(cloneQuestionIds.has(rule.targetQuestionId)).toBe(true);
      }
    }

    // The original survey is untouched.
    const originalResponse = await request(app)
      .get(`/api/surveys/${survey.id}`)
      .set("Cookie", admin.cookie);
    expect(originalResponse.status).toBe(200);
    expect(originalResponse.body.survey.status).toBe("published");
    expect(originalResponse.body.survey.questions).toHaveLength(survey.questions.length);
  });

  it("copies hidden tags onto the cloned options without exposing them to participants", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);

    let survey = await createDraftSurvey(app, admin, "Tagged source");
    survey = await addQuestion(app, admin, survey.id, {
      questionText: "Pick one",
      questionType: "single_select"
    });
    const questionId = findQuestion(survey, "Pick one").id;
    survey = await addOption(app, admin, survey.id, questionId, "Yes");
    const optionId = findQuestion(survey, "Pick one").answerOptions[0].id;
    survey = await addTag(app, admin, survey.id, questionId, optionId, "severity", "high");
    survey = await setSurveyStatus(app, admin, survey.id, "published");

    const clone = await duplicateSurvey(app, admin, survey.id);
    const cloneOption = clone.questions[0].answerOptions[0];

    expect(cloneOption.answerTags).toEqual([
      expect.objectContaining({ tagKey: "severity", tagValue: "high" })
    ]);
    expect(cloneOption.answerTags?.[0].answerOptionId).toBe(cloneOption.id);

    const participantList = await request(app).get("/api/surveys").set("Cookie", user.cookie);
    const keys = collectObjectKeys(participantList.body);
    expect(keys.has("tagKey")).toBe(false);
    expect(keys.has("tagValue")).toBe(false);
    expect(keys.has("answerTags")).toBe(false);
  });

  it("treats the clone as a new survey for the attempt policy", async () => {
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

    // Completed original blocks a restart, but the published clone is an
    // independent survey and accepts a fresh attempt.
    await startAttempt(app, user, survey.id, 409);

    const clone = await duplicateSurvey(app, admin, survey.id);
    await setSurveyStatus(app, admin, clone.id, "published");
    const cloneStart = await startAttempt(app, user, clone.id);
    expect(cloneStart.attempt.status).toBe("in_progress");
  });

  it("rejects duplicating a deleted survey", async () => {
    const admin = await registerAdmin(app);
    const { survey } = await createPublishedJumpSurvey(app, admin);

    await deleteSurvey(app, admin, survey.id);

    const response = await request(app)
      .post(`/api/surveys/${survey.id}/duplicate`)
      .set("Cookie", admin.cookie)
      .send({});

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: "Survey has been deleted" });
  });
});
