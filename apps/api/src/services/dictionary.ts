import type {
  AdminDictionaryDefinitionSuggestion,
  AdminDictionaryLookupResponse
} from "@survey-portal/shared";

import { config, type DictionaryProvider } from "../config.js";

type FetchLike = typeof fetch;

interface DictionaryConfig {
  provider: DictionaryProvider;
  merriamWebsterCollegiateApiKey?: string;
}

interface MerriamWebsterEntry {
  meta?: {
    id?: unknown;
  };
  hwi?: {
    hw?: unknown;
  };
  fl?: unknown;
  shortdef?: unknown;
}

const merriamWebsterProvider = "merriam-webster-collegiate";
const merriamWebsterProviderLabel = "Merriam-Webster's Collegiate Dictionary API";
const merriamWebsterBaseUrl =
  "https://www.dictionaryapi.com/api/v3/references/collegiate/json";

let lookupOverride:
  | ((term: string) => Promise<AdminDictionaryLookupResponse>)
  | null = null;

export function setDictionaryLookupOverrideForTests(
  override: ((term: string) => Promise<AdminDictionaryLookupResponse>) | null
) {
  lookupOverride = override;
}

export async function lookupDictionaryTerm(
  term: string
): Promise<AdminDictionaryLookupResponse> {
  if (lookupOverride) {
    return lookupOverride(term);
  }

  return lookupDictionaryTermWithConfig(term, config.dictionary);
}

export async function lookupDictionaryTermWithConfig(
  term: string,
  dictionaryConfig: DictionaryConfig
): Promise<AdminDictionaryLookupResponse> {
  const normalizedTerm = term.trim();

  if (!normalizedTerm) {
    return buildResponse({
      message: "Enter a canonical term before requesting a suggestion.",
      status: "no_match",
      term: normalizedTerm
    });
  }

  if (dictionaryConfig.provider === "disabled") {
    return buildResponse({
      message: "Dictionary suggestions are not configured. Enter the definition manually.",
      status: "not_configured",
      term: normalizedTerm
    });
  }

  return lookupMerriamWebsterCollegiate(
    normalizedTerm,
    dictionaryConfig.merriamWebsterCollegiateApiKey ?? "",
    fetch
  );
}

export async function lookupMerriamWebsterCollegiate(
  term: string,
  apiKey: string,
  fetchImpl: FetchLike
): Promise<AdminDictionaryLookupResponse> {
  if (!apiKey) {
    return buildResponse({
      message: "Merriam-Webster dictionary suggestions are missing an API key.",
      providerLabel: merriamWebsterProviderLabel,
      status: "not_configured",
      term
    });
  }

  const url = new URL(`${merriamWebsterBaseUrl}/${encodeURIComponent(term)}`);
  url.searchParams.set("key", apiKey);

  try {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(5000)
    });

    if (response.status === 429) {
      return buildResponse({
        message: "The dictionary provider is rate-limited. Enter the definition manually for now.",
        providerLabel: merriamWebsterProviderLabel,
        status: "rate_limited",
        term
      });
    }

    if (!response.ok) {
      return buildResponse({
        message: "The dictionary provider is unavailable. Enter the definition manually for now.",
        providerLabel: merriamWebsterProviderLabel,
        status: "provider_error",
        term
      });
    }

    const payload = await response.json();
    return normalizeMerriamWebsterPayload(term, payload);
  } catch {
    return buildResponse({
      message: "The dictionary provider is unavailable. Enter the definition manually for now.",
      providerLabel: merriamWebsterProviderLabel,
      status: "provider_error",
      term
    });
  }
}

export function normalizeMerriamWebsterPayload(
  term: string,
  payload: unknown
): AdminDictionaryLookupResponse {
  if (!Array.isArray(payload)) {
    return buildResponse({
      message: "The dictionary provider returned an unexpected response. Enter the definition manually.",
      providerLabel: merriamWebsterProviderLabel,
      status: "provider_error",
      term
    });
  }

  if (payload.every((item) => typeof item === "string")) {
    return buildResponse({
      message: payload.length
        ? "No exact definition was found. Check the spelling suggestions or enter a definition manually."
        : "No definition was found. Enter the definition manually.",
      providerLabel: merriamWebsterProviderLabel,
      spellingSuggestions: payload.slice(0, 8),
      status: "no_match",
      term
    });
  }

  const lookupAt = new Date().toISOString();
  const suggestions: AdminDictionaryDefinitionSuggestion[] = [];
  const seenDefinitions = new Set<string>();

  for (const entry of payload) {
    if (!isMerriamWebsterEntry(entry)) {
      continue;
    }

    const shortDefinitions = Array.isArray(entry.shortdef)
      ? entry.shortdef.filter((definition): definition is string => typeof definition === "string")
      : [];

    for (const definition of shortDefinitions) {
      const normalizedDefinition = normalizeDictionaryText(definition);

      if (!normalizedDefinition || seenDefinitions.has(normalizedDefinition.toLowerCase())) {
        continue;
      }

      seenDefinitions.add(normalizedDefinition.toLowerCase());
      suggestions.push({
        definition: normalizedDefinition,
        sourceLookupAt: lookupAt,
        sourceProvider: merriamWebsterProvider,
        sourceReference: buildSourceReference(term, entry)
      });

      if (suggestions.length >= 6) {
        break;
      }
    }

    if (suggestions.length >= 6) {
      break;
    }
  }

  if (suggestions.length === 0) {
    return buildResponse({
      message: "No definition was found. Enter the definition manually.",
      providerLabel: merriamWebsterProviderLabel,
      status: "no_match",
      term
    });
  }

  return buildResponse({
    message:
      suggestions.length === 1
        ? "Review the suggested definition before saving."
        : "Review the suggested definitions before saving.",
    providerLabel: merriamWebsterProviderLabel,
    status: "found",
    suggestions,
    term
  });
}

function buildResponse({
  message,
  providerLabel = null,
  spellingSuggestions = [],
  status,
  suggestions = [],
  term
}: {
  message: string;
  providerLabel?: string | null;
  spellingSuggestions?: string[];
  status: AdminDictionaryLookupResponse["status"];
  suggestions?: AdminDictionaryDefinitionSuggestion[];
  term: string;
}): AdminDictionaryLookupResponse {
  return {
    message,
    providerLabel,
    spellingSuggestions,
    status,
    suggestions,
    term
  };
}

function isMerriamWebsterEntry(value: unknown): value is MerriamWebsterEntry {
  return typeof value === "object" && value !== null;
}

function normalizeDictionaryText(value: string): string {
  return value
    .replace(/\{bc\}/g, ": ")
    .replace(/\{sx\|([^|{}]+)\|[^{}]*\}/g, "$1")
    .replace(/\{a_link\|([^{}|]+)\}/g, "$1")
    .replace(/\{d_link\|([^{}|]+)\|[^{}]*\}/g, "$1")
    .replace(/\{it\}|\{\/it\}|\{wi\}|\{\/wi\}|\{b\}|\{\/b\}/g, "")
    .replace(/\{[^{}]+\}/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim()
    .replace(/^:\s*/, "");
}

function buildSourceReference(term: string, entry: MerriamWebsterEntry): string {
  const entryId = typeof entry.meta?.id === "string" ? entry.meta.id : term;
  const normalizedId = entryId.replace(/\s+/g, "-").slice(0, 80);

  return `collegiate:${normalizedId}`;
}
