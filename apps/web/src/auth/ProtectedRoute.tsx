import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "./AuthContext.js";

export function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <p className="status muted">Checking session...</p>;
  }

  if (!isAuthenticated) {
    return <Navigate replace state={{ from: location }} to="/login" />;
  }

  return <Outlet />;
}
