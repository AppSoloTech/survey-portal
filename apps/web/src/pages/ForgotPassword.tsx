import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { requestPasswordReset } from "../api/auth.js";
import { AlertMessage } from "../components/AlertMessage.js";
import { FormField } from "../components/FormField.js";
import { useReveal } from "../motion/motion.js";

export function ForgotPassword() {
  const revealRef = useReveal<HTMLElement>();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isComplete = Boolean(message);
  const formErrorId = "forgot-password-form-error";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    try {
      const response = await requestPasswordReset({ email });
      setMessage(response.message);
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
          <h1>{isComplete ? "Check your email" : "Reset your password"}</h1>
          <p>
            {isComplete
              ? "If that account exists, a reset link is on its way."
              : "Enter your account email to receive a reset link."}
          </p>
        </div>
        {isComplete ? (
          <div className="auth-form reset-complete-panel">
            <AlertMessage variant="success">{message}</AlertMessage>
            <p className="form-note">You can close this page or return to login.</p>
            <Link className="button-link form-button" to="/login">
              Back to login
            </Link>
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <FormField
              describedByIds={error ? [formErrorId] : []}
              id="forgot-password-email"
              isInvalid={Boolean(error)}
              isRequired
              label="Email"
              reveal
            >
              {(fieldProps) => (
                <input
                  {...fieldProps}
                  autoComplete="email"
                  name="email"
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  type="email"
                  value={email}
                />
              )}
            </FormField>
            {error ? (
              <AlertMessage id={formErrorId} variant="error">
                {error}
              </AlertMessage>
            ) : null}
            <button
              className="button-link form-button"
              data-reveal
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? "Sending..." : "Send reset link"}
            </button>
            <p className="form-note" data-reveal>
              Remembered it? <Link to="/login">Back to login</Link>
            </p>
          </form>
        )}
      </div>
    </section>
  );
}
