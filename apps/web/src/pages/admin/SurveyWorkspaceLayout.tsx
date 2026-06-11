import type { Survey, SurveyStatus } from "@survey-portal/shared";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction
} from "react";
import { Link, NavLink, Outlet, useOutletContext, useParams } from "react-router-dom";

import { fetchAdminSurvey, updateSurveyStatus } from "../../api/surveys.js";
import { confirmAdminAction } from "../../components/admin/builderForm.js";
import {
  SurveyEditStateBanner,
  type TagPreset
} from "../../components/admin/SurveyBuilderComponents.js";

export interface SurveyWorkspaceContextValue {
  survey: Survey;
  isSubmitting: boolean;
  runSurveyMutation: (
    action: () => Promise<{ survey: Survey }>,
    successMessage: string
  ) => Promise<boolean>;
  changeStatus: (status: SurveyStatus) => Promise<void>;
  setFeedback: (feedback: { error: string | null; notice: string | null }) => void;
  customTagPresets: TagPreset[];
  setCustomTagPresets: Dispatch<SetStateAction<TagPreset[]>>;
}

export function useSurveyWorkspace(): SurveyWorkspaceContextValue {
  return useOutletContext<SurveyWorkspaceContextValue>();
}

export function SurveyWorkspaceLayout() {
  const { surveyId: surveyIdParam } = useParams();
  const surveyId = readSurveyIdParam(surveyIdParam);
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [isLoading, setIsLoading] = useState(surveyId !== null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [customTagPresets, setCustomTagPresets] = useState<TagPreset[]>([]);
  // Mutation results are only applied while the layout still shows the survey
  // they were started for, mirroring the fetch effect's stale-response guard.
  const activeSurveyIdRef = useRef<number | null>(surveyId);

  useEffect(() => {
    activeSurveyIdRef.current = surveyId;

    if (surveyId === null) {
      return;
    }

    let isActive = true;

    setIsLoading(true);
    setSurvey(null);
    setLoadError(null);
    setError(null);
    setNotice(null);
    setIsSubmitting(false);

    fetchAdminSurvey(surveyId)
      .then((response) => {
        if (isActive) {
          setSurvey(response.survey);
        }
      })
      .catch((fetchError) => {
        if (isActive) {
          setLoadError(fetchError instanceof Error ? fetchError.message : "Could not load survey");
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
  }, [surveyId]);

  const runSurveyMutation = useCallback(
    async (
      action: () => Promise<{ survey: Survey }>,
      successMessage: string
    ): Promise<boolean> => {
      const mutationSurveyId = activeSurveyIdRef.current;

      setError(null);
      setNotice(null);
      setIsSubmitting(true);

      try {
        const response = await action();

        if (activeSurveyIdRef.current !== mutationSurveyId) {
          return false;
        }

        setSurvey(response.survey);
        setNotice(successMessage);
        return true;
      } catch (mutationError) {
        if (activeSurveyIdRef.current !== mutationSurveyId) {
          return false;
        }

        setError(mutationError instanceof Error ? mutationError.message : "Request failed");
        return false;
      } finally {
        if (activeSurveyIdRef.current === mutationSurveyId) {
          setIsSubmitting(false);
        }
      }
    },
    []
  );

  const changeStatus = useCallback(
    async (status: SurveyStatus): Promise<void> => {
      if (!survey) {
        return;
      }

      if (
        status === "retired" &&
        !confirmAdminAction(
          `Retire "${survey.title}"? Users will no longer be able to start this survey.`
        )
      ) {
        return;
      }

      await runSurveyMutation(
        () =>
          updateSurveyStatus({
            surveyId: survey.id,
            status
          }),
        status === "published"
          ? survey.status === "retired"
            ? "Survey republished"
            : "Survey published"
          : "Survey retired"
      );
    },
    [runSurveyMutation, survey]
  );

  const setFeedback = useCallback(
    (feedback: { error: string | null; notice: string | null }) => {
      setError(feedback.error);
      setNotice(feedback.notice);
    },
    []
  );

  if (surveyId === null || loadError) {
    return <WorkspaceNotFound loadError={loadError} />;
  }

  if (isLoading || !survey) {
    return (
      <section className="page admin-builder-page">
        <p className="status muted">Loading survey...</p>
      </section>
    );
  }

  const isDraft = survey.status === "draft";
  const isPublished = survey.status === "published";
  const isRetired = survey.status === "retired";

  const context: SurveyWorkspaceContextValue = {
    survey,
    isSubmitting,
    runSurveyMutation,
    changeStatus,
    setFeedback,
    customTagPresets,
    setCustomTagPresets
  };

  return (
    <section className="page admin-builder-page">
      <div className="workspace-header">
        <div className="workspace-header-top">
          <div>
            <p className="eyebrow">
              <Link className="workspace-back-link" to="/admin">
                Admin portal
              </Link>{" "}
              / Survey workspace
            </p>
            <h2>{survey.title}</h2>
          </div>
          <div className="workspace-header-actions">
            <span className={`status-pill ${survey.status}`}>{survey.status}</span>
            <button
              className="button-link compact-button primary-button"
              disabled={isSubmitting || (!isDraft && !isRetired)}
              onClick={() => void changeStatus("published")}
              type="button"
            >
              {isRetired ? "Republish survey" : "Publish survey"}
            </button>
            <button
              className="button-link compact-button danger-button"
              disabled={isSubmitting || !isPublished}
              onClick={() => void changeStatus("retired")}
              type="button"
            >
              Retire survey
            </button>
          </div>
        </div>

        <SurveyEditStateBanner survey={survey} />
      </div>

      <nav className="workspace-tabs" aria-label="Survey workspace pages">
        <WorkspaceTab label="Setup" to="setup" />
        <WorkspaceTab label={`Questions (${survey.questions.length})`} to="questions" />
        <WorkspaceTab label={`Logic (${survey.conditionalLogicRules.length})`} to="logic" />
        <WorkspaceTab label="Preview" to="preview" />
        <WorkspaceTab label="Results" to="results" />
      </nav>

      {error ? <p className="status error">{error}</p> : null}
      {notice ? <p className="status success">{notice}</p> : null}

      <Outlet context={context} />
    </section>
  );
}

function WorkspaceTab({ label, to }: { label: string; to: string }) {
  return (
    <NavLink className={({ isActive }) => (isActive ? "workspace-tab active" : "workspace-tab")} to={to}>
      {label}
    </NavLink>
  );
}

function WorkspaceNotFound({ loadError }: { loadError: string | null }) {
  return (
    <section className="page admin-builder-page">
      <div className="page-header">
        <p className="eyebrow">Admin portal</p>
        <h2>Survey not found</h2>
      </div>
      <div className="builder-empty-state">
        <strong>{loadError ?? "This survey does not exist"}</strong>
        <span>
          The survey may have been deleted, or the link may be incorrect. Pick a survey
          from the overview to keep working.
        </span>
        <div className="inline-actions">
          <Link className="button-link compact-button primary-button" to="/admin">
            Back to all surveys
          </Link>
        </div>
      </div>
    </section>
  );
}

function readSurveyIdParam(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
