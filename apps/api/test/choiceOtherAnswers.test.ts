import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import {
  addOption,
  addPage,
  addQuestion,
  addTag,
  completeAttempt,
  createDraftSurvey,
  findQuestion,
  registerAdmin,
  registerUser,
  setSurveyStatus,
  startAttempt,
  submitAnswer,
  submitPageAnswers
} from "./helpers/factories.js";

const app = createApp();

describe("choice Other question settings", () => {
  it("creates and updates allowOther on choice questions", async () => {
    const admin = await registerAdmin(app);
    let survey = await createDraftSurvey(app, admin, "Other setting survey");

    survey = await addQuestion(app, admin, survey.id, {
      questionText: "Pick one",
      questionType: "single_select",
      allowOther: true
    });

    let question = findQuestion(survey, "Pick one");
    expect(question.allowOther).toBe(true);

    const response = await request(app)
      .put(`/api/surveys/${survey.id}/questions/${question.id}`)
      .set("Cookie", admin.cookie)
      .send({
        questionText: "Pick several",
        questionType: "multi_select",
        isRequired: false,
        helpText: null,
        allowOther: false
      });

    expect(response.status).toBe(200);
    question = findQuestion(response.body.survey, "Pick several");
    expect(question.allowOther).toBe(false);
  });

  it("rejects allowOther on non-choice question types", async () => {
    const admin = await registerAdmin(app);
    const survey = await createDraftSurvey(app, admin, "Invalid Other setting");

    const response = await request(app)
      .post(`/api/surveys/${survey.id}/questions`)
      .set("Cookie", admin.cookie)
      .send({
        questionText: "Free text",
        questionType: "text",
        isRequired: true,
        helpText: null,
        allowOther: true
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe(
      "allowOther is only supported for single_select and multi_select questions"
    );
  });
});

describe("choice Other answer validation", () => {
  async function createPublishedOtherSurvey(questionType: "single_select" | "multi_select") {
    const admin = await registerAdmin(app);
    let survey = await createDraftSurvey(app, admin, `Other ${questionType}`);
    survey = await addQuestion(app, admin, survey.id, {
      questionText: "Choose",
      questionType,
      allowOther: true
    });
    const questionId = findQuestion(survey, "Choose").id;
    survey = await addOption(app, admin, survey.id, questionId, "Standard");
    survey = await setSurveyStatus(app, admin, survey.id, "published");

    return {
      admin,
      survey,
      question: findQuestion(survey, "Choose"),
      standardOptionId: findQuestion(survey, "Choose").answerOptions[0].id
    };
  }

  it("saves a required single-select Other-only response without an option id", async () => {
    const user = await registerUser(app);
    const { survey, question } = await createPublishedOtherSurvey("single_select");
    const started = await startAttempt(app, user, survey.id);

    const answered = await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: question.id,
      isOtherSelected: true,
      otherText: "Custom answer"
    });

    const response = answered.attempt.responses.find((item) => item.questionId === question.id);
    expect(response?.selectedAnswerOptionIds).toEqual([]);
    expect(response?.otherText).toBe("Custom answer");
    expect(answered.isCompleteReady).toBe(true);
  });

  it("rejects single-select answers that include both a standard option and Other", async () => {
    const user = await registerUser(app);
    const { survey, question, standardOptionId } = await createPublishedOtherSurvey("single_select");
    const started = await startAttempt(app, user, survey.id);

    await submitAnswer(
      app,
      user,
      survey.id,
      {
        attemptId: started.attempt.id,
        questionId: question.id,
        selectedAnswerOptionIds: [standardOptionId],
        isOtherSelected: true,
        otherText: "Custom answer"
      },
      400
    );
  });

  it("saves a multi-select response with both a standard option and Other", async () => {
    const user = await registerUser(app);
    const { survey, question, standardOptionId } = await createPublishedOtherSurvey("multi_select");
    const started = await startAttempt(app, user, survey.id);

    const answered = await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: question.id,
      selectedAnswerOptionIds: [standardOptionId],
      isOtherSelected: true,
      otherText: "Custom answer"
    });

    const response = answered.attempt.responses.find((item) => item.questionId === question.id);
    expect(response?.selectedAnswerOptionIds).toEqual([standardOptionId]);
    expect(response?.otherText).toBe("Custom answer");
  });

  it("rejects selected Other with blank text", async () => {
    const user = await registerUser(app);
    const { survey, question } = await createPublishedOtherSurvey("multi_select");
    const started = await startAttempt(app, user, survey.id);

    const response = await request(app)
      .post(`/api/surveys/${survey.id}/answer`)
      .set("Cookie", user.cookie)
      .send({
        attemptId: started.attempt.id,
        questionId: question.id,
        isOtherSelected: true,
        otherText: "   "
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Other text is required when Other is selected");
  });

  it("rejects Other answer fields on text and integer questions", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    let survey = await createDraftSurvey(app, admin, "Unsupported Other answers");
    survey = await addQuestion(app, admin, survey.id, {
      questionText: "Text question",
      questionType: "text"
    });
    survey = await addQuestion(app, admin, survey.id, {
      questionText: "Integer question",
      questionType: "integer"
    });
    survey = await setSurveyStatus(app, admin, survey.id, "published");

    const started = await startAttempt(app, user, survey.id);

    for (const question of [
      findQuestion(survey, "Text question"),
      findQuestion(survey, "Integer question")
    ]) {
      const response = await request(app)
        .post(`/api/surveys/${survey.id}/answer`)
        .set("Cookie", user.cookie)
        .send({
          attemptId: started.attempt.id,
          questionId: question.id,
          answerText: question.questionType === "text" ? "Real text" : null,
          answerInteger: question.questionType === "integer" ? 7 : null,
          isOtherSelected: true,
          otherText: "Unsupported Other"
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe(
        "Other is only supported for single-select and multi-select questions"
      );
    }
  });

  it("saves Other through the page-answer endpoint", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    let survey = await createDraftSurvey(app, admin, "Page Other survey");
    const firstPage = survey.pages[0];
    survey = await addPage(app, admin, survey.id, { title: "Done" });
    const donePage = survey.pages.find((page) => page.title === "Done");

    if (!firstPage || !donePage) {
      throw new Error("Expected pages to exist");
    }

    survey = await addQuestion(app, admin, survey.id, {
      questionText: "Choose",
      questionType: "single_select",
      pageId: firstPage.id,
      allowOther: true
    });
    survey = await addQuestion(app, admin, survey.id, {
      questionText: "Final",
      pageId: donePage.id
    });
    survey = await addOption(app, admin, survey.id, findQuestion(survey, "Choose").id, "Standard");
    survey = await setSurveyStatus(app, admin, survey.id, "published");

    const started = await startAttempt(app, user, survey.id);
    const choice = findQuestion(survey, "Choose");
    const afterPage = await submitPageAnswers(app, user, survey.id, firstPage.id, {
      attemptId: started.attempt.id,
      answers: [
        {
          questionId: choice.id,
          isOtherSelected: true,
          otherText: "Page custom answer"
        }
      ]
    });

    expect(afterPage.currentPage?.id).toBe(donePage.id);
    const response = afterPage.attempt.responses.find((item) => item.questionId === choice.id);
    expect(response?.otherText).toBe("Page custom answer");
  });
});

