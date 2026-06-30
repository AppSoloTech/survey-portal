import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  findDuplicateGlossaryMatch,
  formatGlossaryDuplicateMessage,
  formatQuestionSearchLiveMessage,
  hasUnsavedGlossaryFormValues,
  splitQuestionSearchMatch,
  type QuestionSearchState
} from "./AdminGlossaryPage.js";
import { emptyGlossaryForm } from "./glossaryForm.js";

const source = readFileSync(new URL("./AdminGlossaryPage.tsx", import.meta.url), "utf8");

describe("AdminGlossaryPage question search helpers", () => {
  it("splits question text using original-string offsets and casing", () => {
    expect(
      splitQuestionSearchMatch("Does the site require PPE training?", {
        end: 25,
        start: 14
      })
    ).toEqual({
      after: " training?",
      before: "Does the site ",
      highlighted: "require PPE"
    });
  });

  it("clamps unexpected match offsets instead of slicing outside the question", () => {
    expect(
      splitQuestionSearchMatch("Short question", {
        end: 200,
        start: -10
      })
    ).toEqual({
      after: "",
      before: "",
      highlighted: "Short question"
    });
  });

  it("formats live-region messages for short, loading, error, empty, and result states", () => {
    const baseSearch: QuestionSearchState = {
      error: null,
      isLoading: false,
      lastQuery: "",
      minQueryLength: 2,
      results: []
    };

    expect(formatQuestionSearchLiveMessage(baseSearch, "r")).toBe(
      "Enter at least 2 characters to search questions."
    );
    expect(formatQuestionSearchLiveMessage({ ...baseSearch, isLoading: true }, "ri")).toBe(
      "Searching question text."
    );
    expect(formatQuestionSearchLiveMessage({ ...baseSearch, error: "Request failed" }, "ri")).toBe(
      "Question search error: Request failed"
    );
    expect(formatQuestionSearchLiveMessage(baseSearch, "ri")).toBe("0 matching questions found.");
    expect(
      formatQuestionSearchLiveMessage(
        {
          ...baseSearch,
          results: [
            {
              assessment: { id: 1, status: "draft", title: "Safety Assessment" },
              match: { end: 4, start: 0 },
              page: { displayOrder: 1, id: 10, title: "General" },
              question: { displayOrder: 2, id: 20, questionText: "Risk controls?" }
            }
          ]
        },
        "risk"
      )
    ).toBe("1 matching question found.");
  });

  it("detects duplicate search candidates against canonical terms and aliases", () => {
    const entries = [
      glossaryEntry({
        aliases: [
          { isCanonical: true, matchText: "Risk" },
          { isCanonical: false, matchText: "Exposure" }
        ],
        canonicalTerm: "Risk",
        id: 1
      })
    ];

    expect(findDuplicateGlossaryMatch(entries, " risk ")).toMatchObject({
      canonicalTerm: "Risk",
      entryId: 1,
      isCanonical: true,
      matchText: "Risk"
    });
    expect(findDuplicateGlossaryMatch(entries, "EXPOSURE")).toMatchObject({
      canonicalTerm: "Risk",
      entryId: 1,
      isCanonical: false,
      matchText: "Exposure"
    });
    expect(findDuplicateGlossaryMatch(entries, "controls")).toBeNull();
  });

  it("formats duplicate messages and detects unsaved create-form values", () => {
    expect(
      formatGlossaryDuplicateMessage(" exposure ", {
        canonicalTerm: "Risk",
        entryId: 1,
        isCanonical: false,
        matchText: "Exposure"
      })
    ).toBe('"exposure" already exists as the alias "Exposure" on "Risk".');

    expect(hasUnsavedGlossaryFormValues(emptyGlossaryForm)).toBe(false);
    expect(
      hasUnsavedGlossaryFormValues({
        ...emptyGlossaryForm,
        canonicalTerm: "Risk"
      })
    ).toBe(true);
    expect(
      hasUnsavedGlossaryFormValues({
        ...emptyGlossaryForm,
        aliasesText: "Hazard"
      })
    ).toBe(true);
  });
});

describe("AdminGlossaryPage question search UI structure", () => {
  it("keeps entry management and question search in accessible tabs", () => {
    expect(source).toContain('role="tablist"');
    expect(source).toContain('role="tab"');
    expect(source).toContain('role="tabpanel"');
    expect(source).toContain('aria-controls="glossary-entries-panel"');
    expect(source).toContain('aria-controls="glossary-question-search-panel"');
    expect(source).toContain("handleCreateEntry");
    expect(source).toContain("handleSaveEntry");
    expect(source).toContain("handleArchiveEntry");
  });

  it("debounces searches, aborts stale requests, and blocks short broad searches", () => {
    expect(source).toContain("glossaryQuestionSearchDebounceMs = 250");
    expect(source).toContain("new AbortController()");
    expect(source).toContain("controller.abort()");
    expect(source).toContain("questionSearchRequestId");
    expect(source).toContain("trimmedQuery.length < questionSearch.minQueryLength");
    expect(source).toContain("searchGlossaryQuestions(trimmedQuery");
  });

  it("renders loading, empty, error, result, highlight, and deliberate entry-start states", () => {
    expect(source).toContain("Searching question text...");
    expect(source).toContain("No matching questions");
    expect(source).toContain('className="status error"');
    expect(source).toContain("<QuestionSearchResults");
    expect(source).toContain("<mark>{parts.highlighted}</mark>");
    expect(source).toContain("Start entry from search");
    expect(source).toContain("handleStartEntryFromQuestionSearch");
    expect(source).toContain("createGlossaryEntry(toGlossaryInput(createForm))");
    expect(source).not.toContain("Add entry unavailable");
  });

  it("guards the search-to-entry workflow without saving source references", () => {
    expect(source).toContain("questionSearchInput.trim()");
    expect(source).toContain("findDuplicateGlossaryMatch(entries, candidateTerm)");
    expect(source).toContain("Replace the unsaved create-entry form");
    expect(source).toContain("setSelectedQuestionSource({ candidateTerm, result })");
    expect(source).toContain("setActiveTab(\"entries\")");
    expect(source).toContain("createDefinitionRef.current?.focus()");
    expect(source).toContain("Informational only. This question reference is not saved");
    expect(source).not.toContain("sourceQuestion");
  });
});

function glossaryEntry({
  aliases,
  canonicalTerm,
  id
}: {
  aliases: Array<{ isCanonical: boolean; matchText: string }>;
  canonicalTerm: string;
  id: number;
}) {
  return {
    aliases: aliases.map((alias, index) => ({
      createdAt: "2026-06-30T00:00:00.000Z",
      displayOrder: index + 1,
      glossaryEntryId: id,
      id: id * 10 + index,
      isCanonical: alias.isCanonical,
      matchText: alias.matchText,
      updatedAt: "2026-06-30T00:00:00.000Z"
    })),
    canonicalTerm,
    createdAt: "2026-06-30T00:00:00.000Z",
    definition: `${canonicalTerm} definition`,
    definitionSource: "manual" as const,
    id,
    isEnabled: true,
    sourceLookupAt: null,
    sourceProvider: null,
    sourceReference: null,
    updatedAt: "2026-06-30T00:00:00.000Z"
  };
}
