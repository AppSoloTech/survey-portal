import type {
  AnswerOption,
  Survey,
  SurveyQuestion,
  SurveyQuestionType
} from "@survey-portal/shared";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import {
  createAnswerOption,
  createAnswerTag,
  createQuestion,
  deleteAnswerOption,
  deleteAnswerTag,
  deleteQuestion,
  fetchAdminSurveys,
  reorderAnswerOptions,
  reorderQuestions,
  updateAnswerOption,
  updateAnswerTag,
  updateQuestion
} from "../../api/surveys.js";
import {
  confirmAdminAction,
  readFormInteger,
  readFormText,
  readNullableFormText,
  readQuestionType
} from "../../components/admin/builderForm.js";
import {
  QuestionEditor,
  ScaleRangeFields,
  TagPresetManager,
  formatQuestionType,
  questionTypes,
  type TagPreset
} from "../../components/admin/SurveyBuilderComponents.js";
import { buildTagPresets, mergeTagPresets } from "../../components/admin/tagPresets.js";
import { useSurveyWorkspace } from "./SurveyWorkspaceLayout.js";

export function SurveyQuestionsPage() {
  const {
    customTagPresets,
    isSubmitting,
    runSurveyMutation,
    setCustomTagPresets,
    setFeedback,
    survey
  } = useSurveyWorkspace();
  const [newQuestionType, setNewQuestionType] = useState<SurveyQuestionType>("text");
  const [otherSurveys, setOtherSurveys] = useState<Survey[]>([]);

  // Cross-survey saved tag suggestions ("Saved in surveys") need the other
  // surveys' tags; the current survey stays live from workspace state.
  useEffect(() => {
    let isActive = true;

    fetchAdminSurveys()
      .then((response) => {
        if (isActive) {
          setOtherSurveys(response.surveys.filter((item) => item.id !== survey.id));
        }
      })
      .catch(() => {
        // Suggestions fall back to the current survey, defaults, and custom entries.
      });

    return () => {
      isActive = false;
    };
  }, [survey.id]);

  const tagPresets = useMemo(
    () => buildTagPresets([...otherSurveys, survey], customTagPresets),
    [customTagPresets, otherSurveys, survey]
  );

  async function handleAddQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (survey.status !== "draft") {
      setFeedback({ error: "Questions can only be added to draft surveys", notice: null });
      return;
    }

    const form = event.currentTarget;
    const data = new FormData(form);
    const questionType = readQuestionType(data, "questionType");

    const didSave = await runSurveyMutation(
      () =>
        createQuestion({
          surveyId: survey.id,
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

    const data = new FormData(event.currentTarget);
    const questionType = readQuestionType(data, "questionType");

    await runSurveyMutation(
      () =>
        updateQuestion({
          surveyId: survey.id,
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
    const ids = survey.questions.map((question) => question.id);
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
          surveyId: survey.id,
          questionIds: reordered
        }),
      "Question order saved"
    );
  }

  async function handleDeleteQuestion(questionId: number) {
    const question = survey.questions.find((item) => item.id === questionId);

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
          surveyId: survey.id,
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

    const form = event.currentTarget;
    const data = new FormData(form);

    const didSave = await runSurveyMutation(
      () =>
        createAnswerOption({
          surveyId: survey.id,
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

    const data = new FormData(event.currentTarget);

    await runSurveyMutation(
      () =>
        updateAnswerOption({
          surveyId: survey.id,
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
          surveyId: survey.id,
          questionId: question.id,
          optionIds: reordered
        }),
      "Option order saved"
    );
  }

  async function handleDeleteOption(question: SurveyQuestion, optionId: number) {
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
          surveyId: survey.id,
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

    const form = event.currentTarget;
    const data = new FormData(form);

    const didSave = await runSurveyMutation(
      () =>
        createAnswerTag({
          surveyId: survey.id,
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

    const data = new FormData(event.currentTarget);

    await runSurveyMutation(
      () =>
        updateAnswerTag({
          surveyId: survey.id,
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
          surveyId: survey.id,
          questionId: question.id,
          optionId: option.id,
          tagId
        }),
      "Hidden tag removed"
    );
  }

  function handleAddTagPreset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const tagKey = readFormText(data, "tagKey");
    const tagValue = readFormText(data, "tagValue");

    if (!tagKey || !tagValue) {
      setFeedback({ error: "Tag key and value are required", notice: null });
      return;
    }

    const preset: TagPreset = { tagKey, tagValue, source: "custom" };

    setCustomTagPresets((current) =>
      mergeTagPresets([...current, preset]).filter((item) => item.source === "custom")
    );
    setFeedback({ error: null, notice: "Tag suggestion added" });
    form.reset();
  }

  function handleDeleteTagPreset(preset: TagPreset) {
    setCustomTagPresets((current) =>
      current.filter(
        (item) => item.tagKey !== preset.tagKey || item.tagValue !== preset.tagValue
      )
    );
    setFeedback({ error: null, notice: "Tag suggestion removed" });
  }

  return (
    <div className="builder-workspace">
      <form
        className="builder-form"
        key={`add-question-${survey.id}`}
        onSubmit={handleAddQuestion}
      >
        <div className="builder-section-heading">
          <div>
            <p className="eyebrow">Questions</p>
            <h3>Add question</h3>
            {survey.status !== "draft" ? (
              <p className="builder-heading-note">
                New questions can only be added while the survey is a draft.
              </p>
            ) : null}
          </div>
        </div>
        <div className="builder-grid two-columns">
          <label>
            Question text
            <input disabled={survey.status !== "draft"} name="questionText" required />
          </label>
          <label>
            Type
            <select
              disabled={survey.status !== "draft"}
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
          <ScaleRangeFields disabled={survey.status !== "draft"} />
        ) : null}
        <label>
          Help text
          <input disabled={survey.status !== "draft"} name="helpText" />
        </label>
        <label className="checkbox-label">
          <input
            defaultChecked
            disabled={survey.status !== "draft"}
            name="isRequired"
            type="checkbox"
          />
          Required
        </label>
        <button
          className="button-link compact-button primary-button"
          disabled={isSubmitting || survey.status !== "draft"}
          type="submit"
        >
          Add question
        </button>
      </form>

      <div className="builder-stack">
        {survey.questions.length === 0 ? (
          <div className="builder-empty-state">
            <strong>No questions yet</strong>
            <span>
              Add the first question above. Published surveys need at least one question
              before they make sense for users.
            </span>
          </div>
        ) : null}
        {survey.questions.map((question, index) => (
          <QuestionEditor
            isFirst={index === 0}
            isLast={index === survey.questions.length - 1}
            isPublished={survey.status !== "draft"}
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

      <TagPresetManager
        customTagPresets={customTagPresets}
        onAddPreset={handleAddTagPreset}
        onDeletePreset={handleDeleteTagPreset}
        tagPresets={tagPresets}
      />
    </div>
  );
}
