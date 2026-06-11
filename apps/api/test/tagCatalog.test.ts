import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import {
  addOption,
  addQuestion,
  addTag,
  createDraftSurvey,
  createTagDefinition,
  findQuestion,
  registerAdmin,
  registerUser,
  uniqueEmail
} from "./helpers/factories.js";

const app = createApp();

let tagCounter = 0;

function uniquePair(prefix = "key"): { tagKey: string; tagValue: string } {
  tagCounter += 1;
  const slug = uniqueEmail(prefix).split("@")[0];
  return { tagKey: `${slug}`, tagValue: `value-${tagCounter}` };
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
  });

  it("creates, lists, updates, and deletes catalog entries", async () => {
    const admin = await registerAdmin(app);
    const pair = uniquePair();
    const tag = await createTagDefinition(app, admin, pair.tagKey, pair.tagValue);

    expect(tag).toMatchObject({ id: expect.any(Number), ...pair });

    const listResponse = await request(app).get("/api/tags").set("Cookie", admin.cookie);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.tags.some((item: { id: number }) => item.id === tag.id)).toBe(true);

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

  it("rejects duplicate key/value pairs with a 409", async () => {
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

  it("validates tag bodies", async () => {
    const admin = await registerAdmin(app);

    const response = await request(app)
      .post("/api/tags")
      .set("Cookie", admin.cookie)
      .send({ tagKey: "", tagValue: "" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Tag key and value are required" });
  });
});
