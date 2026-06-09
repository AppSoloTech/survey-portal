import type { AuthUser } from "@survey-portal/shared";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";

import {
  fetchCurrentUser,
  loginUser,
  logoutUser,
  registerUser
} from "../api/auth.js";

const storageKey = "survey_portal_auth_token";

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (input: { email: string; password: string }) => Promise<void>;
  register: (input: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(storageKey));
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(token));

  const storeSession = useCallback((nextToken: string, nextUser: AuthUser) => {
    localStorage.setItem(storageKey, nextToken);
    setToken(nextToken);
    setUser(nextUser);
  }, []);

  const clearSession = useCallback(() => {
    localStorage.removeItem(storageKey);
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    let isActive = true;

    if (!token) {
      setIsLoading(false);
      return () => {
        isActive = false;
      };
    }

    setIsLoading(true);

    fetchCurrentUser(token)
      .then((response) => {
        if (isActive) {
          setUser(response.user);
        }
      })
      .catch(() => {
        if (isActive) {
          clearSession();
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [clearSession, token]);

  const login = useCallback(
    async (input: { email: string; password: string }) => {
      const response = await loginUser(input);
      storeSession(response.token, response.user);
    },
    [storeSession]
  );

  const register = useCallback(
    async (input: {
      firstName: string;
      lastName: string;
      email: string;
      password: string;
    }) => {
      const response = await registerUser(input);
      storeSession(response.token, response.user);
    },
    [storeSession]
  );

  const logout = useCallback(async () => {
    if (token) {
      try {
        await logoutUser(token);
      } catch {
        // Local token removal is the source of truth for bearer-token logout.
      }
    }

    clearSession();
  }, [clearSession, token]);

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(user && token),
      isLoading,
      login,
      register,
      logout
    }),
    [isLoading, login, logout, register, token, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
