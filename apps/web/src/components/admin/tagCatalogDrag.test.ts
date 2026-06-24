import { describe, expect, it } from "vitest";

import { resolveTagCatalogDragOutcome } from "./tagCatalogDrag.js";

describe("resolveTagCatalogDragOutcome", () => {
  it("reorders groups", () => {
    const result = resolveTagCatalogDragOutcome({
      activeData: { groupId: 1, type: "group" },
      activeId: "group:1",
      groupIds: [1, 2, 3],
      overData: { groupId: 3, type: "group" },
      overId: "group:3",
      tagIdsByGroup: new Map()
    });

    expect(result).toEqual({ groupIds: [2, 3, 1], type: "reorder-groups" });
  });

  it("reorders tags within a group", () => {
    const result = resolveTagCatalogDragOutcome({
      activeData: { groupId: 4, type: "tag" },
      activeId: "tag:10",
      groupIds: [4],
      overData: { groupId: 4, type: "tag" },
      overId: "tag:12",
      tagIdsByGroup: new Map([[4, [10, 11, 12]]])
    });

    expect(result).toEqual({ groupId: 4, tagIds: [11, 12, 10], type: "reorder-tags" });
  });

  it("moves tags between groups with one-based display order", () => {
    const result = resolveTagCatalogDragOutcome({
      activeData: { groupId: null, type: "tag" },
      activeId: "tag:10",
      groupIds: [4],
      overData: { groupId: 4, type: "tag" },
      overId: "tag:12",
      tagIdsByGroup: new Map<number | null, number[]>([
        [null, [10]],
        [4, [11, 12]]
      ])
    });

    expect(result).toEqual({ displayOrder: 2, groupId: 4, tagId: 10, type: "move-tag" });
  });

  it("moves tags to the ungrouped holding area", () => {
    const result = resolveTagCatalogDragOutcome({
      activeData: { groupId: 4, type: "tag" },
      activeId: "tag:10",
      groupIds: [4],
      overData: { groupId: null, type: "groupdrop" },
      overId: "groupdrop:ungrouped",
      tagIdsByGroup: new Map<number | null, number[]>([
        [null, [20, 21]],
        [4, [10]]
      ])
    });

    expect(result).toEqual({ displayOrder: 3, groupId: null, tagId: 10, type: "move-tag" });
  });
});
