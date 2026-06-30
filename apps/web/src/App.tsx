import { lazy, Suspense, useEffect, useRef, useState } from "react";
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
import { AdminGlossaryPage } from "./pages/admin/AdminGlossaryPage.js";
import { AdminPerformancePage } from "./pages/admin/AdminPerformancePage.js";
import { AdminReleasesPage } from "./pages/admin/AdminReleasesPage.js";
import { AdminSurveysOverview } from "./pages/admin/AdminSurveysOverview.js";
import { AdminTagsPage } from "./pages/admin/AdminTagsPage.js";
import { AdminUserDetailPage, AdminUsersPage } from "./pages/admin/AdminUsersPage.js";
import { SurveyLogicPage } from "./pages/admin/SurveyLogicPage.js";
import { SurveyOrganizePage } from "./pages/admin/SurveyOrganizePage.js";
import { SurveyPreviewPage } from "./pages/admin/SurveyPreviewPage.js";
import { SurveyQuestionsPage } from "./pages/admin/SurveyQuestionsPage.js";
import { SurveyResultsPage } from "./pages/admin/SurveyResultsPage.js";
import { SurveySetupPage } from "./pages/admin/SurveySetupPage.js";
import { SurveyTemplatesPage } from "./pages/admin/SurveyTemplatesPage.js";
import { SurveyWorkspaceLayout } from "./pages/admin/SurveyWorkspaceLayout.js";
import { RouteTransition } from "./motion/RouteTransition.js";
import { AccountSettings } from "./pages/AccountSettings.js";
import { AnonymousSurveyDirectoryPage } from "./pages/AnonymousSurveyDirectoryPage.js";
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
    <ToastProvider>
      <Router>
        <AppShell />
      </Router>
    </ToastProvider>
  );
}

function AppShell() {
  const location = useLocation();
  const isPublicAnonymousRoute =
    location.pathname === "/anonymous-surveys" ||
    location.pathname.startsWith("/anonymous-surveys/");

  if (isPublicAnonymousRoute) {
    return (
      <>
        <BackdropGate />
        <RouteAccessibilityManager />
        <div className="app-shell">
          <a className="skip-link" href="#main-content">
            Skip to main content
          </a>
          <PublicHeader />

          <main id="main-content" tabIndex={-1}>
            <RouteTransition>
              <Routes>
                <Route element={<AnonymousSurveyDirectoryPage />} path="/anonymous-surveys" />
                <Route element={<AnonymousSurveyAttemptPage />} path="/anonymous-surveys/:token" />
                <Route element={<NotFound />} path="*" />
              </Routes>
            </RouteTransition>
          </main>
        </div>
      </>
    );
  }

  return (
    <AuthProvider>
      <BackdropGate />
      <RouteAccessibilityManager />
      <div className="app-shell">
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <Header />

        <main id="main-content" tabIndex={-1}>
          <RouteTransition>
            <Routes>
              <Route element={<Home />} path="/" />
              <Route element={<Login />} path="/login" />
              <Route element={<Register />} path="/register" />
              <Route element={<ForgotPassword />} path="/forgot-password" />
              <Route element={<ResetPassword />} path="/reset-password" />
              <Route element={<ProtectedRoute />}>
                <Route element={<UserDashboard />} path="/dashboard" />
                <Route element={<AccountSettings />} path="/settings" />
                <Route element={<CategorySurveysPage />} path="/dashboard/category/:categoryId" />
                <Route element={<SurveyAttemptPage />} path="/surveys/:surveyId/attempt" />
              </Route>
              <Route element={<AdminRoute />}>
                <Route element={<AdminSurveysOverview />} path="/admin" />
                <Route element={<AdminPerformancePage />} path="/admin/performance" />
                <Route element={<AdminReleasesPage />} path="/admin/releases" />
                <Route element={<AdminGlossaryPage />} path="/admin/glossary" />
                <Route element={<AdminUsersPage />} path="/admin/users" />
                <Route element={<AdminUserDetailPage />} path="/admin/users/:userId" />
                <Route element={<AdminTagsPage />} path="/admin/tags" />
                <Route element={<SurveyWorkspaceLayout />} path="/admin/surveys/:surveyId">
                  <Route element={<Navigate replace to="setup" />} index />
                  <Route element={<SurveySetupPage />} path="setup" />
                  <Route element={<SurveyQuestionsPage />} path="questions" />
                  <Route element={<SurveyOrganizePage />} path="organize" />
                  <Route element={<SurveyTemplatesPage />} path="templates" />
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
    </AuthProvider>
  );
}

const appTitle = "Assessment Portal";

