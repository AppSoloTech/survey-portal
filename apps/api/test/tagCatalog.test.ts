import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import {
  addOption,
  addOtherTag,
  addQuestion,
  addTag,
  addValueTag,
  createDraftSurvey,
  createTagDefinition,
  findQuestion,
  registerAdmin,
  registerUser,
  setSurveyStatus,
  startAttempt,
  submitAnswer,
  completeAttempt,
  uniqueEmail
} from "./helpers/factories.js";

const app = createApp();

let tagCounter = 0;

function uniquePair(prefix = "key"): { tagKey: string; tagValue: string } {
  tagCounter += 1;
  const slug = uniqueEmail(prefix).split("@")[0];
  return { tagKey: `${slug}`, tagValue: `value-${tagCounter}` };
}

async function createTagGroup(
  admin: { cookie: string },
  name = `Group ${uniqueEmail("tag-group").split("@")[0]}`
): Promise<{ id: number; name: string; displayOrder: number }> {
  const response = await request(app).post("/api/tags/groups").set("Cookie", admin.cookie).send({ name });

  if (response.status !== 201) {
    throw new Error(`Tag group create failed with ${response.status}: ${JSON.stringify(response.body)}`);
  }

  return response.body.group as { id: number; name: string; displayOrder: number };
}

async function fetchAdminSurvey(admin: { cookie: string }, surveyId: number) {
  const response = await request(app).get(`/api/surveys/${surveyId}`).set("Cookie", admin.cookie);

  if (response.status !== 200) {
    throw new Error(`Survey fetch failed with ${response.status}: ${JSON.stringify(response.body)}`);
  }

  return response.body.survey as Awaited<ReturnType<typeof createDraftSurvey>>;
}

function tagValues(tags: Array<{ tagKey: string; tagValue: string }> | undefined, tagKey: string): string[] {
  return (tags ?? [])
    .filter((tag) => tag.tagKey === tagKey)
    .map((tag) => tag.tagValue)
    .sort();
}

