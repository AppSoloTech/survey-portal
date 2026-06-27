import { useEffect, useState } from "react";

import { fetchApiHealth, type ApiHealthResponse } from "../api/health.js";
import { AlertMessage } from "./AlertMessage.js";

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
    return <AlertMessage variant="info">Checking API health...</AlertMessage>;
  }

  if (health.status === "error") {
    return <AlertMessage variant="error">{health.message}</AlertMessage>;
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
