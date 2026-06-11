import type { Survey } from "@survey-portal/shared";

import type { TagPreset } from "./SurveyBuilderComponents.js";

export const defaultTagPresets: TagPreset[] = [
  { tagKey: "review_required", tagValue: "true", source: "default" },
  { tagKey: "review_required", tagValue: "false", source: "default" },
  { tagKey: "severity", tagValue: "high", source: "default" },
  { tagKey: "severity", tagValue: "medium", source: "default" },
  { tagKey: "severity", tagValue: "low", source: "default" },
  { tagKey: "compliance_result", tagValue: "compliant", source: "default" },
  { tagKey: "compliance_result", tagValue: "violation", source: "default" }
];

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

  return mergeTagPresets([...defaultTagPresets, ...surveyTagPresets, ...customTagPresets]);
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
