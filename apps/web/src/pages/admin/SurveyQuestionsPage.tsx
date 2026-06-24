import type {
  AnswerOption,
  SurveyPage,
  SurveyQuestion,
  SurveyQuestionType,
  TagDefinition
} from "@survey-portal/shared";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";

import {
  createAnswerOption,
  createAnswerTag,
  createQuestionOtherTag,
  createQuestionValueTag,
  createQuestion,
  deleteAnswerOption,
  deleteAnswerTag,
  deleteQuestionOtherTag,
  deleteQuestionValueTag,
  deleteQuestion,
  reorderAnswerOptions,
  reorderQuestions,
  updateAnswerOption,
  updateAnswerTag,
  updateQuestionOtherTag,
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
import { PageSwitcher } from "../../components/admin/PageSwitcher.js";
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
  const location = useLocation();
  const [newQuestionType, setNewQuestionType] = useState<SurveyQuestionType>("text");
  // The Questions tab edits one page at a time. activePageId tracks which page;
  // page reordering, cross-page moves, and page add/delete live on the Organize
  // tab so this view stays focused on a single page's content. The Organize tab's
  // "Open in Questions" link passes a pageId via router state to pre-select it.
  const [activePageId, setActivePageId] = useState<number | null>(() => {
    const requested = (location.state as { pageId?: number } | null)?.pageId;

    return requested && survey.pages.some((page) => page.id === requested)
      ? requested
      : survey.pages[0]?.id ?? null;
  });
  const [catalogTags, setCatalogTags] = useState<TagDefinition[]>([]);

  // Keep the active page valid when pages change (reordered, deleted, or the
  // workspace switched to a different survey). Falls back to the first page.
  useEffect(() => {
    setActivePageId((current) =>
      current && survey.pages.some((page) => page.id === current)
        ? current
        : survey.pages[0]?.id ?? null
    );
  }, [survey.pages]);

  // The Add-question form remounts (clearing its uncontrolled fields) when the
  // active page changes; reset the controlled question type to match so a
  // half-configured question never carries over to a different page.
  useEffect(() => {
    setNewQuestionType("text");
  }, [activePageId]);

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

  const questionCountByPage = useMemo(() => {
    const counts = new Map<number, number>();
    for (const question of survey.questions) {
      counts.set(question.pageId, (counts.get(question.pageId) ?? 0) + 1);
    }
    return counts;
  }, [survey.questions]);

  const activePage = survey.pages.find((page) => page.id === activePageId) ?? null;
  const pageQuestions = activePage
    ? survey.questions.filter((question) => question.pageId === activePage.id)
    : [];

  async function handleAddQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (survey.status !== "draft") {
      setFeedback({ error: "Questions can only be added to draft surveys", notice: null });
      return;
    }

    if (!activePageId) {
      setFeedback({ error: "Add a page on the Organize tab before adding a question", notice: null });
      return;
    }

    const form = event.currentTarget;
    const data = new FormData(form);
    const questionType = readQuestionType(data, "questionType");

    const didSave = await runSurveyMutation(
      () =>
        createQuestion({
          surveyId: survey.id,
          pageId: activePageId,
          questionText: readFormText(data, "questionText"),
          questionType,
          scaleMin: questionType === "scale" ? readFormInteger(data, "scaleMin") : null,
          scaleMax: questionType === "scale" ? readFormInteger(data, "scaleMax") : null,
          isRequired: data.get("isRequired") === "on",
          helpText: readNullableFormText(data, "helpText"),
          allowOther: supportsOther(questionType) && data.get("allowOther") === "on"
        }),
      "Question added"
    );

    if (didSave) {
      form.reset();
      setNewQuestionType("text");
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
          helpText: readNullableFormText(data, "helpText"),
          allowOther: supportsOther(questionType) && data.get("allowOther") === "on"
        }),
      `${formatQuestionLocator(survey, question)} saved`
    );
  }

  async function handleMoveQuestion(questionId: number, direction: -1 | 1) {
    const question = survey.questions.find((item) => item.id === questionId);

    if (!question) {
      return;
    }

    const pageQuestionIds = survey.questions
      .filter((item) => item.pageId === question.pageId)
      .map((item) => item.id);
    const index = pageQuestionIds.indexOf(questionId);
    const nextIndex = index + direction;

    if (index < 0 || nextIndex < 0 || nextIndex >= pageQuestionIds.length) {
      return;
    }

    const reordered = [...pageQuestionIds];
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

  async function handleAddOtherTag(event: FormEvent<HTMLFormElement>, question: SurveyQuestion) {
    event.preventDefault();

    const form = event.currentTarget;
    const data = new FormData(form);

    const didSave = await runSurveyMutation(
      () =>
        createQuestionOtherTag({
          surveyId: survey.id,
          questionId: question.id,
          tagKey: readFormText(data, "tagKey"),
          tagValue: readFormText(data, "tagValue")
        }),
      "Other hidden tag added"
    );

    if (didSave) {
      form.reset();
    }
  }

  async function handleSaveOtherTag(
    event: FormEvent<HTMLFormElement>,
    question: SurveyQuestion,
    tagId: number
  ) {
    event.preventDefault();

    const data = new FormData(event.currentTarget);

    await runSurveyMutation(
      () =>
        updateQuestionOtherTag({
          surveyId: survey.id,
          questionId: question.id,
          tagId,
          tagKey: readFormText(data, "tagKey"),
          tagValue: readFormText(data, "tagValue")
        }),
      "Other hidden tag saved"
    );
  }

  async function handleDeleteOtherTag(question: SurveyQuestion, tagId: number) {
    const tag = question.otherTags?.find((item) => item.id === tagId);

    if (
      !confirmAdminAction(
        `Remove Other hidden tag "${tag ? `${tag.tagKey}: ${tag.tagValue}` : "from this question"}"?`
      )
    ) {
      return;
    }

    await runSurveyMutation(
      () =>
        deleteQuestionOtherTag({
          surveyId: survey.id,
          questionId: question.id,
          tagId
        }),
      "Other hidden tag removed"
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

  const isDraft = survey.status === "draft";

  return (
    <div className="builder-workspace">
      <PageSwitcher
        activePageId={activePageId}
        onSelect={setActivePageId}
        pages={survey.pages}
        questionCountByPage={questionCountByPage}
      />

      {activePage ? (
        <>
          <form
            className="builder-form"
            key={`page-meta-${activePage.id}`}
            onSubmit={(event) => void handleSavePage(event, activePage)}
          >
            <div className="builder-section-heading">
              <div>
                <p className="eyebrow">Page {activePage.displayOrder}</p>
                <h3>{activePage.title}</h3>
                <p className="builder-heading-note">
                  Editing one page at a time. Reorder pages and move questions between pages
                  on the Organize tab.
                </p>
              </div>
            </div>
            <div className="builder-grid two-columns">
              <label>
                Page title
                <input
                  defaultValue={activePage.title}
                  disabled={!isDraft}
                  name="title"
                  required
                />
              </label>
              <label>
                Description
                <input
                  defaultValue={activePage.description ?? ""}
                  disabled={!isDraft}
                  name="description"
                  placeholder="Optional text shown at the top of this page"
                />
              </label>
            </div>
            <button
              className="button-link compact-button primary-button"
              disabled={isSubmitting || !isDraft}
              type="submit"
            >
              Save page
            </button>
          </form>

          <form
            className="builder-form"
            key={`add-question-${survey.id}-${activePage.id}`}
            onSubmit={handleAddQuestion}
          >
            <div className="builder-section-heading">
              <div>
                <p className="eyebrow">Questions</p>
                <h3>Add question to {activePage.title}</h3>
                {!isDraft ? (
                  <p className="builder-heading-note">
                    New questions can only be added while the survey is a draft.
                  </p>
                ) : null}
              </div>
            </div>
            <label>
              Question text
              <input disabled={!isDraft} name="questionText" required />
            </label>
            <div className="builder-grid two-columns">
              <label>
                Type
                <select
                  disabled={!isDraft}
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
            {newQuestionType === "scale" ? <ScaleRangeFields disabled={!isDraft} /> : null}
            <label>
              Help text
              <input disabled={!isDraft} name="helpText" />
            </label>
            <label className="checkbox-label">
              <input defaultChecked disabled={!isDraft} name="isRequired" type="checkbox" />
              Required
            </label>
            {supportsOther(newQuestionType) ? (
              <label className="checkbox-label">
                <input disabled={!isDraft} name="allowOther" type="checkbox" />
                Allow Other
              </label>
            ) : null}
            <button
              className="button-link compact-button primary-button"
              disabled={isSubmitting || !isDraft}
              type="submit"
            >
              Add question
            </button>
          </form>

          <div className="builder-stack">
            {pageQuestions.length === 0 ? (
              <div className="builder-empty-state">
                <strong>No questions on this page</strong>
                <span>Add the first question above.</span>
              </div>
            ) : null}

            {pageQuestions.map((question, index) => (
              <div className="page-question-shell" key={question.id}>
                <QuestionEditor
                  isFirst={index === 0}
                  isLast={index === pageQuestions.length - 1}
                  isPublished={!isDraft}
                  isSubmitting={isSubmitting}
                  onAddOption={handleAddOption}
                  onAddOtherTag={handleAddOtherTag}
                  onAddTag={handleAddTag}
                  onAddValueTag={handleAddValueTag}
                  onDeleteOtherTag={handleDeleteOtherTag}
                  onDeleteValueTag={handleDeleteValueTag}
                  onDeleteOption={handleDeleteOption}
                  onDeleteQuestion={handleDeleteQuestion}
                  onDeleteTag={handleDeleteTag}
                  onMoveOption={handleMoveOption}
                  onMoveQuestion={handleMoveQuestion}
                  onSaveOption={handleSaveOption}
                  onSaveOtherTag={handleSaveOtherTag}
                  onSaveQuestion={handleSaveQuestion}
                  onSaveTag={handleSaveTag}
                  question={question}
                  questionLocator={formatQuestionLocator(survey, question)}
                  tagPresets={tagPresets}
                />
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="builder-empty-state">
          <strong>No pages yet</strong>
          <span>
            Add the first page on the Organize tab. Published surveys need at least one page
            and one question before they make sense for users.
          </span>
          <div className="inline-actions">
            <Link className="button-link compact-button primary-button" to="../organize">
              Go to Organize
            </Link>
          </div>
        </div>
      )}

      <div className="builder-form tag-catalog-link-panel">
        <div className="builder-section-heading">
          <div>
            <p className="eyebrow">Hidden tags</p>
            <h3>Tag catalog</h3>
            <p className="builder-heading-note">
              Tags saved on answer options register in the shared catalog automatically.
              Manage reusable categories and values on the tag catalog page.
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

function supportsOther(questionType: SurveyQuestionType): boolean {
  return questionType === "single_select" || questionType === "multi_select";
}
