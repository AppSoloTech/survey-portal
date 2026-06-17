import request from "supertest";
import { describe, expect, it } from "vitest";

import type { Survey } from "@survey-portal/shared";

import { createApp } from "../src/app.js";
import {
  addOption,
  addPage,
  addQuestion,
  addRule,
  completeAttempt,
  createDraftSurvey,
  findQuestion,
  registerAdmin,
  registerUser,
  setSurveyStatus,
  startAttempt,
  submitAnswer,
  submitPageAnswers,
  type TestSession
} from "./helpers/factories.js";

const app = createApp();

function pageByTitle(survey: Survey, title: string) {
  const page = survey.pages.find((candidate) => candidate.title === title);

  if (!page) {
    throw new Error(`Page "${title}" not found in survey ${survey.id}`);
  }

  return page;
}

function optionId(survey: Survey, questionText: string, optionText: string): number {
  const question = findQuestion(survey, questionText);
  const option = question.answerOptions.find((candidate) => candidate.optionText === optionText);

  if (!option) {
    throw new Error(`Option "${optionText}" not found on question "${questionText}"`);
  }

  return option.id;
}

// A single page carrying three questions, used to exercise progressive reveal.
async function createMultiQuestionPageSurvey(admin: TestSession) {
  let survey = await createDraftSurvey(app, admin, "Multi-question page survey");
  const firstPage = survey.pages[0];

  if (!firstPage) {
    throw new Error("Default first page was not created");
  }

  survey = await addQuestion(app, admin, survey.id, {
    questionText: "First",
    pageId: firstPage.id
  });
  survey = await addQuestion(app, admin, survey.id, {
    questionText: "Second",
    pageId: firstPage.id
  });
  survey = await addQuestion(app, admin, survey.id, {
    questionText: "Third",
    isRequired: false,
    pageId: firstPage.id
  });
  await setSurveyStatus(app, admin, survey.id, "published");

  return {
    survey,
    firstPage,
    first: findQuestion(survey, "First"),
    second: findQuestion(survey, "Second"),
    third: findQuestion(survey, "Third")
  };
}

// Page 1 holds a routing select plus a trailing question; a JUMP_TO_PAGE rule on
// the select sends the participant to Page 3, skipping the rest of Page 1 and
// all of Page 2.
async function createMidPageJumpSurvey(admin: TestSession) {
  let survey = await createDraftSurvey(app, admin, "Mid-page jump survey");
  const routePage = survey.pages[0];

  if (!routePage) {
    throw new Error("Default first page was not created");
  }

  survey = await addPage(app, admin, survey.id, { title: "Middle page" });
  const middlePage = pageByTitle(survey, "Middle page");
  survey = await addPage(app, admin, survey.id, { title: "Target page" });
  const targetPage = pageByTitle(survey, "Target page");

  survey = await addQuestion(app, admin, survey.id, {
    questionText: "Route",
    questionType: "single_select",
    pageId: routePage.id
  });
  survey = await addQuestion(app, admin, survey.id, {
    questionText: "AfterRoute",
    pageId: routePage.id
  });
  survey = await addQuestion(app, admin, survey.id, {
    questionText: "Middle",
    pageId: middlePage.id
  });
  survey = await addQuestion(app, admin, survey.id, {
    questionText: "Target",
    pageId: targetPage.id
  });

  const routeQuestion = findQuestion(survey, "Route");
  survey = await addOption(app, admin, survey.id, routeQuestion.id, "Skip");
  survey = await addOption(app, admin, survey.id, routeQuestion.id, "Stay");

  survey = await addRule(app, admin, survey.id, {
    sourceQuestionId: routeQuestion.id,
    sourceAnswerOptionId: optionId(survey, "Route", "Skip"),
    actionType: "JUMP_TO_PAGE",
    targetPageId: targetPage.id
  });
  await setSurveyStatus(app, admin, survey.id, "published");

  return {
    survey,
    routePage,
    targetPage,
    route: findQuestion(survey, "Route"),
    afterRoute: findQuestion(survey, "AfterRoute"),
    target: findQuestion(survey, "Target"),
    skipOptionId: optionId(survey, "Route", "Skip"),
    stayOptionId: optionId(survey, "Route", "Stay")
  };
}

