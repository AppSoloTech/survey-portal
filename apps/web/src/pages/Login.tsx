import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext.js";

export function Login() {
  const { isAuthenticated, login } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const from = readRedirectPath(location.state) ?? "/dashboard";

  if (isAuthenticated) {
    return <Navigate replace to={from} />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await login({ email, password });
      navigate(from, { replace: true });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="page auth-page">
      <div className="auth-card">
        <div className="page-header auth-card-header">
          <p className="eyebrow">User access</p>
          <h2>Login</h2>
          <p>Access your survey workspace.</p>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
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
            autoComplete="current-password"
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </label>
        {error ? <p className="status error">{error}</p> : null}
        <button className="button-link form-button" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Logging in..." : "Login"}
        </button>
          <p className="form-note">
            Need an account? <Link to="/register">Register</Link>
          </p>
        </form>
      </div>
    </section>
  );
}

function readRedirectPath(state: unknown): string | null {
  if (
    typeof state === "object" &&
    state !== null &&
    "from" in state &&
    typeof state.from === "object" &&
    state.from !== null &&
    "pathname" in state.from &&
    typeof state.from.pathname === "string"
  ) {
    return state.from.pathname;
  }

  return null;
}
