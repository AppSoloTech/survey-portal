import { describe, expect, it } from "vitest";

import {
  resolveAttemptPath,
  type ConditionalLogicRule,
  type Survey,
  type SurveyQuestion,
  type SurveyResponseAnswer
} from "../src/index.js";

const timestamp = "2026-01-01T00:00:00.000Z";

function makeQuestion(overrides: Partial<SurveyQuestion> & { id: number }): SurveyQuestion {
  return {
    surveyId: 1,
    questionText: `Question ${overrides.id}`,
    questionType: "single_select",
    scaleMin: null,
    scaleMax: null,
    displayOrder: overrides.id,
    isRequired: true,
    helpText: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    answerOptions: [],
    ...overrides
  };
}

function makeRule(
  overrides: Partial<ConditionalLogicRule> & { id: number }
): ConditionalLogicRule {
  return {
    surveyId: 1,
    sourceQuestionId: 1,
    sourceAnswerOptionId: 11,
    conditionOperator: "equals",
    actionType: "JUMP_TO_QUESTION",
    targetQuestionId: null,
    targetPageId: null,
    skipTargetInNormalFlow: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  };
}

function makeSurvey(
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
    questions,
    conditionalLogicRules
  };
}

function makeResponse(
  questionId: number,
  selectedAnswerOptionIds: number[]
): SurveyResponseAnswer {
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

function makeTextResponse(questionId: number, answerText: string | null): SurveyResponseAnswer {
  return {
    id: questionId,
    surveyAttemptId: 1,
    questionId,
    answerText,
    answerInteger: null,
    selectedAnswerOptionIds: [],
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

describe("resolveAttemptPath", () => {
  it("walks every question in display order when no rules exist", () => {
    const survey = makeSurvey([makeQuestion({ id: 1 }), makeQuestion({ id: 2 }), makeQuestion({ id: 3 })]);

    const result = resolveAttemptPath(survey, []);

    expect(result.hasLoop).toBe(false);
    expect(result.path.map((question) => question.id)).toEqual([1, 2, 3]);
  });

  it("excludes skip-in-normal-flow targets when no answer triggers the jump", () => {
    const survey = makeSurvey(
      [makeQuestion({ id: 1 }), makeQuestion({ id: 2 }), makeQuestion({ id: 3 })],
      [
        makeRule({
          id: 1,
          sourceQuestionId: 1,
          sourceAnswerOptionId: 11,
          targetQuestionId: 3,
          skipTargetInNormalFlow: true
        })
      ]
    );

    const result = resolveAttemptPath(survey, [makeResponse(1, [12])]);

    expect(result.hasLoop).toBe(false);
    expect(result.path.map((question) => question.id)).toEqual([1, 2]);
  });

  it("includes the jump target when the matching answer is saved", () => {
    const survey = makeSurvey(
      [makeQuestion({ id: 1 }), makeQuestion({ id: 2 }), makeQuestion({ id: 3 })],
      [
        makeRule({
          id: 1,
          sourceQuestionId: 1,
          sourceAnswerOptionId: 11,
          targetQuestionId: 3,
          skipTargetInNormalFlow: true
        })
      ]
    );

    const result = resolveAttemptPath(survey, [makeResponse(1, [11])]);

    expect(result.hasLoop).toBe(false);
    expect(result.path.map((question) => question.id)).toEqual([1, 3]);
  });

  it("projects forward along the normal flow for unanswered questions", () => {
    const survey = makeSurvey(
      [makeQuestion({ id: 1 }), makeQuestion({ id: 2 }), makeQuestion({ id: 3 }), makeQuestion({ id: 4 })],
      [
        makeRule({
          id: 1,
          sourceQuestionId: 2,
          sourceAnswerOptionId: 21,
          targetQuestionId: 4,
          skipTargetInNormalFlow: true
        })
      ]
    );

    // Only question 1 is answered: the projection continues 2 -> 3, leaving
    // the conditional-only target 4 out of the expected path.
    const result = resolveAttemptPath(survey, [makeResponse(1, [99])]);

    expect(result.path.map((question) => question.id)).toEqual([1, 2, 3]);
  });

  it("stops and reports a loop when saved answers cycle backwards", () => {
    // A backward jump cannot be created through the API (forward-only rule
    // validation), but the walker still guards against cyclical data.
    const survey = makeSurvey(
      [makeQuestion({ id: 1 }), makeQuestion({ id: 2 })],
      [
        makeRule({
          id: 1,
          sourceQuestionId: 2,
          sourceAnswerOptionId: 21,
          targetQuestionId: 1,
          skipTargetInNormalFlow: false
        })
      ]
    );

    const result = resolveAttemptPath(survey, [
      makeResponse(1, [11]),
      makeResponse(2, [21])
    ]);

    expect(result.hasLoop).toBe(true);
    expect(result.path.map((question) => question.id)).toEqual([1, 2]);
  });

  it("returns an empty path for a survey without questions", () => {
    const result = resolveAttemptPath(makeSurvey([]), []);

    expect(result.hasLoop).toBe(false);
    expect(result.path).toEqual([]);
  });

  it("omits questions hidden by a matching skip rule", () => {
    const survey = makeSurvey(
      [makeQuestion({ id: 1 }), makeQuestion({ id: 2 }), makeQuestion({ id: 3 })],
      [
        makeRule({
          id: 1,
          sourceQuestionId: 1,
          sourceAnswerOptionId: 11,
          targetQuestionId: 2,
          actionType: "HIDE_QUESTION",
          skipTargetInNormalFlow: false
        })
      ]
    );

    const result = resolveAttemptPath(survey, [makeResponse(1, [11])]);

    expect(result.hasLoop).toBe(false);
    expect(result.path.map((question) => question.id)).toEqual([1, 3]);
  });

  it("keeps skip-rule targets when the trigger answer is not selected", () => {
    const survey = makeSurvey(
      [makeQuestion({ id: 1 }), makeQuestion({ id: 2 }), makeQuestion({ id: 3 })],
      [
        makeRule({
          id: 1,
          sourceQuestionId: 1,
          sourceAnswerOptionId: 11,
          targetQuestionId: 2,
          actionType: "HIDE_QUESTION",
          skipTargetInNormalFlow: false
        })
      ]
    );

    const result = resolveAttemptPath(survey, [makeResponse(1, [12])]);

    expect(result.path.map((question) => question.id)).toEqual([1, 2, 3]);
  });

  it("hides multiple questions from one trigger answer", () => {
    const survey = makeSurvey(
      [
        makeQuestion({ id: 1 }),
        makeQuestion({ id: 2 }),
        makeQuestion({ id: 3 }),
        makeQuestion({ id: 4 })
      ],
      [
        makeRule({
          id: 1,
          sourceQuestionId: 1,
          sourceAnswerOptionId: 11,
          targetQuestionId: 2,
          actionType: "HIDE_QUESTION",
          skipTargetInNormalFlow: false
        }),
        makeRule({
          id: 2,
          sourceQuestionId: 1,
          sourceAnswerOptionId: 11,
          targetQuestionId: 4,
          actionType: "HIDE_QUESTION",
          skipTargetInNormalFlow: false
        })
      ]
    );

    const result = resolveAttemptPath(survey, [makeResponse(1, [11])]);

    expect(result.path.map((question) => question.id)).toEqual([1, 3]);
  });

  it("matches multi-select trigger answers containing the source option among others", () => {
    const survey = makeSurvey(
      [
        makeQuestion({ id: 1, questionType: "multi_select" }),
        makeQuestion({ id: 2 }),
        makeQuestion({ id: 3 })
      ],
      [
        makeRule({
          id: 1,
          sourceQuestionId: 1,
          sourceAnswerOptionId: 11,
          targetQuestionId: 2,
          actionType: "HIDE_QUESTION",
          skipTargetInNormalFlow: false
        })
      ]
    );

    const result = resolveAttemptPath(survey, [makeResponse(1, [7, 11, 13])]);

    expect(result.path.map((question) => question.id)).toEqual([1, 3]);
  });

  it("omits questions hidden by a blank text skip rule", () => {
    const survey = makeSurvey(
      [
        makeQuestion({ id: 1, questionType: "text", isRequired: false }),
        makeQuestion({ id: 2 }),
        makeQuestion({ id: 3 })
      ],
      [
        makeRule({
          id: 1,
          sourceQuestionId: 1,
          sourceAnswerOptionId: null,
          conditionOperator: "is_blank",
          targetQuestionId: 2,
          actionType: "HIDE_QUESTION",
          skipTargetInNormalFlow: false
        })
      ]
    );

    expect(resolveAttemptPath(survey, [makeTextResponse(1, null)]).path.map((q) => q.id)).toEqual([
      1,
      3
    ]);
    expect(resolveAttemptPath(survey, [makeTextResponse(1, "")]).path.map((q) => q.id)).toEqual([
      1,
      3
    ]);
    expect(resolveAttemptPath(survey, [makeTextResponse(1, "   ")]).path.map((q) => q.id)).toEqual([
      1,
      3
    ]);
  });

  it("keeps blank-text skip targets for non-blank or missing text responses", () => {
    const survey = makeSurvey(
      [
        makeQuestion({ id: 1, questionType: "text", isRequired: false }),
        makeQuestion({ id: 2 }),
        makeQuestion({ id: 3 })
      ],
      [
        makeRule({
          id: 1,
          sourceQuestionId: 1,
          sourceAnswerOptionId: null,
          conditionOperator: "is_blank",
          targetQuestionId: 2,
          actionType: "HIDE_QUESTION",
          skipTargetInNormalFlow: false
        })
      ]
    );

    expect(resolveAttemptPath(survey, [makeTextResponse(1, "done")]).path.map((q) => q.id)).toEqual([
      1,
      2,
      3
    ]);
    expect(resolveAttemptPath(survey, []).path.map((q) => q.id)).toEqual([1, 2, 3]);
  });

  it("ignores skip rules sourced at questions the walk never visits", () => {
    // Question 2 is jumped over, so its stale saved answer must not hide
    // question 4.
    const survey = makeSurvey(
      [
        makeQuestion({ id: 1 }),
        makeQuestion({ id: 2 }),
        makeQuestion({ id: 3 }),
        makeQuestion({ id: 4 })
      ],
      [
        makeRule({
          id: 1,
          sourceQuestionId: 1,
          sourceAnswerOptionId: 11,
          targetQuestionId: 3,
          skipTargetInNormalFlow: false
        }),
        makeRule({
          id: 2,
          sourceQuestionId: 2,
          sourceAnswerOptionId: 21,
          targetQuestionId: 4,
          actionType: "HIDE_QUESTION",
          skipTargetInNormalFlow: false
        })
      ]
    );

    const result = resolveAttemptPath(survey, [
      makeResponse(1, [11]),
      makeResponse(2, [21])
    ]);

    expect(result.path.map((question) => question.id)).toEqual([1, 3, 4]);
  });

  it("advances past a jump target hidden by an earlier skip rule", () => {
    const survey = makeSurvey(
      [
        makeQuestion({ id: 1 }),
        makeQuestion({ id: 2 }),
        makeQuestion({ id: 3 }),
        makeQuestion({ id: 4 })
      ],
      [
        makeRule({
          id: 1,
          sourceQuestionId: 1,
          sourceAnswerOptionId: 11,
          targetQuestionId: 3,
          actionType: "HIDE_QUESTION",
          skipTargetInNormalFlow: false
        }),
        makeRule({
          id: 2,
          sourceQuestionId: 2,
          sourceAnswerOptionId: 21,
          targetQuestionId: 3,
          skipTargetInNormalFlow: false
        })
      ]
    );

    const result = resolveAttemptPath(survey, [
      makeResponse(1, [11]),
      makeResponse(2, [21])
    ]);

    expect(result.path.map((question) => question.id)).toEqual([1, 2, 4]);
  });
});
