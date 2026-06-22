import { lazy, Suspense, useEffect, useState } from "react";
import {
  Link,
  Navigate,
  NavLink,
  Route,
  BrowserRouter as Router,
  Routes,
  useLocation,
  useNavigate
} from "react-router-dom";

import { AdminRoute } from "./auth/AdminRoute.js";
import { AuthProvider, useAuth } from "./auth/AuthContext.js";
import { ProtectedRoute } from "./auth/ProtectedRoute.js";
import { ThemeToggle } from "./components/ThemeToggle.js";
import { ToastProvider } from "./components/ToastProvider.js";
import { AdminSurveysOverview } from "./pages/admin/AdminSurveysOverview.js";
import { AdminTagsPage } from "./pages/admin/AdminTagsPage.js";
import { AdminUsersPage } from "./pages/admin/AdminUsersPage.js";
import { SurveyLogicPage } from "./pages/admin/SurveyLogicPage.js";
import { SurveyOrganizePage } from "./pages/admin/SurveyOrganizePage.js";
import { SurveyPreviewPage } from "./pages/admin/SurveyPreviewPage.js";
import { SurveyQuestionsPage } from "./pages/admin/SurveyQuestionsPage.js";
import { SurveyResultsPage } from "./pages/admin/SurveyResultsPage.js";
import { SurveySetupPage } from "./pages/admin/SurveySetupPage.js";
import { SurveyWorkspaceLayout } from "./pages/admin/SurveyWorkspaceLayout.js";
import { RouteTransition } from "./motion/RouteTransition.js";
import { AccountSettings } from "./pages/AccountSettings.js";
import { CategorySurveysPage } from "./pages/CategorySurveysPage.js";
import { ForgotPassword } from "./pages/ForgotPassword.js";
import { Home } from "./pages/Home.js";
import { Login } from "./pages/Login.js";
import { NotFound } from "./pages/NotFound.js";
import { Register } from "./pages/Register.js";
import { ResetPassword } from "./pages/ResetPassword.js";
import { AnonymousSurveyAttemptPage, SurveyAttemptPage } from "./pages/SurveyAttemptPage.js";
import { UserDashboard } from "./pages/UserDashboard.js";

export function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Router>
          <BackdropGate />
          <div className="app-shell">
            <Header />

            <main>
              <RouteTransition>
                <Routes>
                  <Route element={<Home />} path="/" />
                  <Route element={<Login />} path="/login" />
                  <Route element={<Register />} path="/register" />
                  <Route element={<ForgotPassword />} path="/forgot-password" />
                  <Route element={<ResetPassword />} path="/reset-password" />
                  <Route
                    element={<AnonymousSurveyAttemptPage />}
                    path="/anonymous-surveys/:token"
                  />
                  <Route element={<ProtectedRoute />}>
                    <Route element={<UserDashboard />} path="/dashboard" />
                    <Route element={<AccountSettings />} path="/settings" />
                    <Route
                      element={<CategorySurveysPage />}
                      path="/dashboard/category/:categoryId"
                    />
                    <Route element={<SurveyAttemptPage />} path="/surveys/:surveyId/attempt" />
                  </Route>
                  <Route element={<AdminRoute />}>
                    <Route element={<AdminSurveysOverview />} path="/admin" />
                    <Route element={<AdminUsersPage />} path="/admin/users" />
                    <Route element={<AdminTagsPage />} path="/admin/tags" />
                    <Route element={<SurveyWorkspaceLayout />} path="/admin/surveys/:surveyId">
                      <Route element={<Navigate replace to="setup" />} index />
                      <Route element={<SurveySetupPage />} path="setup" />
                      <Route element={<SurveyQuestionsPage />} path="questions" />
                      <Route element={<SurveyOrganizePage />} path="organize" />
                      <Route element={<SurveyLogicPage />} path="logic" />
                      <Route element={<SurveyPreviewPage />} path="preview" />
                      <Route element={<SurveyResultsPage />} path="results" />
                    </Route>
                  </Route>
                  <Route element={<NotFound />} path="*" />
                </Routes>
              </RouteTransition>
            </main>
          </div>
        </Router>
      </ToastProvider>
    </AuthProvider>
  );
}

// three.js stays out of the main bundle; only public pages render the aurora.
const AmbientBackdrop = lazy(() => import("./components/AmbientBackdrop.js"));

const backdropPaths = new Set(["/", "/login", "/register", "/forgot-password", "/reset-password"]);

function BackdropGate() {
  const { pathname } = useLocation();

  if (!backdropPaths.has(pathname)) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <AmbientBackdrop />
    </Suspense>
  );
}

function Header() {
  const { isAuthenticated, logout, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  // The glass header earns its border/shadow only after the page moves.
  useEffect(() => {
    function onScroll() {
      setIsScrolled(window.scrollY > 8);
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const links = isAuthenticated
    ? [
        { to: "/dashboard", label: "Dashboard" },
        ...(user?.role === "admin" ? [{ to: "/admin", label: "Admin" }] : [])
      ]
    : [
        { to: "/", label: "Home" },
        { to: "/register", label: "Create account" }
      ];
  const isAccountActive = location.pathname.startsWith("/settings");

  function closeMenu() {
    setIsMenuOpen(false);
    setIsAccountMenuOpen(false);
  }

  async function handleLogout() {
    closeMenu();
    await logout();
    navigate("/login");
  }

  return (
    <header className={isScrolled ? "app-header scrolled" : "app-header"}>
      <Link className="brand-link" onClick={closeMenu} to="/">
        <p className="eyebrow">Survey Portal</p>
        <h1>Survey workspace</h1>
      </Link>
      <button
        aria-controls="primary-navigation"
        aria-expanded={isMenuOpen}
        className="nav-toggle"
        onClick={() => setIsMenuOpen((open) => !open)}
        type="button"
      >
        <span aria-hidden="true" className="nav-toggle-icon" />
        Menu
      </button>
      <nav
        aria-label="Primary navigation"
        className={isMenuOpen ? "primary-nav open" : "primary-nav"}
        id="primary-navigation"
      >
        {links.map((link) => (
          <NavLink
            className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
            end={link.to === "/admin"}
            key={link.to}
            onClick={closeMenu}
            to={link.to}
          >
            {link.label}
          </NavLink>
        ))}
        {isAuthenticated && user ? (
          <div className={isAccountMenuOpen ? "account-menu open" : "account-menu"}>
            <button
              aria-expanded={isAccountMenuOpen}
              aria-haspopup="menu"
              className={isAccountActive ? "nav-link nav-button active" : "nav-link nav-button"}
              onClick={() => setIsAccountMenuOpen((open) => !open)}
              type="button"
            >
              Account
            </button>
            <div className="account-menu-panel" role="menu">
              <div className="nav-identity" aria-label="Signed in account">
                <span className="nav-identity-name">
                  {user.firstName} {user.lastName}
                </span>
                {user.role === "admin" ? (
                  <span className="nav-identity-role admin">Admin</span>
                ) : null}
              </div>
              <NavLink
                className={({ isActive }) =>
                  isActive ? "account-menu-item active" : "account-menu-item"
                }
                onClick={closeMenu}
                role="menuitem"
                to="/settings"
              >
                Settings
              </NavLink>
              <div className="account-menu-item theme-menu-item">
                <ThemeToggle />
              </div>
              <button
                className="account-menu-item account-menu-button"
                onClick={handleLogout}
                role="menuitem"
                type="button"
              >
                Logout
              </button>
            </div>
          </div>
        ) : null}
      </nav>
    </header>
  );
}
