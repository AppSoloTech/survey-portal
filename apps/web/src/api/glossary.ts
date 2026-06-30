import type {
  AdminDictionaryLookupResponse,
  AdminGlossaryEntriesResponse,
  AdminGlossaryEntryResponse,
  AdminGlossaryQuestionSearchResponse,
  GlossaryDefinitionSource,
  ParticipantGlossaryEntriesResponse
} from "@survey-portal/shared";

import { apiRequest } from "./client.js";

export interface GlossaryEntryInput {
  aliases: string[];
  canonicalTerm: string;
  definition: string;
  definitionSource?: GlossaryDefinitionSource;
  isEnabled: boolean;
  sourceLookupAt?: string | null;
  sourceProvider?: string | null;
  sourceReference?: string | null;
}

export async function fetchGlossaryEntries(): Promise<AdminGlossaryEntriesResponse> {
  return apiRequest<AdminGlossaryEntriesResponse>("/api/admin/glossary");
}

export async function fetchParticipantSafeGlossary(): Promise<ParticipantGlossaryEntriesResponse> {
  return apiRequest<ParticipantGlossaryEntriesResponse>("/api/admin/glossary/participant-safe");
}

export async function lookupGlossaryDefinition(
  term: string
): Promise<AdminDictionaryLookupResponse> {
  return apiRequest<AdminDictionaryLookupResponse>("/api/admin/glossary/lookup", {
    body: JSON.stringify({ term }),
    method: "POST"
  });
}

export async function searchGlossaryQuestions(
  query: string,
  options: { limit?: number; signal?: AbortSignal } = {}
): Promise<AdminGlossaryQuestionSearchResponse> {
  const params = new URLSearchParams({ q: query.trim() });

  if (options.limit !== undefined) {
    params.set("limit", String(options.limit));
  }

  return apiRequest<AdminGlossaryQuestionSearchResponse>(
    `/api/admin/glossary/question-search?${params.toString()}`,
    { signal: options.signal }
  );
}

export async function createGlossaryEntry(
  input: GlossaryEntryInput
): Promise<AdminGlossaryEntryResponse> {
  return apiRequest<AdminGlossaryEntryResponse>("/api/admin/glossary", {
    body: JSON.stringify(input),
    method: "POST"
  });
}

export async function updateGlossaryEntry(
  entryId: number,
  input: GlossaryEntryInput
): Promise<AdminGlossaryEntryResponse> {
  return apiRequest<AdminGlossaryEntryResponse>(`/api/admin/glossary/${entryId}`, {
    body: JSON.stringify(input),
    method: "PUT"
  });
}

export async function archiveGlossaryEntry(entryId: number): Promise<AdminGlossaryEntryResponse> {
  return apiRequest<AdminGlossaryEntryResponse>(`/api/admin/glossary/${entryId}`, {
    method: "DELETE"
  });
}
