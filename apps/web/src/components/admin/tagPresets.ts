import type { Survey } from "@survey-portal/shared";

import type { TagPreset } from "./SurveyBuilderComponents.js";

// Tag suggestions come only from real data: tags already saved on survey
// options and entries in the admin-managed tag catalog. Everything offered
// in the builder dropdowns is therefore visible and editable on the Tags
// page — there is no hardcoded preset list.
export function buildTagPresets(surveys: Survey[], customTagPresets: TagPreset[]): TagPreset[] {
  const surveyTagPresets = surveys.flatMap((survey) =>
    survey.questions.flatMap((question) =>
      question.answerOptions.flatMap((option) =>
        (option.answerTags ?? []).map((tag) => ({
          tagKey: tag.tagKey,
          tagValue: tag.tagValue,
          source: "survey" as const
        }))
      )
    )
  );

  return mergeTagPresets([...surveyTagPresets, ...customTagPresets]);
}

export function mergeTagPresets(presets: TagPreset[]): TagPreset[] {
  const merged = new Map<string, TagPreset>();

  for (const preset of presets) {
    const tagKey = preset.tagKey.trim();
    const tagValue = preset.tagValue.trim();

    if (!tagKey || !tagValue) {
      continue;
    }

    const key = `${tagKey}:${tagValue}`;

    if (!merged.has(key)) {
      merged.set(key, {
        tagKey,
        tagValue,
        source: preset.source
      });
    }
  }

  return [...merged.values()].sort(
    (left, right) =>
      left.tagKey.localeCompare(right.tagKey) || left.tagValue.localeCompare(right.tagValue)
  );
}
