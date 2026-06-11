import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext.js";

export function Register() {
  const { isAuthenticated, register } = useAuth();
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    <section className="page auth-page">
      <div className="auth-card">
        <div className="page-header auth-card-header">
          <p className="eyebrow">User access</p>
          <h2>Register</h2>
          <p>Create a portal account.</p>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
        <label>
          First name
          <input
            autoComplete="given-name"
            name="firstName"
            onChange={(event) => setFirstName(event.target.value)}
            required
            type="text"
            value={firstName}
          />
        </label>
        <label>
          Last name
          <input
            autoComplete="family-name"
            name="lastName"
            onChange={(event) => setLastName(event.target.value)}
            required
            type="text"
            value={lastName}
          />
        </label>
        <label>
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
        <label>
          Password
          <input
            autoComplete="new-password"
            minLength={8}
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </label>
        {error ? <p className="status error">{error}</p> : null}
        <button className="button-link form-button" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Creating account..." : "Register"}
        </button>
          <p className="form-note">
            Already have an account? <Link to="/login">Login</Link>
          </p>
        </form>
      </div>
    </section>
  );
}
