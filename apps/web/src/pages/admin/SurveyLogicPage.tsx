import type { ConditionalLogicRule, SurveyQuestion } from "@survey-portal/shared";
import { useState, type FormEvent } from "react";

import {
  createConditionalRule,
  deleteConditionalRule,
  updateConditionalRule
} from "../../api/surveys.js";
import { confirmAdminAction, readFormNumber } from "../../components/admin/builderForm.js";
import {
  RuleEditor,
  isSelectionQuestion
} from "../../components/admin/SurveyBuilderComponents.js";
import { SurveyFlowMap } from "../../components/admin/SurveyFlowMap.js";
import { useSurveyWorkspace } from "./SurveyWorkspaceLayout.js";

export function SurveyLogicPage() {
  const { isSubmitting, runSurveyMutation, survey } = useSurveyWorkspace();
  const [ruleSourceQuestionId, setRuleSourceQuestionId] = useState<number | null>(null);

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

    const didSave = await runSurveyMutation(
      () =>
        createConditionalRule({
          surveyId: survey.id,
          sourceQuestionId: readFormNumber(data, "sourceQuestionId"),
          sourceAnswerOptionId: readFormNumber(data, "sourceAnswerOptionId"),
          targetQuestionId: readFormNumber(data, "targetQuestionId"),
          skipTargetInNormalFlow: data.get("skipTargetInNormalFlow") === "on"
        }),
      "Jump rule added"
    );

    if (didSave) {
      setRuleSourceQuestionId(null);
      form.reset();
    }
  }

  async function handleSaveRule(
    event: FormEvent<HTMLFormElement>,
    rule: ConditionalLogicRule
  ) {
    event.preventDefault();

    const data = new FormData(event.currentTarget);

    await runSurveyMutation(
      () =>
        updateConditionalRule({
          surveyId: survey.id,
          ruleId: rule.id,
          sourceQuestionId: readFormNumber(data, "sourceQuestionId"),
          sourceAnswerOptionId: readFormNumber(data, "sourceAnswerOptionId"),
          targetQuestionId: readFormNumber(data, "targetQuestionId"),
          skipTargetInNormalFlow: data.get("skipTargetInNormalFlow") === "on"
        }),
      "Jump rule saved"
    );
  }

  async function handleDeleteRule(ruleId: number) {
    if (!confirmAdminAction("Delete this jump rule?")) {
      return;
    }

    await runSurveyMutation(
      () =>
        deleteConditionalRule({
          surveyId: survey.id,
          ruleId
        }),
      "Jump rule deleted"
    );
  }

  return (
    <div className="builder-workspace">
      <section className="builder-form advanced-builder-section">
        <div className="builder-section-heading">
          <div>
            <p className="eyebrow">Conditional logic</p>
            <h3>Jump rules</h3>
            <p className="builder-heading-note">
              Configure optional jumps for selection questions. Targets can stay in
              normal order or appear only when a jump reaches them.
            </p>
          </div>
        </div>

        <form className="rule-form" onSubmit={handleAddRule}>
          <label>
            Source question
            <select
              name="sourceQuestionId"
              onChange={(event) =>
                setRuleSourceQuestionId(
                  event.target.value ? Number(event.target.value) : null
                )
              }
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
          <button
            className="button-link compact-button primary-button"
            disabled={
              isSubmitting ||
              !activeRuleSourceQuestion ||
              activeRuleSourceAnswerOptionCount === 0 ||
              activeRuleTargetQuestions.length === 0
            }
            type="submit"
          >
            Add rule
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
            <p className="status muted">No jump rules configured.</p>
          ) : null}
          {survey.conditionalLogicRules.map((rule) => (
            <RuleEditor
              isSubmitting={isSubmitting}
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
