import type {
  AdminUserDetailResponse,
  AdminUserPasswordResetResponse,
  AdminUserRoleResponse,
  AdminUsersListResponse,
  SoftwareReleaseNotesResponse,
  UserRole
} from "@survey-portal/shared";

import { apiRequest } from "./client.js";

export async function fetchAdminUsers(input: {
  page: number;
  pageSize?: number;
  role?: UserRole;
}): Promise<AdminUsersListResponse> {
  const params = new URLSearchParams({ page: String(input.page) });

  if (input.pageSize) {
    params.set("pageSize", String(input.pageSize));
  }

  if (input.role) {
    params.set("role", input.role);
  }

  return apiRequest<AdminUsersListResponse>(`/api/admin/users?${params.toString()}`);
}

export async function updateUserRole(input: {
  userId: number;
  role: UserRole;
}): Promise<AdminUserRoleResponse> {
  return apiRequest<AdminUserRoleResponse>(`/api/admin/users/${input.userId}/role`, {
    body: JSON.stringify({ role: input.role }),
    method: "PATCH"
  });
}

export async function fetchAdminUserDetail(userId: number): Promise<AdminUserDetailResponse> {
  return apiRequest<AdminUserDetailResponse>(`/api/admin/users/${userId}`);
}

export async function requestAdminUserPasswordReset(
  userId: number
): Promise<AdminUserPasswordResetResponse> {
  return apiRequest<AdminUserPasswordResetResponse>(`/api/admin/users/${userId}/password-reset`, {
    method: "POST"
  });
}

export async function fetchSoftwareReleaseNotes(): Promise<SoftwareReleaseNotesResponse> {
  return apiRequest<SoftwareReleaseNotesResponse>("/api/admin/releases");
}
