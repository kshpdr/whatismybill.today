"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Zap, Eye, EyeOff, ArrowRight, ArrowDownRight } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

// ─── Mini dashboard preview (shown on the left panel) ────────────────────────

function DashboardPreview() {
  return (
    <div className="bg-white/6 border border-white/10 rounded-2xl p-5 backdrop-blur-sm">
      <p className="text-[11px] font-bold text-white/40 uppercase tracking-widest mb-3">
        March 2026 · 123 Maple St
      </p>

      {/* Hero number */}
      <div className="flex items-end justify-between mb-4">
        <div>
          <p className="text-3xl font-bold text-white tabular-nums">$269.10</p>
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className="flex items-center gap-0.5 text-xs font-bold text-emerald-400 bg-emerald-400/15 px-2 py-0.5 rounded-full">
              <ArrowDownRight className="w-3 h-3" />7.4%
            </span>
            <span className="text-xs text-white/40">vs February</span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-white/40 uppercase tracking-wide">saved</p>
          <p className="text-lg font-bold text-emerald-400">$22</p>
        </div>
      </div>

      {/* Proportion bar */}
      <div className="flex h-2.5 rounded-full overflow-hidden gap-px mb-2.5">
        <div className="bg-amber-400" style={{ width: "59.5%" }} />
        <div className="bg-blue-400" style={{ width: "26.2%" }} />
        <div className="bg-cyan-400 flex-1" />
      </div>
      <div className="flex text-[11px] gap-4">
        <span className="font-semibold text-amber-400">⚡ $160</span>
        <span className="font-semibold text-blue-400">🔥 $71</span>
        <span className="font-semibold text-cyan-400">💧 $38</span>
      </div>

      {/* Mini insight */}
      <div className="mt-4 flex items-center gap-2 bg-emerald-400/10 border border-emerald-400/20 rounded-xl px-3 py-2">
        <span className="text-sm">🌱</span>
        <p className="text-xs text-emerald-300 font-medium">
          Gas down 10% — spring heating season ending
        </p>
      </div>
    </div>
  );
}

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
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh flex bg-white">

      {/* ── LEFT PANEL (desktop only) ── */}
      <div className="hidden md:flex flex-col w-[480px] shrink-0 bg-slate-900 relative overflow-hidden p-12">
        {/* ambient blobs */}
        <div className="absolute -top-32 -right-32 w-80 h-80 bg-amber-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

        {/* brand */}
        <div className="flex items-center gap-2.5 relative z-10">
          <div className="w-8 h-8 bg-amber-500 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/30">
            <Zap className="w-4 h-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="font-semibold text-white">whatismybill.today</span>
        </div>

        {/* hero copy */}
        <div className="relative z-10 mt-auto mb-8">
          <h1 className="text-4xl font-bold text-white leading-[1.15] mb-4">
            Finally understand<br />what you&rsquo;re<br />paying for.
          </h1>
          <p className="text-slate-400 text-base leading-relaxed">
            Upload your utility bills. Get clean data, trends, and insights — no spreadsheets needed.
          </p>
        </div>

        {/* mini product preview */}
        <div className="relative z-10">
          <DashboardPreview />
        </div>
      </div>

      {/* ── RIGHT PANEL (form) ── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-[#F8FAFC]">
        <div className="w-full max-w-sm">

          {/* mobile logo */}
          <div className="md:hidden flex items-center justify-center gap-2.5 mb-10">
            <div className="w-8 h-8 bg-amber-500 rounded-xl flex items-center justify-center shadow-md">
              <Zap className="w-4 h-4 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-bold text-slate-800 text-lg">whatismybill.today</span>
          </div>

          <h2 className="text-2xl font-bold text-slate-900 mb-1">Welcome back</h2>
          <p className="text-slate-500 text-sm mb-8">Sign in to your account to continue</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* email */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                autoComplete="email"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 outline-none text-sm text-slate-900 placeholder:text-slate-400 transition-all"
              />
            </div>

            {/* password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-semibold text-slate-700">Password</label>
                <Link
                  href="/reset-password"
                  className="text-xs text-amber-600 hover:text-amber-700 font-medium transition-colors"
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
                  className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-slate-300 bg-white focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 outline-none text-sm text-slate-900 placeholder:text-slate-400 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* error */}
            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-100 px-4 py-3 rounded-xl">
                {error}
              </div>
            )}

            {/* submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 disabled:cursor-not-allowed text-white py-2.5 rounded-xl font-semibold text-sm transition-colors shadow-sm shadow-amber-500/30"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Signing in…
                </span>
              ) : (
                <>Sign in <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>

          {/* divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-xs text-slate-400">or</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          {/* demo shortcut — /demo redirects to /?demo=1 */}
          <Link
            href="/demo"
            className="w-full flex items-center justify-center gap-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 py-2.5 rounded-xl font-medium text-sm transition-colors"
          >
            View demo dashboard
          </Link>

          <p className="text-center text-sm text-slate-500 mt-6">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-amber-600 font-semibold hover:text-amber-700 transition-colors">
              Sign up free
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