describe("progressive page reveal", () => {
  it("reveals one question at a time on a multi-question page", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const { survey, firstPage, first, second, third } = await createMultiQuestionPageSurvey(admin);

    const started = await startAttempt(app, user, survey.id);
    expect(started.currentPage?.id).toBe(firstPage.id);
    expect(started.currentQuestion?.id).toBe(first.id);
    expect(started.currentPageQuestionIds).toEqual([first.id]);

    const afterFirst = await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: first.id,
      answerText: "one"
    });
    expect(afterFirst.currentQuestion?.id).toBe(second.id);
    expect(afterFirst.currentPageQuestionIds).toEqual([first.id, second.id]);

    const afterSecond = await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: second.id,
      answerText: "two"
    });
    expect(afterSecond.currentQuestion?.id).toBe(third.id);
    expect(afterSecond.currentPageQuestionIds).toEqual([first.id, second.id, third.id]);

    const afterThird = await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: third.id,
      answerText: null
    });
    expect(afterThird.currentPage).toBeNull();
    expect(afterThird.isCompleteReady).toBe(true);

    const completed = await completeAttempt(app, user, survey.id, started.attempt.id);
    expect(completed.attempt.status).toBe("completed");
  });
});

describe("mid-page navigation", () => {
  it("routes to a later page when an early answer jumps, leaving later same-page questions unrevealed", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const { survey, targetPage, route, afterRoute, target, skipOptionId } =
      await createMidPageJumpSurvey(admin);

    const started = await startAttempt(app, user, survey.id);
    expect(started.currentQuestion?.id).toBe(route.id);
    expect(started.currentPageQuestionIds).toEqual([route.id]);

    const afterRouteAnswer = await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: route.id,
      selectedAnswerOptionIds: [skipOptionId]
    });

    // The jump fires on Route, so AfterRoute (same page) and all of Page 2 are
    // never revealed; the runner lands directly on the target page.
    expect(afterRouteAnswer.currentPage?.id).toBe(targetPage.id);
    expect(afterRouteAnswer.currentQuestion?.id).toBe(target.id);
    expect(afterRouteAnswer.currentPageQuestionIds).not.toContain(afterRoute.id);
  });

  it("reveals the trailing same-page question when the early answer does not jump", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const { survey, routePage, route, afterRoute, stayOptionId } =
      await createMidPageJumpSurvey(admin);

    const started = await startAttempt(app, user, survey.id);
    const afterRouteAnswer = await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: route.id,
      selectedAnswerOptionIds: [stayOptionId]
    });

    expect(afterRouteAnswer.currentPage?.id).toBe(routePage.id);
    expect(afterRouteAnswer.currentQuestion?.id).toBe(afterRoute.id);
    expect(afterRouteAnswer.currentPageQuestionIds).toEqual([route.id, afterRoute.id]);
  });

  it("recomputes the current position when an earlier answer changes branch", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const { survey, routePage, route, afterRoute, target, skipOptionId, stayOptionId } =
      await createMidPageJumpSurvey(admin);

    const started = await startAttempt(app, user, survey.id);

    // Take the jump and finish the target page.
    await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: route.id,
      selectedAnswerOptionIds: [skipOptionId]
    });
    const afterTarget = await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: target.id,
      answerText: "done"
    });
    expect(afterTarget.currentPage).toBeNull();
    expect(afterTarget.isCompleteReady).toBe(true);

    // Change the routing answer so it no longer jumps. The runner recomputes
    // the path, returns to the route page, and reveals the previously skipped
    // AfterRoute question; completion is no longer ready.
    const afterChange = await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: route.id,
      selectedAnswerOptionIds: [stayOptionId]
    });
    expect(afterChange.currentPage?.id).toBe(routePage.id);
    expect(afterChange.currentQuestion?.id).toBe(afterRoute.id);
    expect(afterChange.isCompleteReady).toBe(false);
  });
});

