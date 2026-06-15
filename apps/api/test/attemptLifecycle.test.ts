import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import {
  addQuestion,
  addRule,
  completeAttempt,
  createDraftSurvey,
  createPublishedJumpSurvey,
  createPublishedSkipSurvey,
  findQuestion,
  registerAdmin,
  registerUser,
  setSurveyStatus,
  startAttempt,
  submitAnswer
} from "./helpers/factories.js";

const app = createApp();

describe("attempt start", () => {
  it("starts a published survey with a 201 and the first question", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const { survey, routeQuestion } = await createPublishedJumpSurvey(app, admin);

    const started = await startAttempt(app, user, survey.id);

    expect(started.attempt.status).toBe("in_progress");
    expect(started.currentQuestion?.id).toBe(routeQuestion.id);
  });

  it("returns the existing active attempt on repeated starts", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const { survey } = await createPublishedJumpSurvey(app, admin);

    const first = await startAttempt(app, user, survey.id);
    const second = await startAttempt(app, user, survey.id, 200);

    expect(second.attempt.id).toBe(first.attempt.id);
  });

  it("refuses to start draft surveys", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const draft = await createDraftSurvey(app, admin);

    const response = await request(app)
      .post(`/api/surveys/${draft.id}/start`)
      .set("Cookie", user.cookie)
      .send({});

    expect(response.status).toBe(404);
  });

  it("blocks a new attempt once the survey was completed", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const { survey, routeQuestion, jumpOptionId, targetQuestion } =
      await createPublishedJumpSurvey(app, admin);

    const started = await startAttempt(app, user, survey.id);
    await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: routeQuestion.id,
      selectedAnswerOptionIds: [jumpOptionId]
    });
    await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: targetQuestion.id,
      answerText: "done"
    });
    await completeAttempt(app, user, survey.id, started.attempt.id);

    const response = await request(app)
      .post(`/api/surveys/${survey.id}/start`)
      .set("Cookie", user.cookie)
      .send({});

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("This survey has already been completed");
  });

  it("allows a fresh attempt after an attempt was abandoned", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const { survey } = await createPublishedJumpSurvey(app, admin);

    const first = await startAttempt(app, user, survey.id);
    const { pool } = await import("../src/db.js");
    await pool.query(`update survey_attempts set status = 'abandoned' where id = $1`, [
      first.attempt.id
    ]);

    const second = await startAttempt(app, user, survey.id);

    expect(second.attempt.id).not.toBe(first.attempt.id);
    expect(second.attempt.status).toBe("in_progress");
  });
});

