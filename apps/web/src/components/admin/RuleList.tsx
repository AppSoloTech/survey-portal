import {
  getOrderedQuestions,
  type ConditionalLogicRule,
  type Survey
} from "@survey-portal/shared";
import { type FormEvent } from "react";

import {
  deleteConditionalRule,
  updateConditionalRule,
  type ConditionalRuleActionType,
  type ConditionalRuleConditionOperator
} from "../../api/surveys.js";
import type { SurveyWorkspaceContextValue } from "../../pages/admin/SurveyWorkspaceLayout.js";
import { confirmAdminAction, readFormNumber } from "./builderForm.js";
import { formatQuestionOptionLabel, RuleEditor } from "./SurveyBuilderComponents.js";

export function RuleList({
  isLocked,
  isSubmitting,
  runSurveyMutation,
  survey
}: {
  isLocked: boolean;
  isSubmitting: boolean;
  runSurveyMutation: SurveyWorkspaceContextValue["runSurveyMutation"];
  survey: Survey;
}) {
  async function handleSaveRule(
    event: FormEvent<HTMLFormElement>,
    rule: ConditionalLogicRule
  ) {
    event.preventDefault();

    const data = new FormData(event.currentTarget);
    const rawActionType = data.get("actionType");
    const actionType: ConditionalRuleActionType =
      rawActionType === "HIDE_QUESTION"
        ? "HIDE_QUESTION"
        : rawActionType === "HIDE_PAGE"
          ? "HIDE_PAGE"
          : rawActionType === "JUMP_TO_PAGE"
            ? "JUMP_TO_PAGE"
            : "JUMP_TO_QUESTION";
    const isPageTargetAction = actionType === "JUMP_TO_PAGE" || actionType === "HIDE_PAGE";
    const isAttemptSkipAction = actionType === "HIDE_QUESTION" || actionType === "HIDE_PAGE";
    const conditionOperator: ConditionalRuleConditionOperator =
      data.get("conditionOperator") === "is_blank" ? "is_blank" : "equals";
    const sourceAnswerOptionId =
      conditionOperator === "is_blank" ? null : readFormNumber(data, "sourceAnswerOptionId");

    await runSurveyMutation(
      () =>
        updateConditionalRule({
          surveyId: survey.id,
          ruleId: rule.id,
          sourcePageId: readFormNumber(data, "sourcePageId") || null,
          sourceQuestionId: readFormNumber(data, "sourceQuestionId"),
          sourceAnswerOptionId,
          targetQuestionId: isPageTargetAction ? null : readFormNumber(data, "targetQuestionId"),
          targetPageId: isPageTargetAction ? readFormNumber(data, "targetPageId") : null,
          conditionOperator,
          actionType,
          skipTargetInNormalFlow: isAttemptSkipAction
            ? false
            : data.get("skipTargetInNormalFlow") === "on",
          // Only HIDE_PAGE rules carry the advance-on-trigger lever.
          advanceOnTrigger: actionType === "HIDE_PAGE" && data.get("advanceOnTrigger") === "on"
        }),
      "Rule saved"
    );
  }

  async function handleDeleteRule(ruleId: number) {
    if (!confirmAdminAction("Delete this rule?")) {
      return;
    }

    await runSurveyMutation(
      () =>
        deleteConditionalRule({
          surveyId: survey.id,
          ruleId
        }),
      "Rule deleted"
    );
  }

  return (
    <div className="rule-list">
      {survey.conditionalLogicRules.length === 0 ? (
        <p className="status muted">No logic rules configured.</p>
      ) : null}
      {groupRulesBySource(survey).map(({ question, rules }) => (
        <details className="rule-group" key={question?.id ?? "orphaned"}>
          <summary>
            <span className="rule-group-title">
              {question
                ? formatQuestionOptionLabel(survey, question)
                : "Rules with a missing source question"}
            </span>
            <span className="rule-group-count">
              {rules.length === 1 ? "1 rule" : `${rules.length} rules`}
            </span>
          </summary>
          <div className="rule-group-body">
            {rules.map((rule) => (
              <RuleEditor
                isSubmitting={isSubmitting || isLocked}
                key={rule.id}
                onDeleteRule={handleDeleteRule}
                onSaveRule={handleSaveRule}
                rule={rule}
                survey={survey}
              />
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

// Rules grouped by source question in survey order; rules whose source
// question was deleted (legacy data) collect under a trailing group.
function groupRulesBySource(survey: Survey) {
  const orderedQuestions = getOrderedQuestions(survey);
  const questionOrderById = new Map(
    orderedQuestions.map((question, index) => [question.id, index])
  );
  const questionsById = new Map(orderedQuestions.map((question) => [question.id, question]));
  const groups = new Map<number | null, ConditionalLogicRule[]>();

  for (const rule of survey.conditionalLogicRules) {
    const key = questionsById.has(rule.sourceQuestionId) ? rule.sourceQuestionId : null;
    const list = groups.get(key) ?? [];
    list.push(rule);
    groups.set(key, list);
  }

  return [...groups.entries()]
    .map(([questionId, rules]) => ({
      question: questionId === null ? null : questionsById.get(questionId) ?? null,
      rules
    }))
    .sort((left, right) => {
      if (!left.question) {
        return 1;
      }

      if (!right.question) {
        return -1;
      }

      return (
        (questionOrderById.get(left.question.id) ?? Number.MAX_SAFE_INTEGER) -
        (questionOrderById.get(right.question.id) ?? Number.MAX_SAFE_INTEGER)
      );
    });
}
