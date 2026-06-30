import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import {
  addOption,
  addOtherTag,
  addQuestion,
  addTag,
  addValueTag,
  collectObjectKeys,
  completeAttempt,
  createDraftSurvey,
  createTagDefinition,
  findQuestion,
  registerAdmin,
  registerUser,
  setSurveyStatus,
  startAttempt,
  submitAnswer
} from "./helpers/factories.js";

const app = createApp();

describe("participant issue profile progress", () => {
  it("returns aggregate progress for authenticated start, resume, answer, and complete without exposing hidden tags", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const { survey, selectedQuestion, selectedOptionId, otherQuestion, valueQuestion } =
      await createPublishedIssueProfileSurvey(admin);

    const started = await startAttempt(app, user, survey.id);

    expect(started.issueProfileProgress).toEqual({
      fillPercent: 0,
      identifiedCategoryCount: 0,
      encounteredCategoryCount: 1,
      status: "empty"
    });
    expect(started.issueProfileEmojiCollection).toEqual({ items: [], totalCount: 0 });
    expectParticipantPayloadIsAggregateOnly(started);

    const afterSelected = await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: selectedQuestion.id,
      selectedAnswerOptionIds: [selectedOptionId]
    });

    expect(afterSelected.issueProfileProgress).toMatchObject({
      identifiedCategoryCount: 1,
      encounteredCategoryCount: 2,
      status: "building"
    });
    expect(afterSelected.issueProfileProgress.fillPercent).toBeGreaterThan(0);
    expect(afterSelected.issueProfileEmojiCollection).toEqual({
      items: [{ emoji: "😡", count: 1 }],
      totalCount: 1
    });
    expectParticipantPayloadIsAggregateOnly(afterSelected);

    const resume = await request(app)
      .get(`/api/my-surveys/${started.attempt.id}`)
      .set("Cookie", user.cookie);

    expect(resume.status).toBe(200);
    expect(resume.body.issueProfileProgress).toEqual(afterSelected.issueProfileProgress);
    expect(resume.body.issueProfileEmojiCollection).toEqual(afterSelected.issueProfileEmojiCollection);
    expectParticipantPayloadIsAggregateOnly(resume.body);

    const afterOther = await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: otherQuestion.id,
      isOtherSelected: true,
      otherText: "Communication support"
    });

    expect(afterOther.issueProfileProgress).toMatchObject({
      identifiedCategoryCount: 2,
      encounteredCategoryCount: 3,
      status: "building"
    });
    expect(afterOther.issueProfileEmojiCollection.items).toEqual(
      expect.arrayContaining([
        { emoji: "😡", count: 1 },
        { emoji: "😤", count: 1 }
      ])
    );
    expect(afterOther.issueProfileEmojiCollection.items).toHaveLength(2);
    expect(afterOther.issueProfileEmojiCollection.totalCount).toBe(2);

    const afterValue = await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: valueQuestion.id,
      answerInteger: 7
    });

    expect(afterValue.issueProfileProgress).toMatchObject({
      identifiedCategoryCount: 3,
      encounteredCategoryCount: 3,
      status: "building"
    });
    expect(afterValue.issueProfileEmojiCollection.items).toEqual(
      expect.arrayContaining([
        { emoji: "👎", count: 1 },
        { emoji: "😡", count: 1 },
        { emoji: "😤", count: 1 }
      ])
    );
    expect(afterValue.issueProfileEmojiCollection.items).toHaveLength(3);
    expect(afterValue.issueProfileEmojiCollection.totalCount).toBe(3);
    expect(afterValue.isCompleteReady).toBe(true);

    const completed = await completeAttempt(app, user, survey.id, started.attempt.id);

    expect(completed.issueProfileProgress).toEqual({
      fillPercent: 100,
      identifiedCategoryCount: 3,
      encounteredCategoryCount: 3,
      status: "complete"
    });
    expect(completed.issueProfileEmojiCollection.totalCount).toBe(3);
    expectParticipantPayloadIsAggregateOnly(completed);
  });

  it("keeps completed no-tag authenticated attempts at zero fill", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    let survey = await createDraftSurvey(app, admin, "No issue profile tags");
    survey = await addQuestion(app, admin, survey.id, { questionText: "Describe access" });
    survey = await setSurveyStatus(app, admin, survey.id, "published");
    const question = findQuestion(survey, "Describe access");

    const started = await startAttempt(app, user, survey.id);
    await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: question.id,
      answerText: "No barrier reported"
    });
    const completed = await completeAttempt(app, user, survey.id, started.attempt.id);

    expect(completed.issueProfileProgress).toEqual({
      fillPercent: 0,
      identifiedCategoryCount: 0,
      encounteredCategoryCount: 0,
      status: "complete_empty"
    });
    expect(completed.issueProfileEmojiCollection).toEqual({ items: [], totalCount: 0 });
  });

  it("drops aggregate progress when a tagged answer is changed to an untagged answer", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const { survey, selectedQuestion, selectedOptionId, untaggedOptionId } =
      await createPublishedIssueProfileSurvey(admin);

    const started = await startAttempt(app, user, survey.id);
    const afterTagged = await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: selectedQuestion.id,
      selectedAnswerOptionIds: [selectedOptionId]
    });

    expect(afterTagged.issueProfileProgress.identifiedCategoryCount).toBe(1);
    expect(afterTagged.issueProfileProgress.fillPercent).toBeGreaterThan(0);

    const afterUntagged = await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: selectedQuestion.id,
      selectedAnswerOptionIds: [untaggedOptionId]
    });

    expect(afterUntagged.issueProfileProgress).toEqual({
      fillPercent: 0,
      identifiedCategoryCount: 0,
      encounteredCategoryCount: 2,
      status: "empty"
    });
    expect(afterUntagged.issueProfileEmojiCollection).toEqual({ items: [], totalCount: 0 });
    expectParticipantPayloadIsAggregateOnly(afterUntagged);
  });

  it("returns aggregate progress for anonymous start, answer, and complete without exposing hidden tags", async () => {
    const admin = await registerAdmin(app);
    let survey = await createDraftSurvey(app, admin, "Anonymous issue profile");
    survey = await addQuestion(app, admin, survey.id, {
      questionText: "Choose",
      questionType: "single_select"
    });
    const question = findQuestion(survey, "Choose");
    survey = await addOption(app, admin, survey.id, question.id, "Yes");
    const option = findQuestion(survey, "Choose").answerOptions[0];
    await createTagDefinition(
      app,
      admin,
      "anonymous_accessibility_signal",
      "anonymous_hidden_value",
      "😡"
    );
    survey = await addTag(
      app,
      admin,
      survey.id,
      question.id,
      option.id,
      "anonymous_accessibility_signal",
      "anonymous_hidden_value"
    );
    survey = await setSurveyStatus(app, admin, survey.id, "published");
    const link = await createAnonymousLink(admin.cookie, survey.id);

    const started = await request(app).post(`/api/anonymous-surveys/${link.token}/start`).send({});

    expect(started.status).toBe(201);
    expect(started.body.issueProfileProgress).toEqual({
      fillPercent: 0,
      identifiedCategoryCount: 0,
      encounteredCategoryCount: 1,
      status: "empty"
    });
    expect(started.body.issueProfileEmojiCollection).toEqual({ items: [], totalCount: 0 });
    expectParticipantPayloadIsAggregateOnly(started.body);

    const answer = await request(app)
      .post(`/api/anonymous-surveys/${link.token}/answer`)
      .send({
        attemptAccessToken: started.body.attemptAccessToken,
        attemptId: started.body.attempt.id,
        questionId: question.id,
        selectedAnswerOptionIds: [option.id]
      });

    expect(answer.status).toBe(200);
    expect(answer.body.issueProfileProgress).toMatchObject({
      identifiedCategoryCount: 1,
      encounteredCategoryCount: 1,
      status: "building"
    });
    expect(answer.body.issueProfileEmojiCollection).toEqual({
      items: [{ emoji: "😡", count: 1 }],
      totalCount: 1
    });
    expectParticipantPayloadIsAggregateOnly(answer.body);

    const completed = await request(app)
      .post(`/api/anonymous-surveys/${link.token}/complete`)
      .send({
        attemptAccessToken: started.body.attemptAccessToken,
        attemptId: started.body.attempt.id
      });

    expect(completed.status).toBe(200);
    expect(completed.body.issueProfileProgress).toEqual({
      fillPercent: 100,
      identifiedCategoryCount: 1,
      encounteredCategoryCount: 1,
      status: "complete"
    });
    expect(completed.body.issueProfileEmojiCollection).toEqual({
      items: [{ emoji: "😡", count: 1 }],
      totalCount: 1
    });
    expectParticipantPayloadIsAggregateOnly(completed.body);
  });
});

