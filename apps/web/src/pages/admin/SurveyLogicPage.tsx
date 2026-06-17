import { useState } from "react";

import { type ConditionalRuleActionType } from "../../api/surveys.js";
import { RuleCreateForm } from "../../components/admin/RuleCreateForm.js";
import { RuleList } from "../../components/admin/RuleList.js";
import { SurveyFlowMap } from "../../components/admin/SurveyFlowMap.js";
import { useSurveyWorkspace } from "./SurveyWorkspaceLayout.js";

const RULE_CREATE_FORM_ID = "rule-create-form";

export function SurveyLogicPage() {
  const { isSubmitting, reloadSurvey, runSurveyMutation, survey } = useSurveyWorkspace();
  const [ruleSourceQuestionId, setRuleSourceQuestionId] = useState<number | null>(null);
  const [ruleActionType, setRuleActionType] =
    useState<ConditionalRuleActionType>("JUMP_TO_PAGE");
  // The create section is collapsible, but "Add rule" from a flow-map node
  // needs to force it open before scrolling the prefilled form into view.
  const [isCreateOpen, setIsCreateOpen] = useState(true);
  // Structural changes are draft-only; the API rejects them after publish.
  const isLocked = survey.status !== "draft";

  // Prefill the create form from a flow-map node and bring it into focus.
  function handleCreateRuleForQuestion(questionId: number) {
    const question = survey.questions.find((candidate) => candidate.id === questionId) ?? null;

    setRuleSourceQuestionId(questionId);
    setRuleActionType(question?.questionType === "text" ? "HIDE_QUESTION" : "JUMP_TO_PAGE");
    setIsCreateOpen(true);

    // Wait for the section to expand so the form has layout before scrolling.
    requestAnimationFrame(() => {
      const form = document.getElementById(RULE_CREATE_FORM_ID);
      form?.scrollIntoView({ behavior: "smooth", block: "start" });
      // Skip the grouped-select's hidden input so focus lands on its trigger.
      form?.querySelector<HTMLElement>("select, input:not([type='hidden']), button")?.focus();
    });
  }

  return (
    <div className="builder-workspace">
      <details
        className="logic-section"
        open={isCreateOpen}
        onToggle={(event) => setIsCreateOpen(event.currentTarget.open)}
      >
        <summary className="logic-section-summary">
          <span className="logic-section-title">Create a rule</span>
        </summary>
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

          <RuleCreateForm
            formId={RULE_CREATE_FORM_ID}
            isLocked={isLocked}
            isSubmitting={isSubmitting}
            reloadSurvey={reloadSurvey}
            ruleActionType={ruleActionType}
            ruleSourceQuestionId={ruleSourceQuestionId}
            runSurveyMutation={runSurveyMutation}
            setRuleActionType={setRuleActionType}
            setRuleSourceQuestionId={setRuleSourceQuestionId}
            survey={survey}
          />
        </section>
      </details>

      <details className="logic-section" open>
        <summary className="logic-section-summary">
          <span className="logic-section-title">Existing rules</span>
          <span className="logic-section-count">
            {survey.conditionalLogicRules.length === 1
              ? "1 rule"
              : `${survey.conditionalLogicRules.length} rules`}
          </span>
        </summary>
        <section className="builder-form advanced-builder-section">
          <RuleList
            isLocked={isLocked}
            isSubmitting={isSubmitting}
            runSurveyMutation={runSurveyMutation}
            survey={survey}
          />
        </section>
      </details>

      <details className="logic-section" open>
        <summary className="logic-section-summary">
          <span className="logic-section-title">Flow map</span>
        </summary>
        <SurveyFlowMap
          isLocked={isLocked}
          onCreateRuleForQuestion={handleCreateRuleForQuestion}
          survey={survey}
        />
      </details>
    </div>
  );
}
