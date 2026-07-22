import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  clearAuthSession,
  getStoredToken,
  getStoredUser,
  setAuthSession,
  setTokenGetter,
} from "./authToken";

export type SessionUser = {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  /** True while the client holds a pwdChange JWT after forced reset. */
  requiresPasswordChange?: boolean;
  mustChangePassword?: boolean;
  /** Set after profile update when the API includes them. */
  notifyEmailTriage?: boolean;
  notifyEmailDigest?: boolean;
};

export type LoginResult =
  | { type: "full" }
  | { type: "passwordChange" };

type AuthState = {
  token: string | null;
  user: SessionUser | null;
  ready: boolean;
  /** True when the current session may only complete a forced password change. */
  requiresPasswordChange: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => void;
  /** Persist new JWT + user after profile email/display name changes. */
  applyAuthRefresh: (token: string, user: SessionUser) => void;
};

const AuthContext = createContext<AuthState | null>(null);

const apiBase =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = getStoredToken();
    const u = getStoredUser<SessionUser>();
    if (t && u) {
      setToken(t);
      setUser(u);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    setTokenGetter(() => token);
    return () => setTokenGetter(null);
  }, [token]);

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    const res = await fetch(`${apiBase}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.toLowerCase().trim(), password }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      token?: string;
      user?: SessionUser;
      requiresPasswordChange?: boolean;
      error?: string;
    };
    if (!res.ok) {
      throw new Error(data.error ?? "login_failed");
    }
    if (!data.token || !data.user) {
      throw new Error("invalid_response");
    }
    const requiresPasswordChange = data.requiresPasswordChange === true;
    const sessionUser: SessionUser = {
      ...data.user,
      requiresPasswordChange,
      mustChangePassword: data.user.mustChangePassword ?? requiresPasswordChange,
    };
    setAuthSession(data.token, sessionUser);
    setToken(data.token);
    setUser(sessionUser);
    return requiresPasswordChange
      ? { type: "passwordChange" }
      : { type: "full" };
  }, []);

  const logout = useCallback(() => {
    clearAuthSession();
    setToken(null);
    setUser(null);
  }, []);

  const applyAuthRefresh = useCallback((newToken: string, newUser: SessionUser) => {
    setAuthSession(newToken, newUser);
    setToken(newToken);
    setUser(newUser);
  }, []);

  const requiresPasswordChange = Boolean(user?.requiresPasswordChange);

  const value = useMemo(
    () => ({
      token,
      user,
      ready,
      requiresPasswordChange,
      login,
      logout,
      applyAuthRefresh,
    }),
    [token, user, ready, requiresPasswordChange, login, logout, applyAuthRefresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function useOptionalAuth(): AuthState | null {
  return useContext(AuthContext);
}
