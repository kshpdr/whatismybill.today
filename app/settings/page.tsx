"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft, Copy, Check, RotateCw, Crown, UserMinus,
  Zap, Pencil, X, Trash2, LogOut, AlertTriangle, Users, Share2,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api/client";
import type { HouseholdMember } from "@/lib/types";

// ─── Mock data (used when Firebase not configured) ────────────────────────────

const MOCK_MEMBERS = [
  { id: "u1", name: "Jane Smith",  email: "jane@example.com",  isOwner: true,  joinedAt: new Date("2024-03-01").toISOString() },
  { id: "u2", name: "Alex Kim",    email: "alex@example.com",  isOwner: false, joinedAt: new Date("2024-03-05").toISOString() },
  { id: "u3", name: "Sam Rivera",  email: "sam@example.com",   isOwner: false, joinedAt: new Date("2024-04-10").toISOString() },
];

const MOCK_HOUSEHOLD = {
  id: "h1",
  nickname: "123 Maple St",
  address: "Oakland, CA 94601",
  ownerId: "u1",
  inviteCode: "A7K3M2",
  inviteCodeRotatedAt: new Date("2024-03-01").toISOString(),
  createdAt: new Date("2024-03-01").toISOString(),
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2);
}

const AVATAR_COLORS = [
  "bg-amber-100 text-amber-700",
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-purple-100 text-purple-700",
  "bg-rose-100 text-rose-700",
];

