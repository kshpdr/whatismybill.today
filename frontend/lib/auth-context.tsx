"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { apiFetch, setToken, clearToken } from "./api/client";
import type { UserProfile, Household, TelegramAuthPayload } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuthContextValue {
  user:                 UserProfile | null;
  loading:              boolean;
  households:           Household[];
  currentHousehold:     Household | null;
  setCurrentHousehold:  (h: Household) => void;
  refreshHouseholds:    () => Promise<void>;
  signIn:               (email: string, password: string) => Promise<void>;
  signUp:               (name: string, email: string, password: string) => Promise<void>;
  // Returns "ok" when logged in, "unlinked" when this Telegram ID has no account yet.
  signInWithTelegram:   (payload: TelegramAuthPayload) => Promise<"ok" | "unlinked">;
  registerWithTelegram: (payload: TelegramAuthPayload) => Promise<void>;
  linkTelegram:         (payload: TelegramAuthPayload) => Promise<void>;
  unlinkTelegram:       () => Promise<void>;
  refreshUser:          () => Promise<void>;
  signOut:              () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user:                null,
  loading:             true,
  households:          [],
  currentHousehold:    null,
  setCurrentHousehold: () => {},
  refreshHouseholds:   async () => {},
  signIn:              async () => {},
  signUp:              async () => {},
  signInWithTelegram:  async () => "unlinked",
  registerWithTelegram: async () => {},
  linkTelegram:        async () => {},
  unlinkTelegram:      async () => {},
  refreshUser:         async () => {},
  signOut:             () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,             setUser]             = useState<UserProfile | null>(null);
  const [loading,          setLoading]          = useState(true);
  const [households,       setHouseholds]       = useState<Household[]>([]);
  const [currentHousehold, setCurrentHousehold] = useState<Household | null>(null);

  const loadHouseholds = useCallback(async () => {
    try {
      const hs = await apiFetch<Household[]>("/households");
      setHouseholds(hs);
      setCurrentHousehold((prev) => {
        if (prev) return hs.find((h) => h.id === prev.id) ?? hs[0] ?? null;
        return hs[0] ?? null;
      });
    } catch {
      setHouseholds([]);
    }
  }, []);

  const refreshHouseholds = useCallback(async () => {
    await loadHouseholds();
  }, [loadHouseholds]);

  // On mount — check if we have a stored token and validate it
  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
    if (!token) {
      setLoading(false);
      return;
    }
    apiFetch<UserProfile>("/auth/me")
      .then(async (u) => {
        setUser(u);
        await loadHouseholds();
      })
      .catch(() => {
        clearToken();
      })
      .finally(() => setLoading(false));
  }, [loadHouseholds]);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await apiFetch<{ token: string; user: UserProfile }>("/auth/signin", {
      method: "POST",
      body:   JSON.stringify({ email, password }),
    });
    setToken(res.token);
    setUser(res.user);
    await loadHouseholds();
  }, [loadHouseholds]);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const res = await apiFetch<{ token: string; user: UserProfile }>("/auth/signup", {
      method: "POST",
      body:   JSON.stringify({ name, email, password }),
    });
    setToken(res.token);
    setUser(res.user);
    // New user has no households yet — onboarding will create one
    setHouseholds([]);
    setCurrentHousehold(null);
  }, []);

  const signInWithTelegram = useCallback(async (payload: TelegramAuthPayload): Promise<"ok" | "unlinked"> => {
    const res = await apiFetch<
      { token: string; user: UserProfile } | { linked: false }
    >("/auth/telegram", {
      method: "POST",
      body:   JSON.stringify(payload),
    });
    if ("linked" in res && res.linked === false) return "unlinked";
    const ok = res as { token: string; user: UserProfile };
    setToken(ok.token);
    setUser(ok.user);
    await loadHouseholds();
    return "ok";
  }, [loadHouseholds]);

  const registerWithTelegram = useCallback(async (payload: TelegramAuthPayload) => {
    const res = await apiFetch<{ token: string; user: UserProfile }>("/auth/telegram", {
      method: "POST",
      body:   JSON.stringify({ ...payload, create: true }),
    });
    setToken(res.token);
    setUser(res.user);
    // New Telegram account has no households yet — onboarding will create one.
    setHouseholds([]);
    setCurrentHousehold(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const u = await apiFetch<UserProfile>("/auth/me");
    setUser(u);
  }, []);

  const linkTelegram = useCallback(async (payload: TelegramAuthPayload) => {
    await apiFetch("/auth/telegram/link", { method: "POST", body: JSON.stringify(payload) });
    await refreshUser();
  }, [refreshUser]);

  const unlinkTelegram = useCallback(async () => {
    await apiFetch("/auth/telegram/unlink", { method: "POST" });
    await refreshUser();
  }, [refreshUser]);

  const signOut = useCallback(() => {
    clearToken();
    setUser(null);
    setHouseholds([]);
    setCurrentHousehold(null);
  }, []);

  return (
    <AuthContext.Provider value={{
      user, loading, households, currentHousehold, setCurrentHousehold,
      refreshHouseholds, signIn, signUp, signInWithTelegram,
      registerWithTelegram, linkTelegram, unlinkTelegram, refreshUser, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
