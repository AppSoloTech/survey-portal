import { NavLink, Route, BrowserRouter as Router, Routes, useNavigate } from "react-router-dom";

import { AdminRoute } from "./auth/AdminRoute.js";
import { AuthProvider, useAuth } from "./auth/AuthContext.js";
import { ProtectedRoute } from "./auth/ProtectedRoute.js";
import { AdminDashboard } from "./pages/AdminDashboard.js";
import { Home } from "./pages/Home.js";
import { Login } from "./pages/Login.js";
import { NotFound } from "./pages/NotFound.js";
import { Register } from "./pages/Register.js";
import { UserDashboard } from "./pages/UserDashboard.js";

export function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="app-shell">
          <Header />

          <main>
            <Routes>
              <Route element={<Home />} path="/" />
              <Route element={<Login />} path="/login" />
              <Route element={<Register />} path="/register" />
              <Route element={<ProtectedRoute />}>
                <Route element={<UserDashboard />} path="/dashboard" />
              </Route>
              <Route element={<AdminRoute />}>
                <Route element={<AdminDashboard />} path="/admin" />
              </Route>
              <Route element={<NotFound />} path="*" />
            </Routes>
          </main>
        </div>
      </Router>
    </AuthProvider>
  );
}

function Header() {
  const { isAuthenticated, logout, user } = useAuth();
  const navigate = useNavigate();

  const links = isAuthenticated
    ? [
        { to: "/", label: "Home" },
        { to: "/dashboard", label: "Dashboard" },
        ...(user?.role === "admin" ? [{ to: "/admin", label: "Admin" }] : [])
      ]
    : [
        { to: "/", label: "Home" },
        { to: "/login", label: "Login" },
        { to: "/register", label: "Register" }
      ];

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <header className="app-header">
      <div>
        <p className="eyebrow">Survey Portal</p>
        <h1>Secure survey workspace</h1>
      </div>
      <nav aria-label="Primary navigation">
        {links.map((link) => (
          <NavLink
            className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
            key={link.to}
            to={link.to}
          >
            {link.label}
          </NavLink>
        ))}
        {isAuthenticated ? (
          <button className="nav-link nav-button" onClick={handleLogout} type="button">
            Logout
          </button>
        ) : null}
      </nav>
    </header>
  );
}
