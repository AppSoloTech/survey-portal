import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import {
  addOption,
  addQuestion,
  addTag,
  collectObjectKeys,
  createDraftSurvey,
  findQuestion,
  registerAdmin,
  registerUser,
  setSurveyStatus,
  startAttempt
} from "./helpers/factories.js";

const app = createApp();

async function createPublishedTaggedSurvey(admin: Awaited<ReturnType<typeof registerAdmin>>) {
  let survey = await createDraftSurvey(app, admin, "Tagged survey");
  survey = await addQuestion(app, admin, survey.id, {
    questionText: "Compliant?",
    questionType: "single_select"
  });

  const questionId = findQuestion(survey, "Compliant?").id;
  survey = await addOption(app, admin, survey.id, questionId, "Yes");
  survey = await addOption(app, admin, survey.id, questionId, "No");

  const noOption = findQuestion(survey, "Compliant?").answerOptions.find(
    (option) => option.optionText === "No"
  );

  if (!noOption) {
    throw new Error("Option not created");
  }

  survey = await addTag(app, admin, survey.id, questionId, noOption.id, "compliance_result", "violation");
  survey = await setSurveyStatus(app, admin, survey.id, "published");

  return survey;
}

describe("survey visibility", () => {
  it("requires authentication for survey reads", async () => {
    const response = await request(app).get("/api/surveys");

    expect(response.status).toBe(401);
  });

  it("shows standard users only published surveys while admins see all statuses", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);

    await createDraftSurvey(app, admin, "Draft only");
    await createPublishedTaggedSurvey(admin);

    const userResponse = await request(app).get("/api/surveys").set("Cookie", user.cookie);
    const adminResponse = await request(app).get("/api/surveys").set("Cookie", admin.cookie);

    expect(userResponse.status).toBe(200);
    expect(userResponse.body.surveys).toHaveLength(1);
    expect(userResponse.body.surveys[0].status).toBe("published");

    expect(adminResponse.status).toBe(200);
    expect(adminResponse.body.surveys.map((survey: { status: string }) => survey.status).sort()).toEqual([
      "draft",
      "published"
    ]);
  });

  it("returns 404 to standard users for unpublished survey detail", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const draft = await createDraftSurvey(app, admin, "Hidden draft");

    const response = await request(app).get(`/api/surveys/${draft.id}`).set("Cookie", user.cookie);

    expect(response.status).toBe(404);
  });
});

describe("hidden tag isolation", () => {
  it("includes answerTags for admins and strips them for participants", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const survey = await createPublishedTaggedSurvey(admin);

    const adminResponse = await request(app)
      .get(`/api/surveys/${survey.id}`)
      .set("Cookie", admin.cookie);
    const adminKeys = collectObjectKeys(adminResponse.body);

    expect(adminResponse.status).toBe(200);
    expect(adminKeys.has("answerTags")).toBe(true);
    expect(JSON.stringify(adminResponse.body)).toContain("violation");

    const userResponse = await request(app)
      .get(`/api/surveys/${survey.id}`)
      .set("Cookie", user.cookie);
    const userKeys = collectObjectKeys(userResponse.body);

    expect(userResponse.status).toBe(200);
    expect(userKeys.has("answerTags")).toBe(false);
    expect(JSON.stringify(userResponse.body)).not.toContain("violation");
  });

  it("keeps hidden tags out of participant attempt payloads", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const survey = await createPublishedTaggedSurvey(admin);

    const startResponse = await startAttempt(app, user, survey.id);
    const startKeys = collectObjectKeys(startResponse);

    expect(startKeys.has("answerTags")).toBe(false);

    const mySurveysResponse = await request(app).get("/api/my-surveys").set("Cookie", user.cookie);
    const mySurveysKeys = collectObjectKeys(mySurveysResponse.body);

    expect(mySurveysResponse.status).toBe(200);
    expect(mySurveysKeys.has("answerTags")).toBe(false);

    const attemptResponse = await request(app)
      .get(`/api/my-surveys/${startResponse.attempt.id}`)
      .set("Cookie", user.cookie);
    const attemptKeys = collectObjectKeys(attemptResponse.body);

    expect(attemptResponse.status).toBe(200);
    expect(attemptKeys.has("answerTags")).toBe(false);
  });
});
