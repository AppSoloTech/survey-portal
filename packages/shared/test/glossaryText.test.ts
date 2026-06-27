import { describe, expect, it } from "vitest";

import {
  buildGlossaryTextSegments,
  type GlossaryTextSegment,
  type ParticipantGlossaryEntry
} from "../src/index.js";

function glossaryEntry(
  id: number,
  canonicalTerm: string,
  matchStrings: string[] = [canonicalTerm]
): ParticipantGlossaryEntry {
  return {
    id,
    canonicalTerm,
    definition: `${canonicalTerm} definition`,
    matchStrings
  };
}

function glossaryTexts(segments: GlossaryTextSegment[]): string[] {
  return segments
    .filter((segment) => segment.kind === "glossary")
    .map((segment) => segment.text);
}

describe("buildGlossaryTextSegments", () => {
  it("returns plain text when there are no matches", () => {
    expect(buildGlossaryTextSegments("No glossary terms here.", [glossaryEntry(1, "Risk")])).toEqual([
      { kind: "text", text: "No glossary terms here." }
    ]);
  });

  it("wraps a single match", () => {
    const segments = buildGlossaryTextSegments("Describe the risk.", [glossaryEntry(1, "risk")]);

    expect(segments).toEqual([
      { kind: "text", text: "Describe the " },
      {
        kind: "glossary",
        canonicalTerm: "risk",
        definition: "risk definition",
        entryId: 1,
        matchText: "risk",
        text: "risk"
      },
      { kind: "text", text: "." }
    ]);
  });

  it("wraps repeated matches", () => {
    const segments = buildGlossaryTextSegments("Risk changes risk controls.", [
      glossaryEntry(1, "risk")
    ]);

    expect(glossaryTexts(segments)).toEqual(["Risk", "risk"]);
  });

  it("matches case-insensitively while preserving original casing", () => {
    const segments = buildGlossaryTextSegments("Review PPE and ppe storage.", [
      glossaryEntry(1, "PPE")
    ]);

    expect(glossaryTexts(segments)).toEqual(["PPE", "ppe"]);
  });

  it("matches aliases and canonical terms", () => {
    const segments = buildGlossaryTextSegments("Use personal protective equipment and PPE.", [
      glossaryEntry(1, "Personal protective equipment", [
        "Personal protective equipment",
        "PPE"
      ])
    ]);

    expect(glossaryTexts(segments)).toEqual(["personal protective equipment", "PPE"]);
  });

  it("uses longest-match-first overlap resolution", () => {
    const segments = buildGlossaryTextSegments("Personal protective equipment is required.", [
      glossaryEntry(1, "Personal protective equipment"),
      glossaryEntry(2, "equipment")
    ]);

    expect(glossaryTexts(segments)).toEqual(["Personal protective equipment"]);
  });

  it("does not match partial words at word boundaries", () => {
    const segments = buildGlossaryTextSegments("Assess risky risk and brisk risk-based controls.", [
      glossaryEntry(1, "risk"),
      glossaryEntry(2, "risk-based")
    ]);

    expect(glossaryTexts(segments)).toEqual(["risk", "risk-based"]);
  });

  it("allows punctuation-heavy match strings to define their own edge behavior", () => {
    const segments = buildGlossaryTextSegments("C++/CLI differs from C++.", [
      glossaryEntry(1, "C++")
    ]);

    expect(glossaryTexts(segments)).toEqual(["C++", "C++"]);
  });
});
