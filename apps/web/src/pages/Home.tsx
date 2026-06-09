import { HealthCheck } from "../components/HealthCheck.js";

export function Home() {
  return (
    <section className="page">
      <div className="page-header">
        <p className="eyebrow">Foundation</p>
        <h2>Application shell</h2>
        <p>
          The portal foundation is ready for authentication, survey management, survey
          completion, and reporting phases.
        </p>
      </div>
      <HealthCheck />
    </section>
  );
}
