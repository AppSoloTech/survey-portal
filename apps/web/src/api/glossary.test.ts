import { afterEach, describe, expect, it, vi } from "vitest";

import { resetCsrfTokenCache } from "./client.js";
import { searchGlossaryQuestions } from "./glossary.js";

describe("glossary API helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetCsrfTokenCache();
  });

  it("requests question search with a trimmed query, limit, and abort signal", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        limit: 20,
        minQueryLength: 2,
        query: "risk matrix",
        results: []
      })
    );

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      searchGlossaryQuestions("  risk matrix  ", {
        limit: 20,
        signal: controller.signal
      })
    ).resolves.toEqual({
      limit: 20,
      minQueryLength: 2,
      query: "risk matrix",
      results: []
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/glossary/question-search?q=risk+matrix&limit=20",
      expect.objectContaining({
        credentials: "include",
        signal: controller.signal
      })
    );
  });

  it("omits the optional limit parameter when no limit is supplied", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        limit: 20,
        minQueryLength: 2,
        query: "ppe",
        results: []
      })
    );

    vi.stubGlobal("fetch", fetchMock);

    await searchGlossaryQuestions("ppe");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/glossary/question-search?q=ppe",
      expect.objectContaining({
        credentials: "include"
      })
    );
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status: 200
  });
}
