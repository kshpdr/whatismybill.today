"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Zap, Droplets, Flame, Copy, Check, ArrowRight, Home, Users, ChevronLeft, LogOut } from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import { useAuth } from "@/lib/auth-context";
import type { Household } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type Step =
  | "choice"
  | "create"
  | "join"
  | "success-create"
  | "success-join";

// ─── Progress dots ────────────────────────────────────────────────────────────

function ProgressDots({ step }: { step: Step }) {
  const stepIndex = {
    choice: 0,
    create: 1,
    join: 1,
    "success-create": 2,
    "success-join": 2,
  }[step];

  return (
    <div className="flex items-center gap-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={`rounded-full transition-all duration-300 ${
            i === stepIndex
              ? "w-6 h-2 bg-[#e8a838]"
              : i < stepIndex
              ? "w-2 h-2 bg-[#e8a838]"
              : "w-2 h-2 bg-[rgba(255,255,255,0.12)]"
          }`}
        />
      ))}
    </div>
  );
}

// ─── Invite code display (6 boxes) ───────────────────────────────────────────

function InviteCodeDisplay({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleShare() {
    if (navigator.share) {
      await navigator.share({
        title: "Join my home on whatismybill.today",
        text: `Use code ${code} to join my home and track utility bills together.`,
      });
    } else {
      handleCopy();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-2">
        {code.split("").map((char, i) => (
          <div
            key={i}
            className={`
              w-11 h-14 rounded-md border flex items-center justify-center
              text-lg font-mono
              ${i === 2 ? "mr-2" : ""}
              bg-[var(--wm-card)] border-[var(--wm-border)] text-[var(--wm-t1)]
            `}
          >
            {char}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={handleCopy}
          className="flex items-center gap-2 px-4 py-2 rounded-md border border-[var(--wm-border)] text-sm font-medium text-[var(--wm-t2)] hover:bg-[var(--wm-hover)] transition-colors"
        >
          {copied ? (
            <>
              <Check size={14} className="text-[var(--wm-green-text)]" />
              Copied!
            </>
          ) : (
            <>
              <Copy size={14} />
              Copy code
            </>
          )}
        </button>
        {typeof navigator !== "undefined" && "share" in navigator && (
          <button
            onClick={handleShare}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-[#e8a838] text-black text-sm font-semibold hover:bg-[#d4993a] transition-colors"
          >
            Share invite
          </button>
        )}
      </div>
    </div>
  );
}

// ─── OTP-style code input ─────────────────────────────────────────────────────

function CodeInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  function handleChange(index: number, char: string) {
    const sanitized = char.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(-1);
    const chars = value.padEnd(6, " ").split("");
    chars[index] = sanitized || " ";
    const next = chars.join("").trimEnd();
    onChange(next);
    if (sanitized && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace") {
      const chars = value.padEnd(6, " ").split("");
      if (chars[index].trim() === "" && index > 0) {
        inputRefs.current[index - 1]?.focus();
      } else {
        chars[index] = " ";
        onChange(chars.join("").trimEnd());
      }
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData("text")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 6);
    onChange(pasted);
    const nextEmpty = Math.min(pasted.length, 5);
    inputRefs.current[nextEmpty]?.focus();
  }

  const chars = value.padEnd(6, " ").split("");

  return (
    <div className="flex items-center justify-center gap-2">
      {chars.map((char, i) => (
        <input
          key={i}
          ref={(el) => { inputRefs.current[i] = el; }}
          type="text"
          inputMode="text"
          maxLength={1}
          value={char.trim()}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          className={`
            w-11 h-14 rounded-md border text-center font-mono text-lg
            transition-colors outline-none
            ${i === 2 ? "mr-2" : ""}
            bg-[var(--wm-bg)] border-[var(--wm-border)] text-[var(--wm-t1)]
            focus:border-[#e8a838]
          `}
        />
      ))}
    </div>
  );
}

// ─── Utility icon row ─────────────────────────────────────────────────────────

function UtilityIcons() {
  return (
    <div className="flex items-center justify-center gap-3 text-[var(--wm-t3)]">
      <div className="flex items-center gap-1.5">
        <Zap size={14} className="text-[#d4993a]" />
        <span className="text-xs">Electricity</span>
      </div>
      <span>·</span>
      <div className="flex items-center gap-1.5">
        <Flame size={14} className="text-[#6892b0]" />
        <span className="text-xs">Gas</span>
      </div>
      <span>·</span>
      <div className="flex items-center gap-1.5">
        <Droplets size={14} className="text-[#47998e]" />
        <span className="text-xs">Water</span>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const { user, refreshHouseholds, signOut } = useAuth();

  const [step, setStep] = useState<Step>("choice");
  const [nickname, setNickname] = useState("");
  const [address, setAddress] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stored after create/join for success screens
  const [createdCode, setCreatedCode] = useState("");
  const [joinedName, setJoinedName] = useState("");

  // Mock user name — falls back to Firebase display name
  const userName = user?.name?.split(" ")[0] ?? "there";

  // ─── Handlers ───────────────────────────────────────────────────────────────

  async function handleCreate() {
    if (!nickname.trim()) {
      setError("Please give your home a nickname.");
      return;
    }
    if (!user) {
      setError("You must be signed in.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const household = await apiFetch<Household>("/households", {
        method: "POST",
        body:   JSON.stringify({ nickname: nickname.trim(), address: address.trim() || undefined }),
      });
      await refreshHouseholds();
      setCreatedCode(household.inviteCode);
      setStep("success-create");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin() {
    const code = joinCode.trim().toUpperCase();
    if (code.length < 6) {
      setError("Please enter the full 6-character code.");
      return;
    }
    if (!user) {
      setError("You must be signed in.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const household = await apiFetch<Household>("/households/join", {
        method: "POST",
        body:   JSON.stringify({ inviteCode: code }),
      });
      await refreshHouseholds();
      setJoinedName(household.nickname);
      setStep("success-join");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function handleGoToDashboard() {
    router.push("/dashboard");
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[var(--wm-bg)] flex flex-col items-center justify-center px-4 py-12">
      {/* Logo */}
      <div className="mb-8 flex items-center gap-2">
        <Zap size={16} className="text-[#e8a838]" strokeWidth={2.5} />
        <span className="text-[var(--wm-t1)] font-mono text-sm tracking-tight">
          whatismybill.today
        </span>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-[var(--wm-surface)] border border-[var(--wm-border)] rounded-md p-6">
        {/* Progress */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2 h-8">
            {(step === "create" || step === "join") && (
              <button
                onClick={() => { setStep("choice"); setError(null); }}
                className="flex items-center gap-1 text-sm text-[var(--wm-t2)] hover:text-[var(--wm-t1)] transition-colors"
              >
                <ChevronLeft size={16} />
                Back
              </button>
            )}
          </div>
          <ProgressDots step={step} />
        </div>

        {/* ── STEP: CHOICE ── */}
        {step === "choice" && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold text-[var(--wm-t1)]">
                Welcome, {userName}!
              </h1>
              <p className="text-[var(--wm-t2)] mt-1 text-sm">
                Let&apos;s set up your first home to start tracking bills.
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => setStep("create")}
                className="w-full text-left p-4 rounded-md border border-[var(--wm-border)] hover:border-[rgba(255,255,255,0.15)] hover:bg-[var(--wm-hover)] bg-[var(--wm-card)] transition-colors group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-md bg-[var(--wm-hover)] flex items-center justify-center">
                    <Home size={18} className="text-[var(--wm-t2)]" />
                  </div>
                  <div>
                    <div className="font-semibold text-[var(--wm-t1)] text-sm">
                      Create a new home
                    </div>
                    <div className="text-xs text-[var(--wm-t2)] mt-0.5">
                      You&apos;ll be the owner — invite others with a code
                    </div>
                  </div>
                  <ArrowRight
                    size={16}
                    className="ml-auto text-[var(--wm-t3)] group-hover:text-[#e8a838] transition-colors"
                  />
                </div>
              </button>

              <button
                onClick={() => setStep("join")}
                className="w-full text-left p-4 rounded-md border border-[var(--wm-border)] hover:border-[rgba(255,255,255,0.15)] hover:bg-[var(--wm-hover)] bg-[var(--wm-card)] transition-colors group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-md bg-[var(--wm-hover)] flex items-center justify-center">
                    <Users size={18} className="text-[var(--wm-t2)]" />
                  </div>
                  <div>
                    <div className="font-semibold text-[var(--wm-t1)] text-sm">
                      Join an existing home
                    </div>
                    <div className="text-xs text-[var(--wm-t2)] mt-0.5">
                      Enter the 6-character code from your home&apos;s owner
                    </div>
                  </div>
                  <ArrowRight
                    size={16}
                    className="ml-auto text-[var(--wm-t3)] group-hover:text-[#e8a838] transition-colors"
                  />
                </div>
              </button>
            </div>

            <UtilityIcons />
          </div>
        )}

        {/* ── STEP: CREATE ── */}
        {step === "create" && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold text-[var(--wm-t1)]">
                Name your home
              </h1>
              <p className="text-[var(--wm-t2)] mt-1 text-sm">
                A nickname makes it easy to identify — especially if you have
                multiple properties.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--wm-t3)] mb-1.5">
                  Home nickname <span className="text-[var(--wm-red-text)]">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. The Maple House, Dad's Place, Oakland Rental"
                  value={nickname}
                  onChange={(e) => { setNickname(e.target.value); setError(null); }}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  className="w-full bg-[var(--wm-bg)] border border-[var(--wm-border)] rounded-md px-3 py-2 text-sm text-[var(--wm-t1)] placeholder:text-[var(--wm-t3)] focus:border-[#e8a838] focus:outline-none transition-colors"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--wm-t3)] mb-1.5">
                  Address{" "}
                  <span className="text-[var(--wm-t3)] normal-case font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="123 Maple St, Oakland CA"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  className="w-full bg-[var(--wm-bg)] border border-[var(--wm-border)] rounded-md px-3 py-2 text-sm text-[var(--wm-t1)] placeholder:text-[var(--wm-t3)] focus:border-[#e8a838] focus:outline-none transition-colors"
                />
              </div>

              {error && (
                <p className="text-[var(--wm-red-text)] text-xs mt-1">
                  {error}
                </p>
              )}

              <button
                onClick={handleCreate}
                disabled={loading || !nickname.trim()}
                className="w-full py-2 rounded-md bg-[#e8a838] text-black font-semibold text-sm hover:bg-[#d4993a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    Create home
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>

            <p className="text-center text-xs text-[var(--wm-t3)]">
              You&apos;ll be the owner. You can invite members after.
            </p>
          </div>
        )}

        {/* ── STEP: JOIN ── */}
        {step === "join" && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold text-[var(--wm-t1)]">
                Enter invite code
              </h1>
              <p className="text-[var(--wm-t2)] mt-1 text-sm">
                Ask your home&apos;s owner for the 6-character code. It looks
                like{" "}
                <span className="font-mono font-semibold text-[#e8a838]">
                  A7K3M2
                </span>
                .
              </p>
            </div>

            <div className="space-y-4">
              <CodeInput value={joinCode} onChange={(v) => { setJoinCode(v); setError(null); }} />

              {error && (
                <p className="text-[var(--wm-red-text)] text-xs mt-1 text-center">
                  {error}
                </p>
              )}

              <button
                onClick={handleJoin}
                disabled={loading || joinCode.trim().length < 6}
                className="w-full py-2 rounded-md bg-[#e8a838] text-black font-semibold text-sm hover:bg-[#d4993a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    Join home
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>

            <p className="text-center text-xs text-[var(--wm-t3)]">
              Don&apos;t have a code? Ask the home owner to share it from their
              settings.
            </p>
          </div>
        )}

        {/* ── STEP: SUCCESS (CREATE) ── */}
        {step === "success-create" && (
          <div className="space-y-6">
            <div className="text-center space-y-1">
              <div className="text-4xl mb-3 text-[var(--wm-green-text)]">&#10003;</div>
              <h1 className="text-2xl font-semibold text-[var(--wm-t1)]">
                {nickname || "Your home"} is ready!
              </h1>
              <p className="text-[var(--wm-t2)] text-sm">
                You&apos;re the owner. Share this code to invite household
                members.
              </p>
            </div>

            <div className="bg-[var(--wm-card)] border border-[var(--wm-border)] rounded-md p-5 space-y-4">
              <p className="text-center text-xs font-semibold uppercase tracking-wider text-[var(--wm-t3)]">
                Invite code
              </p>
              <InviteCodeDisplay code={createdCode} />
              <p className="text-center text-xs text-[var(--wm-t3)]">
                Anyone with this code can join your home. You can rotate it
                anytime in settings.
              </p>
            </div>

            <button
              onClick={handleGoToDashboard}
              className="w-full py-2 rounded-md bg-[#e8a838] text-black font-semibold text-sm hover:bg-[#d4993a] transition-colors flex items-center justify-center gap-2"
            >
              Go to dashboard
              <ArrowRight size={16} />
            </button>

            <p className="text-center text-xs text-[var(--wm-t3)]">
              You can share the code later from Settings → Members.
            </p>
          </div>
        )}

        {/* ── STEP: SUCCESS (JOIN) ── */}
        {step === "success-join" && (
          <div className="space-y-6">
            <div className="text-center space-y-1">
              <div className="text-4xl mb-3 text-[var(--wm-green-text)]">&#10003;</div>
              <h1 className="text-2xl font-semibold text-[var(--wm-t1)]">
                You joined
              </h1>
              <p className="text-xl font-semibold text-[#e8a838]">
                {joinedName}
              </p>
              <p className="text-[var(--wm-t2)] text-sm pt-1">
                You can now view bills and upload new ones for this home.
              </p>
            </div>

            <div className="bg-[var(--wm-card)] border border-[var(--wm-border)] rounded-md p-4 flex items-start gap-3">
              <Users size={16} className="text-[var(--wm-t2)] shrink-0 mt-0.5" />
              <p className="text-sm text-[var(--wm-t2)]">
                As a member, you can upload bills and view the dashboard.
                Only the owner can invite others or manage settings.
              </p>
            </div>

            <button
              onClick={handleGoToDashboard}
              className="w-full py-2 rounded-md bg-[#e8a838] text-black font-semibold text-sm hover:bg-[#d4993a] transition-colors flex items-center justify-center gap-2"
            >
              Go to dashboard
              <ArrowRight size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Sign out — escape hatch so a wrong-account login isn't a dead end */}
      <button
        onClick={() => { signOut(); router.push("/login"); }}
        className="mt-6 flex items-center gap-1.5 text-xs text-[var(--wm-t3)] hover:text-[var(--wm-t2)] transition-colors"
      >
        <LogOut size={13} />
        Sign out{user?.name ? ` (${user.name})` : ""}
      </button>
    </div>
  );
}
