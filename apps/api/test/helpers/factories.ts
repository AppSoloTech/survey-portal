import type {
  AuthUser,
  ParticipantGlossaryEntry,
  Survey,
  SurveyAttempt,
  SurveyPage,
  SurveyQuestion,
  SurveyQuestionType,
  SurveyStatus
} from "@survey-portal/shared";
import type { Express } from "express";
import request, { type Response } from "supertest";

export interface TestSession {
  cookie: string;
  user: AuthUser;
  password: string;
}

let uniqueCounter = 0;

export function uniqueEmail(prefix = "user"): string {
  uniqueCounter += 1;
  return `${prefix}.${uniqueCounter}@example.com`;
}

export function extractAuthCookie(response: Response): string {
  const rawHeader = response.headers["set-cookie"];
  const cookies: string[] = Array.isArray(rawHeader) ? rawHeader : rawHeader ? [rawHeader] : [];
  const authCookie = cookies.find((cookie) => cookie.startsWith("survey_portal_auth="));

  if (!authCookie) {
    throw new Error("Expected response to set the survey_portal_auth cookie");
  }

  return authCookie.split(";")[0];
}

export async function registerUser(
  app: Express,
  overrides: { email?: string; firstName?: string; lastName?: string } = {}
): Promise<TestSession> {
  const email = overrides.email ?? uniqueEmail();
  const password = "test-password-123";
  const response = await request(app)
    .post("/api/auth/register")
    .send({
      first_name: overrides.firstName ?? "Test",
      last_name: overrides.lastName ?? "Participant",
      email,
      password
    });

  if (response.status !== 201) {
    throw new Error(`Registration failed with ${response.status}: ${JSON.stringify(response.body)}`);
  }

  return { cookie: extractAuthCookie(response), user: response.body.user as AuthUser, password };
}

export async function registerAdmin(app: Express): Promise<TestSession> {
  const session = await registerUser(app, { email: uniqueEmail("admin"), lastName: "Admin" });
  const { pool } = await import("../../src/db.js");

  await pool.query(`update users set role = 'admin' where id = $1`, [session.user.id]);

  return { ...session, user: { ...session.user, role: "admin" } };
}

async function expectSurveyResponse(
  responsePromise: request.Test,
  expectedStatus: number
): Promise<Survey> {
  const response = await responsePromise;

  if (response.status !== expectedStatus) {
    throw new Error(
      `Survey builder call failed with ${response.status}: ${JSON.stringify(response.body)}`
    );
  }

  return response.body.survey as Survey;
}

export async function createDraftSurvey(
  app: Express,
  admin: TestSession,
  title = "Test survey"
): Promise<Survey> {
  return expectSurveyResponse(
    request(app).post("/api/surveys").set("Cookie", admin.cookie).send({ title }),
    201
  );
}

export async function addQuestion(
  app: Express,
  admin: TestSession,
  surveyId: number,
  options: {
    questionText: string;
    questionType?: SurveyQuestionType;
    isRequired?: boolean;
    pageId?: number;
    displayOrder?: number;
    scaleMin?: number;
    scaleMax?: number;
    allowOther?: boolean;
  }
): Promise<Survey> {
  return expectSurveyResponse(
    request(app)
      .post(`/api/surveys/${surveyId}/questions`)
      .set("Cookie", admin.cookie)
      .send({
        questionType: "text",
        isRequired: true,
        ...options
      }),
    201
  );
}

export async function addPage(
  app: Express,
  admin: TestSession,
  surveyId: number,
  options: {
    title: string;
    description?: string | null;
    displayOrder?: number;
  }
): Promise<Survey> {
  return expectSurveyResponse(
    request(app)
      .post(`/api/surveys/${surveyId}/pages`)
      .set("Cookie", admin.cookie)
      .send({
        description: null,
        ...options
      }),
    201
  );
}

export async function addOption(
  app: Express,
  admin: TestSession,
  surveyId: number,
  questionId: number,
  optionText: string
): Promise<Survey> {
  return expectSurveyResponse(
    request(app)
      .post(`/api/surveys/${surveyId}/questions/${questionId}/options`)
      .set("Cookie", admin.cookie)
      .send({ optionText }),
    201
  );
}

export async function addTag(
  app: Express,
  admin: TestSession,
  surveyId: number,
  questionId: number,
  optionId: number,
  tagKey: string,
  tagValue: string
): Promise<Survey> {
  return expectSurveyResponse(
    request(app)
      .post(`/api/surveys/${surveyId}/questions/${questionId}/options/${optionId}/tags`)
      .set("Cookie", admin.cookie)
      .send({ tagKey, tagValue }),
    201
  );
}

