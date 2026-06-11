import type { SurveyCategoriesResponse, SurveyCategoryResponse } from "@survey-portal/shared";

import { apiRequest } from "./client.js";

export async function fetchCategories(): Promise<SurveyCategoriesResponse> {
  return apiRequest<SurveyCategoriesResponse>("/api/categories");
}

export async function createCategory(input: { name: string }): Promise<SurveyCategoryResponse> {
  return apiRequest<SurveyCategoryResponse>("/api/categories", {
    body: JSON.stringify({ name: input.name }),
    method: "POST"
  });
}

export async function updateCategory(input: {
  categoryId: number;
  name: string;
}): Promise<SurveyCategoryResponse> {
  return apiRequest<SurveyCategoryResponse>(`/api/categories/${input.categoryId}`, {
    body: JSON.stringify({ name: input.name }),
    method: "PUT"
  });
}

export async function deleteCategory(input: {
  categoryId: number;
}): Promise<SurveyCategoryResponse> {
  return apiRequest<SurveyCategoryResponse>(`/api/categories/${input.categoryId}`, {
    method: "DELETE"
  });
}
