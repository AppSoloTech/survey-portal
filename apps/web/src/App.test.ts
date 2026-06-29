import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { getRouteTitle } from "./App.js";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

describe("App shell accessibility", () => {
  it("maps public and registered-user routes to document titles", () => {
    expect(getRouteTitle("/")).toBe("Home");
    expect(getRouteTitle("/login")).toBe("Login");
    expect(getRouteTitle("/register")).toBe("Register");
    expect(getRouteTitle("/forgot-password")).toBe("Forgot password");
    expect(getRouteTitle("/reset-password")).toBe("Reset password");
    expect(getRouteTitle("/dashboard")).toBe("Dashboard");
    expect(getRouteTitle("/settings")).toBe("Account settings");
    expect(getRouteTitle("/dashboard/category/12")).toBe("Survey group");
    expect(getRouteTitle("/surveys/42/attempt")).toBe("Survey attempt");
    expect(getRouteTitle("/anonymous-surveys")).toBe("Anonymous surveys");
    expect(getRouteTitle("/anonymous-surveys/public-token")).toBe("Anonymous survey attempt");
    expect(getRouteTitle("/admin/performance")).toBe("Performance reports");
    expect(getRouteTitle("/admin")).toBeNull();
  });

  it("renders a skip link and stable focusable main target", () => {
    expect(appSource).toContain('className="skip-link" href="#main-content"');
    expect(appSource).toContain('id="main-content" tabIndex={-1}');
    expect(appSource).toContain("main?.focus({ preventScroll: true })");
    expect(appSource).toContain('aria-live="polite"');
  });

  it("keeps the account navigation as a disclosure instead of an ARIA menu", () => {
    expect(appSource).toContain('aria-controls="account-disclosure-panel"');
    expect(appSource).toContain('aria-expanded={isAccountMenuOpen}');
    expect(appSource).toContain('id="account-disclosure-button"');
    expect(appSource).toContain('id="account-disclosure-panel"');
    expect(appSource).toContain('event.key === "Escape"');
    expect(appSource).toContain('document.addEventListener("pointerdown"');
    expect(appSource).not.toContain('aria-haspopup="menu"');
    expect(appSource).not.toContain('role="menu"');
    expect(appSource).not.toContain('role="menuitem"');
  });
});
