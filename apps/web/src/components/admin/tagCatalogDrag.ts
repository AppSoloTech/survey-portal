export type TagCatalogDragData =
  | { groupId: number; type: "group" }
  | { groupId: number | null; type: "groupdrop" }
  | { groupId: number | null; type: "tag" }
  | undefined;

export type TagCatalogDragOutcome =
  | { groupIds: number[]; type: "reorder-groups" }
  | { groupId: number | null; tagIds: number[]; type: "reorder-tags" }
  | { displayOrder: number; groupId: number | null; tagId: number; type: "move-tag" }
  | null;

export function resolveOverTagGroupId(overData: TagCatalogDragData): number | null | undefined {
  if (
    overData &&
    (overData.type === "group" || overData.type === "groupdrop" || overData.type === "tag")
  ) {
    return overData.groupId;
  }

  return undefined;
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
  groupIds: number[];
  overData: TagCatalogDragData;
  overId: string;
  tagIdsByGroup: Map<number | null, number[]>;
}): TagCatalogDragOutcome {
  const { activeData, activeId, groupIds, overData, overId, tagIdsByGroup } = input;
  const overGroupId = resolveOverTagGroupId(overData);

  if (!activeData || overGroupId === undefined) {
    return null;
  }

  if (activeData.type === "group") {
    const oldIndex = groupIds.indexOf(activeData.groupId);
    const newIndex = overGroupId === null ? -1 : groupIds.indexOf(overGroupId);

    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
      return null;
    }

    return { groupIds: moveItem(groupIds, oldIndex, newIndex), type: "reorder-groups" };
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
