import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import {
  addOption,
  addOtherTag,
  addPage,
  addQuestion,
  addRule,
  addTag,
  addValueTag,
  createDraftSurvey,
  findQuestion,
  registerAdmin,
  registerUser,
  setSurveyStatus
} from "./helpers/factories.js";

const app = createApp();

describe("survey page templates", () => {
  it("keeps template APIs admin-only", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    let survey = await createDraftSurvey(app, admin, "Template source");
    survey = await addQuestion(app, admin, survey.id, { questionText: "Admin-only question" });
    const page = survey.pages[0];

    const listResponse = await request(app)
      .get("/api/admin/page-templates")
      .set("Cookie", user.cookie);
    const saveResponse = await request(app)
      .post(`/api/surveys/${survey.id}/pages/${page.id}/template`)
      .set("Cookie", user.cookie)
      .send({ name: "Blocked template" });

    expect(listResponse.status).toBe(403);
    expect(saveResponse.status).toBe(403);
  });

  it("saves a page snapshot with hidden tags and an excluded-logic manifest", async () => {
    const admin = await registerAdmin(app);
    let survey = await createDraftSurvey(app, admin, "Source survey");
    const sourcePage = survey.pages[0];
    survey = await addPage(app, admin, survey.id, { title: "Follow-up page" });
    const targetPage = survey.pages.find((page) => page.title === "Follow-up page");

    if (!targetPage) {
      throw new Error("Expected target page to exist");
    }

    survey = await addQuestion(app, admin, survey.id, {
      questionText: "Pick a compliance state",
      questionType: "single_select",
      allowOther: true,
      pageId: sourcePage.id
    });
    survey = await addQuestion(app, admin, survey.id, {
      questionText: "Score the finding",
      questionType: "integer",
      pageId: sourcePage.id
    });
    survey = await addQuestion(app, admin, survey.id, {
      questionText: "Rate confidence",
      questionType: "scale",
      scaleMin: 1,
      scaleMax: 5,
      pageId: sourcePage.id
    });
    survey = await addQuestion(app, admin, survey.id, {
      questionText: "Follow-up",
      pageId: targetPage.id
    });

    const choice = findQuestion(survey, "Pick a compliance state");
    survey = await addOption(app, admin, survey.id, choice.id, "Needs review");
    const taggedOption = findQuestion(survey, "Pick a compliance state").answerOptions[0];
    survey = await addTag(
      app,
      admin,
      survey.id,
      choice.id,
      taggedOption.id,
      "status",
      "review"
    );
    survey = await addOtherTag(app, admin, survey.id, choice.id, "status", "other");

    const score = findQuestion(survey, "Score the finding");
    survey = await addValueTag(app, admin, survey.id, score.id, {
      integerMin: 10,
      integerMax: 20,
      tagKey: "score",
      tagValue: "medium"
    });

    const followUp = findQuestion(survey, "Follow-up");
    const sourceOption = findQuestion(survey, "Pick a compliance state").answerOptions[0];
    survey = await addRule(app, admin, survey.id, {
      sourcePageId: sourcePage.id,
      sourceQuestionId: choice.id,
      sourceAnswerOptionId: sourceOption.id,
      targetPageId: targetPage.id,
      actionType: "JUMP_TO_PAGE"
    });

    expect(followUp.pageId).toBe(targetPage.id);

    const response = await request(app)
      .post(`/api/surveys/${survey.id}/pages/${sourcePage.id}/template`)
      .set("Cookie", admin.cookie)
      .send({
        name: "Compliance starter",
        description: "Reusable opening page",
        pageTitle: "Inserted compliance starter"
      });

    expect(response.status).toBe(201);
    expect(response.body.template).toEqual(
      expect.objectContaining({
        name: "Compliance starter",
        description: "Reusable opening page",
        sourceSurveyId: survey.id,
        sourcePageTitle: sourcePage.title,
        questionCount: 3,
        excludedLogicCount: 1
      })
    );
    expect(response.body.template.page.questions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          questionText: "Pick a compliance state",
          answerOptions: [
            expect.objectContaining({
              optionText: "Needs review",
              answerTags: [{ tagKey: "status", tagValue: "review" }]
            })
          ],
          otherTags: [{ tagKey: "status", tagValue: "other" }]
        }),
        expect.objectContaining({
          questionText: "Score the finding",
          valueTags: [
            expect.objectContaining({
              integerMin: 10,
              integerMax: 20,
              tagKey: "score",
              tagValue: "medium"
            })
          ]
        }),
        expect.objectContaining({
          questionText: "Rate confidence",
          scaleMin: 1,
          scaleMax: 5
        })
      ])
    );
    expect(response.body.template.page.title).toBe("Inserted compliance starter");
    expect(response.body.template.excludedLogic).toEqual([
      expect.objectContaining({
        crossesPageBoundary: true,
        sourceRuleId: survey.conditionalLogicRules[0].id,
        source: expect.objectContaining({ pageId: sourcePage.id }),
        target: expect.objectContaining({ pageId: targetPage.id })
      })
    ]);

    const sourceResponse = await request(app)
      .get(`/api/surveys/${survey.id}`)
      .set("Cookie", admin.cookie);
    expect(sourceResponse.status).toBe(200);
    expect(sourceResponse.body.survey.pages[0].title).toBe(sourcePage.title);
  });

  it("inserts a saved page template into a draft survey without copying rules", async () => {
    const admin = await registerAdmin(app);
    let source = await createDraftSurvey(app, admin, "Reusable source");
    source = await addPage(app, admin, source.id, { title: "Reusable page" });
    const templatePage = source.pages.find((page) => page.title === "Reusable page");

    if (!templatePage) {
      throw new Error("Expected reusable page to exist");
    }

    source = await addQuestion(app, admin, source.id, {
      questionText: "Reusable pick",
      questionType: "single_select",
      allowOther: true,
      pageId: templatePage.id
    });
    const sourceQuestion = findQuestion(source, "Reusable pick");
    source = await addOption(app, admin, source.id, sourceQuestion.id, "Yes");
    const sourceOption = findQuestion(source, "Reusable pick").answerOptions[0];
    source = await addTag(app, admin, source.id, sourceQuestion.id, sourceOption.id, "flag", "yes");
    source = await addOtherTag(app, admin, source.id, sourceQuestion.id, "flag", "other");

    const saveResponse = await request(app)
      .post(`/api/surveys/${source.id}/pages/${templatePage.id}/template`)
      .set("Cookie", admin.cookie)
      .send({
        name: "Reusable pick page",
        pageTitle: "Inserted reusable pick"
      });
    expect(saveResponse.status).toBe(201);

    let target = await createDraftSurvey(app, admin, "Target survey");
    target = await addQuestion(app, admin, target.id, { questionText: "Existing question" });

    const insertResponse = await request(app)
      .post(`/api/surveys/${target.id}/page-templates/${saveResponse.body.template.id}/insert`)
      .set("Cookie", admin.cookie)
      .send({ displayOrder: 1 });

    expect(insertResponse.status).toBe(201);
    const updated = insertResponse.body.survey;
    const copiedQuestion = findQuestion(updated, "Reusable pick");

    expect(updated.pages).toHaveLength(2);
    expect(updated.pages[0].title).toBe("Inserted reusable pick");
    expect(updated.pages[1].title).toBe("Page 1");
    expect(copiedQuestion.surveyId).toBe(target.id);
    expect(copiedQuestion.pageId).toBe(updated.pages[0].id);
    expect(copiedQuestion.id).not.toBe(sourceQuestion.id);
    expect(copiedQuestion.answerOptions).toEqual([
      expect.objectContaining({
        optionText: "Yes",
        answerTags: [expect.objectContaining({ tagKey: "flag", tagValue: "yes" })]
      })
    ]);
    expect(copiedQuestion.otherTags).toEqual([
      expect.objectContaining({ tagKey: "flag", tagValue: "other" })
    ]);
    expect(updated.conditionalLogicRules).toEqual([]);
  });

  it("rejects inserting templates into published surveys", async () => {
    const admin = await registerAdmin(app);
    let source = await createDraftSurvey(app, admin, "Source");
    source = await addQuestion(app, admin, source.id, { questionText: "Reusable" });
    const saveResponse = await request(app)
      .post(`/api/surveys/${source.id}/pages/${source.pages[0].id}/template`)
      .set("Cookie", admin.cookie)
      .send({ name: "Locked insert template" });
    expect(saveResponse.status).toBe(201);

    let target = await createDraftSurvey(app, admin, "Published target");
    target = await addQuestion(app, admin, target.id, { questionText: "Ready" });
    target = await setSurveyStatus(app, admin, target.id, "published");

    const response = await request(app)
      .post(`/api/surveys/${target.id}/page-templates/${saveResponse.body.template.id}/insert`)
      .set("Cookie", admin.cookie)
      .send({});

    expect(response.status).toBe(409);
    expect(response.body.error).toContain("draft");
  });

  it("supports admin detail, update, and delete round trips", async () => {
    const admin = await registerAdmin(app);
    let survey = await createDraftSurvey(app, admin, "Manage template source");
    survey = await addQuestion(app, admin, survey.id, { questionText: "Reusable detail" });

    const saveResponse = await request(app)
      .post(`/api/surveys/${survey.id}/pages/${survey.pages[0].id}/template`)
      .set("Cookie", admin.cookie)
      .send({ name: "Original template", description: "Before rename" });
    expect(saveResponse.status).toBe(201);
    const templateId = saveResponse.body.template.id;

    const detailResponse = await request(app)
      .get(`/api/admin/page-templates/${templateId}`)
      .set("Cookie", admin.cookie);
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.template.page.questions).toEqual([
      expect.objectContaining({ questionText: "Reusable detail" })
    ]);

    const updateResponse = await request(app)
      .put(`/api/admin/page-templates/${templateId}`)
      .set("Cookie", admin.cookie)
      .send({ name: "Renamed template", description: "After rename" });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.template).toEqual(
      expect.objectContaining({
        id: templateId,
        name: "Renamed template",
        description: "After rename",
        updatedByUserId: admin.user.id
      })
    );

    const listResponse = await request(app)
      .get("/api/admin/page-templates")
      .set("Cookie", admin.cookie);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.templates).toEqual([
      expect.objectContaining({
        id: templateId,
        name: "Renamed template",
        questionCount: 1,
        excludedLogicCount: 0
      })
    ]);
    expect(listResponse.body.templates[0].page).toBeUndefined();
    expect(listResponse.body.templates[0].excludedLogic).toBeUndefined();

    const deleteResponse = await request(app)
      .delete(`/api/admin/page-templates/${templateId}`)
      .set("Cookie", admin.cookie);
    expect(deleteResponse.status).toBe(204);

    const missingDetailResponse = await request(app)
      .get(`/api/admin/page-templates/${templateId}`)
      .set("Cookie", admin.cookie);
    expect(missingDetailResponse.status).toBe(404);
  });

  it("returns clear validation errors for missing pages, missing templates, and bad insert order", async () => {
    const admin = await registerAdmin(app);
    let survey = await createDraftSurvey(app, admin, "Validation target");
    survey = await addQuestion(app, admin, survey.id, { questionText: "Existing" });

    const missingPageResponse = await request(app)
      .post(`/api/surveys/${survey.id}/pages/999/template`)
      .set("Cookie", admin.cookie)
      .send({ name: "Missing page" });
    expect(missingPageResponse.status).toBe(404);
    expect(missingPageResponse.body.error).toBe("Page not found");

    const missingTemplateResponse = await request(app)
      .post(`/api/surveys/${survey.id}/page-templates/999/insert`)
      .set("Cookie", admin.cookie)
      .send({});
    expect(missingTemplateResponse.status).toBe(404);
    expect(missingTemplateResponse.body.error).toBe("Template not found");

    const invalidOrderResponse = await request(app)
      .post(`/api/surveys/${survey.id}/page-templates/999/insert`)
      .set("Cookie", admin.cookie)
      .send({ displayOrder: 0 });
    expect(invalidOrderResponse.status).toBe(400);
    expect(invalidOrderResponse.body.error).toBe("Display order must be a positive integer");
  });
});
