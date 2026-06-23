import type { AdminUserDetailResponse, AdminUserSummary, UserRole } from "@survey-portal/shared";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import {
  fetchAdminUserDetail,
  fetchAdminUsers,
  requestAdminUserPasswordReset,
  updateUserRole
} from "../../api/admin.js";
import { useAuth } from "../../auth/AuthContext.js";
import { confirmAdminAction } from "../../components/admin/builderForm.js";
import { useToast } from "../../components/ToastProvider.js";

const usersPerPage = 20;

interface UserClassListState {
  users: AdminUserSummary[];
  total: number;
  page: number;
}

function createEmptyUserClassState(): UserClassListState {
  return {
    users: [],
    total: 0,
    page: 1
  };
}

export function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const toast = useToast();
  const [adminList, setAdminList] = useState<UserClassListState>(createEmptyUserClassState);
  const [standardList, setStandardList] = useState<UserClassListState>(createEmptyUserClassState);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isActive = true;

    setIsLoading(true);
    setError(null);

    Promise.all([
      fetchAdminUsers({ page: adminList.page, pageSize: usersPerPage, role: "admin" }),
      fetchAdminUsers({ page: standardList.page, pageSize: usersPerPage, role: "user" })
    ])
      .then(([adminResponse, standardResponse]) => {
        if (isActive) {
          setAdminList((current) => ({
            ...current,
            users: adminResponse.users,
            total: adminResponse.total,
            page: adminResponse.page
          }));
          setStandardList((current) => ({
            ...current,
            users: standardResponse.users,
            total: standardResponse.total,
            page: standardResponse.page
          }));
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
  }, [adminList.page, standardList.page, reloadKey]);

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
      setReloadKey((current) => current + 1);
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

      {!isLoading && adminList.total === 0 && standardList.total === 0 ? (
        <p className="status muted">No registered users found.</p>
      ) : null}

      <div className="admin-user-class-grid">
        <AdminUserClassSection
          className="admin"
          currentUserId={currentUser?.id ?? null}
          description="Accounts with access to survey setup, reporting, and user tools."
          isSubmitting={isSubmitting}
          onPageChange={(page) => setAdminList((current) => ({ ...current, page }))}
          onRoleChange={handleRoleChange}
          page={adminList.page}
          title="Administrators"
          total={adminList.total}
          users={adminList.users}
        />
        <AdminUserClassSection
          className="standard"
          currentUserId={currentUser?.id ?? null}
          description="Registered participants who can complete assigned and published surveys."
          isSubmitting={isSubmitting}
          onPageChange={(page) => setStandardList((current) => ({ ...current, page }))}
          onRoleChange={handleRoleChange}
          page={standardList.page}
          title="Standard users"
          total={standardList.total}
          users={standardList.users}
        />
      </div>
    </section>
  );
}

