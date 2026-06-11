import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { extractAuthCookie, registerAdmin, registerUser, uniqueEmail } from "./helpers/factories.js";

const app = createApp();

describe("auth routes", () => {
  describe("POST /api/auth/register", () => {
    it("registers a user, sets the auth cookie, and never returns password data", async () => {
      const response = await request(app).post("/api/auth/register").send({
        first_name: "Pat",
        last_name: "Example",
        email: "pat@example.com",
        password: "test-password-123"
      });

      expect(response.status).toBe(201);
      expect(response.body.user).toMatchObject({
        firstName: "Pat",
        lastName: "Example",
        email: "pat@example.com",
        role: "user"
      });
      expect(JSON.stringify(response.body)).not.toContain("password");
      expect(extractAuthCookie(response)).toMatch(/^survey_portal_auth=/);

      const cookieAttributes = response.headers["set-cookie"]?.[0] ?? "";
      expect(cookieAttributes).toContain("HttpOnly");
    });

    it("rejects duplicate emails with 409", async () => {
      const email = uniqueEmail("dupe");
      await registerUser(app, { email });

      const response = await request(app).post("/api/auth/register").send({
        first_name: "Other",
        last_name: "Person",
        email,
        password: "test-password-123"
      });

      expect(response.status).toBe(409);
    });

    it("rejects short passwords with 400", async () => {
      const response = await request(app).post("/api/auth/register").send({
        first_name: "Pat",
        last_name: "Example",
        email: uniqueEmail(),
        password: "short"
      });

      expect(response.status).toBe(400);
    });
  });

  describe("POST /api/auth/login", () => {
    let email: string;
    let password: string;

    beforeEach(async () => {
      const session = await registerUser(app);
      email = session.user.email;
      password = session.password;
    });

    it("logs in with valid credentials and sets the auth cookie", async () => {
      const response = await request(app).post("/api/auth/login").send({ email, password });

      expect(response.status).toBe(200);
      expect(response.body.user.email).toBe(email);
      expect(extractAuthCookie(response)).toMatch(/^survey_portal_auth=/);
    });

    it("rejects a wrong password with a generic 401", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({ email, password: "wrong-password-123" });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe("Invalid email or password");
    });

    it("rejects an unknown email with the same generic 401", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({ email: "nobody@example.com", password: "wrong-password-123" });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe("Invalid email or password");
    });
  });

  describe("GET /api/auth/me", () => {
    it("returns 401 without a cookie", async () => {
      const response = await request(app).get("/api/auth/me");

      expect(response.status).toBe(401);
    });

    it("returns the current user with a valid cookie", async () => {
      const session = await registerUser(app);
      const response = await request(app).get("/api/auth/me").set("Cookie", session.cookie);

      expect(response.status).toBe(200);
      expect(response.body.user.id).toBe(session.user.id);
    });
  });

  describe("POST /api/auth/logout", () => {
    it("clears the auth cookie", async () => {
      const session = await registerUser(app);
      const response = await request(app).post("/api/auth/logout").set("Cookie", session.cookie);

      expect(response.status).toBe(204);

      const clearedCookie = response.headers["set-cookie"]?.[0] ?? "";
      expect(clearedCookie).toMatch(/^survey_portal_auth=;/);
    });
  });

  describe("role enforcement", () => {
    it("blocks standard users from admin routes with 403", async () => {
      const session = await registerUser(app);
      const response = await request(app).get("/api/admin/me").set("Cookie", session.cookie);

      expect(response.status).toBe(403);
    });

    it("allows admins through admin routes", async () => {
      const admin = await registerAdmin(app);
      const response = await request(app).get("/api/admin/me").set("Cookie", admin.cookie);

      expect(response.status).toBe(200);
      expect(response.body.user.role).toBe("admin");
    });

    it("returns 401 for admin routes without authentication", async () => {
      const response = await request(app).get("/api/admin/me");

      expect(response.status).toBe(401);
    });
  });
});
