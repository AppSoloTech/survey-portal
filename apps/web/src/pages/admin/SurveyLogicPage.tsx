import type { ConditionalLogicRule, SurveyQuestion } from "@survey-portal/shared";
import { useState, type FormEvent } from "react";

import {
  createConditionalRule,
  deleteConditionalRule,
  updateConditionalRule,
  type ConditionalRuleActionType
} from "../../api/surveys.js";
import { confirmAdminAction, readFormNumber } from "../../components/admin/builderForm.js";
import {
  RuleEditor,
  isSelectionQuestion
} from "../../components/admin/SurveyBuilderComponents.js";
import { SurveyFlowMap } from "../../components/admin/SurveyFlowMap.js";
import { useSurveyWorkspace } from "./SurveyWorkspaceLayout.js";

export function SurveyLogicPage() {
  const { isSubmitting, reloadSurvey, runSurveyMutation, survey } = useSurveyWorkspace();
  const [ruleSourceQuestionId, setRuleSourceQuestionId] = useState<number | null>(null);
  const [ruleActionType, setRuleActionType] =
    useState<ConditionalRuleActionType>("JUMP_TO_QUESTION");
  const [skipTargetIds, setSkipTargetIds] = useState<number[]>([]);
  // Structural changes are draft-only; the API rejects them after publish.
  const isLocked = survey.status !== "draft";
  const isSkipAction = ruleActionType === "HIDE_QUESTION";

  const selectableQuestions = survey.questions.filter((question) =>
    isSelectionQuestion(question)
  );
  const activeRuleSourceQuestion =
    selectableQuestions.find((question) => question.id === ruleSourceQuestionId) ?? null;
  const activeRuleSourceAnswerOptionCount = activeRuleSourceQuestion?.answerOptions.length ?? 0;
  const activeRuleTargetQuestions = activeRuleSourceQuestion
    ? survey.questions.filter(
        (question) => question.displayOrder > activeRuleSourceQuestion.displayOrder
      )
    : [];

  async function handleAddRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const data = new FormData(form);
    const sourceQuestionId = readFormNumber(data, "sourceQuestionId");
    const sourceAnswerOptionId = readFormNumber(data, "sourceAnswerOptionId");

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
            sourceQuestionId,
            sourceAnswerOptionId,
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
      didSave = await runSurveyMutation(
        () =>
          createConditionalRule({
            surveyId: survey.id,
            sourceQuestionId,
            sourceAnswerOptionId,
            targetQuestionId: readFormNumber(data, "targetQuestionId"),
            actionType: "JUMP_TO_QUESTION",
            skipTargetInNormalFlow: data.get("skipTargetInNormalFlow") === "on"
          }),
        "Jump rule added"
      );
    }

    if (didSave) {
      setRuleSourceQuestionId(null);
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
      data.get("actionType") === "HIDE_QUESTION" ? "HIDE_QUESTION" : "JUMP_TO_QUESTION";

    await runSurveyMutation(
      () =>
        updateConditionalRule({
          surveyId: survey.id,
          ruleId: rule.id,
          sourceQuestionId: readFormNumber(data, "sourceQuestionId"),
          sourceAnswerOptionId: readFormNumber(data, "sourceAnswerOptionId"),
          targetQuestionId: readFormNumber(data, "targetQuestionId"),
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
                : "Configure answer-conditional logic for selection questions: jump ahead to a later question, or skip one or more later questions when a specific answer is chosen."}
            </p>
          </div>
        </div>

        <form className="rule-form" onSubmit={handleAddRule}>
          <label>
            Source question
            <select
              name="sourceQuestionId"
              onChange={(event) => {
                setRuleSourceQuestionId(
                  event.target.value ? Number(event.target.value) : null
                );
                // Skip selections belong to the previous source's target
                // list; keeping them could submit stale question ids.
                setSkipTargetIds([]);
              }}
              value={activeRuleSourceQuestion?.id ?? ""}
              required
            >
              <option value="">Choose source question</option>
              {selectableQuestions.map((question) => (
                <option key={question.id} value={question.id}>
                  {question.displayOrder}. {question.questionText}
                </option>
              ))}
            </select>
          </label>
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
          </label>
          <label>
            Action
            <select
              name="actionType"
              onChange={(event) => {
                setRuleActionType(
                  event.target.value === "HIDE_QUESTION" ? "HIDE_QUESTION" : "JUMP_TO_QUESTION"
                );
                setSkipTargetIds([]);
              }}
              value={ruleActionType}
            >
              <option value="JUMP_TO_QUESTION">Jump to question</option>
              <option value="HIDE_QUESTION">Skip questions</option>
            </select>
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
                  {question.displayOrder}. {question.questionText}
                </label>
              ))}
            </fieldset>
          ) : (
            <>
              <label>
                Target question
                <select
                  disabled={!activeRuleSourceQuestion}
                  key={`rule-target-question-${activeRuleSourceQuestion?.id ?? "empty"}`}
                  name="targetQuestionId"
                  required
                >
                  <option value="">Choose target question</option>
                  {activeRuleTargetQuestions.map((question) => (
                    <option key={question.id} value={question.id}>
                      {question.displayOrder}. {question.questionText}
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
              activeRuleSourceAnswerOptionCount === 0 ||
              activeRuleTargetQuestions.length === 0 ||
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
          selectableQuestionCount={selectableQuestions.length}
          targetQuestionCount={activeRuleTargetQuestions.length}
        />

        <div className="rule-list">
          {survey.conditionalLogicRules.length === 0 ? (
            <p className="status muted">No logic rules configured.</p>
          ) : null}
          {survey.conditionalLogicRules.map((rule) => (
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
      </section>

      <SurveyFlowMap survey={survey} />
    </div>
  );
}

function RuleBuilderEmptyState({
  activeRuleSourceAnswerOptionCount,
  activeRuleSourceQuestion,
  selectableQuestionCount,
  targetQuestionCount
}: {
  activeRuleSourceAnswerOptionCount: number;
  activeRuleSourceQuestion: SurveyQuestion | null;
  selectableQuestionCount: number;
  targetQuestionCount: number;
}) {
  if (selectableQuestionCount === 0) {
    return (
      <div className="builder-empty-state compact">
        <strong>No eligible source questions</strong>
        <span>
          Jump rules start from single-select or multi-select questions. Add one with
          answer options before configuring conditional logic.
        </span>
      </div>
    );
  }

  if (activeRuleSourceQuestion && activeRuleSourceAnswerOptionCount === 0) {
    return (
      <div className="builder-empty-state compact">
        <strong>Source question has no answers</strong>
        <span>
          Add answer options to this question before creating a jump rule from it.
        </span>
      </div>
    );
  }

  if (activeRuleSourceQuestion && targetQuestionCount === 0) {
    return (
      <div className="builder-empty-state compact">
        <strong>No later target questions</strong>
        <span>
          Choose an earlier source question or add another question after this one so the
          jump has somewhere to send users.
        </span>
      </div>
    );
  }

  return null;
}
