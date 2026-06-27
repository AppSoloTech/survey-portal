import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext.js";
import { AlertMessage } from "../components/AlertMessage.js";
import { FormField } from "../components/FormField.js";
import { useReveal } from "../motion/motion.js";

export function Register() {
  const { isAuthenticated, register } = useAuth();
  const navigate = useNavigate();
  const revealRef = useReveal<HTMLElement>();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const formErrorId = "register-form-error";

  if (isAuthenticated) {
    return <Navigate replace to="/dashboard" />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await register({ firstName, lastName, email, password });
      navigate("/dashboard", { replace: true });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Registration failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="page auth-page" ref={revealRef}>
      <div className="auth-card" data-reveal>
        <div className="page-header auth-card-header">
          <p className="eyebrow">User access</p>
          <h1>Create your account</h1>
          <p>Join the portal in under a minute.</p>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          <FormField
            describedByIds={error ? [formErrorId] : []}
            id="register-first-name"
            isInvalid={Boolean(error)}
            isRequired
            label="First name"
            reveal
          >
            {(fieldProps) => (
              <input
                {...fieldProps}
                autoComplete="given-name"
                name="firstName"
                onChange={(event) => setFirstName(event.target.value)}
                required
                type="text"
                value={firstName}
              />
            )}
          </FormField>
          <FormField
            describedByIds={error ? [formErrorId] : []}
            id="register-last-name"
            isInvalid={Boolean(error)}
            isRequired
            label="Last name"
            reveal
          >
            {(fieldProps) => (
              <input
                {...fieldProps}
                autoComplete="family-name"
                name="lastName"
                onChange={(event) => setLastName(event.target.value)}
                required
                type="text"
                value={lastName}
              />
            )}
          </FormField>
          <FormField
            describedByIds={error ? [formErrorId] : []}
            id="register-email"
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
          <FormField
            describedByIds={error ? [formErrorId] : []}
            helperText="Use at least 8 characters."
            id="register-password"
            isInvalid={Boolean(error)}
            isRequired
            label="Password"
            reveal
          >
            {(fieldProps) => (
              <input
                {...fieldProps}
                autoComplete="new-password"
                minLength={8}
                name="password"
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
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
            {isSubmitting ? "Creating account..." : "Register"}
          </button>
          <p className="form-note" data-reveal>
            Already have an account? <Link to="/login">Login</Link>
          </p>
        </form>
      </div>
    </section>
  );
}
