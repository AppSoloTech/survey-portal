import type { AnonymousSurveyLink, SurveyCategory, SurveyTimingSummary } from "@survey-portal/shared";
import { useEffect, useState, type FormEvent } from "react";

import { createCategory, fetchCategories } from "../../api/categories.js";
import {
  createAnonymousSurveyLink,
  clearSurveyTimingOverride,
  disableAnonymousSurveyLink,
  fetchAnonymousSurveyLinks,
  fetchSurveyTiming,
  rotateAnonymousSurveyLink,
  updateAnonymousSurveyLinkDirectoryListing,
  updateSurveyMetadata,
  updateSurveyTimingOverride
} from "../../api/surveys.js";
import { readFormText, readNullableFormText } from "../../components/admin/builderForm.js";
import { StatusActionPanel } from "../../components/admin/SurveyBuilderComponents.js";
import { useSurveyWorkspace } from "./SurveyWorkspaceLayout.js";

export function SurveySetupPage() {
  const { changeStatus, isSubmitting, reloadSurvey, runSurveyMutation, setFeedback, survey } =
    useSurveyWorkspace();
  const [categories, setCategories] = useState<SurveyCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(survey.categoryId);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [anonymousLinks, setAnonymousLinks] = useState<AnonymousSurveyLink[]>([]);
  const [newAnonymousUrl, setNewAnonymousUrl] = useState<string | null>(null);
  const [anonymousLinkExpiryPreset, setAnonymousLinkExpiryPreset] =
    useState<AnonymousLinkExpiryPreset>("none");
  const [copiedAnonymousLinkId, setCopiedAnonymousLinkId] = useState<number | null>(null);
  const [isLoadingLinks, setIsLoadingLinks] = useState(false);
  const [isMutatingLink, setIsMutatingLink] = useState(false);
  const [timing, setTiming] = useState<SurveyTimingSummary | null>(null);
  const [timingOverrideMinutes, setTimingOverrideMinutes] = useState("");
  const [isLoadingTiming, setIsLoadingTiming] = useState(false);
  const [isSavingTiming, setIsSavingTiming] = useState(false);

  useEffect(() => {
    let isActive = true;

    fetchCategories()
      .then((response) => {
        if (isActive) {
          setCategories(response.categories);
        }
      })
      .catch(() => {
        // The select degrades to "No category"; assignment stays possible
        // once the list loads on a retry.
      });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    setSelectedCategoryId(survey.categoryId);
  }, [survey.id, survey.categoryId]);

  useEffect(() => {
    let isActive = true;

    setIsLoadingLinks(true);
    setNewAnonymousUrl(null);

    fetchAnonymousSurveyLinks(survey.id)
      .then((response) => {
        if (isActive) {
          setAnonymousLinks(response.links);
        }
      })
      .catch(() => {
        if (isActive) {
          setAnonymousLinks([]);
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingLinks(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [survey.id]);

  useEffect(() => {
    let isActive = true;

    setIsLoadingTiming(true);
    setTiming(null);
    setTimingOverrideMinutes("");

    fetchSurveyTiming(survey.id)
      .then((response) => {
        if (isActive) {
          setTiming(response.timing);
          setTimingOverrideMinutes(
            response.timing.adminOverrideSeconds === null
              ? ""
              : String(Math.round(response.timing.adminOverrideSeconds / 60))
          );
        }
      })
      .catch(() => {
        if (isActive) {
          setTiming(null);
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingTiming(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [survey.id]);

  async function handleSaveMetadata(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const data = new FormData(event.currentTarget);

    await runSurveyMutation(
      () =>
        updateSurveyMetadata({
          surveyId: survey.id,
          title: readFormText(data, "title"),
          description: readNullableFormText(data, "description"),
          status: survey.status,
          categoryId: selectedCategoryId
        }),
      "Assessment metadata saved"
    );
  }

  async function handleCreateCategory() {
    const name = newCategoryName.trim();

    if (!name) {
      setFeedback({ error: "Category name is required", notice: null });
      return;
    }

    setIsCreatingCategory(true);

    try {
      const response = await createCategory({ name });
      setCategories((current) =>
        [...current, response.category].sort((left, right) => left.name.localeCompare(right.name))
      );
      setSelectedCategoryId(response.category.id);
      setNewCategoryName("");
      setFeedback({ error: null, notice: `Category "${response.category.name}" created` });
    } catch (createError) {
      setFeedback({
        error: createError instanceof Error ? createError.message : "Could not create category",
        notice: null
      });
    } finally {
      setIsCreatingCategory(false);
    }
  }

  async function handleCreateAnonymousLink() {
    setIsMutatingLink(true);
    setNewAnonymousUrl(null);
    setCopiedAnonymousLinkId(null);

    try {
      const response = await createAnonymousSurveyLink({
        surveyId: survey.id,
        expiresAt: getAnonymousLinkExpiresAt(anonymousLinkExpiryPreset)
      });
      setAnonymousLinks((current) => [response.link, ...current]);
      setNewAnonymousUrl(response.link.publicUrl);
      setFeedback({ error: null, notice: "Anonymous assessment link created" });
      await copyText(response.link.publicUrl)
        .then(() => setCopiedAnonymousLinkId(response.link.id))
        .catch(() => undefined);
    } catch (createError) {
      setFeedback({
        error:
          createError instanceof Error
            ? createError.message
            : "Could not create anonymous assessment link",
        notice: null
      });
    } finally {
      setIsMutatingLink(false);
    }
  }

  async function handleDisableAnonymousLink(linkId: number) {
    setIsMutatingLink(true);
    setCopiedAnonymousLinkId(null);

    try {
      const response = await disableAnonymousSurveyLink({ surveyId: survey.id, linkId });
      setAnonymousLinks((current) =>
        current.map((link) => (link.id === linkId ? response.link : link))
      );
      setFeedback({ error: null, notice: "Anonymous assessment link disabled" });
    } catch (disableError) {
      setFeedback({
        error:
          disableError instanceof Error
            ? disableError.message
            : "Could not disable anonymous assessment link",
        notice: null
      });
    } finally {
      setIsMutatingLink(false);
    }
  }

  async function handleCopyAnonymousLinkRow(link: AnonymousSurveyLink) {
    if (!link.publicUrl) {
      return;
    }

    try {
      await copyText(link.publicUrl);
      setCopiedAnonymousLinkId(link.id);
      setFeedback({ error: null, notice: "Anonymous assessment link copied" });
    } catch {
      setFeedback({ error: "Could not copy link", notice: null });
    }
  }

  async function handleToggleAnonymousDirectoryListing(
    link: AnonymousSurveyLink,
    listedInPublicDirectory: boolean
  ) {
    setIsMutatingLink(true);
    setCopiedAnonymousLinkId(null);

    try {
      const response = await updateAnonymousSurveyLinkDirectoryListing({
        surveyId: survey.id,
        linkId: link.id,
        listedInPublicDirectory
      });
      setAnonymousLinks((current) =>
        current.map((currentLink) => (currentLink.id === link.id ? response.link : currentLink))
      );
      setFeedback({
        error: null,
        notice: listedInPublicDirectory
          ? "Anonymous link listed in the public directory"
          : "Anonymous link removed from the public directory"
      });
    } catch (toggleError) {
      setFeedback({
        error:
          toggleError instanceof Error
            ? toggleError.message
            : "Could not update public directory listing",
        notice: null
      });
    } finally {
      setIsMutatingLink(false);
    }
  }

  async function handleRotateAnonymousLink(linkId: number) {
    setIsMutatingLink(true);
    setNewAnonymousUrl(null);
    setCopiedAnonymousLinkId(null);

    try {
      const response = await rotateAnonymousSurveyLink({
        surveyId: survey.id,
        linkId,
        expiresAt: getAnonymousLinkExpiresAt(anonymousLinkExpiryPreset)
      });
      setAnonymousLinks((current) => [
        response.link,
        ...current.map((link) => (link.id === response.disabledLink.id ? response.disabledLink : link))
      ]);
      setNewAnonymousUrl(response.link.publicUrl);
      setFeedback({ error: null, notice: "Anonymous assessment link rotated" });
      await copyText(response.link.publicUrl)
        .then(() => setCopiedAnonymousLinkId(response.link.id))
        .catch(() => undefined);
    } catch (rotateError) {
      setFeedback({
        error:
          rotateError instanceof Error
            ? rotateError.message
            : "Could not rotate anonymous assessment link",
        notice: null
      });
    } finally {
      setIsMutatingLink(false);
    }
  }

  async function handleSaveTimingOverride(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const minutes = Number(timingOverrideMinutes);

    if (!Number.isInteger(minutes) || minutes < 1) {
      setFeedback({ error: "Override minutes must be a positive whole number", notice: null });
      return;
    }

    setIsSavingTiming(true);

    try {
      const response = await updateSurveyTimingOverride({
        surveyId: survey.id,
        adminOverrideMinutes: minutes
      });
      setTiming(response.timing);
      setTimingOverrideMinutes(String(Math.round((response.timing.adminOverrideSeconds ?? 0) / 60)));
      setFeedback({ error: null, notice: "Assessment timing override saved" });
      await reloadSurvey();
    } catch (timingError) {
      setFeedback({
        error: timingError instanceof Error ? timingError.message : "Could not save timing override",
        notice: null
      });
    } finally {
      setIsSavingTiming(false);
    }
  }

  async function handleClearTimingOverride() {
    setIsSavingTiming(true);

    try {
      const response = await clearSurveyTimingOverride(survey.id);
      setTiming(response.timing);
      setTimingOverrideMinutes("");
      setFeedback({ error: null, notice: "Assessment timing override cleared" });
      await reloadSurvey();
    } catch (timingError) {
      setFeedback({
        error: timingError instanceof Error ? timingError.message : "Could not clear timing override",
        notice: null
      });
    } finally {
      setIsSavingTiming(false);
    }
  }

  const enabledAnonymousLinks = anonymousLinks.filter((link) => link.enabled);
  const disabledAnonymousLinks = anonymousLinks.filter((link) => !link.enabled);

  return (
    <div className="builder-workspace">
      <form className="builder-form" key={`metadata-${survey.id}`} onSubmit={handleSaveMetadata}>
        <div className="builder-section-heading">
          <div>
            <p className="eyebrow">Assessment metadata</p>
            <h3>Title, description, and category</h3>
            <p className="builder-heading-note">
              Draft changes are saved here without publishing the assessment.
            </p>
          </div>
        </div>

        <label>
          Title
          <input defaultValue={survey.title} name="title" required />
        </label>
        <label>
          Description
          <textarea defaultValue={survey.description ?? ""} name="description" rows={3} />
        </label>
        <label>
          Category
          <select
            onChange={(event) =>
              setSelectedCategoryId(event.target.value ? Number(event.target.value) : null)
            }
            value={selectedCategoryId ?? ""}
          >
            <option value="">No category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <div className="inline-category-create">
          <label>
            New category
            <input
              onChange={(event) => setNewCategoryName(event.target.value)}
              placeholder="e.g. Compliance"
              value={newCategoryName}
            />
          </label>
          <button
            className="button-link compact-button secondary-button"
            disabled={isCreatingCategory || !newCategoryName.trim()}
            onClick={() => void handleCreateCategory()}
            type="button"
          >
            {isCreatingCategory ? "Creating..." : "Create category"}
          </button>
        </div>
        <div className="inline-actions">
          <button
            className="button-link compact-button primary-button"
            disabled={isSubmitting}
            type="submit"
          >
            Save metadata
          </button>
        </div>
      </form>

      <StatusActionPanel
        isSubmitting={isSubmitting}
        onStatusChange={changeStatus}
        survey={survey}
      />

      <section className="builder-form survey-timing-panel">
        <div className="builder-section-heading">
          <div>
            <p className="eyebrow">Completion estimate</p>
            <h3>Assessment timing</h3>
            <p className="builder-heading-note">
              Effective time is used by participant-facing assessment payloads.
            </p>
          </div>
          {timing ? (
            <span className={`status-pill timing-source-${timing.estimateSource}`}>
              {formatTimingSource(timing.estimateSource)}
            </span>
          ) : null}
        </div>

        {isLoadingTiming ? <p className="status muted">Loading timing estimate...</p> : null}

        {timing ? (
          <>
            <dl className="timing-summary-grid">
              <div>
                <dt>Effective</dt>
                <dd>{formatDuration(timing.effectiveEstimateSeconds)}</dd>
              </div>
              <div>
                <dt>Derived</dt>
                <dd>{formatDerivedDuration(timing.derivedEstimateSeconds)}</dd>
              </div>
              <div>
                <dt>Samples</dt>
                <dd>{timing.sampleCount}</dd>
              </div>
              <div>
                <dt>Default</dt>
                <dd>{formatDuration(timing.defaultEstimateSeconds)}</dd>
              </div>
              <div>
                <dt>Override</dt>
                <dd>{formatOverrideDuration(timing.adminOverrideSeconds)}</dd>
              </div>
            </dl>

            <form className="timing-override-form" onSubmit={handleSaveTimingOverride}>
              <label>
                Override minutes
                <input
                  min={1}
                  name="adminOverrideMinutes"
                  onChange={(event) => setTimingOverrideMinutes(event.target.value)}
                  placeholder="e.g. 8"
                  type="number"
                  value={timingOverrideMinutes}
                />
              </label>
              <div className="inline-actions">
                <button
                  className="button-link compact-button primary-button"
                  disabled={isSavingTiming || !timingOverrideMinutes.trim()}
                  type="submit"
                >
                  {isSavingTiming ? "Saving..." : "Save override"}
                </button>
                <button
                  className="button-link compact-button secondary-button"
                  disabled={isSavingTiming || timing.adminOverrideSeconds === null}
                  onClick={() => void handleClearTimingOverride()}
                  type="button"
                >
                  Clear override
                </button>
              </div>
            </form>
          </>
        ) : !isLoadingTiming ? (
          <p className="status muted">Timing estimate is unavailable.</p>
        ) : null}
      </section>

      <section className="builder-form anonymous-links-panel">
        <div className="builder-section-heading">
          <div>
            <p className="eyebrow">Anonymous access</p>
            <h3>Tokenized public links</h3>
            <p className="builder-heading-note">
              Published assessments can be completed without an account through scoped links.
            </p>
          </div>
          <div className="anonymous-link-create-controls">
            <label>
              Expires
              <select
                onChange={(event) =>
                  setAnonymousLinkExpiryPreset(event.target.value as AnonymousLinkExpiryPreset)
                }
                value={anonymousLinkExpiryPreset}
              >
                <option value="none">No expiry</option>
                <option value="7">7 days</option>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
              </select>
            </label>
            <button
              className="button-link compact-button primary-button"
              disabled={isMutatingLink || survey.status !== "published"}
              onClick={() => void handleCreateAnonymousLink()}
              type="button"
            >
              {isMutatingLink ? "Working..." : "Create link"}
            </button>
          </div>
        </div>

        {survey.status !== "published" ? (
          <p className="status muted">Publish the assessment before creating anonymous links.</p>
        ) : null}

        {newAnonymousUrl ? (
          <label>
            New link
            <input readOnly value={newAnonymousUrl} />
            <span className="input-helper-text">
              This link was copied to your clipboard and can be revealed again while enabled.
            </span>
          </label>
        ) : null}

        {isLoadingLinks ? <p className="status muted">Loading anonymous links...</p> : null}

        {!isLoadingLinks && anonymousLinks.length === 0 ? (
          <div className="builder-empty-state">
            <strong>No anonymous links</strong>
            <span>Create a tokenized link when this assessment should be available without login.</span>
          </div>
        ) : null}

        {anonymousLinks.length > 0 ? (
          <div className="anonymous-link-list">
            {enabledAnonymousLinks.some((link) => !link.publicUrl) ? (
              <p className="status muted">
                Some enabled links were created before repeat-copy support. Rotate one to create a copyable replacement.
              </p>
            ) : null}
            {enabledAnonymousLinks.length === 0 ? (
              <div className="builder-empty-state compact-empty-state">
                <strong>No enabled links</strong>
                <span>Create or rotate a tokenized link when this assessment should be available without login.</span>
              </div>
            ) : null}
            {enabledAnonymousLinks.map((link) => {
              const publicUrl = link.publicUrl;

              return (
                <div className="anonymous-link-row" key={link.id}>
                  <div className="anonymous-link-main">
                    <div className="anonymous-link-meta">
                      <strong>Link #{link.id}</strong>
                      <span className="results-attempt-email">
                        Created {formatDateTime(link.createdAt)}
                      </span>
                      <span className="results-attempt-email">
                        Expires {formatAnonymousLinkExpiry(link.expiresAt)}
                      </span>
                      <span className={`status-pill ${link.enabled ? "published" : "retired"}`}>
                        {link.enabled ? "enabled" : "disabled"}
                      </span>
                      {link.listedInPublicDirectory ? (
                        <span className="status-pill published">directory</span>
                      ) : null}
                      {copiedAnonymousLinkId === link.id ? (
                        <span className="status-pill published">copied</span>
                      ) : null}
                    </div>
                    <label className="anonymous-directory-toggle">
                      <input
                        className="visually-hidden"
                        checked={link.listedInPublicDirectory}
                        disabled={isMutatingLink || !link.enabled || !publicUrl}
                        onChange={(event) =>
                          void handleToggleAnonymousDirectoryListing(link, event.target.checked)
                        }
                        type="checkbox"
                      />
                      <span aria-hidden="true" className="anonymous-directory-switch">
                        <span />
                      </span>
                      <span className="anonymous-directory-toggle-copy">
                        <span>Show on anonymous assessments page</span>
                        <small>Allow this link to appear in the public directory.</small>
                      </span>
                    </label>
                    {link.enabled ? (
                      <details className="anonymous-link-reveal">
                        <summary>Show public link</summary>
                        {publicUrl ? (
                          <div className="anonymous-link-copy-row">
                            <input aria-label={`Public URL for link ${link.id}`} readOnly value={publicUrl} />
                            <button
                              className="button-link compact-button secondary-button"
                              onClick={() => void handleCopyAnonymousLinkRow(link)}
                              type="button"
                            >
                              Copy
                            </button>
                          </div>
                        ) : (
                          <p className="status muted">
                            This link was created before repeat-copy support. Rotate it to create a copyable replacement.
                          </p>
                        )}
                      </details>
                    ) : null}
                  </div>
                  {link.enabled ? (
                    <div className="anonymous-link-row-actions">
                      <button
                        className="button-link compact-button secondary-button"
                        disabled={isMutatingLink}
                        onClick={() => void handleRotateAnonymousLink(link.id)}
                        type="button"
                      >
                        Rotate
                      </button>
                      <button
                        className="button-link compact-button secondary-button"
                        disabled={isMutatingLink}
                        onClick={() => void handleDisableAnonymousLink(link.id)}
                        type="button"
                      >
                        Disable
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
            {disabledAnonymousLinks.length > 0 ? (
              <details className="anonymous-disabled-links">
                <summary>Disabled links ({disabledAnonymousLinks.length})</summary>
                <div className="anonymous-disabled-link-list">
                  {disabledAnonymousLinks.map((link) => (
                    <div className="anonymous-link-row disabled" key={link.id}>
                      <div className="anonymous-link-main">
                        <div className="anonymous-link-meta">
                          <strong>Link #{link.id}</strong>
                          <span className="results-attempt-email">
                            Created {formatDateTime(link.createdAt)}
                          </span>
                          <span className="results-attempt-email">
                            Disabled {formatDateTime(link.disabledAt)}
                          </span>
                          <span className="status-pill retired">disabled</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}

type AnonymousLinkExpiryPreset = "none" | "7" | "30" | "90";

async function copyText(value: string): Promise<void> {
  if (!navigator.clipboard) {
    return;
  }

  await navigator.clipboard.writeText(value);
}

function formatDateTime(isoDate: string | null): string {
  if (!isoDate) {
    return "-";
  }

  const parsed = new Date(isoDate);

  return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleString();
}

function formatAnonymousLinkExpiry(isoDate: string | null): string {
  return isoDate ? formatDateTime(isoDate) : "never";
}

function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));

  return minutes === 1 ? "1 min" : `${minutes} min`;
}

function formatDerivedDuration(seconds: number | null): string {
  return seconds === null ? "No sample" : formatDuration(seconds);
}

function formatOverrideDuration(seconds: number | null): string {
  return seconds === null ? "None" : formatDuration(seconds);
}

function formatTimingSource(source: SurveyTimingSummary["estimateSource"]): string {
  if (source === "admin_override") {
    return "admin override";
  }

  return source;
}

function getAnonymousLinkExpiresAt(preset: AnonymousLinkExpiryPreset): string | null {
  if (preset === "none") {
    return null;
  }

  const days = Number(preset);
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}