// A department selector on Page 1 jumps to one of three branch pages
// (Engineering, Sales, Operations), each marked skip-in-normal-flow so that
// taking one branch bypasses the others before the shared Final page.
async function createBranchSurvey(admin: TestSession) {
  let survey = await createDraftSurvey(app, admin, "Department branch survey");
  const selectPage = survey.pages[0];

  if (!selectPage) {
    throw new Error("Default first page was not created");
  }

  survey = await addPage(app, admin, survey.id, { title: "Engineering" });
  const engineeringPage = pageByTitle(survey, "Engineering");
  survey = await addPage(app, admin, survey.id, { title: "Sales" });
  const salesPage = pageByTitle(survey, "Sales");
  survey = await addPage(app, admin, survey.id, { title: "Operations" });
  const operationsPage = pageByTitle(survey, "Operations");
  survey = await addPage(app, admin, survey.id, { title: "Final" });
  const finalPage = pageByTitle(survey, "Final");

  survey = await addQuestion(app, admin, survey.id, {
    questionText: "Department",
    questionType: "single_select",
    pageId: selectPage.id
  });
  survey = await addQuestion(app, admin, survey.id, {
    questionText: "EngineeringQ",
    pageId: engineeringPage.id
  });
  survey = await addQuestion(app, admin, survey.id, {
    questionText: "SalesQ",
    pageId: salesPage.id
  });
  survey = await addQuestion(app, admin, survey.id, {
    questionText: "OperationsQ",
    pageId: operationsPage.id
  });
  survey = await addQuestion(app, admin, survey.id, {
    questionText: "FinalQ",
    pageId: finalPage.id
  });

  const departmentQuestion = findQuestion(survey, "Department");
  survey = await addOption(app, admin, survey.id, departmentQuestion.id, "Engineering");
  survey = await addOption(app, admin, survey.id, departmentQuestion.id, "Sales");
  survey = await addOption(app, admin, survey.id, departmentQuestion.id, "Operations");

  for (const [optionText, targetPage] of [
    ["Engineering", engineeringPage],
    ["Sales", salesPage],
    ["Operations", operationsPage]
  ] as const) {
    survey = await addRule(app, admin, survey.id, {
      sourceQuestionId: departmentQuestion.id,
      sourceAnswerOptionId: optionId(survey, "Department", optionText),
      actionType: "JUMP_TO_PAGE",
      targetPageId: targetPage.id,
      skipTargetInNormalFlow: true
    });
  }
  await setSurveyStatus(app, admin, survey.id, "published");

  return {
    survey,
    department: findQuestion(survey, "Department"),
    engineeringPage,
    salesPage,
    operationsPage,
    finalPage,
    engineeringQuestion: findQuestion(survey, "EngineeringQ"),
    finalQuestion: findQuestion(survey, "FinalQ"),
    engineeringOptionId: optionId(survey, "Department", "Engineering")
  };
}

