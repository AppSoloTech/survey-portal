import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { pool } from "../src/db.js";
import {
  addQuestion,
  collectObjectKeys,
  completeAttempt,
  createDraftSurvey,
  registerAdmin,
  registerUser,
  setSurveyStatus,
  startAttempt,
  submitPageAnswers
} from "./helpers/factories.js";

const app = createApp();

describe("admin user management", () => {
  it("rejects non-admin access to the user list and role updates", async () => {
    const user = await registerUser(app);

    const listResponse = await request(app).get("/api/admin/users").set("Cookie", user.cookie);
    expect(listResponse.status).toBe(403);
    expect(listResponse.body).toEqual({ error: expect.any(String) });

    const roleResponse = await request(app)
      .patch(`/api/admin/users/${user.user.id}/role`)
      .set("Cookie", user.cookie)
      .send({ role: "admin" });
    expect(roleResponse.status).toBe(403);

    const detailResponse = await request(app)
      .get(`/api/admin/users/${user.user.id}`)
      .set("Cookie", user.cookie);
    expect(detailResponse.status).toBe(403);

    const resetResponse = await request(app)
      .post(`/api/admin/users/${user.user.id}/password-reset`)
      .set("Cookie", user.cookie)
      .send({});
    expect(resetResponse.status).toBe(403);
  });

  it("rejects unauthenticated access", async () => {
    const listResponse = await request(app).get("/api/admin/users");
    const detailResponse = await request(app).get("/api/admin/users/1");
    const resetResponse = await request(app).post("/api/admin/users/1/password-reset").send({});

    expect(listResponse.status).toBe(401);
    expect(detailResponse.status).toBe(401);
    expect(resetResponse.status).toBe(401);
  });

  it("lists users with pagination metadata and never exposes password data", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);

    const response = await request(app)
      .get("/api/admin/users?page=1&pageSize=100")
      .set("Cookie", admin.cookie);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      page: 1,
      pageSize: 100,
      total: expect.any(Number),
      users: expect.any(Array)
    });
    expect(response.body.total).toBeGreaterThanOrEqual(2);

    const listedUser = response.body.users.find(
      (item: { id: number }) => item.id === user.user.id
    );
    expect(listedUser).toMatchObject({
      email: user.user.email,
      firstName: user.user.firstName,
      role: "user"
    });

    const keys = collectObjectKeys(response.body);
    expect(keys.has("password")).toBe(false);
    expect(keys.has("passwordHash")).toBe(false);
    expect(keys.has("password_hash")).toBe(false);
  });

  it("paginates with a bounded page size", async () => {
    const admin = await registerAdmin(app);
    await registerUser(app);

    const response = await request(app)
      .get("/api/admin/users?page=1&pageSize=1")
      .set("Cookie", admin.cookie);

    expect(response.status).toBe(200);
    expect(response.body.users).toHaveLength(1);
    expect(response.body.pageSize).toBe(1);
    expect(response.body.total).toBeGreaterThan(1);
  });

  it("filters the user list by role for split admin/user views", async () => {
    const admin = await registerAdmin(app);
    const standardUser = await registerUser(app);
    const secondAdmin = await registerAdmin(app);

    const adminResponse = await request(app)
      .get("/api/admin/users?page=1&pageSize=100&role=admin")
      .set("Cookie", admin.cookie);
    const userResponse = await request(app)
      .get("/api/admin/users?page=1&pageSize=100&role=user")
      .set("Cookie", admin.cookie);
    const invalidResponse = await request(app)
      .get("/api/admin/users?role=owner")
      .set("Cookie", admin.cookie);

    expect(adminResponse.status).toBe(200);
    expect(userResponse.status).toBe(200);
    expect(invalidResponse.status).toBe(400);
    expect(adminResponse.body.users.every((user: { role: string }) => user.role === "admin")).toBe(
      true
    );
    expect(userResponse.body.users.every((user: { role: string }) => user.role === "user")).toBe(
      true
    );
    expect(adminResponse.body.users.some((user: { id: number }) => user.id === secondAdmin.user.id)).toBe(
      true
    );
    expect(userResponse.body.users.some((user: { id: number }) => user.id === standardUser.user.id)).toBe(
      true
    );
    expect(adminResponse.body.total).toBeGreaterThanOrEqual(2);
    expect(userResponse.body.total).toBeGreaterThanOrEqual(1);
    expect(invalidResponse.body).toEqual({ error: "Role filter must be user or admin" });
  });

  it("promotes a user to admin and demotes back", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);

    const promoteResponse = await request(app)
      .patch(`/api/admin/users/${user.user.id}/role`)
      .set("Cookie", admin.cookie)
      .send({ role: "admin" });

    expect(promoteResponse.status).toBe(200);
    expect(promoteResponse.body.user).toMatchObject({ id: user.user.id, role: "admin" });

    // The promoted user can reach admin-only endpoints with their existing
    // session because roles are read from the database on every request.
    const adminMeResponse = await request(app).get("/api/admin/me").set("Cookie", user.cookie);
    expect(adminMeResponse.status).toBe(200);

    const demoteResponse = await request(app)
      .patch(`/api/admin/users/${user.user.id}/role`)
      .set("Cookie", admin.cookie)
      .send({ role: "user" });

    expect(demoteResponse.status).toBe(200);
    expect(demoteResponse.body.user.role).toBe("user");

    const revokedResponse = await request(app).get("/api/admin/me").set("Cookie", user.cookie);
    expect(revokedResponse.status).toBe(403);
  });

  it("blocks admins from changing their own role", async () => {
    const admin = await registerAdmin(app);

    const response = await request(app)
      .patch(`/api/admin/users/${admin.user.id}/role`)
      .set("Cookie", admin.cookie)
      .send({ role: "user" });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: "You cannot change your own role" });
  });

  it("validates role values and unknown users", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);

    const invalidRoleResponse = await request(app)
      .patch(`/api/admin/users/${user.user.id}/role`)
      .set("Cookie", admin.cookie)
      .send({ role: "superuser" });
    expect(invalidRoleResponse.status).toBe(400);

    const unknownUserResponse = await request(app)
      .patch("/api/admin/users/999999/role")
      .set("Cookie", admin.cookie)
      .send({ role: "admin" });
    expect(unknownUserResponse.status).toBe(404);
  });

  it("returns safe user detail with profile metadata and registered-only stats", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const otherUser = await registerUser(app);
    const availableSurvey = await createSingleQuestionPublishedSurvey(admin, "Admin available");
    const inProgressSurvey = await createSingleQuestionPublishedSurvey(admin, "Admin progress");
    const completedSurvey = await createSingleQuestionPublishedSurvey(admin, "Admin complete");
    const anonymousSurvey = await createSingleQuestionPublishedSurvey(admin, "Admin anonymous");

    await request(app).put("/api/profile").set("Cookie", user.cookie).send({
      firstName: "Jordan",
      lastName: "Profile",
      contactNumber: "+1 (213) 373-4253",
      addressStreet: "22 Survey Street",
      addressCity: "Cincinnati",
      addressState: "Ohio"
    });
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

    const response = await request(app)
      .get(`/api/admin/users/${user.user.id}`)
      .set("Cookie", admin.cookie);

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({
      id: user.user.id,
      email: user.user.email,
      firstName: "Jordan",
      lastName: "Profile",
      role: "user"
    });
    expect(response.body.profile).toMatchObject({
      contactNumber: "+12133734253",
      addressStreet: "22 Survey Street",
      addressCity: "Cincinnati",
      addressState: "Ohio"
    });
    expect(response.body.profile.preferredContactMethod).toBeUndefined();
    expect(response.body.profile.contactNotes).toBeUndefined();
    expect(response.body.surveyStats).toMatchObject({
      available: 2,
      inProgress: 1,
      completed: 1,
      completionRate: 25
    });
    expect(response.body.surveyStats.lastActivityAt).toEqual(expect.any(String));
    expect(inProgressAttempt.attempt.status).toBe("in_progress");

    const keys = collectObjectKeys(response.body);
    expect(keys.has("password")).toBe(false);
    expect(keys.has("passwordHash")).toBe(false);
    expect(keys.has("password_hash")).toBe(false);
    expect(keys.has("token")).toBe(false);
    expect(keys.has("resetUrl")).toBe(false);
    expect(keys.has("token_lookup_key")).toBe(false);
    expect(keys.has("token_secret_hash")).toBe(false);
  });

  it("returns null profile fields for users without a profile row", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);

    const response = await request(app)
      .get(`/api/admin/users/${user.user.id}`)
      .set("Cookie", admin.cookie);

    expect(response.status).toBe(200);
    expect(response.body.profile).toMatchObject({
      contactNumber: null,
      addressStreet: null,
      addressCity: null,
      addressState: null,
      createdAt: null,
      updatedAt: null
    });
  });

  it("returns 404 for unknown user detail and reset requests", async () => {
    const admin = await registerAdmin(app);

    const detailResponse = await request(app)
      .get("/api/admin/users/999999")
      .set("Cookie", admin.cookie);
    const resetResponse = await request(app)
      .post("/api/admin/users/999999/password-reset")
      .set("Cookie", admin.cookie)
      .send({});

    expect(detailResponse.status).toBe(404);
    expect(resetResponse.status).toBe(404);
    expect(detailResponse.body).toEqual({ error: "User not found" });
    expect(resetResponse.body).toEqual({ error: "User not found" });
  });

  it("allows admin-triggered password resets without returning reset secrets", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);

    const response = await request(app)
      .post(`/api/admin/users/${user.user.id}/password-reset`)
      .set("Cookie", admin.cookie)
      .send({});

    expect(response.status).toBe(200);
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(response.body).toEqual({
      message: "If an account exists for that email, a password reset link will be sent."
    });

    const keys = collectObjectKeys(response.body);
    expect(keys.has("token")).toBe(false);
    expect(keys.has("resetUrl")).toBe(false);
    expect(keys.has("passwordHash")).toBe(false);

    const stored = await pool.query<{
      token_lookup_key: string;
      token_secret_hash: string;
      consumed_at: Date | null;
    }>(
      `select token_lookup_key, token_secret_hash, consumed_at
       from password_reset_tokens
       where user_id = $1`,
      [user.user.id]
    );

    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0].token_lookup_key).toEqual(expect.any(String));
    expect(stored.rows[0].token_secret_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.rows[0].consumed_at).toBeNull();
  });

  it("allows admins to initiate their own reset without self-action token exposure", async () => {
    const admin = await registerAdmin(app);

    const response = await request(app)
      .post(`/api/admin/users/${admin.user.id}/password-reset`)
      .set("Cookie", admin.cookie)
      .send({});

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toContain("prt.");

    const stored = await pool.query<{ count: string }>(
      `select count(*)::text as count
       from password_reset_tokens
       where user_id = $1`,
      [admin.user.id]
    );

    expect(Number(stored.rows[0].count)).toBe(1);
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
