import type { FormEvent } from "react";

import { updateSurveyMetadata } from "../../api/surveys.js";
import { readFormText, readNullableFormText } from "../../components/admin/builderForm.js";
import { StatusActionPanel } from "../../components/admin/SurveyBuilderComponents.js";
import { useSurveyWorkspace } from "./SurveyWorkspaceLayout.js";

export function SurveySetupPage() {
  const { changeStatus, isSubmitting, runSurveyMutation, survey } = useSurveyWorkspace();

  async function handleSaveMetadata(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const data = new FormData(event.currentTarget);

    await runSurveyMutation(
      () =>
        updateSurveyMetadata({
          surveyId: survey.id,
          title: readFormText(data, "title"),
          description: readNullableFormText(data, "description"),
          status: survey.status
        }),
      "Survey metadata saved"
    );
  }

  return (
    <div className="builder-workspace">
      <form className="builder-form" key={`metadata-${survey.id}`} onSubmit={handleSaveMetadata}>
        <div className="builder-section-heading">
          <div>
            <p className="eyebrow">Survey metadata</p>
            <h3>Title and description</h3>
            <p className="builder-heading-note">
              Draft changes are saved here without publishing the survey.
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
    </div>
  );
}
