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
  const color = score === 0 ? "bg-[rgba(255,255,255,0.07)]" : score === 1 ? "bg-[#f87171]" : score === 2 ? "bg-[#e8a838]" : "bg-[#4ade80]";

  if (!password) return null;

  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i < score ? color : "bg-[rgba(255,255,255,0.07)]"}`} />
        ))}
      </div>
      <ul className="space-y-1">
        {checks.map((c) => (
          <li key={c.label} className={`flex items-center gap-1.5 text-xs transition-colors ${c.pass ? "text-[var(--wm-green-text)]" : "text-[var(--wm-t3)]"}`}>
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
    <div className="min-h-dvh flex items-center justify-center bg-[var(--wm-bg)] px-6 py-12">
      <div className="w-full max-w-sm">

        {/* brand mark */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <Zap className="w-4 h-4 text-[#e8a838]" strokeWidth={2.5} />
          <span className="text-sm font-mono text-[var(--wm-t2)]">whatismybill.today</span>
        </div>

        {/* card */}
        <div className="bg-[var(--wm-surface)] border border-[var(--wm-border)] rounded-md p-6">
          <h2 className="text-base font-semibold text-[var(--wm-t1)] mb-1">Create your account</h2>
          <p className="text-sm text-[var(--wm-t3)] mb-6">
            Free during early access. No credit card needed.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* name */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--wm-t3)] mb-1.5">
                Full name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Jane Smith"
                autoComplete="name"
                className="w-full bg-[var(--wm-bg)] border border-[var(--wm-border)] rounded-md px-3 py-2 text-sm text-[var(--wm-t1)] placeholder:text-[var(--wm-t3)] focus:border-[#e8a838] focus:outline-none transition-colors"
              />
            </div>

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
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--wm-t3)] mb-1.5">
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
              <PasswordStrength password={password} />
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
              className="w-full flex items-center justify-center gap-2 bg-[#e8a838] hover:bg-[#d4993a] disabled:opacity-60 disabled:cursor-not-allowed text-black py-2 rounded-md font-semibold text-sm transition-colors mt-2"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-[rgba(255,255,255,0.20)] border-t-white rounded-full animate-spin" />
                  Creating account…
                </span>
              ) : (
                <>Create account <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>

          <p className="text-center text-xs text-[var(--wm-t4)] mt-4 leading-relaxed">
            By creating an account you agree to our{" "}
            <span className="text-[var(--wm-t3)] underline cursor-pointer">Terms of Service</span> and{" "}
            <span className="text-[var(--wm-t3)] underline cursor-pointer">Privacy Policy</span>.
          </p>
        </div>

        <p className="text-center text-sm text-[var(--wm-t3)] mt-5">
          Already have an account?{" "}
          <Link href="/login" className="text-[#e8a838] hover:text-[#d4993a] font-semibold transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
