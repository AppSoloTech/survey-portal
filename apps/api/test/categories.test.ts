import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import {
  collectObjectKeys,
  createCategory,
  createDraftSurvey,
  createPublishedJumpSurvey,
  registerAdmin,
  registerUser,
  uniqueEmail
} from "./helpers/factories.js";

const app = createApp();

let categoryCounter = 0;

function uniqueCategoryName(prefix = "Category"): string {
  categoryCounter += 1;
  return `${prefix} ${uniqueEmail("c").split("@")[0]}-${categoryCounter}`;
}

describe("survey categories", () => {
  it("rejects non-admin access to category management", async () => {
    const user = await registerUser(app);

    const listResponse = await request(app).get("/api/categories").set("Cookie", user.cookie);
    expect(listResponse.status).toBe(403);

    const createResponse = await request(app)
      .post("/api/categories")
      .set("Cookie", user.cookie)
      .send({ name: "Nope" });
    expect(createResponse.status).toBe(403);
  });

  it("creates, lists, renames, and deletes categories", async () => {
    const admin = await registerAdmin(app);
    const name = uniqueCategoryName();
    const category = await createCategory(app, admin, name);

    expect(category).toMatchObject({ id: expect.any(Number), name });

    const listResponse = await request(app).get("/api/categories").set("Cookie", admin.cookie);
    expect(listResponse.status).toBe(200);
    expect(
      listResponse.body.categories.some((item: { id: number }) => item.id === category.id)
    ).toBe(true);

    const renamed = uniqueCategoryName("Renamed");
    const renameResponse = await request(app)
      .put(`/api/categories/${category.id}`)
      .set("Cookie", admin.cookie)
      .send({ name: renamed });
    expect(renameResponse.status).toBe(200);
    expect(renameResponse.body.category.name).toBe(renamed);

    const deleteResponse = await request(app)
      .delete(`/api/categories/${category.id}`)
      .set("Cookie", admin.cookie);
    expect(deleteResponse.status).toBe(200);

    const finalList = await request(app).get("/api/categories").set("Cookie", admin.cookie);
    expect(
      finalList.body.categories.some((item: { id: number }) => item.id === category.id)
    ).toBe(false);
  });

  it("rejects duplicate category names case-insensitively", async () => {
    const admin = await registerAdmin(app);
    const name = uniqueCategoryName("Compliance");
    await createCategory(app, admin, name);

    const duplicateResponse = await request(app)
      .post("/api/categories")
      .set("Cookie", admin.cookie)
      .send({ name: name.toUpperCase() });

    expect(duplicateResponse.status).toBe(409);
    expect(duplicateResponse.body).toEqual({ error: "Category already exists" });
  });

  it("assigns and clears a survey's category through metadata updates", async () => {
    const admin = await registerAdmin(app);
    const category = await createCategory(app, admin, uniqueCategoryName());
    const survey = await createDraftSurvey(app, admin, "Categorized survey");

    const assignResponse = await request(app)
      .put(`/api/surveys/${survey.id}`)
      .set("Cookie", admin.cookie)
      .send({ title: survey.title, status: "draft", categoryId: category.id });

    expect(assignResponse.status).toBe(200);
    expect(assignResponse.body.survey.categoryId).toBe(category.id);
    expect(assignResponse.body.survey.categoryName).toBe(category.name);

    const clearResponse = await request(app)
      .put(`/api/surveys/${survey.id}`)
      .set("Cookie", admin.cookie)
      .send({ title: survey.title, status: "draft", categoryId: null });

    expect(clearResponse.status).toBe(200);
    expect(clearResponse.body.survey.categoryId).toBeNull();
    expect(clearResponse.body.survey.categoryName).toBeNull();
  });

  it("rejects assignment to a category that does not exist", async () => {
    const admin = await registerAdmin(app);
    const survey = await createDraftSurvey(app, admin, "Orphan category survey");

    const response = await request(app)
      .put(`/api/surveys/${survey.id}`)
      .set("Cookie", admin.cookie)
      .send({ title: survey.title, status: "draft", categoryId: 999999 });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Category not found" });
  });

  it("shows category names to participants without exposing hidden tags", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const category = await createCategory(app, admin, uniqueCategoryName("Visible"));
    const { survey } = await createPublishedJumpSurvey(app, admin);

    await request(app)
      .put(`/api/surveys/${survey.id}`)
      .set("Cookie", admin.cookie)
      .send({ title: survey.title, status: "published", categoryId: category.id });

    const listResponse = await request(app).get("/api/surveys").set("Cookie", user.cookie);
    expect(listResponse.status).toBe(200);

    const listedSurvey = listResponse.body.surveys.find(
      (item: { id: number }) => item.id === survey.id
    );
    expect(listedSurvey.categoryName).toBe(category.name);

    const keys = collectObjectKeys(listResponse.body);
    expect(keys.has("tagKey")).toBe(false);
    expect(keys.has("answerTags")).toBe(false);
  });

  it("nulls survey assignments when a category is deleted", async () => {
    const admin = await registerAdmin(app);
    const category = await createCategory(app, admin, uniqueCategoryName("Doomed"));
    const survey = await createDraftSurvey(app, admin, "Soon uncategorized");

    await request(app)
      .put(`/api/surveys/${survey.id}`)
      .set("Cookie", admin.cookie)
      .send({ title: survey.title, status: "draft", categoryId: category.id });

    await request(app).delete(`/api/categories/${category.id}`).set("Cookie", admin.cookie);

    const surveyResponse = await request(app)
      .get(`/api/surveys/${survey.id}`)
      .set("Cookie", admin.cookie);

    expect(surveyResponse.status).toBe(200);
    expect(surveyResponse.body.survey.categoryId).toBeNull();
    expect(surveyResponse.body.survey.categoryName).toBeNull();
  });
});
