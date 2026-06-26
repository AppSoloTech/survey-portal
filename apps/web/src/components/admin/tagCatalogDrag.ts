export type TagCatalogDragData =
  | { groupId: number | null; sectionId: string; type: "section" }
  | { groupId: number | null; type: "groupdrop" }
  | { groupId: number | null; type: "tag" }
  | undefined;

export type TagCatalogDragOutcome =
  | { sectionIds: string[]; type: "reorder-sections" }
  | { groupId: number | null; tagIds: number[]; type: "reorder-tags" }
  | { displayOrder: number; groupId: number | null; tagId: number; type: "move-tag" }
  | null;

export function resolveOverTagGroupId(overData: TagCatalogDragData): number | null | undefined {
  if (
    overData &&
    (overData.type === "section" || overData.type === "groupdrop" || overData.type === "tag")
  ) {
    return overData.groupId;
  }

  return undefined;
}

function resolveOverSectionId(overData: TagCatalogDragData): string | undefined {
  if (!overData) {
    return undefined;
  }

  if (overData.type === "section") {
    return overData.sectionId;
  }

  if (overData.type === "groupdrop" || overData.type === "tag") {
    return getCatalogSectionId(overData.groupId);
  }

  return undefined;
}

export function getCatalogSectionId(groupId: number | null): string {
  return groupId === null ? "ungrouped" : `group:${groupId}`;
}

export function parseCatalogEntityId(id: string): number {
  return Number(id.slice(id.indexOf(":") + 1));
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function resolveTagCatalogDragOutcome(input: {
  activeData: TagCatalogDragData;
  activeId: string;
  overData: TagCatalogDragData;
  overId: string;
  sectionIds: string[];
  tagIdsByGroup: Map<number | null, number[]>;
}): TagCatalogDragOutcome {
  const { activeData, activeId, overData, overId, sectionIds, tagIdsByGroup } = input;
  const overGroupId = resolveOverTagGroupId(overData);

  if (!activeData || overGroupId === undefined) {
    return null;
  }

  if (activeData.type === "section") {
    const overSectionId = resolveOverSectionId(overData);
    const oldIndex = sectionIds.indexOf(activeData.sectionId);
    const newIndex = overSectionId === undefined ? -1 : sectionIds.indexOf(overSectionId);

    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
      return null;
    }

    return {
      sectionIds: moveItem(sectionIds, oldIndex, newIndex),
      type: "reorder-sections"
    };
  }

  if (activeData.type === "tag") {
    const tagId = parseCatalogEntityId(activeId);
    const sourceGroupId = activeData.groupId;
    const targetTags = tagIdsByGroup.get(overGroupId) ?? [];
    const overIndex =
      overData?.type === "tag" ? targetTags.indexOf(parseCatalogEntityId(overId)) : -1;
    const targetIndex = overIndex >= 0 ? overIndex : targetTags.length;

    if (overGroupId === sourceGroupId) {
      const oldIndex = targetTags.indexOf(tagId);

      if (oldIndex < 0 || oldIndex === targetIndex) {
        return null;
      }

      return {
        groupId: sourceGroupId,
        tagIds: moveItem(targetTags, oldIndex, targetIndex),
        type: "reorder-tags"
      };
    }

    return {
      displayOrder: targetIndex + 1,
      groupId: overGroupId,
      tagId,
      type: "move-tag"
    };
  }

  return null;
}
