import type { Survey, SurveyCategory } from "@survey-portal/shared";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  createCategory,
  deleteCategory,
  fetchCategories,
  updateCategory
} from "../../api/categories.js";
import {
  createSurvey,
  deleteSurvey,
  duplicateSurvey,
  fetchAdminSurveys,
  fetchSurveyReport
} from "../../api/surveys.js";
import { confirmAdminAction, readFormText, readNullableFormText } from "../../components/admin/builderForm.js";
import { useToast } from "../../components/ToastProvider.js";

const surveysPerPage = 10;

interface CompletionSummary {
  completed: number;
  total: number;
}

export function AdminSurveysOverview() {
  const navigate = useNavigate();
  const toast = useToast();
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [completionBySurveyId, setCompletionBySurveyId] = useState<
    Map<number, CompletionSummary>
  >(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let isActive = true;

    fetchAdminSurveys()
      .then((response) => {
        if (isActive) {
          setSurveys(response.surveys);
        }
      })
      .catch((loadError) => {
        if (isActive) {
          setError(loadError instanceof Error ? loadError.message : "Could not load surveys");
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

  const pageCount = Math.max(1, Math.ceil(surveys.length / surveysPerPage));
  const safePage = Math.min(page, pageCount);
  const pagedSurveys = useMemo(
    () => surveys.slice((safePage - 1) * surveysPerPage, safePage * surveysPerPage),
    [safePage, surveys]
  );

  // Completion indicators are loaded per visible page; drafts cannot have
  // attempts so they never need a report request.
  useEffect(() => {
    let isActive = true;

    const reportableSurveys = pagedSurveys.filter(
      (survey) => survey.status !== "draft" && !completionBySurveyId.has(survey.id)
    );

    if (reportableSurveys.length === 0) {
      return;
    }

    void Promise.all(
      reportableSurveys.map(async (survey) => {
        try {
          const reportResponse = await fetchSurveyReport(survey.id);
          return [survey.id, reportResponse.report] as const;
        } catch {
          return null;
        }
      })
    ).then((reports) => {
      if (!isActive) {
        return;
      }

      setCompletionBySurveyId((current) => {
        const next = new Map(current);

        for (const entry of reports) {
          if (entry) {
            next.set(entry[0], {
              completed: entry[1].attemptCounts.completed,
              total: entry[1].attemptCounts.total
            });
          }
        }

        return next;
      });
    });

    return () => {
      isActive = false;
    };
  }, [completionBySurveyId, pagedSurveys]);

  async function handleCreateSurvey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await createSurvey({
        title: readFormText(data, "title"),
        description: readNullableFormText(data, "description")
      });

      navigate(`/admin/surveys/${response.survey.id}/setup`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Request failed");
      setIsSubmitting(false);
    }
  }

  // Templates workflow: any survey (drafts included) can serve as a
  // template — duplicating opens an editable draft copy of its full tree.
  async function handleDuplicateSurvey(survey: Survey) {
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await duplicateSurvey(survey.id);
      toast.success(`Draft copy of "${survey.title}" created`);
      navigate(`/admin/surveys/${response.survey.id}/setup`);
    } catch (duplicateError) {
      setError(duplicateError instanceof Error ? duplicateError.message : "Request failed");
      setIsSubmitting(false);
    }
  }

  async function handleDeleteSurvey(survey: Survey) {
    if (
      !confirmAdminAction(
        `Delete "${survey.title}"? Users will lose access immediately. Collected responses are kept for analytics.`
      )
    ) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await deleteSurvey(survey.id);
      setSurveys((current) => current.filter((item) => item.id !== survey.id));
      toast.success(`Survey "${survey.title}" deleted`);
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
        <h2>Admin workspace</h2>
        <p>
          Create, maintain, publish, and retire data-driven surveys. Manage user
          access and reporting configuration from the admin tools.
        </p>
      </div>

      {error ? <p className="status error">{error}</p> : null}

      <div className="admin-overview-layout">
        <div className="admin-overview-side">
          <form className="builder-form compact-builder-form" onSubmit={handleCreateSurvey}>
            <h3>Create survey</h3>
            <label>
              Title
              <input name="title" required />
            </label>
            <label>
              Description
              <textarea name="description" rows={3} />
            </label>
            <button
              className="button-link compact-button primary-button"
              disabled={isSubmitting}
              type="submit"
            >
              Create draft survey
            </button>
            <p className="builder-heading-note">
              New surveys start as drafts and open in the survey workspace.
            </p>
          </form>

          <AdminToolsPanel />

          <CategoryManagerPanel />
        </div>

        <div className="overview-survey-list" aria-label="Admin survey list">
          {isLoading ? <p className="status muted">Loading surveys...</p> : null}
          {!isLoading && surveys.length === 0 ? (
            <div className="builder-empty-state">
              <strong>No surveys yet</strong>
              <span>Create the first survey to start building questions and logic.</span>
            </div>
          ) : null}
          {pagedSurveys.map((survey) => (
            <div className="overview-survey-row" key={survey.id}>
              <Link className="overview-survey-main" to={`/admin/surveys/${survey.id}`}>
                <strong>{survey.title}</strong>
                <div className="overview-survey-meta">
                  {survey.categoryName ? <span>{survey.categoryName}</span> : null}
                  <span>{formatCount(survey.questions.length, "question")}</span>
                  <span>{formatCount(survey.conditionalLogicRules.length, "jump rule")}</span>
                  <span>Updated {formatDate(survey.updatedAt)}</span>
                  {formatCompletion(completionBySurveyId.get(survey.id)) ? (
                    <span>{formatCompletion(completionBySurveyId.get(survey.id))}</span>
                  ) : null}
                </div>
              </Link>
              <div className="overview-survey-actions">
                <span className={`status-pill ${survey.status}`}>{survey.status}</span>
                <button
                  className="button-link compact-button secondary-button"
                  disabled={isSubmitting}
                  onClick={() => void handleDuplicateSurvey(survey)}
                  title="Create an editable draft copy of this survey"
                  type="button"
                >
                  Duplicate
                </button>
                <button
                  className="button-link compact-button danger-button"
                  disabled={isSubmitting}
                  onClick={() => void handleDeleteSurvey(survey)}
                  type="button"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
          {pageCount > 1 ? (
            <div className="pagination-row" aria-label="Survey list pages">
              <button
                className="button-link compact-button secondary-button"
                disabled={safePage <= 1}
                onClick={() => setPage(safePage - 1)}
                type="button"
              >
                Previous
              </button>
              <span className="pagination-status">
                Page {safePage} of {pageCount}
              </span>
              <button
                className="button-link compact-button secondary-button"
                disabled={safePage >= pageCount}
                onClick={() => setPage(safePage + 1)}
                type="button"
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function AdminToolsPanel() {
  return (
    <section className="builder-form compact-builder-form admin-tools-panel">
      <h3>Admin tools</h3>
      <p className="builder-heading-note">Manage people and reusable reporting configuration.</p>
      <div className="admin-tool-list">
        <Link className="admin-tool-link" to="/admin/users">
          <span>
            <strong>Users</strong>
            <small>Promote users and manage account roles.</small>
          </span>
        </Link>
        <Link className="admin-tool-link" to="/admin/tags">
          <span>
            <strong>Tags</strong>
            <small>Review hidden tag definitions used in reporting.</small>
          </span>
        </Link>
        <Link className="admin-tool-link" to="/admin/glossary">
          <span>
            <strong>Glossary</strong>
            <small>Manage participant-facing terms and definitions.</small>
          </span>
        </Link>
        <Link className="admin-tool-link" to="/admin/performance">
          <span>
            <strong>Performance</strong>
            <small>Review CLI load-test reports and capacity recommendations.</small>
          </span>
        </Link>
        <Link className="admin-tool-link" to="/admin/releases">
          <span>
            <strong>Software updates</strong>
            <small>Review the implementation roadmap, deployed versions, and patch notes.</small>
          </span>
        </Link>
      </div>
    </section>
  );
}

function CategoryManagerPanel() {
  const toast = useToast();
  const [categories, setCategories] = useState<SurveyCategory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isActive = true;

    fetchCategories()
      .then((response) => {
        if (isActive) {
          setCategories(response.categories);
        }
      })
      .catch((loadError) => {
        if (isActive) {
          setError(loadError instanceof Error ? loadError.message : "Could not load categories");
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = readFormText(new FormData(form), "name");

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await createCategory({ name });
      setCategories((current) =>
        [...current, response.category].sort((left, right) => left.name.localeCompare(right.name))
      );
      toast.success(`Category "${response.category.name}" created`);
      form.reset();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Request failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRename(category: SurveyCategory) {
    const name = window.prompt("Rename category", category.name)?.trim();

    if (!name || name === category.name) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await updateCategory({ categoryId: category.id, name });
      setCategories((current) =>
        current
          .map((item) => (item.id === category.id ? response.category : item))
          .sort((left, right) => left.name.localeCompare(right.name))
      );
      toast.success("Category renamed");
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : "Request failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(category: SurveyCategory) {
    if (
      !confirmAdminAction(
        `Delete category "${category.name}"? Surveys assigned to it become uncategorized.`
      )
    ) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await deleteCategory({ categoryId: category.id });
      setCategories((current) => current.filter((item) => item.id !== category.id));
      toast.success(`Category "${category.name}" deleted`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Request failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="builder-form compact-builder-form category-manager-panel">
      <h3>Survey categories</h3>
      <p className="builder-heading-note">
        Group surveys for the dashboard. Assign a category on each survey&apos;s setup page.
      </p>

      {error ? <p className="status error">{error}</p> : null}

      {categories.length === 0 ? (
        <p className="status muted">No categories yet.</p>
      ) : (
        <ul className="category-manager-list">
          {categories.map((category) => (
            <li key={category.id}>
              <span>{category.name}</span>
              <span className="inline-actions">
                <button
                  className="button-link compact-button ghost-button"
                  disabled={isSubmitting}
                  onClick={() => void handleRename(category)}
                  type="button"
                >
                  Rename
                </button>
                <button
                  className="button-link compact-button danger-button"
                  disabled={isSubmitting}
                  onClick={() => void handleDelete(category)}
                  type="button"
                >
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <form className="inline-category-create" onSubmit={handleCreate}>
        <label>
          New category
          <input name="name" placeholder="e.g. Compliance" required />
        </label>
        <button
          className="button-link compact-button secondary-button"
          disabled={isSubmitting}
          type="submit"
        >
          Add category
        </button>
      </form>
    </section>
  );
}

function formatCount(count: number, singularLabel: string): string {
  return `${count} ${singularLabel}${count === 1 ? "" : "s"}`;
}

function formatCompletion(summary: CompletionSummary | undefined): string | null {
  if (!summary || summary.total === 0) {
    return null;
  }

  return `${summary.completed}/${summary.total} completed`;
}

function formatDate(isoDate: string): string {
  const parsed = new Date(isoDate);
  return Number.isNaN(parsed.getTime()) ? "recently" : parsed.toLocaleDateString();
}
