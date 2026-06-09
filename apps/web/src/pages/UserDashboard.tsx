import { useAuth } from "../auth/AuthContext.js";

export function UserDashboard() {
  const { logout, user } = useAuth();

  return (
    <section className="page">
      <div className="page-header">
        <p className="eyebrow">User portal</p>
        <h2>User Dashboard</h2>
        <p>Survey browsing, progress, and history will be implemented in later phases.</p>
      </div>
      {user ? (
        <div className="profile-panel">
          <dl>
            <div>
              <dt>Name</dt>
              <dd>
                {user.firstName} {user.lastName}
              </dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{user.email}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{user.role}</dd>
            </div>
          </dl>
          <button className="button-link form-button" onClick={logout} type="button">
            Logout
          </button>
        </div>
      ) : null}
    </section>
  );
}
