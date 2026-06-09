import { useAuth } from "../auth/AuthContext.js";

export function AdminDashboard() {
  const { user } = useAuth();

  return (
    <section className="page">
      <div className="page-header">
        <p className="eyebrow">Admin portal</p>
        <h2>Admin Dashboard</h2>
        <p>Survey authoring, response review, and exports will be implemented in later phases.</p>
      </div>
      {user ? (
        <p className="status muted">
          Signed in as {user.firstName} {user.lastName}
        </p>
      ) : null}
    </section>
  );
}
