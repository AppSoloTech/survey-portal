import { describe, expect, it } from "vitest";

import {
  applyDictionarySuggestion,
  emptyGlossaryForm,
  ignoreDictionarySuggestion,
  toGlossaryInput
} from "./glossaryForm.js";

const suggestion = {
  definition: "A chance of loss or injury.",
  sourceLookupAt: "2026-06-26T12:00:00.000Z",
  sourceProvider: "merriam-webster-collegiate",
  sourceReference: "collegiate:risk"
};

describe("glossary form source metadata", () => {
  it("marks a saved definition as dictionary_suggested after applying a suggestion", () => {
    const form = applyDictionarySuggestion(
      {
        ...emptyGlossaryForm,
        aliasesText: "Hazard\nExposure",
        canonicalTerm: "Risk",
        definition: ""
      },
      suggestion
    );

    expect(toGlossaryInput(form)).toMatchObject({
      aliases: ["Hazard", "Exposure"],
      definition: "A chance of loss or injury.",
      definitionSource: "dictionary_suggested",
      sourceLookupAt: "2026-06-26T12:00:00.000Z",
      sourceProvider: "merriam-webster-collegiate",
      sourceReference: "collegiate:risk"
    });
  });

  it("keeps dictionary metadata when an applied suggestion is edited before save", () => {
    const applied = applyDictionarySuggestion(
      { ...emptyGlossaryForm, canonicalTerm: "Risk" },
      suggestion
    );
    const edited = { ...applied, definition: "A reviewed chance of loss or injury." };

    expect(toGlossaryInput(edited)).toMatchObject({
      definition: "A reviewed chance of loss or injury.",
      definitionSource: "dictionary_suggested",
      sourceProvider: "merriam-webster-collegiate"
    });
  });

  it("clears dictionary metadata when suggestions are ignored", () => {
    const ignored = ignoreDictionarySuggestion(
      applyDictionarySuggestion({ ...emptyGlossaryForm, canonicalTerm: "Risk" }, suggestion)
    );

    expect(toGlossaryInput({ ...ignored, definition: "Manual definition." })).toMatchObject({
      definition: "Manual definition.",
      definitionSource: "manual",
      sourceLookupAt: null,
      sourceProvider: null,
      sourceReference: null
    });
  });
});
