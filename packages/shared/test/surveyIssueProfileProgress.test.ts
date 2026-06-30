import { describe, expect, it } from "vitest";

import {
  calculateSurveyIssueProfileEmojiCollection,
  calculateSurveyIssueProfileProgress,
  type AnswerTag,
  type ConditionalLogicRule,
  type QuestionOtherTag,
  type QuestionValueTag,
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

function makeAnswerTag(
  id: number,
  answerOptionId: number,
  tagKey: string,
  tagValue = "identified",
  emoji: string | null = null
): AnswerTag {
  return {
    id,
    answerOptionId,
    tagKey,
    tagValue,
    emoji,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function makeOtherTag(
  id: number,
  questionId: number,
  tagKey: string,
  emoji: string | null = null
): QuestionOtherTag {
  return {
    id,
    questionId,
    tagKey,
    tagValue: "other",
    emoji,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function makeValueTag(
  id: number,
  questionId: number,
  tagKey: string,
  integerMin: number | null = null,
  integerMax: number | null = null,
  emoji: string | null = null
): QuestionValueTag {
  return {
    id,
    questionId,
    integerMin,
    integerMax,
    tagKey,
    tagValue: "value",
    emoji,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function makeQuestion(
  id: number,
  pageId: number,
  overrides: Partial<SurveyQuestion> = {}
): SurveyQuestion {
  return {
    id,
    surveyId: 1,
    pageId,
    questionText: `Question ${id}`,
    questionType: "single_select",
    allowOther: false,
    scaleMin: null,
    scaleMax: null,
    displayOrder: id,
    isRequired: true,
    helpText: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    answerOptions: [
      {
        id: id * 10 + 1,
        questionId: id,
        optionText: "Yes",
        displayOrder: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        answerTags: []
      }
    ],
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
  return {
    id: 1,
    title: "Issue profile survey",
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
    effectiveEstimateSeconds: 60,
    pages: [...new Set(questions.map((question) => question.pageId))].map((pageId) =>
      makePage(pageId)
    ),
    questions,
    conditionalLogicRules
  };
}

function makeResponse(
  questionId: number,
  overrides: Partial<SurveyResponseAnswer> = {}
): SurveyResponseAnswer {
  return {
    id: questionId,
    surveyAttemptId: 1,
    questionId,
    answerText: null,
    answerInteger: null,
    selectedAnswerOptionIds: [questionId * 10 + 1],
    otherText: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  };
}

describe("calculateSurveyIssueProfileProgress", () => {
  it("counts unique tag keys once across selected answer options", () => {
    const question = makeQuestion(1, 1, {
      answerOptions: [
        {
          id: 11,
          questionId: 1,
          optionText: "Yes",
          displayOrder: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
          answerTags: [
            makeAnswerTag(1, 11, "accessibility", "ada"),
            makeAnswerTag(2, 11, "accessibility", "program_access")
          ]
        }
      ]
    });

    const progress = calculateSurveyIssueProfileProgress({
      attemptStatus: "in_progress",
      responses: [makeResponse(1)],
      survey: makeSurvey([question])
    });

    expect(progress).toMatchObject({
      identifiedCategoryCount: 1,
      encounteredCategoryCount: 1,
      status: "building"
    });
    expect(progress.fillPercent).toBeGreaterThan(0);
  });

  it("identifies selected option, Other, and value-tag categories", () => {
    const selectedQuestion = makeQuestion(1, 1, {
      answerOptions: [
        {
          id: 11,
          questionId: 1,
          optionText: "Yes",
          displayOrder: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
          answerTags: [makeAnswerTag(1, 11, "accessibility")]
        }
      ]
    });
    const otherQuestion = makeQuestion(2, 2, {
      allowOther: true,
      otherTags: [makeOtherTag(1, 2, "communication")]
    });
    const valueQuestion = makeQuestion(3, 3, {
      answerOptions: [],
      questionType: "integer",
      valueTags: [makeValueTag(1, 3, "program_access", 5, null)]
    });

    const progress = calculateSurveyIssueProfileProgress({
      attemptStatus: "in_progress",
      responses: [
        makeResponse(1),
        makeResponse(2, { otherText: "Different barrier", selectedAnswerOptionIds: [] }),
        makeResponse(3, { answerInteger: 7, selectedAnswerOptionIds: [] })
      ],
      survey: makeSurvey([selectedQuestion, otherQuestion, valueQuestion])
    });

    expect(progress.identifiedCategoryCount).toBe(3);
    expect(progress.encounteredCategoryCount).toBe(3);
    expect(progress.status).toBe("building");
  });

  it("keeps an empty profile at zero fill", () => {
    const progress = calculateSurveyIssueProfileProgress({
      attemptStatus: "in_progress",
      responses: [],
      survey: makeSurvey([makeQuestion(1, 1)])
    });

    expect(progress).toEqual({
      fillPercent: 0,
      identifiedCategoryCount: 0,
      encounteredCategoryCount: 0,
      status: "empty"
    });
  });

  it("fills to 100 only for completed attempts with identified categories", () => {
    const taggedQuestion = makeQuestion(1, 1, {
      answerOptions: [
        {
          id: 11,
          questionId: 1,
          optionText: "Yes",
          displayOrder: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
          answerTags: [makeAnswerTag(1, 11, "civil_rights")]
        }
      ]
    });
    const taggedProgress = calculateSurveyIssueProfileProgress({
      attemptStatus: "completed",
      responses: [makeResponse(1)],
      survey: makeSurvey([taggedQuestion])
    });
    const untaggedProgress = calculateSurveyIssueProfileProgress({
      attemptStatus: "completed",
      responses: [makeResponse(1)],
      survey: makeSurvey([makeQuestion(1, 1)])
    });

    expect(taggedProgress.fillPercent).toBe(100);
    expect(taggedProgress.status).toBe("complete");
    expect(untaggedProgress.fillPercent).toBe(0);
    expect(untaggedProgress.status).toBe("complete_empty");
  });

  it("ignores stale off-path tagged responses after a branch change", () => {
    const routeQuestion = makeQuestion(1, 1, {
      answerOptions: [
        {
          id: 11,
          questionId: 1,
          optionText: "Jump",
          displayOrder: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
          answerTags: []
        }
      ]
    });
    const staleQuestion = makeQuestion(2, 2, {
      answerOptions: [
        {
          id: 21,
          questionId: 2,
          optionText: "Stale",
          displayOrder: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
          answerTags: [makeAnswerTag(1, 21, "stale_branch")]
        }
      ]
    });
    const targetQuestion = makeQuestion(3, 3);
    const survey = makeSurvey(
      [routeQuestion, staleQuestion, targetQuestion],
      [
        makeRule({
          id: 1,
          sourceQuestionId: 1,
          sourceAnswerOptionId: 11,
          targetPageId: 3
        })
      ]
    );

    const progress = calculateSurveyIssueProfileProgress({
      attemptStatus: "in_progress",
      responses: [makeResponse(1), makeResponse(2, { selectedAnswerOptionIds: [21] })],
      survey
    });

    expect(progress.identifiedCategoryCount).toBe(0);
    expect(progress.fillPercent).toBe(0);
    expect(progress.status).toBe("empty");
  });
});

describe("calculateSurveyIssueProfileEmojiCollection", () => {
  it("aggregates repeated matched tag emojis by frequency", () => {
    const question = makeQuestion(1, 1, {
      answerOptions: [
        {
          id: 11,
          questionId: 1,
          optionText: "Yes",
          displayOrder: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
          answerTags: [
            makeAnswerTag(1, 11, "equity", "a", "😩"),
            makeAnswerTag(2, 11, "civil_rights", "b", "😩"),
            makeAnswerTag(3, 11, "workforce", "c", "😡")
          ]
        }
      ]
    });

    const collection = calculateSurveyIssueProfileEmojiCollection({
      responses: [makeResponse(1)],
      survey: makeSurvey([question])
    });

    expect(collection).toEqual({
      items: [
        { emoji: "😩", count: 2 },
        { emoji: "😡", count: 1 }
      ],
      totalCount: 3
    });
  });

  it("includes selected option, Other, and matching value tag emojis", () => {
    const selectedQuestion = makeQuestion(1, 1, {
      answerOptions: [
        {
          id: 11,
          questionId: 1,
          optionText: "Yes",
          displayOrder: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
          answerTags: [makeAnswerTag(1, 11, "selected", "yes", "😡")]
        }
      ]
    });
    const otherQuestion = makeQuestion(2, 2, {
      allowOther: true,
      otherTags: [makeOtherTag(1, 2, "other", "😤")]
    });
    const valueQuestion = makeQuestion(3, 3, {
      answerOptions: [],
      questionType: "integer",
      valueTags: [makeValueTag(1, 3, "value", 5, null, "👎")]
    });

    const collection = calculateSurveyIssueProfileEmojiCollection({
      responses: [
        makeResponse(1),
        makeResponse(2, { otherText: "Other barrier", selectedAnswerOptionIds: [] }),
        makeResponse(3, { answerInteger: 7, selectedAnswerOptionIds: [] })
      ],
      survey: makeSurvey([selectedQuestion, otherQuestion, valueQuestion])
    });

    expect(collection.items).toEqual(
      expect.arrayContaining([
        { emoji: "👎", count: 1 },
        { emoji: "😡", count: 1 },
        { emoji: "😤", count: 1 }
      ])
    );
    expect(collection.items).toHaveLength(3);
    expect(collection.totalCount).toBe(3);
  });

  it("ignores matching tags without emoji", () => {
    const question = makeQuestion(1, 1, {
      answerOptions: [
        {
          id: 11,
          questionId: 1,
          optionText: "Yes",
          displayOrder: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
          answerTags: [
            makeAnswerTag(1, 11, "without_emoji"),
            makeAnswerTag(2, 11, "with_emoji", "yes", "🚫")
          ]
        }
      ]
    });

    const collection = calculateSurveyIssueProfileEmojiCollection({
      responses: [makeResponse(1)],
      survey: makeSurvey([question])
    });

    expect(collection).toEqual({
      items: [{ emoji: "🚫", count: 1 }],
      totalCount: 1
    });
  });

  it("ignores stale off-path emoji responses after a branch change", () => {
    const routeQuestion = makeQuestion(1, 1);
    const staleQuestion = makeQuestion(2, 2, {
      answerOptions: [
        {
          id: 21,
          questionId: 2,
          optionText: "Stale",
          displayOrder: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
          answerTags: [makeAnswerTag(1, 21, "stale_branch", "yes", "🤬")]
        }
      ]
    });
    const targetQuestion = makeQuestion(3, 3);
    const survey = makeSurvey(
      [routeQuestion, staleQuestion, targetQuestion],
      [
        makeRule({
          id: 1,
          sourceQuestionId: 1,
          sourceAnswerOptionId: 11,
          targetPageId: 3
        })
      ]
    );

    const collection = calculateSurveyIssueProfileEmojiCollection({
      responses: [makeResponse(1), makeResponse(2, { selectedAnswerOptionIds: [21] })],
      survey
    });

    expect(collection).toEqual({ items: [], totalCount: 0 });
  });
});
