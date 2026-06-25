import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import {
  buildSoftwareReleaseNotesResponse,
  parseSoftwareReleaseNote
} from "../src/services/releaseNotes.js";
import { registerAdmin, registerUser } from "./helpers/factories.js";

const app = createApp();

describe("admin release notes", () => {
  it("rejects unauthenticated and non-admin release-note access", async () => {
    const user = await registerUser(app);

    const unauthenticatedResponse = await request(app).get("/api/admin/releases");
    const userResponse = await request(app).get("/api/admin/releases").set("Cookie", user.cookie);

    expect(unauthenticatedResponse.status).toBe(401);
    expect(userResponse.status).toBe(403);
  });

  it("returns current version and release history to admins", async () => {
    const admin = await registerAdmin(app);

    const response = await request(app).get("/api/admin/releases").set("Cookie", admin.cookie);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      currentVersion: "0.1.1",
      releases: expect.any(Array)
    });
    expect(response.body.releases[0]).toMatchObject({
      version: "0.1.1",
      title: "Admin Release Notes",
      releasedAt: "2026-06-25",
      summary: expect.any(String),
      sections: expect.any(Array)
    });
    expect(response.body.releases[0].sections[0]).toMatchObject({
      heading: expect.any(String),
      items: expect.any(Array)
    });
  });

  it("parses valid release markdown and rejects malformed notes", () => {
    const parsed = parseSoftwareReleaseNote(
      `# v1.2.3 - Test Release\n\nRelease date: 2026-06-25\n\nSummary: A small test release.\n\n## Added\n\n- Admin release notes.\n`,
      { expectedVersion: "1.2.3", sourceName: "v1.2.3.md" }
    );

    expect(parsed).toMatchObject({
      version: "1.2.3",
      title: "Test Release",
      releasedAt: "2026-06-25",
      summary: "A small test release.",
      sections: [{ heading: "Added", items: ["Admin release notes."] }]
    });

    expect(() =>
      parseSoftwareReleaseNote(
        `# v1.2.3 - Broken\n\nRelease date: 2026-06-25\n\nSummary: Missing bullets.\n\n## Added\n`,
        { expectedVersion: "1.2.3", sourceName: "v1.2.3.md" }
      )
    ).toThrow(/must include bullet items/);

    expect(() =>
      parseSoftwareReleaseNote(
        `# v1.2.3 - Broken\n\nRelease date: 2026-06-25\n\nSummary: Blank bullet.\n\n## Added\n\n-   \n`,
        { expectedVersion: "1.2.3", sourceName: "v1.2.3.md" }
      )
    ).toThrow(/bullet items cannot be blank/);
  });

  it("builds a response whose latest release matches the root app version", () => {
    const response = buildSoftwareReleaseNotesResponse();

    expect(response.currentVersion).toBe("0.1.1");
    expect(response.releases[0].version).toBe(response.currentVersion);
  });
});
