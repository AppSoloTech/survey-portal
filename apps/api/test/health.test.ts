import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { setDatabaseHealthCheckForTests } from "../src/db.js";

const app = createApp();

describe("health routes", () => {
  it("returns liveness without checking the database", async () => {
    setDatabaseHealthCheckForTests(async () => {
      throw new Error("database should not be checked");
    });

    const response = await request(app).get("/api/health/live");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "ok",
      app: "survey-portal",
      database: "not_checked"
    });
  });

  it("returns readiness success when the database check passes", async () => {
    const response = await request(app).get("/api/health/ready");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "ok",
      database: "connected"
    });
  });

  it("returns readiness failure when the database check fails", async () => {
    setDatabaseHealthCheckForTests(async () => {
      throw new Error("simulated database outage");
    });

    const response = await request(app).get("/api/health/ready");

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      status: "unavailable",
      database: "unavailable"
    });
  });

  it("keeps /api/health as the readiness endpoint", async () => {
    setDatabaseHealthCheckForTests(async () => {
      throw new Error("simulated database outage");
    });

    const response = await request(app).get("/api/health");

    expect(response.status).toBe(503);
    expect(response.body.database).toBe("unavailable");
  });
});
