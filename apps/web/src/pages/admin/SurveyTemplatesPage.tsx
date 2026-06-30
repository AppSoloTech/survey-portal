import type {
  SurveyTemplateKind,
  SurveyTemplateSummary
} from "@survey-portal/shared";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import {
  deleteTemplate as deleteSavedTemplate,
  fetchTemplates,
  updateTemplate
} from "../../api/surveys.js";
import {
  confirmAdminAction,
  readFormText,
  readNullableFormText
} from "../../components/admin/builderForm.js";
import { useSurveyWorkspace } from "./SurveyWorkspaceLayout.js";

export function SurveyTemplatesPage() {
  const { isSubmitting, setFeedback } = useSurveyWorkspace();
  const [templates, setTemplates] = useState<SurveyTemplateSummary[]>([]);
  const [templateKind, setTemplateKind] = useState<SurveyTemplateKind | "all">("all");
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const refreshIdRef = useRef(0);

  const refreshTemplates = useCallback(async (options: { silent?: boolean } = {}) => {
    const refreshId = refreshIdRef.current + 1;
    refreshIdRef.current = refreshId;
    setIsLoading(true);

    try {
      const response = await fetchTemplates({
        kind: templateKind,
        search: submittedSearch
      });

      if (refreshIdRef.current !== refreshId) {
        return;
      }

      setTemplates(response.templates);
    } catch (error) {
      if (refreshIdRef.current !== refreshId) {
        return;
      }

      setTemplates([]);

      if (!options.silent) {
        setFeedback({
          error: error instanceof Error ? error.message : "Could not load templates",
          notice: null
        });
      }
    } finally {
      if (refreshIdRef.current === refreshId) {
        setIsLoading(false);
      }
    }
  }, [setFeedback, submittedSearch, templateKind]);

  useEffect(() => {
    let isActive = true;

    void refreshTemplates({ silent: true });

    function handleFocus() {
      if (isActive) {
        void refreshTemplates({ silent: true });
      }
    }

    window.addEventListener("focus", handleFocus);

    return () => {
      isActive = false;
      window.removeEventListener("focus", handleFocus);
    };
  }, [refreshTemplates]);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedSearch = search.trim();

    if (normalizedSearch === submittedSearch) {
      await refreshTemplates();
      return;
    }

    setSubmittedSearch(normalizedSearch);
  }

  async function handleUpdateTemplate(
    event: FormEvent<HTMLFormElement>,
    template: SurveyTemplateSummary
  ) {
    event.preventDefault();

    const data = new FormData(event.currentTarget);

    try {
      await updateTemplate({
        templateId: template.id,
        name: readFormText(data, "name"),
        description: readNullableFormText(data, "description")
      });
      await refreshTemplates({ silent: true });
      setFeedback({ error: null, notice: "Template updated" });
    } catch (error) {
      setFeedback({
        error: error instanceof Error ? error.message : "Could not update template",
        notice: null
      });
    }
  }

  async function handleDeleteTemplate(template: SurveyTemplateSummary) {
    if (!confirmAdminAction(`Delete template "${template.name}"? This cannot be undone.`)) {
      return;
    }

    try {
      await deleteSavedTemplate(template.id);
      await refreshTemplates({ silent: true });
      setFeedback({ error: null, notice: "Template deleted" });
    } catch (error) {
      setFeedback({
        error: error instanceof Error ? error.message : "Could not delete template",
        notice: null
      });
    }
  }

  return (
    <div className="builder-workspace">
      <section className="builder-form">
        <form onSubmit={(event) => void handleSearch(event)}>
          <div className="builder-section-heading">
            <div>
              <p className="eyebrow">Template library</p>
              <h3>Manage saved templates</h3>
              <p className="builder-heading-note">
                Page and question templates share this library. Renaming a template does not
                change its saved page title or question text.
              </p>
            </div>
            <button
              className="button-link compact-button ghost-button"
              disabled={isLoading}
              type="submit"
            >
              Search
            </button>
          </div>
          <div className="builder-grid two-columns">
            <label>
              Kind
              <select
                disabled={isLoading}
                onChange={(event) => setTemplateKind(event.target.value as SurveyTemplateKind | "all")}
                value={templateKind}
              >
                <option value="all">All templates</option>
                <option value="page">Pages</option>
                <option value="question">Questions</option>
              </select>
            </label>
            <label>
              Search
              <input
                disabled={isLoading}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name, note, source assessment, page, or question"
                value={search}
              />
            </label>
          </div>
        </form>
      </section>

      <div className="builder-stack">
        {templates.length === 0 ? (
          <div className="builder-empty-state compact">
            <strong>{isLoading ? "Loading templates" : "No templates found"}</strong>
            <span>Save page templates from Questions or question templates from a question editor.</span>
          </div>
        ) : null}

        {templates.map((template) => (
          <form
            className="builder-form"
            key={template.id}
            onSubmit={(event) => void handleUpdateTemplate(event, template)}
          >
            <div className="builder-section-heading">
              <div>
                <p className="eyebrow">
                  {template.templateKind === "page" ? "Page template" : "Question template"} ·{" "}
                  {template.questionCount} {template.questionCount === 1 ? "question" : "questions"}
                </p>
                <h3>{template.name}</h3>
                <TemplateSummary template={template} />
              </div>
              <button
                className="button-link compact-button danger-button"
                disabled={isSubmitting || isLoading}
                onClick={() => void handleDeleteTemplate(template)}
                type="button"
              >
                Delete
              </button>
            </div>
            <div className="builder-grid two-columns">
              <label>
                Template name
                <input defaultValue={template.name} disabled={isLoading} name="name" required />
              </label>
              <label>
                Template note
                <input
                  defaultValue={template.description ?? ""}
                  disabled={isLoading}
                  name="description"
                />
              </label>
            </div>
            <button
              className="button-link compact-button secondary-button"
              disabled={isSubmitting || isLoading}
              type="submit"
            >
              Save template metadata
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}

function TemplateSummary({ template }: { template: SurveyTemplateSummary }) {
  return (
    <div className="template-summary-inline">
      <span>
        From {template.sourceSurveyTitle ?? "an assessment"}
        {template.sourcePageTitle ? ` / ${template.sourcePageTitle}` : ""}
        {template.sourceQuestionTitle ? ` / ${template.sourceQuestionTitle}` : ""}
      </span>
      {template.excludedLogicCount > 0 ? (
        <strong>
          {template.excludedLogicCount} conditional{" "}
          {template.excludedLogicCount === 1 ? "rule" : "rules"} not copied
        </strong>
      ) : (
        <span>No conditional rules recorded</span>
      )}
    </div>
  );
}
