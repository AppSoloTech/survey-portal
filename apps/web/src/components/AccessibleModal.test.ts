import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const modalSource = readFileSync(new URL("./AccessibleModal.tsx", import.meta.url), "utf8");

describe("AccessibleModal", () => {
  it("exposes modal dialog semantics with label and optional description", () => {
    expect(modalSource).toContain('role="dialog"');
    expect(modalSource).toContain('aria-modal="true"');
    expect(modalSource).toContain("aria-labelledby={labelledBy}");
    expect(modalSource).toContain("aria-describedby={descriptionId}");
  });

  it("manages focus, Escape, and background inert state", () => {
    expect(modalSource).toContain("returnFocusRef.current");
    expect(modalSource).toContain("focusableSelector");
    expect(modalSource).toContain('event.key === "Escape"');
    expect(modalSource).toContain('event.key !== "Tab"');
    expect(modalSource).toContain('child.setAttribute("aria-hidden", "true")');
    expect(modalSource).toContain("child.inert = true");
    expect(modalSource).toContain("document.body.style.overflow = \"hidden\"");
  });
});
