import { describe, expect, it } from "vitest";

import {
  calculateSurveyRemainingTimeEstimate,
  formatRemainingTimeCopy,
  type ConditionalLogicRule,
  type Survey,
  type SurveyPage,
  type SurveyQuestion,
  type SurveyQuestionType,
  type SurveyResponseAnswer
} from "../src/index.js";

const timestamp = "2026-01-01T00:00:00.000Z";

function makePage(id: number): SurveyPage {
  return {
    id,
    surveyId: 1,
    title: `Page ${id}`,
    description: null,
    displayOrder: id,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function makeQuestion(
  id: number,
  questionType: SurveyQuestionType,
  pageId = id,
  displayOrder = 1
): SurveyQuestion {
  return {
    id,
    surveyId: 1,
    pageId,
    questionText: `Question ${id}`,
    questionType,
    allowOther: false,
    scaleMin: questionType === "scale" ? 1 : null,
    scaleMax: questionType === "scale" ? 5 : null,
    displayOrder,
    isRequired: true,
    helpText: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    answerOptions:
      questionType === "single_select" || questionType === "multi_select" || questionType === "scale"
        ? [
            {
              id: id * 10 + 1,
              questionId: id,
              optionText: questionType === "scale" ? "1" : "Yes",
              displayOrder: 1,
              createdAt: timestamp,
              updatedAt: timestamp
            }
          ]
        : []
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
    advanceOnTrigger: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  };
}

function makeSurvey(
  questions: SurveyQuestion[],
  effectiveEstimateSeconds: number,
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
    effectiveEstimateSeconds,
    pages: [...new Set(questions.map((question) => question.pageId))].map((pageId) =>
      makePage(pageId)
    ),
    questions,
    conditionalLogicRules
  };
}

function makeResponse(
  question: SurveyQuestion,
  overrides: Partial<SurveyResponseAnswer> = {}
): SurveyResponseAnswer {
  return {
    id: question.id,
    surveyAttemptId: 1,
    questionId: question.id,
    answerText: question.questionType === "text" ? "Answered" : null,
    answerInteger:
      question.questionType === "integer" || question.questionType === "scale" ? 1 : null,
    selectedAnswerOptionIds:
      question.questionType === "single_select" ||
      question.questionType === "multi_select" ||
      question.questionType === "scale"
        ? [question.id * 10 + 1]
        : [],
    otherText: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  };
}

describe("calculateSurveyRemainingTimeEstimate", () => {
  it("weights text, integer, select, multi-select, and scale questions", () => {
    const survey = makeSurvey(
      [
        makeQuestion(1, "text"),
        makeQuestion(2, "integer"),
        makeQuestion(3, "single_select"),
        makeQuestion(4, "multi_select"),
        makeQuestion(5, "scale")
      ],
      255
    );

    const estimate = calculateSurveyRemainingTimeEstimate({
      currentPageId: 1,
      responses: [],
      survey
    });

    expect(estimate.totalPathWeightSeconds).toBe(255);
    expect(estimate.remainingPathWeightSeconds).toBe(255);
    expect(estimate.remainingQuestionIds).toEqual([1, 2, 3, 4, 5]);
    expect(estimate.remainingSeconds).toBe(255);
  });

  it("scales remaining question weights from the effective survey estimate", () => {
    const questions = [
      makeQuestion(1, "text"),
      makeQuestion(2, "integer"),
      makeQuestion(3, "single_select"),
      makeQuestion(4, "multi_select"),
      makeQuestion(5, "scale")
    ];
    const survey = makeSurvey(questions, 510);

    const estimate = calculateSurveyRemainingTimeEstimate({
      currentPageId: 2,
      responses: [makeResponse(questions[0])],
      survey
    });

    expect(estimate.totalPathWeightSeconds).toBe(255);
    expect(estimate.remainingPathWeightSeconds).toBe(165);
    expect(estimate.remainingSeconds).toBe(330);
    expect(estimate.copy).toBe("About 6 min remaining");
  });

  it("decreases across a straight resolved page path", () => {
    const questions = [
      makeQuestion(1, "text"),
      makeQuestion(2, "integer"),
      makeQuestion(3, "single_select")
    ];
    const survey = makeSurvey(questions, 165);

    const start = calculateSurveyRemainingTimeEstimate({
      currentPageId: 1,
      responses: [],
      survey
    });
    const afterFirstPage = calculateSurveyRemainingTimeEstimate({
      currentPageId: 2,
      responses: [makeResponse(questions[0])],
      survey
    });
    const afterSecondPage = calculateSurveyRemainingTimeEstimate({
      currentPageId: 3,
      responses: [makeResponse(questions[0]), makeResponse(questions[1])],
      survey
    });

    expect(start.remainingSeconds).toBe(165);
    expect(afterFirstPage.remainingSeconds).toBeLessThan(start.remainingSeconds);
    expect(afterSecondPage.remainingSeconds).toBeLessThan(afterFirstPage.remainingSeconds);
  });

  it("counts unanswered visible current-page questions and future-page questions", () => {
    const questions = [
      makeQuestion(1, "text", 1, 1),
      makeQuestion(2, "integer", 1, 2),
      makeQuestion(3, "multi_select", 2, 1)
    ];
    const survey = makeSurvey(questions, 180);

    const estimate = calculateSurveyRemainingTimeEstimate({
      currentPageId: 1,
      responses: [makeResponse(questions[0])],
      survey
    });

    expect(estimate.remainingQuestionIds).toEqual([2, 3]);
    expect(estimate.remainingPathWeightSeconds).toBe(90);
  });

  it("updates when a saved answer changes the resolved branch path", () => {
    const questions = [
      makeQuestion(1, "single_select"),
      makeQuestion(2, "text"),
      makeQuestion(3, "integer")
    ];
    const survey = makeSurvey(questions, 180, [
      makeRule({
        id: 1,
        targetPageId: 3
      })
    ]);

    const normalEstimate = calculateSurveyRemainingTimeEstimate({
      currentPageId: 1,
      responses: [],
      survey
    });
    const branchedEstimate = calculateSurveyRemainingTimeEstimate({
      currentPageId: 3,
      responses: [makeResponse(questions[0])],
      survey
    });

    expect(normalEstimate.remainingQuestionIds).toEqual([1, 2]);
    expect(branchedEstimate.remainingQuestionIds).toEqual([3]);
    expect(branchedEstimate.totalPathWeightSeconds).toBe(75);
  });

  it("treats an unknown current page as not-yet-complete defensively", () => {
    const survey = makeSurvey([makeQuestion(1, "text"), makeQuestion(2, "integer")], 120);

    const estimate = calculateSurveyRemainingTimeEstimate({
      currentPageId: 999,
      responses: [],
      survey
    });

    expect(estimate.remainingQuestionIds).toEqual([1, 2]);
    expect(estimate.remainingSeconds).toBe(120);
  });

  it("formats almost-done and less-than-one-minute copy", () => {
    expect(formatRemainingTimeCopy(15)).toBe("Almost done");
    expect(formatRemainingTimeCopy(45)).toBe("Less than 1 min remaining");
  });
});
