import type { TagCatalogGroup, TagDefinition, TagDefinitionsResponse } from "@survey-portal/shared";
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
import { useEffect, useMemo, useState, type FormEvent } from "react";

import {
  createTagDefinition,
  createTagGroup,
  deleteTagDefinition,
  deleteTagGroup,
  fetchTagDefinitions,
  moveTagDefinition,
  reorderTagCatalogSections,
  reorderTags,
  updateTagDefinition,
  updateTagGroup
} from "../../api/tags.js";
import { confirmAdminAction } from "../../components/admin/builderForm.js";
import {
  getCatalogSectionId,
  resolveTagCatalogDragOutcome,
  type TagCatalogDragData
} from "../../components/admin/tagCatalogDrag.js";
import { useToast } from "../../components/ToastProvider.js";

type ActiveDrag = { label: string; type: "group" | "tag" } | null;
const ungroupedSectionKey = "ungrouped";

type CatalogSection =
  | {
      displayOrder: number;
      groupId: null;
      key: "ungrouped";
      type: "ungrouped";
    }
  | {
      displayOrder: number;
      group: TagCatalogGroup;
      groupId: number;
      key: string;
      type: "group";
    };

export function AdminTagsPage() {
  const toast = useToast();
  const [groups, setGroups] = useState<TagCatalogGroup[]>([]);
  const [ungroupedTags, setUngroupedTags] = useState<TagDefinition[]>([]);
  const [ungroupedDisplayOrder, setUngroupedDisplayOrder] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [editingGroupName, setEditingGroupName] = useState("");
  const [newTagKey, setNewTagKey] = useState("");
  const [newTagValue, setNewTagValue] = useState("");
  const [newTagGroupId, setNewTagGroupId] = useState("");
  const [editingTagId, setEditingTagId] = useState<number | null>(null);
  const [editingTagKey, setEditingTagKey] = useState("");
  const [editingTagValue, setEditingTagValue] = useState("");
  const [editingTagGroupId, setEditingTagGroupId] = useState("");
  const [activeDrag, setActiveDrag] = useState<ActiveDrag>(null);
  const [selectedMoveTagId, setSelectedMoveTagId] = useState<number | null>(null);
  const [selectedMoveGroupId, setSelectedMoveGroupId] = useState("");
  const [collapsedSectionKeys, setCollapsedSectionKeys] = useState<Set<string>>(new Set());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const tags = useMemo(
    () => [...ungroupedTags, ...groups.flatMap((group) => group.tags)],
    [groups, ungroupedTags]
  );
  const tagIdsByGroup = useMemo(() => {
    const map = new Map<number | null, number[]>();
    map.set(
      null,
      ungroupedTags.map((tag) => tag.id)
    );
    for (const group of groups) {
      map.set(
        group.id,
        group.tags.map((tag) => tag.id)
      );
    }
    return map;
  }, [groups, ungroupedTags]);

  useEffect(() => {
    let isActive = true;

    fetchTagDefinitions()
      .then((response) => {
        if (isActive) {
          applyCatalog(response);
        }
      })
      .catch((loadError) => {
        if (isActive) {
          setError(loadError instanceof Error ? loadError.message : "Could not load tags");
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  const isDuplicateNewPair = useMemo(
    () => hasTagPair(tags, newTagKey, newTagValue, null),
    [newTagKey, newTagValue, tags]
  );
  const isDuplicateEditPair = useMemo(
    () => hasTagPair(tags, editingTagKey, editingTagValue, editingTagId),
    [editingTagId, editingTagKey, editingTagValue, tags]
  );
  const allSectionKeys = useMemo(
    () => [ungroupedSectionKey, ...groups.map((group) => getGroupSectionKey(group.id))],
    [groups]
  );
  const catalogSections = useMemo<CatalogSection[]>(
    () => {
      const sections: CatalogSection[] = [
        {
          displayOrder: ungroupedDisplayOrder,
          groupId: null,
          key: "ungrouped",
          type: "ungrouped" as const
        },
        ...groups.map((group) => ({
          displayOrder: group.displayOrder,
          group,
          groupId: group.id,
          key: getCatalogSectionId(group.id),
          type: "group" as const
        }))
      ];

      return sections.sort(compareCatalogSections);
    },
    [groups, ungroupedDisplayOrder]
  );
  const allSectionsCollapsed =
    allSectionKeys.length > 0 && allSectionKeys.every((key) => collapsedSectionKeys.has(key));

  function applyCatalog(catalog: TagDefinitionsResponse) {
    setGroups(catalog.groups);
    setUngroupedTags(catalog.ungroupedTags);
    setUngroupedDisplayOrder(catalog.ungroupedDisplayOrder);
  }

  async function refreshCatalog() {
    applyCatalog(await fetchTagDefinitions());
  }

  function startEditingTag(tag: TagDefinition) {
    setEditingTagId(tag.id);
    setSelectedMoveTagId(null);
    setEditingTagKey(tag.tagKey);
    setEditingTagValue(tag.tagValue);
    setEditingTagGroupId(tag.groupId === null ? "" : String(tag.groupId));
  }

  function startEditingGroup(group: TagCatalogGroup) {
    setEditingGroupId(group.id);
    setEditingGroupName(group.name);
  }

  async function runCatalogMutation(action: () => Promise<void>, successMessage: string) {
    setError(null);
    setIsSubmitting(true);

    try {
      await action();
      toast.success(successMessage);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Request failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCreateGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newGroupName.trim();

    await runCatalogMutation(async () => {
      await createTagGroup({ name });
      setNewGroupName("");
      await refreshCatalog();
    }, "Tag category added");
  }

  async function handleSaveGroup(event: FormEvent<HTMLFormElement>, group: TagCatalogGroup) {
    event.preventDefault();
    const name = editingGroupName.trim();

    await runCatalogMutation(async () => {
      await updateTagGroup({ groupId: group.id, name });
      setEditingGroupId(null);
      await refreshCatalog();
    }, "Tag category saved");
  }

  async function handleDeleteGroup(group: TagCatalogGroup) {
    if (
      !confirmAdminAction(
        `Delete "${group.name}"? Its tags will move back to the ungrouped catalog area.`
      )
    ) {
      return;
    }

    await runCatalogMutation(async () => {
      await deleteTagGroup({ groupId: group.id });
      await refreshCatalog();
    }, "Tag category deleted");
  }

  async function handleCreateTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await runCatalogMutation(async () => {
      await createTagDefinition({
        groupId: readGroupSelectValue(newTagGroupId),
        tagKey: newTagKey.trim(),
        tagValue: newTagValue.trim()
      });
      setNewTagKey("");
      setNewTagValue("");
      await refreshCatalog();
    }, "Tag added to the catalog");
  }

  async function handleSaveTag(event: FormEvent<HTMLFormElement>, tag: TagDefinition) {
    event.preventDefault();

    await runCatalogMutation(async () => {
      await updateTagDefinition({
        groupId: readGroupSelectValue(editingTagGroupId),
        tagId: tag.id,
        tagKey: editingTagKey.trim(),
        tagValue: editingTagValue.trim()
      });
      setEditingTagId(null);
      await refreshCatalog();
    }, "Tag saved");
  }

  function toggleSection(sectionKey: string) {
    setCollapsedSectionKeys((current) => {
      const next = new Set(current);

      if (next.has(sectionKey)) {
        next.delete(sectionKey);
      } else {
        next.add(sectionKey);
      }

      return next;
    });
  }

  function toggleAllSections() {
    setCollapsedSectionKeys(allSectionsCollapsed ? new Set() : new Set(allSectionKeys));
  }

  function startMovingTag(tag: TagDefinition) {
    setEditingTagId(null);
    setSelectedMoveTagId((current) => (current === tag.id ? null : tag.id));
    setSelectedMoveGroupId(tag.groupId === null ? "" : String(tag.groupId));
  }

  async function handleMoveSelectedTag(event: FormEvent<HTMLFormElement>, tag: TagDefinition) {
    event.preventDefault();
    const targetGroupId = readGroupSelectValue(selectedMoveGroupId);

    if (targetGroupId === tag.groupId) {
      setSelectedMoveTagId(null);
      return;
    }

    const targetTagCount = tagIdsByGroup.get(targetGroupId)?.length ?? 0;

    await runCatalogMutation(async () => {
      applyCatalog(
        await moveTagDefinition({
          displayOrder: targetTagCount + 1,
          groupId: targetGroupId,
          tagId: tag.id
        })
      );
      setSelectedMoveTagId(null);
    }, "Tag moved");
  }

  async function handleDeleteTag(tag: TagDefinition) {
    if (
      !confirmAdminAction(
        `Delete "${tag.tagKey}: ${tag.tagValue}" from the catalog? Tags already saved on answer options are not affected.`
      )
    ) {
      return;
    }

    await runCatalogMutation(async () => {
      await deleteTagDefinition({ tagId: tag.id });
      await refreshCatalog();
    }, "Tag removed from the catalog");
  }

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as TagCatalogDragData;

    if (data?.type === "section") {
      const group = data.groupId === null ? null : groups.find((item) => item.id === data.groupId);
      setActiveDrag({
        label: group?.name ?? "Ungrouped",
        type: "group"
      });
      return;
    }

    if (data?.type === "tag") {
      const tag = tags.find((item) => item.id === Number(String(event.active.id).slice(4)));
      setActiveDrag({
        label: tag ? `${tag.tagKey}: ${tag.tagValue}` : "Tag",
        type: "tag"
      });
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDrag(null);

    if (isSubmitting) {
      return;
    }

    const { active, over } = event;

    if (!over) {
      return;
    }

    const outcome = resolveTagCatalogDragOutcome({
      activeData: active.data.current as TagCatalogDragData,
      activeId: String(active.id),
      overData: over.data.current as TagCatalogDragData,
      overId: String(over.id),
      sectionIds: catalogSections.map((section) => section.key),
      tagIdsByGroup
    });

    if (!outcome) {
      return;
    }

    if (outcome.type === "reorder-sections") {
      void runCatalogMutation(async () => {
        applyCatalog(await reorderTagCatalogSections({ sectionIds: outcome.sectionIds }));
      }, "Category order saved");
      return;
    }

    if (outcome.type === "reorder-tags") {
      void runCatalogMutation(async () => {
        applyCatalog(await reorderTags({ groupId: outcome.groupId, tagIds: outcome.tagIds }));
      }, "Tag order saved");
      return;
    }

    void runCatalogMutation(async () => {
      applyCatalog(
        await moveTagDefinition({
          displayOrder: outcome.displayOrder,
          groupId: outcome.groupId,
          tagId: outcome.tagId
        })
      );
    }, "Tag moved");
  }

  const sectionItemIds = catalogSections.map((section) => `section:${section.key}`);

  return (
    <section className="page admin-builder-page">
      <div className="page-header">
        <p className="eyebrow">Admin portal</p>
        <h2>Tag catalog</h2>
        <p>
          Reusable hidden tag categories and values. Tags saved in the assessment builder
          register here automatically; categories help admins arrange catalog pairs
          without changing participant-facing data.
        </p>
      </div>

      {error ? <p className="status error">{error}</p> : null}

      <div className="builder-workspace tag-catalog-workspace">
        <form className="builder-form tag-catalog-create" onSubmit={handleCreateGroup}>
            <div className="builder-section-heading">
              <div>
              <p className="eyebrow">Categories</p>
              <h3>Create category</h3>
            </div>
          </div>
          <div className="builder-grid two-columns">
            <label>
              Category name
              <input
                name="name"
                onChange={(event) => setNewGroupName(event.target.value)}
                required
                value={newGroupName}
              />
            </label>
          </div>
          <div className="inline-actions">
            <button
              className="button-link compact-button primary-button"
              disabled={isSubmitting}
              type="submit"
            >
              Add category
            </button>
          </div>
        </form>

        <form className="builder-form tag-catalog-create" onSubmit={handleCreateTag}>
          <div className="builder-section-heading">
            <div>
              <p className="eyebrow">New tag</p>
              <h3>Add catalog entry</h3>
            </div>
          </div>
          <div className="builder-grid three-columns">
            <label>
              Tag category
              <input
                name="tagKey"
                onChange={(event) => setNewTagKey(event.target.value)}
                required
                value={newTagKey}
              />
            </label>
            <label>
              Tag value
              <input
                name="tagValue"
                onChange={(event) => setNewTagValue(event.target.value)}
                required
                value={newTagValue}
              />
            </label>
            <TagGroupSelect
              groups={groups}
              label="Category"
              onChange={setNewTagGroupId}
              value={newTagGroupId}
            />
          </div>
          {isDuplicateNewPair ? (
            <p className="tag-duplicate-warning" role="alert">
              This category/value pair already exists in the catalog.
            </p>
          ) : null}
          <div className="inline-actions">
            <button
              className="button-link compact-button primary-button"
              disabled={isSubmitting || isDuplicateNewPair}
              type="submit"
            >
              Add tag
            </button>
          </div>
        </form>

        {isLoading ? <p className="status muted">Loading tags...</p> : null}
        {!isLoading && tags.length === 0 && groups.length === 0 ? (
          <div className="builder-empty-state">
            <strong>No catalog tags yet</strong>
            <span>Add an entry above, or save hidden tags in the assessment builder.</span>
          </div>
        ) : null}

        {!isLoading ? (
          <DndContext
            collisionDetection={closestCorners}
            onDragCancel={() => setActiveDrag(null)}
            onDragEnd={handleDragEnd}
            onDragStart={handleDragStart}
            sensors={sensors}
          >
            <div className="tag-catalog-board-toolbar">
              <span className="builder-heading-note">
                {groups.length} {groups.length === 1 ? "category" : "categories"} · {tags.length}{" "}
                {tags.length === 1 ? "tag" : "tags"}
              </span>
              <button
                className="button-link compact-button ghost-button"
                onClick={toggleAllSections}
                type="button"
              >
                {allSectionsCollapsed ? "Expand all" : "Collapse all"}
              </button>
            </div>

            <div className="tag-catalog-board">
              <SortableContext items={sectionItemIds} strategy={verticalListSortingStrategy}>
                {catalogSections.map((section) =>
                  section.type === "ungrouped" ? (
                    <TagSection
                      collapsed={collapsedSectionKeys.has(ungroupedSectionKey)}
                      disabled={isSubmitting}
                      editingTagGroupId={editingTagGroupId}
                      editingTagId={editingTagId}
                      editingTagKey={editingTagKey}
                      editingTagValue={editingTagValue}
                      groupId={null}
                      groupOptions={groups}
                      isDuplicateEditPair={isDuplicateEditPair}
                      isSubmitting={isSubmitting}
                      key={section.key}
                      onCancelEdit={() => setEditingTagId(null)}
                      onDeleteTag={handleDeleteTag}
                      onEditingTagGroupChange={setEditingTagGroupId}
                      onEditingTagKeyChange={setEditingTagKey}
                      onEditingTagValueChange={setEditingTagValue}
                      onMoveSelectedTag={handleMoveSelectedTag}
                      onSaveTag={handleSaveTag}
                      onStartMoveTag={startMovingTag}
                      onStartEditTag={startEditingTag}
                      onToggleCollapse={() => toggleSection(ungroupedSectionKey)}
                      selectedMoveGroupId={selectedMoveGroupId}
                      selectedMoveTagId={selectedMoveTagId}
                      onSelectedMoveGroupChange={setSelectedMoveGroupId}
                      tags={ungroupedTags}
                      title="Ungrouped"
                    />
                  ) : (
                    <SortableTagGroupCard
                      collapsed={collapsedSectionKeys.has(getGroupSectionKey(section.group.id))}
                      disabled={isSubmitting}
                      editingGroupId={editingGroupId}
                      editingGroupName={editingGroupName}
                      editingTagGroupId={editingTagGroupId}
                      editingTagId={editingTagId}
                      editingTagKey={editingTagKey}
                      editingTagValue={editingTagValue}
                      group={section.group}
                      groupOptions={groups}
                      isDuplicateEditPair={isDuplicateEditPair}
                      isSubmitting={isSubmitting}
                      key={section.key}
                      onCancelEditGroup={() => setEditingGroupId(null)}
                      onCancelEditTag={() => setEditingTagId(null)}
                      onDeleteGroup={handleDeleteGroup}
                      onDeleteTag={handleDeleteTag}
                      onEditingGroupNameChange={setEditingGroupName}
                      onEditingTagGroupChange={setEditingTagGroupId}
                      onEditingTagKeyChange={setEditingTagKey}
                      onEditingTagValueChange={setEditingTagValue}
                      onMoveSelectedTag={handleMoveSelectedTag}
                      onSaveGroup={handleSaveGroup}
                      onSaveTag={handleSaveTag}
                      onSelectedMoveGroupChange={setSelectedMoveGroupId}
                      onStartEditGroup={startEditingGroup}
                      onStartEditTag={startEditingTag}
                      onStartMoveTag={startMovingTag}
                      onToggleCollapse={() => toggleSection(getGroupSectionKey(section.group.id))}
                      selectedMoveGroupId={selectedMoveGroupId}
                      selectedMoveTagId={selectedMoveTagId}
                    />
                  )
                )}
              </SortableContext>
            </div>

            <DragOverlay>
              {activeDrag ? (
                <div className={`organize-drag-overlay ${activeDrag.type}`}>{activeDrag.label}</div>
              ) : null}
            </DragOverlay>
          </DndContext>
        ) : null}
      </div>
    </section>
  );
}

function SortableTagGroupCard({
  collapsed,
  disabled,
  editingGroupId,
  editingGroupName,
  editingTagGroupId,
  editingTagId,
  editingTagKey,
  editingTagValue,
  group,
  groupOptions,
  isDuplicateEditPair,
  isSubmitting,
  onCancelEditGroup,
  onCancelEditTag,
  onDeleteGroup,
  onDeleteTag,
  onEditingGroupNameChange,
  onEditingTagGroupChange,
  onEditingTagKeyChange,
  onEditingTagValueChange,
  onMoveSelectedTag,
  onSelectedMoveGroupChange,
  onSaveGroup,
  onSaveTag,
  onStartEditGroup,
  onStartEditTag,
  onStartMoveTag,
  onToggleCollapse,
  selectedMoveGroupId,
  selectedMoveTagId
}: {
  collapsed: boolean;
  disabled: boolean;
  editingGroupId: number | null;
  editingGroupName: string;
  editingTagGroupId: string;
  editingTagId: number | null;
  editingTagKey: string;
  editingTagValue: string;
  group: TagCatalogGroup;
  groupOptions: TagCatalogGroup[];
  isDuplicateEditPair: boolean;
  isSubmitting: boolean;
  onCancelEditGroup: () => void;
  onCancelEditTag: () => void;
  onDeleteGroup: (group: TagCatalogGroup) => void;
  onDeleteTag: (tag: TagDefinition) => void;
  onEditingGroupNameChange: (value: string) => void;
  onEditingTagGroupChange: (value: string) => void;
  onEditingTagKeyChange: (value: string) => void;
  onEditingTagValueChange: (value: string) => void;
  onMoveSelectedTag: (event: FormEvent<HTMLFormElement>, tag: TagDefinition) => void;
  onSelectedMoveGroupChange: (value: string) => void;
  onSaveGroup: (event: FormEvent<HTMLFormElement>, group: TagCatalogGroup) => void;
  onSaveTag: (event: FormEvent<HTMLFormElement>, tag: TagDefinition) => void;
  onStartEditGroup: (group: TagCatalogGroup) => void;
  onStartEditTag: (tag: TagDefinition) => void;
  onStartMoveTag: (tag: TagDefinition) => void;
  onToggleCollapse: () => void;
  selectedMoveGroupId: string;
  selectedMoveTagId: number | null;
}) {
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    data: { groupId: group.id, sectionId: getCatalogSectionId(group.id), type: "section" },
    disabled,
    id: `section:${getCatalogSectionId(group.id)}`
  });
  const style = {
    transform: CSS.Translate.toString(transform),
    transition
  };

  return (
    <section
      className={isDragging ? "tag-group-card dragging" : "tag-group-card"}
      ref={setNodeRef}
      style={style}
    >
      <div className="tag-group-card-header">
        <button
          aria-label={`Reorder category ${group.name}`}
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
          aria-label={collapsed ? `Expand ${group.name}` : `Collapse ${group.name}`}
          className="organize-collapse-toggle"
          onClick={onToggleCollapse}
          type="button"
        >
          <span aria-hidden="true">{collapsed ? "▸" : "▾"}</span>
        </button>
        {editingGroupId === group.id ? (
          <form className="tag-group-edit-form" onSubmit={(event) => onSaveGroup(event, group)}>
            <label>
              Category name
              <input
                name="name"
                onChange={(event) => onEditingGroupNameChange(event.target.value)}
                required
                value={editingGroupName}
              />
            </label>
            <div className="inline-actions">
              <button
                className="button-link compact-button primary-button"
                disabled={isSubmitting}
                type="submit"
              >
                Save
              </button>
              <button
                className="button-link compact-button ghost-button"
                disabled={isSubmitting}
                onClick={onCancelEditGroup}
                type="button"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="tag-group-card-heading">
              <p className="eyebrow">
                Category {group.displayOrder} · {group.tags.length}{" "}
                {group.tags.length === 1 ? "tag" : "tags"}
              </p>
              <h3>{group.name}</h3>
            </div>
            <div className="inline-actions">
              <button
                className="button-link compact-button ghost-button"
                disabled={isSubmitting}
                onClick={() => onStartEditGroup(group)}
                type="button"
              >
                Rename
              </button>
              <button
                className="button-link compact-button danger-button"
                disabled={isSubmitting}
                onClick={() => onDeleteGroup(group)}
                type="button"
              >
                Delete category
              </button>
            </div>
          </>
        )}
      </div>
      {collapsed ? (
        <CollapsedTagDropZone groupId={group.id} tagCount={group.tags.length} />
      ) : (
        <TagRows
          disabled={disabled}
          editingTagGroupId={editingTagGroupId}
          editingTagId={editingTagId}
          editingTagKey={editingTagKey}
          editingTagValue={editingTagValue}
          groupId={group.id}
          groupOptions={groupOptions}
          isDuplicateEditPair={isDuplicateEditPair}
          isSubmitting={isSubmitting}
          onCancelEdit={onCancelEditTag}
          onDeleteTag={onDeleteTag}
          onEditingTagGroupChange={onEditingTagGroupChange}
          onEditingTagKeyChange={onEditingTagKeyChange}
          onEditingTagValueChange={onEditingTagValueChange}
          onMoveSelectedTag={onMoveSelectedTag}
          onSaveTag={onSaveTag}
          onSelectedMoveGroupChange={onSelectedMoveGroupChange}
          onStartEditTag={onStartEditTag}
          onStartMoveTag={onStartMoveTag}
          selectedMoveGroupId={selectedMoveGroupId}
          selectedMoveTagId={selectedMoveTagId}
          tags={group.tags}
        />
      )}
    </section>
  );
}

function TagSection({
  collapsed,
  disabled,
  editingTagGroupId,
  editingTagId,
  editingTagKey,
  editingTagValue,
  groupId,
  groupOptions,
  isDuplicateEditPair,
  isSubmitting,
  onCancelEdit,
  onDeleteTag,
  onEditingTagGroupChange,
  onEditingTagKeyChange,
  onEditingTagValueChange,
  onMoveSelectedTag,
  onSelectedMoveGroupChange,
  onSaveTag,
  onStartMoveTag,
  onStartEditTag,
  onToggleCollapse,
  selectedMoveGroupId,
  selectedMoveTagId,
  tags,
  title
}: {
  collapsed: boolean;
  disabled: boolean;
  editingTagGroupId: string;
  editingTagId: number | null;
  editingTagKey: string;
  editingTagValue: string;
  groupId: number | null;
  groupOptions: TagCatalogGroup[];
  isDuplicateEditPair: boolean;
  isSubmitting: boolean;
  onCancelEdit: () => void;
  onDeleteTag: (tag: TagDefinition) => void;
  onEditingTagGroupChange: (value: string) => void;
  onEditingTagKeyChange: (value: string) => void;
  onEditingTagValueChange: (value: string) => void;
  onMoveSelectedTag: (event: FormEvent<HTMLFormElement>, tag: TagDefinition) => void;
  onSelectedMoveGroupChange: (value: string) => void;
  onSaveTag: (event: FormEvent<HTMLFormElement>, tag: TagDefinition) => void;
  onStartMoveTag: (tag: TagDefinition) => void;
  onStartEditTag: (tag: TagDefinition) => void;
  onToggleCollapse: () => void;
  selectedMoveGroupId: string;
  selectedMoveTagId: number | null;
  tags: TagDefinition[];
  title: string;
}) {
  const sectionId = getCatalogSectionId(groupId);
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    data: { groupId, sectionId, type: "section" },
    disabled,
    id: `section:${sectionId}`
  });
  const style = {
    transform: CSS.Translate.toString(transform),
    transition
  };

  return (
    <section
      className={isDragging ? "tag-group-card ungrouped dragging" : "tag-group-card ungrouped"}
      ref={setNodeRef}
      style={style}
    >
      <div className="tag-group-card-header">
        <button
          aria-label="Reorder Ungrouped"
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
          aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
          className="organize-collapse-toggle"
          onClick={onToggleCollapse}
          type="button"
        >
          <span aria-hidden="true">{collapsed ? "▸" : "▾"}</span>
        </button>
        <div className="tag-group-card-heading">
          <p className="eyebrow">
            Holding area · {tags.length} {tags.length === 1 ? "tag" : "tags"}
          </p>
          <h3>{title}</h3>
        </div>
      </div>
      {collapsed ? (
        <CollapsedTagDropZone groupId={groupId} tagCount={tags.length} />
      ) : (
        <TagRows
          disabled={disabled}
          editingTagGroupId={editingTagGroupId}
          editingTagId={editingTagId}
          editingTagKey={editingTagKey}
          editingTagValue={editingTagValue}
          groupId={groupId}
          groupOptions={groupOptions}
          isDuplicateEditPair={isDuplicateEditPair}
          isSubmitting={isSubmitting}
          onCancelEdit={onCancelEdit}
          onDeleteTag={onDeleteTag}
          onEditingTagGroupChange={onEditingTagGroupChange}
          onEditingTagKeyChange={onEditingTagKeyChange}
          onEditingTagValueChange={onEditingTagValueChange}
          onMoveSelectedTag={onMoveSelectedTag}
          onSaveTag={onSaveTag}
          onSelectedMoveGroupChange={onSelectedMoveGroupChange}
          onStartEditTag={onStartEditTag}
          onStartMoveTag={onStartMoveTag}
          selectedMoveGroupId={selectedMoveGroupId}
          selectedMoveTagId={selectedMoveTagId}
          tags={tags}
        />
      )}
    </section>
  );
}

function TagRows({
  disabled,
  editingTagGroupId,
  editingTagId,
  editingTagKey,
  editingTagValue,
  groupId,
  groupOptions,
  isDuplicateEditPair,
  isSubmitting,
  onCancelEdit,
  onDeleteTag,
  onEditingTagGroupChange,
  onEditingTagKeyChange,
  onEditingTagValueChange,
  onMoveSelectedTag,
  onSelectedMoveGroupChange,
  onSaveTag,
  onStartMoveTag,
  onStartEditTag,
  selectedMoveGroupId,
  selectedMoveTagId,
  tags
}: {
  disabled: boolean;
  editingTagGroupId: string;
  editingTagId: number | null;
  editingTagKey: string;
  editingTagValue: string;
  groupId: number | null;
  groupOptions: TagCatalogGroup[];
  isDuplicateEditPair: boolean;
  isSubmitting: boolean;
  onCancelEdit: () => void;
  onDeleteTag: (tag: TagDefinition) => void;
  onEditingTagGroupChange: (value: string) => void;
  onEditingTagKeyChange: (value: string) => void;
  onEditingTagValueChange: (value: string) => void;
  onMoveSelectedTag: (event: FormEvent<HTMLFormElement>, tag: TagDefinition) => void;
  onSelectedMoveGroupChange: (value: string) => void;
  onSaveTag: (event: FormEvent<HTMLFormElement>, tag: TagDefinition) => void;
  onStartMoveTag: (tag: TagDefinition) => void;
  onStartEditTag: (tag: TagDefinition) => void;
  selectedMoveGroupId: string;
  selectedMoveTagId: number | null;
  tags: TagDefinition[];
}) {
  const { setNodeRef } = useDroppable({
    data: { groupId, type: "groupdrop" },
    id: groupId === null ? "groupdrop:ungrouped" : `groupdrop:${groupId}`
  });
  const tagItemIds = tags.map((tag) => `tag:${tag.id}`);

  return (
    <div className="tag-group-card-tags" ref={setNodeRef}>
      <SortableContext items={tagItemIds} strategy={verticalListSortingStrategy}>
        {tags.length === 0 ? (
          <div className="builder-empty-state compact">
            <strong>No tags here</strong>
            <span>Drag catalog pairs into this section.</span>
          </div>
        ) : (
          tags.map((tag) => (
            <SortableTagRow
              disabled={disabled || editingTagId === tag.id}
              editingGroupId={editingTagGroupId}
              editingKey={editingTagKey}
              editingTagId={editingTagId}
              editingValue={editingTagValue}
              groupId={groupId}
              groupOptions={groupOptions}
              isDuplicateEditPair={isDuplicateEditPair}
              isSubmitting={isSubmitting}
              key={tag.id}
              onCancelEdit={onCancelEdit}
              onDeleteTag={onDeleteTag}
              onEditingGroupChange={onEditingTagGroupChange}
              onEditingKeyChange={onEditingTagKeyChange}
              onEditingValueChange={onEditingTagValueChange}
              onMoveSelectedTag={onMoveSelectedTag}
              onSaveTag={onSaveTag}
              onSelectedMoveGroupChange={onSelectedMoveGroupChange}
              onStartEditTag={onStartEditTag}
              onStartMoveTag={onStartMoveTag}
              selectedMoveGroupId={selectedMoveGroupId}
              selectedMoveTagId={selectedMoveTagId}
              tag={tag}
            />
          ))
        )}
      </SortableContext>
    </div>
  );
}

function SortableTagRow({
  disabled,
  editingGroupId,
  editingKey,
  editingTagId,
  editingValue,
  groupId,
  groupOptions,
  isDuplicateEditPair,
  isSubmitting,
  onCancelEdit,
  onDeleteTag,
  onEditingGroupChange,
  onEditingKeyChange,
  onEditingValueChange,
  onMoveSelectedTag,
  onSelectedMoveGroupChange,
  onSaveTag,
  onStartEditTag,
  onStartMoveTag,
  selectedMoveGroupId,
  selectedMoveTagId,
  tag
}: {
  disabled: boolean;
  editingGroupId: string;
  editingKey: string;
  editingTagId: number | null;
  editingValue: string;
  groupId: number | null;
  groupOptions: TagCatalogGroup[];
  isDuplicateEditPair: boolean;
  isSubmitting: boolean;
  onCancelEdit: () => void;
  onDeleteTag: (tag: TagDefinition) => void;
  onEditingGroupChange: (value: string) => void;
  onEditingKeyChange: (value: string) => void;
  onEditingValueChange: (value: string) => void;
  onMoveSelectedTag: (event: FormEvent<HTMLFormElement>, tag: TagDefinition) => void;
  onSelectedMoveGroupChange: (value: string) => void;
  onSaveTag: (event: FormEvent<HTMLFormElement>, tag: TagDefinition) => void;
  onStartEditTag: (tag: TagDefinition) => void;
  onStartMoveTag: (tag: TagDefinition) => void;
  selectedMoveGroupId: string;
  selectedMoveTagId: number | null;
  tag: TagDefinition;
}) {
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    data: { groupId, type: "tag" },
    disabled,
    id: `tag:${tag.id}`
  });
  const style = {
    transform: CSS.Translate.toString(transform),
    transition
  };

  if (editingTagId === tag.id) {
    return (
      <form
        className="tag-catalog-row editing"
        onSubmit={(event) => onSaveTag(event, tag)}
        ref={setNodeRef}
        style={style}
      >
        <label>
          Tag category
          <input
            name="tagKey"
            onChange={(event) => onEditingKeyChange(event.target.value)}
            required
            value={editingKey}
          />
        </label>
        <label>
          Tag value
          <input
            name="tagValue"
            onChange={(event) => onEditingValueChange(event.target.value)}
            required
            value={editingValue}
          />
        </label>
        <TagGroupSelect
          groups={groupOptions}
          label="Category"
          onChange={onEditingGroupChange}
          value={editingGroupId}
        />
        {isDuplicateEditPair ? (
          <p className="tag-duplicate-warning" role="alert">
            This category/value pair already exists in the catalog.
          </p>
        ) : null}
        <div className="inline-actions">
          <button
            className="button-link compact-button primary-button"
            disabled={isSubmitting || isDuplicateEditPair}
            type="submit"
          >
            Save
          </button>
          <button
            className="button-link compact-button ghost-button"
            disabled={isSubmitting}
            onClick={onCancelEdit}
            type="button"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="tag-catalog-row-shell" ref={setNodeRef} style={style}>
      <div className={isDragging ? "tag-catalog-row dragging" : "tag-catalog-row"}>
        <button
          aria-label={`Drag ${tag.tagKey}: ${tag.tagValue}`}
          className="drag-handle"
          disabled={disabled}
          type="button"
          {...attributes}
          {...listeners}
        >
          <span aria-hidden="true">⠿</span>
        </button>
        <button
          aria-expanded={selectedMoveTagId === tag.id}
          className="tag-catalog-pair tag-catalog-pair-button"
          disabled={isSubmitting}
          onClick={() => onStartMoveTag(tag)}
          type="button"
        >
          <strong>{tag.tagKey}</strong>
          <span>{tag.tagValue}</span>
        </button>
        {selectedMoveTagId === tag.id ? (
          <form
            className="tag-catalog-inline-move"
            onSubmit={(event) => onMoveSelectedTag(event, tag)}
          >
            <label>
              <span>Move to</span>
              <select
                onChange={(event) => onSelectedMoveGroupChange(event.target.value)}
                value={selectedMoveGroupId}
              >
                <option value="">Ungrouped</option>
                {groupOptions.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button-link compact-button primary-button"
              disabled={isSubmitting || readGroupSelectValue(selectedMoveGroupId) === tag.groupId}
              type="submit"
            >
              Move
            </button>
            <button
              className="button-link compact-button ghost-button"
              disabled={isSubmitting}
              onClick={() => onStartMoveTag(tag)}
              type="button"
            >
              Cancel
            </button>
          </form>
        ) : (
          <div className="inline-actions tag-catalog-row-actions">
            <button
              className="button-link compact-button ghost-button"
              disabled={isSubmitting}
              onClick={() => onStartMoveTag(tag)}
              type="button"
            >
              Move
            </button>
            <button
              className="button-link compact-button ghost-button"
              disabled={isSubmitting}
              onClick={() => onStartEditTag(tag)}
              type="button"
            >
              Edit
            </button>
            <button
              className="button-link compact-button danger-button"
              disabled={isSubmitting}
              onClick={() => onDeleteTag(tag)}
              type="button"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CollapsedTagDropZone({
  groupId,
  tagCount
}: {
  groupId: number | null;
  tagCount: number;
}) {
  const { setNodeRef } = useDroppable({
    data: { groupId, type: "groupdrop" },
    id: groupId === null ? "groupdrop:ungrouped-collapsed" : `groupdrop:${groupId}:collapsed`
  });

  return (
    <div className="tag-group-collapsed-drop" ref={setNodeRef}>
      <span>
        {tagCount} {tagCount === 1 ? "tag hidden" : "tags hidden"}
      </span>
      <span>Drop here to move a tag into this section.</span>
    </div>
  );
}

function getGroupSectionKey(groupId: number): string {
  return `group:${groupId}`;
}

function compareCatalogSections(left: CatalogSection, right: CatalogSection): number {
  const byOrder = left.displayOrder - right.displayOrder;

  if (byOrder !== 0) {
    return byOrder;
  }

  // Fresh installs can tie Ungrouped's default order with the first category;
  // keep the initial paint deterministic until an admin saves a custom order.
  if (left.type === "ungrouped" && right.type !== "ungrouped") {
    return -1;
  }

  if (right.type === "ungrouped" && left.type !== "ungrouped") {
    return 1;
  }

  if (left.type === "group" && right.type === "group") {
    return left.group.name.localeCompare(right.group.name) || left.group.id - right.group.id;
  }

  return 0;
}

function TagGroupSelect({
  groups,
  label,
  onChange,
  value
}: {
  groups: TagCatalogGroup[];
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label>
      {label}
      <select onChange={(event) => onChange(event.target.value)} value={value}>
        <option value="">Ungrouped</option>
        {groups.map((group) => (
          <option key={group.id} value={group.id}>
            {group.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function readGroupSelectValue(value: string): number | null {
  return value ? Number(value) : null;
}

function hasTagPair(
  tags: TagDefinition[],
  tagKey: string,
  tagValue: string,
  excludeTagId: number | null
): boolean {
  const normalizedKey = tagKey.trim().toLowerCase();
  const normalizedValue = tagValue.trim().toLowerCase();

  if (!normalizedKey || !normalizedValue) {
    return false;
  }

  return tags.some(
    (tag) =>
      tag.id !== excludeTagId &&
      tag.tagKey.trim().toLowerCase() === normalizedKey &&
      tag.tagValue.trim().toLowerCase() === normalizedValue
  );
}
