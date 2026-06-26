import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { setDictionaryLookupOverrideForTests } from "../src/services/dictionary.js";
import { registerAdmin, registerUser, uniqueEmail } from "./helpers/factories.js";

const app = createApp();

let glossaryCounter = 0;

function uniqueTerm(prefix = "Term"): string {
  glossaryCounter += 1;
  return `${prefix} ${uniqueEmail("glossary").split("@")[0]} ${glossaryCounter}`;
}

async function createGlossaryEntry(
  admin: { cookie: string },
  overrides: Partial<{
    aliases: string[];
    canonicalTerm: string;
    definition: string;
    isEnabled: boolean;
  }> = {}
) {
  const canonicalTerm = overrides.canonicalTerm ?? uniqueTerm();
  const response = await request(app)
    .post("/api/admin/glossary")
    .set("Cookie", admin.cookie)
    .send({
      aliases: overrides.aliases ?? [`${canonicalTerm} alias`],
      canonicalTerm,
      definition: overrides.definition ?? `${canonicalTerm} definition`,
      isEnabled: overrides.isEnabled ?? true
    });

  if (response.status !== 201) {
    throw new Error(`Glossary create failed with ${response.status}: ${JSON.stringify(response.body)}`);
  }

  return response.body.entry as {
    aliases: { isCanonical: boolean; matchText: string }[];
    canonicalTerm: string;
    definition: string;
    id: number;
    isEnabled: boolean;
  };
}

afterEach(() => {
  setDictionaryLookupOverrideForTests(null);
});