export async function addValueTag(
  app: Express,
  admin: TestSession,
  surveyId: number,
  questionId: number,
  body: {
    tagKey: string;
    tagValue: string;
    integerMin?: number | null;
    integerMax?: number | null;
  }
): Promise<Survey> {
  return expectSurveyResponse(
    request(app)
      .post(`/api/surveys/${surveyId}/questions/${questionId}/value-tags`)
      .set("Cookie", admin.cookie)
      .send(body),
    201
  );
}

export async function addOtherTag(
  app: Express,
  admin: TestSession,
  surveyId: number,
  questionId: number,
  tagKey: string,
  tagValue: string
): Promise<Survey> {
  return expectSurveyResponse(
    request(app)
      .post(`/api/surveys/${surveyId}/questions/${questionId}/other-tags`)
      .set("Cookie", admin.cookie)
      .send({ tagKey, tagValue }),
    201
  );
}

export async function addRule(
  app: Express,
  admin: TestSession,
  surveyId: number,
  rule: {
    sourceQuestionId: number;
    sourcePageId?: number | null;
    sourceAnswerOptionId?: number | null;
    targetQuestionId?: number | null;
    targetPageId?: number | null;
    conditionOperator?: "equals" | "is_blank";
    actionType?: "JUMP_TO_QUESTION" | "JUMP_TO_PAGE" | "HIDE_QUESTION" | "HIDE_PAGE";
    skipTargetInNormalFlow?: boolean;
    advanceOnTrigger?: boolean;
  }
): Promise<Survey> {
  return expectSurveyResponse(
    request(app).post(`/api/surveys/${surveyId}/rules`).set("Cookie", admin.cookie).send(rule),
    201
  );
}

export async function setSurveyStatus(
  app: Express,
  admin: TestSession,
  surveyId: number,
  status: SurveyStatus
): Promise<Survey> {
  return expectSurveyResponse(
    request(app)
      .patch(`/api/surveys/${surveyId}/status`)
      .set("Cookie", admin.cookie)
      .send({ status }),
    200
  );
}

export async function deleteSurvey(
  app: Express,
  admin: TestSession,
  surveyId: number
): Promise<Survey> {
  return expectSurveyResponse(
    request(app).delete(`/api/surveys/${surveyId}`).set("Cookie", admin.cookie),
    200
  );
}

export async function duplicateSurvey(
  app: Express,
  admin: TestSession,
  surveyId: number
): Promise<Survey> {
  return expectSurveyResponse(
    request(app).post(`/api/surveys/${surveyId}/duplicate`).set("Cookie", admin.cookie).send({}),
    201
  );
}

export async function createCategory(
  app: Express,
  admin: TestSession,
  name: string
): Promise<{ id: number; name: string }> {
  const response = await request(app)
    .post("/api/categories")
    .set("Cookie", admin.cookie)
    .send({ name });

  if (response.status !== 201) {
    throw new Error(`Category create failed with ${response.status}: ${JSON.stringify(response.body)}`);
  }

  return response.body.category as { id: number; name: string };
}

export async function createTagDefinition(
  app: Express,
  admin: TestSession,
  tagKey: string,
  tagValue: string
): Promise<{ id: number; tagKey: string; tagValue: string }> {
  const response = await request(app)
    .post("/api/tags")
    .set("Cookie", admin.cookie)
    .send({ tagKey, tagValue });

  if (response.status !== 201) {
    throw new Error(`Tag create failed with ${response.status}: ${JSON.stringify(response.body)}`);
  }

  return response.body.tag as { id: number; tagKey: string; tagValue: string };
}