async function createPublishedIssueProfileSurvey(admin: Awaited<ReturnType<typeof registerAdmin>>) {
  let survey = await createDraftSurvey(app, admin, "Issue profile aggregate");
  survey = await addQuestion(app, admin, survey.id, {
    questionText: "Selected issue",
    questionType: "single_select"
  });
  survey = await addQuestion(app, admin, survey.id, {
    allowOther: true,
    questionText: "Other issue",
    questionType: "single_select"
  });
  survey = await addQuestion(app, admin, survey.id, {
    questionText: "Issue count",
    questionType: "integer"
  });

  const selectedQuestion = findQuestion(survey, "Selected issue");
  survey = await addOption(app, admin, survey.id, selectedQuestion.id, "Tagged");
  survey = await addOption(app, admin, survey.id, selectedQuestion.id, "Untagged");
  const selectedOptions = findQuestion(survey, "Selected issue").answerOptions;
  const selectedOption = selectedOptions.find((option) => option.optionText === "Tagged");
  const untaggedOption = selectedOptions.find((option) => option.optionText === "Untagged");

  if (!selectedOption || !untaggedOption) {
    throw new Error("Issue profile selected options were not created");
  }

  await createTagDefinition(
    app,
    admin,
    "selected_accessibility_signal",
    "selected_hidden_value",
    "😡"
  );
  survey = await addTag(
    app,
    admin,
    survey.id,
    selectedQuestion.id,
    selectedOption.id,
    "selected_accessibility_signal",
    "selected_hidden_value"
  );

  const otherQuestion = findQuestion(survey, "Other issue");
  survey = await addOption(app, admin, survey.id, otherQuestion.id, "No");
  await createTagDefinition(app, admin, "other_communication_signal", "other_hidden_value", "😤");
  survey = await addOtherTag(
    app,
    admin,
    survey.id,
    otherQuestion.id,
    "other_communication_signal",
    "other_hidden_value"
  );

  const valueQuestion = findQuestion(survey, "Issue count");
  await createTagDefinition(app, admin, "value_program_signal", "value_hidden_value", "👎");
  survey = await addValueTag(app, admin, survey.id, valueQuestion.id, {
    integerMin: 5,
    integerMax: null,
    tagKey: "value_program_signal",
    tagValue: "value_hidden_value"
  });
  survey = await setSurveyStatus(app, admin, survey.id, "published");

  return {
    survey,
    selectedQuestion: findQuestion(survey, "Selected issue"),
    selectedOptionId: selectedOption.id,
    untaggedOptionId: untaggedOption.id,
    otherQuestion: findQuestion(survey, "Other issue"),
    valueQuestion: findQuestion(survey, "Issue count")
  };
}

