import type {
  AdminDictionaryDefinitionSuggestion,
  AdminDictionaryLookupResponse,
  AdminGlossaryEntry,
  AdminGlossaryQuestionSearchMatch,
  AdminGlossaryQuestionSearchResult
} from "@survey-portal/shared";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type Ref
} from "react";

import {
  archiveGlossaryEntry,
  createGlossaryEntry,
  fetchGlossaryEntries,
  lookupGlossaryDefinition,
  searchGlossaryQuestions,
  updateGlossaryEntry
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

const glossaryQuestionSearchMinLength = 2;
const glossaryQuestionSearchLimit = 20;
const glossaryQuestionSearchDebounceMs = 250;

type GlossaryAdminTab = "entries" | "question-search";

export interface QuestionSearchState {
  error: string | null;
  isLoading: boolean;
  lastQuery: string;
  minQueryLength: number;
  results: AdminGlossaryQuestionSearchResult[];
}

interface QuestionSearchActionMessage {
  text: string;
  variant: "error" | "success";
}

interface SelectedQuestionSourceContext {
  candidateTerm: string;
  result: AdminGlossaryQuestionSearchResult;
}

export interface GlossaryDuplicateMatch {
  canonicalTerm: string;
  entryId: number;
  isCanonical: boolean;
  matchText: string;
}

const emptyQuestionSearchState: QuestionSearchState = {
  error: null,
  isLoading: false,
  lastQuery: "",
  minQueryLength: glossaryQuestionSearchMinLength,
  results: []
};

export function AdminGlossaryPage() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<GlossaryAdminTab>("entries");
  const [entries, setEntries] = useState<AdminGlossaryEntry[]>([]);
  const [createForm, setCreateForm] = useState<GlossaryFormState>(emptyGlossaryForm);
  const [editForm, setEditForm] = useState<GlossaryFormState>(emptyGlossaryForm);
  const [createLookup, setCreateLookup] = useState<DictionaryLookupState>(emptyLookupState);
  const [editLookup, setEditLookup] = useState<DictionaryLookupState>(emptyLookupState);
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questionSearchInput, setQuestionSearchInput] = useState("");
  const [questionSearch, setQuestionSearch] =
    useState<QuestionSearchState>(emptyQuestionSearchState);
  const [questionSearchActionMessage, setQuestionSearchActionMessage] =
    useState<QuestionSearchActionMessage | null>(null);
  const [selectedQuestionSource, setSelectedQuestionSource] =
    useState<SelectedQuestionSourceContext | null>(null);
  const createFormRef = useRef<HTMLFormElement>(null);
  const createDefinitionRef = useRef<HTMLTextAreaElement>(null);
  const questionSearchRequestId = useRef(0);

  const activeEntries = useMemo(
    () => entries.filter((entry) => entry.isEnabled),
    [entries]
  );
  const createDuplicateMatch = useMemo(
    () => findDuplicateGlossaryMatch(entries, createForm.canonicalTerm),
    [createForm.canonicalTerm, entries]
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

  useEffect(() => {
    const trimmedQuery = questionSearchInput.trim();

    if (trimmedQuery.length < questionSearch.minQueryLength) {
      questionSearchRequestId.current += 1;
      setQuestionSearch((current) => ({
        ...current,
        error: null,
        isLoading: false,
        lastQuery: trimmedQuery,
        results: []
      }));
      return;
    }

    const requestId = questionSearchRequestId.current + 1;
    questionSearchRequestId.current = requestId;
    const controller = new AbortController();

    setQuestionSearch((current) => ({
      ...current,
      error: null,
      isLoading: true,
      lastQuery: trimmedQuery,
      results: current.lastQuery === trimmedQuery ? current.results : []
    }));

    const debounceTimer = window.setTimeout(() => {
      searchGlossaryQuestions(trimmedQuery, {
        limit: glossaryQuestionSearchLimit,
        signal: controller.signal
      })
        .then((response) => {
          if (questionSearchRequestId.current !== requestId) {
            return;
          }

          setQuestionSearch({
            error: null,
            isLoading: false,
            lastQuery: response.query,
            minQueryLength: response.minQueryLength,
            results: response.results
          });
        })
        .catch((searchError) => {
          if (questionSearchRequestId.current !== requestId || isAbortError(searchError)) {
            return;
          }

          setQuestionSearch((current) => ({
            ...current,
            error: searchError instanceof Error ? searchError.message : "Question search failed",
            isLoading: false,
            results: []
          }));
        });
    }, glossaryQuestionSearchDebounceMs);

    return () => {
      window.clearTimeout(debounceTimer);
      controller.abort();
    };
  }, [questionSearch.minQueryLength, questionSearchInput]);

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
      setSelectedQuestionSource(null);
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

  function resetCreateEntry() {
    setCreateForm(emptyGlossaryForm);
    setCreateLookup(emptyLookupState);
    setSelectedQuestionSource(null);
  }

  function handleStartEntryFromQuestionSearch(result: AdminGlossaryQuestionSearchResult) {
    const candidateTerm = questionSearchInput.trim();

    if (candidateTerm.length < questionSearch.minQueryLength) {
      const message = `Enter at least ${questionSearch.minQueryLength} characters before starting a Glossary entry.`;
      setQuestionSearchActionMessage({ text: message, variant: "error" });
      toast.error(message);
      return;
    }

    const duplicateMatch = findDuplicateGlossaryMatch(entries, candidateTerm);

    if (duplicateMatch) {
      const message = formatGlossaryDuplicateMessage(candidateTerm, duplicateMatch);
      setQuestionSearchActionMessage({ text: message, variant: "error" });
      toast.error(message);
      return;
    }

    if (
      hasUnsavedGlossaryFormValues(createForm) &&
      !confirmAdminAction(
        "Replace the unsaved create-entry form with this search candidate?"
      )
    ) {
      return;
    }

    setCreateForm({
      ...emptyGlossaryForm,
      canonicalTerm: candidateTerm
    });
    setCreateLookup(emptyLookupState);
    setSelectedQuestionSource({ candidateTerm, result });
    setQuestionSearchActionMessage({
      text: `"${candidateTerm}" is ready to review in the create-entry form.`,
      variant: "success"
    });
    setActiveTab("entries");
    toast.success("Glossary entry draft started");
    window.requestAnimationFrame(() => {
      createFormRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      createDefinitionRef.current?.focus();
    });
  }

  function selectTab(nextTab: GlossaryAdminTab) {
    setActiveTab(nextTab);
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentTab: GlossaryAdminTab) {
    const tabs: GlossaryAdminTab[] = ["entries", "question-search"];
    const currentIndex = tabs.indexOf(currentTab);
    let nextTab: GlossaryAdminTab | null = null;

    if (event.key === "ArrowRight") {
      nextTab = tabs[(currentIndex + 1) % tabs.length];
    } else if (event.key === "ArrowLeft") {
      nextTab = tabs[(currentIndex - 1 + tabs.length) % tabs.length];
    } else if (event.key === "Home") {
      nextTab = tabs[0];
    } else if (event.key === "End") {
      nextTab = tabs[tabs.length - 1];
    }

    if (!nextTab) {
      return;
    }

    event.preventDefault();
    setActiveTab(nextTab);
    window.requestAnimationFrame(() => {
      document.getElementById(getGlossaryTabId(nextTab))?.focus();
    });
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

      <div className="admin-tab-list" aria-label="Glossary sections" role="tablist">
        <button
          aria-controls="glossary-entries-panel"
          aria-selected={activeTab === "entries"}
          className="admin-tab"
          id="glossary-entries-tab"
          onClick={() => selectTab("entries")}
          onKeyDown={(event) => handleTabKeyDown(event, "entries")}
          role="tab"
          tabIndex={activeTab === "entries" ? 0 : -1}
          type="button"
        >
          Entries
        </button>
        <button
          aria-controls="glossary-question-search-panel"
          aria-selected={activeTab === "question-search"}
          className="admin-tab"
          id="glossary-question-search-tab"
          onClick={() => selectTab("question-search")}
          onKeyDown={(event) => handleTabKeyDown(event, "question-search")}
          role="tab"
          tabIndex={activeTab === "question-search" ? 0 : -1}
          type="button"
        >
          Question search
        </button>
      </div>

      <div
        aria-labelledby="glossary-entries-tab"
        hidden={activeTab !== "entries"}
        id="glossary-entries-panel"
        role="tabpanel"
      >
        <div className="glossary-layout">
          <form
            className="builder-form compact-builder-form glossary-form"
            ref={createFormRef}
            onSubmit={handleCreateEntry}
          >
            <h3>Create entry</h3>
            {selectedQuestionSource ? (
              <QuestionSourceContextPanel source={selectedQuestionSource} />
            ) : null}
            <GlossaryFields
              definitionRef={createDefinitionRef}
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
            {createDuplicateMatch ? (
              <p className="status error">
                {formatGlossaryDuplicateMessage(createForm.canonicalTerm, createDuplicateMatch)}
              </p>
            ) : null}
            <div className="glossary-form-actions">
              <button
                className="button-link compact-button primary-button"
                disabled={isSubmitting || Boolean(createDuplicateMatch)}
                type="submit"
              >
                Add entry
              </button>
              <button
                className="button-link compact-button secondary-button"
                disabled={isSubmitting}
                onClick={resetCreateEntry}
                type="button"
              >
                Reset
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
      </div>

      <div
        aria-labelledby="glossary-question-search-tab"
        hidden={activeTab !== "question-search"}
        id="glossary-question-search-panel"
        role="tabpanel"
      >
        <QuestionSearchPanel
          actionMessage={questionSearchActionMessage}
          query={questionSearchInput}
          search={questionSearch}
          onStartEntry={handleStartEntryFromQuestionSearch}
          onQueryChange={(nextQuery) => {
            setQuestionSearchInput(nextQuery);
            setQuestionSearchActionMessage(null);
          }}
        />
      </div>
    </section>
  );
}

