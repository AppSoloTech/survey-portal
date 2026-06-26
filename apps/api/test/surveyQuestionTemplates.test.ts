import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import {
  addOption,
  addOtherTag,
  addQuestion,
  addRule,
  addTag,
  createDraftSurvey,
  deleteSurvey,
  findQuestion,
  registerAdmin,
  registerUser,
  setSurveyStatus
} from "./helpers/factories.js";

const app = createApp();

describe("survey question templates", () => {
  it("keeps generic template and question-template APIs admin-only", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    let survey = await createDraftSurvey(app, admin, "Question template source");
    survey = await addQuestion(app, admin, survey.id, { questionText: "Admin-only question" });
    const question = findQuestion(survey, "Admin-only question");

    const listResponse = await request(app)
      .get("/api/admin/templates")
      .set("Cookie", user.cookie);
    const saveResponse = await request(app)
      .post(`/api/surveys/${survey.id}/questions/${question.id}/template`)
      .set("Cookie", user.cookie)
      .send({ name: "Blocked template" });

    expect(listResponse.status).toBe(403);
    expect(saveResponse.status).toBe(403);
  });

  it("saves question snapshots with hidden tags and an excluded-rule manifest", async () => {
    const admin = await registerAdmin(app);
    let survey = await createDraftSurvey(app, admin, "Source survey");
    survey = await addQuestion(app, admin, survey.id, {
      questionText: "Pick a region",
      questionType: "single_select",
      allowOther: true
    });
    survey = await addQuestion(app, admin, survey.id, { questionText: "Follow-up" });

    const sourceQuestion = findQuestion(survey, "Pick a region");
    survey = await addOption(app, admin, survey.id, sourceQuestion.id, "West");
    const sourceOption = findQuestion(survey, "Pick a region").answerOptions[0];
    survey = await addTag(app, admin, survey.id, sourceQuestion.id, sourceOption.id, "region", "west");
    survey = await addOtherTag(app, admin, survey.id, sourceQuestion.id, "region", "other");

    const followUp = findQuestion(survey, "Follow-up");
    survey = await addRule(app, admin, survey.id, {
      sourceQuestionId: sourceQuestion.id,
      sourceAnswerOptionId: sourceOption.id,
      targetQuestionId: followUp.id,
      actionType: "HIDE_QUESTION"
    });

    const response = await request(app)
      .post(`/api/surveys/${survey.id}/questions/${sourceQuestion.id}/template`)
      .set("Cookie", admin.cookie)
      .send({
        name: "Region question",
        description: "Reusable region picker",
        questionText: "Choose a region"
      });

    expect(response.status).toBe(201);
    expect(response.body.template).toEqual(
      expect.objectContaining({
        templateKind: "question",
        name: "Region question",
        description: "Reusable region picker",
        sourceSurveyId: survey.id,
        sourcePageTitle: survey.pages[0].title,
        sourceQuestionTitle: "Pick a region",
        questionCount: 1,
        excludedLogicCount: 1
      })
    );
    expect(response.body.template.question).toEqual(
      expect.objectContaining({
        questionText: "Choose a region",
        questionType: "single_select",
        allowOther: true,
        answerOptions: [
          expect.objectContaining({
            optionText: "West",
            answerTags: [{ tagKey: "region", tagValue: "west" }]
          })
        ],
        otherTags: [{ tagKey: "region", tagValue: "other" }]
      })
    );
    expect(response.body.template.excludedLogic).toEqual([
      expect.objectContaining({
        sourceRuleId: survey.conditionalLogicRules[0].id,
        source: expect.objectContaining({ questionId: sourceQuestion.id }),
        target: expect.objectContaining({ questionId: followUp.id })
      })
    ]);

    const sourceResponse = await request(app)
      .get(`/api/surveys/${survey.id}`)
      .set("Cookie", admin.cookie);
    expect(sourceResponse.status).toBe(200);
    expect(findQuestion(sourceResponse.body.survey, "Pick a region").questionText).toBe("Pick a region");
  });

  it("records excluded rules when a question template source is referenced as source and target", async () => {
    const admin = await registerAdmin(app);
    let survey = await createDraftSurvey(app, admin, "Rule manifest source");
    survey = await addQuestion(app, admin, survey.id, {
      questionText: "External trigger",
      questionType: "single_select"
    });
    survey = await addQuestion(app, admin, survey.id, {
      questionText: "Reusable trigger",
      questionType: "single_select"
    });
    survey = await addQuestion(app, admin, survey.id, { questionText: "Hidden follow-up" });
    survey = await addQuestion(app, admin, survey.id, { questionText: "Jump target" });

    const reusable = findQuestion(survey, "Reusable trigger");
    const external = findQuestion(survey, "External trigger");
    survey = await addOption(app, admin, survey.id, reusable.id, "Yes");
    survey = await addOption(app, admin, survey.id, reusable.id, "No");
    survey = await addOption(app, admin, survey.id, external.id, "Route");

    const reusableWithOptions = findQuestion(survey, "Reusable trigger");
    const externalWithOptions = findQuestion(survey, "External trigger");
    const yesOption = reusableWithOptions.answerOptions.find((option) => option.optionText === "Yes");
    const noOption = reusableWithOptions.answerOptions.find((option) => option.optionText === "No");
    const routeOption = externalWithOptions.answerOptions[0];
    const hiddenFollowUp = findQuestion(survey, "Hidden follow-up");
    const jumpTarget = findQuestion(survey, "Jump target");

    if (!yesOption || !noOption || !routeOption) {
      throw new Error("Expected rule options to exist");
    }

    survey = await addRule(app, admin, survey.id, {
      sourceQuestionId: reusableWithOptions.id,
      sourceAnswerOptionId: yesOption.id,
      targetQuestionId: hiddenFollowUp.id,
      actionType: "HIDE_QUESTION"
    });
    survey = await addRule(app, admin, survey.id, {
      sourceQuestionId: reusableWithOptions.id,
      sourceAnswerOptionId: noOption.id,
      targetQuestionId: jumpTarget.id,
      actionType: "JUMP_TO_QUESTION"
    });
    survey = await addRule(app, admin, survey.id, {
      sourceQuestionId: externalWithOptions.id,
      sourceAnswerOptionId: routeOption.id,
      targetQuestionId: reusableWithOptions.id,
      actionType: "HIDE_QUESTION"
    });

    const response = await request(app)
      .post(`/api/surveys/${survey.id}/questions/${reusableWithOptions.id}/template`)
      .set("Cookie", admin.cookie)
      .send({ name: "Manifest coverage" });

    expect(response.status).toBe(201);
    expect(response.body.template.excludedLogicCount).toBe(3);
    expect(response.body.template.excludedLogic).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: expect.objectContaining({
            questionId: reusableWithOptions.id,
            answerOptionId: yesOption.id
          }),
          target: expect.objectContaining({ questionId: hiddenFollowUp.id })
        }),
        expect.objectContaining({
          source: expect.objectContaining({
            questionId: reusableWithOptions.id,
            answerOptionId: noOption.id
          }),
          target: expect.objectContaining({ questionId: jumpTarget.id })
        }),
        expect.objectContaining({
          source: expect.objectContaining({ questionId: externalWithOptions.id }),
          target: expect.objectContaining({ questionId: reusableWithOptions.id })
        })
      ])
    );
  });

  it("inserts question templates at explicit positions with fresh IDs and no copied rules", async () => {
    const admin = await registerAdmin(app);
    let source = await createDraftSurvey(app, admin, "Reusable source");
    source = await addQuestion(app, admin, source.id, {
      questionText: "Rate confidence",
      questionType: "scale",
      scaleMin: 1,
      scaleMax: 3
    });
    const sourceQuestion = findQuestion(source, "Rate confidence");
    const highConfidenceOption = findQuestion(source, "Rate confidence").answerOptions.find(
      (option) => option.optionText === "3"
    );

    if (!highConfidenceOption) {
      throw new Error("Expected scale option 3");
    }

    source = await addTag(
      app,
      admin,
      source.id,
      sourceQuestion.id,
      highConfidenceOption.id,
      "confidence",
      "high"
    );

    const saveResponse = await request(app)
      .post(`/api/surveys/${source.id}/questions/${sourceQuestion.id}/template`)
      .set("Cookie", admin.cookie)
      .send({ name: "Confidence scale" });
    expect(saveResponse.status).toBe(201);

    let target = await createDraftSurvey(app, admin, "Target survey");
    target = await addQuestion(app, admin, target.id, { questionText: "First" });
    target = await addQuestion(app, admin, target.id, { questionText: "Last" });
    const targetPage = target.pages[0];

    const insertResponse = await request(app)
      .post(`/api/surveys/${target.id}/pages/${targetPage.id}/question-templates/${saveResponse.body.template.id}/insert`)
      .set("Cookie", admin.cookie)
      .send({ displayOrder: 2 });

    expect(insertResponse.status).toBe(201);
    const updated = insertResponse.body.survey;
    const copiedQuestion = findQuestion(updated, "Rate confidence");
    const pageQuestions = updated.questions.filter((question) => question.pageId === targetPage.id);

    expect(pageQuestions.map((question) => question.questionText)).toEqual([
      "First",
      "Rate confidence",
      "Last"
    ]);
    expect(copiedQuestion.id).not.toBe(sourceQuestion.id);
    expect(copiedQuestion.answerOptions.map((option) => option.optionText)).toEqual(["1", "2", "3"]);
    expect(copiedQuestion.answerOptions[2].answerTags).toEqual([
      expect.objectContaining({ tagKey: "confidence", tagValue: "high" })
    ]);
    expect(updated.conditionalLogicRules).toEqual([]);

    let appendTarget = await createDraftSurvey(app, admin, "Append target");
    appendTarget = await addQuestion(app, admin, appendTarget.id, { questionText: "Existing first" });
    appendTarget = await addQuestion(app, admin, appendTarget.id, { questionText: "Existing second" });

    const appendResponse = await request(app)
      .post(`/api/surveys/${appendTarget.id}/pages/${appendTarget.pages[0].id}/question-templates/${saveResponse.body.template.id}/insert`)
      .set("Cookie", admin.cookie)
      .send({});

    expect(appendResponse.status).toBe(201);
    expect(
      appendResponse.body.survey.questions
        .filter((question: { pageId: number }) => question.pageId === appendTarget.pages[0].id)
        .map((question: { questionText: string }) => question.questionText)
    ).toEqual(["Existing first", "Existing second", "Rate confidence"]);
  });

  it("supports combined template list, detail, update, filter, and delete", async () => {
    const admin = await registerAdmin(app);
    let survey = await createDraftSurvey(app, admin, "Combined library source");
    survey = await addQuestion(app, admin, survey.id, { questionText: "Reusable detail" });
    const question = findQuestion(survey, "Reusable detail");

    const pageResponse = await request(app)
      .post(`/api/surveys/${survey.id}/pages/${survey.pages[0].id}/template`)
      .set("Cookie", admin.cookie)
      .send({ name: "Page template" });
    const questionResponse = await request(app)
      .post(`/api/surveys/${survey.id}/questions/${question.id}/template`)
      .set("Cookie", admin.cookie)
      .send({ name: "Question template" });
    expect(pageResponse.status).toBe(201);
    expect(questionResponse.status).toBe(201);

    const listResponse = await request(app)
      .get("/api/admin/templates")
      .set("Cookie", admin.cookie);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.templates).toEqual([
      expect.objectContaining({ templateKind: "page", name: "Page template" }),
      expect.objectContaining({ templateKind: "question", name: "Question template" })
    ]);
    expect(listResponse.body.templates[0].page).toBeUndefined();

    const filteredResponse = await request(app)
      .get("/api/admin/templates?kind=question&search=detail")
      .set("Cookie", admin.cookie);
    expect(filteredResponse.status).toBe(200);
    expect(filteredResponse.body.templates).toEqual([
      expect.objectContaining({ templateKind: "question", sourceQuestionTitle: "Reusable detail" })
    ]);

    const pageFilterResponse = await request(app)
      .get("/api/admin/templates?kind=page")
      .set("Cookie", admin.cookie);
    expect(pageFilterResponse.status).toBe(200);
    expect(pageFilterResponse.body.templates).toEqual([
      expect.objectContaining({ templateKind: "page", name: "Page template" })
    ]);

    const nonMatchingSearchResponse = await request(app)
      .get("/api/admin/templates?kind=all&search=does-not-exist")
      .set("Cookie", admin.cookie);
    expect(nonMatchingSearchResponse.status).toBe(200);
    expect(nonMatchingSearchResponse.body.templates).toEqual([]);

    const invalidKindResponse = await request(app)
      .get("/api/admin/templates?kind=segment")
      .set("Cookie", admin.cookie);
    expect(invalidKindResponse.status).toBe(400);
    expect(invalidKindResponse.body.error).toBe("Template kind must be page, question, or all");

    const explicitAllResponse = await request(app)
      .get("/api/admin/templates?kind=all")
      .set("Cookie", admin.cookie);
    expect(explicitAllResponse.status).toBe(200);
    expect(explicitAllResponse.body.templates).toHaveLength(2);

    const detailResponse = await request(app)
      .get(`/api/admin/templates/${questionResponse.body.template.id}`)
      .set("Cookie", admin.cookie);
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.template.question.questionText).toBe("Reusable detail");

    const updateResponse = await request(app)
      .put(`/api/admin/templates/${questionResponse.body.template.id}`)
      .set("Cookie", admin.cookie)
      .send({ name: "Renamed question template", description: "After rename" });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.template).toEqual(
      expect.objectContaining({
        name: "Renamed question template",
        description: "After rename",
        question: expect.objectContaining({ questionText: "Reusable detail" })
      })
    );

    const deleteResponse = await request(app)
      .delete(`/api/admin/templates/${questionResponse.body.template.id}`)
      .set("Cookie", admin.cookie);
    expect(deleteResponse.status).toBe(204);

    const missingResponse = await request(app)
      .get(`/api/admin/templates/${questionResponse.body.template.id}`)
      .set("Cookie", admin.cookie);
    expect(missingResponse.status).toBe(404);
  });

  it("blocks invalid question-template insertion targets and locked surveys", async () => {
    const admin = await registerAdmin(app);
    let source = await createDraftSurvey(app, admin, "Question source");
    source = await addQuestion(app, admin, source.id, { questionText: "Reusable" });
    const sourceQuestion = findQuestion(source, "Reusable");
    const saveResponse = await request(app)
      .post(`/api/surveys/${source.id}/questions/${sourceQuestion.id}/template`)
      .set("Cookie", admin.cookie)
      .send({ name: "Reusable question" });
    expect(saveResponse.status).toBe(201);

    let target = await createDraftSurvey(app, admin, "Target");
    target = await addQuestion(app, admin, target.id, { questionText: "Ready" });
    const page = target.pages[0];

    const missingPageResponse = await request(app)
      .post(`/api/surveys/${target.id}/pages/999/question-templates/${saveResponse.body.template.id}/insert`)
      .set("Cookie", admin.cookie)
      .send({});
    expect(missingPageResponse.status).toBe(404);
    expect(missingPageResponse.body.error).toBe("Page not found");

    const missingTemplateResponse = await request(app)
      .post(`/api/surveys/${target.id}/pages/${page.id}/question-templates/999/insert`)
      .set("Cookie", admin.cookie)
      .send({});
    expect(missingTemplateResponse.status).toBe(404);
    expect(missingTemplateResponse.body.error).toBe("Template not found");

    const invalidOrderResponse = await request(app)
      .post(`/api/surveys/${target.id}/pages/${page.id}/question-templates/${saveResponse.body.template.id}/insert`)
      .set("Cookie", admin.cookie)
      .send({ displayOrder: 0 });
    expect(invalidOrderResponse.status).toBe(400);
    expect(invalidOrderResponse.body.error).toBe("Display order must be a positive integer");

    target = await setSurveyStatus(app, admin, target.id, "published");
    const lockedResponse = await request(app)
      .post(`/api/surveys/${target.id}/pages/${target.pages[0].id}/question-templates/${saveResponse.body.template.id}/insert`)
      .set("Cookie", admin.cookie)
      .send({});
    expect(lockedResponse.status).toBe(409);
    expect(lockedResponse.body.error).toContain("draft");

    let retiredTarget = await createDraftSurvey(app, admin, "Retired target");
    retiredTarget = await addQuestion(app, admin, retiredTarget.id, { questionText: "Ready" });
    retiredTarget = await setSurveyStatus(app, admin, retiredTarget.id, "retired");

    const retiredResponse = await request(app)
      .post(`/api/surveys/${retiredTarget.id}/pages/${retiredTarget.pages[0].id}/question-templates/${saveResponse.body.template.id}/insert`)
      .set("Cookie", admin.cookie)
      .send({});
    expect(retiredResponse.status).toBe(409);
    expect(retiredResponse.body.error).toContain("draft");

    let deletedTarget = await createDraftSurvey(app, admin, "Deleted target");
    deletedTarget = await addQuestion(app, admin, deletedTarget.id, { questionText: "Ready" });
    deletedTarget = await deleteSurvey(app, admin, deletedTarget.id);

    const deletedResponse = await request(app)
      .post(`/api/surveys/${deletedTarget.id}/pages/${deletedTarget.pages[0].id}/question-templates/${saveResponse.body.template.id}/insert`)
      .set("Cookie", admin.cookie)
      .send({});
    expect(deletedResponse.status).toBe(409);
    expect(deletedResponse.body.error).toBe("Survey has been deleted");
  });

  it("returns clear save errors for missing and deleted question-template sources", async () => {
    const admin = await registerAdmin(app);
    let survey = await createDraftSurvey(app, admin, "Save validation source");
    survey = await addQuestion(app, admin, survey.id, { questionText: "Existing" });

    const missingSurveyResponse = await request(app)
      .post("/api/surveys/999/questions/1/template")
      .set("Cookie", admin.cookie)
      .send({ name: "Missing survey" });
    expect(missingSurveyResponse.status).toBe(404);
    expect(missingSurveyResponse.body.error).toBe("Survey not found");

    const missingQuestionResponse = await request(app)
      .post(`/api/surveys/${survey.id}/questions/999/template`)
      .set("Cookie", admin.cookie)
      .send({ name: "Missing question" });
    expect(missingQuestionResponse.status).toBe(404);
    expect(missingQuestionResponse.body.error).toBe("Question not found");

    const deletedQuestionId = survey.questions[0].id;
    survey = await deleteSurvey(app, admin, survey.id);

    const deletedSurveyResponse = await request(app)
      .post(`/api/surveys/${survey.id}/questions/${deletedQuestionId}/template`)
      .set("Cookie", admin.cookie)
      .send({ name: "Deleted survey" });
    expect(deletedSurveyResponse.status).toBe(409);
    expect(deletedSurveyResponse.body.error).toBe("Survey has been deleted");
  });
});
