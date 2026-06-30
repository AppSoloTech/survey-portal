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
        <p className="eyebrow">Assessment Portal</p>
        <h1>
          Assessments that feel <span className="hero-accent">considered</span>, not collected.
        </h1>
        <p>
          Access assigned assessments, save progress as you go, and manage published assessment
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
          <h3>Browse public anonymous assessments</h3>
          <p>
            Open assessments listed by administrators can be started directly from the
            public directory.
          </p>
          <div className="home-anonymous-meta">
            <span>Public directory</span>
            <span>Anonymous access</span>
            <span>Tokenized assessment links</span>
          </div>
        </div>
        <Link className="button-link primary-button" to="/anonymous-surveys">
          View anonymous assessments
          <span className="visually-hidden"> in the public directory</span>
        </Link>
      </article>

      <details className="system-status-panel" data-reveal>
        <summary>System status</summary>
        <HealthCheck />
      </details>
    </section>
  );
}
