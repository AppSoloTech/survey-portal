import type {
  TagDefinitionResponse,
  TagDefinitionsResponse,
  TagGroupResponse
} from "@survey-portal/shared";

import { apiRequest } from "./client.js";

export async function fetchTagDefinitions(): Promise<TagDefinitionsResponse> {
  return apiRequest<TagDefinitionsResponse>("/api/tags");
}

export async function createTagDefinition(input: {
  groupId?: number | null;
  tagKey: string;
  tagValue: string;
}): Promise<TagDefinitionResponse> {
  return apiRequest<TagDefinitionResponse>("/api/tags", {
    body: JSON.stringify({
      groupId: input.groupId,
      tagKey: input.tagKey,
      tagValue: input.tagValue
    }),
    method: "POST"
  });
}

export async function updateTagDefinition(input: {
  groupId?: number | null;
  tagId: number;
  tagKey: string;
  tagValue: string;
}): Promise<TagDefinitionResponse> {
  return apiRequest<TagDefinitionResponse>(`/api/tags/${input.tagId}`, {
    body: JSON.stringify({
      groupId: input.groupId,
      tagKey: input.tagKey,
      tagValue: input.tagValue
    }),
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

export async function createTagGroup(input: { name: string }): Promise<TagGroupResponse> {
  return apiRequest<TagGroupResponse>("/api/tags/groups", {
    body: JSON.stringify({ name: input.name }),
    method: "POST"
  });
}

export async function updateTagGroup(input: {
  groupId: number;
  name: string;
}): Promise<TagGroupResponse> {
  return apiRequest<TagGroupResponse>(`/api/tags/groups/${input.groupId}`, {
    body: JSON.stringify({ name: input.name }),
    method: "PUT"
  });
}

export async function deleteTagGroup(input: { groupId: number }): Promise<TagGroupResponse> {
  return apiRequest<TagGroupResponse>(`/api/tags/groups/${input.groupId}`, {
    method: "DELETE"
  });
}

export async function reorderTagGroups(input: { groupIds: number[] }): Promise<TagDefinitionsResponse> {
  return apiRequest<TagDefinitionsResponse>("/api/tags/groups/reorder", {
    body: JSON.stringify({ groupIds: input.groupIds }),
    method: "PUT"
  });
}

export async function reorderTags(input: {
  groupId: number | null;
  tagIds: number[];
}): Promise<TagDefinitionsResponse> {
  return apiRequest<TagDefinitionsResponse>("/api/tags/reorder", {
    body: JSON.stringify({ groupId: input.groupId, tagIds: input.tagIds }),
    method: "PUT"
  });
}

export async function moveTagDefinition(input: {
  displayOrder: number;
  groupId: number | null;
  tagId: number;
}): Promise<TagDefinitionsResponse> {
  return apiRequest<TagDefinitionsResponse>(`/api/tags/${input.tagId}/group`, {
    body: JSON.stringify({ displayOrder: input.displayOrder, groupId: input.groupId }),
    method: "PATCH"
  });
}
