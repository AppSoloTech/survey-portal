import request, { type Response } from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { config } from "../src/config.js";
import { isAllowedBrowserOriginForConfig } from "../src/middleware/security.js";

const app = createApp();
const allowedOrigin = config.webOrigin;

describe("security hardening", () => {
  it("sets centralized browser security headers", async () => {
    const response = await request(app).get("/api/health/live");

    expect(response.status).toBe(200);
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["cross-origin-opener-policy"]).toBe("same-origin");
    expect(response.headers["permissions-policy"]).toContain("camera=()");
    expect(response.headers["content-security-policy"]).toContain("script-src 'self'");
    expect(response.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  });

  it("requires CSRF tokens for same-origin browser unsafe requests", async () => {
    const missingToken = await request(app)
      .post("/api/auth/register")
      .set("Origin", allowedOrigin)
      .send({
        first_name: "Csrf",
        last_name: "Missing",
        email: "csrf-missing@example.com",
        password: "test-password-123"
      });

    expect(missingToken.status).toBe(403);
    expect(missingToken.body.error).toBe("CSRF token is invalid or missing");

    const csrf = await request(app).get("/api/auth/csrf");
    const csrfToken = csrf.body.csrfToken as string;
    const csrfCookie = extractCookie(csrf, "survey_portal_csrf");
    const validToken = await request(app)
      .post("/api/auth/register")
      .set("Origin", allowedOrigin)
      .set("Cookie", csrfCookie)
      .set("X-CSRF-Token", csrfToken)
      .send({
        first_name: "Csrf",
        last_name: "Present",
        email: "csrf-present@example.com",
        password: "test-password-123"
      });

    expect(validToken.status).toBe(201);
    expect(extractCookie(validToken, "survey_portal_auth")).toMatch(/^survey_portal_auth=/);
  });

  it("accepts equivalent loopback browser origins in development", async () => {
    const csrf = await request(app).get("/api/auth/csrf");
    const csrfToken = csrf.body.csrfToken as string;
    const csrfCookie = extractCookie(csrf, "survey_portal_csrf");
    const response = await request(app)
      .post("/api/auth/register")
      .set("Origin", "http://127.0.0.1:5173")
      .set("Cookie", csrfCookie)
      .set("X-CSRF-Token", csrfToken)
      .send({
        first_name: "Loopback",
        last_name: "Alias",
        email: "loopback-alias@example.com",
        password: "test-password-123"
      });

    expect(response.status).toBe(201);
  });

  it("requires exact configured browser origin in production", () => {
    expect(
      isAllowedBrowserOriginForConfig("https://survey.example.com", {
        isProduction: true,
        webOrigin: "https://survey.example.com"
      })
    ).toBe(true);
    expect(
      isAllowedBrowserOriginForConfig("https://www.survey.example.com", {
        isProduction: true,
        webOrigin: "https://survey.example.com"
      })
    ).toBe(false);
    expect(
      isAllowedBrowserOriginForConfig("http://127.0.0.1:5173", {
        isProduction: true,
        webOrigin: "http://localhost:5173"
      })
    ).toBe(false);
  });

  it("rejects unsafe browser requests from disallowed origins", async () => {
    const response = await request(app)
      .post("/api/auth/logout")
      .set("Origin", "https://evil.example")
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("Request origin is not allowed");
  });
});

function extractCookie(response: Response, name: string): string {
  const rawHeader = response.headers["set-cookie"];
  const cookies: string[] = Array.isArray(rawHeader) ? rawHeader : rawHeader ? [rawHeader] : [];
  const cookie = cookies.find((value) => value.startsWith(`${name}=`));

  if (!cookie) {
    throw new Error(`Expected response to set ${name}`);
  }

  return cookie.split(";")[0];
}
