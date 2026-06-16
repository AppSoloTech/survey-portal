import {
  getOrderedQuestions,
  resolveNextQuestion,
  type ConditionalLogicRule,
  type Survey,
  type SurveyQuestion,
  type SurveyQuestionType
} from "@survey-portal/shared";

export type SurveyFlowIssueCode =
  | "missing_source_question"
  | "invalid_source_question_type"
  | "missing_source_option"
  | "missing_target_question"
  | "unsupported_condition_operator"
  | "unsupported_action_type"
  | "backward_or_self_target"
  | "duplicate_rule_for_option"
  | "duplicate_skip_rule"
  | "unreachable_question"
  | "circular_navigation";

export interface SurveyFlowIssue {
  code: SurveyFlowIssueCode;
  message: string;
  ruleId?: number;
  questionId?: number;
}

export interface SurveyFlowNode {
  questionId: number;
  flowOrder: number;
  pageId: number;
  pageDisplayOrder: number;
  pageTitle: string;
  questionDisplayOrder: number;
  questionText: string;
  questionType: SurveyQuestionType;
  isRequired: boolean;
  isStart: boolean;
  isConditionalOnly: boolean;
  isReachable: boolean;
  normalNextQuestionId: number | null;
}

export interface SurveyFlowConditionalEdge {
  ruleId: number;
  sourceQuestionId: number;
  sourceAnswerOptionId: number | null;
  sourceOptionText: string | null;
  conditionOperator: ConditionalLogicRule["conditionOperator"];
  targetQuestionId: number | null;
  actionType: ConditionalLogicRule["actionType"];
  skipTargetInNormalFlow: boolean;
  canFireAtRuntime: boolean;
  issues: SurveyFlowIssue[];
}

export interface SurveyFlowGraph {
  nodes: SurveyFlowNode[];
  conditionalEdges: SurveyFlowConditionalEdge[];
  issues: SurveyFlowIssue[];
  pageNavigationNotes: string[];
}

export function buildSurveyFlowGraph(survey: Survey): SurveyFlowGraph {
  const orderedQuestions = getOrderedQuestions(survey);
  const questionsById = new Map(orderedQuestions.map((question) => [question.id, question]));
  const pagesById = new Map(survey.pages.map((page) => [page.id, page]));
  const startQuestion = orderedQuestions[0] ?? null;

  // Mirrors the static skip set in resolveNextQuestion: only JUMP rules with
  // skipTargetInNormalFlow remove their target from normal flow. HIDE rule
  // targets stay in the normal flow and are skipped per attempt at runtime.
  const skipTargetQuestionIds = new Set(
    survey.conditionalLogicRules
      .filter((rule) => rule.actionType === "JUMP_TO_QUESTION" && rule.skipTargetInNormalFlow)
      .map((rule) => rule.targetQuestionId)
      .filter((targetQuestionId): targetQuestionId is number => targetQuestionId !== null)
  );

  const conditionalEdges = buildConditionalEdges(survey, questionsById);
  const issues: SurveyFlowIssue[] = conditionalEdges.flatMap((edge) => edge.issues);
  const pageNavigationNotes = buildPageNavigationNotes(survey, questionsById, conditionalEdges);

  const adjacency = buildAdjacency(survey, orderedQuestions, questionsById, conditionalEdges);
  const reachableQuestionIds = collectReachableQuestionIds(startQuestion, adjacency);

  for (const question of orderedQuestions) {
    if (!reachableQuestionIds.has(question.id)) {
      issues.push({
        code: "unreachable_question",
        questionId: question.id,
        message: `${formatQuestionLabel(survey, question)} ("${truncateText(question.questionText)}") cannot be reached from the first question by normal or conditional flow.`
      });
    }
  }

  const cyclePath = findNavigationCycle(orderedQuestions, adjacency);

  if (cyclePath) {
    const cycleLabel = cyclePath
      .map((questionId) => formatQuestionLabel(survey, questionsById.get(questionId)))
      .join(" -> ");

    issues.push({
      code: "circular_navigation",
      questionId: cyclePath[0],
      message: `Survey navigation can loop: ${cycleLabel}. Valid admin-created jump rules are forward-only, so this indicates legacy or imported data.`
    });
  }

  const nodes: SurveyFlowNode[] = orderedQuestions.map((question, index) => {
    const page = pagesById.get(question.pageId);

    return {
      questionId: question.id,
      flowOrder: index + 1,
      pageId: question.pageId,
      pageDisplayOrder: page?.displayOrder ?? question.pageId,
      pageTitle: page?.title ?? `Page ${question.pageId}`,
      questionDisplayOrder: question.displayOrder,
      questionText: question.questionText,
      questionType: question.questionType,
      isRequired: question.isRequired,
      isStart: question.id === startQuestion?.id,
      isConditionalOnly: skipTargetQuestionIds.has(question.id),
      isReachable: reachableQuestionIds.has(question.id),
      normalNextQuestionId: resolveNextQuestion(survey, question, undefined)?.id ?? null
    };
  });

  return { nodes, conditionalEdges, issues, pageNavigationNotes };
}

