import type { AuthMeResponse, AuthResponse } from "@survey-portal/shared";

import { apiRequest } from "./client.js";

export async function registerUser(input: {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}): Promise<AuthResponse> {
  return apiRequest<AuthResponse>("/api/auth/register", {
    body: JSON.stringify({
      first_name: input.firstName,
      last_name: input.lastName,
      email: input.email,
      password: input.password
    }),
    method: "POST"
  });
}

export async function loginUser(input: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  return apiRequest<AuthResponse>("/api/auth/login", {
    body: JSON.stringify(input),
    method: "POST"
  });
}

export async function fetchCurrentUser(): Promise<AuthMeResponse> {
  return apiRequest<AuthMeResponse>("/api/auth/me");
}

export async function logoutUser(): Promise<void> {
  await apiRequest<void>("/api/auth/logout", {
    method: "POST"
  });
}
