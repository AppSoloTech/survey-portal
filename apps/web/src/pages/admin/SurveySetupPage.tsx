import type { SurveyCategory } from "@survey-portal/shared";
import { useEffect, useState, type FormEvent } from "react";

import { createCategory, fetchCategories } from "../../api/categories.js";
import { updateSurveyMetadata } from "../../api/surveys.js";
import { readFormText, readNullableFormText } from "../../components/admin/builderForm.js";
import { StatusActionPanel } from "../../components/admin/SurveyBuilderComponents.js";
import { useSurveyWorkspace } from "./SurveyWorkspaceLayout.js";

export function SurveySetupPage() {
  const { changeStatus, isSubmitting, runSurveyMutation, setFeedback, survey } =
    useSurveyWorkspace();
  const [categories, setCategories] = useState<SurveyCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(survey.categoryId);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);

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
      "Survey metadata saved"
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

  return (
    <div className="builder-workspace">
      <form className="builder-form" key={`metadata-${survey.id}`} onSubmit={handleSaveMetadata}>
        <div className="builder-section-heading">
          <div>
            <p className="eyebrow">Survey metadata</p>
            <h3>Title, description, and category</h3>
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
    </div>
  );
}