function buildConditionalEdges(
  survey: Survey,
  questionsById: Map<number, SurveyQuestion>
): SurveyFlowConditionalEdge[] {
  const orderedRules = [...survey.conditionalLogicRules].sort((left, right) => left.id - right.id);
  const firstSkipRuleIdByKey = new Map<string, number>();
  const edges: SurveyFlowConditionalEdge[] = [];

  for (const rule of orderedRules) {
    const edgeIssues: SurveyFlowIssue[] = [];
    const sourceQuestion = questionsById.get(rule.sourceQuestionId) ?? null;
    const sourceOption =
      rule.sourceAnswerOptionId === null
        ? null
        : sourceQuestion?.answerOptions.find((option) => option.id === rule.sourceAnswerOptionId) ??
          null;
    const targetQuestion =
      rule.actionType === "JUMP_TO_PAGE" && rule.targetPageId !== null
        ? firstQuestionOnPage(survey, rule.targetPageId)
        : rule.targetQuestionId !== null
          ? questionsById.get(rule.targetQuestionId) ?? null
          : null;

    if (!sourceQuestion) {
      edgeIssues.push({
        code: "missing_source_question",
        ruleId: rule.id,
        message: `Rule ${rule.id}: source question (id ${rule.sourceQuestionId}) does not exist in this survey, so the rule can never trigger.`
      });
    } else if (!isAllowedRuleSource(rule, sourceQuestion)) {
      edgeIssues.push({
        code: "invalid_source_question_type",
        ruleId: rule.id,
        questionId: sourceQuestion.id,
        message: `Rule ${rule.id}: source ${formatQuestionLabel(survey, sourceQuestion)} is a ${sourceQuestion.questionType} question; equals rules require single_select or multi_select sources, and blank rules require text sources.`
      });
    }

    if (sourceQuestion && rule.conditionOperator === "equals" && !sourceOption) {
      edgeIssues.push({
        code: "missing_source_option",
        ruleId: rule.id,
        questionId: sourceQuestion.id,
        message: `Rule ${rule.id}: source answer option (id ${rule.sourceAnswerOptionId}) does not belong to ${formatQuestionLabel(survey, sourceQuestion)}, so the rule can never trigger.`
      });
    }

    if (rule.conditionOperator !== "equals" && rule.conditionOperator !== "is_blank") {
      edgeIssues.push({
        code: "unsupported_condition_operator",
        ruleId: rule.id,
        message: `Rule ${rule.id}: condition operator "${rule.conditionOperator}" is not supported by the survey runtime; only "equals" and "is_blank" are evaluated.`
      });
    }

    if (
      rule.conditionOperator === "is_blank" &&
      (rule.sourceAnswerOptionId !== null || rule.actionType !== "HIDE_QUESTION")
    ) {
      edgeIssues.push({
        code: "unsupported_condition_operator",
        ruleId: rule.id,
        questionId: sourceQuestion?.id,
        message: `Rule ${rule.id}: blank text conditions can only skip questions and cannot reference a source answer option.`
      });
    }

    if (
      rule.actionType !== "JUMP_TO_QUESTION" &&
      rule.actionType !== "HIDE_QUESTION" &&
      rule.actionType !== "JUMP_TO_PAGE"
    ) {
      edgeIssues.push({
        code: "unsupported_action_type",
        ruleId: rule.id,
        message: `Rule ${rule.id}: action type "${rule.actionType}" is not executed by the survey runtime.`
      });
    }

    if (
      (rule.actionType === "JUMP_TO_PAGE" ? rule.targetPageId === null : rule.targetQuestionId === null) ||
      !targetQuestion
    ) {
      edgeIssues.push({
        code: "missing_target_question",
        ruleId: rule.id,
        message: `Rule ${rule.id}: target question${
          rule.targetQuestionId !== null ? ` (id ${rule.targetQuestionId})` : ""
        } does not exist in this survey. If this rule triggered, the survey would end at the source question.`
      });
    } else if (sourceQuestion) {
      if (targetQuestion.id === sourceQuestion.id) {
        edgeIssues.push({
          code: "backward_or_self_target",
          ruleId: rule.id,
          questionId: sourceQuestion.id,
          message: `Rule ${rule.id}: ${formatQuestionLabel(survey, sourceQuestion)} targets itself, which can trap participants. Valid admin-created jump and skip rules are forward-only.`
        });
      } else if (
        getOrderedQuestions(survey).findIndex((question) => question.id === targetQuestion.id) <=
        getOrderedQuestions(survey).findIndex((question) => question.id === sourceQuestion.id)
      ) {
        edgeIssues.push({
          code: "backward_or_self_target",
          ruleId: rule.id,
          questionId: sourceQuestion.id,
          message: `Rule ${rule.id}: target ${formatQuestionLabel(survey, targetQuestion)} comes before source ${formatQuestionLabel(survey, sourceQuestion)}. Valid admin-created jump and skip rules are forward-only.`
        });
      }
    }

    // Skip rules union their targets at runtime, so an identical second skip
    // rule is harmless but redundant — flag it for cleanup.
    if (
      rule.conditionOperator === "equals" &&
      rule.actionType === "HIDE_QUESTION" &&
      rule.targetQuestionId !== null
    ) {
      const skipKey = `${rule.sourceQuestionId}:${rule.conditionOperator}:${rule.sourceAnswerOptionId ?? "blank"}:${rule.targetQuestionId}`;
      const firstSkipRuleId = firstSkipRuleIdByKey.get(skipKey);

      if (firstSkipRuleId === undefined) {
        firstSkipRuleIdByKey.set(skipKey, rule.id);
      } else {
        edgeIssues.push({
          code: "duplicate_skip_rule",
          ruleId: rule.id,
          message: `Rule ${rule.id}: repeats skip rule ${firstSkipRuleId} for the same answer and target question. It is redundant and can be deleted.`
        });
      }
    }

    edges.push({
      ruleId: rule.id,
      sourceQuestionId: rule.sourceQuestionId,
      sourceAnswerOptionId: rule.sourceAnswerOptionId,
      sourceOptionText: sourceOption?.optionText ?? null,
      conditionOperator: rule.conditionOperator,
      targetQuestionId: targetQuestion?.id ?? rule.targetQuestionId,
      actionType: rule.actionType,
      skipTargetInNormalFlow: rule.skipTargetInNormalFlow,
      canFireAtRuntime: canRuleFireAtRuntime(rule, sourceQuestion, sourceOption !== null),
      issues: edgeIssues
    });
  }

  return edges;
}

