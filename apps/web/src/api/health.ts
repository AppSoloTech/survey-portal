import type { HealthResponse } from "@survey-portal/shared";

export type ApiHealthResponse = HealthResponse;

export async function fetchApiHealth(): Promise<ApiHealthResponse> {
  const response = await fetch("/api/health");
  const data = (await response.json().catch(() => null)) as ApiHealthResponse | null;

  if (data?.app === "survey-portal") {
    return data;
  }

  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}`);
  }

  throw new Error("Health check returned an invalid response");
}
