import type { SurveyQuestionType } from "@survey-portal/shared";

import { questionTypes } from "./SurveyBuilderComponents.js";

export function confirmAdminAction(message: string): boolean {
  return window.confirm(message);
}

export function readFormText(data: FormData, field: string): string {
  const value = data.get(field);
  return typeof value === "string" ? value.trim() : "";
}

export function readNullableFormText(data: FormData, field: string): string | null {
  const value = readFormText(data, field);
  return value ? value : null;
}

export function readFormNumber(data: FormData, field: string): number {
  const value = Number(data.get(field));
  return Number.isSafeInteger(value) ? value : 0;
}

export function readFormInteger(data: FormData, field: string): number | null {
  const value = Number(data.get(field));
  return Number.isSafeInteger(value) ? value : null;
}

export function readQuestionType(data: FormData, field: string): SurveyQuestionType {
  const value = readFormText(data, field);
  return questionTypes.includes(value as SurveyQuestionType)
    ? (value as SurveyQuestionType)
    : "text";
}
