import { Link } from "react-router-dom";

import { useAuth } from "../auth/AuthContext.js";
import { HealthCheck } from "../components/HealthCheck.js";
import { useReveal } from "../motion/motion.js";

const features = [
  {
    icon: "◍",
    title: "Pick up anywhere",
    description: "Every answer saves as you go, so a survey can wait while life happens."
  },
  {
    icon: "⌁",
    title: "Paths that adapt",
    description: "Branching logic skips what doesn't apply and keeps each attempt short."
  },
  {
    icon: "◳",
    title: "Insight built in",
    description: "Admins watch results roll up live — distributions, funnels, and tags."
  }
];

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

      <div className="home-feature-grid">
        {features.map((feature) => (
          <article className="home-feature-card" data-reveal key={feature.title}>
            <span aria-hidden="true" className="home-feature-icon">
              {feature.icon}
            </span>
            <h3>{feature.title}</h3>
            <p>{feature.description}</p>
          </article>
        ))}
      </div>

      <details className="system-status-panel" data-reveal>
        <summary>System status</summary>
        <HealthCheck />
      </details>
    </section>
  );
}
