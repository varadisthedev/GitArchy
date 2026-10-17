"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { COLD_START_TIMEOUT_MS, api, setAuthToken, setUnauthorizedHandler } from "@/lib/api/client";
import { qk } from "@/lib/api/queries";
import type { TokenResponse, User } from "@/lib/api/types";

// Backend contract: 30-minute bearer JWT, no refresh tokens, logout revokes the jti server-side.
// The token is kept in memory and sessionStorage (one tab, gone when the tab closes), never in localStorage or cookies.
const KEY = "gitarchy.session.v1";

type Stored = { token: string; exp: number; user: User };
type Status = "loading" | "anon" | "authed";
type Ctx = {
  status: Status;
  user: User | null;
  token: string | null;
  expiresAt: number | null;
  /** true once this tab ended the session itself (logout/expiry); it then owns the redirect */
  ended: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
};

const SessionContext = createContext<Ctx | null>(null);

function read(): Stored | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Stored;
    return s.exp > Date.now() + 5_000 ? s : null;
  } catch {
    return null;
  }
}
function write(s: Stored | null) {
  try {
    if (s) sessionStorage.setItem(KEY, JSON.stringify(s));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* private mode: session lives in memory only */
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Stored | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [ended, setEnded] = useState(false);
  const qc = useQueryClient();
  const router = useRouter();

  const end = useCallback(
    (reason: "logout" | "expired") => {
      setAuthToken(null);
      write(null);
      setEnded(true);
      setSession(null);
      setStatus("anon");
      qc.clear();
      if (reason === "expired") {
        const next = window.location.pathname + window.location.search;
        router.replace(`/login?expired=1&next=${encodeURIComponent(next)}`);
      } else router.replace("/login?signed_out=1");
    },
    [qc, router],
  );

  // restore once on mount (sessionStorage is browser-only)
  useEffect(() => {
    const s = read();
    if (s) {
      setAuthToken(s.token);
      qc.setQueryData(qk.me, s.user);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrating from browser storage
    setSession(s);
    setStatus(s ? "authed" : "anon");
  }, [qc]);

  // any 401 on a request that carried our token = revoked or expired
  useEffect(() => {
    setUnauthorizedHandler(() => end("expired"));
    return () => setUnauthorizedHandler(null);
  }, [end]);

  // proactive expiry: no refresh endpoint exists, so the session simply ends on time
  useEffect(() => {
    if (!session) return;
    const t = window.setTimeout(() => end("expired"), Math.max(0, session.exp - Date.now()));
    return () => window.clearTimeout(t);
  }, [session, end]);

  const login = useCallback(
    async (email: string, password: string) => {
      // login is often the first real request, so it may be the one paying the backend's cold start
      const r = await api<TokenResponse>("/auth/login", { body: { email, password }, timeoutMs: COLD_START_TIMEOUT_MS });
      const s: Stored = { token: r.access_token, exp: Date.now() + r.expires_in * 1000, user: r.user };
      setAuthToken(s.token);
      write(s);
      qc.setQueryData(qk.me, r.user);
      setEnded(false);
      setSession(s);
      setStatus("authed");
      return r.user;
    },
    [qc],
  );

  const logout = useCallback(async () => {
    try {
      await api<void>("/auth/logout", { method: "POST" }); // revokes the jti server-side
    } catch {
      /* already expired or offline: still clear locally */
    }
    end("logout");
  }, [end]);

  const value = useMemo<Ctx>(
    () => ({
      status,
      user: session?.user ?? null,
      token: session?.token ?? null,
      expiresAt: session?.exp ?? null,
      ended,
      login,
      logout,
    }),
    [status, session, ended, login, logout],
  );

  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession() {
  const ctx = use(SessionContext);
  if (!ctx) throw new Error("useSession outside SessionProvider");
  return ctx;
}
