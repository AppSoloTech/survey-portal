import type {
  AnswerOption,
  SurveyPage,
  SurveyQuestion,
  SurveyQuestionType,
  TagDefinition
} from "@survey-portal/shared";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import {
  createAnswerOption,
  createAnswerTag,
  createQuestionValueTag,
  createQuestion,
  createSurveyPage,
  deleteAnswerOption,
  deleteAnswerTag,
  deleteQuestionValueTag,
  deleteQuestion,
  deleteSurveyPage,
  moveQuestionToPage,
  reorderAnswerOptions,
  reorderQuestions,
  reorderSurveyPages,
  updateAnswerOption,
  updateAnswerTag,
  updateQuestion,
  updateSurveyPage
} from "../../api/surveys.js";
import { fetchTagDefinitions } from "../../api/tags.js";
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
  formatQuestionLocator,
  formatQuestionType,
  questionTypes
} from "../../components/admin/SurveyBuilderComponents.js";
import { buildTagPresets } from "../../components/admin/tagPresets.js";
import { useSurveyWorkspace } from "./SurveyWorkspaceLayout.js";

export function SurveyQuestionsPage() {
  const { isSubmitting, runSurveyMutation, setFeedback, survey } = useSurveyWorkspace();
  const [newQuestionType, setNewQuestionType] = useState<SurveyQuestionType>("text");
  const [newQuestionPageId, setNewQuestionPageId] = useState<number | null>(
    survey.pages[0]?.id ?? null
  );
  const [catalogTags, setCatalogTags] = useState<TagDefinition[]>([]);

  useEffect(() => {
    setNewQuestionPageId((current) =>
      current && survey.pages.some((page) => page.id === current)
        ? current
        : survey.pages[0]?.id ?? null
    );
  }, [survey.pages]);

  // Tag suggestions come from the persistent tag catalog plus the current
  // survey's live tags. Tags saved here register in the catalog server-side.
  useEffect(() => {
    let isActive = true;

    fetchTagDefinitions()
      .then((response) => {
        if (isActive) {
          setCatalogTags(response.tags);
        }
      })
      .catch(() => {
        // Suggestions fall back to defaults and the current survey's tags.
      });

    return () => {
      isActive = false;
    };
  }, [survey.id]);

  const tagPresets = useMemo(
    () =>
      buildTagPresets(
        [survey],
        catalogTags.map((tag) => ({
          tagKey: tag.tagKey,
          tagValue: tag.tagValue,
          source: "custom" as const
        }))
      ),
    [catalogTags, survey]
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
    const pageId = readFormInteger(data, "pageId") ?? newQuestionPageId;

    if (!pageId) {
      setFeedback({ error: "Choose a page before adding a question", notice: null });
      return;
    }

    const didSave = await runSurveyMutation(
      () =>
        createQuestion({
          surveyId: survey.id,
          pageId,
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
      setNewQuestionPageId(pageId);
    }
  }

  async function handleAddPage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const data = new FormData(form);
    const didSave = await runSurveyMutation(
      () =>
        createSurveyPage({
          surveyId: survey.id,
          title: readFormText(data, "title"),
          description: readNullableFormText(data, "description")
        }),
      "Page added"
    );

    if (didSave) {
      form.reset();
    }
  }

  async function handleSavePage(event: FormEvent<HTMLFormElement>, page: SurveyPage) {
    event.preventDefault();

    const data = new FormData(event.currentTarget);
    await runSurveyMutation(
      () =>
        updateSurveyPage({
          surveyId: survey.id,
          pageId: page.id,
          title: readFormText(data, "title"),
          description: readNullableFormText(data, "description")
        }),
      `Page ${page.displayOrder} saved`
    );
  }

  async function handleMovePage(pageId: number, direction: -1 | 1) {
    const ids = survey.pages.map((page) => page.id);
    const index = ids.indexOf(pageId);
    const nextIndex = index + direction;

    if (index < 0 || nextIndex < 0 || nextIndex >= ids.length) {
      return;
    }

    const reordered = [...ids];
    [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];

    await runSurveyMutation(
      () => reorderSurveyPages({ surveyId: survey.id, pageIds: reordered }),
      "Page order saved"
    );
  }

  async function handleDeletePage(page: SurveyPage) {
    if (!confirmAdminAction(`Delete "${page.title}"? Only empty pages can be deleted.`)) {
      return;
    }

    await runSurveyMutation(
      () => deleteSurveyPage({ surveyId: survey.id, pageId: page.id }),
      "Page deleted"
    );
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
      `${formatQuestionLocator(survey, question)} saved`
    );
  }

  async function handleMoveQuestion(questionId: number, direction: -1 | 1) {
    const question = survey.questions.find((item) => item.id === questionId);

    if (!question) {
      return;
    }

    const pageQuestions = survey.questions.filter((item) => item.pageId === question.pageId);
    const ids = pageQuestions.map((item) => item.id);
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
          pageId: question.pageId,
          questionIds: reordered
        }),
      "Question order saved"
    );
  }

  async function handleChangeQuestionPage(question: SurveyQuestion, pageId: number) {
    if (pageId === question.pageId) {
      return;
    }

    await runSurveyMutation(
      () =>
        moveQuestionToPage({
          surveyId: survey.id,
          questionId: question.id,
          pageId
        }),
      "Question moved"
    );
  }

  async function handleDeleteQuestion(questionId: number) {
    const question = survey.questions.find((item) => item.id === questionId);
    const questionLabel = question ? formatQuestionLocator(survey, question) : "";

    if (
      !confirmAdminAction(
        `Delete question ${questionLabel}? This also removes its options, tags, and related rules.`
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
      `Option added to ${formatQuestionLocator(survey, question)}`
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

  // Value tags live on the question itself (text/integer types). Bounds are
  // read leniently: blank inputs mean "no bound".
  async function handleAddValueTag(event: FormEvent<HTMLFormElement>, question: SurveyQuestion) {
    event.preventDefault();

    const form = event.currentTarget;
    const data = new FormData(form);
    const readOptionalBound = (field: string): number | null => {
      const raw = String(data.get(field) ?? "").trim();

      return raw === "" ? null : Number(raw);
    };

    const didSave = await runSurveyMutation(
      () =>
        createQuestionValueTag({
          surveyId: survey.id,
          questionId: question.id,
          tagKey: readFormText(data, "tagKey"),
          tagValue: readFormText(data, "tagValue"),
          integerMin: question.questionType === "integer" ? readOptionalBound("integerMin") : null,
          integerMax: question.questionType === "integer" ? readOptionalBound("integerMax") : null
        }),
      "Hidden tag added"
    );

    if (didSave) {
      form.reset();
    }
  }

  async function handleDeleteValueTag(question: SurveyQuestion, valueTagId: number) {
    if (!confirmAdminAction("Remove this hidden tag?")) {
      return;
    }

    await runSurveyMutation(
      () =>
        deleteQuestionValueTag({
          surveyId: survey.id,
          questionId: question.id,
          valueTagId
        }),
      "Hidden tag removed"
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

  return (
    <div className="builder-workspace">
      <form
        className="builder-form"
        key={`add-page-${survey.id}`}
        onSubmit={handleAddPage}
      >
        <div className="builder-section-heading">
          <div>
            <p className="eyebrow">Pages</p>
            <h3>Add page</h3>
            {survey.status !== "draft" ? (
              <p className="builder-heading-note">
                New pages can only be added while the survey is a draft.
              </p>
            ) : null}
          </div>
        </div>
        <div className="builder-grid two-columns">
          <label>
            Page title
            <input disabled={survey.status !== "draft"} name="title" required />
          </label>
          <label>
            Description
            <input disabled={survey.status !== "draft"} name="description" />
          </label>
        </div>
        <button
          className="button-link compact-button primary-button"
          disabled={isSubmitting || survey.status !== "draft"}
          type="submit"
        >
          Add page
        </button>
      </form>

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
            Page
            <select
              disabled={survey.status !== "draft"}
              name="pageId"
              onChange={(event) => setNewQuestionPageId(Number(event.target.value))}
              value={newQuestionPageId ?? ""}
            >
              {survey.pages.map((page) => (
                <option key={page.id} value={page.id}>
                  {page.displayOrder}. {page.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Question text
            <input disabled={survey.status !== "draft"} name="questionText" required />
          </label>
        </div>
        <div className="builder-grid two-columns">
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
        {survey.pages.length === 0 ? (
          <div className="builder-empty-state">
            <strong>No pages yet</strong>
            <span>
              Add the first page above. Published surveys need at least one page and
              one question before they make sense for users.
            </span>
          </div>
        ) : null}
        {survey.pages.map((page, pageIndex) => {
          const pageQuestions = survey.questions.filter((question) => question.pageId === page.id);

          return (
            <section className="builder-form page-builder-panel" key={page.id}>
              <form onSubmit={(event) => void handleSavePage(event, page)}>
                <div className="builder-section-heading">
                  <div>
                    <p className="eyebrow">Page {page.displayOrder}</p>
                    <h3>{page.title}</h3>
                    {page.description ? (
                      <p className="builder-heading-note">{page.description}</p>
                    ) : null}
                  </div>
                  <div className="inline-actions">
                    <button
                      className="button-link compact-button secondary-button"
                      disabled={pageIndex === 0 || isSubmitting || survey.status !== "draft"}
                      onClick={() => void handleMovePage(page.id, -1)}
                      type="button"
                    >
                      Move up
                    </button>
                    <button
                      className="button-link compact-button secondary-button"
                      disabled={
                        pageIndex === survey.pages.length - 1 ||
                        isSubmitting ||
                        survey.status !== "draft"
                      }
                      onClick={() => void handleMovePage(page.id, 1)}
                      type="button"
                    >
                      Move down
                    </button>
                    <button
                      className="button-link compact-button danger-button"
                      disabled={
                        pageQuestions.length > 0 ||
                        survey.pages.length <= 1 ||
                        isSubmitting ||
                        survey.status !== "draft"
                      }
                      onClick={() => void handleDeletePage(page)}
                      type="button"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div className="builder-grid two-columns">
                  <label>
                    Page title
                    <input
                      defaultValue={page.title}
                      disabled={survey.status !== "draft"}
                      name="title"
                      required
                    />
                  </label>
                  <label>
                    Description
                    <input
                      defaultValue={page.description ?? ""}
                      disabled={survey.status !== "draft"}
                      name="description"
                      placeholder="Optional text shown at the top of this page"
                    />
                  </label>
                </div>
                <button
                  className="button-link compact-button primary-button"
                  disabled={isSubmitting || survey.status !== "draft"}
                  type="submit"
                >
                  Save page
                </button>
              </form>

              {pageQuestions.length === 0 ? (
                <div className="builder-empty-state">
                  <strong>No questions on this page</strong>
                  <span>Add a question above and choose this page.</span>
                </div>
              ) : null}

              {pageQuestions.map((question, index) => (
                <div className="page-question-shell" key={question.id}>
                  <QuestionEditor
                    isFirst={index === 0}
                    isLast={index === pageQuestions.length - 1}
                    isPublished={survey.status !== "draft"}
                    isSubmitting={isSubmitting}
                    onAddOption={handleAddOption}
                    onAddTag={handleAddTag}
                    onAddValueTag={handleAddValueTag}
                    onDeleteValueTag={handleDeleteValueTag}
                    onDeleteOption={handleDeleteOption}
                    onDeleteQuestion={handleDeleteQuestion}
                    onDeleteTag={handleDeleteTag}
                    onMoveOption={handleMoveOption}
                    onMoveQuestion={handleMoveQuestion}
                    onSaveOption={handleSaveOption}
                    onSaveQuestion={handleSaveQuestion}
                    onSaveTag={handleSaveTag}
                    question={question}
                    questionLocator={formatQuestionLocator(survey, question)}
                    tagPresets={tagPresets}
                  />
                  <label className="question-page-move-control">
                    Move to page
                    <select
                      disabled={isSubmitting || survey.status !== "draft"}
                      onChange={(event) =>
                        void handleChangeQuestionPage(question, Number(event.target.value))
                      }
                      value={question.pageId}
                    >
                      {survey.pages.map((targetPage) => (
                        <option key={targetPage.id} value={targetPage.id}>
                          {targetPage.displayOrder}. {targetPage.title}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ))}
            </section>
          );
        })}
      </div>

      <div className="builder-form tag-catalog-link-panel">
        <div className="builder-section-heading">
          <div>
            <p className="eyebrow">Hidden tags</p>
            <h3>Tag catalog</h3>
            <p className="builder-heading-note">
              Tags saved on answer options register in the shared catalog automatically.
              Manage reusable keys and values on the tag catalog page.
            </p>
          </div>
          <Link className="button-link compact-button secondary-button" to="/admin/tags">
            Manage tag catalog
          </Link>
        </div>
      </div>
    </div>
  );
}
