import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { requestPasswordReset } from "../api/auth.js";
import { useReveal } from "../motion/motion.js";

export function ForgotPassword() {
  const revealRef = useReveal<HTMLElement>();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isComplete = Boolean(message);

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
          <h2>{isComplete ? "Check your email" : "Reset your password"}</h2>
          <p>
            {isComplete
              ? "If that account exists, a reset link is on its way."
              : "Enter your account email to receive a reset link."}
          </p>
        </div>
        {isComplete ? (
          <div className="auth-form reset-complete-panel">
            <p className="status success">{message}</p>
            <p className="form-note">You can close this page or return to login.</p>
            <Link className="button-link form-button" to="/login">
              Back to login
            </Link>
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <label data-reveal>
              Email
              <input
                autoComplete="email"
                name="email"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </label>
            {error ? <p className="status error">{error}</p> : null}
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
