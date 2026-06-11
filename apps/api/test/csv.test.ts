import { describe, expect, it } from "vitest";

import { buildCsv, escapeCsvField } from "../src/services/csv.js";

describe("escapeCsvField", () => {
  it("passes plain values through unchanged", () => {
    expect(escapeCsvField("plain")).toBe("plain");
    expect(escapeCsvField(42)).toBe("42");
    expect(escapeCsvField(true)).toBe("true");
  });

  it("renders null as an empty field", () => {
    expect(escapeCsvField(null)).toBe("");
  });

  it("quotes fields containing commas", () => {
    expect(escapeCsvField("a, b")).toBe('"a, b"');
  });

  it("doubles embedded quotes", () => {
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
  });

  it("quotes fields containing newlines", () => {
    expect(escapeCsvField("line1\nline2")).toBe('"line1\nline2"');
  });
});

describe("buildCsv", () => {
  it("joins header and rows with CRLF and a trailing newline", () => {
    const csv = buildCsv(["a", "b"], [["1", "x,y"], [2, null]]);

    expect(csv).toBe('a,b\r\n1,"x,y"\r\n2,\r\n');
  });
});
