import { Link } from "react-router-dom";

import { useAuth } from "../auth/AuthContext.js";
import { HealthCheck } from "../components/HealthCheck.js";
import { useReveal } from "../motion/motion.js";

export function Home() {
  const { isAuthenticated, user } = useAuth();
  const revealRef = useReveal<HTMLElement>();

  return (
    <section className="page home-page" ref={revealRef}>
      <div className="page-header home-header" data-reveal>
        <p className="eyebrow">Survey Portal</p>
        <h2>
          Surveys that feel <span className="hero-accent">considered</span>, not collected.
        </h2>
        <p>
          Access assigned surveys, save progress as you go, and manage published survey
          content from the admin workspace when your account allows it.
        </p>
      </div>

      <div className="home-actions" data-reveal>
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

      <article className="home-anonymous-card" data-reveal>
        <div className="home-anonymous-card-main">
          <p className="eyebrow">No account required</p>
          <h3>Browse public anonymous surveys</h3>
          <p>
            Open surveys listed by administrators can be started directly from the
            public directory.
          </p>
          <div className="home-anonymous-meta">
            <span>Public directory</span>
            <span>Anonymous access</span>
            <span>Tokenized survey links</span>
          </div>
        </div>
        <Link className="button-link primary-button" to="/anonymous-surveys">
          View anonymous surveys
        </Link>
      </article>

      <details className="system-status-panel" data-reveal>
        <summary>System status</summary>
        <HealthCheck />
      </details>
    </section>
  );
}