const routeTitles = [
  { pattern: /^\/$/, title: "Home" },
  { pattern: /^\/login$/, title: "Login" },
  { pattern: /^\/register$/, title: "Register" },
  { pattern: /^\/forgot-password$/, title: "Forgot password" },
  { pattern: /^\/reset-password$/, title: "Reset password" },
  { pattern: /^\/dashboard$/, title: "Dashboard" },
  { pattern: /^\/settings$/, title: "Account settings" },
  { pattern: /^\/dashboard\/category\/[^/]+$/, title: "Assessment group" },
  { pattern: /^\/surveys\/[^/]+\/attempt$/, title: "Assessment attempt" },
  { pattern: /^\/anonymous-surveys$/, title: "Anonymous assessments" },
  { pattern: /^\/anonymous-surveys\/[^/]+$/, title: "Anonymous assessment attempt" },
  { pattern: /^\/admin\/performance$/, title: "Performance reports" }
];

export function getRouteTitle(pathname: string): string | null {
  return routeTitles.find((route) => route.pattern.test(pathname))?.title ?? null;
}

function RouteAccessibilityManager() {
  const location = useLocation();
  const [announcement, setAnnouncement] = useState("");
  const hasMountedRef = useRef(false);

  useEffect(() => {
    const routeTitle = getRouteTitle(location.pathname);

    if (!routeTitle) {
      hasMountedRef.current = true;
      return undefined;
    }

    document.title = `${routeTitle} | ${appTitle}`;

    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      const main = document.getElementById("main-content");

      main?.focus({ preventScroll: true });
      setAnnouncement(routeTitle);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [location.pathname]);

  return (
    <div aria-atomic="true" aria-live="polite" className="visually-hidden" role="status">
      {announcement ? `Navigated to ${announcement}` : ""}
    </div>
  );
}

// three.js stays out of the main bundle; only public pages render the aurora.
const AmbientBackdrop = lazy(() => import("./components/AmbientBackdrop.js"));

const backdropPaths = new Set([
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/anonymous-surveys"
]);

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

function PublicHeader() {
  const [isScrolled, setIsScrolled] = useState(false);

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

  return (
    <header className={isScrolled ? "app-header scrolled" : "app-header"}>
      <Link className="brand-link" to="/anonymous-surveys">
        <p className="eyebrow">Assessment Portal</p>
        <span className="brand-title">Anonymous assessments</span>
      </Link>
      <div className="header-actions">
        <ThemeToggle />
        <Link className="nav-link" to="/">
          Home
        </Link>
      </div>
    </header>
  );
}

function Header() {
  const { isAuthenticated, logout, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const accountButtonRef = useRef<HTMLButtonElement | null>(null);

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

  useEffect(() => {
    if (!isAccountMenuOpen) {
      return undefined;
    }

    function onDocumentPointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !accountMenuRef.current?.contains(event.target)
      ) {
        setIsAccountMenuOpen(false);
      }
    }

    function onDocumentKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsAccountMenuOpen(false);
        accountButtonRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", onDocumentPointerDown);
    document.addEventListener("keydown", onDocumentKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onDocumentPointerDown);
      document.removeEventListener("keydown", onDocumentKeyDown);
    };
  }, [isAccountMenuOpen]);

  const links = isAuthenticated
    ? [
        { to: "/dashboard", label: "Dashboard" },
        ...(user?.role === "admin" ? [{ to: "/admin", label: "Admin" }] : [])
      ]
    : [
        { to: "/", label: "Home" },
        { to: "/anonymous-surveys", label: "Anonymous assessments" },
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
        <p className="eyebrow">Assessment Portal</p>
        <span className="brand-title">Assessment workspace</span>
      </Link>
      <div className="header-actions">
        <ThemeToggle />
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
      </div>
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
          <div
            className={isAccountMenuOpen ? "account-menu open" : "account-menu"}
            ref={accountMenuRef}
          >
            <button
              aria-controls="account-disclosure-panel"
              aria-expanded={isAccountMenuOpen}
              className={isAccountActive ? "nav-link nav-button active" : "nav-link nav-button"}
              id="account-disclosure-button"
              onClick={() => setIsAccountMenuOpen((open) => !open)}
              ref={accountButtonRef}
              type="button"
            >
              Account
            </button>
            <div
              aria-labelledby="account-disclosure-button"
              className="account-menu-panel"
              id="account-disclosure-panel"
            >
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
                to="/settings"
              >
                Settings
              </NavLink>
              <button
                className="account-menu-item account-menu-button"
                onClick={handleLogout}
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
