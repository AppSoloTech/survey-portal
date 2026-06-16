import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import {
  addOption,
  addQuestion,
  addRule,
  createDraftSurvey,
  createPublishedJumpSurvey,
  findQuestion,
  registerAdmin,
  registerUser,
  setSurveyStatus,
  startAttempt,
  submitAnswer
} from "./helpers/factories.js";

const app = createApp();

describe("builder authorization", () => {
  it("blocks standard users from builder writes with 403", async () => {
    const user = await registerUser(app);
    const response = await request(app)
      .post("/api/surveys")
      .set("Cookie", user.cookie)
      .send({ title: "Nope" });

    expect(response.status).toBe(403);
  });

  it("blocks unauthenticated builder writes with 401", async () => {
    const response = await request(app).post("/api/surveys").send({ title: "Nope" });

    expect(response.status).toBe(401);
  });
});

describe("publish validation", () => {
  it("rejects publishing a survey with no questions", async () => {
    const admin = await registerAdmin(app);
    const survey = await createDraftSurvey(app, admin);

    const response = await request(app)
      .patch(`/api/surveys/${survey.id}/status`)
      .set("Cookie", admin.cookie)
      .send({ status: "published" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Add at least one question before publishing");
  });

  it("rejects publishing when a selection question has no options", async () => {
    const admin = await registerAdmin(app);
    let survey = await createDraftSurvey(app, admin);
    survey = await addQuestion(app, admin, survey.id, {
      questionText: "Pick one",
      questionType: "single_select"
    });

    const response = await request(app)
      .patch(`/api/surveys/${survey.id}/status`)
      .set("Cookie", admin.cookie)
      .send({ status: "published" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe(
      "Selection and scale questions need answer options before publishing"
    );
  });
});

describe("conditional rule validation", () => {
  async function surveyWithSourceAndTarget(admin: Awaited<ReturnType<typeof registerAdmin>>) {
    let survey = await createDraftSurvey(app, admin);
    survey = await addQuestion(app, admin, survey.id, {
      questionText: "Source",
      questionType: "single_select"
    });
    survey = await addQuestion(app, admin, survey.id, { questionText: "Target" });

    const sourceId = findQuestion(survey, "Source").id;
    survey = await addOption(app, admin, survey.id, sourceId, "Yes");

    return survey;
  }

  it("rejects rules whose target question belongs to another survey", async () => {
    const admin = await registerAdmin(app);
    const survey = await surveyWithSourceAndTarget(admin);
    let otherSurvey = await createDraftSurvey(app, admin, "Other survey");
    otherSurvey = await addQuestion(app, admin, otherSurvey.id, { questionText: "Elsewhere" });

    const source = findQuestion(survey, "Source");
    const response = await request(app)
      .post(`/api/surveys/${survey.id}/rules`)
      .set("Cookie", admin.cookie)
      .send({
        sourceQuestionId: source.id,
        sourceAnswerOptionId: source.answerOptions[0].id,
        targetQuestionId: findQuestion(otherSurvey, "Elsewhere").id
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Target question must belong to this survey");
  });

  it("rejects backward and self-targeting rules", async () => {
    const admin = await registerAdmin(app);
    const survey = await surveyWithSourceAndTarget(admin);
    const source = findQuestion(survey, "Source");

    const selfResponse = await request(app)
      .post(`/api/surveys/${survey.id}/rules`)
      .set("Cookie", admin.cookie)
      .send({
        sourceQuestionId: source.id,
        sourceAnswerOptionId: source.answerOptions[0].id,
        targetQuestionId: source.id
      });

    expect(selfResponse.status).toBe(400);
    expect(selfResponse.body.error).toBe("Target question must come after the source question");
  });

  it("rejects rules sourced from non-selection questions", async () => {
    const admin = await registerAdmin(app);
    let survey = await createDraftSurvey(app, admin);
    survey = await addQuestion(app, admin, survey.id, { questionText: "Free text" });
    survey = await addQuestion(app, admin, survey.id, { questionText: "Target" });

    const response = await request(app)
      .post(`/api/surveys/${survey.id}/rules`)
      .set("Cookie", admin.cookie)
      .send({
        sourceQuestionId: findQuestion(survey, "Free text").id,
        sourceAnswerOptionId: 1,
        targetQuestionId: findQuestion(survey, "Target").id
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Source question must be single_select or multi_select");
  });

  it("rejects rules whose source option belongs to a different question", async () => {
    const admin = await registerAdmin(app);
    let survey = await surveyWithSourceAndTarget(admin);
    survey = await addQuestion(app, admin, survey.id, {
      questionText: "Second select",
      questionType: "single_select"
    });
    const secondId = findQuestion(survey, "Second select").id;
    survey = await addOption(app, admin, survey.id, secondId, "Other option");

    const source = findQuestion(survey, "Source");
    const foreignOption = findQuestion(survey, "Second select").answerOptions[0];

    const response = await request(app)
      .post(`/api/surveys/${survey.id}/rules`)
      .set("Cookie", admin.cookie)
      .send({
        sourceQuestionId: source.id,
        sourceAnswerOptionId: foreignOption.id,
        targetQuestionId: findQuestion(survey, "Target").id
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Source answer option must belong to the source question");
  });

  it("accepts skip rules and forces skipTargetInNormalFlow off", async () => {
    const admin = await registerAdmin(app);
    const survey = await surveyWithSourceAndTarget(admin);
    const source = findQuestion(survey, "Source");

    const updated = await addRule(app, admin, survey.id, {
      sourceQuestionId: source.id,
      sourceAnswerOptionId: source.answerOptions[0].id,
      targetQuestionId: findQuestion(survey, "Target").id,
      actionType: "HIDE_QUESTION",
      // The static skip flag is a jump-rule concept; the server must ignore
      // it for skip rules so the target stays in the normal flow.
      skipTargetInNormalFlow: true
    });

    expect(updated.conditionalLogicRules).toHaveLength(1);
    expect(updated.conditionalLogicRules[0]).toMatchObject({
      actionType: "HIDE_QUESTION",
      skipTargetInNormalFlow: false
    });
  });

  it("accepts blank-text skip rules without a source option", async () => {
    const admin = await registerAdmin(app);
    let survey = await createDraftSurvey(app, admin);
    survey = await addQuestion(app, admin, survey.id, {
      questionText: "Optional notes",
      isRequired: false
    });
    survey = await addQuestion(app, admin, survey.id, { questionText: "Follow-up" });
    const source = findQuestion(survey, "Optional notes");
    const target = findQuestion(survey, "Follow-up");

    const updated = await addRule(app, admin, survey.id, {
      sourceQuestionId: source.id,
      sourceAnswerOptionId: null,
      conditionOperator: "is_blank",
      targetQuestionId: target.id,
      actionType: "HIDE_QUESTION",
      skipTargetInNormalFlow: true
    });

    expect(updated.conditionalLogicRules).toHaveLength(1);
    expect(updated.conditionalLogicRules[0]).toMatchObject({
      sourceQuestionId: source.id,
      sourceAnswerOptionId: null,
      conditionOperator: "is_blank",
      actionType: "HIDE_QUESTION",
      targetQuestionId: target.id,
      skipTargetInNormalFlow: false
    });
  });

  it("rejects blank-text rules for jump actions, selection sources, and source options", async () => {
    const admin = await registerAdmin(app);
    const survey = await surveyWithSourceAndTarget(admin);
    const source = findQuestion(survey, "Source");
    const target = findQuestion(survey, "Target");

    const jumpResponse = await request(app)
      .post(`/api/surveys/${survey.id}/rules`)
      .set("Cookie", admin.cookie)
      .send({
        sourceQuestionId: source.id,
        sourceAnswerOptionId: null,
        conditionOperator: "is_blank",
        targetQuestionId: target.id,
        actionType: "JUMP_TO_QUESTION"
      });

    expect(jumpResponse.status).toBe(400);
    expect(jumpResponse.body.error).toBe("Blank text rules can only skip questions");

    const selectionSourceResponse = await request(app)
      .post(`/api/surveys/${survey.id}/rules`)
      .set("Cookie", admin.cookie)
      .send({
        sourceQuestionId: source.id,
        sourceAnswerOptionId: null,
        conditionOperator: "is_blank",
        targetQuestionId: target.id,
        actionType: "HIDE_QUESTION"
      });

    expect(selectionSourceResponse.status).toBe(400);
    expect(selectionSourceResponse.body.error).toBe(
      "Blank text rules must use a text source question"
    );

    let textSurvey = await createDraftSurvey(app, admin, "Text survey");
    textSurvey = await addQuestion(app, admin, textSurvey.id, {
      questionText: "Optional notes",
      isRequired: false
    });
    textSurvey = await addQuestion(app, admin, textSurvey.id, { questionText: "Follow-up" });

    const sourceOptionResponse = await request(app)
      .post(`/api/surveys/${textSurvey.id}/rules`)
      .set("Cookie", admin.cookie)
      .send({
        sourceQuestionId: findQuestion(textSurvey, "Optional notes").id,
        sourceAnswerOptionId: source.answerOptions[0].id,
        conditionOperator: "is_blank",
        targetQuestionId: findQuestion(textSurvey, "Follow-up").id,
        actionType: "HIDE_QUESTION"
      });

    expect(sourceOptionResponse.status).toBe(400);
    expect(sourceOptionResponse.body.error).toBe(
      "Blank text rules cannot include a source answer option"
    );
  });

  it("converts a jump rule into a skip rule via update", async () => {
    const admin = await registerAdmin(app);
    const survey = await surveyWithSourceAndTarget(admin);
    const source = findQuestion(survey, "Source");
    const target = findQuestion(survey, "Target");

    const withRule = await addRule(app, admin, survey.id, {
      sourceQuestionId: source.id,
      sourceAnswerOptionId: source.answerOptions[0].id,
      targetQuestionId: target.id
    });
    const ruleId = withRule.conditionalLogicRules[0].id;

    const response = await request(app)
      .put(`/api/surveys/${survey.id}/rules/${ruleId}`)
      .set("Cookie", admin.cookie)
      .send({
        sourceQuestionId: source.id,
        sourceAnswerOptionId: source.answerOptions[0].id,
        targetQuestionId: target.id,
        actionType: "HIDE_QUESTION"
      });

    expect(response.status).toBe(200);
    expect(response.body.survey.conditionalLogicRules[0]).toMatchObject({
      actionType: "HIDE_QUESTION",
      skipTargetInNormalFlow: false
    });
  });

  it("rejects unsupported action types", async () => {
    const admin = await registerAdmin(app);
    const survey = await surveyWithSourceAndTarget(admin);
    const source = findQuestion(survey, "Source");

    const response = await request(app)
      .post(`/api/surveys/${survey.id}/rules`)
      .set("Cookie", admin.cookie)
      .send({
        sourceQuestionId: source.id,
        sourceAnswerOptionId: source.answerOptions[0].id,
        targetQuestionId: findQuestion(survey, "Target").id,
        actionType: "END_SURVEY"
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe(
      "Action type must be JUMP_TO_QUESTION, JUMP_TO_PAGE, or HIDE_QUESTION"
    );
  });

  it("rejects skip rules targeting the source question or earlier", async () => {
    const admin = await registerAdmin(app);
    const survey = await surveyWithSourceAndTarget(admin);
    const source = findQuestion(survey, "Source");

    const response = await request(app)
      .post(`/api/surveys/${survey.id}/rules`)
      .set("Cookie", admin.cookie)
      .send({
        sourceQuestionId: source.id,
        sourceAnswerOptionId: source.answerOptions[0].id,
        targetQuestionId: source.id,
        actionType: "HIDE_QUESTION"
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Target question must come after the source question");
  });
});

describe("question ordering", () => {
  it("inserts a question at a position and shifts later display orders", async () => {
    const admin = await registerAdmin(app);
    let survey = await createDraftSurvey(app, admin);
    survey = await addQuestion(app, admin, survey.id, { questionText: "First" });
    survey = await addQuestion(app, admin, survey.id, { questionText: "Second" });
    survey = await addQuestion(app, admin, survey.id, { questionText: "Third" });
    survey = await addQuestion(app, admin, survey.id, {
      questionText: "Inserted",
      displayOrder: 2
    });

    const ordered = [...survey.questions].sort((a, b) => a.displayOrder - b.displayOrder);

    expect(ordered.map((question) => question.questionText)).toEqual([
      "First",
      "Inserted",
      "Second",
      "Third"
    ]);
    expect(ordered.map((question) => question.displayOrder)).toEqual([1, 2, 3, 4]);
  });

  it("reorders questions to match the submitted id order", async () => {
    const admin = await registerAdmin(app);
    let survey = await createDraftSurvey(app, admin);
    survey = await addQuestion(app, admin, survey.id, { questionText: "A" });
    survey = await addQuestion(app, admin, survey.id, { questionText: "B" });
    survey = await addQuestion(app, admin, survey.id, { questionText: "C" });

    const idByText = new Map(survey.questions.map((question) => [question.questionText, question.id]));
    const response = await request(app)
      .patch(`/api/surveys/${survey.id}/questions/reorder`)
      .set("Cookie", admin.cookie)
      .send({ questionIds: [idByText.get("C"), idByText.get("A"), idByText.get("B")] });

    expect(response.status).toBe(200);

    const ordered = [...response.body.survey.questions].sort(
      (a: { displayOrder: number }, b: { displayOrder: number }) => a.displayOrder - b.displayOrder
    );

    expect(ordered.map((question: { questionText: string }) => question.questionText)).toEqual([
      "C",
      "A",
      "B"
    ]);
    expect(ordered.map((question: { displayOrder: number }) => question.displayOrder)).toEqual([
      1, 2, 3
    ]);
  });

  it("rejects reorders that do not include every question exactly once", async () => {
    const admin = await registerAdmin(app);
    let survey = await createDraftSurvey(app, admin);
    survey = await addQuestion(app, admin, survey.id, { questionText: "A" });
    survey = await addQuestion(app, admin, survey.id, { questionText: "B" });

    const response = await request(app)
      .patch(`/api/surveys/${survey.id}/questions/reorder`)
      .set("Cookie", admin.cookie)
      .send({ questionIds: [survey.questions[0].id] });

    expect(response.status).toBe(400);
  });
});

describe("destructive delete guards", () => {
  it("blocks question deletes outside draft status", async () => {
    const admin = await registerAdmin(app);
    const { survey, middleQuestion } = await createPublishedJumpSurvey(app, admin);

    const response = await request(app)
      .delete(`/api/surveys/${survey.id}/questions/${middleQuestion.id}`)
      .set("Cookie", admin.cookie);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe(
      "Survey structure can only be edited while the survey is a draft. Create an editable draft copy to make changes"
    );
  });

  it("blocks question deletes when saved responses exist, even on draft surveys", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const { survey, routeQuestion, stayOptionId } = await createPublishedJumpSurvey(app, admin);

    const started = await startAttempt(app, user, survey.id);
    await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: routeQuestion.id,
      selectedAnswerOptionIds: [stayOptionId]
    });

    // Defensive-path setup: the API blocks returning attempted surveys to
    // draft, so force the status directly to exercise the saved-response guard.
    const { pool } = await import("../src/db.js");
    await pool.query(`update surveys set status = 'draft' where id = $1`, [survey.id]);

    const response = await request(app)
      .delete(`/api/surveys/${survey.id}/questions/${routeQuestion.id}`)
      .set("Cookie", admin.cookie);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("Questions with saved responses cannot be deleted");
  });

  it("blocks returning surveys with attempts to draft", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const { survey } = await createPublishedJumpSurvey(app, admin);
    await startAttempt(app, user, survey.id);

    const response = await request(app)
      .patch(`/api/surveys/${survey.id}/status`)
      .set("Cookie", admin.cookie)
      .send({ status: "draft" });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("Surveys with attempts cannot be returned to draft");
  });
});

describe("status transitions", () => {
  it("publishes, retires, and republishes while preserving publishedAt", async () => {
    const admin = await registerAdmin(app);
    let survey = await createDraftSurvey(app, admin);
    survey = await addQuestion(app, admin, survey.id, { questionText: "Only question" });

    const published = await setSurveyStatus(app, admin, survey.id, "published");
    expect(published.status).toBe("published");
    expect(published.publishedAt).not.toBeNull();

    const retired = await setSurveyStatus(app, admin, survey.id, "retired");
    expect(retired.status).toBe("retired");
    expect(retired.publishedAt).toBe(published.publishedAt);
    expect(retired.retiredAt).not.toBeNull();

    const republished = await setSurveyStatus(app, admin, survey.id, "published");
    expect(republished.status).toBe("published");
    expect(republished.retiredAt).toBeNull();
  });
});

describe("published survey structural lock", () => {
  const lockedError =
    "Survey structure can only be edited while the survey is a draft. Create an editable draft copy to make changes";

  it("blocks every structural mutation on a published survey", async () => {
    const admin = await registerAdmin(app);
    const { survey, routeQuestion, jumpOptionId } = await createPublishedJumpSurvey(app, admin);
    const rule = survey.conditionalLogicRules[0];

    const attempts = [
      request(app)
        .post(`/api/surveys/${survey.id}/questions`)
        .set("Cookie", admin.cookie)
        .send({ questionText: "Late question", questionType: "text" }),
      request(app)
        .put(`/api/surveys/${survey.id}/questions/${routeQuestion.id}`)
        .set("Cookie", admin.cookie)
        .send({
          questionText: "Edited live",
          questionType: routeQuestion.questionType,
          isRequired: false,
          helpText: null
        }),
      request(app)
        .patch(`/api/surveys/${survey.id}/questions/reorder`)
        .set("Cookie", admin.cookie)
        .send({ questionIds: survey.questions.map((question) => question.id).reverse() }),
      request(app)
        .post(`/api/surveys/${survey.id}/questions/${routeQuestion.id}/options`)
        .set("Cookie", admin.cookie)
        .send({ optionText: "Late option" }),
      request(app)
        .put(`/api/surveys/${survey.id}/questions/${routeQuestion.id}/options/${jumpOptionId}`)
        .set("Cookie", admin.cookie)
        .send({ optionText: "Renamed live" }),
      request(app)
        .patch(`/api/surveys/${survey.id}/questions/${routeQuestion.id}/options/reorder`)
        .set("Cookie", admin.cookie)
        .send({
          optionIds: routeQuestion.answerOptions.map((option) => option.id).reverse()
        }),
      request(app)
        .post(
          `/api/surveys/${survey.id}/questions/${routeQuestion.id}/options/${jumpOptionId}/tags`
        )
        .set("Cookie", admin.cookie)
        .send({ tagKey: "late", tagValue: "tag" }),
      request(app)
        .post(`/api/surveys/${survey.id}/rules`)
        .set("Cookie", admin.cookie)
        .send({
          sourceQuestionId: rule.sourceQuestionId,
          sourceAnswerOptionId: rule.sourceAnswerOptionId,
          targetQuestionId: rule.targetQuestionId,
          skipTargetInNormalFlow: false
        }),
      request(app)
        .put(`/api/surveys/${survey.id}/rules/${rule.id}`)
        .set("Cookie", admin.cookie)
        .send({
          sourceQuestionId: rule.sourceQuestionId,
          sourceAnswerOptionId: rule.sourceAnswerOptionId,
          targetQuestionId: rule.targetQuestionId,
          skipTargetInNormalFlow: false
        }),
      request(app)
        .delete(`/api/surveys/${survey.id}/rules/${rule.id}`)
        .set("Cookie", admin.cookie)
    ];

    for (const attempt of attempts) {
      const response = await attempt;
      expect(response.status).toBe(409);
      expect(response.body.error).toBe(lockedError);
    }

    // The survey is untouched by the rejected mutations.
    const refetched = await request(app)
      .get(`/api/surveys/${survey.id}`)
      .set("Cookie", admin.cookie);
    expect(refetched.body.survey.questions).toHaveLength(survey.questions.length);
    expect(refetched.body.survey.conditionalLogicRules).toHaveLength(
      survey.conditionalLogicRules.length
    );
  });

  it("blocks structural mutations on retired surveys too", async () => {
    const admin = await registerAdmin(app);
    const { survey, routeQuestion } = await createPublishedJumpSurvey(app, admin);
    await setSurveyStatus(app, admin, survey.id, "retired");

    const response = await request(app)
      .put(`/api/surveys/${survey.id}/questions/${routeQuestion.id}`)
      .set("Cookie", admin.cookie)
      .send({
        questionText: "Edited retired",
        questionType: routeQuestion.questionType,
        isRequired: false,
        helpText: null
      });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe(lockedError);
  });

  it("still allows metadata, category, and status changes on published surveys", async () => {
    const admin = await registerAdmin(app);
    const { survey } = await createPublishedJumpSurvey(app, admin);

    const metadataResponse = await request(app)
      .put(`/api/surveys/${survey.id}`)
      .set("Cookie", admin.cookie)
      .send({
        title: "Renamed published survey",
        description: "Updated copy",
        status: "published"
      });

    expect(metadataResponse.status).toBe(200);
    expect(metadataResponse.body.survey.title).toBe("Renamed published survey");
    expect(metadataResponse.body.survey.status).toBe("published");

    const retired = await setSurveyStatus(app, admin, survey.id, "retired");
    expect(retired.status).toBe("retired");
  });
});