function buildPageNavigationNotes(
  survey: Survey,
  questionsById: Map<number, SurveyQuestion>,
  conditionalEdges: SurveyFlowConditionalEdge[]
): string[] {
  const navigationEdgesByPageId = new Map<number, SurveyFlowConditionalEdge[]>();

  for (const edge of conditionalEdges) {
    if (
      !edge.canFireAtRuntime ||
      (edge.actionType !== "JUMP_TO_PAGE" && edge.actionType !== "JUMP_TO_QUESTION")
    ) {
      continue;
    }

    const sourceQuestion = questionsById.get(edge.sourceQuestionId);

    if (!sourceQuestion) {
      continue;
    }

    const edges = navigationEdgesByPageId.get(sourceQuestion.pageId) ?? [];
    edges.push(edge);
    navigationEdgesByPageId.set(sourceQuestion.pageId, edges);
  }

  return [...navigationEdgesByPageId.entries()]
    .filter(([, edges]) => edges.length > 1)
    .sort(([leftPageId], [rightPageId]) => {
      const leftPage = survey.pages.find((page) => page.id === leftPageId);
      const rightPage = survey.pages.find((page) => page.id === rightPageId);

      return (
        (leftPage?.displayOrder ?? Number.MAX_SAFE_INTEGER) -
        (rightPage?.displayOrder ?? Number.MAX_SAFE_INTEGER)
      );
    })
    .map(([pageId]) => {
      const page = survey.pages.find((candidate) => candidate.id === pageId);
      const pageLabel = page ? `Page ${page.displayOrder}` : `page id ${pageId}`;

      return `${pageLabel} has multiple navigation rules. If more than one triggers on this page, the farthest target page wins.`;
    });
}

// A rule can trigger at runtime when the attempt engine can match it. Option
// equals rules need a valid source option; blank text rules need a text source
// and no source option. Shadowing by an earlier duplicate jump rule is handled
// at the call site.
function canRuleFireAtRuntime(
  rule: ConditionalLogicRule,
  sourceQuestion: SurveyQuestion | null,
  sourceOptionBelongsToSource: boolean
): boolean {
  return (
    sourceQuestion !== null &&
    isAllowedRuleSource(rule, sourceQuestion) &&
    (rule.conditionOperator === "equals"
      ? sourceOptionBelongsToSource
      : rule.sourceAnswerOptionId === null) &&
    (
      (rule.actionType === "JUMP_TO_QUESTION" && rule.targetQuestionId !== null) ||
      (rule.actionType === "HIDE_QUESTION" && rule.targetQuestionId !== null) ||
      (rule.actionType === "JUMP_TO_PAGE" && rule.targetPageId !== null)
    )
  );
}

