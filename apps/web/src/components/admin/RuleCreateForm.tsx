import { getOrderedQuestions, type Survey, type SurveyQuestion } from "@survey-portal/shared";
import { useState, type Dispatch, type FormEvent, type SetStateAction } from "react";

import {
  createConditionalRule,
  type ConditionalRuleActionType,
  type ConditionalRuleConditionOperator
} from "../../api/surveys.js";
import type { SurveyWorkspaceContextValue } from "../../pages/admin/SurveyWorkspaceLayout.js";
import { readFormNumber } from "./builderForm.js";
import { PageGroupedQuestionSelect } from "./PageGroupedQuestionSelect.js";
import { formatQuestionOptionLabel, isSelectionQuestion } from "./SurveyBuilderComponents.js";

export function RuleCreateForm({
  formId,
  isLocked,
  isSubmitting,
  reloadSurvey,
  ruleActionType,
  ruleSourceQuestionId,
  runSurveyMutation,
  setRuleActionType,
  setRuleSourceQuestionId,
  survey
}: {
  formId: string;
  isLocked: boolean;
  isSubmitting: boolean;
  reloadSurvey: SurveyWorkspaceContextValue["reloadSurvey"];
  ruleActionType: ConditionalRuleActionType;
  ruleSourceQuestionId: number | null;
  runSurveyMutation: SurveyWorkspaceContextValue["runSurveyMutation"];
  setRuleActionType: Dispatch<SetStateAction<ConditionalRuleActionType>>;
  setRuleSourceQuestionId: Dispatch<SetStateAction<number | null>>;
  survey: Survey;
}) {
  const [skipTargetIds, setSkipTargetIds] = useState<number[]>([]);
  const isSkipAction = ruleActionType === "HIDE_QUESTION";
  const isPageHideAction = ruleActionType === "HIDE_PAGE";
  const isPageJumpAction = ruleActionType === "JUMP_TO_PAGE";
  // HIDE_QUESTION and HIDE_PAGE share the multi-select "create one rule per
  // target" flow; only the target list (questions vs pages) differs.
  const isMultiSkipAction = isSkipAction || isPageHideAction;
  // Actions whose target is a page rather than a question.
  const isPageTargetAction = isPageJumpAction || isPageHideAction;

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

    if (isMultiSkipAction) {
      // Only targets that are valid for the currently selected source —
      // selections made under a previous source are dropped.
      const validTargetIds = isPageHideAction
        ? skipTargetIds.filter((targetId) =>
            activeRuleTargetPages.some((page) => page.id === targetId)
          )
        : skipTargetIds.filter((targetId) =>
            activeRuleTargetQuestions.some((question) => question.id === targetId)
          );

      if (validTargetIds.length === 0) {
        return;
      }

      // Page skips can advance immediately when their trigger fires; the toggle
      // applies to every page chosen in this batch.
      const advanceOnTrigger = isPageHideAction && data.get("advanceOnTrigger") === "on";

      // Each skipped question/page is its own rule row; create them
      // sequentially so the toast and refreshed survey reflect the final state.
      let savedCount = 0;

      didSave = await runSurveyMutation(async () => {
        let response: Awaited<ReturnType<typeof createConditionalRule>> | null = null;

        for (const targetId of validTargetIds) {
          response = await createConditionalRule({
            surveyId: survey.id,
            sourcePageId: activeRuleSourceQuestion?.pageId ?? null,
            sourceQuestionId,
            sourceAnswerOptionId,
            conditionOperator,
            targetQuestionId: isPageHideAction ? null : targetId,
            targetPageId: isPageHideAction ? targetId : null,
            actionType: isPageHideAction ? "HIDE_PAGE" : "HIDE_QUESTION",
            skipTargetInNormalFlow: false,
            advanceOnTrigger
          });
          savedCount += 1;
        }

        if (!response) {
          throw new Error(
            isPageHideAction ? "Choose at least one page to skip" : "Choose at least one question to skip"
          );
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

  return (
    <>
      <form className="rule-form" id={formId} onSubmit={handleAddRule}>
        <PageGroupedQuestionSelect
          fieldLabel="Source question"
          name="sourceQuestionId"
          onChange={(nextQuestionId) => {
            const nextQuestion =
              nextQuestionId === null
                ? null
                : ruleSourceQuestions.find((question) => question.id === nextQuestionId) ?? null;

            setRuleSourceQuestionId(nextQuestionId);
            if (nextQuestion?.questionType === "text") {
              setRuleActionType("HIDE_QUESTION");
            }
            // Skip selections belong to the previous source's target
            // list; keeping them could submit stale question ids.
            setSkipTargetIds([]);
          }}
          placeholder="Choose source question"
          questions={ruleSourceQuestions}
          survey={survey}
          value={activeRuleSourceQuestion?.id ?? null}
        />
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
            <select
              name="actionType"
              onChange={(event) => {
                setRuleActionType(event.target.value === "HIDE_PAGE" ? "HIDE_PAGE" : "HIDE_QUESTION");
                setSkipTargetIds([]);
              }}
              value={isPageHideAction ? "HIDE_PAGE" : "HIDE_QUESTION"}
            >
              <option value="HIDE_QUESTION">Skip questions</option>
              <option value="HIDE_PAGE">Skip page</option>
            </select>
          ) : (
            <select
              name="actionType"
              onChange={(event) => {
                setRuleActionType(toRuleActionType(event.target.value));
                setSkipTargetIds([]);
              }}
              value={ruleActionType}
            >
              <option value="JUMP_TO_PAGE">Jump to page</option>
              <option value="JUMP_TO_QUESTION">Jump to question (legacy)</option>
              <option value="HIDE_QUESTION">Skip questions</option>
              <option value="HIDE_PAGE">Skip page</option>
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
        ) : isPageHideAction ? (
          <>
            <fieldset className="skip-target-fieldset" disabled={!activeRuleSourceQuestion}>
              <legend>Pages to skip</legend>
              {activeRuleTargetPages.map((page) => (
                <label className="checkbox-label" key={page.id}>
                  <input
                    checked={skipTargetIds.includes(page.id)}
                    onChange={(event) =>
                      setSkipTargetIds((current) =>
                        event.target.checked
                          ? [...current, page.id]
                          : current.filter((id) => id !== page.id)
                      )
                    }
                    type="checkbox"
                  />
                  {page.displayOrder}. {page.title}
                </label>
              ))}
            </fieldset>
            <label className="checkbox-label rule-flow-toggle">
              <input name="advanceOnTrigger" type="checkbox" />
              Advance immediately when triggered (skip the rest of the source page)
            </label>
          </>
        ) : isPageJumpAction ? (
          <>
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
            <label className="checkbox-label rule-flow-toggle">
              <input name="skipTargetInNormalFlow" type="checkbox" />
              Skip target in normal flow
            </label>
          </>
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
            (!isPageTargetAction && activeRuleTargetQuestions.length === 0) ||
            (isPageTargetAction && activeRuleTargetPages.length === 0) ||
            (isMultiSkipAction && skipTargetIds.length === 0)
          }
          type="submit"
        >
          {isMultiSkipAction ? "Add skip rules" : "Add rule"}
        </button>
      </form>

      <RuleBuilderEmptyState
        activeRuleSourceAnswerOptionCount={activeRuleSourceAnswerOptionCount}
        activeRuleSourceQuestion={activeRuleSourceQuestion}
        isBlankTextRule={isBlankTextRule}
        isPageTargetAction={isPageTargetAction}
        selectableQuestionCount={ruleSourceQuestions.length}
        targetCount={isPageTargetAction ? activeRuleTargetPages.length : activeRuleTargetQuestions.length}
      />
    </>
  );
}

// Maps an action <select> value to the ConditionalRuleActionType union,
// defaulting unrecognized values to the legacy jump-to-question action.
function toRuleActionType(value: string): ConditionalRuleActionType {
  if (
    value === "HIDE_QUESTION" ||
    value === "HIDE_PAGE" ||
    value === "JUMP_TO_PAGE" ||
    value === "JUMP_TO_QUESTION"
  ) {
    return value;
  }

  return "JUMP_TO_QUESTION";
}

function RuleBuilderEmptyState({
  activeRuleSourceAnswerOptionCount,
  activeRuleSourceQuestion,
  isBlankTextRule,
  isPageTargetAction,
  selectableQuestionCount,
  targetCount
}: {
  activeRuleSourceAnswerOptionCount: number;
  activeRuleSourceQuestion: SurveyQuestion | null;
  isBlankTextRule: boolean;
  isPageTargetAction: boolean;
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
        <span>Add answer options to this question before creating a rule from it.</span>
      </div>
    );
  }

  if (activeRuleSourceQuestion && targetCount === 0) {
    return (
      <div className="builder-empty-state compact">
        <strong>{isPageTargetAction ? "No later target pages" : "No later target questions"}</strong>
        <span>
          Choose an earlier source question or add another{" "}
          {isPageTargetAction ? "page" : "question"} after this one so the rule has
          somewhere to point.
        </span>
      </div>
    );
  }

  return null;
}
