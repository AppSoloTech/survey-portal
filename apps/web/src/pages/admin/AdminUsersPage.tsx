import type { AdminUserSummary, UserRole } from "@survey-portal/shared";
import { useEffect, useState } from "react";

import { fetchAdminUsers, updateUserRole } from "../../api/admin.js";
import { useAuth } from "../../auth/AuthContext.js";
import { confirmAdminAction } from "../../components/admin/builderForm.js";
import { useToast } from "../../components/ToastProvider.js";

const usersPerPage = 20;

export function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    setIsLoading(true);

    fetchAdminUsers({ page, pageSize: usersPerPage })
      .then((response) => {
        if (isActive) {
          setUsers(response.users);
          setTotal(response.total);
        }
      })
      .catch((loadError) => {
        if (isActive) {
          setError(loadError instanceof Error ? loadError.message : "Could not load users");
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [page]);

  const pageCount = Math.max(1, Math.ceil(total / usersPerPage));

  async function handleRoleChange(user: AdminUserSummary, role: UserRole) {
    const action = role === "admin" ? "Promote" : "Demote";

    if (
      !confirmAdminAction(
        `${action} ${user.firstName} ${user.lastName} (${user.email}) to ${role}?`
      )
    ) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await updateUserRole({ userId: user.id, role });
      setUsers((current) =>
        current.map((item) => (item.id === user.id ? response.user : item))
      );
      toast.success(`${response.user.firstName} ${response.user.lastName} is now ${role === "admin" ? "an admin" : "a user"}`);
    } catch (roleError) {
      setError(roleError instanceof Error ? roleError.message : "Request failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="page admin-builder-page">
      <div className="page-header">
        <p className="eyebrow">Admin portal</p>
        <h2>User management</h2>
        <p>
          Review registered accounts and manage admin access. Promotions and demotions
          take effect immediately.
        </p>
      </div>

      {error ? <p className="status error">{error}</p> : null}
      {isLoading ? <p className="status muted">Loading users...</p> : null}

      {!isLoading && users.length > 0 ? (
        <div className="admin-users-table-wrap">
          <table className="admin-users-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                <th scope="col">Registered</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isSelf = currentUser?.id === user.id;

                return (
                  <tr key={user.id}>
                    <td>
                      {user.firstName} {user.lastName}
                      {isSelf ? <span className="muted"> (you)</span> : null}
                    </td>
                    <td>{user.email}</td>
                    <td>
                      <span className={`nav-identity-role ${user.role}`}>
                        {user.role === "admin" ? "Admin" : "User"}
                      </span>
                    </td>
                    <td>{formatDate(user.createdAt)}</td>
                    <td>
                      {user.role === "admin" ? (
                        <button
                          className="button-link compact-button danger-button"
                          disabled={isSubmitting || isSelf}
                          onClick={() => void handleRoleChange(user, "user")}
                          title={isSelf ? "You cannot change your own role" : undefined}
                          type="button"
                        >
                          Demote to user
                        </button>
                      ) : (
                        <button
                          className="button-link compact-button primary-button"
                          disabled={isSubmitting || isSelf}
                          onClick={() => void handleRoleChange(user, "admin")}
                          type="button"
                        >
                          Promote to admin
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {!isLoading && users.length === 0 ? (
        <p className="status muted">No registered users found.</p>
      ) : null}

      {pageCount > 1 ? (
        <div className="pagination-row" aria-label="User list pages">
          <button
            className="button-link compact-button secondary-button"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            type="button"
          >
            Previous
          </button>
          <span className="pagination-status">
            Page {page} of {pageCount}
          </span>
          <button
            className="button-link compact-button secondary-button"
            disabled={page >= pageCount}
            onClick={() => setPage(page + 1)}
            type="button"
          >
            Next
          </button>
        </div>
      ) : null}
    </section>
  );
}

function formatDate(isoDate: string): string {
  const parsed = new Date(isoDate);
  return Number.isNaN(parsed.getTime()) ? "recently" : parsed.toLocaleDateString();
}