describe("admin glossary", () => {
  it("rejects unauthenticated glossary requests", async () => {
    const response = await request(app).get("/api/admin/glossary");

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Authentication required");
  });

  it("rejects non-admin access to glossary management routes", async () => {
    const user = await registerUser(app);

    const listResponse = await request(app).get("/api/admin/glossary").set("Cookie", user.cookie);
    expect(listResponse.status).toBe(403);

    const createResponse = await request(app)
      .post("/api/admin/glossary")
      .set("Cookie", user.cookie)
      .send({ canonicalTerm: "Risk", definition: "Exposure", aliases: [] });
    expect(createResponse.status).toBe(403);

    const updateResponse = await request(app)
      .put("/api/admin/glossary/1")
      .set("Cookie", user.cookie)
      .send({ canonicalTerm: "Risk", definition: "Exposure", aliases: [] });
    expect(updateResponse.status).toBe(403);

    const deleteResponse = await request(app)
      .delete("/api/admin/glossary/1")
      .set("Cookie", user.cookie);
    expect(deleteResponse.status).toBe(403);

    const participantSafeResponse = await request(app)
      .get("/api/admin/glossary/participant-safe")
      .set("Cookie", user.cookie);
    expect(participantSafeResponse.status).toBe(403);

    const lookupResponse = await request(app)
      .post("/api/admin/glossary/lookup")
      .set("Cookie", user.cookie)
      .send({ term: "Risk" });
    expect(lookupResponse.status).toBe(403);
  });

  it("returns disabled-provider lookup state without blocking manual entry", async () => {
    const admin = await registerAdmin(app);

    const response = await request(app)
      .post("/api/admin/glossary/lookup")
      .set("Cookie", admin.cookie)
      .send({ term: "Risk" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      message: "Dictionary suggestions are not configured. Enter the definition manually.",
      status: "not_configured",
      suggestions: [],
      term: "Risk"
    });
  });

  it("returns mocked lookup suggestions through the admin-only endpoint", async () => {
    const admin = await registerAdmin(app);
    setDictionaryLookupOverrideForTests(async (term) => ({
      message: "Review the suggested definition before saving.",
      providerLabel: "Mock Dictionary",
      spellingSuggestions: [],
      status: "found",
      suggestions: [
        {
          definition: "A mocked definition.",
          sourceLookupAt: "2026-06-26T12:00:00.000Z",
          sourceProvider: "mock-dictionary",
          sourceReference: "mock:risk"
        }
      ],
      term
    }));

    const response = await request(app)
      .post("/api/admin/glossary/lookup")
      .set("Cookie", admin.cookie)
      .send({ term: "Risk" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "found",
      suggestions: [
        {
          definition: "A mocked definition.",
          sourceProvider: "mock-dictionary",
          sourceReference: "mock:risk"
        }
      ],
      term: "Risk"
    });
  });

  it("creates, lists, updates, and archives glossary entries", async () => {
    const admin = await registerAdmin(app);
    const created = await createGlossaryEntry(admin, {
      aliases: ["Hazard", "Exposure"],
      canonicalTerm: "Risk",
      definition: "A chance of harm."
    });

    expect(created).toMatchObject({
      canonicalTerm: "Risk",
      definition: "A chance of harm.",
      isEnabled: true
    });
    expect(created.aliases.map((alias) => alias.matchText)).toEqual(["Risk", "Hazard", "Exposure"]);
    expect(created.aliases[0].isCanonical).toBe(true);

    const listResponse = await request(app).get("/api/admin/glossary").set("Cookie", admin.cookie);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.entries.some((entry: { id: number }) => entry.id === created.id)).toBe(
      true
    );

    const updateResponse = await request(app)
      .put(`/api/admin/glossary/${created.id}`)
      .set("Cookie", admin.cookie)
      .send({
        aliases: ["Hazards"],
        canonicalTerm: "Risk profile",
        definition: "The current chance of harm.",
        isEnabled: false
      });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.entry).toMatchObject({
      canonicalTerm: "Risk profile",
      definition: "The current chance of harm.",
      isEnabled: false
    });
    expect(updateResponse.body.entry.aliases.map((alias: { matchText: string }) => alias.matchText)).toEqual([
      "Risk profile",
      "Hazards"
    ]);

    const deleteResponse = await request(app)
      .delete(`/api/admin/glossary/${created.id}`)
      .set("Cookie", admin.cookie);
    expect(deleteResponse.status).toBe(200);

    const finalList = await request(app).get("/api/admin/glossary").set("Cookie", admin.cookie);
    expect(finalList.body.entries.some((entry: { id: number }) => entry.id === created.id)).toBe(false);
  });

  it("rejects duplicate canonical terms and aliases case-insensitively", async () => {
    const admin = await registerAdmin(app);
    await createGlossaryEntry(admin, {
      aliases: ["Material Safety Data Sheet"],
      canonicalTerm: "MSDS"
    });

    const duplicateCanonical = await request(app)
      .post("/api/admin/glossary")
      .set("Cookie", admin.cookie)
      .send({
        aliases: [],
        canonicalTerm: "msds",
        definition: "Duplicate canonical."
      });
    expect(duplicateCanonical.status).toBe(409);
    expect(duplicateCanonical.body.error).toBe("Glossary match string already exists");

    const duplicateAlias = await request(app)
      .post("/api/admin/glossary")
      .set("Cookie", admin.cookie)
      .send({
        aliases: ["material safety data sheet"],
        canonicalTerm: uniqueTerm("Different"),
        definition: "Duplicate alias."
      });
    expect(duplicateAlias.status).toBe(409);

    const duplicateWithinPayload = await request(app)
      .post("/api/admin/glossary")
      .set("Cookie", admin.cookie)
      .send({
        aliases: ["Fall protection", "fall protection"],
        canonicalTerm: uniqueTerm("Local duplicate"),
        definition: "Duplicate aliases."
      });
    expect(duplicateWithinPayload.status).toBe(400);
    expect(duplicateWithinPayload.body.error).toBe("Glossary match strings must be unique");
  });

  it("excludes disabled entries and admin metadata from the participant-safe payload", async () => {
    const admin = await registerAdmin(app);
    const enabled = await createGlossaryEntry(admin, {
      aliases: ["PPE"],
      canonicalTerm: "Personal protective equipment",
      definition: "Equipment worn to reduce exposure."
    });
    await createGlossaryEntry(admin, {
      canonicalTerm: "Disabled term",
      isEnabled: false
    });

    const response = await request(app)
      .get("/api/admin/glossary/participant-safe")
      .set("Cookie", admin.cookie);

    expect(response.status).toBe(200);
    expect(response.body.entries).toEqual([
      {
        id: enabled.id,
        canonicalTerm: "Personal protective equipment",
        definition: "Equipment worn to reduce exposure.",
        matchStrings: ["Personal protective equipment", "PPE"]
      }
    ]);
    expect(response.body.entries[0]).not.toHaveProperty("definitionSource");
    expect(response.body.entries[0]).not.toHaveProperty("sourceProvider");
  });

  it("saves dictionary source metadata only when explicitly requested", async () => {
    const admin = await registerAdmin(app);

    const createResponse = await request(app)
      .post("/api/admin/glossary")
      .set("Cookie", admin.cookie)
      .send({
        aliases: [],
        canonicalTerm: uniqueTerm("Suggested"),
        definition: "A suggested definition edited by an admin.",
        definitionSource: "dictionary_suggested",
        isEnabled: true,
        sourceLookupAt: "2026-06-26T12:00:00.000Z",
        sourceProvider: "merriam-webster-collegiate",
        sourceReference: "collegiate:risk"
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.entry).toMatchObject({
      definitionSource: "dictionary_suggested",
      sourceLookupAt: "2026-06-26T12:00:00.000Z",
      sourceProvider: "merriam-webster-collegiate",
      sourceReference: "collegiate:risk"
    });

    const updateResponse = await request(app)
      .put(`/api/admin/glossary/${createResponse.body.entry.id}`)
      .set("Cookie", admin.cookie)
      .send({
        aliases: [],
        canonicalTerm: createResponse.body.entry.canonicalTerm,
        definition: "Manual replacement.",
        definitionSource: "manual",
        isEnabled: true,
        sourceLookupAt: null,
        sourceProvider: null,
        sourceReference: null
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.entry).toMatchObject({
      definition: "Manual replacement.",
      definitionSource: "manual",
      sourceLookupAt: null,
      sourceProvider: null,
      sourceReference: null
    });
  });

  it("rejects incomplete dictionary source metadata", async () => {
    const admin = await registerAdmin(app);

    const response = await request(app)
      .post("/api/admin/glossary")
      .set("Cookie", admin.cookie)
      .send({
        aliases: [],
        canonicalTerm: uniqueTerm("Incomplete source"),
        definition: "Definition from a provider.",
        definitionSource: "dictionary_suggested",
        isEnabled: true,
        sourceProvider: "merriam-webster-collegiate"
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe(
      "Dictionary-suggested definitions require sourceProvider, sourceReference, and sourceLookupAt"
    );
  });

  it("clears source metadata for direct manual API saves", async () => {
    const admin = await registerAdmin(app);

    const response = await request(app)
      .post("/api/admin/glossary")
      .set("Cookie", admin.cookie)
      .send({
        aliases: [],
        canonicalTerm: uniqueTerm("Manual with stale source"),
        definition: "Manual definition.",
        definitionSource: "manual",
        isEnabled: true,
        sourceLookupAt: "2026-06-26T12:00:00.000Z",
        sourceProvider: "merriam-webster-collegiate",
        sourceReference: "collegiate:risk"
      });

    expect(response.status).toBe(201);
    expect(response.body.entry).toMatchObject({
      definitionSource: "manual",
      sourceLookupAt: null,
      sourceProvider: null,
      sourceReference: null
    });
  });

  it("validates empty and long glossary fields", async () => {
    const admin = await registerAdmin(app);

    const emptyTerm = await request(app)
      .post("/api/admin/glossary")
      .set("Cookie", admin.cookie)
      .send({ canonicalTerm: " ", definition: "Definition", aliases: [] });
    expect(emptyTerm.status).toBe(400);
    expect(emptyTerm.body.error).toBe("Canonical term is required");

    const emptyDefinition = await request(app)
      .post("/api/admin/glossary")
      .set("Cookie", admin.cookie)
      .send({ canonicalTerm: uniqueTerm("Empty definition"), definition: " ", aliases: [] });
    expect(emptyDefinition.status).toBe(400);
    expect(emptyDefinition.body.error).toBe("Definition is required");

    const longAlias = await request(app)
      .post("/api/admin/glossary")
      .set("Cookie", admin.cookie)
      .send({
        aliases: ["a".repeat(121)],
        canonicalTerm: uniqueTerm("Long alias"),
        definition: "Definition"
      });
    expect(longAlias.status).toBe(400);
    expect(longAlias.body.error).toBe("Aliases must be 120 characters or fewer");

    const unsupportedSource = await request(app)
      .post("/api/admin/glossary")
      .set("Cookie", admin.cookie)
      .send({
        aliases: [],
        canonicalTerm: uniqueTerm("Bad source"),
        definition: "Definition",
        definitionSource: "external"
      });
    expect(unsupportedSource.status).toBe(400);
    expect(unsupportedSource.body.error).toBe("definitionSource must be manual or dictionary_suggested");
  });
});
