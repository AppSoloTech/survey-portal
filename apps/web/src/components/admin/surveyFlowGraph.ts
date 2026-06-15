import {
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
  displayOrder: number;
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
}

export function buildSurveyFlowGraph(survey: Survey): SurveyFlowGraph {
  const orderedQuestions = sortQuestions(survey.questions);
  const questionsById = new Map(orderedQuestions.map((question) => [question.id, question]));
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

  const adjacency = buildAdjacency(survey, orderedQuestions, questionsById, conditionalEdges);
  const reachableQuestionIds = collectReachableQuestionIds(startQuestion, adjacency);

  for (const question of orderedQuestions) {
    if (!reachableQuestionIds.has(question.id)) {
      issues.push({
        code: "unreachable_question",
        questionId: question.id,
        message: `Question ${question.displayOrder} ("${truncateText(question.questionText)}") cannot be reached from the first question by normal or conditional flow.`
      });
    }
  }

  const cyclePath = findNavigationCycle(orderedQuestions, adjacency);

  if (cyclePath) {
    const cycleLabel = cyclePath
      .map((questionId) => formatQuestionLabel(questionsById.get(questionId)))
      .join(" -> ");

    issues.push({
      code: "circular_navigation",
      questionId: cyclePath[0],
      message: `Survey navigation can loop: ${cycleLabel}. Valid admin-created jump rules are forward-only, so this indicates legacy or imported data.`
    });
  }

  const nodes: SurveyFlowNode[] = orderedQuestions.map((question) => ({
    questionId: question.id,
    displayOrder: question.displayOrder,
    questionText: question.questionText,
    questionType: question.questionType,
    isRequired: question.isRequired,
    isStart: question.id === startQuestion?.id,
    isConditionalOnly: skipTargetQuestionIds.has(question.id),
    isReachable: reachableQuestionIds.has(question.id),
    normalNextQuestionId: resolveNextQuestion(survey, question, undefined)?.id ?? null
  }));

  return { nodes, conditionalEdges, issues };
}

function buildConditionalEdges(
  survey: Survey,
  questionsById: Map<number, SurveyQuestion>
): SurveyFlowConditionalEdge[] {
  const orderedRules = [...survey.conditionalLogicRules].sort((left, right) => left.id - right.id);
  const firstRuleIdBySourceOption = new Map<string, number>();
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
      rule.targetQuestionId !== null ? questionsById.get(rule.targetQuestionId) ?? null : null;

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
        message: `Rule ${rule.id}: source ${formatQuestionLabel(sourceQuestion)} is a ${sourceQuestion.questionType} question; equals rules require single_select or multi_select sources, and blank rules require text sources.`
      });
    }

    if (sourceQuestion && rule.conditionOperator === "equals" && !sourceOption) {
      edgeIssues.push({
        code: "missing_source_option",
        ruleId: rule.id,
        questionId: sourceQuestion.id,
        message: `Rule ${rule.id}: source answer option (id ${rule.sourceAnswerOptionId}) does not belong to ${formatQuestionLabel(sourceQuestion)}, so the rule can never trigger.`
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

    if (rule.actionType !== "JUMP_TO_QUESTION" && rule.actionType !== "HIDE_QUESTION") {
      edgeIssues.push({
        code: "unsupported_action_type",
        ruleId: rule.id,
        message: `Rule ${rule.id}: action type "${rule.actionType}" is not executed by the survey runtime.`
      });
    }

    if (rule.targetQuestionId === null || !targetQuestion) {
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
          message: `Rule ${rule.id}: ${formatQuestionLabel(sourceQuestion)} targets itself, which can trap participants. Valid admin-created jump and skip rules are forward-only.`
        });
      } else if (targetQuestion.displayOrder <= sourceQuestion.displayOrder) {
        edgeIssues.push({
          code: "backward_or_self_target",
          ruleId: rule.id,
          questionId: sourceQuestion.id,
          message: `Rule ${rule.id}: target ${formatQuestionLabel(targetQuestion)} comes before source ${formatQuestionLabel(sourceQuestion)}. Valid admin-created jump and skip rules are forward-only.`
        });
      }
    }

    // The runtime matches jump rules with Array.find over the id-ordered rule
    // list, so a later jump rule for the same source question and answer
    // option is shadowed by the first one and can never execute.
    let isShadowedDuplicate = false;

    if (
      rule.conditionOperator === "equals" &&
      rule.actionType === "JUMP_TO_QUESTION" &&
      rule.targetQuestionId !== null
    ) {
      const sourceOptionKey = `${rule.sourceQuestionId}:${rule.conditionOperator}:${rule.sourceAnswerOptionId}`;
      const firstRuleId = firstRuleIdBySourceOption.get(sourceOptionKey);

      if (firstRuleId === undefined) {
        firstRuleIdBySourceOption.set(sourceOptionKey, rule.id);
      } else {
        isShadowedDuplicate = true;
        edgeIssues.push({
          code: "duplicate_rule_for_option",
          ruleId: rule.id,
          message: `Rule ${rule.id}: duplicates rule ${firstRuleId} for the same source answer option. The runtime evaluates rule ${firstRuleId} first, so rule ${rule.id} never triggers.`
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
      targetQuestionId: rule.targetQuestionId,
      actionType: rule.actionType,
      skipTargetInNormalFlow: rule.skipTargetInNormalFlow,
      canFireAtRuntime:
        !isShadowedDuplicate &&
        canRuleFireAtRuntime(rule, sourceQuestion, sourceOption !== null),
      issues: edgeIssues
    });
  }

  return edges;
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
    (rule.actionType === "JUMP_TO_QUESTION" || rule.actionType === "HIDE_QUESTION") &&
    rule.targetQuestionId !== null
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
        edge.actionType === "JUMP_TO_QUESTION" &&
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

function sortQuestions(questions: SurveyQuestion[]): SurveyQuestion[] {
  return [...questions].sort(
    (left, right) => left.displayOrder - right.displayOrder || left.id - right.id
  );
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

function formatQuestionLabel(question: SurveyQuestion | undefined): string {
  return question ? `question ${question.displayOrder}` : "an unknown question";
}

export function truncateText(text: string, maxLength = 60): string {
  return text.length > maxLength ? `${text.slice(0, maxLength - 3).trimEnd()}...` : text;
}
