import { useEffect, useState } from "react";

import { fetchApiHealth, type ApiHealthResponse } from "../api/health.js";

type HealthState =
  | { status: "loading" }
  | { status: "ready"; data: ApiHealthResponse }
  | { status: "error"; message: string };

export function HealthCheck() {
  const [health, setHealth] = useState<HealthState>({ status: "loading" });

  useEffect(() => {
    let active = true;

    fetchApiHealth()
      .then((data) => {
        if (active) {
          setHealth({ status: "ready", data });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setHealth({
            status: "error",
            message: error instanceof Error ? error.message : "Unable to reach API"
          });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (health.status === "loading") {
    return <p className="status muted">Checking API health...</p>;
  }

  if (health.status === "error") {
    return <p className="status error">{health.message}</p>;
  }

  return (
    <dl className="health-grid" aria-label="API health">
      <div>
        <dt>API</dt>
        <dd>{health.data.status}</dd>
      </div>
      <div>
        <dt>Database</dt>
        <dd>{health.data.database}</dd>
      </div>
      <div>
        <dt>Environment</dt>
        <dd>{health.data.runEnv}</dd>
      </div>
    </dl>
  );
}
