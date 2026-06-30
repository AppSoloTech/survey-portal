import type {
  SurveyPage,
  SurveyPageTemplateSummary,
  SurveyQuestion
} from "@survey-portal/shared";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import {
  createSurveyPage,
  deleteSurveyPage,
  deleteQuestion,
  fetchPageTemplates,
  insertPageTemplate,
  moveQuestionToPage,
  reorderQuestions,
  reorderSurveyPages
} from "../../api/surveys.js";
import {
  confirmAdminAction,
  readFormText,
  readNullableFormText
} from "../../components/admin/builderForm.js";
import { OrganizeQuestionRow } from "../../components/admin/OrganizeQuestionRow.js";
import {
  resolveDragOutcome,
  type OrganizeDragData
} from "../../components/admin/organizeDrag.js";
import { formatQuestionLocator } from "../../components/admin/SurveyBuilderComponents.js";
import { useSurveyWorkspace } from "./SurveyWorkspaceLayout.js";

type ActiveDrag = { label: string; type: "page" | "question" } | null;
const insertAtEndValue = "end";
const insertAtBeginningValue = "1";

// The Organize tab: a low-clutter drag-and-drop board for arranging survey
// structure. Reorder pages, reorder questions within a page, and drag a
// question into another page — all on existing endpoints. Heavy question
// editing stays on the Questions tab.
export function SurveyOrganizePage() {
  const { isSubmitting, runSurveyMutation, setFeedback, survey } = useSurveyWorkspace();
  const isDraft = survey.status === "draft";

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const [activeDrag, setActiveDrag] = useState<ActiveDrag>(null);
  // Collapsing a page hides its question rows so long pages don't make page
  // reordering unwieldy. Purely a view concern — available even on locked
  // surveys. Stale ids for deleted pages are harmless.
  const [collapsedPageIds, setCollapsedPageIds] = useState<Set<number>>(new Set());
  const [templates, setTemplates] = useState<SurveyPageTemplateSummary[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [selectedInsertPosition, setSelectedInsertPosition] = useState(insertAtEndValue);
  const [isTemplateListLoading, setIsTemplateListLoading] = useState(false);
  const pageTemplateRefreshId = useRef(0);

  const refreshTemplates = useCallback(async (options: { silent?: boolean } = {}) => {
    const refreshId = pageTemplateRefreshId.current + 1;
    pageTemplateRefreshId.current = refreshId;
    setIsTemplateListLoading(true);

    try {
      const response = await fetchPageTemplates();

      if (pageTemplateRefreshId.current !== refreshId) {
        return;
      }

      setTemplates(response.templates);
      setSelectedTemplateId((current) =>
        current && response.templates.some((template) => String(template.id) === current)
          ? current
          : String(response.templates[0]?.id ?? "")
      );
    } catch (error) {
      if (pageTemplateRefreshId.current !== refreshId) {
        return;
      }

      setTemplates([]);
      setSelectedTemplateId("");

      if (!options.silent) {
        setFeedback({
          error: error instanceof Error ? error.message : "Could not load page templates",
          notice: null
        });
      }
    } finally {
      if (pageTemplateRefreshId.current === refreshId) {
        setIsTemplateListLoading(false);
      }
    }
  }, [setFeedback]);

  useEffect(() => {
    let isActive = true;

    void refreshTemplates({ silent: true }).finally(() => {
      if (!isActive) {
        return;
      }
    });

    function handleFocus() {
      if (isActive) {
        void refreshTemplates({ silent: true });
      }
    }

    window.addEventListener("focus", handleFocus);

    return () => {
      isActive = false;
      window.removeEventListener("focus", handleFocus);
    };
  }, [refreshTemplates]);

  useEffect(() => {
    if (templates.length === 0) {
      setSelectedTemplateId("");
      return;
    }

    setSelectedTemplateId((current) =>
      current && templates.some((template) => String(template.id) === current)
        ? current
        : String(templates[0].id)
    );
  }, [templates]);

  useEffect(() => {
    setFeedback({ error: null, notice: null });
  }, [selectedTemplateId, setFeedback]);

  useEffect(() => {
    setSelectedInsertPosition((current) =>
      current === insertAtEndValue || insertPositionOptions(survey.pages).some((option) => option.value === current)
        ? current
        : insertAtEndValue
    );
  }, [survey.pages]);

  async function handleRefreshTemplates() {
    await refreshTemplates();
  }

  function toggleCollapse(pageId: number) {
    setCollapsedPageIds((current) => {
      const next = new Set(current);

      if (next.has(pageId)) {
        next.delete(pageId);
      } else {
        next.add(pageId);
      }

      return next;
    });
  }

  const allCollapsed =
    survey.pages.length > 0 && survey.pages.every((page) => collapsedPageIds.has(page.id));

  function toggleCollapseAll() {
    setCollapsedPageIds(allCollapsed ? new Set() : new Set(survey.pages.map((page) => page.id)));
  }

  // survey.questions arrives flattened and ordered by page then displayOrder,
  // so each page's list is already in display order.
  const questionsByPage = useMemo(() => {
    const map = new Map<number, SurveyQuestion[]>();
    for (const page of survey.pages) {
      map.set(page.id, []);
    }
    for (const question of survey.questions) {
      map.get(question.pageId)?.push(question);
    }
    return map;
  }, [survey.pages, survey.questions]);

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

  async function handleDeletePage(page: SurveyPage) {
    if (!confirmAdminAction(`Delete "${page.title}"? Only empty pages can be deleted.`)) {
      return;
    }

    await runSurveyMutation(
      () => deleteSurveyPage({ surveyId: survey.id, pageId: page.id }),
      "Page deleted"
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
      () => deleteQuestion({ surveyId: survey.id, questionId }),
      "Question deleted"
    );
  }

  async function handleInsertTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (survey.status !== "draft") {
      setFeedback({ error: "Templates can only be inserted into draft assessments", notice: null });
      return;
    }

    const templateId = Number(selectedTemplateId);

    if (!Number.isSafeInteger(templateId) || templateId <= 0) {
      setFeedback({ error: "Choose a page template to insert", notice: null });
      return;
    }

    await runSurveyMutation(
      () =>
        insertPageTemplate({
          surveyId: survey.id,
          templateId,
          displayOrder:
            selectedInsertPosition === insertAtEndValue
              ? null
              : Number(selectedInsertPosition)
        }),
      "Template inserted"
    );
  }

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as
      | { pageId?: number; type?: string }
      | undefined;

    if (data?.type === "page") {
      const page = survey.pages.find((item) => item.id === data.pageId);
      setActiveDrag({ label: page ? `Page ${page.displayOrder}. ${page.title}` : "Page", type: "page" });
      return;
    }

    if (data?.type === "question") {
      const question = survey.questions.find(
        (item) => item.id === Number(String(event.active.id).slice(2))
      );
      setActiveDrag({ label: question?.questionText ?? "Question", type: "question" });
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDrag(null);

    // Ignore drops while a reorder/move is already persisting — a second drag
    // would submit from a stale survey snapshot and race the in-flight request.
    if (!isDraft || isSubmitting) {
      return;
    }

    const { active, over } = event;

    if (!over) {
      return;
    }

    const questionIdsByPage = new Map<number, number[]>();
    for (const [pageId, questions] of questionsByPage) {
      questionIdsByPage.set(
        pageId,
        questions.map((question) => question.id)
      );
    }

    const outcome = resolveDragOutcome({
      activeData: active.data.current as OrganizeDragData,
      activeId: String(active.id),
      overData: over.data.current as OrganizeDragData,
      overId: String(over.id),
      pageIds: survey.pages.map((page) => page.id),
      questionIdsByPage
    });

    if (!outcome) {
      return;
    }

    if (outcome.type === "reorder-pages") {
      void runSurveyMutation(
        () => reorderSurveyPages({ surveyId: survey.id, pageIds: outcome.pageIds }),
        "Page order saved"
      );
      return;
    }

    if (outcome.type === "reorder-questions") {
      void runSurveyMutation(
        () =>
          reorderQuestions({
            surveyId: survey.id,
            pageId: outcome.pageId,
            questionIds: outcome.questionIds
          }),
        "Question order saved"
      );
      return;
    }

    void runSurveyMutation(
      () =>
        moveQuestionToPage({
          surveyId: survey.id,
          questionId: outcome.questionId,
          pageId: outcome.pageId,
          displayOrder: outcome.displayOrder
        }),
      "Question moved"
    );
  }

  const pageItemIds = survey.pages.map((page) => `page:${page.id}`);

  return (
    <div className="builder-workspace">
      <form className="builder-form" key={`add-page-${survey.id}`} onSubmit={handleAddPage}>
        <div className="builder-section-heading">
          <div>
            <p className="eyebrow">Pages</p>
            <h3>Add page</h3>
            {isDraft ? (
              <p className="builder-heading-note">
                Drag the handles below to reorder pages, reorder questions, or move a question
                to another page.
              </p>
            ) : (
              <p className="builder-heading-note">
                This survey is locked. Create an editable draft copy to change its structure.
              </p>
            )}
          </div>
        </div>
        <div className="builder-grid two-columns">
          <label>
            Page title
            <input disabled={!isDraft} name="title" required />
          </label>
          <label>
            Description
            <input disabled={!isDraft} name="description" />
          </label>
        </div>
        <button
          className="button-link compact-button primary-button"
          disabled={isSubmitting || !isDraft}
          type="submit"
        >
          Add page
        </button>
      </form>

      <form className="builder-form" onSubmit={handleInsertTemplate}>
        <div className="builder-section-heading">
          <div>
            <p className="eyebrow">Template library</p>
            <h3>Insert saved page</h3>
            <p className="builder-heading-note">
              Inserts a fresh copy at the selected position. Conditional rules from
              the template source are not copied.
            </p>
          </div>
        </div>
        <div className="builder-grid two-columns">
          <label>
            Saved page
            <select
              disabled={!isDraft || isSubmitting || isTemplateListLoading || templates.length === 0}
              onChange={(event) => setSelectedTemplateId(event.target.value)}
              value={selectedTemplateId}
            >
              {templates.length === 0 ? (
                <option value="">
                  {isTemplateListLoading ? "Loading templates..." : "No saved templates"}
                </option>
              ) : (
                templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} · {template.questionCount}{" "}
                    {template.questionCount === 1 ? "question" : "questions"}
                  </option>
                ))
              )}
            </select>
          </label>
          <label>
            Insert position
            <select
              disabled={!isDraft || isSubmitting || survey.pages.length === 0}
              onChange={(event) => setSelectedInsertPosition(event.target.value)}
              value={selectedInsertPosition}
            >
              {insertPositionOptions(survey.pages).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="template-library-summary">
            {selectedTemplateId ? (
              <TemplateSummary template={templates.find((template) => String(template.id) === selectedTemplateId) ?? null} />
            ) : (
              <span className="builder-heading-note">Save a page from the Questions tab first.</span>
            )}
          </div>
        </div>
        <div className="inline-actions">
          <button
            className="button-link compact-button secondary-button"
            disabled={isSubmitting || !isDraft || !selectedTemplateId}
            type="submit"
          >
            Insert template
          </button>
          <button
            className="button-link compact-button ghost-button"
            disabled={isSubmitting || isTemplateListLoading}
            onClick={() => void handleRefreshTemplates()}
            type="button"
          >
            Refresh templates
          </button>
        </div>
      </form>

      {survey.pages.length === 0 ? (
        <div className="builder-empty-state">
          <strong>No pages yet</strong>
          <span>Add the first page above to start building this assessment.</span>
        </div>
      ) : (
        <DndContext
          collisionDetection={closestCorners}
          onDragCancel={() => setActiveDrag(null)}
          onDragEnd={handleDragEnd}
          onDragStart={handleDragStart}
          sensors={sensors}
        >
          <div className="organize-board-toolbar">
            <span className="builder-heading-note">
              {survey.pages.length} {survey.pages.length === 1 ? "page" : "pages"}
            </span>
            <button
              className="button-link compact-button ghost-button"
              onClick={toggleCollapseAll}
              type="button"
            >
              {allCollapsed ? "Expand all" : "Collapse all"}
            </button>
          </div>
          <SortableContext items={pageItemIds} strategy={verticalListSortingStrategy}>
            <div className="organize-board">
              {survey.pages.map((page) => {
                const questions = questionsByPage.get(page.id) ?? [];

                return (
                  <SortablePageCard
                    canDelete={questions.length === 0 && survey.pages.length > 1}
                    collapsed={collapsedPageIds.has(page.id)}
                    disabled={!isDraft || isSubmitting}
                    isSubmitting={isSubmitting}
                    key={page.id}
                    onDeletePage={handleDeletePage}
                    onDeleteQuestion={handleDeleteQuestion}
                    onToggleCollapse={toggleCollapse}
                    page={page}
                    questionLocator={(question) => formatQuestionLocator(survey, question)}
                    questions={questions}
                  />
                );
              })}
            </div>
          </SortableContext>
          <DragOverlay>
            {activeDrag ? (
              <div className={`organize-drag-overlay ${activeDrag.type}`}>{activeDrag.label}</div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}

function insertPositionOptions(pages: SurveyPage[]): { label: string; value: string }[] {
  return [
    { label: "At beginning", value: insertAtBeginningValue },
    ...pages.map((page) => ({
      label: `After page ${page.displayOrder}: ${page.title}`,
      value: String(page.displayOrder + 1)
    })),
    { label: "At end", value: insertAtEndValue }
  ];
}

function TemplateSummary({ template }: { template: SurveyPageTemplateSummary | null }) {
  if (!template) {
    return <span className="builder-heading-note">Template details unavailable.</span>;
  }

  return (
    <div className="template-summary-inline">
      <span>
        From {template.sourceSurveyTitle ?? "an assessment"}
        {template.sourcePageTitle ? ` / ${template.sourcePageTitle}` : ""}
      </span>
      {template.excludedLogicCount > 0 ? (
        <strong>
          {template.excludedLogicCount} conditional{" "}
          {template.excludedLogicCount === 1 ? "rule" : "rules"} not copied
        </strong>
      ) : (
        <span>No conditional rules recorded</span>
      )}
    </div>
  );
}

function SortablePageCard({
  canDelete,
  collapsed,
  disabled,
  isSubmitting,
  onDeletePage,
  onDeleteQuestion,
  onToggleCollapse,
  page,
  questionLocator,
  questions
}: {
  canDelete: boolean;
  collapsed: boolean;
  disabled: boolean;
  isSubmitting: boolean;
  onDeletePage: (page: SurveyPage) => void;
  onDeleteQuestion: (questionId: number) => void;
  onToggleCollapse: (pageId: number) => void;
  page: SurveyPage;
  questionLocator: (question: SurveyQuestion) => string;
  questions: SurveyQuestion[];
}) {
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    data: { pageId: page.id, type: "page" },
    disabled,
    id: `page:${page.id}`
  });
  // A whole-card drop target so questions can be dropped onto an empty page.
  const { setNodeRef: setDropRef } = useDroppable({
    data: { pageId: page.id, type: "pagedrop" },
    id: `pagedrop:${page.id}`
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition
  };
  const questionItemIds = questions.map((question) => `q:${question.id}`);

  return (
    <section
      className={isDragging ? "organize-page-card dragging" : "organize-page-card"}
      ref={setNodeRef}
      style={style}
    >
      <div className="organize-page-card-header">
        <button
          aria-label={`Reorder page ${page.displayOrder}`}
          className="drag-handle"
          disabled={disabled}
          type="button"
          {...attributes}
          {...listeners}
        >
          <span aria-hidden="true">⠿</span>
        </button>
        <button
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Expand ${page.title}` : `Collapse ${page.title}`}
          className="organize-collapse-toggle"
          onClick={() => onToggleCollapse(page.id)}
          type="button"
        >
          <span aria-hidden="true">{collapsed ? "▸" : "▾"}</span>
        </button>
        <div className="organize-page-card-heading">
          <p className="eyebrow">
            Page {page.displayOrder} · {questions.length}{" "}
            {questions.length === 1 ? "question" : "questions"}
          </p>
          <h3>{page.title}</h3>
        </div>
        <div className="inline-actions">
          <Link
            className="button-link compact-button secondary-button"
            state={{ pageId: page.id }}
            to="../questions"
          >
            Open in Questions
          </Link>
          <button
            className="button-link compact-button danger-button"
            disabled={!canDelete || disabled || isSubmitting}
            onClick={() => onDeletePage(page)}
            type="button"
          >
            Delete page
          </button>
        </div>
      </div>
      {collapsed ? null : (
        <div className="organize-page-card-questions" ref={setDropRef}>
          <SortableContext items={questionItemIds} strategy={verticalListSortingStrategy}>
            {questions.length === 0 ? (
              <div className="builder-empty-state compact">
                <strong>No questions on this page</strong>
                <span>Drag a question here, or add one on the Questions tab.</span>
              </div>
            ) : (
              questions.map((question) => (
                <OrganizeQuestionRow
                  disabled={disabled}
                  isSubmitting={isSubmitting}
                  key={question.id}
                  locator={questionLocator(question)}
                  onDelete={onDeleteQuestion}
                  question={question}
                />
              ))
            )}
          </SortableContext>
        </div>
      )}
    </section>
  );
}
