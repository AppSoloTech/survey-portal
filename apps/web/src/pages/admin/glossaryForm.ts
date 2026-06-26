import type {
  AdminDictionaryDefinitionSuggestion,
  AdminGlossaryEntry
} from "@survey-portal/shared";

import type { GlossaryEntryInput } from "../../api/glossary.js";

export interface GlossaryAppliedSuggestion {
  sourceLookupAt: string;
  sourceProvider: string;
  sourceReference: string;
}

export interface GlossaryFormState {
  aliasesText: string;
  appliedSuggestion: GlossaryAppliedSuggestion | null;
  canonicalTerm: string;
  definition: string;
  isEnabled: boolean;
}

export const emptyGlossaryForm: GlossaryFormState = {
  aliasesText: "",
  appliedSuggestion: null,
  canonicalTerm: "",
  definition: "",
  isEnabled: true
};

export function applyDictionarySuggestion(
  form: GlossaryFormState,
  suggestion: AdminDictionaryDefinitionSuggestion
): GlossaryFormState {
  return {
    ...form,
    appliedSuggestion: {
      sourceLookupAt: suggestion.sourceLookupAt,
      sourceProvider: suggestion.sourceProvider,
      sourceReference: suggestion.sourceReference
    },
    definition: suggestion.definition
  };
}

export function ignoreDictionarySuggestion(form: GlossaryFormState): GlossaryFormState {
  return {
    ...form,
    appliedSuggestion: null
  };
}

export function toGlossaryInput(form: GlossaryFormState): GlossaryEntryInput {
  const appliedSuggestion = form.appliedSuggestion;

  return {
    aliases: parseAliases(form.aliasesText),
    canonicalTerm: form.canonicalTerm.trim(),
    definition: form.definition.trim(),
    definitionSource: appliedSuggestion ? "dictionary_suggested" : "manual",
    isEnabled: form.isEnabled,
    sourceLookupAt: appliedSuggestion?.sourceLookupAt ?? null,
    sourceProvider: appliedSuggestion?.sourceProvider ?? null,
    sourceReference: appliedSuggestion?.sourceReference ?? null
  };
}

export function toFormState(entry: AdminGlossaryEntry): GlossaryFormState {
  return {
    aliasesText: entry.aliases
      .filter((alias) => !alias.isCanonical)
      .map((alias) => alias.matchText)
      .join("\n"),
    appliedSuggestion:
      entry.definitionSource === "dictionary_suggested" &&
      entry.sourceProvider &&
      entry.sourceReference &&
      entry.sourceLookupAt
        ? {
            sourceLookupAt: entry.sourceLookupAt,
            sourceProvider: entry.sourceProvider,
            sourceReference: entry.sourceReference
          }
        : null,
    canonicalTerm: entry.canonicalTerm,
    definition: entry.definition,
    isEnabled: entry.isEnabled
  };
}

function parseAliases(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((alias) => alias.trim())
    .filter(Boolean);
}
