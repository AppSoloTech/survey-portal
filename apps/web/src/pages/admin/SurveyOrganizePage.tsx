import type { SurveyPage, SurveyQuestion } from "@survey-portal/shared";
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
import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import {
  createSurveyPage,
  deleteSurveyPage,
  deleteQuestion,
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

// The Organize tab: a low-clutter drag-and-drop board for arranging survey
// structure. Reorder pages, reorder questions within a page, and drag a
// question into another page — all on existing endpoints. Heavy question
// editing stays on the Questions tab.
export function SurveyOrganizePage() {
  const { isSubmitting, runSurveyMutation, survey } = useSurveyWorkspace();
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

      {survey.pages.length === 0 ? (
        <div className="builder-empty-state">
          <strong>No pages yet</strong>
          <span>Add the first page above to start building this survey.</span>
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
