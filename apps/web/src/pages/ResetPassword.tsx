import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { completePasswordReset } from "../api/auth.js";
import { AccessibleModal } from "../components/AccessibleModal.js";
import { AlertMessage } from "../components/AlertMessage.js";
import { FormField } from "../components/FormField.js";
import { useReveal } from "../motion/motion.js";

export function ResetPassword() {
  const navigate = useNavigate();
  const revealRef = useReveal<HTMLElement>();
  const token = useMemo(readTokenFromHash, []);
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isComplete = Boolean(successMessage);
  const formErrorId = "reset-password-form-error";
  const disabledReasonId = "reset-password-disabled-reason";

  useEffect(() => {
    if (!isComplete) {
      return undefined;
    }

    const redirectTimer = window.setTimeout(() => {
      navigate("/login", { replace: true, state: { passwordResetComplete: true } });
    }, 2800);

    return () => {
      window.clearTimeout(redirectTimer);
    };
  }, [isComplete, navigate]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!token) {
      setError("Password reset link is invalid or expired");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await completePasswordReset({ token, newPassword });
      setSuccessMessage(response.message);
      setNewPassword("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Password reset failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="page auth-page" ref={revealRef}>
      <div className="auth-card" data-reveal>
        <div className="page-header auth-card-header">
          <p className="eyebrow">Account access</p>
          <h1>{isComplete ? "Password reset complete" : "Choose a new password"}</h1>
          <p>
            {isComplete
              ? "You can now sign in with your new password."
              : "Use a password with at least 8 characters."}
          </p>
        </div>
        {isComplete ? (
          <div className="auth-form reset-complete-panel">
            <AlertMessage variant="success">{successMessage}</AlertMessage>
            <p className="form-note">Redirecting to login...</p>
            <Link
              className="button-link form-button"
              state={{ passwordResetComplete: true }}
              to="/login"
            >
              Continue to login
            </Link>
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <FormField
              describedByIds={error ? [formErrorId] : []}
              helperText="Use at least 8 characters."
              id="reset-password-new-password"
              isInvalid={Boolean(error)}
              isRequired
              label="New password"
              reveal
            >
              {(fieldProps) => (
                <input
                  {...fieldProps}
                  autoComplete="new-password"
                  minLength={8}
                  name="newPassword"
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                  type="password"
                  value={newPassword}
                />
              )}
            </FormField>
            {error ? (
              <AlertMessage id={formErrorId} variant="error">
                {error}
              </AlertMessage>
            ) : null}
            {!token ? (
              <p className="form-note" id={disabledReasonId}>
                This reset link is invalid or expired. Request a new password reset link.
              </p>
            ) : null}
            <button
              aria-describedby={!token ? disabledReasonId : undefined}
              aria-disabled={!token ? true : undefined}
              className="button-link form-button"
              data-reveal
              disabled={isSubmitting}
              onClick={(event) => {
                if (!token) {
                  event.preventDefault();
                }
              }}
              type="submit"
            >
              {isSubmitting ? "Resetting..." : "Reset password"}
            </button>
            <p className="form-note" data-reveal>
              Ready to continue? <Link to="/login">Login</Link>
            </p>
          </form>
        )}
      </div>
      {isComplete ? (
        <PasswordResetSuccessModal
          message={successMessage ?? "Password has been reset. You can now log in."}
          onContinue={() =>
            navigate("/login", { replace: true, state: { passwordResetComplete: true } })
          }
        />
      ) : null}
    </section>
  );
}

function PasswordResetSuccessModal({
  message,
  onContinue
}: {
  message: string;
  onContinue: () => void;
}) {
  return (
    <AccessibleModal
      className="reset-success-modal"
      descriptionId="password-reset-success-description"
      labelledBy="password-reset-success-title"
      onClose={onContinue}
    >
      <div className="contact-email-modal-heading">
        <p className="eyebrow">All set</p>
        <h3 id="password-reset-success-title">Your password was reset</h3>
      </div>
      <div id="password-reset-success-description">
        <p className="muted">{message}</p>
        <p className="muted">We will take you back to login in a moment.</p>
      </div>
      <div className="contact-email-modal-actions">
        <button
          className="button-link primary-button"
          data-autofocus
          onClick={onContinue}
          type="button"
        >
          Continue to login
        </button>
      </div>
    </AccessibleModal>
  );
}

function readTokenFromHash(): string {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const token = params.get("token") ?? "";

  if (token) {
    window.history.replaceState(null, document.title, window.location.pathname);
  }

  return token;
}