function QuestionSearchPanel({
  actionMessage,
  onQueryChange,
  onStartEntry,
  query,
  search
}: {
  actionMessage: QuestionSearchActionMessage | null;
  onQueryChange: (nextQuery: string) => void;
  onStartEntry: (result: AdminGlossaryQuestionSearchResult) => void;
  query: string;
  search: QuestionSearchState;
}) {
  const trimmedQuery = query.trim();
  const statusMessage = formatQuestionSearchLiveMessage(search, trimmedQuery);

  return (
    <section className="glossary-question-search">
      <div className="builder-form compact-builder-form glossary-question-search-form">
        <label htmlFor="glossary-question-search-input">
          Search assessment question text
          <input
            autoComplete="off"
            id="glossary-question-search-input"
            maxLength={500}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Start typing a term or full question"
            type="search"
            value={query}
          />
        </label>
      </div>

      <p className="visually-hidden" role="status" aria-live="polite">
        {statusMessage}
      </p>

      {actionMessage ? (
        <p className={`status ${actionMessage.variant}`}>{actionMessage.text}</p>
      ) : null}

      <div className="glossary-question-search-results" aria-label="Question search results">
        {trimmedQuery.length < search.minQueryLength ? (
          <div className="builder-empty-state">
            <strong>Search is ready</strong>
            <span>Enter at least {search.minQueryLength} characters.</span>
          </div>
        ) : null}

        {trimmedQuery.length >= search.minQueryLength && search.isLoading ? (
          <p className="status muted">Searching question text...</p>
        ) : null}

        {trimmedQuery.length >= search.minQueryLength && search.error ? (
          <p className="status error">{search.error}</p>
        ) : null}

        {trimmedQuery.length >= search.minQueryLength &&
        !search.isLoading &&
        !search.error &&
        search.results.length === 0 ? (
          <div className="builder-empty-state">
            <strong>No matching questions</strong>
            <span>No assessment question text matches "{trimmedQuery}".</span>
          </div>
        ) : null}

        {search.results.length > 0 ? (
          <QuestionSearchResults
            results={search.results}
            onStartEntry={onStartEntry}
          />
        ) : null}
      </div>
    </section>
  );
}

