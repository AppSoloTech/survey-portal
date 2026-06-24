import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import {
  addQuestion,
  completeAttempt,
  createDraftSurvey,
  registerAdmin,
  registerUser,
  setSurveyStatus,
  startAttempt,
  submitPageAnswers
} from "./helpers/factories.js";

const app = createApp();

describe("current user profile routes", () => {
  it("requires authentication for profile reads and updates", async () => {
    const read = await request(app).get("/api/profile");
    const update = await request(app).put("/api/profile").send({ contactNumber: "555-0100" });

    expect(read.status).toBe(401);
    expect(update.status).toBe(401);
  });

  it("reads and updates the authenticated user's name, address, and phone number", async () => {
    const session = await registerUser(app);

    const initial = await request(app).get("/api/profile").set("Cookie", session.cookie);

    expect(initial.status).toBe(200);
    expect(initial.body.user.id).toBe(session.user.id);
    expect(initial.body.profile).toMatchObject({
      contactNumber: null,
      addressStreet: null,
      addressCity: null,
      addressState: null,
      createdAt: null,
      updatedAt: null
    });

    const update = await request(app).put("/api/profile").set("Cookie", session.cookie).send({
      firstName: "  Ada  ",
      lastName: "  Lovelace  ",
      contactNumber: "  +1 (213) 373-4253  ",
      addressStreet: "  12 Example Lane  ",
      addressCity: "  Cleveland  ",
      addressState: "  Ohio  "
    });

    expect(update.status).toBe(200);
    expect(update.body.user).toMatchObject({
      id: session.user.id,
      firstName: "Ada",
      lastName: "Lovelace",
      email: session.user.email
    });
    expect(update.body.profile).toMatchObject({
      contactNumber: "+12133734253",
      addressStreet: "12 Example Lane",
      addressCity: "Cleveland",
      addressState: "Ohio"
    });
    expect(update.body.profile.updatedAt).toEqual(expect.any(String));

    const reload = await request(app).get("/api/profile").set("Cookie", session.cookie);

    expect(reload.status).toBe(200);
    expect(reload.body.user).toMatchObject({
      firstName: "Ada",
      lastName: "Lovelace"
    });
    expect(reload.body.profile).toMatchObject(update.body.profile);

    const partial = await request(app).put("/api/profile").set("Cookie", session.cookie).send({
      addressCity: ""
    });

    expect(partial.status).toBe(200);
    expect(partial.body.user).toMatchObject({
      firstName: "Ada",
      lastName: "Lovelace"
    });
    expect(partial.body.profile).toMatchObject({
      contactNumber: "+12133734253",
      addressStreet: "12 Example Lane",
      addressCity: null,
      addressState: "Ohio"
    });
  });

  it("normalizes valid international phone numbers and keeps blank phone null", async () => {
    const session = await registerUser(app);

    const ukPhone = await request(app).put("/api/profile").set("Cookie", session.cookie).send({
      contactNumber: " +44 20 7946 0123 "
    });
    const blankPhone = await request(app).put("/api/profile").set("Cookie", session.cookie).send({
      contactNumber: ""
    });

    expect(ukPhone.status).toBe(200);
    expect(ukPhone.body.profile.contactNumber).toBe("+442079460123");
    expect(blankPhone.status).toBe(200);
    expect(blankPhone.body.profile.contactNumber).toBeNull();
  });

  it("does not expose or update another user's profile by guessed ids", async () => {
    const first = await registerUser(app);
    const second = await registerUser(app);

    await request(app).put("/api/profile").set("Cookie", first.cookie).send({
      contactNumber: "+12133734254",
      addressStreet: "First user's address",
      addressCity: "Akron",
      addressState: "Ohio",
      userId: second.user.id
    });

    const secondRead = await request(app).get("/api/profile").set("Cookie", second.cookie);
    const guessedRead = await request(app).get(`/api/profile/${first.user.id}`).set("Cookie", second.cookie);
    const guessedUpdate = await request(app)
      .put(`/api/profile/${first.user.id}`)
      .set("Cookie", second.cookie)
      .send({ contactNumber: "555-0202" });

    expect(secondRead.status).toBe(200);
    expect(secondRead.body.profile.contactNumber).toBeNull();
    expect(secondRead.body.profile.addressStreet).toBeNull();
    expect(secondRead.body.profile.addressCity).toBeNull();
    expect(secondRead.body.profile.addressState).toBeNull();
    expect(guessedRead.status).toBe(404);
    expect(guessedUpdate.status).toBe(404);
  });

  it("validates profile field types and length bounds", async () => {
    const session = await registerUser(app);

    const tooLong = await request(app)
      .put("/api/profile")
      .set("Cookie", session.cookie)
      .send({ contactNumber: "x".repeat(121), addressStreet: "" });
    const wrongType = await request(app)
      .put("/api/profile")
      .set("Cookie", session.cookie)
      .send({ contactNumber: 42, addressStreet: "" });
    const invalidPhone = await request(app)
      .put("/api/profile")
      .set("Cookie", session.cookie)
      .send({ contactNumber: "+123", addressStreet: "" });
    const missingName = await request(app)
      .put("/api/profile")
      .set("Cookie", session.cookie)
      .send({ firstName: "", lastName: "Example", contactNumber: "", addressStreet: "" });
    const tooLongStreet = await request(app)
      .put("/api/profile")
      .set("Cookie", session.cookie)
      .send({ addressStreet: "x".repeat(161) });
    const tooLongCity = await request(app)
      .put("/api/profile")
      .set("Cookie", session.cookie)
      .send({ addressCity: "x".repeat(81) });
    const arrayBody = await request(app)
      .put("/api/profile")
      .set("Cookie", session.cookie)
      .send([]);

    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error).toBe("Phone number must be 120 characters or fewer");
    expect(wrongType.status).toBe(400);
    expect(wrongType.body.error).toBe("Phone number must be text");
    expect(invalidPhone.status).toBe(400);
    expect(invalidPhone.body.error).toBe("Phone number must be a valid phone number");
    expect(missingName.status).toBe(400);
    expect(missingName.body.error).toBe("First name is required");
    expect(tooLongStreet.status).toBe(400);
    expect(tooLongStreet.body.error).toBe("Street address must be 160 characters or fewer");
    expect(tooLongCity.status).toBe(400);
    expect(tooLongCity.body.error).toBe("City must be 80 characters or fewer");
    expect(arrayBody.status).toBe(400);
    expect(arrayBody.body.error).toBe("Request body is required");
  });

  it("does not expose legacy contact-method metadata in profile responses", async () => {
    const session = await registerUser(app);

    const update = await request(app).put("/api/profile").set("Cookie", session.cookie).send({
      contactNumber: "+12133734253",
      addressStreet: "100 Main Street",
      addressCity: "Columbus",
      addressState: "Ohio",
      preferredContactMethod: "Phone",
      contactNotes: "Legacy note"
    });
    const reload = await request(app).get("/api/profile").set("Cookie", session.cookie);

    expect(update.status).toBe(200);
    expect(reload.status).toBe(200);
    expect(update.body.profile).toMatchObject({
      contactNumber: "+12133734253",
      addressStreet: "100 Main Street",
      addressCity: "Columbus",
      addressState: "Ohio"
    });
    expect(update.body.profile.preferredContactMethod).toBeUndefined();
    expect(update.body.profile.contactNotes).toBeUndefined();
    expect(reload.body.profile.preferredContactMethod).toBeUndefined();
    expect(reload.body.profile.contactNotes).toBeUndefined();
  });

  it("derives registered current-user survey statistics without anonymous attempts", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const otherUser = await registerUser(app);
    const availableSurvey = await createSingleQuestionPublishedSurvey(admin, "Available survey");
    const inProgressSurvey = await createSingleQuestionPublishedSurvey(admin, "In progress survey");
    const completedSurvey = await createSingleQuestionPublishedSurvey(admin, "Completed survey");
    const anonymousSurvey = await createSingleQuestionPublishedSurvey(admin, "Anonymous survey");
    await startAnonymousAttempt(admin, anonymousSurvey.id);
    await startAttempt(app, otherUser, availableSurvey.id);

    const inProgressAttempt = await startAttempt(app, user, inProgressSurvey.id);
    const completedAttempt = await startAttempt(app, user, completedSurvey.id);
    await submitPageAnswers(app, user, completedSurvey.id, completedAttempt.currentPage?.id ?? 0, {
      attemptId: completedAttempt.attempt.id,
      answers: [
        {
          questionId: completedAttempt.currentPageQuestionIds[0],
          answerText: "Done",
          answerInteger: null,
          selectedAnswerOptionIds: []
        }
      ]
    });
    await completeAttempt(app, user, completedSurvey.id, completedAttempt.attempt.id);

    const response = await request(app).get("/api/profile").set("Cookie", user.cookie);

    await request(app).put("/api/profile").set("Cookie", user.cookie).send({
      firstName: "Stats",
      lastName: "User",
      contactNumber: "+12133734255",
      addressStreet: "1 Stable Stats Way",
      addressCity: "Dayton",
      addressState: "Ohio"
    });

    const afterProfileEdit = await request(app).get("/api/profile").set("Cookie", user.cookie);

    expect(response.status).toBe(200);
    expect(response.body.surveyStats).toMatchObject({
      available: 2,
      inProgress: 1,
      completed: 1,
      completionRate: 25
    });
    expect(response.body.surveyStats.lastActivityAt).toEqual(expect.any(String));
    expect(afterProfileEdit.status).toBe(200);
    expect(afterProfileEdit.body.surveyStats).toMatchObject(response.body.surveyStats);
    expect(inProgressAttempt.attempt.status).toBe("in_progress");
  });
});

async function createSingleQuestionPublishedSurvey(
  admin: Awaited<ReturnType<typeof registerAdmin>>,
  title: string
) {
  let survey = await createDraftSurvey(app, admin, title);
  survey = await addQuestion(app, admin, survey.id, {
    questionText: `${title} question`,
    pageId: survey.pages[0]?.id
  });

  return setSurveyStatus(app, admin, survey.id, "published");
}

async function startAnonymousAttempt(
  admin: Awaited<ReturnType<typeof registerAdmin>>,
  surveyId: number
) {
  const link = await request(app)
    .post(`/api/surveys/${surveyId}/anonymous-links`)
    .set("Cookie", admin.cookie)
    .send({});
  const token = String(link.body.link.publicUrl).split("/").pop() ?? "";

  const response = await request(app).post(`/api/anonymous-surveys/${token}/start`).send({});

  expect(link.status).toBe(201);
  expect(response.status).toBe(201);
}
