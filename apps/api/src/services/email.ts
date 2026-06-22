import { config, type EmailProvider } from "../config.js";

export interface EmailRecipient {
  email: string;
  name?: string;
}

export interface PasswordResetEmail {
  template: "password_reset";
  to: EmailRecipient;
  resetUrl: string;
  expiresAt: string;
}

export interface AnonymousSurveyInviteEmail {
  template: "anonymous_survey_invite";
  to: EmailRecipient;
  surveyTitle: string;
  inviteUrl: string;
  expiresAt?: string;
}

export type EmailMessage = PasswordResetEmail | AnonymousSurveyInviteEmail;

export type EmailSendResult =
  | {
      status: "disabled";
      provider: "disabled";
    }
  | {
      status: "skipped";
      provider: "noop";
    };

export interface EmailClient {
  readonly provider: EmailProvider;
  send(message: EmailMessage): Promise<EmailSendResult>;
}

export interface EmailClientConfig {
  enabled: boolean;
  provider: EmailProvider;
}

class DisabledEmailClient implements EmailClient {
  readonly provider = "disabled";

  async send(_message: EmailMessage): Promise<EmailSendResult> {
    return {
      status: "disabled",
      provider: this.provider
    };
  }
}

class NoopEmailClient implements EmailClient {
  readonly provider = "noop";

  async send(message: EmailMessage): Promise<EmailSendResult> {
    console.info("Email send skipped by no-op provider", {
      provider: this.provider,
      template: message.template,
      // Phase 16 message shapes are intentionally single-recipient.
      recipientCount: 1
    });

    return {
      status: "skipped",
      provider: this.provider
    };
  }
}

export function createEmailClient(emailConfig: EmailClientConfig): EmailClient {
  if (!emailConfig.enabled) {
    return new DisabledEmailClient();
  }

  if (emailConfig.provider === "noop") {
    return new NoopEmailClient();
  }

  throw new Error("No enabled email adapter is configured");
}

export const emailClient = createEmailClient(config.email);