describe("conditional navigation", () => {
  it("jumps past skipped questions when the trigger option is selected", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const { survey, routeQuestion, jumpOptionId, targetQuestion } =
      await createPublishedJumpSurvey(app, admin);

    const started = await startAttempt(app, user, survey.id);
    const afterAnswer = await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: routeQuestion.id,
      selectedAnswerOptionIds: [jumpOptionId]
    });

    expect(afterAnswer.currentQuestion?.id).toBe(targetQuestion.id);
  });

  it("skips the jump target in the normal path and ends after the middle question", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const { survey, routeQuestion, stayOptionId, middleQuestion } =
      await createPublishedJumpSurvey(app, admin);

    const started = await startAttempt(app, user, survey.id);
    const afterRoute = await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: routeQuestion.id,
      selectedAnswerOptionIds: [stayOptionId]
    });

    expect(afterRoute.currentQuestion?.id).toBe(middleQuestion.id);

    const afterMiddle = await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: middleQuestion.id,
      answerText: "middle answer"
    });

    // The jump target is skipTargetInNormalFlow, so the normal path ends here.
    expect(afterMiddle.currentQuestion).toBeNull();
    expect(afterMiddle.isCompleteReady).toBe(true);
  });

  it("skips hidden questions when the trigger option is selected", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const { survey, triggerQuestion, skipOptionId, finalQuestion } =
      await createPublishedSkipSurvey(app, admin);

    const started = await startAttempt(app, user, survey.id);
    const afterTrigger = await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: triggerQuestion.id,
      selectedAnswerOptionIds: [skipOptionId]
    });

    expect(afterTrigger.currentQuestion?.id).toBe(finalQuestion.id);
  });

  it("keeps skip-rule targets in the flow for other answers", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const { survey, triggerQuestion, keepOptionId, hiddenQuestionA } =
      await createPublishedSkipSurvey(app, admin);

    const started = await startAttempt(app, user, survey.id);
    const afterTrigger = await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: triggerQuestion.id,
      selectedAnswerOptionIds: [keepOptionId]
    });

    expect(afterTrigger.currentQuestion?.id).toBe(hiddenQuestionA.id);
  });

  it("completes an attempt whose required questions were skipped by rule", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const { survey, triggerQuestion, skipOptionId, finalQuestion } =
      await createPublishedSkipSurvey(app, admin);

    const started = await startAttempt(app, user, survey.id);
    await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: triggerQuestion.id,
      selectedAnswerOptionIds: [skipOptionId]
    });
    const afterFinal = await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: finalQuestion.id,
      answerText: "done"
    });

    expect(afterFinal.isCompleteReady).toBe(true);

    const completed = await completeAttempt(app, user, survey.id, started.attempt.id);

    expect(completed.attempt.status).toBe("completed");
  });

  it("blocks completion again when the trigger answer changes back", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const { survey, triggerQuestion, skipOptionId, keepOptionId } =
      await createPublishedSkipSurvey(app, admin);

    const started = await startAttempt(app, user, survey.id);
    await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: triggerQuestion.id,
      selectedAnswerOptionIds: [skipOptionId]
    });

    // Changing the answer restores the hidden required questions, so the
    // attempt can no longer complete until they are answered.
    const afterChange = await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: triggerQuestion.id,
      selectedAnswerOptionIds: [keepOptionId]
    });

    expect(afterChange.isCompleteReady).toBe(false);

    const response = await request(app)
      .post(`/api/surveys/${survey.id}/complete`)
      .set("Cookie", user.cookie)
      .send({ attemptId: started.attempt.id });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/^Required question/);
  });

  it("skips required questions when an optional text source is saved blank", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    let survey = await createDraftSurvey(app, admin, "Blank text skip");
    survey = await addQuestion(app, admin, survey.id, {
      questionText: "Optional notes",
      isRequired: false
    });
    survey = await addQuestion(app, admin, survey.id, { questionText: "Required follow-up" });
    survey = await addQuestion(app, admin, survey.id, { questionText: "Final" });

    const source = findQuestion(survey, "Optional notes");
    const hiddenTarget = findQuestion(survey, "Required follow-up");
    const finalQuestion = findQuestion(survey, "Final");

    survey = await addRule(app, admin, survey.id, {
      sourceQuestionId: source.id,
      sourceAnswerOptionId: null,
      conditionOperator: "is_blank",
      targetQuestionId: hiddenTarget.id,
      actionType: "HIDE_QUESTION"
    });
    survey = await setSurveyStatus(app, admin, survey.id, "published");

    const started = await startAttempt(app, user, survey.id);
    const afterBlank = await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: source.id,
      answerText: "   "
    });

    expect(afterBlank.currentQuestion?.id).toBe(finalQuestion.id);

    const afterFinal = await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: finalQuestion.id,
      answerText: "done"
    });

    expect(afterFinal.isCompleteReady).toBe(true);
    await completeAttempt(app, user, survey.id, started.attempt.id);
  });

  it("restores blank-text skip targets when the source answer becomes non-blank", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    let survey = await createDraftSurvey(app, admin, "Blank text restored");
    survey = await addQuestion(app, admin, survey.id, {
      questionText: "Optional notes",
      isRequired: false
    });
    survey = await addQuestion(app, admin, survey.id, { questionText: "Required follow-up" });
    survey = await addQuestion(app, admin, survey.id, { questionText: "Final" });

    const source = findQuestion(survey, "Optional notes");
    const hiddenTarget = findQuestion(survey, "Required follow-up");

    survey = await addRule(app, admin, survey.id, {
      sourceQuestionId: source.id,
      sourceAnswerOptionId: null,
      conditionOperator: "is_blank",
      targetQuestionId: hiddenTarget.id,
      actionType: "HIDE_QUESTION"
    });
    survey = await setSurveyStatus(app, admin, survey.id, "published");

    const started = await startAttempt(app, user, survey.id);
    await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: source.id,
      answerText: null
    });
    const afterChange = await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: source.id,
      answerText: "Needs follow-up"
    });

    expect(afterChange.currentQuestion?.id).toBe(hiddenTarget.id);

    const response = await request(app)
      .post(`/api/surveys/${survey.id}/complete`)
      .set("Cookie", user.cookie)
      .send({ attemptId: started.attempt.id });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/^Required question/);
  });
});

describe("answer validation", () => {
  it("rejects blank answers to required questions", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const { survey, routeQuestion } = await createPublishedJumpSurvey(app, admin);

    const started = await startAttempt(app, user, survey.id);
    const response = await request(app)
      .post(`/api/surveys/${survey.id}/answer`)
      .set("Cookie", user.cookie)
      .send({
        attemptId: started.attempt.id,
        questionId: routeQuestion.id,
        selectedAnswerOptionIds: []
      });

    expect(response.status).toBe(400);
  });

  it("rejects selected options that do not belong to the question", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const { survey, routeQuestion } = await createPublishedJumpSurvey(app, admin);

    const started = await startAttempt(app, user, survey.id);
    const response = await request(app)
      .post(`/api/surveys/${survey.id}/answer`)
      .set("Cookie", user.cookie)
      .send({
        attemptId: started.attempt.id,
        questionId: routeQuestion.id,
        selectedAnswerOptionIds: [999999]
      });

    expect(response.status).toBe(400);
  });

  it("saves blank responses for optional questions", async () => {
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
    const afterBlank = await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: middleQuestion.id,
      answerText: null
    });

    expect(afterBlank.isCompleteReady).toBe(true);
  });
});

