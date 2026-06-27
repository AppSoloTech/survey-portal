import { Navigate, Outlet, useLocation } from "react-router-dom";

import { AlertMessage } from "../components/AlertMessage.js";
import { useAuth } from "./AuthContext.js";

export function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <AlertMessage variant="info">Checking session...</AlertMessage>;
  }

  if (!isAuthenticated) {
    return <Navigate replace state={{ from: location }} to="/login" />;
  }

  return <Outlet />;
}
