import type {
  AuthMeResponse,
  AuthResponse,
  CurrentUserProfileResponse,
  PasswordResetMessageResponse
} from "@survey-portal/shared";

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

export async function fetchCurrentUserProfile(): Promise<CurrentUserProfileResponse> {
  return apiRequest<CurrentUserProfileResponse>("/api/profile");
}

export async function updateCurrentUserProfile(input: {
  contactNumber: string;
  preferredContactMethod: string;
  contactNotes: string;
}): Promise<CurrentUserProfileResponse["profile"]> {
  const response = await apiRequest<{ profile: CurrentUserProfileResponse["profile"] }>(
    "/api/profile",
    {
      body: JSON.stringify(input),
      method: "PUT"
    }
  );

  return response.profile;
}

export async function logoutUser(): Promise<void> {
  await apiRequest<void>("/api/auth/logout", {
    method: "POST"
  });
}

export async function requestPasswordReset(input: {
  email: string;
}): Promise<PasswordResetMessageResponse> {
  return apiRequest<PasswordResetMessageResponse>("/api/auth/password-reset/request", {
    body: JSON.stringify({ email: input.email }),
    method: "POST"
  });
}

export async function requestCurrentUserPasswordReset(): Promise<PasswordResetMessageResponse> {
  return apiRequest<PasswordResetMessageResponse>("/api/auth/me/password-reset/request", {
    method: "POST"
  });
}

export async function completePasswordReset(input: {
  token: string;
  newPassword: string;
}): Promise<PasswordResetMessageResponse> {
  return apiRequest<PasswordResetMessageResponse>("/api/auth/password-reset/complete", {
    body: JSON.stringify(input),
    method: "POST"
  });
}
