import { describe, expect, it } from "vitest";

import {
  getOrderedPages,
  getOrderedQuestions,
  getQuestionsForPage,
  resolveAttemptPagePath,
  resolveProgressivePageState,
  type ConditionalLogicRule,
  type Survey,
  type SurveyPage,
  type SurveyQuestion,
  type SurveyResponseAnswer
} from "../src/index.js";

const timestamp = "2026-01-01T00:00:00.000Z";

function makePage(id: number, displayOrder = id): SurveyPage {
  return {
    id,
    surveyId: 1,
    title: `Page ${id}`,
    description: null,
    displayOrder,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function makeQuestion(
  id: number,
  pageId: number,
  displayOrder: number,
  overrides: Partial<SurveyQuestion> = {}
): SurveyQuestion {
  return {
    id,
    surveyId: 1,
    pageId,
    questionText: `Question ${id}`,
    questionType: "single_select",
    scaleMin: null,
    scaleMax: null,
    displayOrder,
    isRequired: true,
    helpText: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    answerOptions: [],
    ...overrides
  };
}

function makeRule(overrides: Partial<ConditionalLogicRule> & { id: number }): ConditionalLogicRule {
  return {
    surveyId: 1,
    sourcePageId: 1,
    sourceQuestionId: 1,
    sourceAnswerOptionId: 11,
    conditionOperator: "equals",
    actionType: "JUMP_TO_PAGE",
    targetQuestionId: null,
    targetPageId: null,
    skipTargetInNormalFlow: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  };
}

function makeResponse(questionId: number, selectedAnswerOptionIds: number[]): SurveyResponseAnswer {
  return {
    id: questionId,
    surveyAttemptId: 1,
    questionId,
    answerText: null,
    answerInteger: null,
    selectedAnswerOptionIds,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function makeSurvey(
  pages: SurveyPage[],
  questions: SurveyQuestion[],
  conditionalLogicRules: ConditionalLogicRule[] = []
): Survey {
  return {
    id: 1,
    title: "Test survey",
    description: null,
    status: "published",
    categoryId: null,
    categoryName: null,
    createdByUserId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    publishedAt: timestamp,
    retiredAt: null,
    deletedAt: null,
    pages,
    questions,
    conditionalLogicRules
  };
}

describe("page-based survey path helpers", () => {
  it("orders pages and flattened questions by page order then question order", () => {
    const survey = makeSurvey(
      [makePage(20, 2), makePage(10, 1)],
      [
        makeQuestion(3, 20, 2),
        makeQuestion(2, 10, 2),
        makeQuestion(1, 10, 1),
        makeQuestion(4, 20, 1)
      ]
    );

    expect(getOrderedPages(survey).map((page) => page.id)).toEqual([10, 20]);
    expect(getOrderedQuestions(survey).map((question) => question.id)).toEqual([1, 2, 4, 3]);
    expect(getQuestionsForPage(survey, 20).map((question) => question.id)).toEqual([4, 3]);
  });

  it("starts multi-question pages with the first visible question", () => {
    const survey = makeSurvey(
      [makePage(1), makePage(2)],
      [
        makeQuestion(1, 1, 1),
        makeQuestion(2, 1, 2),
        makeQuestion(3, 2, 1)
      ]
    );

    const result = resolveAttemptPagePath(survey, []);

    expect(result.hasLoop).toBe(false);
    expect(result.path.map((page) => page.id)).toEqual([1, 2]);
    expect(result.visibleQuestionIdsByPageId).toEqual({ 1: [1], 2: [3] });

    const state = resolveProgressivePageState(survey, []);

    expect(state.currentPage?.id).toBe(1);
    expect(state.currentQuestion?.id).toBe(1);
    expect(state.currentPageQuestionIds).toEqual([1]);
  });

  it("appends the next same-page question after the previous one is answered", () => {
    const survey = makeSurvey(
      [makePage(1), makePage(2)],
      [
        makeQuestion(1, 1, 1),
        makeQuestion(2, 1, 2),
        makeQuestion(3, 2, 1)
      ]
    );

    const state = resolveProgressivePageState(survey, [makeResponse(1, [11])]);

    expect(state.currentPage?.id).toBe(1);
    expect(state.currentQuestion?.id).toBe(2);
    expect(state.currentPageQuestionIds).toEqual([1, 2]);
    expect(state.visibleQuestionIdsByPageId[1]).toEqual([1, 2]);
  });

  it("treats a same-page JUMP_TO_QUESTION as a page-navigation no-op", () => {
    const survey = makeSurvey(
      [makePage(1), makePage(2)],
      [
        makeQuestion(1, 1, 1),
        makeQuestion(2, 1, 2),
        makeQuestion(3, 2, 1)
      ],
      [
        makeRule({
          id: 1,
          actionType: "JUMP_TO_QUESTION",
          sourceQuestionId: 1,
          sourceAnswerOptionId: 11,
          targetQuestionId: 2,
          targetPageId: null
        })
      ]
    );

    const result = resolveAttemptPagePath(survey, [makeResponse(1, [11])]);
    const state = resolveProgressivePageState(survey, [makeResponse(1, [11])]);

    // The same-page jump does not navigate to itself (no loop) and does not
    // re-enter page 1: the walk proceeds normally to page 2.
    expect(result.hasLoop).toBe(false);
    expect(result.path.map((page) => page.id)).toEqual([1, 2]);
    expect(state.currentPage?.id).toBe(2);
    expect(state.currentQuestion?.id).toBe(3);
  });

  it("routes immediately when a matching page jump triggers", () => {
    const survey = makeSurvey(
      [makePage(1), makePage(2), makePage(3)],
      [
        makeQuestion(1, 1, 1),
        makeQuestion(4, 1, 2),
        makeQuestion(2, 2, 1),
        makeQuestion(3, 3, 1)
      ],
      [
        makeRule({
          id: 1,
          sourceQuestionId: 1,
          sourceAnswerOptionId: 11,
          targetPageId: 3
        })
      ]
    );

    const result = resolveAttemptPagePath(survey, [makeResponse(1, [11])]);
    const state = resolveProgressivePageState(survey, [makeResponse(1, [11])]);

    expect(result.hasLoop).toBe(false);
    expect(result.path.map((page) => page.id)).toEqual([1, 3]);
    expect(result.visibleQuestionIdsByPageId[1]).toEqual([1]);
    expect(state.currentPage?.id).toBe(3);
    expect(state.currentQuestion?.id).toBe(3);
  });

  it("uses the farthest later page when multiple jumps trigger from a revealed question", () => {
    const survey = makeSurvey(
      [makePage(1), makePage(2), makePage(3), makePage(4)],
      [
        makeQuestion(1, 1, 1),
        makeQuestion(2, 1, 2),
        makeQuestion(3, 2, 1),
        makeQuestion(4, 3, 1),
        makeQuestion(5, 4, 1)
      ],
      [
        makeRule({
          id: 1,
          sourceQuestionId: 1,
          sourceAnswerOptionId: 12,
          targetPageId: 3
        }),
        makeRule({
          id: 2,
          sourceQuestionId: 2,
          sourceAnswerOptionId: 21,
          targetPageId: 3
        }),
        makeRule({
          id: 3,
          sourceQuestionId: 2,
          sourceAnswerOptionId: 21,
          targetPageId: 4
        })
      ]
    );

    const result = resolveAttemptPagePath(survey, [
      makeResponse(1, [11]),
      makeResponse(2, [21])
    ]);
    const state = resolveProgressivePageState(survey, [
      makeResponse(1, [11]),
      makeResponse(2, [21])
    ]);

    // Q2 triggers two jumps (page 3 and page 4); the farthest valid later page
    // wins, so the runner lands on page 4.
    expect(result.hasLoop).toBe(false);
    expect(result.path.map((page) => page.id)).toEqual([1, 4]);
    expect(state.currentPage?.id).toBe(4);
  });

  it("does not let stale later same-page answers override an earlier branch", () => {
    const survey = makeSurvey(
      [makePage(1), makePage(2), makePage(3), makePage(4)],
      [
        makeQuestion(1, 1, 1),
        makeQuestion(2, 1, 2),
        makeQuestion(3, 2, 1),
        makeQuestion(4, 3, 1),
        makeQuestion(5, 4, 1)
      ],
      [
        makeRule({
          id: 1,
          sourceQuestionId: 1,
          sourceAnswerOptionId: 11,
          targetPageId: 3
        }),
        makeRule({
          id: 2,
          sourceQuestionId: 2,
          sourceAnswerOptionId: 21,
          targetPageId: 4
        })
      ]
    );

    const result = resolveAttemptPagePath(survey, [
      makeResponse(1, [11]),
      makeResponse(2, [21])
    ]);

    expect(result.path.map((page) => page.id)).toEqual([1, 3]);
    expect(result.visibleQuestionIdsByPageId[1]).toEqual([1]);
  });

  it("treats question jumps as jumps to their containing page when choosing a target", () => {
    const survey = makeSurvey(
      [makePage(1), makePage(2), makePage(3), makePage(4)],
      [
        makeQuestion(1, 1, 1),
        makeQuestion(2, 1, 2),
        makeQuestion(3, 2, 1),
        makeQuestion(4, 3, 1),
        makeQuestion(5, 4, 1),
        makeQuestion(6, 4, 2)
      ],
      [
        makeRule({
          id: 1,
          sourceQuestionId: 1,
          sourceAnswerOptionId: 12,
          targetPageId: 3
        }),
        makeRule({
          id: 2,
          actionType: "JUMP_TO_QUESTION",
          sourceQuestionId: 2,
          sourceAnswerOptionId: 21,
          targetQuestionId: 6,
          targetPageId: null
        })
      ]
    );

    const result = resolveAttemptPagePath(survey, [
      makeResponse(1, [11]),
      makeResponse(2, [21])
    ]);

    expect(result.hasLoop).toBe(false);
    expect(result.path.map((page) => page.id)).toEqual([1, 4]);
    expect(result.visibleQuestionIdsByPageId[4]).toEqual([5]);
  });

  it("ignores backward page jumps when choosing valid later targets", () => {
    const survey = makeSurvey(
      [makePage(1), makePage(2)],
      [makeQuestion(1, 1, 1), makeQuestion(2, 2, 1)],
      [
        makeRule({
          id: 1,
          sourcePageId: 2,
          sourceQuestionId: 2,
          sourceAnswerOptionId: 21,
          targetPageId: 1
        })
      ]
    );

    const result = resolveAttemptPagePath(survey, [makeResponse(2, [21])]);

    expect(result.hasLoop).toBe(false);
    expect(result.path.map((page) => page.id)).toEqual([1, 2]);
  });

  it("skips pages whose questions are all hidden by active rules", () => {
    const survey = makeSurvey(
      [makePage(1), makePage(2), makePage(3)],
      [
        makeQuestion(1, 1, 1),
        makeQuestion(2, 2, 1),
        makeQuestion(3, 3, 1)
      ],
      [
        makeRule({
          id: 1,
          actionType: "HIDE_QUESTION",
          sourceQuestionId: 1,
          sourceAnswerOptionId: 11,
          targetQuestionId: 2,
          targetPageId: null,
          skipTargetInNormalFlow: false
        })
      ]
    );

    const result = resolveAttemptPagePath(survey, [makeResponse(1, [11])]);

    expect(result.hasLoop).toBe(false);
    expect(result.path.map((page) => page.id)).toEqual([1, 3]);
    expect(result.visibleQuestionIdsByPageId).toEqual({ 1: [1], 3: [3] });
  });

  it("unions matching hide rules from multiple visible questions on the page", () => {
    const survey = makeSurvey(
      [makePage(1), makePage(2), makePage(3)],
      [
        makeQuestion(1, 1, 1),
        makeQuestion(2, 1, 2),
        makeQuestion(3, 2, 1),
        makeQuestion(4, 2, 2),
        makeQuestion(5, 3, 1)
      ],
      [
        makeRule({
          id: 1,
          actionType: "HIDE_QUESTION",
          sourceQuestionId: 1,
          sourceAnswerOptionId: 11,
          targetQuestionId: 3,
          targetPageId: null,
          skipTargetInNormalFlow: false
        }),
        makeRule({
          id: 2,
          actionType: "HIDE_QUESTION",
          sourceQuestionId: 2,
          sourceAnswerOptionId: 21,
          targetQuestionId: 4,
          targetPageId: null,
          skipTargetInNormalFlow: false
        })
      ]
    );

    const result = resolveAttemptPagePath(survey, [
      makeResponse(1, [11]),
      makeResponse(2, [21])
    ]);

    expect(result.hasLoop).toBe(false);
    expect(result.path.map((page) => page.id)).toEqual([1, 3]);
    expect(result.visibleQuestionIdsByPageId).toEqual({ 1: [1, 2], 3: [5] });
  });

  it("advances past a page-jump target with no visible questions", () => {
    const survey = makeSurvey(
      [makePage(1), makePage(2), makePage(3)],
      [
        makeQuestion(1, 1, 1),
        makeQuestion(2, 2, 1),
        makeQuestion(3, 3, 1)
      ],
      [
        makeRule({
          id: 1,
          sourceQuestionId: 1,
          sourceAnswerOptionId: 11,
          targetPageId: 2
        }),
        makeRule({
          id: 2,
          actionType: "HIDE_QUESTION",
          sourceQuestionId: 1,
          sourceAnswerOptionId: 11,
          targetQuestionId: 2,
          targetPageId: null,
          skipTargetInNormalFlow: false
        })
      ]
    );

    const result = resolveAttemptPagePath(survey, [makeResponse(1, [11])]);

    expect(result.hasLoop).toBe(false);
    expect(result.path.map((page) => page.id)).toEqual([1, 3]);
  });

  it("ignores stale jump answers on hidden questions", () => {
    const survey = makeSurvey(
      [makePage(1), makePage(2), makePage(3)],
      [
        makeQuestion(1, 1, 1),
        makeQuestion(2, 1, 2),
        makeQuestion(3, 2, 1),
        makeQuestion(4, 3, 1)
      ],
      [
        makeRule({
          id: 1,
          actionType: "HIDE_QUESTION",
          sourceQuestionId: 1,
          sourceAnswerOptionId: 11,
          targetQuestionId: 2,
          targetPageId: null,
          skipTargetInNormalFlow: false
        }),
        makeRule({
          id: 2,
          sourceQuestionId: 2,
          sourceAnswerOptionId: 21,
          targetPageId: 3
        })
      ]
    );

    const result = resolveAttemptPagePath(survey, [
      makeResponse(1, [11]),
      makeResponse(2, [21])
    ]);

    expect(result.hasLoop).toBe(false);
    expect(result.path.map((page) => page.id)).toEqual([1, 2]);
  });
});
