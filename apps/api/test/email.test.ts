import { describe, expect, it, vi } from "vitest";

import { readEmailConfigFromEnv } from "../src/config.js";
import { createEmailClient, type EmailMessage } from "../src/services/email.js";

function stringifyConsoleCalls(calls: unknown[][]): string {
  return JSON.stringify(calls);
}

describe("email configuration", () => {
  it("defaults to disabled email", () => {
    expect(readEmailConfigFromEnv({}, "dev")).toEqual({
      enabled: false,
      provider: "disabled",
      fromAddress: undefined,
      replyToAddress: undefined
    });
  });

  it("requires an explicit provider when email is enabled", () => {
    expect(() => readEmailConfigFromEnv({ EMAIL_ENABLED: "true" }, "dev")).toThrow(
      "EMAIL_PROVIDER is required"
    );
  });

  it("rejects invalid enabled values", () => {
    expect(() =>
      readEmailConfigFromEnv(
        {
          EMAIL_ENABLED: "yes",
          EMAIL_PROVIDER: "disabled"
        },
        "dev"
      )
    ).toThrow("EMAIL_ENABLED must be either true or false");
  });

  it("rejects invalid provider values", () => {
    expect(() =>
      readEmailConfigFromEnv(
        {
          EMAIL_ENABLED: "false",
          EMAIL_PROVIDER: "smtp"
        },
        "dev"
      )
    ).toThrow("EMAIL_PROVIDER must be either disabled or noop");
  });

  it("requires the disabled provider when email is disabled", () => {
    expect(() =>
      readEmailConfigFromEnv(
        {
          EMAIL_ENABLED: "false",
          EMAIL_PROVIDER: "noop"
        },
        "dev"
      )
    ).toThrow("EMAIL_PROVIDER must be disabled when EMAIL_ENABLED is false");
  });

  it("does not allow the disabled provider when email is enabled", () => {
    expect(() =>
      readEmailConfigFromEnv(
        {
          EMAIL_ENABLED: "true",
          EMAIL_PROVIDER: "disabled"
        },
        "dev"
      )
    ).toThrow("EMAIL_PROVIDER must not be disabled when EMAIL_ENABLED is true");
  });

  it("allows the no-op provider for local development", () => {
    expect(
      readEmailConfigFromEnv(
        {
          EMAIL_ENABLED: "true",
          EMAIL_PROVIDER: "noop",
          EMAIL_FROM_ADDRESS: "survey-portal@example.invalid",
          EMAIL_REPLY_TO_ADDRESS: "support@example.invalid"
        },
        "dev"
      )
    ).toEqual({
      enabled: true,
      provider: "noop",
      fromAddress: "survey-portal@example.invalid",
      replyToAddress: "support@example.invalid"
    });
  });

  it("does not allow production email until a real provider adapter exists", () => {
    expect(() =>
      readEmailConfigFromEnv(
        {
          EMAIL_ENABLED: "true",
          EMAIL_PROVIDER: "noop"
        },
        "prod"
      )
    ).toThrow("Real email provider integration is not implemented yet");
  });
});

describe("email client", () => {
  it("initializes disabled and skips sending without logging message contents", async () => {
    const logSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const client = createEmailClient({ enabled: false, provider: "disabled" });

    const message: EmailMessage = {
      template: "password_reset",
      to: {
        email: "person@example.com",
        name: "Reset Recipient"
      },
      resetUrl: "https://example.com/reset?token=secret-reset-token",
      expiresAt: "2026-06-22T12:00:00.000Z"
    };

    await expect(client.send(message)).resolves.toEqual({
      status: "disabled",
      provider: "disabled"
    });
    expect(logSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
  });

  it("exercises the dev no-op adapter without logging links, tokens, or recipients", async () => {
    const logSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const client = createEmailClient({ enabled: true, provider: "noop" });

    const message: EmailMessage = {
      template: "anonymous_survey_invite",
      to: {
        email: "invitee@example.com",
        name: "Invite Recipient"
      },
      surveyTitle: "Sensitive Internal Survey",
      inviteUrl: "https://example.com/surveys/anonymous?token=secret-invite-token",
      expiresAt: "2026-06-29T12:00:00.000Z"
    };

    await expect(client.send(message)).resolves.toEqual({
      status: "skipped",
      provider: "noop"
    });

    const loggedOutput = stringifyConsoleCalls(logSpy.mock.calls);

    expect(loggedOutput).toContain("anonymous_survey_invite");
    expect(loggedOutput).toContain("recipientCount");
    expect(loggedOutput).not.toContain("invitee@example.com");
    expect(loggedOutput).not.toContain("Invite Recipient");
    expect(loggedOutput).not.toContain("Sensitive Internal Survey");
    expect(loggedOutput).not.toContain("secret-invite-token");
    expect(loggedOutput).not.toContain("https://example.com");

    logSpy.mockRestore();
  });

  it("rejects enabled email without an active adapter", () => {
    expect(() => createEmailClient({ enabled: true, provider: "disabled" })).toThrow(
      "No enabled email adapter is configured"
    );
  });
});