describe("tag catalog", () => {
  it("rejects non-admin access to every catalog route", async () => {
    const user = await registerUser(app);

    const listResponse = await request(app).get("/api/tags").set("Cookie", user.cookie);
    expect(listResponse.status).toBe(403);

    const createResponse = await request(app)
      .post("/api/tags")
      .set("Cookie", user.cookie)
      .send({ tagKey: "k", tagValue: "v" });
    expect(createResponse.status).toBe(403);

    const updateResponse = await request(app)
      .put("/api/tags/1")
      .set("Cookie", user.cookie)
      .send({ tagKey: "k", tagValue: "v" });
    expect(updateResponse.status).toBe(403);

    const deleteResponse = await request(app).delete("/api/tags/1").set("Cookie", user.cookie);
    expect(deleteResponse.status).toBe(403);

    const createGroupResponse = await request(app)
      .post("/api/tags/groups")
      .set("Cookie", user.cookie)
      .send({ name: "Group" });
    expect(createGroupResponse.status).toBe(403);

    const updateGroupResponse = await request(app)
      .put("/api/tags/groups/1")
      .set("Cookie", user.cookie)
      .send({ name: "Group" });
    expect(updateGroupResponse.status).toBe(403);

    const reorderGroupsResponse = await request(app)
      .put("/api/tags/groups/reorder")
      .set("Cookie", user.cookie)
      .send({ groupIds: [1] });
    expect(reorderGroupsResponse.status).toBe(403);

    const reorderSectionsResponse = await request(app)
      .put("/api/tags/sections/reorder")
      .set("Cookie", user.cookie)
      .send({ sectionIds: ["ungrouped", "group:1"] });
    expect(reorderSectionsResponse.status).toBe(403);

    const deleteGroupResponse = await request(app)
      .delete("/api/tags/groups/1")
      .set("Cookie", user.cookie);
    expect(deleteGroupResponse.status).toBe(403);

    const reorderTagsResponse = await request(app)
      .put("/api/tags/reorder")
      .set("Cookie", user.cookie)
      .send({ groupId: null, tagIds: [1] });
    expect(reorderTagsResponse.status).toBe(403);

    const categoryEmojiResponse = await request(app)
      .put("/api/tags/category-emoji")
      .set("Cookie", user.cookie)
      .send({ emoji: "😫", tagKey: "Equity" });
    expect(categoryEmojiResponse.status).toBe(403);

    const moveTagResponse = await request(app)
      .patch("/api/tags/1/group")
      .set("Cookie", user.cookie)
      .send({ groupId: null, displayOrder: 1 });
    expect(moveTagResponse.status).toBe(403);
  });

  it("creates, lists, updates, and deletes catalog entries", async () => {
    const admin = await registerAdmin(app);
    const pair = uniquePair();
    const tag = await createTagDefinition(app, admin, pair.tagKey, pair.tagValue);

    expect(tag).toMatchObject({ id: expect.any(Number), ...pair });

    const listResponse = await request(app).get("/api/tags").set("Cookie", admin.cookie);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.tags.some((item: { id: number }) => item.id === tag.id)).toBe(true);
    expect(listResponse.body.ungroupedTags.some((item: { id: number }) => item.id === tag.id)).toBe(
      true
    );

    const updateResponse = await request(app)
      .put(`/api/tags/${tag.id}`)
      .set("Cookie", admin.cookie)
      .send({ tagKey: pair.tagKey, tagValue: `${pair.tagValue}-edited` });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.tag.tagValue).toBe(`${pair.tagValue}-edited`);

    const deleteResponse = await request(app)
      .delete(`/api/tags/${tag.id}`)
      .set("Cookie", admin.cookie);
    expect(deleteResponse.status).toBe(200);

    const finalList = await request(app).get("/api/tags").set("Cookie", admin.cookie);
    expect(finalList.body.tags.some((item: { id: number }) => item.id === tag.id)).toBe(false);
  });

  it("propagates new catalog values to hidden tag all subscriptions and submitted answers", async () => {
    const admin = await registerAdmin(app);
    let survey = await createDraftSurvey(app, admin, "Hidden all propagation survey");
    survey = await addQuestion(app, admin, survey.id, {
      questionText: "Which department do you work in?",
      questionType: "single_select"
    });
    const question = findQuestion(survey, "Which department do you work in?");
    survey = await addOption(app, admin, survey.id, question.id, "Engineering");
    const option = findQuestion(survey, "Which department do you work in?").answerOptions[0];

    await createTagDefinition(app, admin, "Equity", "baseline_a");
    await createTagDefinition(app, admin, "Equity", "baseline_b");
    const bindingResponse = await request(app)
      .post(`/api/surveys/${survey.id}/questions/${question.id}/options/${option.id}/tags/all`)
      .set("Cookie", admin.cookie)
      .send({ tagKey: "Equity" });
    expect(bindingResponse.status).toBe(201);
    survey = bindingResponse.body.survey;

    const boundOption = findQuestion(survey, "Which department do you work in?").answerOptions[0];
    expect(boundOption.answerTagAllBindings).toEqual([
      expect.objectContaining({ tagKey: "Equity" })
    ]);
    expect(boundOption.answerTags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tagKey: "Equity", tagValue: "baseline_a", isManual: false }),
        expect.objectContaining({ tagKey: "Equity", tagValue: "baseline_b", isManual: false })
      ])
    );
    expect(boundOption.answerTags?.some((tag) => tag.tagValue === "All")).toBe(false);

    survey = await setSurveyStatus(app, admin, survey.id, "published");

    const user = await registerUser(app);
    const started = await startAttempt(app, user, survey.id);
    await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: question.id,
      selectedAnswerOptionIds: [option.id]
    });
    await completeAttempt(app, user, survey.id, started.attempt.id);

    await createTagDefinition(app, admin, "Equity", "test_1");

    const detail = await request(app)
      .get(`/api/surveys/${survey.id}/attempts/${started.attempt.id}`)
      .set("Cookie", admin.cookie);
    expect(detail.status).toBe(200);
    const answer = detail.body.answers.find(
      (candidate: { questionText: string }) =>
        candidate.questionText === "Which department do you work in?"
    );
    expect(answer.selectedOptions[0].hiddenTags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tagKey: "Equity", tagValue: "baseline_a" }),
        expect.objectContaining({ tagKey: "Equity", tagValue: "baseline_b" }),
        expect.objectContaining({ tagKey: "Equity", tagValue: "test_1" })
      ])
    );
    expect(
      answer.selectedOptions[0].hiddenTags.some(
        (tag: { tagKey: string; tagValue: string }) => tag.tagKey === "Equity" && tag.tagValue === "All"
      )
    ).toBe(false);

    const adminSurvey = await request(app).get(`/api/surveys/${survey.id}`).set("Cookie", admin.cookie);
    const propagatedOption = adminSurvey.body.survey.questions
      .find(
        (candidate: { questionText: string }) =>
          candidate.questionText === "Which department do you work in?"
      )
      .answerOptions.find((candidate: { optionText: string }) => candidate.optionText === "Engineering");
    expect(propagatedOption.answerTags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tagKey: "Equity", tagValue: "test_1", isManual: false })
      ])
    );
    expect(propagatedOption.answerTagAllBindings).toEqual([
      expect.objectContaining({ tagKey: "Equity" })
    ]);
  });

  it("propagates new catalog values to value-tag and Other hidden-tag subscriptions", async () => {
    const admin = await registerAdmin(app);
    let survey = await createDraftSurvey(app, admin, "Hidden all value and other survey");
    survey = await addQuestion(app, admin, survey.id, {
      questionText: "Score",
      questionType: "integer"
    });
    survey = await addQuestion(app, admin, survey.id, {
      questionText: "Choice",
      questionType: "single_select",
      allowOther: true
    });
    const score = findQuestion(survey, "Score");
    const choice = findQuestion(survey, "Choice");
    survey = await addOption(app, admin, survey.id, choice.id, "Standard");
    const standardOption = findQuestion(survey, "Choice").answerOptions[0];

    await createTagDefinition(app, admin, "Risk", "baseline");
    await createTagDefinition(app, admin, "OtherSignal", "baseline");

    const valueBinding = await request(app)
      .post(`/api/surveys/${survey.id}/questions/${score.id}/value-tags/all`)
      .set("Cookie", admin.cookie)
      .send({ tagKey: "Risk", integerMin: 5, integerMax: 10 });
    expect(valueBinding.status).toBe(201);

    const otherBinding = await request(app)
      .post(`/api/surveys/${survey.id}/questions/${choice.id}/other-tags/all`)
      .set("Cookie", admin.cookie)
      .send({ tagKey: "OtherSignal" });
    expect(otherBinding.status).toBe(201);

    survey = await setSurveyStatus(app, admin, survey.id, "published");
    const user = await registerUser(app);
    const started = await startAttempt(app, user, survey.id);
    await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: score.id,
      answerInteger: 7
    });
    await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: choice.id,
      selectedAnswerOptionIds: [standardOption.id]
    });
    await completeAttempt(app, user, survey.id, started.attempt.id);

    await createTagDefinition(app, admin, "Risk", "later");
    await createTagDefinition(app, admin, "OtherSignal", "later");

    const updatedSurvey = await fetchAdminSurvey(admin, survey.id);
    const updatedScore = findQuestion(updatedSurvey, "Score");
    const updatedChoice = findQuestion(updatedSurvey, "Choice");

    expect(updatedScore.valueTagAllBindings).toEqual([
      expect.objectContaining({
        tagKey: "Risk",
        integerMin: 5,
        integerMax: 10
      })
    ]);
    expect(updatedScore.valueTags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tagKey: "Risk",
          tagValue: "later",
          integerMin: 5,
          integerMax: 10,
          isManual: false
        })
      ])
    );
    expect(updatedChoice.otherTagAllBindings).toEqual([
      expect.objectContaining({ tagKey: "OtherSignal" })
    ]);
    expect(updatedChoice.otherTags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tagKey: "OtherSignal", tagValue: "later", isManual: false })
      ])
    );

    const detail = await request(app)
      .get(`/api/surveys/${survey.id}/attempts/${started.attempt.id}`)
      .set("Cookie", admin.cookie);
    expect(detail.status).toBe(200);
    const scoreAnswer = detail.body.answers.find(
      (answer: { questionText: string }) => answer.questionText === "Score"
    );
    expect(scoreAnswer.valueTags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tagKey: "Risk", tagValue: "baseline" }),
        expect.objectContaining({ tagKey: "Risk", tagValue: "later" })
      ])
    );
  });

  it("syncs catalog value rename and delete through hidden tag all subscriptions", async () => {
    const admin = await registerAdmin(app);
    let survey = await createDraftSurvey(app, admin, "Hidden all catalog lifecycle survey");
    survey = await addQuestion(app, admin, survey.id, {
      questionText: "Pick",
      questionType: "single_select"
    });
    const question = findQuestion(survey, "Pick");
    survey = await addOption(app, admin, survey.id, question.id, "Yes");
    const option = findQuestion(survey, "Pick").answerOptions[0];

    await createTagDefinition(app, admin, "Lifecycle", "stable");
    const changing = await createTagDefinition(app, admin, "Lifecycle", "old");
    const bindingResponse = await request(app)
      .post(`/api/surveys/${survey.id}/questions/${question.id}/options/${option.id}/tags/all`)
      .set("Cookie", admin.cookie)
      .send({ tagKey: "Lifecycle" });
    expect(bindingResponse.status).toBe(201);

    const renameResponse = await request(app)
      .put(`/api/tags/${changing.id}`)
      .set("Cookie", admin.cookie)
      .send({ tagKey: "Lifecycle", tagValue: "renamed", emoji: null });
    expect(renameResponse.status).toBe(200);

    let updatedSurvey = await fetchAdminSurvey(admin, survey.id);
    let updatedOption = findQuestion(updatedSurvey, "Pick").answerOptions[0];
    expect(tagValues(updatedOption.answerTags, "Lifecycle")).toEqual(["renamed", "stable"]);
    expect(updatedOption.answerTags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tagKey: "Lifecycle", tagValue: "renamed", isManual: false })
      ])
    );

    const deleteResponse = await request(app)
      .delete(`/api/tags/${changing.id}`)
      .set("Cookie", admin.cookie);
    expect(deleteResponse.status).toBe(200);

    updatedSurvey = await fetchAdminSurvey(admin, survey.id);
    updatedOption = findQuestion(updatedSurvey, "Pick").answerOptions[0];
    expect(tagValues(updatedOption.answerTags, "Lifecycle")).toEqual(["stable"]);
    expect(updatedOption.answerTagAllBindings).toEqual([
      expect.objectContaining({ tagKey: "Lifecycle" })
    ]);
  });

  it("stops hidden tag all subscriptions without deleting manual hidden tags", async () => {
    const admin = await registerAdmin(app);
    let survey = await createDraftSurvey(app, admin, "Hidden all stop survey");
    survey = await addQuestion(app, admin, survey.id, {
      questionText: "Pick",
      questionType: "single_select"
    });
    const question = findQuestion(survey, "Pick");
    survey = await addOption(app, admin, survey.id, question.id, "Yes");
    const option = findQuestion(survey, "Pick").answerOptions[0];

    await createTagDefinition(app, admin, "StopCat", "inherited-only");
    await createTagDefinition(app, admin, "StopCat", "manual-too");
    const bindingResponse = await request(app)
      .post(`/api/surveys/${survey.id}/questions/${question.id}/options/${option.id}/tags/all`)
      .set("Cookie", admin.cookie)
      .send({ tagKey: "StopCat" });
    expect(bindingResponse.status).toBe(201);

    let updatedOption = findQuestion(bindingResponse.body.survey, "Pick").answerOptions[0];
    const manualCandidate = updatedOption.answerTags?.find(
      (tag: { tagKey: string; tagValue: string }) =>
        tag.tagKey === "StopCat" && tag.tagValue === "manual-too"
    );
    expect(manualCandidate).toBeDefined();

    const manualUpdate = await request(app)
      .put(
        `/api/surveys/${survey.id}/questions/${question.id}/options/${option.id}/tags/${manualCandidate?.id}`
      )
      .set("Cookie", admin.cookie)
      .send({ tagKey: "StopCat", tagValue: "manual-too" });
    expect(manualUpdate.status).toBe(200);
    updatedOption = findQuestion(manualUpdate.body.survey, "Pick").answerOptions[0];
    expect(
      updatedOption.answerTags?.find(
        (tag: { tagKey: string; tagValue: string }) =>
          tag.tagKey === "StopCat" && tag.tagValue === "manual-too"
      )
    ).toEqual(expect.objectContaining({ isManual: true }));

    const downgradeResponse = await request(app)
      .delete(
        `/api/surveys/${survey.id}/questions/${question.id}/options/${option.id}/tags/${manualCandidate?.id}`
      )
      .set("Cookie", admin.cookie);
    expect(downgradeResponse.status).toBe(200);
    updatedOption = findQuestion(downgradeResponse.body.survey, "Pick").answerOptions[0];
    expect(
      updatedOption.answerTags?.find(
        (tag: { tagKey: string; tagValue: string }) =>
          tag.tagKey === "StopCat" && tag.tagValue === "manual-too"
      )
    ).toEqual(expect.objectContaining({ isManual: false }));

    const redoneManual = updatedOption.answerTags?.find(
      (tag: { tagKey: string; tagValue: string }) =>
        tag.tagKey === "StopCat" && tag.tagValue === "manual-too"
    );
    const restoreManualResponse = await request(app)
      .put(
        `/api/surveys/${survey.id}/questions/${question.id}/options/${option.id}/tags/${redoneManual?.id}`
      )
      .set("Cookie", admin.cookie)
      .send({ tagKey: "StopCat", tagValue: "manual-too" });
    expect(restoreManualResponse.status).toBe(200);

    const stopResponse = await request(app)
      .delete(`/api/surveys/${survey.id}/questions/${question.id}/options/${option.id}/tags/all`)
      .set("Cookie", admin.cookie)
      .send({ tagKey: "StopCat" });
    expect(stopResponse.status).toBe(200);

    updatedOption = findQuestion(stopResponse.body.survey, "Pick").answerOptions[0];
    expect(tagValues(updatedOption.answerTags, "StopCat")).toEqual(["manual-too"]);
    expect(updatedOption.answerTags).toEqual([
      expect.objectContaining({ tagKey: "StopCat", tagValue: "manual-too", isManual: true })
    ]);
    expect(updatedOption.answerTagAllBindings).toEqual([]);
  });

  it("creates, renames, reorders, and deletes tag groups", async () => {
    const admin = await registerAdmin(app);
    const firstGroup = await createTagGroup(admin, "Alpha");
    const secondGroup = await createTagGroup(admin, "Beta");

    const renameResponse = await request(app)
      .put(`/api/tags/groups/${firstGroup.id}`)
      .set("Cookie", admin.cookie)
      .send({ name: "Alpha renamed" });
    expect(renameResponse.status).toBe(200);
    expect(renameResponse.body.group.name).toBe("Alpha renamed");

    const reorderResponse = await request(app)
      .put("/api/tags/groups/reorder")
      .set("Cookie", admin.cookie)
      .send({ groupIds: [secondGroup.id, firstGroup.id] });
    expect(reorderResponse.status).toBe(200);
    expect(reorderResponse.body.groups.map((group: { id: number }) => group.id)).toEqual([
      secondGroup.id,
      firstGroup.id
    ]);

    const deleteResponse = await request(app)
      .delete(`/api/tags/groups/${secondGroup.id}`)
      .set("Cookie", admin.cookie);
    expect(deleteResponse.status).toBe(200);

    const finalList = await request(app).get("/api/tags").set("Cookie", admin.cookie);
    expect(finalList.body.groups.map((group: { id: number }) => group.id)).toEqual([firstGroup.id]);
    expect(finalList.body.groups[0].displayOrder).toBe(1);
  });

  it("persists the ungrouped catalog section order with tag categories", async () => {
    const admin = await registerAdmin(app);
    const firstGroup = await createTagGroup(admin, "Section Alpha");
    const secondGroup = await createTagGroup(admin, "Section Beta");

    const reorderResponse = await request(app)
      .put("/api/tags/sections/reorder")
      .set("Cookie", admin.cookie)
      .send({ sectionIds: [`group:${secondGroup.id}`, "ungrouped", `group:${firstGroup.id}`] });

    expect(reorderResponse.status).toBe(200);
    expect(reorderResponse.body.ungroupedDisplayOrder).toBe(2);
    expect(
      reorderResponse.body.groups.map((group: { displayOrder: number; id: number }) => ({
        displayOrder: group.displayOrder,
        id: group.id
      }))
    ).toEqual([
      { displayOrder: 1, id: secondGroup.id },
      { displayOrder: 3, id: firstGroup.id }
    ]);

    const listResponse = await request(app).get("/api/tags").set("Cookie", admin.cookie);
    expect(listResponse.body.ungroupedDisplayOrder).toBe(2);
    expect(listResponse.body.groups.map((group: { id: number }) => group.id)).toEqual([
      secondGroup.id,
      firstGroup.id
    ]);
  });

  it("rejects catalog section reorder payloads missing ungrouped or a category", async () => {
    const admin = await registerAdmin(app);
    const firstGroup = await createTagGroup(admin, "Required section A");
    await createTagGroup(admin, "Required section B");

    const missingUngrouped = await request(app)
      .put("/api/tags/sections/reorder")
      .set("Cookie", admin.cookie)
      .send({ sectionIds: [`group:${firstGroup.id}`] });
    expect(missingUngrouped.status).toBe(400);
    expect(missingUngrouped.body.error).toBe("sectionIds must include ungrouped exactly once");

    const missingCategory = await request(app)
      .put("/api/tags/sections/reorder")
      .set("Cookie", admin.cookie)
      .send({ sectionIds: ["ungrouped", `group:${firstGroup.id}`] });
    expect(missingCategory.status).toBe(400);
    expect(missingCategory.body.error).toBe("sectionIds must include every tag category exactly once");
  });

  it("creates tags with and without group assignment", async () => {
    const admin = await registerAdmin(app);
    const group = await createTagGroup(admin, "Private bucket");
    const groupedPair = uniquePair("grouped");
    const ungroupedPair = uniquePair("ungrouped");

    const groupedResponse = await request(app)
      .post("/api/tags")
      .set("Cookie", admin.cookie)
      .send({ ...groupedPair, groupId: group.id });
    expect(groupedResponse.status).toBe(201);
    expect(groupedResponse.body.tag.groupId).toBe(group.id);
    expect(groupedResponse.body.tag.displayOrder).toBe(1);

    const ungroupedResponse = await request(app)
      .post("/api/tags")
      .set("Cookie", admin.cookie)
      .send(ungroupedPair);
    expect(ungroupedResponse.status).toBe(201);
    expect(ungroupedResponse.body.tag.groupId).toBeNull();

    const listResponse = await request(app).get("/api/tags").set("Cookie", admin.cookie);
    expect(listResponse.body.groups[0].tags).toEqual([
      expect.objectContaining({ tagKey: groupedPair.tagKey, tagValue: groupedPair.tagValue })
    ]);
    expect(listResponse.body.ungroupedTags).toEqual([
      expect.objectContaining({ tagKey: ungroupedPair.tagKey, tagValue: ungroupedPair.tagValue })
    ]);
  });

  it("applies and clears an emoji across an existing tag category", async () => {
    const admin = await registerAdmin(app);
    const categoryKey = uniqueEmail("category-emoji").split("@")[0];
    const first = await createTagDefinition(app, admin, categoryKey, "first");
    const second = await createTagDefinition(app, admin, categoryKey, "second");
    const unrelated = await createTagDefinition(app, admin, `${categoryKey}-other`, "first", "🙂");

    const applyResponse = await request(app)
      .put("/api/tags/category-emoji")
      .set("Cookie", admin.cookie)
      .send({ emoji: "😫", tagKey: categoryKey });

    expect(applyResponse.status).toBe(200);
    expect(applyResponse.body.tags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: first.id, emoji: "😫" }),
        expect.objectContaining({ id: second.id, emoji: "😫" }),
        expect.objectContaining({ id: unrelated.id, emoji: "🙂" })
      ])
    );

    const clearResponse = await request(app)
      .put("/api/tags/category-emoji")
      .set("Cookie", admin.cookie)
      .send({ emoji: null, tagKey: categoryKey });

    expect(clearResponse.status).toBe(200);
    expect(clearResponse.body.tags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: first.id, emoji: null }),
        expect.objectContaining({ id: second.id, emoji: null }),
        expect.objectContaining({ id: unrelated.id, emoji: "🙂" })
      ])
    );
  });

  it("preserves a tag group when editing category and value", async () => {
    const admin = await registerAdmin(app);
    const group = await createTagGroup(admin);
    const pair = uniquePair("preserve");
    const createResponse = await request(app)
      .post("/api/tags")
      .set("Cookie", admin.cookie)
      .send({ ...pair, groupId: group.id });
    const tag = createResponse.body.tag;

    const updateResponse = await request(app)
      .put(`/api/tags/${tag.id}`)
      .set("Cookie", admin.cookie)
      .send({ tagKey: `${pair.tagKey}-edited`, tagValue: `${pair.tagValue}-edited` });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.tag.groupId).toBe(group.id);

    const listResponse = await request(app).get("/api/tags").set("Cookie", admin.cookie);
    expect(listResponse.body.groups[0].tags).toEqual([
      expect.objectContaining({
        id: tag.id,
        tagKey: `${pair.tagKey}-edited`,
        tagValue: `${pair.tagValue}-edited`
      })
    ]);
  });

  it("reorders tags within a group and moves tags between groups and ungrouped", async () => {
    const admin = await registerAdmin(app);
    const sourceGroup = await createTagGroup(admin, "Source");
    const targetGroup = await createTagGroup(admin, "Target");
    const first = await request(app)
      .post("/api/tags")
      .set("Cookie", admin.cookie)
      .send({ ...uniquePair("first"), groupId: sourceGroup.id });
    const second = await request(app)
      .post("/api/tags")
      .set("Cookie", admin.cookie)
      .send({ ...uniquePair("second"), groupId: sourceGroup.id });
    const third = await request(app)
      .post("/api/tags")
      .set("Cookie", admin.cookie)
      .send({ ...uniquePair("third"), groupId: sourceGroup.id });

    const reorderResponse = await request(app)
      .put("/api/tags/reorder")
      .set("Cookie", admin.cookie)
      .send({ groupId: sourceGroup.id, tagIds: [third.body.tag.id, first.body.tag.id, second.body.tag.id] });
    expect(reorderResponse.status).toBe(200);
    expect(reorderResponse.body.groups[0].tags.map((tag: { id: number }) => tag.id)).toEqual([
      third.body.tag.id,
      first.body.tag.id,
      second.body.tag.id
    ]);

    const moveToGroupResponse = await request(app)
      .patch(`/api/tags/${second.body.tag.id}/group`)
      .set("Cookie", admin.cookie)
      .send({ groupId: targetGroup.id, displayOrder: 1 });
    expect(moveToGroupResponse.status).toBe(200);
    const target = moveToGroupResponse.body.groups.find(
      (group: { id: number }) => group.id === targetGroup.id
    );
    expect(target.tags.map((tag: { id: number }) => tag.id)).toEqual([second.body.tag.id]);

    const moveToUngroupedResponse = await request(app)
      .patch(`/api/tags/${first.body.tag.id}/group`)
      .set("Cookie", admin.cookie)
      .send({ groupId: null, displayOrder: 1 });
    expect(moveToUngroupedResponse.status).toBe(200);
    expect(moveToUngroupedResponse.body.ungroupedTags.map((tag: { id: number }) => tag.id)).toEqual([
      first.body.tag.id
    ]);
  });

  it("rejects reorder payloads that omit tags from the target group", async () => {
    const admin = await registerAdmin(app);
    const group = await createTagGroup(admin);
    const first = await request(app)
      .post("/api/tags")
      .set("Cookie", admin.cookie)
      .send({ ...uniquePair("order-a"), groupId: group.id });
    await request(app)
      .post("/api/tags")
      .set("Cookie", admin.cookie)
      .send({ ...uniquePair("order-b"), groupId: group.id });

    const response = await request(app)
      .put("/api/tags/reorder")
      .set("Cookie", admin.cookie)
      .send({ groupId: group.id, tagIds: [first.body.tag.id] });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("tagIds must include every tag in the group exactly once");
  });

  it("deletes a group without deleting its tag definitions", async () => {
    const admin = await registerAdmin(app);
    const group = await createTagGroup(admin);
    const first = await request(app)
      .post("/api/tags")
      .set("Cookie", admin.cookie)
      .send({ ...uniquePair("delete-a"), groupId: group.id });
    const second = await request(app)
      .post("/api/tags")
      .set("Cookie", admin.cookie)
      .send({ ...uniquePair("delete-b"), groupId: group.id });

    const deleteResponse = await request(app)
      .delete(`/api/tags/groups/${group.id}`)
      .set("Cookie", admin.cookie);
    expect(deleteResponse.status).toBe(200);

    const listResponse = await request(app).get("/api/tags").set("Cookie", admin.cookie);
    expect(listResponse.body.groups).toEqual([]);
    expect(listResponse.body.ungroupedTags.map((tag: { id: number }) => tag.id)).toEqual([
      first.body.tag.id,
      second.body.tag.id
    ]);
  });

  it("rejects duplicate category/value pairs with a 409", async () => {
    const admin = await registerAdmin(app);
    const pair = uniquePair("dup");
    await createTagDefinition(app, admin, pair.tagKey, pair.tagValue);

    const duplicateResponse = await request(app)
      .post("/api/tags")
      .set("Cookie", admin.cookie)
      .send(pair);

    expect(duplicateResponse.status).toBe(409);
    expect(duplicateResponse.body).toEqual({ error: "Tag already exists" });

    const other = await createTagDefinition(app, admin, `${pair.tagKey}-other`, pair.tagValue);
    const updateResponse = await request(app)
      .put(`/api/tags/${other.id}`)
      .set("Cookie", admin.cookie)
      .send(pair);
    expect(updateResponse.status).toBe(409);
  });

  it("registers tags saved on answer options in the catalog", async () => {
    const admin = await registerAdmin(app);
    const pair = uniquePair("inline");

    let survey = await createDraftSurvey(app, admin, "Inline tag survey");
    survey = await addQuestion(app, admin, survey.id, {
      questionText: "Pick",
      questionType: "single_select"
    });
    const questionId = findQuestion(survey, "Pick").id;
    survey = await addOption(app, admin, survey.id, questionId, "Yes");
    const optionId = findQuestion(survey, "Pick").answerOptions[0].id;

    await addTag(app, admin, survey.id, questionId, optionId, pair.tagKey, pair.tagValue);

    const listResponse = await request(app).get("/api/tags").set("Cookie", admin.cookie);
    expect(
      listResponse.body.tags.some(
        (item: { tagKey: string; tagValue: string }) =>
          item.tagKey === pair.tagKey && item.tagValue === pair.tagValue
      )
    ).toBe(true);
  });

  it("keeps saved option tags when a catalog entry is deleted", async () => {
    const admin = await registerAdmin(app);
    const pair = uniquePair("sticky");

    let survey = await createDraftSurvey(app, admin, "Sticky tag survey");
    survey = await addQuestion(app, admin, survey.id, {
      questionText: "Pick",
      questionType: "single_select"
    });
    const questionId = findQuestion(survey, "Pick").id;
    survey = await addOption(app, admin, survey.id, questionId, "Yes");
    const optionId = findQuestion(survey, "Pick").answerOptions[0].id;
    await addTag(app, admin, survey.id, questionId, optionId, pair.tagKey, pair.tagValue);

    const listResponse = await request(app).get("/api/tags").set("Cookie", admin.cookie);
    const catalogEntry = listResponse.body.tags.find(
      (item: { tagKey: string; tagValue: string }) =>
        item.tagKey === pair.tagKey && item.tagValue === pair.tagValue
    );
    expect(catalogEntry).toBeDefined();

    await request(app).delete(`/api/tags/${catalogEntry.id}`).set("Cookie", admin.cookie);

    const surveyResponse = await request(app)
      .get(`/api/surveys/${survey.id}`)
      .set("Cookie", admin.cookie);
    const option = surveyResponse.body.survey.questions[0].answerOptions[0];
    expect(option.answerTags).toEqual([
      expect.objectContaining({ tagKey: pair.tagKey, tagValue: pair.tagValue })
    ]);
  });

  it("keeps tag group metadata out of participant, report, and CSV payloads", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const group = await createTagGroup(admin);
    const pair = uniquePair("private-group");
    await request(app)
      .post("/api/tags")
      .set("Cookie", admin.cookie)
      .send({ ...pair, groupId: group.id });

    let survey = await createDraftSurvey(app, admin, "Catalog leakage survey");
    survey = await addQuestion(app, admin, survey.id, {
      questionText: "Pick",
      questionType: "single_select"
    });
    const question = findQuestion(survey, "Pick");
    survey = await addOption(app, admin, survey.id, question.id, "Yes");
    const option = findQuestion(survey, "Pick").answerOptions[0];
    await addTag(app, admin, survey.id, question.id, option.id, pair.tagKey, pair.tagValue);
    survey = await setSurveyStatus(app, admin, survey.id, "published");

    const participantRead = await request(app).get(`/api/surveys/${survey.id}`).set("Cookie", user.cookie);
    expect(participantRead.status).toBe(200);
    expect(JSON.stringify(participantRead.body)).not.toContain("groupId");

    const attempt = await startAttempt(app, user, survey.id);
    await submitAnswer(app, user, survey.id, {
      attemptId: attempt.attempt.id,
      questionId: findQuestion(survey, "Pick").id,
      selectedAnswerOptionIds: [option.id]
    });
    await completeAttempt(app, user, survey.id, attempt.attempt.id);

    const reportResponse = await request(app)
      .get(`/api/surveys/${survey.id}/report`)
      .set("Cookie", admin.cookie);
    expect(reportResponse.status).toBe(200);
    expect(reportResponse.body.report.tagStats).toEqual([
      expect.objectContaining({ tagKey: pair.tagKey, tagValue: pair.tagValue })
    ]);
    expect(JSON.stringify(reportResponse.body)).not.toContain("groupId");

    const csvResponse = await request(app)
      .get(`/api/surveys/${survey.id}/export.csv`)
      .set("Cookie", admin.cookie);
    expect(csvResponse.status).toBe(200);
    expect(csvResponse.text).toContain(`${pair.tagKey}=${pair.tagValue}`);
    expect(csvResponse.text).not.toContain(group.name);
  });

  it("validates tag bodies", async () => {
    const admin = await registerAdmin(app);

    const response = await request(app)
      .post("/api/tags")
      .set("Cookie", admin.cookie)
      .send({ tagKey: "", tagValue: "" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Tag category and value are required" });
  });
});
