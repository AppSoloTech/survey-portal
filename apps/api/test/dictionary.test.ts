import { describe, expect, it, vi } from "vitest";

import {
  lookupMerriamWebsterCollegiate,
  lookupDictionaryTermWithConfig,
  normalizeMerriamWebsterPayload
} from "../src/services/dictionary.js";

describe("dictionary lookup service", () => {
  it("returns not_configured when the provider is disabled", async () => {
    const result = await lookupDictionaryTermWithConfig("Risk", {
      provider: "disabled"
    });

    expect(result).toMatchObject({
      message: "Dictionary suggestions are not configured. Enter the definition manually.",
      status: "not_configured",
      suggestions: [],
      term: "Risk"
    });
  });

  it("normalizes one or more Merriam-Webster short definitions", () => {
    const result = normalizeMerriamWebsterPayload("risk", [
      {
        meta: { id: "risk:1" },
        shortdef: [
          "{bc}possibility of loss or injury",
          "someone or something that creates or suggests a hazard"
        ]
      },
      {
        meta: { id: "risk:2" },
        shortdef: ["the chance of loss"]
      }
    ]);

    expect(result.status).toBe("found");
    expect(result.providerLabel).toBe("Merriam-Webster's Collegiate Dictionary API");
    expect(result.suggestions.map((suggestion) => suggestion.definition)).toEqual([
      "possibility of loss or injury",
      "someone or something that creates or suggests a hazard",
      "the chance of loss"
    ]);
    expect(result.suggestions[0]).toMatchObject({
      sourceProvider: "merriam-webster-collegiate",
      sourceReference: "collegiate:risk:1"
    });
  });

  it("returns spelling suggestions when Merriam-Webster has no exact match", () => {
    const result = normalizeMerriamWebsterPayload("risck", ["risk", "rick", "risky"]);

    expect(result).toMatchObject({
      status: "no_match",
      spellingSuggestions: ["risk", "rick", "risky"],
      suggestions: []
    });
  });

  it("maps provider rate limits and errors to graceful lookup statuses", async () => {
    const rateLimitedFetch = vi.fn(async () => ({
      ok: false,
      status: 429
    })) as unknown as typeof fetch;

    const rateLimited = await lookupMerriamWebsterCollegiate(
      "risk",
      "test-key",
      rateLimitedFetch
    );

    expect(rateLimited.status).toBe("rate_limited");

    const errorFetch = vi.fn(async () => ({
      ok: false,
      status: 503
    })) as unknown as typeof fetch;

    const providerError = await lookupMerriamWebsterCollegiate(
      "risk",
      "test-key",
      errorFetch
    );

    expect(providerError.status).toBe("provider_error");
  });

  it("does not call a live provider in automated normalization tests", async () => {
    const fetchMock = vi.fn(async () => ({
      json: async () => [{ meta: { id: "risk" }, shortdef: ["possibility of loss"] }],
      ok: true,
      status: 200
    })) as unknown as typeof fetch;

    const result = await lookupMerriamWebsterCollegiate("risk", "test-key", fetchMock);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("found");
  });
});
