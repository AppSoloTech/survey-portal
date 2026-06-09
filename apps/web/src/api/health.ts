import type { HealthResponse } from "@survey-portal/shared";

export type ApiHealthResponse = HealthResponse & {
  database: "connected" | "unavailable";
};

export async function fetchApiHealth(): Promise<ApiHealthResponse> {
  const response = await fetch("/api/health");

  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}`);
  }

  return response.json() as Promise<ApiHealthResponse>;
}
