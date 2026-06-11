import type { TagDefinitionResponse, TagDefinitionsResponse } from "@survey-portal/shared";

import { apiRequest } from "./client.js";

export async function fetchTagDefinitions(): Promise<TagDefinitionsResponse> {
  return apiRequest<TagDefinitionsResponse>("/api/tags");
}

export async function createTagDefinition(input: {
  tagKey: string;
  tagValue: string;
}): Promise<TagDefinitionResponse> {
  return apiRequest<TagDefinitionResponse>("/api/tags", {
    body: JSON.stringify({ tagKey: input.tagKey, tagValue: input.tagValue }),
    method: "POST"
  });
}

export async function updateTagDefinition(input: {
  tagId: number;
  tagKey: string;
  tagValue: string;
}): Promise<TagDefinitionResponse> {
  return apiRequest<TagDefinitionResponse>(`/api/tags/${input.tagId}`, {
    body: JSON.stringify({ tagKey: input.tagKey, tagValue: input.tagValue }),
    method: "PUT"
  });
}

export async function deleteTagDefinition(input: {
  tagId: number;
}): Promise<TagDefinitionResponse> {
  return apiRequest<TagDefinitionResponse>(`/api/tags/${input.tagId}`, {
    method: "DELETE"
  });
}
