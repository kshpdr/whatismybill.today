"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Zap, Eye, EyeOff, ArrowRight, Send } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { TelegramLoginButton, isTelegramConfigured } from "@/app/components/TelegramLoginButton";
import type { TelegramAuthPayload } from "@/lib/types";

const PENDING_TG_KEY = "pending_tg_link";

// ─── Login page ───────────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter();
  const { signIn, signInWithTelegram, registerWithTelegram, linkTelegram } = useAuth();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // Set when an unknown Telegram account logs in — drives the new/existing prompt.
  const [pendingTg, setPendingTg] = useState<TelegramAuthPayload | null>(null);
  // True after the user picks "I already have an account" — we auto-link on sign-in.
  const [linkMode, setLinkMode]   = useState(false);
  const [tgError, setTgError]     = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn(email, password);
      // If the user came here to link a Telegram account, attach it now.
      const stashed = sessionStorage.getItem(PENDING_TG_KEY);
      if (stashed) {
        sessionStorage.removeItem(PENDING_TG_KEY);
        try {
          await linkTelegram(JSON.parse(stashed) as TelegramAuthPayload);
        } catch {
          // Non-fatal: they're signed in; linking can be retried in Settings.
        }
      }
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
      setLoading(false);
    }
  }

  async function handleTelegramAuth(payload: TelegramAuthPayload) {
    setTgError(null);
    try {
      const result = await signInWithTelegram(payload);
      if (result === "ok") {
        router.push("/dashboard");
      } else {
        // Unknown Telegram account — ask whether they're new or existing.
        setPendingTg(payload);
      }
    } catch (err) {
      setTgError(err instanceof Error ? err.message : "Telegram sign in failed");
    }
  }

  async function handleCreateNew() {
    if (!pendingTg) return;
    setTgError(null);
    try {
      await registerWithTelegram(pendingTg);
      router.push("/dashboard");
    } catch (err) {
      setTgError(err instanceof Error ? err.message : "Could not create account");
    }
  }

  function handleHaveAccount() {
    if (!pendingTg) return;
    // Stash the signed payload; handleSubmit links it right after email sign-in.
    sessionStorage.setItem(PENDING_TG_KEY, JSON.stringify(pendingTg));
    setPendingTg(null);
    setLinkMode(true);
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-[var(--wm-bg)] px-6 py-12">
      <div className="w-full max-w-sm">

        {/* brand mark */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <Zap className="w-4 h-4 text-[#e8a838]" strokeWidth={2.5} />
          <span className="text-sm font-mono text-[var(--wm-t2)]">whatismybill.today <span className="text-[10px] text-[var(--wm-t3)]">{process.env.NEXT_PUBLIC_APP_VERSION || "dev"}</span></span>
        </div>

        {/* card */}
        <div className="bg-[var(--wm-surface)] border border-[var(--wm-border)] rounded-md p-6">
          <h2 className="text-base font-semibold text-[var(--wm-t1)] mb-1">Welcome back</h2>
          <p className="text-sm text-[var(--wm-t3)] mb-6">Sign in to your account to continue</p>

          {/* link-mode banner */}
          {linkMode && (
            <div className="flex items-start gap-2 bg-[#6892b0]/10 border border-[#6892b0]/30 text-[var(--wm-t2)] rounded-md px-3 py-2.5 text-xs mb-4">
              <Send className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#6892b0]" />
              <span>Sign in with your email and we&apos;ll connect your Telegram account automatically.</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* email */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--wm-t3)] mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                autoComplete="email"
                className="w-full bg-[var(--wm-bg)] border border-[var(--wm-border)] rounded-md px-3 py-2 text-sm text-[var(--wm-t1)] placeholder:text-[var(--wm-t3)] focus:border-[#e8a838] focus:outline-none transition-colors"
              />
            </div>

            {/* password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-[var(--wm-t3)]">Password</label>
                <Link
                  href="/reset-password"
                  className="text-xs text-[var(--wm-t3)] hover:text-[var(--wm-t2)] transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full bg-[var(--wm-bg)] border border-[var(--wm-border)] rounded-md px-3 py-2 pr-10 text-sm text-[var(--wm-t1)] placeholder:text-[var(--wm-t3)] focus:border-[#e8a838] focus:outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--wm-t3)] hover:text-[var(--wm-t2)] transition-colors"
                  tabIndex={-1}
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* error */}
            {error && (
              <div className="bg-[var(--wm-red-dim)] border border-[var(--wm-red-dim)] text-[var(--wm-red-text)] rounded-md px-4 py-3 text-sm">
                {error}
              </div>
            )}

            {/* submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-[#e8a838] hover:bg-[#d4993a] disabled:opacity-60 disabled:cursor-not-allowed text-black py-2 rounded-md font-semibold text-sm transition-colors"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-[rgba(255,255,255,0.20)] border-t-white rounded-full animate-spin" />
                  Signing in…
                </span>
              ) : (
                <>Sign in <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>

          {/* divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-[rgba(255,255,255,0.07)]" />
            <span className="text-xs text-[var(--wm-t4)]">or</span>
            <div className="flex-1 h-px bg-[rgba(255,255,255,0.07)]" />
          </div>

          {/* Telegram login — renders only when the bot is configured */}
          {isTelegramConfigured() && (
            <div className="flex flex-col items-center mb-3">
              <TelegramLoginButton onAuth={handleTelegramAuth} />
              {tgError && (
                <p className="text-xs text-[var(--wm-red-text)] mt-2 text-center">{tgError}</p>
              )}
            </div>
          )}

          {/* demo shortcut — /demo redirects to /?demo=1 */}
          <Link
            href="/demo"
            className="w-full flex items-center justify-center gap-2 border border-[var(--wm-border)] hover:bg-[var(--wm-hover)] text-[var(--wm-t2)] py-2 rounded-md text-sm transition-colors"
          >
            View demo dashboard
          </Link>
        </div>

        <p className="text-center text-sm text-[var(--wm-t3)] mt-5">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-[#e8a838] hover:text-[#d4993a] font-semibold transition-colors">
            Sign up free
          </Link>
        </p>
      </div>

      {/* New-or-existing prompt for an unknown Telegram account */}
      {pendingTg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6">
          <div className="w-full max-w-sm bg-[var(--wm-surface)] border border-[var(--wm-border)] rounded-md p-6">
            <div className="flex items-center gap-2 mb-2">
              <Send className="w-4 h-4 text-[#6892b0]" />
              <h3 className="text-base font-semibold text-[var(--wm-t1)]">New Telegram login</h3>
            </div>
            <p className="text-sm text-[var(--wm-t3)] mb-5">
              This Telegram account isn&apos;t linked yet. Do you already have a whatismybill.today account?
            </p>

            {tgError && (
              <div className="bg-[var(--wm-red-dim)] text-[var(--wm-red-text)] rounded-md px-3 py-2 text-sm mb-4">
                {tgError}
              </div>
            )}

            <div className="space-y-2.5">
              <button
                onClick={handleHaveAccount}
                className="w-full flex items-center justify-center gap-2 bg-[#e8a838] hover:bg-[#d4993a] text-black py-2 rounded-md font-semibold text-sm transition-colors"
              >
                Yes — sign in to link it
              </button>
              <button
                onClick={handleCreateNew}
                className="w-full flex items-center justify-center gap-2 border border-[var(--wm-border)] hover:bg-[var(--wm-hover)] text-[var(--wm-t2)] py-2 rounded-md text-sm transition-colors"
              >
                No — create a new account
              </button>
              <button
                onClick={() => { setPendingTg(null); setTgError(null); }}
                className="w-full text-center text-xs text-[var(--wm-t3)] hover:text-[var(--wm-t2)] py-1 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
