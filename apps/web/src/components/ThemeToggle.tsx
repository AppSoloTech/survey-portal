import { useEffect, useState } from "react";

type Theme = "light" | "dark";

const storageKey = "survey-portal-theme";

// index.html sets data-theme before first paint; this reads whatever it
// decided so the toggle starts in sync without re-deriving the preference.
function getActiveTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getActiveTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);

    try {
      localStorage.setItem(storageKey, theme);
    } catch {
      // Storage can be unavailable (private mode); the toggle still works
      // for the current page view.
    }
  }, [theme]);

  const isDark = theme === "dark";

  return (
    <button
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={isDark}
      className="nav-link nav-button theme-toggle"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      type="button"
    >
      <span aria-hidden="true">{isDark ? "☀︎" : "☾"}</span>
      <span className="theme-toggle-text">{isDark ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}
