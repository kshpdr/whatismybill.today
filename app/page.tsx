"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Zap, Sun, Moon } from "lucide-react";
import CoverageMapClient from "@/app/components/CoverageMapClient";
import { useAuth } from "@/lib/auth-context";

export default function LandingPage() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { user, loading } = useAuth();

  return (
    <main className="min-h-screen bg-[var(--wm-bg)] text-[var(--wm-t1)]">
      <div className="max-w-4xl mx-auto px-6 py-16 space-y-16">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-[#e8a838] rounded-md flex items-center justify-center">
              <Zap className="w-4 h-4 text-black" strokeWidth={2.5} />
            </div>
            <span className="font-mono text-[var(--wm-t1)] font-semibold tracking-tight">whatismybill.today</span>
          </div>
          {mounted && (
            <button
              onClick={() => setTheme(resolvedTheme === "light" ? "dark" : "light")}
              className="p-2 rounded-md text-[var(--wm-t3)] hover:text-[var(--wm-t2)] hover:bg-[var(--wm-hover)] transition-colors"
            >
              {resolvedTheme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          )}
        </div>

        {/* Hero */}
        <section className="space-y-4">
          <h1 className="text-2xl font-semibold tracking-tight">
            Know exactly what you&apos;re paying for
          </h1>
          <p className="text-[var(--wm-t2)] text-sm max-w-lg">
            Upload your utility bills. We parse them automatically and show you
            exactly what you&apos;re paying for — broken down by charge,
            compared month over month.
          </p>
          <div className="flex gap-2 pt-2 min-h-[36px]">
            {!loading && (user ? (
              <a
                href="/dashboard"
                className="bg-[#e8a838] hover:bg-[#d4993a] text-black font-semibold text-sm rounded-md px-4 py-2 transition-colors"
              >
                Go to dashboard
              </a>
            ) : (
              <>
                <a
                  href="/signup"
                  className="bg-[#e8a838] hover:bg-[#d4993a] text-black font-semibold text-sm rounded-md px-4 py-2 transition-colors"
                >
                  Get started
                </a>
                <a
                  href="/demo"
                  className="border border-[var(--wm-border)] hover:bg-[var(--wm-hover)] text-[var(--wm-t2)] text-sm rounded-md px-4 py-2 transition-colors"
                >
                  View demo
                </a>
                <a
                  href="/login"
                  className="text-[var(--wm-t3)] hover:text-[var(--wm-t2)] text-sm px-4 py-2 transition-colors"
                >
                  Sign in
                </a>
              </>
            ))}
          </div>
        </section>

        {/* Coverage Map */}
        <section className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--wm-t3)] mb-1">
              Coverage
            </p>
            <h2 className="text-base font-semibold text-[var(--wm-t1)]">
              Supported regions
            </h2>
            <p className="text-sm text-[var(--wm-t2)] mt-1">
              Automatic parsing is available where we have a provider-specific
              parser. More regions ship as we add parsers.
            </p>
          </div>

          <CoverageMapClient />

          <div className="bg-[var(--wm-card)] border border-[var(--wm-border)] rounded-md p-4 space-y-2">
            <p className="text-xs text-[var(--wm-t3)]">
              Verified regions are counties I&apos;ve personally tested end-to-end.
              &ldquo;Might work&rdquo; regions share the same provider — the parser should handle them,
              but I haven&apos;t confirmed it myself. Give it a try and let me know how it goes.
            </p>
            <p className="text-xs text-[var(--wm-t3)]">
              Don&apos;t see your provider?{" "}
              <a href="mailto:hello@whatismybill.today" className="text-[#e8a838] hover:underline">
                Request coverage
              </a>{" "}
              — manual entry is always available regardless of location.
            </p>
          </div>
        </section>

      </div>
    </main>
  );
}
