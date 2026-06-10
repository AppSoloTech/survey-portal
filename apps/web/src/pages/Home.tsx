import { Link } from "react-router-dom";

import { useAuth } from "../auth/AuthContext.js";
import { HealthCheck } from "../components/HealthCheck.js";

export function Home() {
  const { isAuthenticated, user } = useAuth();

  return (
    <section className="page home-page">
      <div className="page-header home-header">
        <p className="eyebrow">Survey Portal</p>
        <h2>Complete surveys with a clear, secure workspace.</h2>
        <p>
          Access assigned surveys, save progress as you go, and manage published survey
          content from the admin workspace when your account allows it.
        </p>
      </div>

      <div className="home-actions">
        {isAuthenticated ? (
          <>
            <Link className="button-link primary-button" to="/dashboard">
              Go to dashboard
            </Link>
            {user?.role === "admin" ? (
              <Link className="button-link secondary-button" to="/admin">
                Open admin workspace
              </Link>
            ) : null}
          </>
        ) : (
          <>
            <Link className="button-link primary-button" to="/login">
              Login
            </Link>
            <Link className="button-link secondary-button" to="/register">
              Create account
            </Link>
          </>
        )}
      </div>

      <details className="system-status-panel">
        <summary>System status</summary>
        <HealthCheck />
      </details>
    </section>
  );
}
