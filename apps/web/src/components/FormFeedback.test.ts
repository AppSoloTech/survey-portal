import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const alertSource = readFileSync(new URL("./AlertMessage.tsx", import.meta.url), "utf8");
const fieldSource = readFileSync(new URL("./FormField.tsx", import.meta.url), "utf8");
const toastSource = readFileSync(new URL("./ToastProvider.tsx", import.meta.url), "utf8");
const paginationSource = readFileSync(new URL("./PaginationRow.tsx", import.meta.url), "utf8");
const accountSource = readFileSync(new URL("../pages/AccountSettings.tsx", import.meta.url), "utf8");
const resetSource = readFileSync(new URL("../pages/ResetPassword.tsx", import.meta.url), "utf8");

describe("form feedback accessibility primitives", () => {
  it("renders alerts and statuses with appropriate live-region semantics", () => {
    expect(alertSource).toContain('variant === "error" ? "alert" : "status"');
    expect(alertSource).toContain('variant === "error" ? "assertive" : "polite"');
    expect(alertSource).toContain("className={`status ${variantClass}");
  });

  it("connects field helper and error text to controls", () => {
    expect(fieldSource).toContain("const helperId = helperText ? `${id}-helper` : null");
    expect(fieldSource).toContain("const errorId = error ? `${id}-error` : null");
    expect(fieldSource).toContain('"aria-describedby": describedBy || undefined');
    expect(fieldSource).toContain('"aria-invalid": error || isInvalid ? true : undefined');
    expect(fieldSource).toContain('className="field-requirement"');
    expect(fieldSource).toContain('data-reveal={reveal ? "" : undefined}');
    expect(fieldSource).toContain('role="alert"');
  });

  it("keeps toasts as live messages with dedicated dismiss controls", () => {
    expect(toastSource).toContain("const toastDurationMs = 8000");
    expect(toastSource).toContain("const errorToastDurationMs = 12000");
    expect(toastSource).toContain('aria-live="polite"');
    expect(toastSource).toContain('aria-live="assertive"');
    expect(toastSource).toContain('role="status"');
    expect(toastSource).toContain('role="alert"');
    expect(toastSource).toContain("function ToastItem");
    expect(toastSource).toContain('className="toast-dismiss"');
    expect(toastSource).not.toContain('<button\n            className={`toast toast-${toast.variant}`');
  });

  it("announces shared pagination status politely", () => {
    expect(paginationSource).toContain('aria-live="polite"');
    expect(paginationSource).toContain('role="status"');
    expect(paginationSource).toContain('aria-atomic="true"');
  });

  it("exposes account phone validation and reset cooldown explanations", () => {
    expect(accountSource).toContain("setContactNumberError(\"Phone number must be a valid phone number\")");
    expect(accountSource).toContain('error={contactNumberError}');
    expect(accountSource).toContain('aria-describedby={isCoolingDown ? resetCooldownDescriptionId : undefined}');
    expect(accountSource).toContain('aria-disabled={isCoolingDown ? true : undefined}');
    expect(accountSource).toContain('id={resetCooldownDescriptionId}');
    expect(resetSource).toContain('aria-disabled={!token ? true : undefined}');
  });
});
