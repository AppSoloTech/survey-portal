export type UserRole = "user" | "admin";

export interface AuthUser {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  user: AuthUser;
  token: string;
}

export interface AuthMeResponse {
  user: AuthUser;
}

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
