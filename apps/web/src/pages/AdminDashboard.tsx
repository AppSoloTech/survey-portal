import type {
  AnswerOption,
  ConditionalLogicRule,
  Survey,
  SurveyQuestion,
  SurveyQuestionType,
  SurveyStatus
} from "@survey-portal/shared";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import {
  createAnswerOption,
  createAnswerTag,
  createConditionalRule,
  createQuestion,
  createSurvey,
  deleteAnswerOption,
  deleteAnswerTag,
  deleteConditionalRule,
  deleteQuestion,
  fetchAdminSurveys,
  reorderAnswerOptions,
  reorderQuestions,
  updateAnswerOption,
  updateAnswerTag,
  updateConditionalRule,
  updateQuestion,
  updateSurveyMetadata,
  updateSurveyStatus
} from "../api/surveys.js";
import { useAuth } from "../auth/AuthContext.js";

const questionTypes: SurveyQuestionType[] = [
  "text",
  "integer",
  "single_select",
  "multi_select"
];
const customTagOptionValue = "__custom_tag_value__";

interface TagPreset {
  tagKey: string;
  tagValue: string;
  source: "default" | "survey" | "custom";
}

const defaultTagPresets: TagPreset[] = [
  { tagKey: "review_required", tagValue: "true", source: "default" },
  { tagKey: "review_required", tagValue: "false", source: "default" },
  { tagKey: "severity", tagValue: "high", source: "default" },
  { tagKey: "severity", tagValue: "medium", source: "default" },
  { tagKey: "severity", tagValue: "low", source: "default" },
  { tagKey: "compliance_result", tagValue: "compliant", source: "default" },
  { tagKey: "compliance_result", tagValue: "violation", source: "default" }
];

