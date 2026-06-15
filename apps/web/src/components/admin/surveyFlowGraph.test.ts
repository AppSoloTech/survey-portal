import type {
  AnswerOption,
  ConditionalLogicRule,
  Survey,
  SurveyQuestion
} from "@survey-portal/shared";
import { describe, expect, it } from "vitest";

import { buildSurveyFlowGraph, truncateText } from "./surveyFlowGraph.js";

const timestamp = "2026-01-01T00:00:00.000Z";

function makeOption(overrides: Partial<AnswerOption> & { id: number; questionId: number }): AnswerOption {
  return {
    optionText: `Option ${overrides.id}`,
    displayOrder: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  };
}

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
    title: "Flow survey",
    description: null,
    status: "draft",
    categoryId: null,
    categoryName: null,
    createdByUserId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    publishedAt: null,
    retiredAt: null,
    deletedAt: null,
    questions,
    conditionalLogicRules
  };
}

function issueCodes(survey: Survey): string[] {
  return buildSurveyFlowGraph(survey).issues.map((issue) => issue.code);
}

const sourceWithOption = () =>
  makeQuestion({
    id: 1,
    answerOptions: [makeOption({ id: 11, questionId: 1 })]
  });

describe("buildSurveyFlowGraph nodes", () => {
  it("returns an empty graph for a survey with no questions", () => {
    const graph = buildSurveyFlowGraph(makeSurvey([]));

    expect(graph.nodes).toHaveLength(0);
    expect(graph.conditionalEdges).toHaveLength(0);
    expect(graph.issues).toHaveLength(0);
  });

  it("orders nodes by display order and marks the start node", () => {
    const survey = makeSurvey([
      makeQuestion({ id: 2, displayOrder: 2 }),
      makeQuestion({ id: 1, displayOrder: 1 })
    ]);
    const graph = buildSurveyFlowGraph(survey);

    expect(graph.nodes.map((node) => node.questionId)).toEqual([1, 2]);
    expect(graph.nodes[0].isStart).toBe(true);
    expect(graph.nodes[1].isStart).toBe(false);
  });

  it("labels skip-flow jump targets as conditional only", () => {
    const survey = makeSurvey(
      [sourceWithOption(), makeQuestion({ id: 2 }), makeQuestion({ id: 3 })],
      [makeRule({ id: 1, targetQuestionId: 2, skipTargetInNormalFlow: true })]
    );
    const graph = buildSurveyFlowGraph(survey);
    const nodeByQuestionId = new Map(graph.nodes.map((node) => [node.questionId, node]));

    expect(nodeByQuestionId.get(2)?.isConditionalOnly).toBe(true);
    expect(nodeByQuestionId.get(3)?.isConditionalOnly).toBe(false);
    expect(nodeByQuestionId.get(1)?.normalNextQuestionId).toBe(3);
    expect(graph.issues).toHaveLength(0);
  });

  it("does not label targets that stay in normal flow", () => {
    const survey = makeSurvey(
      [sourceWithOption(), makeQuestion({ id: 2 })],
      [makeRule({ id: 1, targetQuestionId: 2, skipTargetInNormalFlow: false })]
    );
    const graph = buildSurveyFlowGraph(survey);

    expect(graph.nodes[1].isConditionalOnly).toBe(false);
  });
});

