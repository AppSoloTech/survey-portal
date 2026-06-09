import { NavLink, Route, BrowserRouter as Router, Routes } from "react-router-dom";

import { AdminDashboard } from "./pages/AdminDashboard.js";
import { Home } from "./pages/Home.js";
import { Login } from "./pages/Login.js";
import { NotFound } from "./pages/NotFound.js";
import { Register } from "./pages/Register.js";
import { UserDashboard } from "./pages/UserDashboard.js";

const links = [
  { to: "/", label: "Home" },
  { to: "/login", label: "Login" },
  { to: "/register", label: "Register" },
  { to: "/dashboard", label: "User Dashboard" },
  { to: "/admin", label: "Admin Dashboard" }
];

export function App() {
  return (
    <Router>
      <div className="app-shell">
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
          </nav>
        </header>

        <main>
          <Routes>
            <Route element={<Home />} path="/" />
            <Route element={<Login />} path="/login" />
            <Route element={<Register />} path="/register" />
            <Route element={<UserDashboard />} path="/dashboard" />
            <Route element={<AdminDashboard />} path="/admin" />
            <Route element={<NotFound />} path="*" />
          </Routes>
        </main>
      </div>
    </Router>
  );
}