describe("branch-page navigation", () => {
  it("jumps to the chosen branch page and skips the other branch pages in normal flow", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const {
      survey,
      department,
      engineeringPage,
      salesPage,
      operationsPage,
      finalPage,
      engineeringQuestion,
      finalQuestion,
      engineeringOptionId
    } = await createBranchSurvey(admin);

    const started = await startAttempt(app, user, survey.id);
    expect(started.currentQuestion?.id).toBe(department.id);

    // Choosing Engineering jumps straight to the Engineering branch page.
    const afterDepartment = await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: department.id,
      selectedAnswerOptionIds: [engineeringOptionId]
    });
    expect(afterDepartment.currentPage?.id).toBe(engineeringPage.id);
    expect(afterDepartment.currentQuestion?.id).toBe(engineeringQuestion.id);

    // Answering the Engineering question advances straight to Final: normal
    // flow from the Engineering page skips the Sales and Operations branch
    // pages because each is marked skip-in-normal-flow.
    const afterEngineering = await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: engineeringQuestion.id,
      answerText: "eng"
    });
    expect(afterEngineering.currentPage?.id).toBe(finalPage.id);
    expect(afterEngineering.currentPage?.id).not.toBe(salesPage.id);
    expect(afterEngineering.currentPage?.id).not.toBe(operationsPage.id);
    expect(afterEngineering.currentQuestion?.id).toBe(finalQuestion.id);

    // Finishing the Final page completes the survey with no other branch pages.
    const afterFinal = await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: finalQuestion.id,
      answerText: "done"
    });
    expect(afterFinal.currentPage).toBeNull();
    expect(afterFinal.isCompleteReady).toBe(true);

    const completed = await completeAttempt(app, user, survey.id, started.attempt.id);
    expect(completed.attempt.status).toBe("completed");
  });

  it("prunes the abandoned branch's answers when the respondent changes department", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const { survey, department, engineeringPage, salesPage, engineeringQuestion } =
      await createBranchSurvey(admin);
    const engineeringOptionId = optionId(survey, "Department", "Engineering");
    const salesOptionId = optionId(survey, "Department", "Sales");
    const salesQuestion = findQuestion(survey, "SalesQ");

    const started = await startAttempt(app, user, survey.id);

    // Choose Engineering and answer the Engineering branch question.
    await submitPageAnswers(app, user, survey.id, department.pageId, {
      attemptId: started.attempt.id,
      answers: [{ questionId: department.id, selectedAnswerOptionIds: [engineeringOptionId] }]
    });
    const afterEngineering = await submitPageAnswers(app, user, survey.id, engineeringPage.id, {
      attemptId: started.attempt.id,
      answers: [{ questionId: engineeringQuestion.id, answerText: "eng answer" }]
    });
    expect(afterEngineering.currentPage?.id).not.toBe(engineeringPage.id);

    // Go "Previous" and switch the department to Sales — this strands the
    // Engineering answer off the final path, so it must be pruned (mirrors the
    // phase_12_test_notes edge case).
    const afterSales = await submitPageAnswers(app, user, survey.id, department.pageId, {
      attemptId: started.attempt.id,
      answers: [{ questionId: department.id, selectedAnswerOptionIds: [salesOptionId] }]
    });
    expect(afterSales.currentPage?.id).toBe(salesPage.id);

    const { pool } = await import("../src/db.js");
    const stored = await pool.query<{ question_id: number }>(
      `select question_id from survey_response_answers where survey_attempt_id = $1`,
      [started.attempt.id]
    );
    const storedQuestionIds = stored.rows.map((row) => row.question_id);

    // The Department answer remains, the off-path Engineering answer is gone,
    // and the Sales branch is empty until the respondent re-answers it.
    expect(storedQuestionIds).toContain(department.id);
    expect(storedQuestionIds).not.toContain(engineeringQuestion.id);
    expect(storedQuestionIds).not.toContain(salesQuestion.id);

    // Admin detail must report the pruned page-branch question off the final
    // path. The onFinalPath safety net uses the page resolver, so a JUMP_TO_PAGE
    // branch that was never reached is not mislabelled as on the final path.
    const detail = await request(app)
      .get(`/api/surveys/${survey.id}/attempts/${started.attempt.id}`)
      .set("Cookie", admin.cookie);

    expect(detail.status).toBe(200);

    const engineeringAnswer = detail.body.answers.find(
      (answer: { questionText: string }) => answer.questionText === "EngineeringQ"
    );

    expect(engineeringAnswer).toMatchObject({ state: "not_reached", onFinalPath: false });
  });
});

