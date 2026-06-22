import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { pool } from "../src/db.js";
import type { EmailClient, EmailMessage } from "../src/services/email.js";
import {
  buildPasswordResetUrl,
  genericPasswordResetMessage,
  requestPasswordResetForEmail
} from "../src/services/passwordReset.js";
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

    it("rejects passwords longer than bcrypt's 72-byte input limit", async () => {
      const response = await request(app).post("/api/auth/register").send({
        first_name: "Pat",
        last_name: "Example",
        email: uniqueEmail(),
        password: "a".repeat(73)
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Password must be at most 72 bytes");
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

    it("allows valid logins under the configured rate limit", async () => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const response = await request(app).post("/api/auth/login").send({ email, password });

        expect(response.status).toBe(200);
      }
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

    it("rate limits repeated login attempts with a generic 429 error shape", async () => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const response = await request(app)
          .post("/api/auth/login")
          .send({ email, password: "wrong-password-123" });

        expect(response.status).toBe(401);
        expect(response.body.error).toBe("Invalid email or password");
      }

      const limitedResponse = await request(app)
        .post("/api/auth/login")
        .send({ email, password: "wrong-password-123" });

      expect(limitedResponse.status).toBe(429);
      expect(limitedResponse.body).toEqual({
        error: "Too many authentication attempts. Please try again later."
      });
    });
  });

  describe("password reset", () => {
    it("returns the same generic response for existing and unknown emails without setting cookies", async () => {
      const session = await registerUser(app);

      const existingResponse = await request(app)
        .post("/api/auth/password-reset/request")
        .send({ email: session.user.email });
      const unknownResponse = await request(app)
        .post("/api/auth/password-reset/request")
        .send({ email: uniqueEmail("unknown-reset") });

      expect(existingResponse.status).toBe(200);
      expect(unknownResponse.status).toBe(200);
      expect(existingResponse.body).toEqual({ message: genericPasswordResetMessage });
      expect(unknownResponse.body).toEqual(existingResponse.body);
      expect(existingResponse.headers["set-cookie"]).toBeUndefined();
      expect(unknownResponse.headers["set-cookie"]).toBeUndefined();
    });

    it("stores only lookup and hashed reset-token secret and sends the email payload through the email client", async () => {
      const session = await registerUser(app);
      const messages: EmailMessage[] = [];
      const client: EmailClient = {
        provider: "noop",
        send: vi.fn(async (message) => {
          messages.push(message);
          return { status: "skipped", provider: "noop" };
        })
      };

      const result = await requestPasswordResetForEmail({
        email: session.user.email,
        client
      });

      expect(result.token).toMatch(/^prt\.[^.]+\.[^.]+$/);
      expect(result.resetUrl).toBe(buildPasswordResetUrl(result.token ?? ""));
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        template: "password_reset",
        to: {
          email: session.user.email,
          name: `${session.user.firstName} ${session.user.lastName}`
        },
        resetUrl: result.resetUrl,
        expiresAt: result.expiresAt?.toISOString()
      });

      const stored = await pool.query<{
        token_lookup_key: string;
        token_secret_hash: string;
        consumed_at: Date | null;
      }>(
        `select token_lookup_key, token_secret_hash, consumed_at
         from password_reset_tokens
         where user_id = $1`,
        [session.user.id]
      );

      const tokenParts = result.token?.split(".") ?? [];
      expect(stored.rows).toHaveLength(1);
      expect(stored.rows[0].token_lookup_key).toBe(tokenParts[1]);
      expect(stored.rows[0].token_secret_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(stored.rows[0].token_secret_hash).not.toContain(tokenParts[2]);
      expect(JSON.stringify(stored.rows[0])).not.toContain(result.token);
      expect(stored.rows[0].consumed_at).toBeNull();
    });

    it("resets a password once, rejects the old password, and rejects token reuse", async () => {
      const session = await registerUser(app);
      const result = await requestPasswordResetForEmail({ email: session.user.email });
      const token = result.token ?? "";
      const newPassword = "new-password-456";

      const resetResponse = await request(app)
        .post("/api/auth/password-reset/complete")
        .send({ token, newPassword });

      expect(resetResponse.status).toBe(200);
      expect(resetResponse.headers["set-cookie"]).toBeUndefined();

      const oldLogin = await request(app)
        .post("/api/auth/login")
        .send({ email: session.user.email, password: session.password });
      const newLogin = await request(app)
        .post("/api/auth/login")
        .send({ email: session.user.email, password: newPassword });
      const reuse = await request(app)
        .post("/api/auth/password-reset/complete")
        .send({ token, newPassword: "another-password-789" });

      expect(oldLogin.status).toBe(401);
      expect(newLogin.status).toBe(200);
      expect(reuse.status).toBe(400);
      expect(reuse.body.error).toBe("Password reset link is invalid or expired");
    });

    it("rejects expired, malformed, and unknown reset tokens safely", async () => {
      const session = await registerUser(app);
      const result = await requestPasswordResetForEmail({ email: session.user.email });
      const token = result.token ?? "";
      const tokenParts = token.split(".");

      await pool.query(
        `update password_reset_tokens
         set created_at = now() - interval '2 hours',
             expires_at = now() - interval '1 minute'
         where token_lookup_key = $1`,
        [tokenParts[1]]
      );

      const expired = await request(app)
        .post("/api/auth/password-reset/complete")
        .send({ token, newPassword: "new-password-456" });
      const malformed = await request(app)
        .post("/api/auth/password-reset/complete")
        .send({ token: "not-a-reset-token", newPassword: "new-password-456" });
      const unknown = await request(app)
        .post("/api/auth/password-reset/complete")
        .send({
          token: `prt.${tokenParts[1]}.wrong-secret`,
          newPassword: "new-password-456"
        });

      expect(expired.status).toBe(400);
      expect(malformed.status).toBe(400);
      expect(unknown.status).toBe(400);
      expect(expired.body).toEqual(malformed.body);
      expect(unknown.body).toEqual(malformed.body);
    });

    it("requires authentication for logged-in reset initiation", async () => {
      const unauthenticated = await request(app).post("/api/auth/me/password-reset/request");
      const session = await registerUser(app);
      const authenticated = await request(app)
        .post("/api/auth/me/password-reset/request")
        .set("Cookie", session.cookie)
        .send({});

      expect(unauthenticated.status).toBe(401);
      expect(authenticated.status).toBe(200);
      expect(authenticated.body).toEqual({ message: genericPasswordResetMessage });
      expect(authenticated.headers["set-cookie"]).toBeUndefined();
    });

    it("rate limits repeated public reset requests", async () => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const response = await request(app)
          .post("/api/auth/password-reset/request")
          .send({ email: uniqueEmail("rate-reset") });

        expect(response.status).toBe(200);
      }

      const limitedResponse = await request(app)
        .post("/api/auth/password-reset/request")
        .send({ email: uniqueEmail("rate-reset") });

      expect(limitedResponse.status).toBe(429);
      expect(limitedResponse.body).toEqual({
        error: "Too many authentication attempts. Please try again later."
      });
    });

    it("rate limits repeated reset completion attempts", async () => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const response = await request(app)
          .post("/api/auth/password-reset/complete")
          .send({ token: `prt.lookup-${attempt}.wrong-secret`, newPassword: "new-password-456" });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe("Password reset link is invalid or expired");
      }

      const limitedResponse = await request(app)
        .post("/api/auth/password-reset/complete")
        .send({ token: "prt.lookup-limited.wrong-secret", newPassword: "new-password-456" });

      expect(limitedResponse.status).toBe(429);
      expect(limitedResponse.body).toEqual({
        error: "Too many authentication attempts. Please try again later."
      });
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
