"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Zap, Eye, EyeOff, ArrowRight, Check } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

// ─── Password strength indicator ─────────────────────────────────────────────

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: "At least 8 characters", pass: password.length >= 8 },
    { label: "Contains a number", pass: /\d/.test(password) },
    { label: "Contains a letter", pass: /[a-zA-Z]/.test(password) },
  ];
  const score = checks.filter((c) => c.pass).length;
  const color = score === 0 ? "bg-slate-200" : score === 1 ? "bg-red-400" : score === 2 ? "bg-amber-400" : "bg-emerald-400";

  if (!password) return null;

  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i < score ? color : "bg-slate-200"}`} />
        ))}
      </div>
      <ul className="space-y-1">
        {checks.map((c) => (
          <li key={c.label} className={`flex items-center gap-1.5 text-xs transition-colors ${c.pass ? "text-emerald-600" : "text-slate-400"}`}>
            <Check className={`w-3 h-3 transition-opacity ${c.pass ? "opacity-100" : "opacity-30"}`} />
            {c.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Sign-up page ─────────────────────────────────────────────────────────────

export default function SignupPage() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await signUp(name, email, password);
      router.push("/onboarding");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh flex bg-white">

      {/* ── LEFT PANEL ── */}
      <div className="hidden md:flex flex-col w-[480px] shrink-0 bg-slate-900 relative overflow-hidden p-12">
        <div className="absolute -top-32 -right-32 w-80 h-80 bg-amber-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* brand */}
        <div className="flex items-center gap-2.5 relative z-10">
          <div className="w-8 h-8 bg-amber-500 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/30">
            <Zap className="w-4 h-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="font-semibold text-white">whatismybill.today</span>
        </div>

        {/* what you get */}
        <div className="relative z-10 mt-auto mb-auto">
          <h1 className="text-3xl font-bold text-white leading-tight mb-6">
            Know your bills<br />inside and out.
          </h1>

          <ul className="space-y-4">
            {[
              { icon: "⚡", title: "Track electricity, gas & water", body: "All three utilities in one place, one clean view." },
              { icon: "📊", title: "Spot trends instantly", body: "See if you're spending more than last month and exactly why." },
              { icon: "💡", title: "Understand every charge", body: "Energy, delivery, programs, taxes — broken down per bill." },
              { icon: "🏠", title: "Multiple households", body: "Manage your home, rental, or family properties together." },
            ].map((item) => (
              <li key={item.title} className="flex gap-3">
                <span className="text-xl mt-0.5 shrink-0">{item.icon}</span>
                <div>
                  <p className="text-sm font-semibold text-white">{item.title}</p>
                  <p className="text-sm text-slate-400 mt-0.5">{item.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* free badge */}
        <div className="relative z-10 flex items-center gap-2 mt-8">
          <div className="w-5 h-5 bg-emerald-400 rounded-full flex items-center justify-center shrink-0">
            <Check className="w-3 h-3 text-white" />
          </div>
          <p className="text-sm text-slate-300">Free during early access</p>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-[#F8FAFC]">
        <div className="w-full max-w-sm">

          {/* mobile logo */}
          <div className="md:hidden flex items-center justify-center gap-2.5 mb-10">
            <div className="w-8 h-8 bg-amber-500 rounded-xl flex items-center justify-center shadow-md">
              <Zap className="w-4 h-4 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-bold text-slate-800 text-lg">whatismybill.today</span>
          </div>

          <h2 className="text-2xl font-bold text-slate-900 mb-1">Create your account</h2>
          <p className="text-slate-500 text-sm mb-8">
            Free during early access. No credit card needed.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* name */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Full name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Jane Smith"
                autoComplete="name"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 outline-none text-sm text-slate-900 placeholder:text-slate-400 transition-all"
              />
            </div>

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
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Create a password"
                  autoComplete="new-password"
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
              <PasswordStrength password={password} />
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
              className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 disabled:cursor-not-allowed text-white py-2.5 rounded-xl font-semibold text-sm transition-colors shadow-sm shadow-amber-500/30 mt-2"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Creating account…
                </span>
              ) : (
                <>Create account <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>

          <p className="text-center text-xs text-slate-400 mt-4 leading-relaxed">
            By creating an account you agree to our{" "}
            <span className="text-slate-500 underline cursor-pointer">Terms of Service</span> and{" "}
            <span className="text-slate-500 underline cursor-pointer">Privacy Policy</span>.
          </p>

          <p className="text-center text-sm text-slate-500 mt-5">
            Already have an account?{" "}
            <Link href="/login" className="text-amber-600 font-semibold hover:text-amber-700 transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