describe("page batch answer endpoint", () => {
  async function createBatchSurvey(admin: TestSession) {
    let survey = await createDraftSurvey(app, admin, "Batch page survey");
    const firstPage = survey.pages[0];

    if (!firstPage) {
      throw new Error("Default first page was not created");
    }

    survey = await addPage(app, admin, survey.id, { title: "Second page" });
    const secondPage = pageByTitle(survey, "Second page");

    survey = await addQuestion(app, admin, survey.id, {
      questionText: "B1",
      pageId: firstPage.id
    });
    survey = await addQuestion(app, admin, survey.id, {
      questionText: "B2",
      isRequired: false,
      pageId: firstPage.id
    });
    survey = await addQuestion(app, admin, survey.id, {
      questionText: "B3",
      pageId: secondPage.id
    });
    await setSurveyStatus(app, admin, survey.id, "published");

    return {
      survey,
      firstPage,
      secondPage,
      b1: findQuestion(survey, "B1"),
      b2: findQuestion(survey, "B2"),
      b3: findQuestion(survey, "B3")
    };
  }

  it("saves every question on a page in one request and advances to the next page", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const { survey, firstPage, secondPage, b1, b2, b3 } = await createBatchSurvey(admin);

    const started = await startAttempt(app, user, survey.id);

    const afterPage = await submitPageAnswers(app, user, survey.id, firstPage.id, {
      attemptId: started.attempt.id,
      answers: [
        { questionId: b1.id, answerText: "one" },
        { questionId: b2.id, answerText: "two" }
      ]
    });
    expect(afterPage.currentPage?.id).toBe(secondPage.id);
    expect(afterPage.currentQuestion?.id).toBe(b3.id);

    const afterSecond = await submitPageAnswers(app, user, survey.id, secondPage.id, {
      attemptId: started.attempt.id,
      answers: [{ questionId: b3.id, answerText: "three" }]
    });
    expect(afterSecond.currentPage).toBeNull();
    expect(afterSecond.isCompleteReady).toBe(true);

    const completed = await completeAttempt(app, user, survey.id, started.attempt.id);
    expect(completed.attempt.status).toBe("completed");
  });

  it("rejects answers that target a question outside the submitted page", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const { survey, firstPage, b1, b3 } = await createBatchSurvey(admin);

    const started = await startAttempt(app, user, survey.id);

    await submitPageAnswers(
      app,
      user,
      survey.id,
      firstPage.id,
      {
        attemptId: started.attempt.id,
        answers: [
          { questionId: b1.id, answerText: "one" },
          { questionId: b3.id, answerText: "wrong page" }
        ]
      },
      400
    );
  });

  it("rejects a missing required answer on a batch page submit", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);
    const { survey, firstPage, b2 } = await createBatchSurvey(admin);

    const started = await startAttempt(app, user, survey.id);

    // Omitting the required B1 fills a blank row server-side, which fails
    // required validation rather than silently advancing.
    await submitPageAnswers(
      app,
      user,
      survey.id,
      firstPage.id,
      {
        attemptId: started.attempt.id,
        answers: [{ questionId: b2.id, answerText: "optional only" }]
      },
      400
    );
  });
});

describe("optional-question completion gating", () => {
  it("blocks completion with an optional-question message until a trailing optional question is visited", async () => {
    const admin = await registerAdmin(app);
    const user = await registerUser(app);

    let survey = await createDraftSurvey(app, admin, "Optional trailing survey");
    const firstPage = survey.pages[0];

    if (!firstPage) {
      throw new Error("Default first page was not created");
    }

    survey = await addQuestion(app, admin, survey.id, {
      questionText: "Required",
      pageId: firstPage.id
    });
    survey = await addQuestion(app, admin, survey.id, {
      questionText: "Optional",
      isRequired: false,
      pageId: firstPage.id
    });
    await setSurveyStatus(app, admin, survey.id, "published");

    const required = findQuestion(survey, "Required");
    const optional = findQuestion(survey, "Optional");

    const started = await startAttempt(app, user, survey.id);
    const afterRequired = await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: required.id,
      answerText: "answered"
    });
    expect(afterRequired.currentQuestion?.id).toBe(optional.id);
    expect(afterRequired.isCompleteReady).toBe(false);

    const blocked = (await completeAttempt(app, user, survey.id, started.attempt.id, 400)) as unknown as {
      error: string;
    };
    expect(blocked.error).toBe(`Question ${optional.displayOrder} must be visited before completing`);

    // Visiting the optional question (saving it blank) unblocks completion.
    const afterOptional = await submitAnswer(app, user, survey.id, {
      attemptId: started.attempt.id,
      questionId: optional.id,
      answerText: null
    });
    expect(afterOptional.currentPage).toBeNull();
    expect(afterOptional.isCompleteReady).toBe(true);

    const completed = await completeAttempt(app, user, survey.id, started.attempt.id);
    expect(completed.attempt.status).toBe("completed");
  });
});