describe("choice Other reporting", () => {
  it("reports and exports Other text without fake option ids or hidden tags", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    let survey = await createDraftSurvey(app, admin, "Other reporting survey");
    survey = await addQuestion(app, admin, survey.id, {
      questionText: "Choose",
      questionType: "single_select",
      allowOther: true
    });
    const questionId = findQuestion(survey, "Choose").id;
    survey = await addOption(app, admin, survey.id, questionId, "Tagged option");
    const option = findQuestion(survey, "Choose").answerOptions[0];
    survey = await addTag(app, admin, survey.id, questionId, option.id, "risk", "tagged");
    survey = await setSurveyStatus(app, admin, survey.id, "published");

    const question = findQuestion(survey, "Choose");
    const started = await startAttempt(app, user, survey.id);
    await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: question.id,
      isOtherSelected: true,
      otherText: "Custom report answer"
    });
    await completeAttempt(app, user, survey.id, started.attempt.id);

    const reportResponse = await request(app)
      .get(`/api/surveys/${survey.id}/report`)
      .set("Cookie", admin.cookie);
    expect(reportResponse.status).toBe(200);
    const stat = reportResponse.body.report.questionStats.find(
      (item: { questionId: number }) => item.questionId === question.id
    );
    expect(stat.otherResponseCount).toBe(1);
    expect(stat.optionStats[0].selectionCount).toBe(0);
    expect(reportResponse.body.report.tagStats).toEqual([
      {
        tagKey: "risk",
        tagValue: "tagged",
        selectionCount: 0,
        respondentCount: 0
      }
    ]);

    const detailResponse = await request(app)
      .get(`/api/surveys/${survey.id}/attempts/${started.attempt.id}`)
      .set("Cookie", admin.cookie);
    expect(detailResponse.status).toBe(200);
    const answer = detailResponse.body.answers.find(
      (item: { questionId: number }) => item.questionId === question.id
    );
    expect(answer.selectedOptions).toEqual([]);
    expect(answer.otherText).toBe("Custom report answer");

    const csvResponse = await request(app)
      .get(`/api/surveys/${survey.id}/export.csv`)
      .set("Cookie", admin.cookie);
    expect(csvResponse.status).toBe(200);
    const lines = csvResponse.text.trimEnd().split("\r\n");
    expect(lines[0].split(",")).toContain("other_text");
    expect(lines[1]).toContain("Custom report answer");
    expect(lines[1]).not.toContain("risk=tagged");
  });
});
