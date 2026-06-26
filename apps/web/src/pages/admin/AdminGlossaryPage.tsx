import type {
  AdminDictionaryDefinitionSuggestion,
  AdminDictionaryLookupResponse,
  AdminGlossaryEntry
} from "@survey-portal/shared";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import {
  archiveGlossaryEntry,
  createGlossaryEntry,
  fetchGlossaryEntries,
  lookupGlossaryDefinition,
  updateGlossaryEntry,
} from "../../api/glossary.js";
import { confirmAdminAction } from "../../components/admin/builderForm.js";
import { useToast } from "../../components/ToastProvider.js";
import {
  applyDictionarySuggestion,
  emptyGlossaryForm,
  ignoreDictionarySuggestion,
  toFormState,
  toGlossaryInput,
  type GlossaryFormState
} from "./glossaryForm.js";

interface DictionaryLookupState {
  error: string | null;
  isLoading: boolean;
  result: AdminDictionaryLookupResponse | null;
}

const emptyLookupState: DictionaryLookupState = {
  error: null,
  isLoading: false,
  result: null
};

export function AdminGlossaryPage() {
  const toast = useToast();
  const [entries, setEntries] = useState<AdminGlossaryEntry[]>([]);
  const [createForm, setCreateForm] = useState<GlossaryFormState>(emptyGlossaryForm);
  const [editForm, setEditForm] = useState<GlossaryFormState>(emptyGlossaryForm);
  const [createLookup, setCreateLookup] = useState<DictionaryLookupState>(emptyLookupState);
  const [editLookup, setEditLookup] = useState<DictionaryLookupState>(emptyLookupState);
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
      setCreateForm(emptyGlossaryForm);
      setCreateLookup(emptyLookupState);
      await refreshGlossary();
    }, "Glossary entry added");
  }

  async function handleSaveEntry(event: FormEvent<HTMLFormElement>, entry: AdminGlossaryEntry) {
    event.preventDefault();

    await runGlossaryMutation(async () => {
      await updateGlossaryEntry(entry.id, toGlossaryInput(editForm));
      setEditingEntryId(null);
      setEditLookup(emptyLookupState);
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
    setEditLookup(emptyLookupState);
  }

  async function handleDictionaryLookup(
    form: GlossaryFormState,
    setLookup: (next: DictionaryLookupState) => void
  ) {
    const term = form.canonicalTerm.trim();

    if (!term) {
      setLookup({
        error: "Enter a canonical term before requesting a suggestion.",
        isLoading: false,
        result: null
      });
      return;
    }

    setLookup({ error: null, isLoading: true, result: null });

    try {
      const result = await lookupGlossaryDefinition(term);
      setLookup({ error: null, isLoading: false, result });
    } catch (lookupError) {
      setLookup({
        error: lookupError instanceof Error ? lookupError.message : "Dictionary lookup failed",
        isLoading: false,
        result: null
      });
    }
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
            lookup={createLookup}
            onApplySuggestion={(suggestion) =>
              setCreateForm((current) => applyDictionarySuggestion(current, suggestion))
            }
            onChange={setCreateForm}
            onIgnoreSuggestions={() =>
              setCreateForm((current) => ignoreDictionarySuggestion(current))
            }
            onLookup={() => void handleDictionaryLookup(createForm, setCreateLookup)}
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
                      lookup={editLookup}
                      onApplySuggestion={(suggestion) =>
                        setEditForm((current) => applyDictionarySuggestion(current, suggestion))
                      }
                      onChange={setEditForm}
                      onIgnoreSuggestions={() =>
                        setEditForm((current) => ignoreDictionarySuggestion(current))
                      }
                      onLookup={() => void handleDictionaryLookup(editForm, setEditLookup)}
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
                        onClick={() => {
                          setEditingEntryId(null);
                          setEditLookup(emptyLookupState);
                        }}
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
  lookup,
  onApplySuggestion,
  onChange,
  onIgnoreSuggestions,
  onLookup
}: {
  form: GlossaryFormState;
  isSubmitting: boolean;
  lookup: DictionaryLookupState;
  onApplySuggestion: (suggestion: AdminDictionaryDefinitionSuggestion) => void;
  onChange: (next: GlossaryFormState) => void;
  onIgnoreSuggestions: () => void;
  onLookup: () => void;
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
      <div className="glossary-lookup-panel">
        <div className="glossary-lookup-actions">
          <button
            className="button-link compact-button secondary-button"
            disabled={isSubmitting || lookup.isLoading}
            onClick={onLookup}
            type="button"
          >
            {lookup.isLoading ? "Looking up..." : "Suggest definition"}
          </button>
          {form.appliedSuggestion ? (
            <button
              className="button-link compact-button secondary-button"
              disabled={isSubmitting}
              onClick={onIgnoreSuggestions}
              type="button"
            >
              Use manual source
            </button>
          ) : null}
        </div>
        <DictionaryLookupResult
          lookup={lookup}
          onApplySuggestion={onApplySuggestion}
        />
      </div>
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
      {form.appliedSuggestion ? (
        <p className="glossary-source-note">
          Dictionary suggestion applied. Edits to this definition will keep dictionary source
          metadata unless manual source is selected.
        </p>
      ) : null}
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

function DictionaryLookupResult({
  lookup,
  onApplySuggestion
}: {
  lookup: DictionaryLookupState;
  onApplySuggestion: (suggestion: AdminDictionaryDefinitionSuggestion) => void;
}) {
  if (lookup.error) {
    return <p className="status error">{lookup.error}</p>;
  }

  if (!lookup.result) {
    return null;
  }

  const { result } = lookup;

  return (
    <div className="glossary-lookup-result" aria-live="polite">
      <p className="status muted">{result.message}</p>

      {result.providerLabel ? (
        <p className="glossary-provider-credit">
          Suggested by {result.providerLabel}. Merriam-Webster API use is limited to the
          client-owned provider account and key.
        </p>
      ) : null}

      {result.spellingSuggestions.length > 0 ? (
        <div className="glossary-spelling-suggestions">
          {result.spellingSuggestions.map((suggestion) => (
            <span className="glossary-alias" key={suggestion}>
              {suggestion}
            </span>
          ))}
        </div>
      ) : null}

      {result.suggestions.length > 0 ? (
        <div className="glossary-suggestion-list">
          {result.suggestions.map((suggestion) => (
            <div className="glossary-suggestion" key={`${suggestion.sourceReference}-${suggestion.definition}`}>
              <p>{suggestion.definition}</p>
              <button
                className="button-link compact-button primary-button"
                onClick={() => onApplySuggestion(suggestion)}
                type="button"
              >
                Apply
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
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
