// Pure decision logic for the Organize board's drag-and-drop. Kept free of
// @dnd-kit and React so the index math (same-page reorder vs cross-page move,
// and the server's 1-based displayOrder) can be unit tested in isolation.

export type OrganizeDragData =
  | { pageId: number; type: "page" }
  | { pageId: number; type: "pagedrop" }
  | { pageId: number; type: "question" }
  | undefined;

export type OrganizeDragOutcome =
  | { pageIds: number[]; type: "reorder-pages" }
  | { pageId: number; questionIds: number[]; type: "reorder-questions" }
  | { displayOrder: number; pageId: number; questionId: number; type: "move-question" }
  | null;

// The page a drop landed in, from any of the board's droppable kinds.
export function resolveOverPageId(overData: OrganizeDragData): number | null {
  if (
    overData &&
    (overData.type === "page" || overData.type === "pagedrop" || overData.type === "question")
  ) {
    return overData.pageId;
  }

  return null;
}

// Numeric id from a namespaced sortable id, e.g. "q:5" -> 5, "page:3" -> 3.
export function parseEntityId(id: string): number {
  return Number(id.slice(id.indexOf(":") + 1));
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function resolveDragOutcome(input: {
  activeData: OrganizeDragData;
  activeId: string;
  overData: OrganizeDragData;
  overId: string;
  pageIds: number[];
  questionIdsByPage: Map<number, number[]>;
}): OrganizeDragOutcome {
  const { activeData, activeId, overData, pageIds, questionIdsByPage } = input;
  const overPageId = resolveOverPageId(overData);

  if (!activeData || overPageId === null) {
    return null;
  }

  if (activeData.type === "page") {
    const oldIndex = pageIds.indexOf(activeData.pageId);
    const newIndex = pageIds.indexOf(overPageId);

    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
      return null;
    }

    return { pageIds: moveItem(pageIds, oldIndex, newIndex), type: "reorder-pages" };
  }

  if (activeData.type === "question") {
    const questionId = parseEntityId(activeId);
    const sourcePageId = activeData.pageId;
    const targetQuestions = questionIdsByPage.get(overPageId) ?? [];
    const overIndex =
      overData?.type === "question"
        ? targetQuestions.indexOf(parseEntityId(input.overId))
        : -1;
    const targetIndex = overIndex >= 0 ? overIndex : targetQuestions.length;

    if (overPageId === sourcePageId) {
      const oldIndex = targetQuestions.indexOf(questionId);

      if (oldIndex < 0 || oldIndex === targetIndex) {
        return null;
      }

      return {
        pageId: sourcePageId,
        questionIds: moveItem(targetQuestions, oldIndex, targetIndex),
        type: "reorder-questions"
      };
    }

    // Cross-page move. displayOrder is 1-based on the server, so the zero-based
    // drop index becomes targetIndex + 1.
    return {
      displayOrder: targetIndex + 1,
      pageId: overPageId,
      questionId,
      type: "move-question"
    };
  }

  return null;
}