function QuestionSearchResults({
  onStartEntry,
  results
}: {
  onStartEntry: (result: AdminGlossaryQuestionSearchResult) => void;
  results: AdminGlossaryQuestionSearchResult[];
}) {
  return (
    <div className="glossary-question-result-list">
      {results.map((result) => (
        <article className="glossary-question-result" key={result.question.id}>
          <div className="glossary-question-result-header">
            <div>
              <h3>{result.assessment.title}</h3>
              <p>
                {result.page
                  ? `${result.page.title} - Page ${result.page.displayOrder}`
                  : "Unassigned page"}{" "}
                - Question {result.question.displayOrder}
              </p>
            </div>
            <span className={`status-pill ${result.assessment.status}`}>
              {result.assessment.status}
            </span>
          </div>

          <p className="glossary-question-text">
            <QuestionSearchHighlight
              match={result.match}
              questionText={result.question.questionText}
            />
          </p>

          <div className="glossary-question-result-actions">
            <button
              className="button-link compact-button primary-button"
              onClick={() => onStartEntry(result)}
              type="button"
            >
              Start entry from search
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

function QuestionSourceContextPanel({
  source
}: {
  source: SelectedQuestionSourceContext;
}) {
  const { result } = source;

  return (
    <aside className="glossary-source-context" aria-label="Selected question source context">
      <div>
        <strong>Source context</strong>
        <span>Informational only. This question reference is not saved with the entry.</span>
      </div>
      <dl>
        <div>
          <dt>Prefilled term</dt>
          <dd>{source.candidateTerm}</dd>
        </div>
        <div>
          <dt>Assessment</dt>
          <dd>
            {result.assessment.title} ({result.assessment.status})
          </dd>
        </div>
        <div>
          <dt>Location</dt>
          <dd>
            {result.page
              ? `${result.page.title} - Page ${result.page.displayOrder}`
              : "Unassigned page"}{" "}
            - Question {result.question.displayOrder}
          </dd>
        </div>
      </dl>
      <p className="glossary-source-question">
        <QuestionSearchHighlight
          match={result.match}
          questionText={result.question.questionText}
        />
      </p>
    </aside>
  );
}

function QuestionSearchHighlight({
  match,
  questionText
}: {
  match: AdminGlossaryQuestionSearchMatch;
  questionText: string;
}) {
  const parts = splitQuestionSearchMatch(questionText, match);

  if (!parts.highlighted) {
    return <>{questionText}</>;
  }

  return (
    <>
      {parts.before}
      <mark>{parts.highlighted}</mark>
      {parts.after}
    </>
  );
}

export function splitQuestionSearchMatch(
  questionText: string,
  match: AdminGlossaryQuestionSearchMatch
): { after: string; before: string; highlighted: string } {
  const start = clampMatchOffset(match.start, questionText.length);
  const end = Math.max(start, clampMatchOffset(match.end, questionText.length));

  return {
    after: questionText.slice(end),
    before: questionText.slice(0, start),
    highlighted: questionText.slice(start, end)
  };
}

export function formatQuestionSearchLiveMessage(
  search: Pick<QuestionSearchState, "error" | "isLoading" | "minQueryLength" | "results">,
  trimmedQuery: string
): string {
  if (trimmedQuery.length < search.minQueryLength) {
    return `Enter at least ${search.minQueryLength} characters to search questions.`;
  }

  if (search.isLoading) {
    return "Searching question text.";
  }

  if (search.error) {
    return `Question search error: ${search.error}`;
  }

  return `${formatCount(search.results.length, "matching question")} found.`;
}

function GlossaryFields({
  definitionRef,
  form,
  isSubmitting,
  lookup,
  onApplySuggestion,
  onChange,
  onIgnoreSuggestions,
  onLookup
}: {
  definitionRef?: Ref<HTMLTextAreaElement>;
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
          ref={definitionRef}
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

function clampMatchOffset(value: number, length: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(Math.max(Math.trunc(value), 0), length);
}

export function findDuplicateGlossaryMatch(
  entries: AdminGlossaryEntry[],
  candidateTerm: string
): GlossaryDuplicateMatch | null {
  const normalizedCandidate = normalizeGlossaryCandidateText(candidateTerm);

  if (!normalizedCandidate) {
    return null;
  }

  for (const entry of entries) {
    if (normalizeGlossaryCandidateText(entry.canonicalTerm) === normalizedCandidate) {
      return {
        canonicalTerm: entry.canonicalTerm,
        entryId: entry.id,
        isCanonical: true,
        matchText: entry.canonicalTerm
      };
    }

    const duplicateAlias = entry.aliases.find(
      (alias) => normalizeGlossaryCandidateText(alias.matchText) === normalizedCandidate
    );

    if (duplicateAlias) {
      return {
        canonicalTerm: entry.canonicalTerm,
        entryId: entry.id,
        isCanonical: duplicateAlias.isCanonical,
        matchText: duplicateAlias.matchText
      };
    }
  }

  return null;
}

export function hasUnsavedGlossaryFormValues(form: GlossaryFormState): boolean {
  return Boolean(
    form.canonicalTerm.trim() ||
      form.definition.trim() ||
      form.aliasesText.trim()
  );
}

export function formatGlossaryDuplicateMessage(
  candidateTerm: string,
  duplicateMatch: GlossaryDuplicateMatch
): string {
  const matchKind = duplicateMatch.isCanonical ? "canonical term" : "alias";

  return `"${candidateTerm.trim()}" already exists as the ${matchKind} "${duplicateMatch.matchText}" on "${duplicateMatch.canonicalTerm}".`;
}

function normalizeGlossaryCandidateText(value: string): string {
  return value.trim().toLowerCase();
}

function getGlossaryTabId(tab: GlossaryAdminTab): string {
  return tab === "entries" ? "glossary-entries-tab" : "glossary-question-search-tab";
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