export function AdminDashboard() {
  const { user } = useAuth();
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [selectedSurveyId, setSelectedSurveyId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ruleSourceQuestionId, setRuleSourceQuestionId] = useState<number | null>(null);
  const [customTagPresets, setCustomTagPresets] = useState<TagPreset[]>([]);

  useEffect(() => {
    let isActive = true;

    fetchAdminSurveys()
      .then((response) => {
        if (!isActive) {
          return;
        }

        setSurveys(response.surveys);
        setSelectedSurveyId(response.surveys[0]?.id ?? null);
      })
      .catch((loadError) => {
        if (isActive) {
          setError(loadError instanceof Error ? loadError.message : "Could not load surveys");
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  const selectedSurvey = useMemo(
    () => surveys.find((survey) => survey.id === selectedSurveyId) ?? null,
    [selectedSurveyId, surveys]
  );

  const selectableQuestions = useMemo(
    () =>
      selectedSurvey?.questions.filter((question) => isSelectionQuestion(question)) ?? [],
    [selectedSurvey]
  );

  const activeRuleSourceQuestion =
    selectableQuestions.find((question) => question.id === ruleSourceQuestionId) ?? null;
  const activeRuleTargetQuestions = activeRuleSourceQuestion
    ? selectedSurvey?.questions.filter(
        (question) => question.displayOrder > activeRuleSourceQuestion.displayOrder
      ) ?? []
    : [];

  const tagPresets = useMemo(
    () => buildTagPresets(surveys, customTagPresets),
    [customTagPresets, surveys]
  );

  function applyUpdatedSurvey(survey: Survey) {
    setSurveys((current) => {
      const exists = current.some((item) => item.id === survey.id);
      const next = exists
        ? current.map((item) => (item.id === survey.id ? survey : item))
        : [...current, survey];

      return next.sort((left, right) => left.id - right.id);
    });
    setSelectedSurveyId(survey.id);
  }

  async function runSurveyMutation(
    action: () => Promise<{ survey: Survey }>,
    successMessage: string
  ): Promise<boolean> {
    setError(null);
    setNotice(null);
    setIsSubmitting(true);

    try {
      const response = await action();
      applyUpdatedSurvey(response.survey);
      setNotice(successMessage);
      return true;
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Request failed");
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCreateSurvey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    const didSave = await runSurveyMutation(
      () =>
        createSurvey({
          title: readFormText(data, "title"),
          description: readNullableFormText(data, "description")
        }),
      "Draft survey created and saved"
    );

    if (didSave) {
      form.reset();
      setRuleSourceQuestionId(null);
    }
  }

  async function handleSaveMetadata(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedSurvey) {
      return;
    }

    const data = new FormData(event.currentTarget);

    await runSurveyMutation(
      () =>
        updateSurveyMetadata({
          surveyId: selectedSurvey.id,
          title: readFormText(data, "title"),
          description: readNullableFormText(data, "description"),
          status: selectedSurvey.status
        }),
      "Survey metadata saved"
    );
  }

  async function handleStatus(status: SurveyStatus) {
    if (!selectedSurvey) {
      return;
    }

    await runSurveyMutation(
      () =>
        updateSurveyStatus({
          surveyId: selectedSurvey.id,
          status
        }),
      status === "published"
        ? selectedSurvey.status === "retired"
          ? "Survey republished"
          : "Survey published"
        : "Survey retired"
    );
  }

  async function handleAddQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedSurvey) {
      return;
    }

    const form = event.currentTarget;
    const data = new FormData(form);

    const didSave = await runSurveyMutation(
      () =>
        createQuestion({
          surveyId: selectedSurvey.id,
          questionText: readFormText(data, "questionText"),
          questionType: readQuestionType(data, "questionType"),
          isRequired: data.get("isRequired") === "on",
          helpText: readNullableFormText(data, "helpText")
        }),
      "Question added"
    );

    if (didSave) {
      form.reset();
    }
  }

  async function handleSaveQuestion(
    event: FormEvent<HTMLFormElement>,
    question: SurveyQuestion
  ) {
    event.preventDefault();

    if (!selectedSurvey) {
      return;
    }

    const data = new FormData(event.currentTarget);

    await runSurveyMutation(
      () =>
        updateQuestion({
          surveyId: selectedSurvey.id,
          questionId: question.id,
          questionText: readFormText(data, "questionText"),
          questionType: readQuestionType(data, "questionType"),
          isRequired: data.get("isRequired") === "on",
          helpText: readNullableFormText(data, "helpText")
        }),
      `Question ${question.displayOrder} saved`
    );
  }

  async function handleMoveQuestion(questionId: number, direction: -1 | 1) {
    if (!selectedSurvey) {
      return;
    }

    const ids = selectedSurvey.questions.map((question) => question.id);
    const index = ids.indexOf(questionId);
    const nextIndex = index + direction;

    if (index < 0 || nextIndex < 0 || nextIndex >= ids.length) {
      return;
    }

    const reordered = [...ids];
    [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];

    await runSurveyMutation(
      () =>
        reorderQuestions({
          surveyId: selectedSurvey.id,
          questionIds: reordered
        }),
      "Question order saved"
    );
  }

  async function handleDeleteQuestion(questionId: number) {
    if (!selectedSurvey) {
      return;
    }

    await runSurveyMutation(
      () =>
        deleteQuestion({
          surveyId: selectedSurvey.id,
          questionId
        }),
      "Question deleted"
    );
  }

  async function handleAddOption(
    event: FormEvent<HTMLFormElement>,
    question: SurveyQuestion
  ) {
    event.preventDefault();

    if (!selectedSurvey) {
      return;
    }

    const form = event.currentTarget;
    const data = new FormData(form);

    const didSave = await runSurveyMutation(
      () =>
        createAnswerOption({
          surveyId: selectedSurvey.id,
          questionId: question.id,
          optionText: readFormText(data, "optionText")
        }),
      `Option added to question ${question.displayOrder}`
    );

    if (didSave) {
      form.reset();
    }
  }

  async function handleSaveOption(
    event: FormEvent<HTMLFormElement>,
    question: SurveyQuestion,
    option: AnswerOption
  ) {
    event.preventDefault();

    if (!selectedSurvey) {
      return;
    }

    const data = new FormData(event.currentTarget);

    await runSurveyMutation(
      () =>
        updateAnswerOption({
          surveyId: selectedSurvey.id,
          questionId: question.id,
          optionId: option.id,
          optionText: readFormText(data, "optionText")
        }),
      "Option text saved"
    );
  }

  async function handleMoveOption(
    question: SurveyQuestion,
    optionId: number,
    direction: -1 | 1
  ) {
    if (!selectedSurvey) {
      return;
    }

    const ids = question.answerOptions.map((option) => option.id);
    const index = ids.indexOf(optionId);
    const nextIndex = index + direction;

    if (index < 0 || nextIndex < 0 || nextIndex >= ids.length) {
      return;
    }

    const reordered = [...ids];
    [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];

    await runSurveyMutation(
      () =>
        reorderAnswerOptions({
          surveyId: selectedSurvey.id,
          questionId: question.id,
          optionIds: reordered
        }),
      "Option order saved"
    );
  }

  async function handleDeleteOption(question: SurveyQuestion, optionId: number) {
    if (!selectedSurvey) {
      return;
    }

    await runSurveyMutation(
      () =>
        deleteAnswerOption({
          surveyId: selectedSurvey.id,
          questionId: question.id,
          optionId
        }),
      "Option deleted"
    );
  }

  async function handleAddTag(
    event: FormEvent<HTMLFormElement>,
    question: SurveyQuestion,
    option: AnswerOption
  ) {
    event.preventDefault();

    if (!selectedSurvey) {
      return;
    }

    const form = event.currentTarget;
    const data = new FormData(form);

    const didSave = await runSurveyMutation(
      () =>
        createAnswerTag({
          surveyId: selectedSurvey.id,
          questionId: question.id,
          optionId: option.id,
          tagKey: readFormText(data, "tagKey"),
          tagValue: readFormText(data, "tagValue")
        }),
      "Hidden tag added"
    );

    if (didSave) {
      form.reset();
    }
  }

  async function handleSaveTag(
    event: FormEvent<HTMLFormElement>,
    question: SurveyQuestion,
    option: AnswerOption,
    tagId: number
  ) {
    event.preventDefault();

    if (!selectedSurvey) {
      return;
    }

    const data = new FormData(event.currentTarget);

    await runSurveyMutation(
      () =>
        updateAnswerTag({
          surveyId: selectedSurvey.id,
          questionId: question.id,
          optionId: option.id,
          tagId,
          tagKey: readFormText(data, "tagKey"),
          tagValue: readFormText(data, "tagValue")
        }),
      "Hidden tag saved"
    );
  }

  async function handleDeleteTag(
    question: SurveyQuestion,
    option: AnswerOption,
    tagId: number
  ) {
    if (!selectedSurvey) {
      return;
    }

    await runSurveyMutation(
      () =>
        deleteAnswerTag({
          surveyId: selectedSurvey.id,
          questionId: question.id,
          optionId: option.id,
          tagId
        }),
      "Hidden tag removed"
    );
  }

  async function handleAddRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedSurvey) {
      return;
    }

    const form = event.currentTarget;
    const data = new FormData(form);

    const didSave = await runSurveyMutation(
      () =>
        createConditionalRule({
          surveyId: selectedSurvey.id,
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

    if (!selectedSurvey) {
      return;
    }

    const data = new FormData(event.currentTarget);

    await runSurveyMutation(
      () =>
        updateConditionalRule({
          surveyId: selectedSurvey.id,
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
    if (!selectedSurvey) {
      return;
    }

    await runSurveyMutation(
      () =>
        deleteConditionalRule({
          surveyId: selectedSurvey.id,
          ruleId
        }),
      "Jump rule deleted"
    );
  }

  function handleAddTagPreset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const tagKey = readFormText(data, "tagKey");
    const tagValue = readFormText(data, "tagValue");

    if (!tagKey || !tagValue) {
      setError("Tag key and value are required");
      return;
    }

    const preset: TagPreset = { tagKey, tagValue, source: "custom" };

    setCustomTagPresets((current) =>
      mergeTagPresets([...current, preset]).filter((item) => item.source === "custom")
    );
    setError(null);
    setNotice("Tag suggestion added");
    form.reset();
  }

  function handleDeleteTagPreset(preset: TagPreset) {
    setCustomTagPresets((current) =>
      current.filter(
        (item) => item.tagKey !== preset.tagKey || item.tagValue !== preset.tagValue
      )
    );
    setNotice("Tag suggestion removed");
  }

  return (
    <section className="page admin-builder-page">
      <div className="page-header">
        <p className="eyebrow">Admin portal</p>
        <h2>Survey Builder</h2>
        <p>Create, maintain, publish, and retire data-driven surveys.</p>
      </div>

      {user ? (
        <p className="status muted" id="admin-builder-top">
          Signed in as {user.firstName} {user.lastName}
        </p>
      ) : null}
      {error ? <p className="status error">{error}</p> : null}
      {notice ? <p className="status success">{notice}</p> : null}

      <div className="admin-builder-layout">
        <aside className="admin-survey-panel">
          <form className="builder-form compact-builder-form" onSubmit={handleCreateSurvey}>
            <h3>Create survey</h3>
            <label>
              Title
              <input name="title" required />
            </label>
            <label>
              Description
              <textarea name="description" rows={3} />
            </label>
            <button className="button-link compact-button" disabled={isSubmitting} type="submit">
              Create draft survey
            </button>
          </form>

          <div className="admin-survey-list" aria-label="Admin survey list">
            {isLoading ? <p className="status muted">Loading surveys...</p> : null}
            {!isLoading && surveys.length === 0 ? (
              <p className="status muted">No surveys yet.</p>
            ) : null}
            {surveys.map((survey) => (
              <button
                className={
                  survey.id === selectedSurveyId
                    ? "survey-selector active"
                    : "survey-selector"
                }
                key={survey.id}
                onClick={() => setSelectedSurveyId(survey.id)}
                type="button"
              >
                <span>{survey.title}</span>
                <span className={`status-pill ${survey.status}`}>{survey.status}</span>
              </button>
            ))}
          </div>
        </aside>

        {selectedSurvey ? (
          <div className="builder-workspace">
            <form
              className="builder-form"
              key={`metadata-${selectedSurvey.id}`}
              onSubmit={handleSaveMetadata}
            >
              <div className="builder-section-heading">
                <div>
                  <p className="eyebrow">Survey metadata</p>
                  <h3>{selectedSurvey.title}</h3>
                  <p className="builder-heading-note">
                    Draft changes are saved here without publishing the survey.
                  </p>
                </div>
                <span className={`status-pill ${selectedSurvey.status}`}>
                  {selectedSurvey.status}
                </span>
              </div>

              <label>
                Title
                <input defaultValue={selectedSurvey.title} name="title" required />
              </label>
              <label>
                Description
                <textarea
                  defaultValue={selectedSurvey.description ?? ""}
                  name="description"
                  rows={3}
                />
              </label>
              <div className="inline-actions">
                <button className="button-link compact-button" disabled={isSubmitting} type="submit">
                  Save metadata
                </button>
              </div>
            </form>

            <StatusActionPanel
              isSubmitting={isSubmitting}
              onStatusChange={handleStatus}
              placement="top"
              survey={selectedSurvey}
            />

            <form
              className="builder-form"
              key={`add-question-${selectedSurvey.id}`}
              onSubmit={handleAddQuestion}
            >
              <div className="builder-section-heading">
                <div>
                  <p className="eyebrow">Questions</p>
                  <h3>Add question</h3>
                </div>
              </div>
              <div className="builder-grid two-columns">
                <label>
                  Question text
                  <input name="questionText" required />
                </label>
                <label>
                  Type
                  <select name="questionType">
                    {questionTypes.map((type) => (
                      <option key={type} value={type}>
                        {formatQuestionType(type)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Help text
                <input name="helpText" />
              </label>
              <label className="checkbox-label">
                <input defaultChecked name="isRequired" type="checkbox" />
                Required
              </label>
              <button className="button-link compact-button" disabled={isSubmitting} type="submit">
                Add question
              </button>
            </form>

            <div className="builder-stack">
              {selectedSurvey.questions.map((question, index) => (
                <QuestionEditor
                  isFirst={index === 0}
                  isLast={index === selectedSurvey.questions.length - 1}
                  isPublished={selectedSurvey.status !== "draft"}
                  isSubmitting={isSubmitting}
                  key={question.id}
                  onAddOption={handleAddOption}
                  onAddTag={handleAddTag}
                  onDeleteOption={handleDeleteOption}
                  onDeleteQuestion={handleDeleteQuestion}
                  onDeleteTag={handleDeleteTag}
                  onMoveOption={handleMoveOption}
                  onMoveQuestion={handleMoveQuestion}
                  onSaveOption={handleSaveOption}
                  onSaveQuestion={handleSaveQuestion}
                  onSaveTag={handleSaveTag}
                  question={question}
                  tagPresets={tagPresets}
                />
              ))}
            </div>

            <section className="builder-form">
              <div className="builder-section-heading">
                <div>
                  <p className="eyebrow">Conditional logic</p>
                  <h3>Jump rules</h3>
                  <p className="builder-heading-note">
                    Add-rule fields reset after each saved rule. Existing rules stay below.
                  </p>
                  <p className="builder-heading-note">
                    Use the target-flow setting to either keep the target in normal question order or show it only when the jump reaches it.
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
                  className="button-link compact-button"
                  disabled={
                    isSubmitting ||
                    !activeRuleSourceQuestion ||
                    activeRuleTargetQuestions.length === 0
                  }
                  type="submit"
                >
                  Add rule
                </button>
              </form>

              <div className="rule-list">
                {selectedSurvey.conditionalLogicRules.length === 0 ? (
                  <p className="status muted">No jump rules configured.</p>
                ) : null}
                {selectedSurvey.conditionalLogicRules.map((rule) => (
                  <RuleEditor
                    isSubmitting={isSubmitting}
                    key={rule.id}
                    onDeleteRule={handleDeleteRule}
                    onSaveRule={handleSaveRule}
                    rule={rule}
                    survey={selectedSurvey}
                  />
                ))}
              </div>
            </section>

            <TagPresetManager
              customTagPresets={customTagPresets}
              onAddPreset={handleAddTagPreset}
              onDeletePreset={handleDeleteTagPreset}
              tagPresets={tagPresets}
            />

            <StatusActionPanel
              isSubmitting={isSubmitting}
              onStatusChange={handleStatus}
              placement="bottom"
              survey={selectedSurvey}
            />
          </div>
        ) : (
          <p className="status muted">Create or select a survey to start building.</p>
        )}
      </div>
    </section>
  );
}

function StatusActionPanel({
  isSubmitting,
  onStatusChange,
  placement,
  survey
}: {
  isSubmitting: boolean;
  onStatusChange: (status: SurveyStatus) => Promise<void>;
  placement: "top" | "bottom";
  survey: Survey;
}) {
  const isDraft = survey.status === "draft";
  const isPublished = survey.status === "published";
  const isRetired = survey.status === "retired";

  return (
    <section className={`builder-form status-action-panel ${placement}`}>
      <div className="builder-section-heading">
        <div>
          <p className="eyebrow">Survey status</p>
          <h3>{placement === "bottom" ? "Finish construction" : "Availability"}</h3>
          <p className="builder-heading-note">
            {isDraft
              ? "This survey is saved as a draft. Publish when required questions, options, and rules are ready."
              : isPublished
                ? "This survey is live for users. Retire it to stop new starts while preserving existing attempts."
                : "This survey is retired and unavailable for new starts. Republish it when it passes validation."}
          </p>
        </div>
        <span className={`status-pill ${survey.status}`}>{survey.status}</span>
      </div>

      <div className="status-action-row">
        <span className="status-summary">
          Current status: <strong>{survey.status}</strong>
        </span>
        <div className="inline-actions">
          <button
            className="button-link compact-button"
            disabled={isSubmitting || (!isDraft && !isRetired)}
            onClick={() => void onStatusChange("published")}
            type="button"
          >
            {isRetired ? "Republish survey" : "Publish survey"}
          </button>
          <button
            className="button-link compact-button"
            disabled={isSubmitting || !isPublished}
            onClick={() => void onStatusChange("retired")}
            type="button"
          >
            Retire survey
          </button>
          {placement === "bottom" ? (
            <a className="button-link compact-button secondary-button" href="#admin-builder-top">
              Back to top
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function QuestionEditor({
  isFirst,
  isLast,
  isPublished,
  isSubmitting,
  onAddOption,
  onAddTag,
  onDeleteOption,
  onDeleteQuestion,
  onDeleteTag,
  onMoveOption,
  onMoveQuestion,
  onSaveOption,
  onSaveQuestion,
  onSaveTag,
  question,
  tagPresets
}: {
  isFirst: boolean;
  isLast: boolean;
  isPublished: boolean;
  isSubmitting: boolean;
  onAddOption: (event: FormEvent<HTMLFormElement>, question: SurveyQuestion) => Promise<void>;
  onAddTag: (
    event: FormEvent<HTMLFormElement>,
    question: SurveyQuestion,
    option: AnswerOption
  ) => Promise<void>;
  onDeleteOption: (question: SurveyQuestion, optionId: number) => Promise<void>;
  onDeleteQuestion: (questionId: number) => Promise<void>;
  onDeleteTag: (
    question: SurveyQuestion,
    option: AnswerOption,
    tagId: number
  ) => Promise<void>;
  onMoveOption: (
    question: SurveyQuestion,
    optionId: number,
    direction: -1 | 1
  ) => Promise<void>;
  onMoveQuestion: (questionId: number, direction: -1 | 1) => Promise<void>;
  onSaveOption: (
    event: FormEvent<HTMLFormElement>,
    question: SurveyQuestion,
    option: AnswerOption
  ) => Promise<void>;
  onSaveQuestion: (
    event: FormEvent<HTMLFormElement>,
    question: SurveyQuestion
  ) => Promise<void>;
  onSaveTag: (
    event: FormEvent<HTMLFormElement>,
    question: SurveyQuestion,
    option: AnswerOption,
    tagId: number
  ) => Promise<void>;
  question: SurveyQuestion;
  tagPresets: TagPreset[];
}) {
  return (
    <section className="question-editor">
      <form onSubmit={(event) => void onSaveQuestion(event, question)}>
        <div className="builder-section-heading">
          <div>
            <p className="eyebrow">Question {question.displayOrder}</p>
            <h3>{question.questionText}</h3>
            <p className="builder-heading-note">
              Save question updates this prompt, type, help text, and required setting only.
            </p>
          </div>
          <div className="inline-actions">
            <button
              className="button-link compact-button"
              disabled={isSubmitting || isFirst}
              onClick={() => void onMoveQuestion(question.id, -1)}
              type="button"
            >
              Up
            </button>
            <button
              className="button-link compact-button"
              disabled={isSubmitting || isLast}
              onClick={() => void onMoveQuestion(question.id, 1)}
              type="button"
            >
              Down
            </button>
          </div>
        </div>

        <div className="builder-grid two-columns">
          <label>
            Question text
            <input defaultValue={question.questionText} name="questionText" required />
          </label>
          <label>
            Type
            <select
              defaultValue={question.questionType}
              disabled={isPublished}
              name={isPublished ? undefined : "questionType"}
            >
              {questionTypes.map((type) => (
                <option key={type} value={type}>
                  {formatQuestionType(type)}
                </option>
              ))}
            </select>
            {isPublished ? (
              <input name="questionType" type="hidden" value={question.questionType} />
            ) : null}
          </label>
        </div>
        <label>
          Help text
          <input defaultValue={question.helpText ?? ""} name="helpText" />
        </label>
        <label className="checkbox-label">
          <input defaultChecked={question.isRequired} name="isRequired" type="checkbox" />
          Required
        </label>
        <div className="inline-actions">
          <button className="button-link compact-button" disabled={isSubmitting} type="submit">
            Save question
          </button>
          <button
            className="button-link compact-button danger-button"
            disabled={isSubmitting || isPublished}
            onClick={() => void onDeleteQuestion(question.id)}
            type="button"
          >
            Delete question
          </button>
        </div>
      </form>

      {isSelectionQuestion(question) ? (
        <div className="option-editor">
          <div>
            <h4>Answer options</h4>
            <p className="builder-heading-note">
              Option text, order, and hidden tags are saved with separate actions.
            </p>
          </div>
          {question.answerOptions.map((option, index) => (
            <div className="option-editor-row" key={option.id}>
              <div className="option-row-header">
                <div>
                  <p className="option-subheading">Option {index + 1}</p>
                  <h5>{option.optionText}</h5>
                </div>
                <div className="inline-actions">
                  <button
                    className="button-link compact-button"
                    disabled={isSubmitting || index === 0}
                    onClick={() => void onMoveOption(question, option.id, -1)}
                    type="button"
                  >
                    Move up
                  </button>
                  <button
                    className="button-link compact-button"
                    disabled={isSubmitting || index === question.answerOptions.length - 1}
                    onClick={() => void onMoveOption(question, option.id, 1)}
                    type="button"
                  >
                    Move down
                  </button>
                </div>
              </div>

              <div className="option-row-body">
                <form
                  className="option-row-form"
                  onSubmit={(event) => void onSaveOption(event, question, option)}
                >
                  <label>
                    Option text
                    <input defaultValue={option.optionText} name="optionText" required />
                  </label>
                  <div className="inline-actions">
                    <button className="button-link compact-button" disabled={isSubmitting} type="submit">
                      Save option text
                    </button>
                    <button
                      className="button-link compact-button danger-button"
                      disabled={isSubmitting || isPublished}
                      onClick={() => void onDeleteOption(question, option.id)}
                      type="button"
                    >
                      Delete option
                    </button>
                  </div>
                </form>

                <div className="tag-editor">
                <div>
                  <p className="option-subheading">Hidden tags for this option</p>
                  <p className="tag-helper-text">Use Add hidden tag for new tags. Save option text does not save tag fields.</p>
                </div>
                {(option.answerTags ?? []).map((tag) => (
                  <form
                    className="tag-row"
                    key={tag.id}
                    onSubmit={(event) => void onSaveTag(event, question, option, tag.id)}
                  >
                    <TagFields
                      initialTagKey={tag.tagKey}
                      initialTagValue={tag.tagValue}
                      tagPresets={tagPresets}
                    />
                    <button className="button-link compact-button" disabled={isSubmitting} type="submit">
                      Save tag
                    </button>
                    <button
                      className="button-link compact-button danger-button"
                      disabled={isSubmitting}
                      onClick={() => void onDeleteTag(question, option, tag.id)}
                      type="button"
                    >
                      Remove tag
                    </button>
                  </form>
                ))}
                <form
                  className="tag-row add-tag-row"
                  key={`add-tag-${option.id}-${option.answerTags?.length ?? 0}`}
                  onSubmit={(event) => void onAddTag(event, question, option)}
                >
                  <TagFields tagPresets={tagPresets} />
                  <button className="button-link compact-button" disabled={isSubmitting} type="submit">
                    Add hidden tag
                  </button>
                </form>
                </div>
              </div>
            </div>
          ))}

          <form className="add-option-form" onSubmit={(event) => void onAddOption(event, question)}>
            <label>
              New option text
              <input name="optionText" required />
            </label>
            <button className="button-link compact-button" disabled={isSubmitting} type="submit">
              Add option
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}

function TagPresetManager({
  customTagPresets,
  onAddPreset,
  onDeletePreset,
  tagPresets
}: {
  customTagPresets: TagPreset[];
  onAddPreset: (event: FormEvent<HTMLFormElement>) => void;
  onDeletePreset: (preset: TagPreset) => void;
  tagPresets: TagPreset[];
}) {
  return (
    <section className="builder-form tag-preset-panel">
      <div className="builder-section-heading">
        <div>
          <p className="eyebrow">Hidden tags</p>
          <h3>Tag suggestions</h3>
          <p className="builder-heading-note">
            Suggestions speed up tag entry. Saved option tags remain managed on each answer option.
          </p>
        </div>
      </div>

      <div className="tag-preset-list">
        {tagPresets.map((preset) => {
          const canRemove = hasCustomTagSuggestion(customTagPresets, preset);

          return (
            <span
              className={`tag-preset-chip ${preset.source}${canRemove ? " removable" : ""}`}
              key={`${preset.tagKey}:${preset.tagValue}`}
            >
              <span className="tag-preset-text">
                <strong>{preset.tagKey}</strong>
                <span>{preset.tagValue}</span>
              </span>
              <span className="tag-source-label">{formatTagPresetSource(preset.source)}</span>
              {canRemove ? (
                <button
                  aria-label={`Remove ${preset.tagKey}: ${preset.tagValue}`}
                  onClick={() => onDeletePreset(preset)}
                  type="button"
                >
                  Remove custom
                </button>
              ) : null}
            </span>
          );
        })}
      </div>

      <form className="tag-preset-form" onSubmit={onAddPreset}>
        <label>
          Custom suggestion key
          <input name="tagKey" required />
        </label>
        <label>
          Custom suggestion value
          <input name="tagValue" required />
        </label>
        <button className="button-link compact-button" type="submit">
          Add suggestion
        </button>
      </form>

      {customTagPresets.length === 0 ? (
        <p className="muted">Custom suggestions stay in this builder session.</p>
      ) : null}
    </section>
  );
}

function TagFields({
  initialTagKey,
  initialTagValue,
  tagPresets
}: {
  initialTagKey?: string;
  initialTagValue?: string;
  tagPresets: TagPreset[];
}) {
  const keyOptions = useMemo(
    () => uniqueValues([...tagPresets.map((preset) => preset.tagKey), initialTagKey]),
    [initialTagKey, tagPresets]
  );
  const initialKey = initialTagKey ?? "";
  const [selectedKey, setSelectedKey] = useState(initialKey);
  const [customKey, setCustomKey] = useState("");
  const [selectedValue, setSelectedValue] = useState(initialTagValue ?? "");
  const [customValue, setCustomValue] = useState("");

  useEffect(() => {
    if (initialTagKey !== undefined || initialTagValue !== undefined) {
      setSelectedKey(initialTagKey ?? "");
      setCustomKey("");
      setSelectedValue(initialTagValue ?? "");
      setCustomValue("");
    }
  }, [initialTagKey, initialTagValue]);

  const isCustomKey = selectedKey === customTagOptionValue;
  const activeKey = isCustomKey ? customKey : selectedKey;
  const valueOptions = uniqueValues([
    ...tagPresets
      .filter((preset) => preset.tagKey === activeKey)
      .map((preset) => preset.tagValue),
    initialTagKey === activeKey ? initialTagValue : undefined
  ]);
  const isCustomValue = selectedValue === customTagOptionValue;

  function handleKeyChange(nextKey: string) {
    setSelectedKey(nextKey);
    setCustomKey("");
    setSelectedValue("");
    setCustomValue("");
  }

  return (
    <>
      <label>
        Tag key
        <select
          name={isCustomKey ? undefined : "tagKey"}
          onChange={(event) => handleKeyChange(event.target.value)}
          required
          value={selectedKey}
        >
          <option value="">Choose tag key</option>
          {keyOptions.map((tagKey) => (
            <option key={tagKey} value={tagKey}>
              {tagKey}
            </option>
          ))}
          <option value={customTagOptionValue}>Custom key...</option>
        </select>
        {isCustomKey ? (
          <input
            autoComplete="off"
            name="tagKey"
            onChange={(event) => setCustomKey(event.target.value)}
            placeholder="Enter tag key"
            required
            value={customKey}
          />
        ) : null}
      </label>
      <label>
        Tag value
        {isCustomKey || isCustomValue || valueOptions.length === 0 ? (
          <input
            autoComplete="off"
            disabled={!activeKey.trim()}
            name="tagValue"
            onChange={(event) => setCustomValue(event.target.value)}
            placeholder="Enter tag value"
            required
            value={customValue}
          />
        ) : (
          <select
            disabled={!activeKey.trim()}
            name="tagValue"
            onChange={(event) => setSelectedValue(event.target.value)}
            required
            value={selectedValue}
          >
            <option value="">Choose tag value</option>
            {valueOptions.map((tagValue) => (
              <option key={tagValue} value={tagValue}>
                {tagValue}
              </option>
            ))}
            <option value={customTagOptionValue}>Custom value...</option>
          </select>
        )}
      </label>
    </>
  );
}

function RuleEditor({
  isSubmitting,
  onDeleteRule,
  onSaveRule,
  rule,
  survey
}: {
  isSubmitting: boolean;
  onDeleteRule: (ruleId: number) => Promise<void>;
  onSaveRule: (
    event: FormEvent<HTMLFormElement>,
    rule: ConditionalLogicRule
  ) => Promise<void>;
  rule: ConditionalLogicRule;
  survey: Survey;
}) {
  const sourceQuestions = survey.questions.filter((question) => isSelectionQuestion(question));
  const [sourceQuestionId, setSourceQuestionId] = useState(rule.sourceQuestionId);

  useEffect(() => {
    setSourceQuestionId(rule.sourceQuestionId);
  }, [rule.sourceQuestionId]);

  const sourceQuestion =
    sourceQuestions.find((question) => question.id === sourceQuestionId) ??
    sourceQuestions[0] ??
    null;
  const targetQuestions = sourceQuestion
    ? survey.questions.filter(
        (question) => question.displayOrder > sourceQuestion.displayOrder
      )
    : [];

  return (
    <form className="rule-form rule-row" onSubmit={(event) => void onSaveRule(event, rule)}>
      <label>
        Source question
        <select
          name="sourceQuestionId"
          onChange={(event) => setSourceQuestionId(Number(event.target.value))}
          value={sourceQuestion?.id ?? ""}
        >
          {sourceQuestions.map((question) => (
            <option key={question.id} value={question.id}>
              {question.displayOrder}. {question.questionText}
            </option>
          ))}
        </select>
      </label>
      <label>
        Source answer
        <select
          defaultValue={rule.sourceAnswerOptionId}
          key={sourceQuestion?.id ?? "source-answer"}
          name="sourceAnswerOptionId"
        >
          {sourceQuestion?.answerOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.optionText}
            </option>
          ))}
        </select>
      </label>
      <label>
        Target question
        <select
          defaultValue={rule.targetQuestionId ?? ""}
          key={sourceQuestion?.id ?? "target-question"}
          name="targetQuestionId"
        >
          {targetQuestions.map((question) => (
            <option key={question.id} value={question.id}>
              {question.displayOrder}. {question.questionText}
            </option>
          ))}
        </select>
      </label>
      <label className="checkbox-label rule-flow-toggle">
        <input
          defaultChecked={rule.skipTargetInNormalFlow}
          name="skipTargetInNormalFlow"
          type="checkbox"
        />
        Skip target in normal flow
      </label>
      <div className="inline-actions">
        <button className="button-link compact-button" disabled={isSubmitting} type="submit">
          Save rule
        </button>
        <button
          className="button-link compact-button danger-button"
          disabled={isSubmitting}
          onClick={() => void onDeleteRule(rule.id)}
          type="button"
        >
          Delete rule
        </button>
      </div>
    </form>
  );
}

function isSelectionQuestion(question: SurveyQuestion): boolean {
  return question.questionType === "single_select" || question.questionType === "multi_select";
}

function buildTagPresets(surveys: Survey[], customTagPresets: TagPreset[]): TagPreset[] {
  const surveyTagPresets = surveys.flatMap((survey) =>
    survey.questions.flatMap((question) =>
      question.answerOptions.flatMap((option) =>
        (option.answerTags ?? []).map((tag) => ({
          tagKey: tag.tagKey,
          tagValue: tag.tagValue,
          source: "survey" as const
        }))
      )
    )
  );

  return mergeTagPresets([...defaultTagPresets, ...surveyTagPresets, ...customTagPresets]);
}

function mergeTagPresets(presets: TagPreset[]): TagPreset[] {
  const merged = new Map<string, TagPreset>();

  for (const preset of presets) {
    const tagKey = preset.tagKey.trim();
    const tagValue = preset.tagValue.trim();

    if (!tagKey || !tagValue) {
      continue;
    }

    const key = `${tagKey}:${tagValue}`;

    if (!merged.has(key)) {
      merged.set(key, {
        tagKey,
        tagValue,
        source: preset.source
      });
    }
  }

  return [...merged.values()].sort(
    (left, right) =>
      left.tagKey.localeCompare(right.tagKey) || left.tagValue.localeCompare(right.tagValue)
  );
}

function uniqueValues(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
}

function formatTagPresetSource(source: TagPreset["source"]): string {
  if (source === "default") {
    return "Built-in";
  }

  if (source === "survey") {
    return "Saved in surveys";
  }

  return "Custom";
}

function hasCustomTagSuggestion(customTagPresets: TagPreset[], preset: TagPreset): boolean {
  return customTagPresets.some(
    (item) => item.tagKey === preset.tagKey && item.tagValue === preset.tagValue
  );
}

function readFormText(data: FormData, field: string): string {
  const value = data.get(field);
  return typeof value === "string" ? value.trim() : "";
}

function readNullableFormText(data: FormData, field: string): string | null {
  const value = readFormText(data, field);
  return value ? value : null;
}

function readFormNumber(data: FormData, field: string): number {
  const value = Number(data.get(field));
  return Number.isSafeInteger(value) ? value : 0;
}

function readQuestionType(data: FormData, field: string): SurveyQuestionType {
  const value = readFormText(data, field);
  return questionTypes.includes(value as SurveyQuestionType)
    ? (value as SurveyQuestionType)
    : "text";
}

function formatQuestionType(type: SurveyQuestionType): string {
  return type.replace("_", " ");
}
