import { describe, expect, it } from "vitest";

import {
  parseEntityId,
  resolveDragOutcome,
  resolveOverPageId,
  type OrganizeDragData
} from "./organizeDrag.js";

// Page 1 has questions [10, 11, 12]; page 2 has [20, 21]; page 3 is empty.
const pageIds = [1, 2, 3];
const questionIdsByPage = new Map<number, number[]>([
  [1, [10, 11, 12]],
  [2, [20, 21]],
  [3, []]
]);

function pageData(pageId: number): OrganizeDragData {
  return { pageId, type: "page" };
}

function questionData(pageId: number): OrganizeDragData {
  return { pageId, type: "question" };
}

describe("parseEntityId", () => {
  it("extracts the numeric id from a namespaced id", () => {
    expect(parseEntityId("q:10")).toBe(10);
    expect(parseEntityId("page:3")).toBe(3);
    expect(parseEntityId("pagedrop:2")).toBe(2);
  });
});

describe("resolveOverPageId", () => {
  it("returns the page id for every droppable kind", () => {
    expect(resolveOverPageId({ pageId: 2, type: "page" })).toBe(2);
    expect(resolveOverPageId({ pageId: 2, type: "pagedrop" })).toBe(2);
    expect(resolveOverPageId({ pageId: 2, type: "question" })).toBe(2);
  });

  it("returns null for unknown data", () => {
    expect(resolveOverPageId(undefined)).toBeNull();
  });
});

describe("resolveDragOutcome — pages", () => {
  it("reorders pages when a page is dropped over another page", () => {
    const outcome = resolveDragOutcome({
      activeData: pageData(1),
      activeId: "page:1",
      overData: pageData(3),
      overId: "page:3",
      pageIds,
      questionIdsByPage
    });

    expect(outcome).toEqual({ pageIds: [2, 3, 1], type: "reorder-pages" });
  });

  it("ignores a page dropped onto itself", () => {
    const outcome = resolveDragOutcome({
      activeData: pageData(2),
      activeId: "page:2",
      overData: pageData(2),
      overId: "page:2",
      pageIds,
      questionIdsByPage
    });

    expect(outcome).toBeNull();
  });
});

describe("resolveDragOutcome — questions within a page", () => {
  it("reorders questions when dropped over a sibling", () => {
    const outcome = resolveDragOutcome({
      activeData: questionData(1),
      activeId: "q:10",
      overData: questionData(1),
      overId: "q:12",
      pageIds,
      questionIdsByPage
    });

    expect(outcome).toEqual({
      pageId: 1,
      questionIds: [11, 12, 10],
      type: "reorder-questions"
    });
  });

  it("ignores a drop onto the same position", () => {
    const outcome = resolveDragOutcome({
      activeData: questionData(1),
      activeId: "q:10",
      overData: questionData(1),
      overId: "q:10",
      pageIds,
      questionIdsByPage
    });

    expect(outcome).toBeNull();
  });
});

describe("resolveDragOutcome — cross-page moves (1-based displayOrder)", () => {
  it("moves a question to the position of the question it was dropped over", () => {
    const outcome = resolveDragOutcome({
      activeData: questionData(1),
      activeId: "q:10",
      overData: questionData(2),
      overId: "q:21", // index 1 in page 2 -> displayOrder 2
      pageIds,
      questionIdsByPage
    });

    expect(outcome).toEqual({
      displayOrder: 2,
      pageId: 2,
      questionId: 10,
      type: "move-question"
    });
  });

  it("appends to the end when dropped on an empty page body", () => {
    const outcome = resolveDragOutcome({
      activeData: questionData(1),
      activeId: "q:10",
      overData: { pageId: 3, type: "pagedrop" },
      overId: "pagedrop:3",
      pageIds,
      questionIdsByPage
    });

    expect(outcome).toEqual({
      displayOrder: 1,
      pageId: 3,
      questionId: 10,
      type: "move-question"
    });
  });

  it("appends to the end when dropped on a page header", () => {
    const outcome = resolveDragOutcome({
      activeData: questionData(1),
      activeId: "q:10",
      overData: pageData(2),
      overId: "page:2", // not a question -> end of page 2 (length 2) -> displayOrder 3
      pageIds,
      questionIdsByPage
    });

    expect(outcome).toEqual({
      displayOrder: 3,
      pageId: 2,
      questionId: 10,
      type: "move-question"
    });
  });
});

describe("resolveDragOutcome — guards", () => {
  it("returns null when the drop target is unknown", () => {
    const outcome = resolveDragOutcome({
      activeData: questionData(1),
      activeId: "q:10",
      overData: undefined,
      overId: "",
      pageIds,
      questionIdsByPage
    });

    expect(outcome).toBeNull();
  });
});
