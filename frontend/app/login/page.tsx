"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Zap, Eye, EyeOff, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { TelegramLoginButton } from "@/app/components/TelegramLoginButton";

// ─── Login page ───────────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn(email, password);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
      setLoading(false);
    }
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
          {process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME && (
            <div className="flex justify-center mb-3">
              <TelegramLoginButton />
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
    </div>
  );
}
