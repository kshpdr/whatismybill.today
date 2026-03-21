"use client";

import { useState } from "react";
import Link from "next/link";
import { Zap, ArrowRight, Check, ArrowLeft } from "lucide-react";
import { apiFetch } from "@/lib/api/client";

export default function ResetPasswordPage() {
  const [email,   setEmail]   = useState("");
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiFetch("/auth/reset-password", {
        method: "POST",
        body:   JSON.stringify({ email }),
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh bg-[#F8FAFC] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-10">
          <div className="w-8 h-8 bg-amber-500 rounded-xl flex items-center justify-center shadow-md">
            <Zap className="w-4 h-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="font-bold text-slate-800 text-lg">whatismybill.today</span>
        </div>

        {sent ? (
          <div className="text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
              <Check className="w-7 h-7 text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Check your inbox</h2>
            <p className="text-slate-500 text-sm">
              If an account exists for <strong>{email}</strong>, a password reset
              link has been sent. Check your spam folder if you don&apos;t see it.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-sm font-semibold text-amber-600 hover:text-amber-700 transition-colors mt-4"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <h2 className="text-2xl font-bold text-slate-900 mb-1">Reset your password</h2>
            <p className="text-slate-500 text-sm mb-8">
              Enter the email address for your account and we&apos;ll send a reset link.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Email address
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

              {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-100 px-4 py-3 rounded-xl">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !email}
                className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 disabled:cursor-not-allowed text-white py-2.5 rounded-xl font-semibold text-sm transition-colors"
              >
                {loading ? (
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <>Send reset link <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </form>

            <p className="text-center text-sm text-slate-500 mt-6">
              Remember your password?{" "}
              <Link href="/login" className="text-amber-600 font-semibold hover:text-amber-700 transition-colors">
                Sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
