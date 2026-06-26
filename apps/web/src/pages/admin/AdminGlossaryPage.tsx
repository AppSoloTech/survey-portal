import type { AdminGlossaryEntry } from "@survey-portal/shared";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import {
  archiveGlossaryEntry,
  createGlossaryEntry,
  fetchGlossaryEntries,
  updateGlossaryEntry,
  type GlossaryEntryInput
} from "../../api/glossary.js";
import { confirmAdminAction } from "../../components/admin/builderForm.js";
import { useToast } from "../../components/ToastProvider.js";

interface GlossaryFormState {
  aliasesText: string;
  canonicalTerm: string;
  definition: string;
  isEnabled: boolean;
}

const emptyForm: GlossaryFormState = {
  aliasesText: "",
  canonicalTerm: "",
  definition: "",
  isEnabled: true
};

export function AdminGlossaryPage() {
  const toast = useToast();
  const [entries, setEntries] = useState<AdminGlossaryEntry[]>([]);
  const [createForm, setCreateForm] = useState<GlossaryFormState>(emptyForm);
  const [editForm, setEditForm] = useState<GlossaryFormState>(emptyForm);
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeEntries = useMemo(
    () => entries.filter((entry) => entry.isEnabled),
    [entries]
  );

  useEffect(() => {
    let isActive = true;

    fetchGlossaryEntries()
      .then((response) => {
        if (isActive) {
          setEntries(response.entries);
        }
      })
      .catch((loadError) => {
        if (isActive) {
          setError(loadError instanceof Error ? loadError.message : "Could not load glossary");
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

  async function refreshGlossary() {
    const response = await fetchGlossaryEntries();
    setEntries(response.entries);
  }

  async function runGlossaryMutation(action: () => Promise<void>, successMessage: string) {
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

  async function handleCreateEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await runGlossaryMutation(async () => {
      await createGlossaryEntry(toGlossaryInput(createForm));
      setCreateForm(emptyForm);
      await refreshGlossary();
    }, "Glossary entry added");
  }

  async function handleSaveEntry(event: FormEvent<HTMLFormElement>, entry: AdminGlossaryEntry) {
    event.preventDefault();

    await runGlossaryMutation(async () => {
      await updateGlossaryEntry(entry.id, toGlossaryInput(editForm));
      setEditingEntryId(null);
      await refreshGlossary();
    }, "Glossary entry saved");
  }

  async function handleToggleEntry(entry: AdminGlossaryEntry, isEnabled: boolean) {
    const formState = toFormState(entry);

    await runGlossaryMutation(async () => {
      await updateGlossaryEntry(entry.id, toGlossaryInput({ ...formState, isEnabled }));
      await refreshGlossary();
    }, isEnabled ? "Glossary entry enabled" : "Glossary entry disabled");
  }

  async function handleArchiveEntry(entry: AdminGlossaryEntry) {
    if (!confirmAdminAction(`Archive "${entry.canonicalTerm}"?`)) {
      return;
    }

    await runGlossaryMutation(async () => {
      await archiveGlossaryEntry(entry.id);
      if (editingEntryId === entry.id) {
        setEditingEntryId(null);
      }
      await refreshGlossary();
    }, "Glossary entry archived");
  }

  function startEditing(entry: AdminGlossaryEntry) {
    setEditingEntryId(entry.id);
    setEditForm(toFormState(entry));
  }

  return (
    <section className="page admin-builder-page">
      <div className="page-header">
        <p className="eyebrow">Admin portal</p>
        <h2>Glossary</h2>
      </div>

      {error ? <p className="status error">{error}</p> : null}

      <div className="glossary-layout">
        <form
          className="builder-form compact-builder-form glossary-form"
          onSubmit={handleCreateEntry}
        >
          <h3>Create entry</h3>
          <GlossaryFields
            form={createForm}
            isSubmitting={isSubmitting}
            onChange={setCreateForm}
          />
          <div className="glossary-form-actions">
            <button
              className="button-link compact-button primary-button"
              disabled={isSubmitting}
              type="submit"
            >
              Add entry
            </button>
          </div>
        </form>

        <div className="glossary-list" aria-label="Glossary entries">
          <div className="glossary-list-summary">
            <span>{formatCount(entries.length, "entry")}</span>
            <span>{formatCount(activeEntries.length, "enabled")}</span>
          </div>

          {isLoading ? <p className="status muted">Loading glossary...</p> : null}
          {!isLoading && entries.length === 0 ? (
            <div className="builder-empty-state">
              <strong>No glossary entries yet</strong>
              <span>Create the first term and definition.</span>
            </div>
          ) : null}

          {entries.map((entry) => {
            const isEditing = editingEntryId === entry.id;

            return (
              <article className="glossary-entry" key={entry.id}>
                {isEditing ? (
                  <form
                    className="glossary-form"
                    onSubmit={(event) => void handleSaveEntry(event, entry)}
                  >
                    <h3>Edit entry</h3>
                    <GlossaryFields
                      form={editForm}
                      isSubmitting={isSubmitting}
                      onChange={setEditForm}
                    />
                    <div className="glossary-entry-actions">
                      <button
                        className="button-link compact-button primary-button"
                        disabled={isSubmitting}
                        type="submit"
                      >
                        Save
                      </button>
                      <button
                        className="button-link compact-button secondary-button"
                        disabled={isSubmitting}
                        onClick={() => setEditingEntryId(null)}
                        type="button"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="glossary-entry-header">
                      <div>
                        <h3>{entry.canonicalTerm}</h3>
                        <p>{entry.definition}</p>
                      </div>
                      <span className={entry.isEnabled ? "status-pill published" : "status-pill retired"}>
                        {entry.isEnabled ? "enabled" : "disabled"}
                      </span>
                    </div>

                    <div className="glossary-alias-list" aria-label={`${entry.canonicalTerm} match strings`}>
                      {entry.aliases.map((alias) => (
                        <span className="glossary-alias" key={alias.id}>
                          {alias.matchText}
                        </span>
                      ))}
                    </div>

                    <div className="glossary-entry-meta">
                      <span>Updated {formatDate(entry.updatedAt)}</span>
                      <span>{entry.definitionSource === "manual" ? "Manual" : "Dictionary suggested"}</span>
                    </div>

                    <div className="glossary-entry-actions">
                      <button
                        className="button-link compact-button secondary-button"
                        disabled={isSubmitting}
                        onClick={() => startEditing(entry)}
                        type="button"
                      >
                        Edit
                      </button>
                      <button
                        className="button-link compact-button secondary-button"
                        disabled={isSubmitting}
                        onClick={() => void handleToggleEntry(entry, !entry.isEnabled)}
                        type="button"
                      >
                        {entry.isEnabled ? "Disable" : "Enable"}
                      </button>
                      <button
                        className="button-link compact-button danger-button"
                        disabled={isSubmitting}
                        onClick={() => void handleArchiveEntry(entry)}
                        type="button"
                      >
                        Archive
                      </button>
                    </div>
                  </>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function GlossaryFields({
  form,
  isSubmitting,
  onChange
}: {
  form: GlossaryFormState;
  isSubmitting: boolean;
  onChange: (next: GlossaryFormState) => void;
}) {
  return (
    <>
      <label>
        Canonical term
        <input
          disabled={isSubmitting}
          maxLength={120}
          onChange={(event) => onChange({ ...form, canonicalTerm: event.target.value })}
          required
          value={form.canonicalTerm}
        />
      </label>
      <label className="glossary-definition-field">
        Definition
        <textarea
          disabled={isSubmitting}
          maxLength={1200}
          onChange={(event) => onChange({ ...form, definition: event.target.value })}
          required
          rows={4}
          value={form.definition}
        />
      </label>
      <label className="glossary-alias-field">
        Match strings / aliases
        <textarea
          disabled={isSubmitting}
          maxLength={1000}
          onChange={(event) => onChange({ ...form, aliasesText: event.target.value })}
          rows={4}
          value={form.aliasesText}
        />
      </label>
      <label className="checkbox-label">
        <input
          checked={form.isEnabled}
          disabled={isSubmitting}
          onChange={(event) => onChange({ ...form, isEnabled: event.target.checked })}
          type="checkbox"
        />
        Enabled
      </label>
    </>
  );
}

function toGlossaryInput(form: GlossaryFormState): GlossaryEntryInput {
  return {
    aliases: parseAliases(form.aliasesText),
    canonicalTerm: form.canonicalTerm.trim(),
    definition: form.definition.trim(),
    definitionSource: "manual",
    isEnabled: form.isEnabled,
    sourceLookupAt: null,
    sourceProvider: null,
    sourceReference: null
  };
}

function toFormState(entry: AdminGlossaryEntry): GlossaryFormState {
  return {
    aliasesText: entry.aliases
      .filter((alias) => !alias.isCanonical)
      .map((alias) => alias.matchText)
      .join("\n"),
    canonicalTerm: entry.canonicalTerm,
    definition: entry.definition,
    isEnabled: entry.isEnabled
  };
}

function parseAliases(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((alias) => alias.trim())
    .filter(Boolean);
}

function formatCount(count: number, label: string): string {
  return `${count} ${label}${count === 1 ? "" : "s"}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}