function buildAdjacency(
  survey: Survey,
  orderedQuestions: SurveyQuestion[],
  questionsById: Map<number, SurveyQuestion>,
  conditionalEdges: SurveyFlowConditionalEdge[]
): Map<number, number[]> {
  const adjacency = new Map<number, number[]>();

  for (const question of orderedQuestions) {
    const nextQuestionIds: number[] = [];
    const normalNext = resolveNextQuestion(survey, question, undefined);

    if (normalNext) {
      nextQuestionIds.push(normalNext.id);
    }

    for (const edge of conditionalEdges) {
      // Skip edges remove a question from a path; they never navigate to
      // their target, so only jump edges contribute reachability.
      if (
        (edge.actionType === "JUMP_TO_QUESTION" || edge.actionType === "JUMP_TO_PAGE") &&
        edge.sourceQuestionId === question.id &&
        edge.canFireAtRuntime &&
        edge.targetQuestionId !== null &&
        questionsById.has(edge.targetQuestionId) &&
        !nextQuestionIds.includes(edge.targetQuestionId)
      ) {
        nextQuestionIds.push(edge.targetQuestionId);
      }
    }

    adjacency.set(question.id, nextQuestionIds);
  }

  return adjacency;
}

function firstQuestionOnPage(survey: Survey, pageId: number): SurveyQuestion | null {
  return getOrderedQuestions(survey).find((question) => question.pageId === pageId) ?? null;
}

function collectReachableQuestionIds(
  startQuestion: SurveyQuestion | null,
  adjacency: Map<number, number[]>
): Set<number> {
  const reachable = new Set<number>();

  if (!startQuestion) {
    return reachable;
  }

  const queue: number[] = [startQuestion.id];
  reachable.add(startQuestion.id);

  while (queue.length > 0) {
    const questionId = queue.shift();

    if (questionId === undefined) {
      break;
    }

    for (const nextQuestionId of adjacency.get(questionId) ?? []) {
      if (!reachable.has(nextQuestionId)) {
        reachable.add(nextQuestionId);
        queue.push(nextQuestionId);
      }
    }
  }

  return reachable;
}

function findNavigationCycle(
  orderedQuestions: SurveyQuestion[],
  adjacency: Map<number, number[]>
): number[] | null {
  const visited = new Set<number>();
  const inStack = new Set<number>();
  const stack: number[] = [];

  function visit(questionId: number): number[] | null {
    visited.add(questionId);
    inStack.add(questionId);
    stack.push(questionId);

    for (const nextQuestionId of adjacency.get(questionId) ?? []) {
      if (inStack.has(nextQuestionId)) {
        const cycleStart = stack.indexOf(nextQuestionId);
        return [...stack.slice(cycleStart), nextQuestionId];
      }

      if (!visited.has(nextQuestionId)) {
        const cycle = visit(nextQuestionId);

        if (cycle) {
          return cycle;
        }
      }
    }

    inStack.delete(questionId);
    stack.pop();
    return null;
  }

  for (const question of orderedQuestions) {
    if (!visited.has(question.id)) {
      const cycle = visit(question.id);

      if (cycle) {
        return cycle;
      }
    }
  }

  return null;
}

function isAllowedRuleSource(
  rule: ConditionalLogicRule,
  sourceQuestion: SurveyQuestion
): boolean {
  if (rule.conditionOperator === "equals") {
    return sourceQuestion.questionType === "single_select" || sourceQuestion.questionType === "multi_select";
  }

  return (
    rule.conditionOperator === "is_blank" &&
    sourceQuestion.questionType === "text" &&
    rule.actionType === "HIDE_QUESTION"
  );
}

function formatQuestionLabel(survey: Survey, question: SurveyQuestion | undefined): string {
  if (!question) {
    return "an unknown question";
  }

  const page = survey.pages.find((candidate) => candidate.id === question.pageId);
  const pageLabel = page ? `page ${page.displayOrder}` : `page ${question.pageId}`;

  return `${pageLabel} question ${question.displayOrder}`;
}

export function truncateText(text: string, maxLength = 60): string {
  return text.length > maxLength ? `${text.slice(0, maxLength - 3).trimEnd()}...` : text;
}