async function createAnonymousLink(
  cookie: string,
  surveyId: number
): Promise<{ link: { id: number; publicUrl: string }; token: string }> {
  const response = await request(app)
    .post(`/api/surveys/${surveyId}/anonymous-links`)
    .set("Cookie", cookie)
    .send({});

  if (response.status !== 201) {
    throw new Error(`Anonymous link create failed with ${response.status}: ${JSON.stringify(response.body)}`);
  }

  const publicUrl = response.body.link.publicUrl as string;
  const token = publicUrl.split("/").at(-1);

  if (!token) {
    throw new Error(`Could not parse anonymous token from ${publicUrl}`);
  }

  return { link: response.body.link, token };
}

function expectParticipantPayloadIsAggregateOnly(payload: unknown) {
  const keys = collectObjectKeys(payload);
  const json = JSON.stringify(payload);

  expect(keys.has("answerTags")).toBe(false);
  expect(keys.has("valueTags")).toBe(false);
  expect(keys.has("otherTags")).toBe(false);
  expect(keys.has("tagKey")).toBe(false);
  expect(keys.has("tagValue")).toBe(false);
  expect(json).not.toContain("selected_accessibility_signal");
  expect(json).not.toContain("other_communication_signal");
  expect(json).not.toContain("value_program_signal");
  expect(json).not.toContain("anonymous_accessibility_signal");
  expect(json).not.toContain("hidden_value");
}
