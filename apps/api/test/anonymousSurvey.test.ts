import request, { type Response } from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { pool } from "../src/db.js";
import {
  addOption,
  addQuestion,
  addTag,
  collectObjectKeys,
  completeAttempt,
  createCategory,
  createDraftSurvey,
  createGlossaryEntry,
  deleteSurvey,
  extractAuthCookie,
  findQuestion,
  registerAdmin,
  registerUser,
  setSurveyStatus,
  startAttempt,
  submitAnswer,
  uniqueEmail
} from "./helpers/factories.js";

const app = createApp();

describe("anonymous survey links", () => {
  it("keeps link management admin-only and limited to published surveys", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    let survey = await createDraftSurvey(app, admin, "Anonymous admin controls");
    survey = await addQuestion(app, admin, survey.id, { questionText: "Ready?" });

    const forbidden = await request(app)
      .post(`/api/surveys/${survey.id}/anonymous-links`)
      .set("Cookie", user.cookie)
      .send({});

    expect(forbidden.status).toBe(403);

    const draftCreate = await request(app)
      .post(`/api/surveys/${survey.id}/anonymous-links`)
      .set("Cookie", admin.cookie)
      .send({});

    expect(draftCreate.status).toBe(409);

    survey = await setSurveyStatus(app, admin, survey.id, "published");

    const created = await createAnonymousLink(admin.cookie, survey.id);
    expect(created.link.enabled).toBe(true);
    expect(created.link.listedInPublicDirectory).toBe(false);
    expect(created.link.publicUrl).toContain("/anonymous-surveys/asl.");

    const list = await request(app)
      .get(`/api/surveys/${survey.id}/anonymous-links`)
      .set("Cookie", admin.cookie);

    expect(list.status).toBe(200);
    expect(list.body.links).toHaveLength(1);
    expect(list.body.links[0].publicUrl).toBe(created.link.publicUrl);
    expect(list.body.links[0].listedInPublicDirectory).toBe(false);

    const forbiddenDirectoryToggle = await request(app)
      .patch(`/api/surveys/${survey.id}/anonymous-links/${created.link.id}/public-directory`)
      .set("Cookie", user.cookie)
      .send({ listedInPublicDirectory: true });

    expect(forbiddenDirectoryToggle.status).toBe(403);

    const invalidDirectoryToggle = await request(app)
      .patch(`/api/surveys/${survey.id}/anonymous-links/${created.link.id}/public-directory`)
      .set("Cookie", admin.cookie)
      .send({ listedInPublicDirectory: "true" });

    expect(invalidDirectoryToggle.status).toBe(400);

    const listed = await request(app)
      .patch(`/api/surveys/${survey.id}/anonymous-links/${created.link.id}/public-directory`)
      .set("Cookie", admin.cookie)
      .send({ listedInPublicDirectory: true });

    expect(listed.status).toBe(200);
    expect(listed.body.link.listedInPublicDirectory).toBe(true);

    const stored = await pool.query<{ public_token: string | null }>(
      `select public_token
       from anonymous_survey_links
       where id = $1`,
      [created.link.id]
    );

    expect(stored.rows[0].public_token).toMatch(/^enc:v1:/);
    expect(stored.rows[0].public_token).not.toContain(created.token);

    const rotated = await request(app)
      .post(`/api/surveys/${survey.id}/anonymous-links/${created.link.id}/rotate`)
      .set("Cookie", admin.cookie)
      .send({ expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() });

    expect(rotated.status).toBe(201);
    expect(rotated.body.disabledLink.id).toBe(created.link.id);
    expect(rotated.body.disabledLink.enabled).toBe(false);
    expect(rotated.body.disabledLink.listedInPublicDirectory).toBe(false);
    expect(rotated.body.link.enabled).toBe(true);
    expect(rotated.body.link.listedInPublicDirectory).toBe(false);
    expect(rotated.body.link.publicUrl).toContain("/anonymous-surveys/asl.");

    const oldUnavailable = await request(app).get(`/api/anonymous-surveys/${created.token}`);
    expect(oldUnavailable.status).toBe(404);

    const rotatedToken = (rotated.body.link.publicUrl as string).split("/").at(-1);
    expect(rotatedToken).toBeTruthy();
    const rotatedAvailable = await request(app).get(`/api/anonymous-surveys/${rotatedToken}`);
    expect(rotatedAvailable.status).toBe(200);

    const disabled = await request(app)
      .patch(`/api/surveys/${survey.id}/anonymous-links/${rotated.body.link.id}/disable`)
      .set("Cookie", admin.cookie)
      .send({});

    expect(disabled.status).toBe(200);
    expect(disabled.body.link.enabled).toBe(false);
    expect(disabled.body.link.listedInPublicDirectory).toBe(false);
    expect(disabled.body.link.publicUrl).toBeUndefined();

    const unavailable = await request(app).get(`/api/anonymous-surveys/${rotatedToken}`);
    expect(unavailable.status).toBe(404);
  });

  it("serves only explicitly listed eligible links in the public directory", async () => {
    const admin = await registerAdmin(app);
    const category = await createCategory(app, admin, "Public anonymous");
    let listedSurvey = await createDraftSurvey(app, admin, "Listed public survey");

    listedSurvey = await request(app)
      .put(`/api/surveys/${listedSurvey.id}`)
      .set("Cookie", admin.cookie)
      .send({
        title: listedSurvey.title,
        description: "Participant-safe summary",
        status: listedSurvey.status,
        categoryId: category.id
      })
      .then((response) => {
        expect(response.status).toBe(200);
        return response.body.survey;
      });
    listedSurvey = await addQuestion(app, admin, listedSurvey.id, {
      questionText: "Directory visible?",
      questionType: "single_select"
    });
    const listedQuestion = findQuestion(listedSurvey, "Directory visible?");
    listedSurvey = await addOption(app, admin, listedSurvey.id, listedQuestion.id, "Yes");
    const listedOption = findQuestion(listedSurvey, "Directory visible?").answerOptions[0];
    listedSurvey = await addTag(
      app,
      admin,
      listedSurvey.id,
      listedQuestion.id,
      listedOption.id,
      "internal",
      "hidden"
    );
    listedSurvey = await setSurveyStatus(app, admin, listedSurvey.id, "published");
    const listedLink = await createAnonymousLink(admin.cookie, listedSurvey.id);

    await setDirectoryListing(admin.cookie, listedSurvey.id, listedLink.link.id, true);

    const unlistedLink = await createAnonymousLink(admin.cookie, listedSurvey.id);
    const directUnlisted = await request(app).get(`/api/anonymous-surveys/${unlistedLink.token}`);

    expect(directUnlisted.status).toBe(200);

    const disabledLink = await createAnonymousLink(admin.cookie, listedSurvey.id);
    await setDirectoryListing(admin.cookie, listedSurvey.id, disabledLink.link.id, true);
    await request(app)
      .patch(`/api/surveys/${listedSurvey.id}/anonymous-links/${disabledLink.link.id}/disable`)
      .set("Cookie", admin.cookie)
      .send({});

    const expiredLink = await createAnonymousLink(admin.cookie, listedSurvey.id);
    await setDirectoryListing(admin.cookie, listedSurvey.id, expiredLink.link.id, true);
    await pool.query(
      `update anonymous_survey_links
       set expires_at = now() - interval '1 minute'
       where id = $1`,
      [expiredLink.link.id]
    );

    let retiredSurvey = await createDraftSurvey(app, admin, "Retired listed survey");
    retiredSurvey = await addQuestion(app, admin, retiredSurvey.id, { questionText: "Retired?" });
    retiredSurvey = await setSurveyStatus(app, admin, retiredSurvey.id, "published");
    const retiredLink = await createAnonymousLink(admin.cookie, retiredSurvey.id);
    await setDirectoryListing(admin.cookie, retiredSurvey.id, retiredLink.link.id, true);
    await pool.query(`update surveys set status = 'retired' where id = $1`, [retiredSurvey.id]);

    let deletedSurvey = await createDraftSurvey(app, admin, "Deleted listed survey");
    deletedSurvey = await addQuestion(app, admin, deletedSurvey.id, { questionText: "Deleted?" });
    deletedSurvey = await setSurveyStatus(app, admin, deletedSurvey.id, "published");
    const deletedLink = await createAnonymousLink(admin.cookie, deletedSurvey.id);
    await setDirectoryListing(admin.cookie, deletedSurvey.id, deletedLink.link.id, true);
    await deleteSurvey(app, admin, deletedSurvey.id);

    const directory = await request(app).get("/api/anonymous-survey-directory");

    expect(directory.status).toBe(200);
    expect(directory.headers["set-cookie"]).toBeUndefined();
    expect(directory.body.surveys).toHaveLength(1);
    expect(directory.body.surveys[0]).toEqual({
      surveyTitle: "Listed public survey",
      surveyDescription: "Participant-safe summary",
      categoryName: "Public anonymous",
      expiresAt: null,
      listedAt: expect.any(String),
      publicUrl: listedLink.link.publicUrl
    });
    expect([...collectObjectKeys(directory.body)]).not.toContain("answerTags");
    expect([...collectObjectKeys(directory.body)]).not.toContain("valueTags");
    expect([...collectObjectKeys(directory.body)]).not.toContain("otherTags");
    expect([...collectObjectKeys(directory.body)]).not.toContain("tokenSecretHash");
    expect([...collectObjectKeys(directory.body)]).not.toContain("publicToken");
    expect([...collectObjectKeys(directory.body)]).not.toContain("attemptAccessToken");
    expect(JSON.stringify(directory.body)).not.toContain("hidden");
    expect(JSON.stringify(directory.body)).not.toContain(unlistedLink.token);
  });

  it("rejects bad, expired, and survey-unavailable tokens safely", async () => {
    const admin = await registerAdmin(app);
    let survey = await createDraftSurvey(app, admin, "Unavailable anonymous links");
    survey = await addQuestion(app, admin, survey.id, { questionText: "Available?" });
    survey = await setSurveyStatus(app, admin, survey.id, "published");
    const created = await createAnonymousLink(admin.cookie, survey.id);

    const badToken = await request(app).get("/api/anonymous-surveys/not-a-token");
    expect(badToken.status).toBe(404);

    await pool.query(
      `update anonymous_survey_links
       set expires_at = now() - interval '1 minute'
       where id = $1`,
      [created.link.id]
    );

    const expired = await request(app).post(`/api/anonymous-surveys/${created.token}/start`).send({});
    expect(expired.status).toBe(404);

    const active = await createAnonymousLink(admin.cookie, survey.id);
    await pool.query(`update surveys set status = 'retired' where id = $1`, [survey.id]);

    const retired = await request(app).get(`/api/anonymous-surveys/${active.token}`);
    expect(retired.status).toBe(404);
  });

  it("lets anonymous visitors complete a survey without cookies or hidden tags", async () => {
    const admin = await registerAdmin(app);
    let survey = await createDraftSurvey(app, admin, "Anonymous lifecycle");
    survey = await addQuestion(app, admin, survey.id, {
      questionText: "Choose one",
      questionType: "single_select"
    });
    const question = findQuestion(survey, "Choose one");
    survey = await addOption(app, admin, survey.id, question.id, "Yes");
    const option = findQuestion(survey, "Choose one").answerOptions[0];
    survey = await addTag(app, admin, survey.id, question.id, option.id, "visibility", "hidden");
    survey = await setSurveyStatus(app, admin, survey.id, "published");

    const link = await createAnonymousLink(admin.cookie, survey.id);
    const publicRead = await request(app).get(`/api/anonymous-surveys/${link.token}`);

    expect(publicRead.status).toBe(200);
    expect(publicRead.headers["referrer-policy"]).toBe("no-referrer");
    expect([...collectObjectKeys(publicRead.body)]).not.toContain("answerTags");
    expect([...collectObjectKeys(publicRead.body)]).not.toContain("valueTags");

    const started = await request(app).post(`/api/anonymous-surveys/${link.token}/start`).send({});

    expect(started.status).toBe(201);
    expect(started.headers["set-cookie"]).toBeUndefined();
    expect(started.body.attempt.userId).toBeNull();
    expect(started.body.attempt.anonymousLinkId).toBe(link.link.id);
    expect(started.body.attemptAccessToken).toMatch(/^aat\./);
    expect([...collectObjectKeys(started.body)]).not.toContain("answerTags");

    const answer = await request(app)
      .post(`/api/anonymous-surveys/${link.token}/answer`)
      .send({
        attemptAccessToken: started.body.attemptAccessToken,
        attemptId: started.body.attempt.id,
        questionId: findQuestion(survey, "Choose one").id,
        selectedAnswerOptionIds: [option.id]
      });

    expect(answer.status).toBe(200);
    expect(answer.body.isCompleteReady).toBe(true);

    const earlyContactEmail = await request(app)
      .post(`/api/anonymous-surveys/${link.token}/contact-email`)
      .send({
        attemptAccessToken: started.body.attemptAccessToken,
        attemptId: started.body.attempt.id,
        email: "early@example.com"
      });

    expect(earlyContactEmail.status).toBe(409);

    const completed = await request(app)
      .post(`/api/anonymous-surveys/${link.token}/complete`)
      .send({
        attemptAccessToken: started.body.attemptAccessToken,
        attemptId: started.body.attempt.id
      });

    expect(completed.status).toBe(200);
    expect(completed.body.attempt.status).toBe("completed");
    expect(completed.body.attempt.anonymousContactEmail).toBeNull();

    const badContactEmail = await request(app)
      .post(`/api/anonymous-surveys/${link.token}/contact-email`)
      .send({
        attemptAccessToken: started.body.attemptAccessToken,
        attemptId: started.body.attempt.id,
        email: "not-an-email"
      });

    expect(badContactEmail.status).toBe(400);

    const contactEmail = await request(app)
      .post(`/api/anonymous-surveys/${link.token}/contact-email`)
      .send({
        attemptAccessToken: started.body.attemptAccessToken,
        attemptId: started.body.attempt.id,
        email: "FollowUp@Example.COM "
      });

    expect(contactEmail.status).toBe(200);
    expect(contactEmail.body.attempt.anonymousContactEmail).toBe("followup@example.com");

    const rows = await pool.query<{
      user_id: number | null;
      anonymous_link_id: number | null;
      anonymous_access_token_hash: string | null;
      anonymous_contact_email: string | null;
    }>(
      `select user_id, anonymous_link_id, anonymous_access_token_hash, anonymous_contact_email
       from survey_attempts
       where id = $1`,
      [started.body.attempt.id]
    );

    expect(rows.rows[0].user_id).toBeNull();
    expect(rows.rows[0].anonymous_link_id).toBe(link.link.id);
    expect(rows.rows[0].anonymous_access_token_hash).not.toBeNull();
    expect(rows.rows[0].anonymous_contact_email).toBe("followup@example.com");

    const detail = await request(app)
      .get(`/api/surveys/${survey.id}/attempts/${started.body.attempt.id}`)
      .set("Cookie", admin.cookie);

    expect(detail.status).toBe(200);
    expect(detail.body.participant.type).toBe("anonymous");
    expect(detail.body.participant.email).toBe("followup@example.com");
    expect(detail.body.answers[0].selectedOptions[0].hiddenTags).toEqual([
      { tagKey: "visibility", tagValue: "hidden" }
    ]);

    const attempts = await request(app)
      .get(`/api/surveys/${survey.id}/attempts`)
      .set("Cookie", admin.cookie);

    expect(attempts.status).toBe(200);
    expect(attempts.body.attempts[0].participant.email).toBe("followup@example.com");
  });

  it("includes enabled participant-safe glossary entries in anonymous runner payloads", async () => {
    const admin = await registerAdmin(app);
    const enabled = await createGlossaryEntry(app, admin, {
      aliases: ["JSA"],
      canonicalTerm: "Job safety analysis",
      definition: "A documented safety review before work begins."
    });
    await createGlossaryEntry(app, admin, {
      canonicalTerm: "Disabled anonymous glossary",
      isEnabled: false
    });
    let survey = await createDraftSurvey(app, admin, "Anonymous glossary payload");
    survey = await addQuestion(app, admin, survey.id, {
      questionText: "Did you review the JSA?"
    });
    survey = await setSurveyStatus(app, admin, survey.id, "published");
    const link = await createAnonymousLink(admin.cookie, survey.id);

    const started = await request(app).post(`/api/anonymous-surveys/${link.token}/start`).send({});

    expect(started.status).toBe(201);
    expect(started.body.glossaryEntries).toEqual([
      {
        id: enabled.id,
        canonicalTerm: "Job safety analysis",
        definition: "A documented safety review before work begins.",
        matchStrings: ["Job safety analysis", "JSA"]
      }
    ]);
    expect(started.body.glossaryEntries[0]).not.toHaveProperty("definitionSource");
    expect(started.body.glossaryEntries[0]).not.toHaveProperty("sourceProvider");
    expect(started.body.glossaryEntries[0]).not.toHaveProperty("sourceReference");
    expect(started.body.glossaryEntries[0]).not.toHaveProperty("sourceLookupAt");
  });

  it("does not convert anonymous attempts for invalid registration or ownership inputs", async () => {
    const admin = await registerAdmin(app);
    const existingUser = await registerUser(app);
    let survey = await createDraftSurvey(app, admin, "Anonymous conversion failures");
    survey = await addQuestion(app, admin, survey.id, { questionText: "Comment" });
    survey = await setSurveyStatus(app, admin, survey.id, "published");
    const question = findQuestion(survey, "Comment");
    const link = await createAnonymousLink(admin.cookie, survey.id);
    const started = await request(app).post(`/api/anonymous-surveys/${link.token}/start`).send({});

    const earlyConvert = await request(app)
      .post(`/api/anonymous-surveys/${link.token}/register`)
      .send({
        attemptAccessToken: started.body.attemptAccessToken,
        attemptId: started.body.attempt.id,
        first_name: "Early",
        last_name: "Convert",
        email: uniqueEmail("early-convert"),
        password: "test-password-123"
      });

    expect(earlyConvert.status).toBe(409);

    await request(app)
      .post(`/api/anonymous-surveys/${link.token}/answer`)
      .send({
        attemptAccessToken: started.body.attemptAccessToken,
        attemptId: started.body.attempt.id,
        questionId: question.id,
        answerText: "anonymous response"
      });
    await request(app)
      .post(`/api/anonymous-surveys/${link.token}/complete`)
      .send({
        attemptAccessToken: started.body.attemptAccessToken,
        attemptId: started.body.attempt.id
      });
    await request(app)
      .post(`/api/anonymous-surveys/${link.token}/contact-email`)
      .send({
        attemptAccessToken: started.body.attemptAccessToken,
        attemptId: started.body.attempt.id,
        email: "anon-followup@example.com"
      });

    const wrongAttempt = await request(app)
      .post(`/api/anonymous-surveys/${link.token}/register`)
      .send({
        attemptAccessToken: started.body.attemptAccessToken,
        attemptId: started.body.attempt.id + 9999,
        first_name: "Wrong",
        last_name: "Attempt",
        email: uniqueEmail("wrong-attempt"),
        password: "test-password-123"
      });
    const badAttemptToken = await request(app)
      .post(`/api/anonymous-surveys/${link.token}/register`)
      .send({
        attemptAccessToken: "not-an-attempt-token",
        attemptId: started.body.attempt.id,
        first_name: "Bad",
        last_name: "Token",
        email: uniqueEmail("bad-token"),
        password: "test-password-123"
      });
    const duplicateEmail = await request(app)
      .post(`/api/anonymous-surveys/${link.token}/register`)
      .send({
        attemptAccessToken: started.body.attemptAccessToken,
        attemptId: started.body.attempt.id,
        first_name: "Dupe",
        last_name: "Email",
        email: existingUser.user.email.toUpperCase(),
        password: "test-password-123"
      });
    const shortPassword = await request(app)
      .post(`/api/anonymous-surveys/${link.token}/register`)
      .send({
        attemptAccessToken: started.body.attemptAccessToken,
        attemptId: started.body.attempt.id,
        first_name: "Short",
        last_name: "Password",
        email: uniqueEmail("short-password"),
        password: "short"
      });

    expect(wrongAttempt.status).toBe(404);
    expect(badAttemptToken.status).toBe(400);
    expect(duplicateEmail.status).toBe(409);
    expect(shortPassword.status).toBe(400);

    const afterFailures = await pool.query<{
      user_id: number | null;
      anonymous_link_id: number | null;
      anonymous_access_token_hash: string | null;
      anonymous_contact_email: string | null;
    }>(
      `select user_id, anonymous_link_id, anonymous_access_token_hash, anonymous_contact_email
       from survey_attempts
       where id = $1`,
      [started.body.attempt.id]
    );

    expect(afterFailures.rows[0]).toMatchObject({
      user_id: null,
      anonymous_link_id: link.link.id,
      anonymous_contact_email: "anon-followup@example.com"
    });
    expect(afterFailures.rows[0].anonymous_access_token_hash).not.toBeNull();
  });

  it("converts a completed anonymous attempt into a registered-user attempt", async () => {
    const admin = await registerAdmin(app);
    let survey = await createDraftSurvey(app, admin, "Anonymous conversion");
    survey = await addQuestion(app, admin, survey.id, { questionText: "Comment" });
    survey = await setSurveyStatus(app, admin, survey.id, "published");
    const question = findQuestion(survey, "Comment");
    const link = await createAnonymousLink(admin.cookie, survey.id);
    const started = await request(app).post(`/api/anonymous-surveys/${link.token}/start`).send({});

    await request(app)
      .post(`/api/anonymous-surveys/${link.token}/answer`)
      .send({
        attemptAccessToken: started.body.attemptAccessToken,
        attemptId: started.body.attempt.id,
        questionId: question.id,
        answerText: "anonymous response"
      });
    await request(app)
      .post(`/api/anonymous-surveys/${link.token}/complete`)
      .send({
        attemptAccessToken: started.body.attemptAccessToken,
        attemptId: started.body.attempt.id
      });
    await request(app)
      .post(`/api/anonymous-surveys/${link.token}/contact-email`)
      .send({
        attemptAccessToken: started.body.attemptAccessToken,
        attemptId: started.body.attempt.id,
        email: "anon-followup@example.com"
      });

    const email = uniqueEmail("converted");
    const converted = await request(app)
      .post(`/api/anonymous-surveys/${link.token}/register`)
      .send({
        attemptAccessToken: started.body.attemptAccessToken,
        attemptId: started.body.attempt.id,
        first_name: "Converted",
        last_name: "Participant",
        email: email.toUpperCase(),
        password: "test-password-123"
      });

    expect(converted.status).toBe(201);
    expect(extractAuthCookie(converted)).toMatch(/^survey_portal_auth=/);
    expect(converted.body.user).toMatchObject({
      firstName: "Converted",
      lastName: "Participant",
      email,
      role: "user"
    });
    expect(converted.body.attempt).toMatchObject({
      id: started.body.attempt.id,
      status: "completed",
      userId: converted.body.user.id,
      anonymousLinkId: null,
      anonymousContactEmail: null
    });
    expect(converted.body.attempt.responses[0]).toMatchObject({
      questionId: question.id,
      answerText: "anonymous response"
    });
    expect(JSON.stringify(converted.body)).not.toContain("attemptAccessToken");
    expect(JSON.stringify(converted.body)).not.toContain("password");

    const stored = await pool.query<{
      user_id: number | null;
      anonymous_link_id: number | null;
      anonymous_access_token_hash: string | null;
      anonymous_contact_email: string | null;
      completed_at: Date | null;
    }>(
      `select user_id, anonymous_link_id, anonymous_access_token_hash, anonymous_contact_email, completed_at
       from survey_attempts
       where id = $1`,
      [started.body.attempt.id]
    );

    expect(stored.rows[0]).toMatchObject({
      user_id: converted.body.user.id,
      anonymous_link_id: null,
      anonymous_access_token_hash: null,
      anonymous_contact_email: null
    });
    expect(stored.rows[0].completed_at).not.toBeNull();

    const convertedCookie = extractAuthCookie(converted);
    const mySurveys = await request(app).get("/api/my-surveys").set("Cookie", convertedCookie);
    const convertedSummary = mySurveys.body.surveys.find(
      (item: { survey: { id: number } }) => item.survey.id === survey.id
    );

    expect(mySurveys.status).toBe(200);
    expect(convertedSummary.attempt.id).toBe(started.body.attempt.id);
    expect(convertedSummary.attempt.userId).toBe(converted.body.user.id);
    expect(convertedSummary.attempt.anonymousLinkId).toBeNull();

    const report = await request(app)
      .get(`/api/surveys/${survey.id}/attempts`)
      .set("Cookie", admin.cookie);
    const detail = await request(app)
      .get(`/api/surveys/${survey.id}/attempts/${started.body.attempt.id}`)
      .set("Cookie", admin.cookie);
    const csv = await request(app)
      .get(`/api/surveys/${survey.id}/export.csv`)
      .set("Cookie", admin.cookie);

    expect(report.status).toBe(200);
    expect(report.body.attempts[0].participant).toMatchObject({
      type: "user",
      email
    });
    expect(detail.status).toBe(200);
    expect(detail.body.participant).toMatchObject({
      type: "user",
      email
    });
    expect(csv.status).toBe(200);
    expect(csv.text).toContain(email);
    expect(csv.text).toContain("verified_account");
    expect(csv.text).not.toContain("anon-followup@example.com");

    const postConvertContactEmail = await request(app)
      .post(`/api/anonymous-surveys/${link.token}/contact-email`)
      .send({
        attemptAccessToken: started.body.attemptAccessToken,
        attemptId: started.body.attempt.id,
        email: "late@example.com"
      });

    expect(postConvertContactEmail.status).toBe(404);
  });

  it("rejects anonymous attempt conversion for unavailable links and surveys", async () => {
    const admin = await registerAdmin(app);
    let survey = await createDraftSurvey(app, admin, "Anonymous conversion unavailable");
    survey = await addQuestion(app, admin, survey.id, { questionText: "Comment" });
    survey = await setSurveyStatus(app, admin, survey.id, "published");
    const question = findQuestion(survey, "Comment");

    const disabled = await completeAnonymousSurveyForConversion(admin.cookie, survey.id, question.id);
    await request(app)
      .patch(`/api/surveys/${survey.id}/anonymous-links/${disabled.link.link.id}/disable`)
      .set("Cookie", admin.cookie)
      .send({});

    const disabledConvert = await request(app)
      .post(`/api/anonymous-surveys/${disabled.link.token}/register`)
      .send({
        attemptAccessToken: disabled.start.body.attemptAccessToken,
        attemptId: disabled.start.body.attempt.id,
        first_name: "Disabled",
        last_name: "Link",
        email: uniqueEmail("disabled-link"),
        password: "test-password-123"
      });

    const expired = await completeAnonymousSurveyForConversion(admin.cookie, survey.id, question.id);
    await pool.query(
      `update anonymous_survey_links
       set expires_at = now() - interval '1 minute'
       where id = $1`,
      [expired.link.link.id]
    );

    const expiredConvert = await request(app)
      .post(`/api/anonymous-surveys/${expired.link.token}/register`)
      .send({
        attemptAccessToken: expired.start.body.attemptAccessToken,
        attemptId: expired.start.body.attempt.id,
        first_name: "Expired",
        last_name: "Link",
        email: uniqueEmail("expired-link"),
        password: "test-password-123"
      });

    const retired = await completeAnonymousSurveyForConversion(admin.cookie, survey.id, question.id);
    await pool.query(`update surveys set status = 'retired' where id = $1`, [survey.id]);

    const retiredConvert = await request(app)
      .post(`/api/anonymous-surveys/${retired.link.token}/register`)
      .send({
        attemptAccessToken: retired.start.body.attemptAccessToken,
        attemptId: retired.start.body.attempt.id,
        first_name: "Retired",
        last_name: "Survey",
        email: uniqueEmail("retired-survey"),
        password: "test-password-123"
      });

    const malformedTokenConvert = await request(app)
      .post("/api/anonymous-surveys/not-a-token/register")
      .send({
        attemptAccessToken: retired.start.body.attemptAccessToken,
        attemptId: retired.start.body.attempt.id,
        first_name: "Bad",
        last_name: "Token",
        email: uniqueEmail("bad-link-token"),
        password: "test-password-123"
      });

    expect(disabledConvert.status).toBe(404);
    expect(expiredConvert.status).toBe(404);
    expect(retiredConvert.status).toBe(404);
    expect(malformedTokenConvert.status).toBe(404);
  });

  it("keeps anonymous and registered attempts separate in reporting", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    let survey = await createDraftSurvey(app, admin, "Separate ownership");
    survey = await addQuestion(app, admin, survey.id, { questionText: "Comment" });
    survey = await setSurveyStatus(app, admin, survey.id, "published");
    const question = findQuestion(survey, "Comment");

    const userAttempt = await startAttempt(app, user, survey.id);
    await submitAnswer(app, user, survey.id, {
      attemptId: userAttempt.attempt.id,
      questionId: question.id,
      answerText: "registered"
    });
    await completeAttempt(app, user, survey.id, userAttempt.attempt.id);

    const link = await createAnonymousLink(admin.cookie, survey.id);
    const anonymousStart = await request(app).post(`/api/anonymous-surveys/${link.token}/start`).send({});
    await request(app)
      .post(`/api/anonymous-surveys/${link.token}/answer`)
      .send({
        attemptAccessToken: anonymousStart.body.attemptAccessToken,
        attemptId: anonymousStart.body.attempt.id,
        questionId: question.id,
        answerText: "anonymous"
      });
    await request(app)
      .post(`/api/anonymous-surveys/${link.token}/complete`)
      .send({
        attemptAccessToken: anonymousStart.body.attemptAccessToken,
        attemptId: anonymousStart.body.attempt.id
      });

    const report = await request(app)
      .get(`/api/surveys/${survey.id}/attempts`)
      .set("Cookie", admin.cookie);

    expect(report.status).toBe(200);
    expect(report.body.attempts).toHaveLength(2);
    expect(report.body.attempts.map((attempt: { participant: { type: string } }) => attempt.participant.type).sort()).toEqual([
      "anonymous",
      "user"
    ]);

    const counts = await pool.query<{ user_count: string; anonymous_count: string }>(
      `select
         count(*) filter (where user_id is not null)::text as user_count,
         count(*) filter (where anonymous_link_id is not null)::text as anonymous_count
       from survey_attempts
       where survey_id = $1`,
      [survey.id]
    );

    expect(Number(counts.rows[0].user_count)).toBe(1);
    expect(Number(counts.rows[0].anonymous_count)).toBe(1);
  });
});

