import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { pool } from "../src/db.js";
import {
  addOption,
  addQuestion,
  addTag,
  collectObjectKeys,
  completeAttempt,
  createDraftSurvey,
  findQuestion,
  registerAdmin,
  registerUser,
  setSurveyStatus,
  startAttempt,
  submitAnswer
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
    expect(created.link.publicUrl).toContain("/anonymous-surveys/asl.");

    const list = await request(app)
      .get(`/api/surveys/${survey.id}/anonymous-links`)
      .set("Cookie", admin.cookie);

    expect(list.status).toBe(200);
    expect(list.body.links).toHaveLength(1);
    expect(list.body.links[0].publicUrl).toBe(created.link.publicUrl);

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
    expect(rotated.body.link.enabled).toBe(true);
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
    expect(disabled.body.link.publicUrl).toBeUndefined();

    const unavailable = await request(app).get(`/api/anonymous-surveys/${rotatedToken}`);
    expect(unavailable.status).toBe(404);
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
  link: { id: number; enabled: boolean; publicUrl: string };
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
