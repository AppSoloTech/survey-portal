import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { collectObjectKeys, registerAdmin, registerUser } from "./helpers/factories.js";

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
  });

  it("rejects unauthenticated access", async () => {
    const response = await request(app).get("/api/admin/users");
    expect(response.status).toBe(401);
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
});
