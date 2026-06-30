import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  formatQuestionSearchLiveMessage,
  splitQuestionSearchMatch,
  type QuestionSearchState
} from "./AdminGlossaryPage.js";

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

  it("renders loading, empty, error, result, highlight, and non-creating action states", () => {
    expect(source).toContain("Searching question text...");
    expect(source).toContain("No matching questions");
    expect(source).toContain('className="status error"');
    expect(source).toContain("<QuestionSearchResults");
    expect(source).toContain("<mark>{parts.highlighted}</mark>");
    expect(source).toContain("Add entry unavailable");
    expect(source).toContain("disabled");
  });
});
