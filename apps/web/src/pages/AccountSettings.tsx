import { useEffect, useState } from "react";

import { requestCurrentUserPasswordReset } from "../api/auth.js";
import { useAuth } from "../auth/AuthContext.js";
import { useReveal } from "../motion/motion.js";

export function AccountSettings() {
  const { user } = useAuth();
  const revealRef = useReveal<HTMLElement>();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const isCoolingDown = cooldownSeconds > 0;

  useEffect(() => {
    if (!isCoolingDown) {
      return undefined;
    }

    const cooldownTimer = window.setTimeout(() => {
      setCooldownSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);

    return () => {
      window.clearTimeout(cooldownTimer);
    };
  }, [isCoolingDown, cooldownSeconds]);

  async function handleRequestReset() {
    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    try {
      const response = await requestCurrentUserPasswordReset();
      setMessage(response.message);
      setCooldownSeconds(30);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Password reset failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="page settings-page" ref={revealRef}>
      <div className="page-header" data-reveal>
        <p className="eyebrow">Account</p>
        <h2>Settings</h2>
        <p>Review your account details and request a password reset email.</p>
      </div>

      <div className="profile-panel" data-reveal>
        <dl>
          <div>
            <dt>Name</dt>
            <dd>
              {user?.firstName} {user?.lastName}
            </dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{user?.email}</dd>
          </div>
          <div>
            <dt>Role</dt>
            <dd>{user?.role === "admin" ? "Admin" : "User"}</dd>
          </div>
        </dl>

        <div className="settings-action">
          <div>
            <h3>Password reset</h3>
            <p>A reset link will be sent to your account email.</p>
          </div>
          <button
            className="button-link compact-button primary-button"
            disabled={isSubmitting || isCoolingDown}
            onClick={handleRequestReset}
            type="button"
          >
            {getResetButtonLabel({ isSubmitting, cooldownSeconds })}
          </button>
        </div>

        {message ? <p className="status success">{message}</p> : null}
        {error ? <p className="status error">{error}</p> : null}
      </div>
    </section>
  );
}

function getResetButtonLabel({
  isSubmitting,
  cooldownSeconds
}: {
  isSubmitting: boolean;
  cooldownSeconds: number;
}): string {
  if (isSubmitting) {
    return "Sending...";
  }

  if (cooldownSeconds > 0) {
    return `Sent (${cooldownSeconds}s)`;
  }

  return "Send reset link";
}
