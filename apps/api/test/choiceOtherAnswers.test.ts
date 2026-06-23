import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import {
  addOption,
  addOtherTag,
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

describe("choice Other hidden tags", () => {
  it("creates, updates, deletes, and catalogs hidden tags for Other", async () => {
    const admin = await registerAdmin(app);
    let survey = await createDraftSurvey(app, admin, "Other tag lifecycle");
    survey = await addQuestion(app, admin, survey.id, {
      questionText: "Choose",
      questionType: "single_select",
      allowOther: true
    });
    const question = findQuestion(survey, "Choose");

    const createResponse = await request(app)
      .post(`/api/surveys/${survey.id}/questions/${question.id}/other-tags`)
      .set("Cookie", admin.cookie)
      .send({ tagKey: "source", tagValue: "other" });
    expect(createResponse.status).toBe(201);
    expect(findQuestion(createResponse.body.survey, "Choose").otherTags).toEqual([
      expect.objectContaining({ tagKey: "source", tagValue: "other" })
    ]);

    const tagId = findQuestion(createResponse.body.survey, "Choose").otherTags[0].id;
    const updateResponse = await request(app)
      .put(`/api/surveys/${survey.id}/questions/${question.id}/other-tags/${tagId}`)
      .set("Cookie", admin.cookie)
      .send({ tagKey: "source", tagValue: "custom-other" });
    expect(updateResponse.status).toBe(200);
    expect(findQuestion(updateResponse.body.survey, "Choose").otherTags).toEqual([
      expect.objectContaining({ tagKey: "source", tagValue: "custom-other" })
    ]);

    const catalogResponse = await request(app).get("/api/tags").set("Cookie", admin.cookie);
    expect(catalogResponse.body.tags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tagKey: "source", tagValue: "other" }),
        expect.objectContaining({ tagKey: "source", tagValue: "custom-other" })
      ])
    );

    const deleteResponse = await request(app)
      .delete(`/api/surveys/${survey.id}/questions/${question.id}/other-tags/${tagId}`)
      .set("Cookie", admin.cookie);
    expect(deleteResponse.status).toBe(200);
    expect(findQuestion(deleteResponse.body.survey, "Choose").otherTags).toEqual([]);
  });

  it("rejects Other hidden tags on unsupported questions and when Allow Other is disabled", async () => {
    const admin = await registerAdmin(app);
    let survey = await createDraftSurvey(app, admin, "Invalid Other tag survey");
    survey = await addQuestion(app, admin, survey.id, {
      questionText: "Text",
      questionType: "text"
    });
    survey = await addQuestion(app, admin, survey.id, {
      questionText: "Choice",
      questionType: "multi_select",
      allowOther: false
    });

    for (const questionText of ["Text", "Choice"]) {
      const question = findQuestion(survey, questionText);
      const response = await request(app)
        .post(`/api/surveys/${survey.id}/questions/${question.id}/other-tags`)
        .set("Cookie", admin.cookie)
        .send({ tagKey: "invalid", tagValue: questionText });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe(
        "Other hidden tags require Allow Other on a single-select or multi-select question"
      );
    }
  });

  it("does not expose Other hidden tags in participant survey or attempt payloads", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    let survey = await createDraftSurvey(app, admin, "Other tag visibility");
    survey = await addQuestion(app, admin, survey.id, {
      questionText: "Choose",
      questionType: "single_select",
      allowOther: true
    });
    const questionId = findQuestion(survey, "Choose").id;
    survey = await addOption(app, admin, survey.id, questionId, "Standard");
    survey = await addOtherTag(app, admin, survey.id, questionId, "visibility", "admin-only");
    survey = await setSurveyStatus(app, admin, survey.id, "published");

    const adminRead = await request(app).get(`/api/surveys/${survey.id}`).set("Cookie", admin.cookie);
    expect(JSON.stringify(adminRead.body)).toContain("admin-only");

    const participantRead = await request(app)
      .get(`/api/surveys/${survey.id}`)
      .set("Cookie", user.cookie);
    expect(participantRead.status).toBe(200);
    expect(JSON.stringify(participantRead.body)).not.toContain("admin-only");

    const started = await startAttempt(app, user, survey.id);
    expect(JSON.stringify(started)).not.toContain("admin-only");

    const afterAnswer = await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId,
      isOtherSelected: true,
      otherText: "Custom text"
    });
    expect(JSON.stringify(afterAnswer)).not.toContain("admin-only");
  });

  it("rolls Other hidden tags into admin detail, summary, and CSV only when Other is answered", async () => {
    const admin = await registerAdmin(app);
    const otherUser = await registerUser(app);
    const standardUser = await registerUser(app);
    let survey = await createDraftSurvey(app, admin, "Other tag reporting");
    survey = await addQuestion(app, admin, survey.id, {
      questionText: "Choose",
      questionType: "multi_select",
      allowOther: true
    });
    const questionId = findQuestion(survey, "Choose").id;
    survey = await addOption(app, admin, survey.id, questionId, "Standard");
    const standardOptionId = findQuestion(survey, "Choose").answerOptions[0].id;
    survey = await addOtherTag(app, admin, survey.id, questionId, "source", "other");
    survey = await setSurveyStatus(app, admin, survey.id, "published");

    const otherAttempt = await startAttempt(app, otherUser, survey.id);
    await submitAnswer(app, otherUser, survey.id, {
      attemptId: otherAttempt.attempt.id,
      questionId,
      selectedAnswerOptionIds: [standardOptionId],
      isOtherSelected: true,
      otherText: "Custom source"
    });
    await completeAttempt(app, otherUser, survey.id, otherAttempt.attempt.id);

    const standardAttempt = await startAttempt(app, standardUser, survey.id);
    await submitAnswer(app, standardUser, survey.id, {
      attemptId: standardAttempt.attempt.id,
      questionId,
      selectedAnswerOptionIds: [standardOptionId]
    });
    await completeAttempt(app, standardUser, survey.id, standardAttempt.attempt.id);

    const reportResponse = await request(app)
      .get(`/api/surveys/${survey.id}/report`)
      .set("Cookie", admin.cookie);
    expect(reportResponse.status).toBe(200);
    expect(reportResponse.body.report.tagStats).toEqual([
      {
        tagKey: "source",
        tagValue: "other",
        selectionCount: 1,
        respondentCount: 1
      }
    ]);

    const detailResponse = await request(app)
      .get(`/api/surveys/${survey.id}/attempts/${otherAttempt.attempt.id}`)
      .set("Cookie", admin.cookie);
    expect(detailResponse.status).toBe(200);
    const detailAnswer = detailResponse.body.answers.find(
      (item: { questionId: number }) => item.questionId === questionId
    );
    expect(detailAnswer.otherText).toBe("Custom source");
    expect(detailAnswer.otherTags).toEqual([{ tagKey: "source", tagValue: "other" }]);
    expect(detailAnswer.selectedOptions[0].answerOptionId).toBe(standardOptionId);

    const csvResponse = await request(app)
      .get(`/api/surveys/${survey.id}/export.csv`)
      .set("Cookie", admin.cookie);
    expect(csvResponse.status).toBe(200);
    const rows = csvResponse.text.trimEnd().split("\r\n");
    const otherRow = rows.find((row) => row.includes("Custom source"));
    const standardRow = rows.find(
      (row) => row.includes("Standard") && !row.includes("Custom source")
    );
    expect(otherRow).toContain("source=other");
    expect(standardRow).not.toContain("source=other");
  });
});
