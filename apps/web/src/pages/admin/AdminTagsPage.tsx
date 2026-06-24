import type { TagDefinition } from "@survey-portal/shared";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import {
  createTagDefinition,
  deleteTagDefinition,
  fetchTagDefinitions,
  updateTagDefinition
} from "../../api/tags.js";
import { confirmAdminAction } from "../../components/admin/builderForm.js";
import { useToast } from "../../components/ToastProvider.js";

export function AdminTagsPage() {
  const toast = useToast();
  const [tags, setTags] = useState<TagDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newTagKey, setNewTagKey] = useState("");
  const [newTagValue, setNewTagValue] = useState("");
  const [editingTagId, setEditingTagId] = useState<number | null>(null);
  const [editingTagKey, setEditingTagKey] = useState("");
  const [editingTagValue, setEditingTagValue] = useState("");

  useEffect(() => {
    let isActive = true;

    fetchTagDefinitions()
      .then((response) => {
        if (isActive) {
          setTags(response.tags);
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

  function startEditing(tag: TagDefinition) {
    setEditingTagId(tag.id);
    setEditingTagKey(tag.tagKey);
    setEditingTagValue(tag.tagValue);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await createTagDefinition({
        tagKey: newTagKey.trim(),
        tagValue: newTagValue.trim()
      });
      setTags((current) => sortTags([...current, response.tag]));
      setNewTagKey("");
      setNewTagValue("");
      toast.success("Tag added to the catalog");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Request failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>, tag: TagDefinition) {
    event.preventDefault();
    const tagKey = editingTagKey.trim();
    const tagValue = editingTagValue.trim();

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await updateTagDefinition({ tagId: tag.id, tagKey, tagValue });
      setTags((current) =>
        sortTags(current.map((item) => (item.id === tag.id ? response.tag : item)))
      );
      setEditingTagId(null);
      toast.success("Tag saved");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Request failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(tag: TagDefinition) {
    if (
      !confirmAdminAction(
        `Delete "${tag.tagKey}: ${tag.tagValue}" from the catalog? Tags already saved on answer options are not affected.`
      )
    ) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await deleteTagDefinition({ tagId: tag.id });
      setTags((current) => current.filter((item) => item.id !== tag.id));
      toast.success("Tag removed from the catalog");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Request failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="page admin-builder-page">
      <div className="page-header">
        <p className="eyebrow">Admin portal</p>
        <h2>Tag catalog</h2>
        <p>
          Reusable hidden tag categories and values. Tags saved on answer options in the survey
          builder register here automatically; entries added here appear as suggestions in
          every survey.
        </p>
      </div>

      {error ? <p className="status error">{error}</p> : null}

      <div className="builder-workspace">
        <form className="builder-form tag-catalog-create" onSubmit={handleCreate}>
          <div className="builder-section-heading">
            <div>
              <p className="eyebrow">New tag</p>
              <h3>Add catalog entry</h3>
            </div>
          </div>
          <div className="builder-grid two-columns">
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

        <div className="builder-form tag-catalog-list">
          <div className="builder-section-heading">
            <div>
              <p className="eyebrow">Catalog</p>
              <h3>Existing tags ({tags.length})</h3>
            </div>
          </div>

          {isLoading ? <p className="status muted">Loading tags...</p> : null}
          {!isLoading && tags.length === 0 ? (
            <div className="builder-empty-state compact">
              <strong>No catalog tags yet</strong>
              <span>
                Add an entry above, or save hidden tags on answer options to populate the
                catalog.
              </span>
            </div>
          ) : null}

          {tags.map((tag) =>
            editingTagId === tag.id ? (
              <form
                className="tag-catalog-row editing"
                key={tag.id}
                onSubmit={(event) => void handleSave(event, tag)}
              >
                <label>
                  Tag category
                  <input
                    name="tagKey"
                    onChange={(event) => setEditingTagKey(event.target.value)}
                    required
                    value={editingTagKey}
                  />
                </label>
                <label>
                  Tag value
                  <input
                    name="tagValue"
                    onChange={(event) => setEditingTagValue(event.target.value)}
                    required
                    value={editingTagValue}
                  />
                </label>
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
                    onClick={() => setEditingTagId(null)}
                    type="button"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="tag-catalog-row" key={tag.id}>
                <span className="tag-catalog-pair">
                  <strong>{tag.tagKey}</strong>
                  <span>{tag.tagValue}</span>
                </span>
                <div className="inline-actions">
                  <button
                    className="button-link compact-button ghost-button"
                    disabled={isSubmitting}
                    onClick={() => startEditing(tag)}
                    type="button"
                  >
                    Edit
                  </button>
                  <button
                    className="button-link compact-button danger-button"
                    disabled={isSubmitting}
                    onClick={() => void handleDelete(tag)}
                    type="button"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </section>
  );
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

function sortTags(tags: TagDefinition[]): TagDefinition[] {
  return [...tags].sort(
    (left, right) =>
      left.tagKey.localeCompare(right.tagKey) || left.tagValue.localeCompare(right.tagValue)
  );
}
