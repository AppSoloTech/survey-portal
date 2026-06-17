import { describe, expect, it } from "vitest";

import {
  resolveNextQuestion,
  type ConditionalLogicRule,
  type Survey,
  type SurveyQuestion,
  type SurveyResponseAnswer
} from "../src/index.js";

const timestamp = "2026-01-01T00:00:00.000Z";

function makeQuestion(overrides: Partial<SurveyQuestion> & { id: number }): SurveyQuestion {
  return {
    surveyId: 1,
    pageId: overrides.id,
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
    sourcePageId: 1,
    sourceQuestionId: 1,
    sourceAnswerOptionId: 11,
    conditionOperator: "equals",
    actionType: "JUMP_TO_QUESTION",
    targetQuestionId: null,
    targetPageId: null,
    skipTargetInNormalFlow: true,
    advanceOnTrigger: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  };
}

function makeSurvey(
  questions: SurveyQuestion[],
  conditionalLogicRules: ConditionalLogicRule[] = []
): Survey {
  const pageIds = [...new Set(questions.map((question) => question.pageId))].sort(
    (left, right) => left - right
  );

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
    pages: pageIds.map((pageId) => ({
      id: pageId,
      surveyId: 1,
      title: `Page ${pageId}`,
      description: null,
      displayOrder: pageId,
      createdAt: timestamp,
      updatedAt: timestamp
    })),
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

describe("resolveNextQuestion", () => {
  it("advances to the next question by display order when no rules exist", () => {
    const q1 = makeQuestion({ id: 1 });
    const q2 = makeQuestion({ id: 2 });
    const survey = makeSurvey([q1, q2]);

    expect(resolveNextQuestion(survey, q1, undefined)?.id).toBe(2);
  });

  it("advances by page order before page-scoped question order", () => {
    const page1Question1 = makeQuestion({ id: 101, pageId: 1, displayOrder: 1 });
    const page1Question2 = makeQuestion({ id: 102, pageId: 1, displayOrder: 2 });
    const page1Question3 = makeQuestion({ id: 103, pageId: 1, displayOrder: 3 });
    const page2Question1 = makeQuestion({ id: 201, pageId: 2, displayOrder: 1 });
    const survey = makeSurvey([
      page2Question1,
      page1Question2,
      page1Question1,
      page1Question3
    ]);

    expect(resolveNextQuestion(survey, page1Question1, undefined)?.id).toBe(102);
    expect(resolveNextQuestion(survey, page1Question2, undefined)?.id).toBe(103);
    expect(resolveNextQuestion(survey, page1Question3, undefined)?.id).toBe(201);
  });

  it("returns null at the end of the survey", () => {
    const q1 = makeQuestion({ id: 1 });
    const q2 = makeQuestion({ id: 2 });
    const survey = makeSurvey([q1, q2]);

    expect(resolveNextQuestion(survey, q2, undefined)).toBeNull();
  });

  it("breaks display-order ties by question id", () => {
    const q1 = makeQuestion({ id: 1, displayOrder: 1 });
    const q3 = makeQuestion({ id: 3, displayOrder: 2 });
    const q2 = makeQuestion({ id: 2, displayOrder: 2 });
    const survey = makeSurvey([q1, q3, q2]);

    expect(resolveNextQuestion(survey, q1, undefined)?.id).toBe(2);
  });

  it("jumps to the rule target when the response contains the source option", () => {
    const q1 = makeQuestion({ id: 1 });
    const q2 = makeQuestion({ id: 2 });
    const q3 = makeQuestion({ id: 3 });
    const rule = makeRule({ id: 1, sourceQuestionId: 1, targetQuestionId: 3 });
    const survey = makeSurvey([q1, q2, q3], [rule]);

    expect(resolveNextQuestion(survey, q1, makeResponse(1, [11]))?.id).toBe(3);
  });

  it("does not jump when the response selects a different option", () => {
    const q1 = makeQuestion({ id: 1 });
    const q2 = makeQuestion({ id: 2 });
    const q3 = makeQuestion({ id: 3 });
    const rule = makeRule({ id: 1, sourceQuestionId: 1, targetQuestionId: 3 });
    const survey = makeSurvey([q1, q2, q3], [rule]);

    expect(resolveNextQuestion(survey, q1, makeResponse(1, [99]))?.id).toBe(2);
  });

  it("skips skip-target questions in normal progression", () => {
    const q1 = makeQuestion({ id: 1 });
    const q2 = makeQuestion({ id: 2 });
    const q3 = makeQuestion({ id: 3 });
    const rule = makeRule({
      id: 1,
      sourceQuestionId: 1,
      targetQuestionId: 2,
      skipTargetInNormalFlow: true
    });
    const survey = makeSurvey([q1, q2, q3], [rule]);

    expect(resolveNextQuestion(survey, q1, makeResponse(1, [99]))?.id).toBe(3);
  });

  it("keeps targets in normal progression when skipTargetInNormalFlow is false", () => {
    const q1 = makeQuestion({ id: 1 });
    const q2 = makeQuestion({ id: 2 });
    const q3 = makeQuestion({ id: 3 });
    const rule = makeRule({
      id: 1,
      sourceQuestionId: 1,
      targetQuestionId: 2,
      skipTargetInNormalFlow: false
    });
    const survey = makeSurvey([q1, q2, q3], [rule]);

    expect(resolveNextQuestion(survey, q1, makeResponse(1, [99]))?.id).toBe(2);
  });

  it("continues past a skipped target after a jump lands on it", () => {
    const q1 = makeQuestion({ id: 1 });
    const q2 = makeQuestion({ id: 2 });
    const q3 = makeQuestion({ id: 3 });
    const rule = makeRule({
      id: 1,
      sourceQuestionId: 1,
      targetQuestionId: 2,
      skipTargetInNormalFlow: true
    });
    const survey = makeSurvey([q1, q2, q3], [rule]);

    expect(resolveNextQuestion(survey, q2, makeResponse(2, []))?.id).toBe(3);
  });

  it("ignores rules with unsupported operators or action types", () => {
    const q1 = makeQuestion({ id: 1 });
    const q2 = makeQuestion({ id: 2 });
    const q3 = makeQuestion({ id: 3 });
    const unsupportedAction = makeRule({
      id: 1,
      sourceQuestionId: 1,
      targetQuestionId: 3,
      actionType: "END_SURVEY",
      skipTargetInNormalFlow: false
    });
    const survey = makeSurvey([q1, q2, q3], [unsupportedAction]);

    expect(resolveNextQuestion(survey, q1, makeResponse(1, [11]))?.id).toBe(2);
  });

  it("only statically skips targets of JUMP_TO_QUESTION rules", () => {
    // HIDE_QUESTION (and other non-jump) targets stay in the normal flow;
    // they are only excluded per attempt once their trigger answer is given.
    const q1 = makeQuestion({ id: 1 });
    const q2 = makeQuestion({ id: 2 });
    const q3 = makeQuestion({ id: 3 });
    const hideRule = makeRule({
      id: 1,
      sourceQuestionId: 1,
      targetQuestionId: 2,
      actionType: "HIDE_QUESTION",
      skipTargetInNormalFlow: true
    });
    const survey = makeSurvey([q1, q2, q3], [hideRule]);

    expect(resolveNextQuestion(survey, q1, makeResponse(1, [99]))?.id).toBe(2);
  });

  it("ends the survey when a fired rule targets a question that no longer exists", () => {
    const q1 = makeQuestion({ id: 1 });
    const q2 = makeQuestion({ id: 2 });
    const rule = makeRule({ id: 1, sourceQuestionId: 1, targetQuestionId: 99 });
    const survey = makeSurvey([q1, q2], [rule]);

    expect(resolveNextQuestion(survey, q1, makeResponse(1, [11]))).toBeNull();
  });

  it("matches multi-select responses containing the source option among others", () => {
    const q1 = makeQuestion({ id: 1, questionType: "multi_select" });
    const q2 = makeQuestion({ id: 2 });
    const q3 = makeQuestion({ id: 3 });
    const rule = makeRule({ id: 1, sourceQuestionId: 1, targetQuestionId: 3 });
    const survey = makeSurvey([q1, q2, q3], [rule]);

    expect(resolveNextQuestion(survey, q1, makeResponse(1, [7, 11, 13]))?.id).toBe(3);
  });

  it("excludes hidden questions from the normal advance", () => {
    const q1 = makeQuestion({ id: 1 });
    const q2 = makeQuestion({ id: 2 });
    const q3 = makeQuestion({ id: 3 });
    const survey = makeSurvey([q1, q2, q3]);

    expect(resolveNextQuestion(survey, q1, undefined, new Set([2]))?.id).toBe(3);
  });

  it("returns null when every remaining question is hidden", () => {
    const q1 = makeQuestion({ id: 1 });
    const q2 = makeQuestion({ id: 2 });
    const survey = makeSurvey([q1, q2]);

    expect(resolveNextQuestion(survey, q1, undefined, new Set([2]))).toBeNull();
  });

  it("advances past a hidden jump target to the next visible question", () => {
    const q1 = makeQuestion({ id: 1 });
    const q2 = makeQuestion({ id: 2 });
    const q3 = makeQuestion({ id: 3 });
    const q4 = makeQuestion({ id: 4 });
    const jumpRule = makeRule({
      id: 1,
      sourceQuestionId: 1,
      targetQuestionId: 3,
      skipTargetInNormalFlow: false
    });
    const survey = makeSurvey([q1, q2, q3, q4], [jumpRule]);

    expect(resolveNextQuestion(survey, q1, makeResponse(1, [11]), new Set([3]))?.id).toBe(4);
  });
});