function avatarColor(id: string) {
  const idx = id.charCodeAt(id.length - 1) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

// ─── Invite code display ──────────────────────────────────────────────────────

function InviteCodeRow({ code, onCopy }: { code: string; onCopy: () => void }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {code.split("").map((char, i) => (
        <div
          key={i}
          className={`w-10 h-12 rounded-xl border-2 border-amber-200 bg-amber-50
            flex items-center justify-center text-lg font-bold font-mono text-amber-800
            ${i === 2 ? "mr-1.5" : ""}`}
        >
          {char}
        </div>
      ))}
      <button
        onClick={onCopy}
        className="ml-2 p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
        title="Copy code"
      >
        <Copy size={14} />
      </button>
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1 mb-2">
        {title}
      </h2>
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {children}
      </div>
    </section>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter();
  const { user, currentHousehold, refreshHouseholds, signOut } = useAuth();

  const household = currentHousehold ?? MOCK_HOUSEHOLD;
  const isOwner = user ? user.id === household.ownerId : true;

  // ─── Home info edit state ────────────────────────────────────────────────
  const [editing, setEditing] = useState(false);
  const [nickname, setNickname] = useState(household.nickname);
  const [address, setAddress] = useState(household.address ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await apiFetch(`/households/${household.id}`, {
        method: "PATCH",
        body:   JSON.stringify({ nickname: nickname.trim(), address: address.trim() || undefined }),
      });
      await refreshHouseholds();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  function handleCancelEdit() {
    setNickname(household.nickname);
    setAddress(household.address ?? "");
    setEditing(false);
  }

  // ─── Invite code state ────────────────────────────────────────────────────
  const [inviteCode, setInviteCode] = useState(household.inviteCode || "");
  const [copied, setCopied] = useState(false);
  const [rotating, setRotating] = useState(false);

  // Sync invite code when household changes
  useEffect(() => {
    setInviteCode(household.inviteCode || "");
  }, [household.inviteCode]);

  async function handleCopy() {
    await navigator.clipboard.writeText(inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleShare() {
    if (navigator.share) {
      await navigator.share({
        title: `Join ${household.nickname} on whatismybill.today`,
        text: `Use code ${inviteCode} to join and track utility bills together.`,
      });
    } else {
      handleCopy();
    }
  }

  async function handleRotate() {
    if (!confirm("Rotate the invite code? The old code will stop working immediately.")) return;
    setRotating(true);
    try {
      const { inviteCode: newCode } = await apiFetch<{ inviteCode: string }>(
        `/households/${household.id}/invite-code/rotate`,
        { method: "POST" }
      );
      setInviteCode(newCode);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to rotate code");
    } finally {
      setRotating(false);
    }
  }

  // ─── Members state ────────────────────────────────────────────────────────
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);

  useEffect(() => {
    if (!household.id || household.id === "h1") {
      setMembers(MOCK_MEMBERS.map(m => ({ ...m, joinedAt: new Date().toISOString() })));
      setMembersLoading(false);
      return;
    }
    apiFetch<HouseholdMember[]>(`/households/${household.id}/members`)
      .then(setMembers)
      .catch(() => setMembers([]))
      .finally(() => setMembersLoading(false));
  }, [household.id]);

  async function handleRemove(memberId: string) {
    const m = members.find((m) => m.id === memberId);
    if (!m) return;
    if (!confirm(`Remove ${m.name} from this home?`)) return;
    try {
      await apiFetch(`/households/${household.id}/members/${memberId}`, { method: "DELETE" });
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to remove member");
    }
  }

  // ─── Danger zone state ───────────────────────────────────────────────────
  const [showDanger, setShowDanger] = useState(false);

  async function handleDelete() {
    if (!confirm(`Delete "${household.nickname}"? This cannot be undone. All bills and data will be lost.`)) return;
    try {
      await apiFetch(`/households/${household.id}`, { method: "DELETE" });
      await refreshHouseholds();
      router.push("/onboarding");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete home");
    }
  }

  async function handleLeave() {
    if (!confirm(`Leave "${household.nickname}"? You'll lose access to all bills.`)) return;
    try {
      await apiFetch(`/households/${household.id}/leave`, { method: "POST" });
      await refreshHouseholds();
      router.push("/onboarding");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to leave home");
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-6 h-6 rounded-md bg-amber-500 flex items-center justify-center shrink-0">
              <Zap size={12} className="text-white" strokeWidth={2.5} />
            </div>
            <h1 className="font-semibold text-slate-900 truncate text-sm">
              {household.nickname}
            </h1>
            {isOwner && (
              <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                <Crown size={9} />
                Owner
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">

        {/* ── HOME INFO ── */}
        <Section title="Home">
          <div className="px-4 py-4 space-y-4">
            {editing ? (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                    Nickname
                  </label>
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                    Address{" "}
                    <span className="font-normal text-slate-400">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="123 Maple St, Oakland CA"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSave}
                    disabled={saving || !nickname.trim()}
                    className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {saving ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <Check size={14} />
                        Save changes
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-500 hover:bg-slate-50 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-base font-semibold text-slate-900">{household.nickname}</p>
                    <p className="text-sm text-slate-400">
                      {household.address ?? (
                        <span className="italic">No address set</span>
                      )}
                    </p>
                  </div>
                  {isOwner && (
                    <button
                      onClick={() => setEditing(true)}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-500 hover:bg-slate-50 transition-colors"
                    >
                      <Pencil size={12} />
                      Edit
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-400">
                  Created{" "}
                  {new Date(household.createdAt).toLocaleDateString("en-US", {
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </>
            )}
          </div>
        </Section>

        {/* ── MEMBERS ── */}
        <Section title={`Members (${members.length})`}>
          {members.map((member, i) => (
            <div
              key={member.id}
              className={`flex items-center gap-3 px-4 py-3 ${
                i < members.length - 1 ? "border-b border-slate-100" : ""
              }`}
            >
              {/* Avatar */}
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${avatarColor(member.id)}`}
              >
                {initials(member.name)}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {member.name}
                    {member.id === user?.id && (
                      <span className="text-slate-400 font-normal ml-1 text-xs">· you</span>
                    )}
                  </p>
                  {member.isOwner && (
                    <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                      <Crown size={8} />
                      Owner
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 truncate">{member.email}</p>
              </div>

              {/* Remove (owner only, not for self or other owner) */}
              {isOwner && !member.isOwner && (
                <button
                  onClick={() => handleRemove(member.id)}
                  className="shrink-0 p-2 rounded-lg text-slate-300 hover:text-red-400 hover:bg-red-50 transition-colors"
                  title={`Remove ${member.name}`}
                >
                  <UserMinus size={14} />
                </button>
              )}
            </div>
          ))}

          {/* Invite hint */}
          <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center gap-2">
            <Users size={13} className="text-slate-400 shrink-0" />
            <p className="text-xs text-slate-400">
              Share the invite code below to add more members.
            </p>
          </div>
        </Section>

        {/* ── INVITE CODE ── */}
        <Section title="Invite code">
          <div className="px-4 py-5 space-y-4">
            <p className="text-sm text-slate-500">
              {isOwner
                ? "Share this code with anyone you want to add to your home."
                : "Give this code to people you'd like to invite. Ask the owner to rotate it if needed."}
            </p>

            <InviteCodeRow code={inviteCode} onCopy={handleCopy} />

            <div className="flex items-center justify-center gap-2 flex-wrap">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                {copied ? (
                  <>
                    <Check size={13} className="text-emerald-500" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy size={13} />
                    Copy
                  </>
                )}
              </button>

              <button
                onClick={handleShare}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors"
              >
                <Share2 size={13} />
                Share
              </button>

              {isOwner && (
                <button
                  onClick={handleRotate}
                  disabled={rotating}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-50"
                  title="Generate a new code — old one stops working"
                >
                  <RotateCw size={13} className={rotating ? "animate-spin" : ""} />
                  Rotate
                </button>
              )}
            </div>

            {isOwner && (
              <p className="text-center text-xs text-slate-400">
                Rotating generates a new code. The old code stops working immediately.
              </p>
            )}
          </div>
        </Section>

        {/* ── DANGER ZONE ── */}
        <section>
          <button
            onClick={() => setShowDanger(!showDanger)}
            className="w-full flex items-center justify-between px-1 py-1 group"
          >
            <h2 className="text-xs font-bold text-slate-300 uppercase tracking-widest group-hover:text-red-400 transition-colors">
              Danger zone
            </h2>
            <AlertTriangle
              size={13}
              className={`transition-colors ${showDanger ? "text-red-400" : "text-slate-300 group-hover:text-red-400"}`}
            />
          </button>

          {showDanger && (
            <div className="mt-2 bg-white rounded-2xl border border-red-100 overflow-hidden">
              {isOwner ? (
                <button
                  onClick={handleDelete}
                  className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-red-50 transition-colors group"
                >
                  <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center shrink-0 group-hover:bg-red-200 transition-colors">
                    <Trash2 size={14} className="text-red-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-red-600">Delete this home</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Permanently removes all bills and data. Cannot be undone.
                    </p>
                  </div>
                </button>
              ) : (
                <button
                  onClick={handleLeave}
                  className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-red-50 transition-colors group"
                >
                  <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center shrink-0 group-hover:bg-red-200 transition-colors">
                    <LogOut size={14} className="text-red-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-red-600">Leave this home</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      You&apos;ll lose access to all bills in this home.
                    </p>
                  </div>
                </button>
              )}
            </div>
          )}
        </section>

        {/* Bottom padding for mobile nav */}
        <div className="h-6" />
      </div>
    </div>
  );
}
