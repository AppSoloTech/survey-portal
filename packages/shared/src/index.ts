export type UserRole = "user" | "admin";

export type SurveyAttemptStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "abandoned";

export interface HealthResponse {
  status: "ok";
  app: "survey-portal";
  runEnv: "dev" | "prod";
  timestamp: string;
}
