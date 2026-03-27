"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { subscribeSessionInvalid } from "@/lib/sessionEvents";

type AuthContextValue = {
  /** ERPNext username, or "Guest" when not logged in. */
  user: string | null;
  loading: boolean;
  refreshSession: () => Promise<void>;
  login: (usr: string, pwd: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function parseLoggedUserMessage(data: unknown): string {
  if (!data || typeof data !== "object") return "Guest";
  const msg = (data as { message?: unknown }).message;
  if (typeof msg === "string" && msg.length > 0) return msg;
  return "Guest";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    try {
      const res = await api.get("/api/method/frappe.auth.get_logged_user");
      setUser(parseLoggedUserMessage(res.data));
    } catch {
      setUser("Guest");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    const onFocus = () => {
      void refreshSession();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshSession]);

  const redirectHomeIfGuest = useCallback(() => {
    router.replace("/#dashboard-login");
  }, [router]);

  useEffect(() => {
    return subscribeSessionInvalid(() => {
      setUser("Guest");
      redirectHomeIfGuest();
    });
  }, [redirectHomeIfGuest]);

  const login = useCallback(async (usr: string, pwd: string) => {
    await api.post("/api/method/login", { usr: usr.trim(), pwd });
    await refreshSession();
  }, [refreshSession]);

  const logout = useCallback(async () => {
    try {
      await api.post("/api/method/logout");
    } catch {
      try {
        await api.get("/api/method/logout");
      } catch {
        /* ignore */
      }
    }
    setUser("Guest");
    router.replace("/#dashboard-login");
  }, [router]);

  useEffect(() => {
    if (loading) return;
    if (user && user !== "Guest") return;
    if (pathname === "/") return;
    router.replace("/#dashboard-login");
  }, [loading, user, pathname, router]);

  const value = useMemo(
    () => ({
      user,
      loading,
      refreshSession,
      login,
      logout
    }),
    [user, loading, refreshSession, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
