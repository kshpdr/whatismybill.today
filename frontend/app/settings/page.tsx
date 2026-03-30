"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft, Copy, Check, RotateCw, Crown, UserMinus,
  Zap, Flame, Droplets, Pencil, X, Trash2, LogOut, AlertTriangle, Users, Share2,
  Link, Shield, Plus, FileText, BarChart2, Gauge, MapPin, List,
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

function avatarColor(_id: string) {
  return "bg-[var(--wm-hover)] text-[var(--wm-t2)]";
}

// ─── Invite code display ──────────────────────────────────────────────────────

function InviteCodeRow({ code, onCopy }: { code: string; onCopy: () => void }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      <div className="flex items-center gap-1">
        {code.split("").map((char, i) => (
          <div
            key={i}
            className={`w-9 h-11 rounded-md border border-[rgba(255,255,255,0.12)] bg-[var(--wm-bg)]
              flex items-center justify-center text-base font-mono text-[var(--wm-t1)]
              ${i === 2 ? "mr-1.5" : ""}`}
          >
            {char}
          </div>
        ))}
      </div>
      <button
        onClick={onCopy}
        className="ml-2 p-2 rounded-md border border-[var(--wm-border)] text-[var(--wm-t2)] hover:text-[var(--wm-t1)] hover:bg-[var(--wm-hover)] transition-colors"
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
      <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--wm-t3)] px-4 mb-2">
        {title}
      </h2>
      <div className="bg-[var(--wm-card)] border border-[var(--wm-border)] rounded-md overflow-hidden">
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

  // ── Share links ────────────────────────────────────────────────────────────
  type UtilityType = "electricity" | "gas" | "water";
  interface ShareVisibilityConfig {
    showPdf:             boolean;
    showCharges:         boolean;
    showUsage:           boolean;
    showChart:           boolean;
    showAddress:         boolean;
    visibleUtilityTypes: UtilityType[];
    maxMonths:           number | null;
  }
  interface ShareLinkRow {
    token:            string;
    label:            string | null;
    expiresAt:        string | null;
    createdAt:        string;
    visibilityConfig: ShareVisibilityConfig;
  }
  const DEFAULT_VISIBILITY: ShareVisibilityConfig = {
    showPdf: true, showCharges: true, showUsage: true, showChart: true, showAddress: true,
    visibleUtilityTypes: ["electricity", "gas", "water"],
    maxMonths: null,
  };
  const VISIBILITY_OPTIONS: { key: keyof Pick<ShareVisibilityConfig, "showAddress"|"showChart"|"showUsage"|"showCharges"|"showPdf">; label: string; icon: React.ReactNode }[] = [
    { key: "showAddress", label: "Address",   icon: <MapPin    size={11} /> },
    { key: "showChart",   label: "Chart",     icon: <BarChart2 size={11} /> },
    { key: "showUsage",   label: "Usage",     icon: <Gauge     size={11} /> },
    { key: "showCharges", label: "Breakdown", icon: <List      size={11} /> },
    { key: "showPdf",     label: "PDF",       icon: <FileText  size={11} /> },
  ];
  const UTILITY_OPTIONS: { type: UtilityType; label: string; icon: React.ReactNode }[] = [
    { type: "electricity", label: "Electricity", icon: <Zap      size={11} /> },
    { type: "gas",         label: "Gas",         icon: <Flame    size={11} /> },
    { type: "water",       label: "Water",       icon: <Droplets size={11} /> },
  ];
  const HISTORY_OPTIONS: { value: number | null; label: string }[] = [
    { value: null, label: "All" },
    { value: 12,   label: "12 mo" },
    { value: 6,    label: "6 mo" },
    { value: 3,    label: "3 mo" },
  ];

  const [shareLinks,      setShareLinks]      = useState<ShareLinkRow[]>([]);
  const [shareLoading,    setShareLoading]    = useState(true);
  const [shareCreating,   setShareCreating]   = useState(false);
  const [shareLabel,      setShareLabel]      = useState("");
  const [shareVisibility, setShareVisibility] = useState<ShareVisibilityConfig>(DEFAULT_VISIBILITY);
  const [copiedToken,     setCopiedToken]     = useState<string | null>(null);
  const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

  useEffect(() => {
    apiFetch<ShareLinkRow[]>(`/households/${household.id}/share`)
      .then(setShareLinks)
      .catch(() => {})
      .finally(() => setShareLoading(false));
  }, [household.id]);

  async function handleCreateShare() {
    setShareCreating(true);
    try {
      const link = await apiFetch<ShareLinkRow>(`/households/${household.id}/share`, {
        method: "POST",
        body:   JSON.stringify({
          label:            shareLabel.trim() || undefined,
          expiryDays:       90,
          visibilityConfig: shareVisibility,
        }),
      });
      setShareLinks((prev) => [link, ...prev]);
      setShareLabel("");
      setShareVisibility(DEFAULT_VISIBILITY);
    } finally {
      setShareCreating(false);
    }
  }

  async function handleRevokeShare(token: string) {
    await apiFetch(`/households/${household.id}/share/${token}`, { method: "DELETE" });
    setShareLinks((prev) => prev.filter((l) => l.token !== token));
  }

  function shareUrl(token: string) {
    return `${window.location.origin}/share/${token}`;
  }

  function copyShareLink(token: string) {
    navigator.clipboard.writeText(shareUrl(token));
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  }

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
    <div className="min-h-screen bg-[var(--wm-bg)]">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[var(--wm-surface)] border-b border-[var(--wm-border)]">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-1.5 rounded-md text-[var(--wm-t2)] hover:text-[var(--wm-t1)] transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-6 h-6 rounded-md bg-[#e8a838] flex items-center justify-center shrink-0">
              <Zap size={12} className="text-black" strokeWidth={2.5} />
            </div>
            <h1 className="font-semibold text-[var(--wm-t1)] truncate text-sm">
              {household.nickname}
            </h1>
            {isOwner && (
              <span className="shrink-0 inline-flex items-center gap-1 bg-[var(--wm-amber-dim)] border border-[var(--wm-amber-dim)] text-[#e8a838] text-[10px] font-mono px-1.5 py-0.5 rounded">
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
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--wm-t3)] mb-1.5">
                    Nickname
                  </label>
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    className="w-full bg-[var(--wm-surface)] border border-[var(--wm-border)] rounded-md px-3 py-2 text-sm text-[var(--wm-t1)] placeholder:text-[var(--wm-t3)] focus:border-[#e8a838] focus:outline-none transition-colors duration-150"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--wm-t3)] mb-1.5">
                    Address{" "}
                    <span className="font-normal normal-case tracking-normal text-[var(--wm-t4)]">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="123 Maple St, Oakland CA"
                    className="w-full bg-[var(--wm-surface)] border border-[var(--wm-border)] rounded-md px-3 py-2 text-sm text-[var(--wm-t1)] placeholder:text-[var(--wm-t3)] focus:border-[#e8a838] focus:outline-none transition-colors duration-150"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSave}
                    disabled={saving || !nickname.trim()}
                    className="flex-1 py-2 rounded-md bg-[#e8a838] hover:bg-[#d4993a] text-black text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {saving ? (
                      <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    ) : (
                      <>
                        <Check size={14} />
                        Save changes
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="px-4 py-2 rounded-md border border-[var(--wm-border)] hover:bg-[var(--wm-hover)] text-[var(--wm-t2)] text-sm transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-base text-[var(--wm-t1)]">{household.nickname}</p>
                    <p className="text-sm text-[var(--wm-t3)]">
                      {household.address ?? (
                        <span className="italic">No address set</span>
                      )}
                    </p>
                  </div>
                  {isOwner && (
                    <button
                      onClick={() => setEditing(true)}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[var(--wm-border)] hover:bg-[var(--wm-hover)] text-xs text-[var(--wm-t2)] hover:text-[var(--wm-t1)] transition-colors"
                    >
                      <Pencil size={12} />
                      Edit
                    </button>
                  )}
                </div>
                <p className="text-xs text-[var(--wm-t3)]">
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
                i < members.length - 1 ? "border-b border-[var(--wm-border-sub)]" : ""
              }`}
            >
              {/* Avatar */}
              <div
                className={`w-9 h-9 rounded-md flex items-center justify-center text-sm font-mono shrink-0 ${avatarColor(member.id)}`}
              >
                {initials(member.name)}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm text-[var(--wm-t1)] truncate">
                    {member.name}
                    {member.id === user?.id && (
                      <span className="text-[var(--wm-t3)] ml-1 text-xs">· you</span>
                    )}
                  </p>
                  {member.isOwner && (
                    <span className="shrink-0 inline-flex items-center gap-0.5 bg-[var(--wm-amber-dim)] border border-[var(--wm-amber-dim)] text-[#e8a838] text-[10px] font-mono px-1.5 py-0.5 rounded">
                      <Crown size={8} />
                      Owner
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--wm-t3)] truncate">{member.email}</p>
              </div>

              {/* Remove (owner only, not for self or other owner) */}
              {isOwner && !member.isOwner && (
                <button
                  onClick={() => handleRemove(member.id)}
                  className="shrink-0 p-2 rounded-md text-[var(--wm-t3)] hover:text-[var(--wm-red-text)] hover:bg-[var(--wm-red-dim)] transition-colors"
                  title={`Remove ${member.name}`}
                >
                  <UserMinus size={14} />
                </button>
              )}
            </div>
          ))}

          {/* Invite hint */}
          <div className="px-4 py-3 bg-[var(--wm-surface)] border-t border-[var(--wm-border-sub)] flex items-center gap-2">
            <Users size={13} className="text-[var(--wm-t3)] shrink-0" />
            <p className="text-xs text-[var(--wm-t3)]">
              Share the invite code below to add more members.
            </p>
          </div>
        </Section>

        {/* ── INVITE CODE ── */}
        <Section title="Invite code">
          <div className="px-4 py-5 space-y-4">
            <p className="text-sm text-[var(--wm-t2)]">
              {isOwner
                ? "Share this code with anyone you want to add to your home."
                : "Give this code to people you'd like to invite. Ask the owner to rotate it if needed."}
            </p>

            <InviteCodeRow code={inviteCode} onCopy={handleCopy} />

            <div className="flex items-center justify-center gap-2 flex-wrap">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-[var(--wm-border)] hover:bg-[var(--wm-hover)] text-sm text-[var(--wm-t2)] hover:text-[var(--wm-t1)] transition-colors"
              >
                {copied ? (
                  <>
                    <Check size={13} className="text-[var(--wm-green-text)]" />
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
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-[#e8a838] hover:bg-[#d4993a] text-black text-sm font-semibold transition-colors"
              >
                <Share2 size={13} />
                Share
              </button>

              {isOwner && (
                <button
                  onClick={handleRotate}
                  disabled={rotating}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-[var(--wm-border)] hover:bg-[var(--wm-hover)] text-sm text-[var(--wm-t2)] hover:text-[var(--wm-t1)] transition-colors disabled:opacity-50"
                  title="Generate a new code — old one stops working"
                >
                  <RotateCw size={13} className={rotating ? "animate-spin" : ""} />
                  Rotate
                </button>
              )}
            </div>

            {isOwner && (
              <p className="text-center text-xs text-[var(--wm-t3)]">
                Rotating generates a new code. The old code stops working immediately.
              </p>
            )}
          </div>
        </Section>

        {/* ── SHARE LINKS ── */}
        <Section title="Share with landlord">
          <div className="px-4 py-4 space-y-4">
            <p className="text-xs text-[var(--wm-t3)]">
              Generate a read-only link. Anyone with it can view your bills — no account needed. Control what they can see, and revoke anytime.
            </p>

            {/* Create new link */}
            <div className="space-y-2.5">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Label (e.g. Landlord – John)"
                  value={shareLabel}
                  onChange={(e) => setShareLabel(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateShare()}
                  className="flex-1 bg-[var(--wm-surface)] border border-[var(--wm-border)] rounded-md px-3 py-2 text-sm text-[var(--wm-t1)] placeholder:text-[var(--wm-t3)] focus:border-[#e8a838] focus:outline-none transition-colors duration-150"
                />
                <button
                  onClick={handleCreateShare}
                  disabled={shareCreating}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-[#e8a838] hover:bg-[#d4993a] text-black text-sm font-semibold disabled:opacity-50 transition-colors shrink-0"
                >
                  <Plus size={14} />
                  {shareCreating ? "…" : "Create"}
                </button>
              </div>

              {/* Utility type filter */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--wm-t3)]">Include utilities</p>
                <div className="flex flex-wrap gap-1.5">
                  {UTILITY_OPTIONS.map(({ type, label, icon }) => {
                    const on = shareVisibility.visibleUtilityTypes.includes(type);
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setShareVisibility((v) => ({
                          ...v,
                          visibleUtilityTypes: on
                            ? v.visibleUtilityTypes.filter((t) => t !== type)
                            : [...v.visibleUtilityTypes, type],
                        }))}
                        className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
                          on
                            ? "bg-[var(--wm-amber-dim)] border-[rgba(232,168,56,0.30)] text-[#e8a838]"
                            : "bg-[var(--wm-surface)] border-[var(--wm-border)] text-[var(--wm-t3)]"
                        }`}
                      >
                        {icon}{label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* History limit */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--wm-t3)]">History</p>
                <div className="flex flex-wrap gap-1.5">
                  {HISTORY_OPTIONS.map(({ value, label }) => {
                    const on = shareVisibility.maxMonths === value;
                    return (
                      <button
                        key={String(value)}
                        type="button"
                        onClick={() => setShareVisibility((v) => ({ ...v, maxMonths: value }))}
                        className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
                          on
                            ? "bg-[var(--wm-amber-dim)] border-[rgba(232,168,56,0.30)] text-[#e8a838]"
                            : "bg-[var(--wm-surface)] border-[var(--wm-border)] text-[var(--wm-t3)]"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Section visibility toggles */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--wm-t3)]">Show in view</p>
                <div className="flex flex-wrap gap-1.5">
                  {VISIBILITY_OPTIONS.map(({ key, label, icon }) => {
                    const on = shareVisibility[key];
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setShareVisibility((v) => ({ ...v, [key]: !v[key] }))}
                        className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
                          on
                            ? "bg-[var(--wm-amber-dim)] border-[rgba(232,168,56,0.30)] text-[#e8a838]"
                            : "bg-[var(--wm-surface)] border-[var(--wm-border)] text-[var(--wm-t3)]"
                        }`}
                      >
                        {icon}{label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Existing links */}
            {shareLoading ? (
              <p className="text-xs text-[var(--wm-t3)] text-center py-2">Loading…</p>
            ) : shareLinks.length === 0 ? (
              <p className="text-xs text-[var(--wm-t3)] text-center py-2">No active share links.</p>
            ) : (
              <div className="space-y-2">
                {shareLinks.map((l) => {
                  const vis = { ...DEFAULT_VISIBILITY, ...(l.visibilityConfig ?? {}) };
                  const hiddenSections = VISIBILITY_OPTIONS.filter(({ key }) => !vis[key]).map(({ label }) => label);
                  const allTypes: UtilityType[] = ["electricity", "gas", "water"];
                  const hiddenTypes = allTypes.filter((t) => !vis.visibleUtilityTypes.includes(t));
                  const summaryParts: string[] = [];
                  if (hiddenTypes.length > 0) summaryParts.push(`No ${hiddenTypes.join("/")}`);
                  if (vis.maxMonths != null) summaryParts.push(`Last ${vis.maxMonths} mo`);
                  if (hiddenSections.length > 0) summaryParts.push(`Hidden: ${hiddenSections.join(", ")}`);
                  return (
                    <div key={l.token} className="bg-[var(--wm-surface)] border border-[var(--wm-border)] rounded-md px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Shield size={13} className="text-[var(--wm-t3)] shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-[var(--wm-t1)] truncate">{l.label ?? "Untitled link"}</p>
                          <p className="text-[10px] text-[var(--wm-t3)] font-mono truncate">{`…${l.token.slice(-8)}`}
                            {l.expiresAt && ` · expires ${new Date(l.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })}`}
                          </p>
                        </div>
                        <button
                          onClick={() => copyShareLink(l.token)}
                          className="shrink-0 p-1.5 hover:bg-[var(--wm-hover)] rounded-md transition-colors text-[var(--wm-t2)] hover:text-[var(--wm-t1)]"
                          title="Copy link"
                        >
                          {copiedToken === l.token ? <Check size={13} className="text-[var(--wm-green-text)]" /> : <Link size={13} />}
                        </button>
                        <button
                          onClick={() => handleRevokeShare(l.token)}
                          className="shrink-0 p-1.5 hover:bg-[var(--wm-red-dim)] rounded-md transition-colors text-[var(--wm-t3)] hover:text-[var(--wm-red-text)]"
                          title="Revoke"
                        >
                          <X size={13} />
                        </button>
                      </div>
                      {summaryParts.length > 0 && (
                        <p className="mt-1.5 text-[10px] text-[var(--wm-t3)]">
                          {summaryParts.join(" · ")}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Section>

        {/* ── DANGER ZONE ── */}
        <section>
          <button
            onClick={() => setShowDanger(!showDanger)}
            className="w-full flex items-center justify-between px-4 py-1 group"
          >
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--wm-t3)] group-hover:text-[var(--wm-red-text)] transition-colors">
              Danger zone
            </h2>
            <AlertTriangle
              size={13}
              className={`transition-colors ${showDanger ? "text-[var(--wm-red-text)]" : "text-[var(--wm-t3)] group-hover:text-[var(--wm-red-text)]"}`}
            />
          </button>

          {showDanger && (
            <div className="mt-2 bg-[var(--wm-red-dim)] border border-[var(--wm-red-dim)] rounded-md overflow-hidden">
              {isOwner ? (
                <button
                  onClick={handleDelete}
                  className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-[var(--wm-red-dim)] transition-colors group"
                >
                  <div className="w-8 h-8 rounded-md bg-[var(--wm-red-dim)] flex items-center justify-center shrink-0">
                    <Trash2 size={14} className="text-[var(--wm-red-text)]" />
                  </div>
                  <div>
                    <p className="text-sm text-[var(--wm-red-text)]">Delete this home</p>
                    <p className="text-xs text-[var(--wm-t3)] mt-0.5">
                      Permanently removes all bills and data. Cannot be undone.
                    </p>
                  </div>
                </button>
              ) : (
                <button
                  onClick={handleLeave}
                  className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-[var(--wm-red-dim)] transition-colors group"
                >
                  <div className="w-8 h-8 rounded-md bg-[var(--wm-red-dim)] flex items-center justify-center shrink-0">
                    <LogOut size={14} className="text-[var(--wm-red-text)]" />
                  </div>
                  <div>
                    <p className="text-sm text-[var(--wm-red-text)]">Leave this home</p>
                    <p className="text-xs text-[var(--wm-t3)] mt-0.5">
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
