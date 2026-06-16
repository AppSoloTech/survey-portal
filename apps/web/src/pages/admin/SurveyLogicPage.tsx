import {
  getOrderedQuestions,
  type ConditionalLogicRule,
  type SurveyQuestion
} from "@survey-portal/shared";
import { useState, type FormEvent } from "react";

import {
  createConditionalRule,
  deleteConditionalRule,
  updateConditionalRule,
  type ConditionalRuleActionType,
  type ConditionalRuleConditionOperator
} from "../../api/surveys.js";
import { confirmAdminAction, readFormNumber } from "../../components/admin/builderForm.js";
import {
  RuleEditor,
  formatQuestionOptionLabel,
  isSelectionQuestion
} from "../../components/admin/SurveyBuilderComponents.js";
import { SurveyFlowMap } from "../../components/admin/SurveyFlowMap.js";
import { useSurveyWorkspace } from "./SurveyWorkspaceLayout.js";

export function SurveyLogicPage() {
  const { isSubmitting, reloadSurvey, runSurveyMutation, survey } = useSurveyWorkspace();
  const [ruleSourceQuestionId, setRuleSourceQuestionId] = useState<number | null>(null);
  const [ruleActionType, setRuleActionType] =
    useState<ConditionalRuleActionType>("JUMP_TO_PAGE");
  const [skipTargetIds, setSkipTargetIds] = useState<number[]>([]);
  // Structural changes are draft-only; the API rejects them after publish.
  const isLocked = survey.status !== "draft";
  const isSkipAction = ruleActionType === "HIDE_QUESTION";
  const isPageJumpAction = ruleActionType === "JUMP_TO_PAGE";

  const orderedQuestions = getOrderedQuestions(survey);
  const ruleSourceQuestions = orderedQuestions.filter(
    (question) => isSelectionQuestion(question) || question.questionType === "text"
  );
  const activeRuleSourceQuestion =
    ruleSourceQuestions.find((question) => question.id === ruleSourceQuestionId) ?? null;
  const isBlankTextRule = activeRuleSourceQuestion?.questionType === "text";
  const activeRuleSourceAnswerOptionCount = activeRuleSourceQuestion?.answerOptions.length ?? 0;
  const activeRuleTargetQuestions = activeRuleSourceQuestion
    ? orderedQuestions.filter(
        (question) =>
          orderedQuestions.findIndex((item) => item.id === question.id) >
          orderedQuestions.findIndex((item) => item.id === activeRuleSourceQuestion.id)
      )
    : [];
  const activeRuleSourcePage = activeRuleSourceQuestion
    ? survey.pages.find((page) => page.id === activeRuleSourceQuestion.pageId) ?? null
    : null;
  const activeRuleTargetPages = activeRuleSourcePage
    ? survey.pages.filter((page) => page.displayOrder > activeRuleSourcePage.displayOrder)
    : [];

  async function handleAddRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const data = new FormData(form);
    const sourceQuestionId = readFormNumber(data, "sourceQuestionId");
    const conditionOperator: ConditionalRuleConditionOperator = isBlankTextRule
      ? "is_blank"
      : "equals";
    const sourceAnswerOptionId = isBlankTextRule
      ? null
      : readFormNumber(data, "sourceAnswerOptionId");

    let didSave = false;

    if (isSkipAction) {
      // Only target questions that are valid for the currently selected
      // source — selections made under a previous source are dropped.
      const validTargetIds = skipTargetIds.filter((targetId) =>
        activeRuleTargetQuestions.some((question) => question.id === targetId)
      );

      if (validTargetIds.length === 0) {
        return;
      }

      // Each skipped question is its own rule row; create them sequentially
      // so the toast and refreshed survey reflect the final state.
      let savedCount = 0;

      didSave = await runSurveyMutation(async () => {
        let response: Awaited<ReturnType<typeof createConditionalRule>> | null = null;

        for (const targetQuestionId of validTargetIds) {
          response = await createConditionalRule({
            surveyId: survey.id,
            sourcePageId: activeRuleSourceQuestion?.pageId ?? null,
            sourceQuestionId,
            sourceAnswerOptionId,
            conditionOperator,
            targetQuestionId,
            actionType: "HIDE_QUESTION",
            skipTargetInNormalFlow: false
          });
          savedCount += 1;
        }

        if (!response) {
          throw new Error("Choose at least one question to skip");
        }

        return response;
      }, validTargetIds.length === 1 ? "Skip rule added" : "Skip rules added");

      if (!didSave && savedCount > 0) {
        // A later create failed after earlier ones persisted; resync the
        // rule list so the partial rules are visible and deletable.
        await reloadSurvey();
      }
    } else {
      const actionType = isPageJumpAction ? "JUMP_TO_PAGE" : "JUMP_TO_QUESTION";
      didSave = await runSurveyMutation(
        () =>
          createConditionalRule({
            surveyId: survey.id,
            sourcePageId: activeRuleSourceQuestion?.pageId ?? null,
            sourceQuestionId,
            sourceAnswerOptionId,
            conditionOperator,
            targetQuestionId:
              actionType === "JUMP_TO_QUESTION" ? readFormNumber(data, "targetQuestionId") : null,
            targetPageId:
              actionType === "JUMP_TO_PAGE" ? readFormNumber(data, "targetPageId") : null,
            actionType,
            skipTargetInNormalFlow: data.get("skipTargetInNormalFlow") === "on"
          }),
        isPageJumpAction ? "Page jump rule added" : "Jump rule added"
      );
    }

    if (didSave) {
      setRuleSourceQuestionId(null);
      setRuleActionType("JUMP_TO_PAGE");
      setSkipTargetIds([]);
      form.reset();
    }
  }

  async function handleSaveRule(
    event: FormEvent<HTMLFormElement>,
    rule: ConditionalLogicRule
  ) {
    event.preventDefault();

    const data = new FormData(event.currentTarget);
    const actionType: ConditionalRuleActionType =
      data.get("actionType") === "HIDE_QUESTION"
        ? "HIDE_QUESTION"
        : data.get("actionType") === "JUMP_TO_PAGE"
          ? "JUMP_TO_PAGE"
          : "JUMP_TO_QUESTION";
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
          targetQuestionId:
            actionType === "JUMP_TO_PAGE" ? null : readFormNumber(data, "targetQuestionId"),
          targetPageId:
            actionType === "JUMP_TO_PAGE" ? readFormNumber(data, "targetPageId") : null,
          conditionOperator,
          actionType,
          skipTargetInNormalFlow:
            actionType === "HIDE_QUESTION" ? false : data.get("skipTargetInNormalFlow") === "on"
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
    <div className="builder-workspace">
      <section className="builder-form advanced-builder-section">
        <div className="builder-section-heading">
          <div>
            <p className="eyebrow">Conditional logic</p>
            <h3>Logic rules</h3>
            <p className="builder-heading-note">
              {isLocked
                ? "Logic rules are locked after publishing. Create an editable draft copy to change conditional logic."
                : "Use page jumps for navigation. Rules are evaluated after the whole page is submitted; if multiple page jumps trigger, the farthest target page wins."}
            </p>
          </div>
        </div>

        <form className="rule-form" onSubmit={handleAddRule}>
          <label>
            Source question
            <select
              name="sourceQuestionId"
              onChange={(event) => {
                const nextQuestionId = event.target.value ? Number(event.target.value) : null;
                const nextQuestion =
                  nextQuestionId === null
                    ? null
                    : ruleSourceQuestions.find((question) => question.id === nextQuestionId) ??
                      null;

                setRuleSourceQuestionId(nextQuestionId);
                if (nextQuestion?.questionType === "text") {
                  setRuleActionType("HIDE_QUESTION");
                }
                // Skip selections belong to the previous source's target
                // list; keeping them could submit stale question ids.
                setSkipTargetIds([]);
              }}
              value={activeRuleSourceQuestion?.id ?? ""}
              required
            >
              <option value="">Choose source question</option>
              {ruleSourceQuestions.map((question) => (
                <option key={question.id} value={question.id}>
                  {formatQuestionOptionLabel(survey, question)}
                </option>
              ))}
            </select>
          </label>
          {isBlankTextRule ? (
            <label>
              Condition
              <input readOnly value="Answer is blank" />
              <input name="conditionOperator" type="hidden" value="is_blank" />
            </label>
          ) : (
            <label>
              Source answer
              <select
                disabled={!activeRuleSourceQuestion}
                key={`rule-source-answer-${activeRuleSourceQuestion?.id ?? "empty"}`}
                name="sourceAnswerOptionId"
                required
              >
                <option value="">Choose source answer</option>
                {activeRuleSourceQuestion?.answerOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.optionText}
                  </option>
                ))}
              </select>
              <input name="conditionOperator" type="hidden" value="equals" />
            </label>
          )}
          <label>
            Action
            {isBlankTextRule ? (
              <>
                <input readOnly value="Skip questions" />
                <input name="actionType" type="hidden" value="HIDE_QUESTION" />
              </>
            ) : (
              <select
                name="actionType"
                onChange={(event) => {
                  setRuleActionType(
                    event.target.value === "HIDE_QUESTION"
                      ? "HIDE_QUESTION"
                      : event.target.value === "JUMP_TO_PAGE"
                        ? "JUMP_TO_PAGE"
                        : "JUMP_TO_QUESTION"
                  );
                  setSkipTargetIds([]);
                }}
                value={ruleActionType}
              >
                <option value="JUMP_TO_PAGE">Jump to page</option>
                <option value="JUMP_TO_QUESTION">Jump to question (legacy)</option>
                <option value="HIDE_QUESTION">Skip questions</option>
              </select>
            )}
          </label>
          {isSkipAction ? (
            <fieldset className="skip-target-fieldset" disabled={!activeRuleSourceQuestion}>
              <legend>Questions to skip</legend>
              {activeRuleTargetQuestions.map((question) => (
                <label className="checkbox-label" key={question.id}>
                  <input
                    checked={skipTargetIds.includes(question.id)}
                    onChange={(event) =>
                      setSkipTargetIds((current) =>
                        event.target.checked
                          ? [...current, question.id]
                          : current.filter((id) => id !== question.id)
                      )
                    }
                    type="checkbox"
                  />
                  {formatQuestionOptionLabel(survey, question)}
                </label>
              ))}
            </fieldset>
          ) : isPageJumpAction ? (
            <label>
              Target page
              <select
                disabled={!activeRuleSourceQuestion}
                key={`rule-target-page-${activeRuleSourceQuestion?.id ?? "empty"}`}
                name="targetPageId"
                required
              >
                <option value="">Choose target page</option>
                {activeRuleTargetPages.map((page) => (
                  <option key={page.id} value={page.id}>
                    {page.displayOrder}. {page.title}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label>
                Target question (lands on containing page)
                <select
                  disabled={!activeRuleSourceQuestion}
                  key={`rule-target-question-${activeRuleSourceQuestion?.id ?? "empty"}`}
                  name="targetQuestionId"
                  required
                >
                  <option value="">Choose target question</option>
                  {activeRuleTargetQuestions.map((question) => (
                    <option key={question.id} value={question.id}>
                      {formatQuestionOptionLabel(survey, question)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="checkbox-label rule-flow-toggle">
                <input defaultChecked name="skipTargetInNormalFlow" type="checkbox" />
                Skip target in normal flow
              </label>
            </>
          )}
          <button
            className="button-link compact-button primary-button"
            disabled={
              isSubmitting ||
              isLocked ||
              !activeRuleSourceQuestion ||
              (!isBlankTextRule && activeRuleSourceAnswerOptionCount === 0) ||
              (!isPageJumpAction && activeRuleTargetQuestions.length === 0) ||
              (isPageJumpAction && activeRuleTargetPages.length === 0) ||
              (isSkipAction && skipTargetIds.length === 0)
            }
            type="submit"
          >
            {isSkipAction ? "Add skip rules" : "Add rule"}
          </button>
        </form>

        <RuleBuilderEmptyState
          activeRuleSourceAnswerOptionCount={activeRuleSourceAnswerOptionCount}
          activeRuleSourceQuestion={activeRuleSourceQuestion}
          isBlankTextRule={isBlankTextRule}
          isPageJumpAction={isPageJumpAction}
          selectableQuestionCount={ruleSourceQuestions.length}
          targetCount={isPageJumpAction ? activeRuleTargetPages.length : activeRuleTargetQuestions.length}
        />

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
      </section>

      <SurveyFlowMap survey={survey} />
    </div>
  );
}

// Rules grouped by source question in survey order; rules whose source
// question was deleted (legacy data) collect under a trailing group.
function groupRulesBySource(survey: ReturnType<typeof useSurveyWorkspace>["survey"]) {
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

function RuleBuilderEmptyState({
  activeRuleSourceAnswerOptionCount,
  activeRuleSourceQuestion,
  isBlankTextRule,
  isPageJumpAction,
  selectableQuestionCount,
  targetCount
}: {
  activeRuleSourceAnswerOptionCount: number;
  activeRuleSourceQuestion: SurveyQuestion | null;
  isBlankTextRule: boolean;
  isPageJumpAction: boolean;
  selectableQuestionCount: number;
  targetCount: number;
}) {
  if (selectableQuestionCount === 0) {
    return (
      <div className="builder-empty-state compact">
        <strong>No eligible source questions</strong>
        <span>
          Jump rules start from single-select or multi-select questions. Skip rules can
          also start from text questions when the condition is blank.
        </span>
      </div>
    );
  }

  if (activeRuleSourceQuestion && !isBlankTextRule && activeRuleSourceAnswerOptionCount === 0) {
    return (
      <div className="builder-empty-state compact">
        <strong>Source question has no answers</strong>
        <span>
          Add answer options to this question before creating a rule from it.
        </span>
      </div>
    );
  }

  if (activeRuleSourceQuestion && targetCount === 0) {
    return (
      <div className="builder-empty-state compact">
        <strong>{isPageJumpAction ? "No later target pages" : "No later target questions"}</strong>
        <span>
          Choose an earlier source question or add another{" "}
          {isPageJumpAction ? "page" : "question"} after this one so the jump has
          somewhere to send users.
        </span>
      </div>
    );
  }

  return null;
}