describe("attempt completion", () => {
  it("rejects completion while required questions are unanswered", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const { survey } = await createPublishedJumpSurvey(app, admin);

    const started = await startAttempt(app, user, survey.id);
    const response = await request(app)
      .post(`/api/surveys/${survey.id}/complete`)
      .set("Cookie", user.cookie)
      .send({ attemptId: started.attempt.id });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/^Required question/);
  });

  it("completes an attempt and then blocks further answers", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const { survey, routeQuestion, jumpOptionId, targetQuestion } =
      await createPublishedJumpSurvey(app, admin);

    const started = await startAttempt(app, user, survey.id);
    await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: routeQuestion.id,
      selectedAnswerOptionIds: [jumpOptionId]
    });
    await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: targetQuestion.id,
      answerText: "target answer"
    });

    const completed = await completeAttempt(app, user, survey.id, started.attempt.id);
    expect(completed.attempt.status).toBe("completed");

    const answerResponse = await request(app)
      .post(`/api/surveys/${survey.id}/answer`)
      .set("Cookie", user.cookie)
      .send({
        attemptId: started.attempt.id,
        questionId: routeQuestion.id,
        selectedAnswerOptionIds: [jumpOptionId]
      });

    expect(answerResponse.status).toBe(409);
    expect(answerResponse.body.error).toBe("Completed attempts cannot accept new answers");
  });

  it("blocks answers and completion on abandoned attempts", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const { survey, routeQuestion, jumpOptionId } = await createPublishedJumpSurvey(app, admin);

    const started = await startAttempt(app, user, survey.id);
    const { pool } = await import("../src/db.js");
    await pool.query(`update survey_attempts set status = 'abandoned' where id = $1`, [
      started.attempt.id
    ]);

    const answerResponse = await request(app)
      .post(`/api/surveys/${survey.id}/answer`)
      .set("Cookie", user.cookie)
      .send({
        attemptId: started.attempt.id,
        questionId: routeQuestion.id,
        selectedAnswerOptionIds: [jumpOptionId]
      });

    expect(answerResponse.status).toBe(409);

    const completeResponse = await request(app)
      .post(`/api/surveys/${survey.id}/complete`)
      .set("Cookie", user.cookie)
      .send({ attemptId: started.attempt.id });

    expect(completeResponse.status).toBe(409);
  });

  it("does not let users touch attempts that belong to someone else", async () => {
    const admin = await registerAdmin(app);
    const owner = await registerUser(app);
    const other = await registerUser(app);
    const { survey, routeQuestion, jumpOptionId } = await createPublishedJumpSurvey(app, admin);

    const started = await startAttempt(app, owner, survey.id);
    const response = await request(app)
      .post(`/api/surveys/${survey.id}/answer`)
      .set("Cookie", other.cookie)
      .send({
        attemptId: started.attempt.id,
        questionId: routeQuestion.id,
        selectedAnswerOptionIds: [jumpOptionId]
      });

    expect(response.status).toBe(404);
  });
});

describe("scale answers", () => {
  it("stores the selected scale value as both option and integer", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);

    let survey = await createDraftSurvey(app, admin, "Scale survey");
    survey = await addQuestion(app, admin, survey.id, {
      questionText: "Rate it",
      questionType: "scale",
      scaleMin: 1,
      scaleMax: 5
    });
    survey = await setSurveyStatus(app, admin, survey.id, "published");

    const question = findQuestion(survey, "Rate it");
    const fourOption = question.answerOptions.find((option) => option.optionText === "4");

    expect(question.answerOptions).toHaveLength(5);
    expect(fourOption).toBeDefined();

    const started = await startAttempt(app, user, survey.id);
    const afterAnswer = await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: question.id,
      selectedAnswerOptionIds: [fourOption!.id]
    });

    expect(afterAnswer.isCompleteReady).toBe(true);

    const detail = await request(app)
      .get(`/api/my-surveys/${started.attempt.id}`)
      .set("Cookie", user.cookie);

    expect(detail.status).toBe(200);
    expect(detail.body.attempt.responses[0].answerInteger).toBe(4);
    expect(detail.body.attempt.responses[0].selectedAnswerOptionIds).toEqual([fourOption!.id]);
  });
});
