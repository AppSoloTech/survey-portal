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

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (input: { email: string; password: string }) => Promise<void>;
  register: (input: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  }) => Promise<void>;
  updateSessionUser: (nextUser: AuthUser) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const storeSession = useCallback((nextUser: AuthUser) => {
    setUser(nextUser);
  }, []);

  const clearSession = useCallback(() => {
    setUser(null);
  }, []);

  useEffect(() => {
    let isActive = true;

    setIsLoading(true);

    fetchCurrentUser()
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
  }, [clearSession]);

  const login = useCallback(
    async (input: { email: string; password: string }) => {
      const response = await loginUser(input);
      storeSession(response.user);
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
      storeSession(response.user);
    },
    [storeSession]
  );

  const logout = useCallback(async () => {
    try {
      await logoutUser();
    } catch {
      // Clearing client state keeps the UI usable if the session is already gone.
    }

    clearSession();
  }, [clearSession]);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isLoading,
      login,
      register,
      updateSessionUser: storeSession,
      logout
    }),
    [isLoading, login, logout, register, storeSession, user]
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