async function createAnonymousLink(cookie: string, surveyId: number): Promise<{
  link: {
    id: number;
    enabled: boolean;
    listedInPublicDirectory: boolean;
    publicUrl: string;
  };
  token: string;
}> {
  const response = await request(app)
    .post(`/api/surveys/${surveyId}/anonymous-links`)
    .set("Cookie", cookie)
    .send({});

  if (response.status !== 201) {
    throw new Error(`Anonymous link create failed with ${response.status}: ${JSON.stringify(response.body)}`);
  }

  const publicUrl = response.body.link.publicUrl as string;
  const token = publicUrl.split("/").at(-1);

  if (!token) {
    throw new Error(`Could not parse anonymous token from ${publicUrl}`);
  }

  return { link: response.body.link, token };
}

async function setDirectoryListing(
  cookie: string,
  surveyId: number,
  linkId: number,
  listedInPublicDirectory: boolean
): Promise<void> {
  const response = await request(app)
    .patch(`/api/surveys/${surveyId}/anonymous-links/${linkId}/public-directory`)
    .set("Cookie", cookie)
    .send({ listedInPublicDirectory });

  if (response.status !== 200) {
    throw new Error(
      `Anonymous link directory toggle failed with ${response.status}: ${JSON.stringify(response.body)}`
    );
  }
}

async function completeAnonymousSurveyForConversion(
  cookie: string,
  surveyId: number,
  questionId: number
): Promise<{
  link: Awaited<ReturnType<typeof createAnonymousLink>>;
  start: Response;
}> {
  const link = await createAnonymousLink(cookie, surveyId);
  const start = await request(app).post(`/api/anonymous-surveys/${link.token}/start`).send({});

  await request(app)
    .post(`/api/anonymous-surveys/${link.token}/answer`)
    .send({
      attemptAccessToken: start.body.attemptAccessToken,
      attemptId: start.body.attempt.id,
      questionId,
      answerText: "completed"
    });
  await request(app)
    .post(`/api/anonymous-surveys/${link.token}/complete`)
    .send({
      attemptAccessToken: start.body.attemptAccessToken,
      attemptId: start.body.attempt.id
    });

  return { link, start };
}