export async function createGlossaryEntry(
  app: Express,
  admin: TestSession,
  input: {
    aliases?: string[];
    canonicalTerm: string;
    definition?: string;
    isEnabled?: boolean;
  }
): Promise<{
  aliases: { isCanonical: boolean; matchText: string }[];
  canonicalTerm: string;
  definition: string;
  id: number;
  isEnabled: boolean;
}> {
  const response = await request(app)
    .post("/api/admin/glossary")
    .set("Cookie", admin.cookie)
    .send({
      aliases: input.aliases ?? [],
      canonicalTerm: input.canonicalTerm,
      definition: input.definition ?? `${input.canonicalTerm} definition`,
      isEnabled: input.isEnabled ?? true
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

export function findQuestion(survey: Survey, questionText: string): SurveyQuestion {
  const question = survey.questions.find((item) => item.questionText === questionText);

  if (!question) {
    throw new Error(`Question "${questionText}" not found in survey ${survey.id}`);
  }

  return question;
}

// A published survey exercising conditional navigation:
//   Q1 "Route" single_select with options "Jump" and "Stay"
//   Q2 "Middle" optional text
//   Q3 "Target" optional text, jump target of Q1=Jump, skipped in normal flow
export async function createPublishedJumpSurvey(
  app: Express,
  admin: TestSession
): Promise<{
  survey: Survey;
  routeQuestion: SurveyQuestion;
  jumpOptionId: number;
  stayOptionId: number;
  middleQuestion: SurveyQuestion;
  targetQuestion: SurveyQuestion;
}> {
  let survey = await createDraftSurvey(app, admin, "Jump survey");
  const routePage = survey.pages[0];
  survey = await addPage(app, admin, survey.id, { title: "Middle page" });
  const middlePage = survey.pages.find((page) => page.title === "Middle page");
  survey = await addPage(app, admin, survey.id, { title: "Target page" });
  const targetPage = survey.pages.find((page) => page.title === "Target page");

  if (!routePage || !middlePage || !targetPage) {
    throw new Error("Jump survey pages were not created");
  }

  survey = await addQuestion(app, admin, survey.id, {
    questionText: "Route",
    questionType: "single_select",
    pageId: routePage.id
  });
  survey = await addQuestion(app, admin, survey.id, {
    questionText: "Middle",
    isRequired: false,
    pageId: middlePage.id
  });
  survey = await addQuestion(app, admin, survey.id, {
    questionText: "Target",
    isRequired: false,
    pageId: targetPage.id
  });

  const routeQuestionId = findQuestion(survey, "Route").id;
  survey = await addOption(app, admin, survey.id, routeQuestionId, "Jump");
  survey = await addOption(app, admin, survey.id, routeQuestionId, "Stay");

  const routeQuestion = findQuestion(survey, "Route");
  const jumpOption = routeQuestion.answerOptions.find((option) => option.optionText === "Jump");
  const stayOption = routeQuestion.answerOptions.find((option) => option.optionText === "Stay");
  const targetQuestion = findQuestion(survey, "Target");

  if (!jumpOption || !stayOption) {
    throw new Error("Jump survey options were not created");
  }

  survey = await addRule(app, admin, survey.id, {
    sourceQuestionId: routeQuestion.id,
    sourceAnswerOptionId: jumpOption.id,
    targetQuestionId: targetQuestion.id,
    skipTargetInNormalFlow: true
  });
  survey = await setSurveyStatus(app, admin, survey.id, "published");

  return {
    survey,
    routeQuestion: findQuestion(survey, "Route"),
    jumpOptionId: jumpOption.id,
    stayOptionId: stayOption.id,
    middleQuestion: findQuestion(survey, "Middle"),
    targetQuestion: findQuestion(survey, "Target")
  };
}

// Published survey where answering "Skip" on the trigger question hides both
// required follow-up questions, leaving only the optional final question.
export async function createPublishedSkipSurvey(
  app: Express,
  admin: TestSession
): Promise<{
  survey: Survey;
  triggerQuestion: SurveyQuestion;
  skipOptionId: number;
  keepOptionId: number;
  hiddenQuestionA: SurveyQuestion;
  hiddenQuestionB: SurveyQuestion;
  finalQuestion: SurveyQuestion;
}> {
  let survey = await createDraftSurvey(app, admin, "Skip survey");
  const triggerPage = survey.pages[0];
  survey = await addPage(app, admin, survey.id, { title: "Hidden A page" });
  const hiddenAPage = survey.pages.find((page) => page.title === "Hidden A page");
  survey = await addPage(app, admin, survey.id, { title: "Hidden B page" });
  const hiddenBPage = survey.pages.find((page) => page.title === "Hidden B page");
  survey = await addPage(app, admin, survey.id, { title: "Final page" });
  const finalPage = survey.pages.find((page) => page.title === "Final page");

  if (!triggerPage || !hiddenAPage || !hiddenBPage || !finalPage) {
    throw new Error("Skip survey pages were not created");
  }

  survey = await addQuestion(app, admin, survey.id, {
    questionText: "Trigger",
    questionType: "single_select",
    pageId: triggerPage.id
  });
  survey = await addQuestion(app, admin, survey.id, {
    questionText: "Hidden A",
    pageId: hiddenAPage.id
  });
  survey = await addQuestion(app, admin, survey.id, {
    questionText: "Hidden B",
    pageId: hiddenBPage.id
  });
  survey = await addQuestion(app, admin, survey.id, {
    questionText: "Final",
    isRequired: false,
    pageId: finalPage.id
  });

  const triggerQuestionId = findQuestion(survey, "Trigger").id;
  survey = await addOption(app, admin, survey.id, triggerQuestionId, "Skip");
  survey = await addOption(app, admin, survey.id, triggerQuestionId, "Keep");

  const triggerQuestion = findQuestion(survey, "Trigger");
  const skipOption = triggerQuestion.answerOptions.find((option) => option.optionText === "Skip");
  const keepOption = triggerQuestion.answerOptions.find((option) => option.optionText === "Keep");

  if (!skipOption || !keepOption) {
    throw new Error("Skip survey options were not created");
  }

  for (const hiddenText of ["Hidden A", "Hidden B"]) {
    survey = await addRule(app, admin, survey.id, {
      sourceQuestionId: triggerQuestion.id,
      sourceAnswerOptionId: skipOption.id,
      targetQuestionId: findQuestion(survey, hiddenText).id,
      actionType: "HIDE_QUESTION"
    });
  }

  survey = await setSurveyStatus(app, admin, survey.id, "published");

  return {
    survey,
    triggerQuestion: findQuestion(survey, "Trigger"),
    skipOptionId: skipOption.id,
    keepOptionId: keepOption.id,
    hiddenQuestionA: findQuestion(survey, "Hidden A"),
    hiddenQuestionB: findQuestion(survey, "Hidden B"),
    finalQuestion: findQuestion(survey, "Final")
  };
}

export async function startAttempt(
  app: Express,
  session: TestSession,
  surveyId: number,
  expectedStatus = 201
) {
  const response = await request(app)
    .post(`/api/surveys/${surveyId}/start`)
    .set("Cookie", session.cookie)
    .send({});

  if (response.status !== expectedStatus) {
    throw new Error(`Start failed with ${response.status}: ${JSON.stringify(response.body)}`);
  }

  return response.body as {
    attempt: SurveyAttempt;
    survey: Survey;
    glossaryEntries: ParticipantGlossaryEntry[];
    currentQuestion: SurveyQuestion | null;
    currentPage: SurveyPage | null;
    currentPageQuestionIds: number[];
  };
}

export async function submitAnswer(
  app: Express,
  session: TestSession,
  surveyId: number,
  body: {
    attemptId: number;
    questionId: number;
    answerText?: string | null;
    answerInteger?: number | null;
    selectedAnswerOptionIds?: number[];
    isOtherSelected?: boolean;
    otherText?: string | null;
  },
  expectedStatus = 200
) {
  const response = await request(app)
    .post(`/api/surveys/${surveyId}/answer`)
    .set("Cookie", session.cookie)
    .send(body);

  if (response.status !== expectedStatus) {
    throw new Error(`Answer failed with ${response.status}: ${JSON.stringify(response.body)}`);
  }

  return response.body as {
    attempt: SurveyAttempt;
    currentQuestion: SurveyQuestion | null;
    currentPage: SurveyPage | null;
    currentPageQuestionIds: number[];
    isCompleteReady: boolean;
  };
}

export async function submitPageAnswers(
  app: Express,
  session: TestSession,
  surveyId: number,
  pageId: number,
  body: {
    attemptId: number;
    answers: {
      questionId: number;
      answerText?: string | null;
      answerInteger?: number | null;
      selectedAnswerOptionIds?: number[];
      isOtherSelected?: boolean;
      otherText?: string | null;
    }[];
  },
  expectedStatus = 200
) {
  const response = await request(app)
    .post(`/api/surveys/${surveyId}/pages/${pageId}/answer`)
    .set("Cookie", session.cookie)
    .send(body);

  if (response.status !== expectedStatus) {
    throw new Error(`Page answer failed with ${response.status}: ${JSON.stringify(response.body)}`);
  }

  return response.body as {
    attempt: SurveyAttempt;
    currentQuestion: SurveyQuestion | null;
    currentPage: SurveyPage | null;
    currentPageQuestionIds: number[];
    isCompleteReady: boolean;
  };
}

export async function completeAttempt(
  app: Express,
  session: TestSession,
  surveyId: number,
  attemptId: number,
  expectedStatus = 200
) {
  const response = await request(app)
    .post(`/api/surveys/${surveyId}/complete`)
    .set("Cookie", session.cookie)
    .send({ attemptId });

  if (response.status !== expectedStatus) {
    throw new Error(`Complete failed with ${response.status}: ${JSON.stringify(response.body)}`);
  }

  return response.body as { attempt: { id: number; status: string } };
}

// Recursively collects every object key in a JSON payload so tests can assert
// that hidden-tag fields never appear anywhere in participant responses.
export function collectObjectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectObjectKeys(item, keys);
    }
    return keys;
  }

  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      keys.add(key);
      collectObjectKeys(child, keys);
    }
  }

  return keys;
}