function AdminUserClassSection({
  className,
  currentUserId,
  description,
  isSubmitting,
  onPageChange,
  onRoleChange,
  page,
  title,
  total,
  users
}: {
  className: "admin" | "standard";
  currentUserId: number | null;
  description: string;
  isSubmitting: boolean;
  onPageChange: (page: number) => void;
  onRoleChange: (user: AdminUserSummary, role: UserRole) => Promise<void>;
  page: number;
  title: string;
  total: number;
  users: AdminUserSummary[];
}) {
  const pageCount = Math.max(1, Math.ceil(total / usersPerPage));

  return (
    <section className={`admin-user-class-section ${className}`}>
      <div className="admin-user-class-header">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <span className={`admin-user-class-count ${className}`}>
          {total} {total === 1 ? "account" : "accounts"}
        </span>
      </div>

      {users.length > 0 ? (
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
                const isSelf = currentUserId === user.id;
                const nextRole = user.role === "admin" ? "user" : "admin";

                return (
                  <tr key={user.id}>
                    <td data-label="Name">
                      {user.firstName} {user.lastName}
                      {isSelf ? <span className="muted"> (you)</span> : null}
                    </td>
                    <td data-label="Email">{user.email}</td>
                    <td data-label="Role">
                      <span className={`nav-identity-role ${user.role}`}>
                        {user.role === "admin" ? "Admin" : "User"}
                      </span>
                    </td>
                    <td data-label="Registered">{formatDate(user.createdAt)}</td>
                    <td data-label="Actions">
                      <div className="inline-actions">
                        <Link
                          className="button-link compact-button secondary-button"
                          to={`/admin/users/${user.id}`}
                        >
                          View details
                        </Link>
                        <button
                          className={`button-link compact-button ${
                            nextRole === "admin" ? "primary-button" : "danger-button"
                          }`}
                          disabled={isSubmitting || isSelf}
                          onClick={() => void onRoleChange(user, nextRole)}
                          title={isSelf ? "You cannot change your own role" : undefined}
                          type="button"
                        >
                          {nextRole === "admin" ? "Promote to admin" : "Demote to user"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="status muted">No {title.toLowerCase()} found.</p>
      )}

      {pageCount > 1 ? (
        <div className="pagination-row" aria-label={`${title} pages`}>
          <button
            className="button-link compact-button secondary-button"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
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
            onClick={() => onPageChange(page + 1)}
            type="button"
          >
            Next
          </button>
        </div>
      ) : null}
    </section>
  );
}

export function AdminUserDetailPage() {
  const { userId } = useParams();
  const toast = useToast();
  const parsedUserId = Number(userId);
  const [detail, setDetail] = useState<AdminUserDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isResetting, setIsResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    if (!Number.isSafeInteger(parsedUserId) || parsedUserId < 1) {
      setDetail(null);
      setError("User id must be a positive integer");
      setIsLoading(false);
      return () => {
        isActive = false;
      };
    }

    setIsLoading(true);
    setDetail(null);
    setError(null);
    setResetMessage(null);

    fetchAdminUserDetail(parsedUserId)
      .then((response) => {
        if (isActive) {
          setDetail(response);
        }
      })
      .catch((loadError) => {
        if (isActive) {
          setError(loadError instanceof Error ? loadError.message : "Could not load user details");
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
  }, [parsedUserId]);

  async function handlePasswordReset() {
    if (!detail) {
      return;
    }

    if (
      !confirmAdminAction(
        `Send a password reset email to ${detail.user.firstName} ${detail.user.lastName} (${detail.user.email})?`
      )
    ) {
      return;
    }

    setIsResetting(true);
    setError(null);
    setResetMessage(null);

    try {
      const response = await requestAdminUserPasswordReset(detail.user.id);
      setResetMessage(response.message);
      toast.success("Password reset email requested");
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Reset request failed");
    } finally {
      setIsResetting(false);
    }
  }

  const profile = detail?.profile;
  const stats = detail?.surveyStats;

  return (
    <section className="page admin-builder-page">
      <div className="page-header">
        <p className="eyebrow">Admin portal</p>
        <h2>User details</h2>
        <p>
          Review account metadata, registered survey status, and initiate a reset email.
        </p>
      </div>

      <Link className="button-link compact-button secondary-button" to="/admin/users">
        Back to users
      </Link>

      {error ? <p className="status error">{error}</p> : null}
      {resetMessage ? <p className="status success">{resetMessage}</p> : null}
      {isLoading ? <p className="status muted">Loading user details...</p> : null}

      {!isLoading && detail ? (
        <div className="admin-user-detail-layout">
          <section className="profile-panel">
            <div className="admin-user-detail-heading">
              <div>
                <h3>
                  {detail.user.firstName} {detail.user.lastName}
                </h3>
                <p>{detail.user.email}</p>
              </div>
              <span className={`nav-identity-role ${detail.user.role}`}>
                {detail.user.role === "admin" ? "Admin" : "User"}
              </span>
            </div>

            <dl>
              <div>
                <dt>Registered</dt>
                <dd>{formatDateTime(detail.user.createdAt)}</dd>
              </div>
              <div>
                <dt>Contact number</dt>
                <dd>{profile?.contactNumber ?? "Not provided"}</dd>
              </div>
              <div>
                <dt>Preferred contact method</dt>
                <dd>{profile?.preferredContactMethod ?? "Not provided"}</dd>
              </div>
              <div>
                <dt>Contact notes</dt>
                <dd>{profile?.contactNotes ?? "Not provided"}</dd>
              </div>
              <div>
                <dt>Profile updated</dt>
                <dd>{profile?.updatedAt ? formatDateTime(profile.updatedAt) : "Not provided"}</dd>
              </div>
            </dl>
          </section>

          <section className="profile-panel">
            <h3>Registered survey stats</h3>
            <div className="settings-stats-grid">
              <div className="settings-stat-tile">
                <span>Available</span>
                <strong>{stats?.available ?? 0}</strong>
              </div>
              <div className="settings-stat-tile">
                <span>In progress</span>
                <strong>{stats?.inProgress ?? 0}</strong>
              </div>
              <div className="settings-stat-tile">
                <span>Completed</span>
                <strong>{stats?.completed ?? 0}</strong>
              </div>
              <div className="settings-stat-tile">
                <span>Completion rate</span>
                <strong>{stats?.completionRate ?? 0}%</strong>
              </div>
              <div className="settings-stat-tile wide">
                <span>Last activity</span>
                <strong>{stats?.lastActivityAt ? formatDateTime(stats.lastActivityAt) : "None"}</strong>
              </div>
            </div>
          </section>

          <section className="profile-panel admin-user-reset-panel">
            <div>
              <h3>Password reset</h3>
              <p>Send the standard reset email for this account.</p>
            </div>
            <button
              className="button-link primary-button"
              disabled={isResetting}
              onClick={() => void handlePasswordReset()}
              type="button"
            >
              {isResetting ? "Sending..." : "Send reset email"}
            </button>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function formatDate(isoDate: string): string {
  const parsed = new Date(isoDate);
  return Number.isNaN(parsed.getTime()) ? "recently" : parsed.toLocaleDateString();
}

function formatDateTime(isoDate: string): string {
  const parsed = new Date(isoDate);
  return Number.isNaN(parsed.getTime()) ? "recently" : parsed.toLocaleString();
}
