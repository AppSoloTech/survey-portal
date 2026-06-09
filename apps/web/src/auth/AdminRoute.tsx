import { Navigate, Outlet } from "react-router-dom";

import { useAuth } from "./AuthContext.js";

export function AdminRoute() {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return <p className="status muted">Checking session...</p>;
  }

  if (!isAuthenticated) {
    return <Navigate replace to="/login" />;
  }

  if (user?.role !== "admin") {
    return <Navigate replace to="/dashboard" />;
  }

  return <Outlet />;
}
