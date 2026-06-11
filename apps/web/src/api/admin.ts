import type {
  AdminUserRoleResponse,
  AdminUsersListResponse,
  UserRole
} from "@survey-portal/shared";

import { apiRequest } from "./client.js";

export async function fetchAdminUsers(input: {
  page: number;
  pageSize?: number;
}): Promise<AdminUsersListResponse> {
  const params = new URLSearchParams({ page: String(input.page) });

  if (input.pageSize) {
    params.set("pageSize", String(input.pageSize));
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