describe("buildSurveyFlowGraph validation issues", () => {
  it("flags rules whose source question is missing", () => {
    const survey = makeSurvey(
      [makeQuestion({ id: 1 }), makeQuestion({ id: 2 })],
      [makeRule({ id: 1, sourceQuestionId: 99, targetQuestionId: 2 })]
    );

    expect(issueCodes(survey)).toContain("missing_source_question");
  });

  it("flags rules whose source question type cannot drive jumps", () => {
    const survey = makeSurvey(
      [makeQuestion({ id: 1, questionType: "text" }), makeQuestion({ id: 2 })],
      [makeRule({ id: 1, targetQuestionId: 2 })]
    );

    expect(issueCodes(survey)).toContain("invalid_source_question_type");
  });

  it("flags rules whose source option does not belong to the source question", () => {
    const survey = makeSurvey(
      [makeQuestion({ id: 1 }), makeQuestion({ id: 2 })],
      [makeRule({ id: 1, sourceAnswerOptionId: 999, targetQuestionId: 2 })]
    );

    expect(issueCodes(survey)).toContain("missing_source_option");
  });

  it("flags rules whose target question is missing", () => {
    const survey = makeSurvey(
      [sourceWithOption(), makeQuestion({ id: 2 })],
      [makeRule({ id: 1, targetQuestionId: 99 })]
    );

    expect(issueCodes(survey)).toContain("missing_target_question");
  });

  it("flags unsupported condition operators", () => {
    const survey = makeSurvey(
      [sourceWithOption(), makeQuestion({ id: 2 })],
      [
        makeRule({
          id: 1,
          targetQuestionId: 2,
          conditionOperator: "contains" as ConditionalLogicRule["conditionOperator"]
        })
      ]
    );

    expect(issueCodes(survey)).toContain("unsupported_condition_operator");
  });

  it("flags unsupported action types as informational", () => {
    const survey = makeSurvey(
      [sourceWithOption(), makeQuestion({ id: 2 })],
      [makeRule({ id: 1, targetQuestionId: 2, actionType: "END_SURVEY" })]
    );

    expect(issueCodes(survey)).toContain("unsupported_action_type");
  });

  it("treats skip rules as supported", () => {
    const survey = makeSurvey(
      [sourceWithOption(), makeQuestion({ id: 2 })],
      [
        makeRule({
          id: 1,
          targetQuestionId: 2,
          actionType: "HIDE_QUESTION",
          skipTargetInNormalFlow: false
        })
      ]
    );

    expect(issueCodes(survey)).not.toContain("unsupported_action_type");
  });

  it("treats blank text skip rules as supported", () => {
    const survey = makeSurvey(
      [
        makeQuestion({ id: 1, questionType: "text", isRequired: false }),
        makeQuestion({ id: 2 })
      ],
      [
        makeRule({
          id: 1,
          sourceAnswerOptionId: null,
          conditionOperator: "is_blank",
          targetQuestionId: 2,
          actionType: "HIDE_QUESTION",
          skipTargetInNormalFlow: false
        })
      ]
    );
    const graph = buildSurveyFlowGraph(survey);

    expect(graph.issues).toHaveLength(0);
    expect(graph.conditionalEdges[0]).toMatchObject({
      sourceAnswerOptionId: null,
      conditionOperator: "is_blank",
      canFireAtRuntime: true
    });
  });

  it("keeps skip-rule targets in the normal flow", () => {
    // Even with a (legacy) skip-in-normal-flow flag, a HIDE rule's target
    // must stay in normal progression — it is only hidden per attempt.
    const survey = makeSurvey(
      [sourceWithOption(), makeQuestion({ id: 2 }), makeQuestion({ id: 3 })],
      [
        makeRule({
          id: 1,
          targetQuestionId: 2,
          actionType: "HIDE_QUESTION",
          skipTargetInNormalFlow: true
        })
      ]
    );
    const graph = buildSurveyFlowGraph(survey);
    const targetNode = graph.nodes.find((node) => node.questionId === 2);

    expect(targetNode?.isConditionalOnly).toBe(false);
    expect(targetNode?.isReachable).toBe(true);
  });

  it("flags redundant duplicate skip rules", () => {
    const survey = makeSurvey(
      [sourceWithOption(), makeQuestion({ id: 2 })],
      [
        makeRule({
          id: 1,
          targetQuestionId: 2,
          actionType: "HIDE_QUESTION",
          skipTargetInNormalFlow: false
        }),
        makeRule({
          id: 2,
          targetQuestionId: 2,
          actionType: "HIDE_QUESTION",
          skipTargetInNormalFlow: false
        })
      ]
    );

    expect(issueCodes(survey)).toContain("duplicate_skip_rule");
  });

  it("allows multiple skip rules with different targets for one answer", () => {
    const survey = makeSurvey(
      [sourceWithOption(), makeQuestion({ id: 2 }), makeQuestion({ id: 3 })],
      [
        makeRule({
          id: 1,
          targetQuestionId: 2,
          actionType: "HIDE_QUESTION",
          skipTargetInNormalFlow: false
        }),
        makeRule({
          id: 2,
          targetQuestionId: 3,
          actionType: "HIDE_QUESTION",
          skipTargetInNormalFlow: false
        })
      ]
    );

    const codes = issueCodes(survey);

    expect(codes).not.toContain("duplicate_skip_rule");
    expect(codes).not.toContain("duplicate_rule_for_option");
  });

  it("does not let skip edges create reachability", () => {
    // Question 3 is statically skipped by a broken jump rule that can never
    // fire; the firable skip rule targeting it must not count as a path.
    const survey = makeSurvey(
      [sourceWithOption(), makeQuestion({ id: 2 }), makeQuestion({ id: 3 })],
      [
        makeRule({ id: 1, sourceAnswerOptionId: 999, targetQuestionId: 3 }),
        makeRule({
          id: 2,
          targetQuestionId: 3,
          actionType: "HIDE_QUESTION",
          skipTargetInNormalFlow: false
        })
      ]
    );
    const graph = buildSurveyFlowGraph(survey);

    expect(graph.nodes.find((node) => node.questionId === 3)?.isReachable).toBe(false);
  });

  it("flags self-targeting and backward rules", () => {
    const selfTarget = makeSurvey(
      [sourceWithOption(), makeQuestion({ id: 2 })],
      [makeRule({ id: 1, targetQuestionId: 1 })]
    );
    const backward = makeSurvey(
      [
        makeQuestion({ id: 1 }),
        makeQuestion({
          id: 2,
          answerOptions: [makeOption({ id: 21, questionId: 2 })]
        })
      ],
      [
        makeRule({
          id: 1,
          sourceQuestionId: 2,
          sourceAnswerOptionId: 21,
          targetQuestionId: 1
        })
      ]
    );

    expect(issueCodes(selfTarget)).toContain("backward_or_self_target");
    expect(issueCodes(backward)).toContain("backward_or_self_target");
  });

  it("flags duplicate rules for the same source answer option", () => {
    const survey = makeSurvey(
      [sourceWithOption(), makeQuestion({ id: 2 }), makeQuestion({ id: 3 })],
      [
        makeRule({ id: 1, targetQuestionId: 2 }),
        makeRule({ id: 2, targetQuestionId: 3 })
      ]
    );

    expect(issueCodes(survey)).toContain("duplicate_rule_for_option");
  });

  it("flags questions unreachable by normal or conditional flow", () => {
    // The skip-flow rule removes question 2 from normal progression, and its
    // broken source option means the jump can never fire.
    const survey = makeSurvey(
      [makeQuestion({ id: 1 }), makeQuestion({ id: 2 }), makeQuestion({ id: 3 })],
      [makeRule({ id: 1, sourceAnswerOptionId: 999, targetQuestionId: 2 })]
    );
    const graph = buildSurveyFlowGraph(survey);

    expect(graph.issues.map((issue) => issue.code)).toContain("unreachable_question");
    expect(graph.nodes.find((node) => node.questionId === 2)?.isReachable).toBe(false);
  });

  it("treats firable jump targets as reachable", () => {
    const survey = makeSurvey(
      [sourceWithOption(), makeQuestion({ id: 2 }), makeQuestion({ id: 3 })],
      [makeRule({ id: 1, targetQuestionId: 2, skipTargetInNormalFlow: true })]
    );
    const graph = buildSurveyFlowGraph(survey);

    expect(graph.nodes.every((node) => node.isReachable)).toBe(true);
  });

  it("detects circular navigation in legacy data", () => {
    // Backward jump from question 2 to question 1 plus normal flow forms a loop.
    const survey = makeSurvey(
      [
        makeQuestion({ id: 1 }),
        makeQuestion({
          id: 2,
          answerOptions: [makeOption({ id: 21, questionId: 2 })]
        })
      ],
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

    expect(issueCodes(survey)).toContain("circular_navigation");
  });

  it("reports no issues for a clean linear survey", () => {
    const survey = makeSurvey([makeQuestion({ id: 1 }), makeQuestion({ id: 2 })]);

    expect(issueCodes(survey)).toHaveLength(0);
  });
});

describe("truncateText", () => {
  it("returns short text unchanged", () => {
    expect(truncateText("short", 10)).toBe("short");
  });

  it("truncates long text with an ellipsis", () => {
    const result = truncateText("a".repeat(80), 60);

    expect(result.length).toBeLessThanOrEqual(60);
    expect(result.endsWith("...")).toBe(true);
  });
});
