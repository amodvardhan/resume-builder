import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AuthUser } from "../types/api";
import {
  authLogin,
  authMe,
  authRefresh,
  authRegister,
  AUTH_FORCE_LOGOUT_EVENT,
} from "../api/client";

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    fullName: string,
    email: string,
    password: string,
  ) => Promise<void>;
  logout: () => void;
  refreshToken: () => Promise<string>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const mountedRef = useRef(true);

  // Derive `isAuthenticated` from user presence so there is a single source
  // of truth — no risk of user/flag going out of sync.
  const isAuthenticated = user !== null;

  // ── Bootstrap: validate stored token on mount ──────────────────────────
  useEffect(() => {
    mountedRef.current = true;

    async function bootstrap() {
      const token = localStorage.getItem("access_token");
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const me = await authMe();
        if (mountedRef.current) setUser(me);
      } catch {
        // The response interceptor already attempted a token refresh on 401.
        // If we land here the refresh also failed, so clear everything.
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        if (mountedRef.current) setUser(null);
      } finally {
        if (mountedRef.current) setIsLoading(false);
      }
    }

    bootstrap();

    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ── Listen for forced logouts from the Axios interceptor ───────────────
  useEffect(() => {
    const handler = () => {
      setUser(null);
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
    };
    window.addEventListener(AUTH_FORCE_LOGOUT_EVENT, handler);
    return () => window.removeEventListener(AUTH_FORCE_LOGOUT_EVENT, handler);
  }, []);

  // ── login ──────────────────────────────────────────────────────────────
  const login = useCallback(async (email: string, password: string) => {
    const res = await authLogin({ email, password });
    localStorage.setItem("access_token", res.access_token);
    localStorage.setItem("refresh_token", res.refresh_token);
    setUser(res.user);
  }, []);

  // ── register (then auto-login) ────────────────────────────────────────
  const register = useCallback(
    async (fullName: string, email: string, password: string) => {
      await authRegister({ full_name: fullName, email, password });
      // Auto-login after successful registration
      const res = await authLogin({ email, password });
      localStorage.setItem("access_token", res.access_token);
      localStorage.setItem("refresh_token", res.refresh_token);
      setUser(res.user);
    },
    [],
  );

  // ── logout ─────────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    setUser(null);
  }, []);

  // ── refreshToken ───────────────────────────────────────────────────────
  const refreshTokenFn = useCallback(async (): Promise<string> => {
    const stored = localStorage.getItem("refresh_token");
    if (!stored) throw new Error("No refresh token available");
    const res = await authRefresh({ refresh_token: stored });
    localStorage.setItem("access_token", res.access_token);
    return res.access_token;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated,
      isLoading,
      login,
      register,
      logout,
      refreshToken: refreshTokenFn,
    }),
    [user, isAuthenticated, isLoading, login, register, logout, refreshTokenFn],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an <AuthProvider>");
  }
  return ctx;
}
