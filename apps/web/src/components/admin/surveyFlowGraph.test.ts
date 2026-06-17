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

  it("orders questions by page before page-scoped question order", () => {
    const survey = makeSurvey([
      makeQuestion({ id: 201, pageId: 2, displayOrder: 1 }),
      makeQuestion({ id: 102, pageId: 1, displayOrder: 2 }),
      makeQuestion({ id: 101, pageId: 1, displayOrder: 1 }),
      makeQuestion({ id: 103, pageId: 1, displayOrder: 3 })
    ]);
    const graph = buildSurveyFlowGraph(survey);

    expect(graph.nodes.map((node) => node.questionId)).toEqual([101, 102, 103, 201]);
    expect(graph.nodes.map((node) => node.flowOrder)).toEqual([1, 2, 3, 4]);
    expect(graph.nodes.map((node) => [node.pageDisplayOrder, node.questionDisplayOrder])).toEqual([
      [1, 1],
      [1, 2],
      [1, 3],
      [2, 1]
    ]);
    expect(graph.nodes.map((node) => node.normalNextQuestionId)).toEqual([102, 103, 201, null]);
    expect(graph.issues).toHaveLength(0);
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

  it("labels every question on a skip-flow page-jump target page as conditional only", () => {
    const survey = makeSurvey(
      [
        sourceWithOption(),
        makeQuestion({ id: 2, pageId: 2, displayOrder: 1 }),
        makeQuestion({ id: 3, pageId: 2, displayOrder: 2 }),
        makeQuestion({ id: 4, pageId: 3, displayOrder: 1 })
      ],
      [
        makeRule({
          id: 1,
          targetQuestionId: null,
          targetPageId: 2,
          actionType: "JUMP_TO_PAGE",
          skipTargetInNormalFlow: true
        })
      ]
    );
    const graph = buildSurveyFlowGraph(survey);
    const nodeByQuestionId = new Map(graph.nodes.map((node) => [node.questionId, node]));

    expect(nodeByQuestionId.get(2)?.isConditionalOnly).toBe(true);
    expect(nodeByQuestionId.get(3)?.isConditionalOnly).toBe(true);
    expect(nodeByQuestionId.get(4)?.isConditionalOnly).toBe(false);
    expect(graph.issues.map((issue) => issue.code)).not.toContain("unreachable_question");
  });

  it("routes normal flow around skipped branch pages while walking within one", () => {
    // Department (page 1) branches to Engineering (page 2: q2,q3), Sales
    // (page 3: q4), and Operations (page 4: q5); all three branch pages are
    // skip-in-normal-flow. Shared Final is page 5 (q6).
    const department = makeQuestion({
      id: 1,
      pageId: 1,
      displayOrder: 1,
      answerOptions: [
        makeOption({ id: 11, questionId: 1 }),
        makeOption({ id: 12, questionId: 1 }),
        makeOption({ id: 13, questionId: 1 })
      ]
    });
    const survey = makeSurvey(
      [
        department,
        makeQuestion({ id: 2, pageId: 2, displayOrder: 1 }),
        makeQuestion({ id: 3, pageId: 2, displayOrder: 2 }),
        makeQuestion({ id: 4, pageId: 3, displayOrder: 1 }),
        makeQuestion({ id: 5, pageId: 4, displayOrder: 1 }),
        makeQuestion({ id: 6, pageId: 5, displayOrder: 1 })
      ],
      [
        makeRule({ id: 1, sourceAnswerOptionId: 11, targetPageId: 2, actionType: "JUMP_TO_PAGE" }),
        makeRule({ id: 2, sourceAnswerOptionId: 12, targetPageId: 3, actionType: "JUMP_TO_PAGE" }),
        makeRule({ id: 3, sourceAnswerOptionId: 13, targetPageId: 4, actionType: "JUMP_TO_PAGE" })
      ]
    );
    const graph = buildSurveyFlowGraph(survey);
    const nodeByQuestionId = new Map(graph.nodes.map((node) => [node.questionId, node]));

    // Department with no rule firing skips every branch page straight to Final.
    expect(nodeByQuestionId.get(1)?.normalNextQuestionId).toBe(6);
    // Inside the Engineering branch, normal flow still walks q2 -> q3...
    expect(nodeByQuestionId.get(2)?.normalNextQuestionId).toBe(3);
    // ...then q3 (last on the branch page) bypasses Sales/Operations to Final.
    expect(nodeByQuestionId.get(3)?.normalNextQuestionId).toBe(6);
    expect(nodeByQuestionId.get(5)?.normalNextQuestionId).toBe(6);
    // Every question is still reachable (each branch via its firable jump).
    expect(graph.nodes.every((node) => node.isReachable)).toBe(true);
    expect(graph.issues.map((issue) => issue.code)).not.toContain("unreachable_question");
  });

  it("walks through a same-page jump target on a page reached by a page jump", () => {
    // Department (page 1) jumps to the Engineering branch page (page 2), which
    // holds EngA (q2) and EngB (q3). EngB is ALSO a skip-in-normal-flow
    // JUMP_TO_QUESTION target from EngA. Because the participant reaches page 2
    // by a jump, the runtime reveals EngA -> EngB, so the map must too.
    const department = makeQuestion({
      id: 1,
      pageId: 1,
      displayOrder: 1,
      answerOptions: [makeOption({ id: 11, questionId: 1 })]
    });
    const engineeringA = makeQuestion({
      id: 2,
      pageId: 2,
      displayOrder: 1,
      answerOptions: [makeOption({ id: 31, questionId: 2 })]
    });
    const survey = makeSurvey(
      [
        department,
        engineeringA,
        makeQuestion({ id: 3, pageId: 2, displayOrder: 2 }),
        makeQuestion({ id: 4, pageId: 3, displayOrder: 1 })
      ],
      [
        makeRule({ id: 1, sourceAnswerOptionId: 11, targetPageId: 2, actionType: "JUMP_TO_PAGE" }),
        makeRule({
          id: 2,
          sourceQuestionId: 2,
          sourceAnswerOptionId: 31,
          targetQuestionId: 3,
          actionType: "JUMP_TO_QUESTION"
        })
      ]
    );
    const graph = buildSurveyFlowGraph(survey);
    const nodeByQuestionId = new Map(graph.nodes.map((node) => [node.questionId, node]));

    // EngA walks to the same-page EngB even though EngB is a question-level
    // skip target; EngB then leaves the branch page for Final.
    expect(nodeByQuestionId.get(2)?.normalNextQuestionId).toBe(3);
    expect(nodeByQuestionId.get(3)?.normalNextQuestionId).toBe(4);
    expect(nodeByQuestionId.get(3)?.isReachable).toBe(true);
    expect(graph.issues.map((issue) => issue.code)).not.toContain("unreachable_question");
  });

  it("walks through a same-page jump target on a page reached by a question jump", () => {
    // Q1 (page 1) jumps to Q2 (page 2) with skipTargetInNormalFlow. Page 2 also
    // holds Q3, itself a skip-flow JUMP_TO_QUESTION target. The runtime reaches
    // page 2 by a jump (wasReachedByJump) and walks Q2 -> Q3, so the map must
    // too — even though page 2 is not a JUMP_TO_PAGE branch page.
    const router = makeQuestion({
      id: 1,
      pageId: 1,
      displayOrder: 1,
      answerOptions: [makeOption({ id: 11, questionId: 1 })]
    });
    const target = makeQuestion({
      id: 2,
      pageId: 2,
      displayOrder: 1,
      answerOptions: [makeOption({ id: 31, questionId: 2 })]
    });
    const survey = makeSurvey(
      [
        router,
        target,
        makeQuestion({ id: 3, pageId: 2, displayOrder: 2 }),
        makeQuestion({ id: 4, pageId: 3, displayOrder: 1 })
      ],
      [
        makeRule({ id: 1, sourceAnswerOptionId: 11, targetQuestionId: 2, actionType: "JUMP_TO_QUESTION" }),
        makeRule({
          id: 2,
          sourceQuestionId: 2,
          sourceAnswerOptionId: 31,
          targetQuestionId: 3,
          actionType: "JUMP_TO_QUESTION"
        })
      ]
    );
    const graph = buildSurveyFlowGraph(survey);
    const nodeByQuestionId = new Map(graph.nodes.map((node) => [node.questionId, node]));

    // Q2 is conditional-only (jump target); its page is reached by jump, so the
    // same-page Q3 target is revealed rather than skipped.
    expect(nodeByQuestionId.get(2)?.isConditionalOnly).toBe(true);
    expect(nodeByQuestionId.get(2)?.normalNextQuestionId).toBe(3);
    expect(nodeByQuestionId.get(3)?.normalNextQuestionId).toBe(4);
    expect(nodeByQuestionId.get(3)?.isReachable).toBe(true);
  });

  it("keeps page-jump target questions in normal flow when the flag is off", () => {
    const survey = makeSurvey(
      [
        sourceWithOption(),
        makeQuestion({ id: 2, pageId: 2, displayOrder: 1 }),
        makeQuestion({ id: 3, pageId: 3, displayOrder: 1 })
      ],
      [
        makeRule({
          id: 1,
          targetQuestionId: null,
          targetPageId: 2,
          actionType: "JUMP_TO_PAGE",
          skipTargetInNormalFlow: false
        })
      ]
    );
    const graph = buildSurveyFlowGraph(survey);

    expect(graph.nodes.every((node) => node.isConditionalOnly === false)).toBe(true);
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

  it("treats a HIDE_PAGE rule targeting an empty later page as a valid no-op", () => {
    const survey = makeSurvey(
      [sourceWithOption()],
      [
        makeRule({
          id: 1,
          actionType: "HIDE_PAGE",
          targetQuestionId: null,
          targetPageId: 2,
          skipTargetInNormalFlow: false
        })
      ]
    );
    // Page 2 exists but holds no questions (source is the only question, on page 1).
    survey.pages.push({
      id: 2,
      surveyId: 1,
      title: "Page 2",
      description: null,
      displayOrder: 2,
      createdAt: timestamp,
      updatedAt: timestamp
    });

    const graph = buildSurveyFlowGraph(survey);
    const edge = graph.conditionalEdges.find((candidate) => candidate.ruleId === 1);

    expect(graph.issues.map((issue) => issue.code)).not.toContain("missing_target_question");
    expect(edge?.issues).toEqual([]);
    expect(edge?.canFireAtRuntime).toBe(true);
  });

  it("flags a HIDE_PAGE rule whose target page comes before the source page", () => {
    const survey = makeSurvey(
      [
        makeQuestion({ id: 1, pageId: 1, displayOrder: 1 }),
        makeQuestion({
          id: 2,
          pageId: 2,
          displayOrder: 1,
          answerOptions: [makeOption({ id: 21, questionId: 2 })]
        })
      ],
      [
        makeRule({
          id: 1,
          sourceQuestionId: 2,
          sourcePageId: 2,
          sourceAnswerOptionId: 21,
          actionType: "HIDE_PAGE",
          targetQuestionId: null,
          targetPageId: 3,
          skipTargetInNormalFlow: false
        })
      ]
    );
    // Page 3 exists but is empty AND ordered before the source page (legacy data).
    survey.pages.push({
      id: 3,
      surveyId: 1,
      title: "Page 3",
      description: null,
      displayOrder: 0,
      createdAt: timestamp,
      updatedAt: timestamp
    });

    expect(issueCodes(survey)).toContain("backward_or_self_target");
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

  it("allows multiple navigation rules for the same source answer option", () => {
    const survey = makeSurvey(
      [sourceWithOption(), makeQuestion({ id: 2 }), makeQuestion({ id: 3 })],
      [
        makeRule({ id: 1, targetQuestionId: 2 }),
        makeRule({ id: 2, targetQuestionId: 3 })
      ]
    );

    expect(issueCodes(survey)).not.toContain("duplicate_rule_for_option");
  });

  it("adds a page navigation note when multiple navigation rules can fire on one page", () => {
    const survey = makeSurvey(
      [
        sourceWithOption(),
        makeQuestion({
          id: 2,
          pageId: 1,
          displayOrder: 2,
          answerOptions: [makeOption({ id: 21, questionId: 2 })]
        }),
        makeQuestion({ id: 3, pageId: 2, displayOrder: 1 }),
        makeQuestion({ id: 4, pageId: 3, displayOrder: 1 })
      ],
      [
        makeRule({
          id: 1,
          sourceQuestionId: 1,
          sourceAnswerOptionId: 11,
          targetQuestionId: null,
          targetPageId: 2,
          actionType: "JUMP_TO_PAGE"
        }),
        makeRule({
          id: 2,
          sourceQuestionId: 2,
          sourceAnswerOptionId: 21,
          targetQuestionId: null,
          targetPageId: 3,
          actionType: "JUMP_TO_PAGE"
        })
      ]
    );

    expect(buildSurveyFlowGraph(survey).pageNavigationNotes).toEqual([
      "Page 1 has multiple navigation rules. If more than one triggers on this page, the farthest target page wins."
    ]);
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
