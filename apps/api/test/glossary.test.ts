import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { setDictionaryLookupOverrideForTests } from "../src/services/dictionary.js";
import {
  addOption,
  addPage,
  addQuestion,
  addTag,
  createDraftSurvey,
  deleteSurvey,
  findQuestion,
  registerAdmin,
  registerUser,
  setSurveyStatus,
  uniqueEmail
} from "./helpers/factories.js";

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

    const searchResponse = await request(app).get("/api/admin/glossary/question-search?q=risk");
    expect(searchResponse.status).toBe(401);
    expect(searchResponse.body.error).toBe("Authentication required");
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

    const questionSearchResponse = await request(app)
      .get("/api/admin/glossary/question-search?q=risk")
      .set("Cookie", user.cookie);
    expect(questionSearchResponse.status).toBe(403);
  });

  it("returns empty question-search results for blank or short queries", async () => {
    const admin = await registerAdmin(app);
    const survey = await createDraftSurvey(app, admin, "Short query assessment");
    await addQuestion(app, admin, survey.id, {
      pageId: survey.pages[0].id,
      questionText: "Describe risk controls"
    });

    const blankResponse = await request(app)
      .get("/api/admin/glossary/question-search?q=%20%20")
      .set("Cookie", admin.cookie);
    expect(blankResponse.status).toBe(200);
    expect(blankResponse.body).toEqual({
      limit: 20,
      minQueryLength: 2,
      query: "",
      results: []
    });

    const shortResponse = await request(app)
      .get("/api/admin/glossary/question-search?q=r")
      .set("Cookie", admin.cookie);
    expect(shortResponse.status).toBe(200);
    expect(shortResponse.body).toEqual({
      limit: 20,
      minQueryLength: 2,
      query: "r",
      results: []
    });
  });

  it("validates and caps question-search limits", async () => {
    const admin = await registerAdmin(app);

    const invalidResponse = await request(app)
      .get("/api/admin/glossary/question-search?q=risk&limit=bad")
      .set("Cookie", admin.cookie);
    expect(invalidResponse.status).toBe(400);
    expect(invalidResponse.body.error).toBe("limit must be a positive integer");

    const cappedResponse = await request(app)
      .get("/api/admin/glossary/question-search?q=risk&limit=500")
      .set("Cookie", admin.cookie);
    expect(cappedResponse.status).toBe(200);
    expect(cappedResponse.body).toMatchObject({
      limit: 50,
      query: "risk",
      results: []
    });
  });

  it("searches draft and published question text while excluding retired and soft-deleted assessments", async () => {
    const admin = await registerAdmin(app);
    const draftSurvey = await createDraftSurvey(app, admin, "Draft Fire Assessment");
    await addQuestion(app, admin, draftSurvey.id, {
      pageId: draftSurvey.pages[0].id,
      questionText: "Inspect fire extinguisher monthly"
    });

    let publishedSurvey = await createDraftSurvey(app, admin, "Published Fire Assessment");
    publishedSurvey = await addQuestion(app, admin, publishedSurvey.id, {
      pageId: publishedSurvey.pages[0].id,
      questionText: "Fire drill checklist"
    });
    await setSurveyStatus(app, admin, publishedSurvey.id, "published");

    let retiredSurvey = await createDraftSurvey(app, admin, "Retired Fire Assessment");
    retiredSurvey = await addQuestion(app, admin, retiredSurvey.id, {
      pageId: retiredSurvey.pages[0].id,
      questionText: "Fire retired question"
    });
    await setSurveyStatus(app, admin, retiredSurvey.id, "retired");

    let deletedSurvey = await createDraftSurvey(app, admin, "Deleted Fire Assessment");
    deletedSurvey = await addQuestion(app, admin, deletedSurvey.id, {
      pageId: deletedSurvey.pages[0].id,
      questionText: "Fire deleted question"
    });
    await deleteSurvey(app, admin, deletedSurvey.id);

    const response = await request(app)
      .get("/api/admin/glossary/question-search?q=%20fire%20")
      .set("Cookie", admin.cookie);

    expect(response.status).toBe(200);
    expect(response.body.query).toBe("fire");
    expect(response.body.results.map((result: { assessment: { title: string } }) => result.assessment.title))
      .toEqual(["Published Fire Assessment", "Draft Fire Assessment"]);
    expect(response.body.results.map((result: { assessment: { status: string } }) => result.assessment.status))
      .toEqual(["published", "draft"]);
  });

  it("returns question-search context, required offsets, and no hidden metadata", async () => {
    const admin = await registerAdmin(app);
    let survey = await createDraftSurvey(app, admin, "Shape Assessment");
    survey = await addQuestion(app, admin, survey.id, {
      pageId: survey.pages[0].id,
      questionText: "Describe risk controls",
      questionType: "single_select"
    });
    const question = findQuestion(survey, "Describe risk controls");
    survey = await addOption(app, admin, survey.id, question.id, "Yes");
    const option = findQuestion(survey, "Describe risk controls").answerOptions[0];
    await addTag(app, admin, survey.id, question.id, option.id, "hidden", "internal");

    const response = await request(app)
      .get("/api/admin/glossary/question-search?q=RISK")
      .set("Cookie", admin.cookie);

    expect(response.status).toBe(200);
    expect(response.body.results).toHaveLength(1);
    expect(response.body.results[0]).toEqual({
      assessment: {
        id: survey.id,
        status: "draft",
        title: "Shape Assessment"
      },
      match: {
        end: 13,
        start: 9
      },
      page: {
        displayOrder: 1,
        id: survey.pages[0].id,
        title: survey.pages[0].title
      },
      question: {
        displayOrder: 1,
        id: question.id,
        questionText: "Describe risk controls"
      }
    });
    expect(response.body.results[0]).not.toHaveProperty("answerOptions");
    expect(response.body.results[0]).not.toHaveProperty("answerTags");
    expect(response.body.results[0]).not.toHaveProperty("responses");
    expect(response.body.results[0]).not.toHaveProperty("sourceProvider");
  });

  it("orders question-search results deterministically", async () => {
    const admin = await registerAdmin(app);

    const laterMatchSurvey = await createDraftSurvey(app, admin, "000 Later Match Assessment");
    await addQuestion(app, admin, laterMatchSurvey.id, {
      pageId: laterMatchSurvey.pages[0].id,
      questionText: "Check risk controls"
    });

    const alphaSurvey = await createDraftSurvey(app, admin, "AAA Ordering Assessment");
    await addQuestion(app, admin, alphaSurvey.id, {
      pageId: alphaSurvey.pages[0].id,
      questionText: "Risk title order"
    });

    let pageSurvey = await createDraftSurvey(app, admin, "Ordering Page Assessment");
    const firstPage = pageSurvey.pages[0];
    pageSurvey = await addPage(app, admin, pageSurvey.id, {
      displayOrder: 2,
      title: "Second page"
    });
    const secondPage = pageSurvey.pages.find((page) => page.title === "Second page");

    if (!secondPage) {
      throw new Error("Expected second page to be created");
    }

    await addQuestion(app, admin, pageSurvey.id, {
      displayOrder: 1,
      pageId: firstPage.id,
      questionText: "Risk first-page first-question"
    });
    await addQuestion(app, admin, pageSurvey.id, {
      displayOrder: 2,
      pageId: firstPage.id,
      questionText: "Risk first-page second-question"
    });
    await addQuestion(app, admin, pageSurvey.id, {
      displayOrder: 1,
      pageId: secondPage.id,
      questionText: "Risk second-page first-question"
    });

    const limitedResponse = await request(app)
      .get("/api/admin/glossary/question-search?q=risk&limit=1")
      .set("Cookie", admin.cookie);
    expect(limitedResponse.status).toBe(200);
    expect(limitedResponse.body.results).toHaveLength(1);

    const response = await request(app)
      .get("/api/admin/glossary/question-search?q=risk")
      .set("Cookie", admin.cookie);

    expect(response.status).toBe(200);
    expect(
      response.body.results.map(
        (result: { assessment: { title: string }; question: { questionText: string } }) =>
          `${result.assessment.title}: ${result.question.questionText}`
      )
    ).toEqual([
      "AAA Ordering Assessment: Risk title order",
      "Ordering Page Assessment: Risk first-page first-question",
      "Ordering Page Assessment: Risk first-page second-question",
      "Ordering Page Assessment: Risk second-page first-question",
      "000 Later Match Assessment: Check risk controls"
    ]);
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
