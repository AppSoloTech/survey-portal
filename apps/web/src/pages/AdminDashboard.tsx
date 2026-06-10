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
import {
  AdminSectionNav,
  QuestionEditor,
  RuleEditor,
  ScaleRangeFields,
  StatusActionPanel,
  SurveyEditStateBanner,
  SurveyPreviewPanel,
  TagPresetManager,
  formatQuestionType,
  isSelectionQuestion,
  questionTypes,
  type TagPreset
} from "../components/admin/SurveyBuilderComponents.js";

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
  const [newQuestionType, setNewQuestionType] = useState<SurveyQuestionType>("text");

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
  const activeRuleSourceAnswerOptionCount = activeRuleSourceQuestion?.answerOptions.length ?? 0;
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

    if (
      status === "retired" &&
      !confirmAdminAction(
        `Retire "${selectedSurvey.title}"? Users will no longer be able to start this survey.`
      )
    ) {
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

    if (selectedSurvey.status !== "draft") {
      setError("Questions can only be added to draft surveys");
      setNotice(null);
      return;
    }

    const form = event.currentTarget;
    const data = new FormData(form);
    const questionType = readQuestionType(data, "questionType");

    const didSave = await runSurveyMutation(
      () =>
        createQuestion({
          surveyId: selectedSurvey.id,
          questionText: readFormText(data, "questionText"),
          questionType,
          scaleMin: questionType === "scale" ? readFormInteger(data, "scaleMin") : null,
          scaleMax: questionType === "scale" ? readFormInteger(data, "scaleMax") : null,
          isRequired: data.get("isRequired") === "on",
          helpText: readNullableFormText(data, "helpText")
        }),
      "Question added"
    );

    if (didSave) {
      form.reset();
      setNewQuestionType("text");
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
    const questionType = readQuestionType(data, "questionType");

    await runSurveyMutation(
      () =>
        updateQuestion({
          surveyId: selectedSurvey.id,
          questionId: question.id,
          questionText: readFormText(data, "questionText"),
          questionType,
          scaleMin: questionType === "scale" ? readFormInteger(data, "scaleMin") : null,
          scaleMax: questionType === "scale" ? readFormInteger(data, "scaleMax") : null,
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

    const question = selectedSurvey.questions.find((item) => item.id === questionId);

    if (
      !confirmAdminAction(
        `Delete question ${question?.displayOrder ?? ""}? This also removes its options, tags, and related rules.`
      )
    ) {
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

    const option = question.answerOptions.find((item) => item.id === optionId);

    if (
      !confirmAdminAction(
        `Delete option "${option?.optionText ?? "this option"}"? Hidden tags for this option will also be removed.`
      )
    ) {
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

    const tag = option.answerTags?.find((item) => item.id === tagId);

    if (
      !confirmAdminAction(
        `Remove hidden tag "${tag ? `${tag.tagKey}: ${tag.tagValue}` : "from this option"}"?`
      )
    ) {
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

    if (!confirmAdminAction("Delete this jump rule?")) {
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

      <AdminSectionNav />

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
            <button
              className="button-link compact-button primary-button"
              disabled={isSubmitting}
              type="submit"
            >
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
            <SurveyEditStateBanner survey={selectedSurvey} />

            <form
              className="builder-form"
              id="survey-setup"
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
                <button
                  className="button-link compact-button primary-button"
                  disabled={isSubmitting}
                  type="submit"
                >
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
              id="survey-questions"
              key={`add-question-${selectedSurvey.id}`}
              onSubmit={handleAddQuestion}
            >
              <div className="builder-section-heading">
                <div>
                  <p className="eyebrow">Questions</p>
                  <h3>Add question</h3>
                  {selectedSurvey.status !== "draft" ? (
                    <p className="builder-heading-note">
                      New questions can only be added while the survey is a draft.
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="builder-grid two-columns">
                <label>
                  Question text
                  <input disabled={selectedSurvey.status !== "draft"} name="questionText" required />
                </label>
                <label>
                  Type
                  <select
                    disabled={selectedSurvey.status !== "draft"}
                    name="questionType"
                    onChange={(event) =>
                      setNewQuestionType(event.target.value as SurveyQuestionType)
                    }
                    value={newQuestionType}
                  >
                    {questionTypes.map((type) => (
                      <option key={type} value={type}>
                        {formatQuestionType(type)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {newQuestionType === "scale" ? (
                <ScaleRangeFields disabled={selectedSurvey.status !== "draft"} />
              ) : null}
              <label>
                Help text
                <input disabled={selectedSurvey.status !== "draft"} name="helpText" />
              </label>
              <label className="checkbox-label">
                <input
                  defaultChecked
                  disabled={selectedSurvey.status !== "draft"}
                  name="isRequired"
                  type="checkbox"
                />
                Required
              </label>
              <button
                className="button-link compact-button primary-button"
                disabled={isSubmitting || selectedSurvey.status !== "draft"}
                type="submit"
              >
                Add question
              </button>
            </form>

            <div className="builder-stack">
              {selectedSurvey.questions.length === 0 ? (
                <div className="builder-empty-state">
                  <strong>No questions yet</strong>
                  <span>
                    Add the first question above. Published surveys need at least one
                    question before they make sense for users.
                  </span>
                </div>
              ) : null}
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

            <SurveyPreviewPanel survey={selectedSurvey} />

            <section className="builder-form advanced-builder-section" id="survey-logic">
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

function confirmAdminAction(message: string): boolean {
  return window.confirm(message);
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

function readFormInteger(data: FormData, field: string): number | null {
  const value = Number(data.get(field));
  return Number.isSafeInteger(value) ? value : null;
}

function readQuestionType(data: FormData, field: string): SurveyQuestionType {
  const value = readFormText(data, field);
  return questionTypes.includes(value as SurveyQuestionType)
    ? (value as SurveyQuestionType)
    : "text";
}
