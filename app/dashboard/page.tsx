"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import {
  Zap, Flame, Droplets, FileText, LayoutDashboard, Upload,
  X, ChevronRight, ArrowUpRight, ArrowDownRight, TrendingUp,
  TrendingDown, Home as HomeIcon, Leaf, ChevronDown, Plus, Check,
  LogOut, Settings, Trash2, CalendarDays, Sun, Moon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "next-themes";
import { apiFetch } from "@/lib/api/client";
import {
  MONTHLY_SPENDING, ELECTRICITY_MONTHLY, GAS_MONTHLY,
  WATER_MONTHLY, ALL_BILLS,
} from "@/lib/mock-data";
import {
  useBills,
  deriveMonthlySpend,
  deriveElecMonthly,
  deriveGasMonthly,
  utilitySummaryAnchorMonth,
  deriveApproxUtilitySpendInMonth,
} from "@/lib/use-bills";
import {
  pgeStatementCycles,
  filterCompletedMonths,
  getLatestBillOfType,
  getPreviousBillOfType,
  getBillingDays,
  isWaterBimonthly,
  getMonthlyEquivalent,
  getMonthlyUsageEquivalent,
  isMonthComplete,
} from "@/lib/bill-utils";
import { Bill } from "@/lib/types";

// ─── Colors ──────────────────────────────────────────────────────────────────

const C = {
  electricity: "#d4993a",
  gas: "#6892b0",
  water: "#47998e",
  delivery: "#a0856c",
  programs: "#8a7fb0",
  taxes: "rgba(255,255,255,0.25)", // fallback; replaced by cs.tax in JSX
  emerald: "#4ade80",
};

function useChartStyles() {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light";
  const tax = dark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.20)";
  return {
    grid:          dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.06)",
    axisText:      dark ? "rgba(255,255,255,0.30)" : "rgba(0,0,0,0.35)",
    legendText:    dark ? "rgba(255,255,255,0.30)" : "rgba(0,0,0,0.35)",
    tooltipBg:     dark ? "#1a1a1a" : "#ffffff",
    tooltipBorder: dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)",
    tooltipText:   dark ? "rgba(255,255,255,0.90)" : "rgba(0,0,0,0.90)",
    tooltipLabel:  dark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.55)",
    refLine:       dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.10)",
    refLabel:      dark ? "#94a3b8" : "#64748b",
    cursor:        dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
    tax,
    chargeColors(type: string) {
      if (type === "gas")   return ["#6892b0", "#89a9c4", tax];
      if (type === "water") return ["#47998e", "#5cb8ac", "#6fd4c8", tax];
      return ["#d4993a", "#a0856c", "#8a7fb0", tax];
    },
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt$ = (n: number) => `$${n.toFixed(2)}`;
const fmtRound$ = (n: number) => `$${Math.round(n)}`;
const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
const fmtDateShort = (s: string) =>
  new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" });

// ─── Usage equivalents ────────────────────────────────────────────────────────
// Translates raw utility numbers into human-perceivable scale references.

interface Equivalent { label: string; icon: string }

function usageEquivalents(usage: number, unit: string): Equivalent[] {
  if (usage <= 0) return [];
  const u = unit.toLowerCase();

  if (u === "kwh") {
    const evMiles    = Math.round(usage * 3);          // ~3 mi/kWh average EV
    const fridgeDays = Math.round(usage / 5);           // fridge ~150 kWh/mo = ~5/day
    const iphones    = Math.round(usage / 0.015);       // ~15 Wh per full charge
    if (usage < 20)  return [{ label: `${iphones} phone charges`, icon: "📱" }];
    if (usage < 100) return [
      { label: `${fridgeDays} fridge-days`, icon: "🧊" },
      { label: `${evMiles} EV miles`, icon: "⚡" },
    ];
    return [
      { label: `${evMiles.toLocaleString()} EV miles`, icon: "⚡" },
      { label: `${fridgeDays} fridge-days`, icon: "🧊" },
    ];
  }

  if (u === "therms") {
    const showers    = Math.round(usage * 10);     // ~0.1 therm per 8-min shower
    const cookHours  = Math.round(usage * 40);     // gas stove ~0.025 therm/hr
    const heatDays   = Math.round(usage / 4);      // avg home heat ~4 therms/day
    if (usage < 1)  return [{ label: `${cookHours} hrs cooking`, icon: "🍳" }];
    if (usage < 10) return [
      { label: `${showers} hot showers`, icon: "🚿" },
      { label: `${cookHours} hrs cooking`, icon: "🍳" },
    ];
    return [
      { label: `${showers} hot showers`, icon: "🚿" },
      { label: `${heatDays} days of heating`, icon: "🔥" },
    ];
  }

  if (u === "ccf") {
    const gallons  = usage * 748;
    const showers  = Math.round(gallons / 17);      // ~17 gal per 8-min shower
    const bathtubs = Math.round(gallons / 36);      // ~36 gal per bath
    const loads    = Math.round(gallons / 19);      // ~19 gal per laundry load
    return [
      { label: `${showers.toLocaleString()} showers`, icon: "🚿" },
      { label: `${bathtubs} baths or ${loads} laundry loads`, icon: "🛁" },
    ];
  }

  if (u === "gallons" || u === "gal") {
    const showers = Math.round(usage / 17);
    return [{ label: `${showers.toLocaleString()} showers`, icon: "🚿" }];
  }

  return [];
}

// ─── Small atoms ─────────────────────────────────────────────────────────────

function Delta({ pct, size = "sm" }: { pct: number; size?: "xs" | "sm" }) {
  const good = pct < 0;
  const cls = size === "xs" ? "text-xs" : "text-sm";
  return (
    <span className={`inline-flex items-center gap-0.5 font-semibold tabular-nums ${cls} ${good ? "text-[var(--wm-green-text)]" : "text-[var(--wm-red-text)]"}`}>
      {good ? <ArrowDownRight className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function UtilityBadge({ type }: { type: string }) {
  const m: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
    electricity: { color: "#d4993a", icon: <Zap className="w-3 h-3" />,      label: "Electricity" },
    gas:         { color: "#6892b0", icon: <Flame className="w-3 h-3" />,    label: "Gas" },
    water:       { color: "#47998e", icon: <Droplets className="w-3 h-3" />, label: "Water" },
  };
  const c = m[type] ?? { color: "#94a3b8", icon: null, label: type };
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border"
      style={{ borderColor: `${c.color}40`, color: c.color, background: `${c.color}12` }}>
      {c.icon}{c.label}
    </span>
  );
}

// ─── Recharts tooltip ────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, dollar = false }: {
  active?: boolean;
  payload?: { dataKey: string; name: string; value: number; fill?: string; stroke?: string }[];
  label?: string;
  dollar?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + p.value, 0);
  return (
    <div className="bg-[var(--wm-card)] border border-[var(--wm-border)] rounded-md p-3 text-sm min-w-[150px]">
      <p className="font-semibold text-[var(--wm-t2)] mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-3 py-0.5">
          <span className="flex items-center gap-1.5 text-[var(--wm-t3)]">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: p.fill ?? p.stroke }} />
            {p.name}
          </span>
          <span className="font-medium text-[var(--wm-t1)] tabular-nums">
            {dollar ? fmt$(p.value) : p.value}
          </span>
        </div>
      ))}
      {payload.length > 1 && dollar && (
        <div className="flex justify-between gap-3 border-t border-[var(--wm-border-sub)] mt-2 pt-2">
          <span className="text-[var(--wm-t3)]">Total</span>
          <span className="font-semibold text-[var(--wm-t1)] tabular-nums">{fmt$(total)}</span>
        </div>
      )}
    </div>
  );
}

// ─── SSR guard ────────────────────────────────────────────────────────────────

function ClientOnly({ children, height }: { children: React.ReactNode; height: string }) {
  const [ok, setOk] = useState(false);
  useEffect(() => setOk(true), []);
  if (!ok) return <div className={`w-full ${height} bg-[var(--wm-surface)] animate-pulse rounded-md`} />;
  return <>{children}</>;
}

// ─── Section divider ─────────────────────────────────────────────────────────

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 px-1">
      <p className="text-[10px] font-bold text-[var(--wm-t3)] uppercase tracking-widest whitespace-nowrap">{label}</p>
      <div className="flex-1 h-px bg-[var(--wm-border)]" />
    </div>
  );
}

// ─── Bill detail panel (bottom sheet on mobile, right panel on desktop) ───────

function BillDetailPanel({
  bill, prevBill, onClose, onDelete,
}: {
  bill: Bill;
  prevBill?: Bill;
  onClose: () => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const cs = useChartStyles();
  const colors = cs.chargeColors(bill.utilityType);
  const usageDelta = prevBill && prevBill.usage > 0 ? ((bill.usage - prevBill.usage) / prevBill.usage) * 100 : undefined;
  const totalDelta = prevBill ? ((bill.totalAmount - prevBill.totalAmount) / prevBill.totalAmount) * 100 : undefined;
  const rateDelta  = prevBill && prevBill.unitPrice > 0 ? ((bill.unitPrice - prevBill.unitPrice) / prevBill.unitPrice) * 100 : undefined;

  const billingDays = Math.round(
    (new Date(bill.billingPeriodEnd).getTime() - new Date(bill.billingPeriodStart).getTime()) / 86_400_000
  );

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await onDelete(bill.id);
      onClose();
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function handleViewPdf() {
    setPdfLoading(true);
    try {
      const blob = await apiFetch<Blob>(`/bills/${bill.id}/pdf`, { headers: { Accept: "application/pdf" } });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      // ignore — backend will 404 if file missing
    } finally {
      setPdfLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end md:flex-row">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="relative flex flex-col bg-[var(--wm-card)] w-full rounded-t-md max-h-[92dvh] md:rounded-none md:max-h-full md:h-full md:w-[420px] md:border-l md:border-[var(--wm-border)]">
        {/* drag handle */}
        <div className="md:hidden flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-[var(--wm-t4)] rounded-full" />
        </div>

        {/* header */}
        <div className="px-5 py-3 border-b border-[var(--wm-border-sub)] flex items-start justify-between shrink-0">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <UtilityBadge type={bill.utilityType} />
              <span className="text-sm text-[var(--wm-t3)] font-medium">{bill.provider}</span>
              {bill.parseStatus === "success" && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--wm-green-dim)] text-[var(--wm-green-text)] border border-[var(--wm-green-dim)]">
                  parsed ✓
                </span>
              )}
              {bill.parseStatus === "failed" && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--wm-red-dim)] text-[var(--wm-red-text)] border border-[var(--wm-red-dim)]">
                  parse failed
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--wm-t3)]">
              {fmtDate(bill.billingPeriodStart)} – {fmtDate(bill.billingPeriodEnd)} · {billingDays} days
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-[var(--wm-border-sub)] rounded-md transition-colors text-[var(--wm-t3)] shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-5">

          {/* KPI row */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Total",              value: fmt$(bill.totalAmount) },
              { label: bill.usageUnit || "Usage", value: bill.usage > 0 ? String(bill.usage) : "—" },
              { label: `/${bill.usageUnit || "unit"}`, value: bill.unitPrice > 0 ? `$${bill.unitPrice.toFixed(3)}` : "—" },
            ].map((k) => (
              <div key={k.label} className="bg-[var(--wm-surface)] rounded-md p-3 text-center">
                <p className="text-base font-semibold text-[var(--wm-t1)] tabular-nums">{k.value}</p>
                <p className="text-[11px] text-[var(--wm-t3)] mt-0.5">{k.label}</p>
              </div>
            ))}
          </div>

          {/* Human-scale equivalents */}
          {bill.usage > 0 && usageEquivalents(bill.usage, bill.usageUnit).length > 0 && (
            <div className="bg-[var(--wm-surface)] rounded-md px-4 py-3 space-y-1.5">
              <p className="text-[10px] font-semibold text-[var(--wm-t3)] uppercase tracking-widest">That&apos;s roughly…</p>
              {usageEquivalents(bill.usage, bill.usageUnit).map((eq) => (
                <div key={eq.label} className="flex items-center gap-2">
                  <span className="text-base leading-none">{eq.icon}</span>
                  <span className="text-sm font-medium text-[var(--wm-t2)]">{eq.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* parse error */}
          {bill.parseError && (
            <div className="flex items-start gap-2 bg-[var(--wm-red-dim)] border border-[var(--wm-red-dim)] rounded-md p-3">
              <X className="w-3.5 h-3.5 text-[var(--wm-red-text)] mt-0.5 shrink-0" />
              <p className="text-xs text-[var(--wm-red-text)]">{bill.parseError}</p>
            </div>
          )}

          {/* charge breakdown */}
          {bill.charges.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-[var(--wm-t2)] mb-3">Charge Breakdown</h3>
            <div className="h-40">
              <ClientOnly height="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={bill.charges} dataKey="amount" nameKey="label"
                      cx="50%" cy="50%" innerRadius={38} outerRadius={64}
                      paddingAngle={2} startAngle={90} endAngle={-270}>
                      {bill.charges.map((_, i) => (
                        <Cell key={i} fill={colors[i % colors.length]} stroke="transparent" />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => [fmt$(Number(v)), ""]}
                      contentStyle={{ background: cs.tooltipBg, border: `1px solid ${cs.tooltipBorder}`, borderRadius: "6px", fontSize: 12, color: cs.tooltipText }} />
                  </PieChart>
                </ResponsiveContainer>
              </ClientOnly>
            </div>
            <div className="space-y-2.5 mt-1">
              {bill.charges.map((c, i) => (
                <div key={c.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[var(--wm-t2)] flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: colors[i % colors.length] }} />
                      {c.label}
                    </span>
                    <span className="font-semibold text-[var(--wm-t1)] tabular-nums">{fmt$(c.amount)}</span>
                  </div>
                  <div className="h-1.5 bg-[var(--wm-border-sub)] rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{
                      width: `${bill.totalAmount > 0 ? (c.amount / bill.totalAmount) * 100 : 0}%`,
                      background: colors[i % colors.length],
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          )}

          {/* vs. previous bill */}
          {prevBill && (
            <div>
              <h3 className="text-sm font-semibold text-[var(--wm-t2)] mb-3">vs. Previous Bill</h3>
              <div className="rounded-md border border-[var(--wm-border-sub)] divide-y divide-[var(--wm-border-sub)] overflow-hidden">
                {[
                  { label: "Total", curr: fmt$(bill.totalAmount), prev: fmt$(prevBill.totalAmount), delta: totalDelta },
                  { label: "Usage", curr: `${bill.usage} ${bill.usageUnit}`, prev: `${prevBill.usage} ${prevBill.usageUnit}`, delta: usageDelta },
                  { label: "Rate",  curr: bill.unitPrice > 0 ? `$${bill.unitPrice.toFixed(3)}` : "—", prev: prevBill.unitPrice > 0 ? `$${prevBill.unitPrice.toFixed(3)}` : "—", delta: rateDelta },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs text-[var(--wm-t3)]">{row.label}</span>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-[var(--wm-t4)] line-through tabular-nums">{row.prev}</span>
                      <span className="font-semibold text-[var(--wm-t1)] tabular-nums">{row.curr}</span>
                      {row.delta !== undefined && <Delta pct={row.delta} size="xs" />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* raw fields — always visible for debugging */}
          <div>
            <h3 className="text-sm font-semibold text-[var(--wm-t2)] mb-2">Raw data</h3>
            <div className="rounded-md border border-[var(--wm-border-sub)] divide-y divide-[var(--wm-border-sub)] overflow-hidden text-xs">
              {[
                { label: "Bill ID",      value: bill.id },
                { label: "Household",    value: bill.householdId },
                { label: "Uploaded",     value: new Date(bill.uploadedAt).toLocaleString() },
                { label: "Storage ref",  value: bill.storageRef ?? "not stored" },
                { label: "Parse status", value: bill.parseStatus ?? "—" },
              ].map((r) => (
                <div key={r.label} className="flex items-start justify-between gap-3 px-4 py-2.5">
                  <span className="text-[var(--wm-t3)] shrink-0">{r.label}</span>
                  <span className="text-[var(--wm-t2)] font-mono text-right break-all">{r.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* PDF */}
          <div className="border border-[var(--wm-border-sub)] rounded-md p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-md bg-[var(--wm-surface)] flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4 text-[var(--wm-t3)]" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--wm-t2)]">Original PDF</p>
                {bill.storageRef
                  ? <p className="text-[11px] text-[var(--wm-t3)] font-mono truncate">{bill.storageRef.split("/").pop()}</p>
                  : <p className="text-[11px] text-[var(--wm-t3)]">PDF not stored</p>
                }
              </div>
            </div>
            {bill.storageRef ? (
              <button
                onClick={handleViewPdf}
                disabled={pdfLoading}
                className="shrink-0 text-xs font-semibold text-[#e8a838] hover:text-[#6892b0] disabled:opacity-50 transition-colors"
              >
                {pdfLoading ? "Opening…" : "View →"}
              </button>
            ) : (
              <span className="shrink-0 text-xs text-[var(--wm-t3)]">Parse only</span>
            )}
          </div>

          {/* delete zone */}
          <div className="pt-1 pb-2">
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-md border border-[var(--wm-red-dim)] text-[var(--wm-red-text)] hover:bg-[var(--wm-red-dim)] text-sm font-medium transition-colors"
              >
                <Trash2 className="w-4 h-4" /> Delete this bill
              </button>
            ) : (
              <div className="bg-[var(--wm-red-dim)] border border-[var(--wm-red-dim)] rounded-md p-4 space-y-3">
                <p className="text-sm font-semibold text-[var(--wm-red-text)] text-center">Delete this bill?</p>
                <p className="text-xs text-[var(--wm-red-text)] text-center">This removes the record and the stored PDF. This cannot be undone.</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1 py-2 rounded-md border border-[var(--wm-border)] text-[var(--wm-t2)] text-sm font-medium hover:bg-[var(--wm-card)] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex-1 py-2 rounded-md bg-[#ef4444] hover:bg-[#dc2626] text-white text-sm font-semibold disabled:opacity-60 transition-colors"
                  >
                    {deleting ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>
      </aside>
    </div>
  );
}

// ─── Upload modal ─────────────────────────────────────────────────────────────

type UploadState =
  | { phase: "idle" }
  | { phase: "uploading"; filename: string; progress: number }
  | { phase: "success"; count: number }
  | { phase: "error"; message: string; encodingError?: boolean };

function UploadModal({
  householdId,
  onClose,
  onSuccess,
}: {
  householdId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [state, setState] = useState<UploadState>({ phase: "idle" });
  const [dragging, setDragging] = useState(false);
  const [privacyMode, setPrivacyMode] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file.name.endsWith(".pdf") && file.type !== "application/pdf") {
      setState({ phase: "error", message: "Only PDF files are accepted." });
      return;
    }
    setState({ phase: "uploading", filename: file.name, progress: 0 });

    const form = new FormData();
    form.append("file", file);
    form.append("householdId", householdId);
    if (privacyMode) form.append("privacyMode", "true");

    try {
      const res = await apiFetch<{ bills: Bill[] }>("/bills/upload", {
        method: "POST",
        body: form,
      });
      setState({ phase: "success", count: res.bills.length });
      setTimeout(() => { onSuccess(); onClose(); }, 1800);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      const enc = msg.includes("encoding_error");
      setState({ phase: "error", message: enc
        ? "This PDF has a private font encoding we can't decode automatically. Please enter the bill details manually."
        : msg,
        encodingError: enc,
      });
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 px-0 md:px-4">
      <div className="w-full md:max-w-md bg-[var(--wm-card)] rounded-t-md md:rounded-md border border-[var(--wm-border)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[var(--wm-border-sub)]">
          <h2 className="font-bold text-[var(--wm-t1)] text-base">Upload a bill</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--wm-border-sub)] transition-colors text-[var(--wm-t3)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          {/* Drop zone */}
          {state.phase === "idle" && (
            <button
              className={`w-full border-2 border-dashed rounded-md p-8 flex flex-col items-center gap-3 transition-all cursor-pointer ${
                dragging ? "border-[#e8a838] bg-[var(--wm-amber-dim)]" : "border-[var(--wm-border)] hover:border-[var(--wm-amber-dim)] hover:bg-[var(--wm-amber-dim)]"
              }`}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              <div className="w-12 h-12 rounded-md bg-[var(--wm-amber-dim)] border border-[var(--wm-amber-dim)] flex items-center justify-center">
                <Upload className="w-6 h-6 text-[#e8a838]" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-[var(--wm-t1)] text-sm">Drop your PDF here</p>
                <p className="text-xs text-[var(--wm-t3)] mt-1">or click to browse · PG&amp;E bills only for now</p>
              </div>
              <input ref={inputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={onInputChange} />
            </button>
          )}

          {/* Uploading */}
          {state.phase === "uploading" && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="w-10 h-10 border-[3px] border-[var(--wm-border-sub)] border-t-[#e8a838] rounded-full animate-spin" />
              <div className="text-center">
                <p className="font-semibold text-[var(--wm-t1)] text-sm">Parsing {state.filename}…</p>
                <p className="text-xs text-[var(--wm-t3)] mt-1">Extracting bill data, this takes a few seconds</p>
              </div>
            </div>
          )}

          {/* Success */}
          {state.phase === "success" && (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="w-12 h-12 rounded-full bg-[var(--wm-green-dim)] flex items-center justify-center">
                <Check className="w-6 h-6 text-[var(--wm-green-text)]" />
              </div>
              <p className="font-bold text-[var(--wm-t1)]">{state.count} bill{state.count !== 1 ? "s" : ""} added</p>
              <p className="text-xs text-[var(--wm-t3)]">Dashboard is updating…</p>
            </div>
          )}

          {/* Error */}
          {state.phase === "error" && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 bg-[var(--wm-red-dim)] border border-[var(--wm-red-dim)] rounded-md p-4">
                <X className="w-4 h-4 text-[var(--wm-red-text)] mt-0.5 shrink-0" />
                <p className="text-sm text-[var(--wm-red-text)]">{state.message}</p>
              </div>
              <button
                onClick={() => setState({ phase: "idle" })}
                className="w-full py-2.5 border border-[var(--wm-border)] rounded-md text-sm font-semibold text-[var(--wm-t2)] hover:bg-[var(--wm-surface)] transition-colors"
              >
                Try another file
              </button>
            </div>
          )}

          {state.phase === "idle" && (
            <button
              type="button"
              onClick={() => setPrivacyMode(!privacyMode)}
              className="w-full flex items-start gap-3 px-3 py-2.5 rounded-md border border-[var(--wm-border)] hover:bg-[var(--wm-hover)] transition-colors text-left"
            >
              <div className={`mt-0.5 w-4 h-4 rounded shrink-0 border flex items-center justify-center transition-colors ${
                privacyMode ? "bg-[#e8a838] border-[#e8a838]" : "border-[var(--wm-border)] bg-transparent"
              }`}>
                {privacyMode && <Check className="w-3 h-3 text-black" />}
              </div>
              <div>
                <p className="text-xs font-semibold text-[var(--wm-t2)]">Don&apos;t store PDF</p>
                <p className="text-xs text-[var(--wm-t3)] mt-0.5">We&apos;ll only keep the numbers — your original bill won&apos;t be saved on our servers.</p>
              </div>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Bill row (card-style, mobile-first) ─────────────────────────────────────

function BillRow({ bill, onSelect }: { bill: Bill; onSelect: (id: string) => void }) {
  const iconBg = bill.utilityType === "electricity" ? "rgba(212,153,58,0.12)" : bill.utilityType === "gas" ? "rgba(104,146,176,0.12)" : "rgba(71,153,142,0.12)";
  return (
    <button
      className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-[var(--wm-border-sub)] last:border-0 hover:bg-[var(--wm-hover)] transition-colors text-left"
      onClick={() => onSelect(bill.id)}
    >
      <div className="w-9 h-9 rounded-md flex items-center justify-center shrink-0" style={{ background: iconBg }}>
        {bill.utilityType === "electricity" && <Zap className="w-4 h-4 text-[#d4993a]" />}
        {bill.utilityType === "gas" && <Flame className="w-4 h-4 text-[#6892b0]" />}
        {bill.utilityType === "water" && <Droplets className="w-4 h-4 text-[#47998e]" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[var(--wm-t1)]">{bill.provider}</p>
        <p className="text-xs text-[var(--wm-t3)] mt-0.5 truncate">
          {fmtDateShort(bill.billingPeriodStart)} – {fmtDate(bill.billingPeriodEnd)} · {bill.usage} {bill.usageUnit}
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-sm font-semibold text-[var(--wm-t1)] tabular-nums">{fmt$(bill.totalAmount)}</span>
        <ChevronRight className="w-4 h-4 text-[var(--wm-t4)]" />
      </div>
    </button>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

type View = "dashboard" | "bills";
type UtilityFilter = "all" | "electricity" | "gas" | "water";

// ─── Page ─────────────────────────────────────────────────────────────────────

// ─── Mock households (used when Firebase not yet connected) ──────────────────

const MOCK_HOUSEHOLDS = [
  { id: "h1", nickname: "123 Maple St", address: "Oakland, CA 94601" },
  { id: "h2", nickname: "456 Oak Ave", address: "Berkeley, CA 94702" },
];

// ─── Household switcher popover ───────────────────────────────────────────────

function HouseholdPicker({
  households,
  currentId,
  onSelect,
  onAdd,
  onClose,
}: {
  households: { id: string; nickname: string; address?: string }[];
  currentId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onClose: () => void;
}) {
  return (
    <>
      {/* click-away */}
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute left-0 right-0 top-full mt-1 z-40 bg-[var(--wm-card)] rounded-md border border-[var(--wm-border)] overflow-hidden">
        {households.map((h) => (
          <button
            key={h.id}
            onClick={() => { onSelect(h.id); onClose(); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--wm-surface)] transition-colors text-left"
          >
            <div className="w-7 h-7 rounded-md bg-[var(--wm-amber-dim)] flex items-center justify-center shrink-0">
              <HomeIcon className="w-3.5 h-3.5 text-[#e8a838]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--wm-t1)] truncate">{h.nickname}</p>
              {h.address && <p className="text-xs text-[var(--wm-t3)] truncate">{h.address}</p>}
            </div>
            {h.id === currentId && <Check className="w-4 h-4 text-[#e8a838] shrink-0" />}
          </button>
        ))}
        <div className="border-t border-[var(--wm-border-sub)]">
          <button
            onClick={() => { onAdd(); onClose(); }}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-[#e8a838] hover:bg-[var(--wm-amber-dim)] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add a home
          </button>
        </div>
      </div>
    </>
  );
}

function DashboardPage() {
  const cs = useChartStyles();
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const toggleTheme = () => setTheme(resolvedTheme === "light" ? "dark" : "light");
  const router = useRouter();
  const searchParams = useSearchParams();
  const isDemo = searchParams.get("demo") === "1";

  const { user, loading: authLoading, households: authHouseholds, currentHousehold, setCurrentHousehold, signOut } = useAuth();

  // Auth guard — redirect to login if not authenticated (skip for demo)
  useEffect(() => {
    if (isDemo) return;
    if (!authLoading && !user) {
      router.replace("/login");
    } else if (!authLoading && user && authHouseholds.length === 0) {
      router.replace("/onboarding");
    }
  }, [authLoading, user, authHouseholds, router, isDemo]);

  // Use real households from auth context if available, else mock
  const households = authHouseholds.length > 0
    ? authHouseholds.map((h) => ({ id: h.id, nickname: h.nickname, address: h.address }))
    : (isDemo ? MOCK_HOUSEHOLDS : []);

  // Keep local household selection in sync with the context's currentHousehold
  const [currentHouseholdId, setCurrentHouseholdId] = useState(
    currentHousehold?.id ?? households[0]?.id ?? ""
  );
  useEffect(() => {
    if (currentHousehold) setCurrentHouseholdId(currentHousehold.id);
  }, [currentHousehold]);

  const [showHouseholdPicker, setShowHouseholdPicker] = useState(false);

  const activeHousehold = households.find((h) => h.id === currentHouseholdId) ?? households[0] ?? null;

  const [view, setView] = useState<View>("dashboard");
  const [utilityFilter, setUtilityFilter] = useState<UtilityFilter>("all");
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  // ─── Live bills ─────────────────────────────────────────────────────────────
  const { bills: liveBills, loading: billsLoading, refresh: refreshBills } = useBills(
    isDemo ? null : currentHouseholdId || null
  );

  const allBills: Bill[] = isDemo ? ALL_BILLS : liveBills;
  const hasData = allBills.length > 0;

  // ─── Derived chart data ──────────────────────────────────────────────────────
  const monthlySpend = isDemo ? MONTHLY_SPENDING : deriveMonthlySpend(liveBills);
  const elecMonthly  = isDemo
    ? ELECTRICITY_MONTHLY.map((m) => ({ month: m.month, kWh: m.usage, rate: m.rate, total: m.total }))
    : deriveElecMonthly(liveBills);
  const gasMonthly   = isDemo
    ? GAS_MONTHLY.map((m) => ({ month: m.month, therms: m.usage, rate: 0, total: m.total }))
    : deriveGasMonthly(liveBills);

  const selectedBill = allBills.find((b) => b.id === selectedBillId);
  // Find the immediately preceding bill of the same utility type (closest date before selected)
  const prevBill = selectedBill
    ? allBills
        .filter((b) =>
          b.utilityType === selectedBill.utilityType &&
          b.id !== selectedBill.id &&
          new Date(b.billingPeriodEnd) < new Date(selectedBill.billingPeriodEnd)
        )
        .sort((a, b) => new Date(b.billingPeriodEnd).getTime() - new Date(a.billingPeriodEnd).getTime())[0]
    : undefined;

  // PG&E: group by statement end (electricity + gas = one energy bill)
  const pgeCycles     = pgeStatementCycles(allBills);
  const pgeCurrent    = pgeCycles[0];
  const pgePrevious   = pgeCycles[1];
  const pgeTotal      = pgeCurrent?.total ?? 0;
  const pgePrevTotal  = pgePrevious?.total ?? 0;
  const pgeDeltaPct   = pgePrevTotal > 0 ? ((pgeTotal - pgePrevTotal) / pgePrevTotal) * 100 : 0;
  const pgeSavedAbs   = Math.abs(pgeTotal - pgePrevTotal);
  const pgeElecBarPct = pgeTotal > 0 && pgeCurrent ? (pgeCurrent.elec / pgeTotal) * 100 : 0;
  const pgeGasBarPct  = pgeTotal > 0 && pgeCurrent ? (pgeCurrent.gas / pgeTotal) * 100 : 0;

  // Water: latest full bill vs previous water bill (same cadence — bimonthly or monthly)
  const waterHeroSorted = [...allBills]
    .filter((b) => b.utilityType === "water")
    .sort((a, b) => b.billingPeriodEnd.localeCompare(a.billingPeriodEnd));
  const waterHeroCurrent = waterHeroSorted[0];
  const waterHeroPrev    = waterHeroSorted[1];
  const waterHeroTotal   = waterHeroCurrent?.totalAmount ?? 0;
  const waterHeroPrevTotal = waterHeroPrev?.totalAmount ?? 0;
  const waterHeroDeltaPct =
    waterHeroPrevTotal > 0 ? ((waterHeroTotal - waterHeroPrevTotal) / waterHeroPrevTotal) * 100 : 0;
  const waterHeroSavedAbs = Math.abs(waterHeroTotal - waterHeroPrevTotal);
  const waterHeroDays = waterHeroCurrent
    ? Math.round(
        (new Date(waterHeroCurrent.billingPeriodEnd + "T00:00:00").getTime() -
          new Date(waterHeroCurrent.billingPeriodStart + "T00:00:00").getTime()) /
          86_400_000
      )
    : 0;

  // Approx. calendar-month utility total (anchored to latest water bill’s month, else latest PG&E)
  const summaryAnchor = utilitySummaryAnchorMonth(allBills);
  const approxMonthSpend = deriveApproxUtilitySpendInMonth(
    allBills,
    summaryAnchor.year,
    summaryAnchor.month
  );
  const prevCalMonth =
    summaryAnchor.month === 1
      ? { year: summaryAnchor.year - 1, month: 12 }
      : { year: summaryAnchor.year, month: summaryAnchor.month - 1 };
  const approxPrevMonthSpend = deriveApproxUtilitySpendInMonth(
    allBills,
    prevCalMonth.year,
    prevCalMonth.month
  );
  const approxMonthDeltaPct =
    approxPrevMonthSpend.total > 0
      ? ((approxMonthSpend.total - approxPrevMonthSpend.total) / approxPrevMonthSpend.total) * 100
      : 0;
  const approxMonthSavedAbs = Math.abs(approxMonthSpend.total - approxPrevMonthSpend.total);
  const approxMonthLabel = new Date(
    summaryAnchor.year,
    summaryAnchor.month - 1,
    1
  ).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const prevApproxMonthLabel = new Date(
    prevCalMonth.year,
    prevCalMonth.month - 1,
    1
  ).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const approxTotal = approxMonthSpend.total;
  const approxElecPct =
    approxTotal > 0 ? (approxMonthSpend.electricity / approxTotal) * 100 : 0;
  const approxGasPct =
    approxTotal > 0 ? (approxMonthSpend.gas / approxTotal) * 100 : 0;
  const approxWaterPct =
    approxTotal > 0 ? (approxMonthSpend.water / approxTotal) * 100 : 0;

  // ── Per-utility status: use latest bills (statement-level) ──────────────────
  const latestElecBill = getLatestBillOfType(allBills, "electricity");
  const latestGasBill = getLatestBillOfType(allBills, "gas");
  const latestWaterBill = getLatestBillOfType(allBills, "water");
  
  const prevElecBill = getPreviousBillOfType(allBills, "electricity");
  const prevGasBill = getPreviousBillOfType(allBills, "gas");
  const prevWaterBill = getPreviousBillOfType(allBills, "water");

  // Electricity: latest bill amount and usage
  const elecAmount = latestElecBill?.totalAmount ?? 0;
  const elecUsage = latestElecBill?.usage ?? 0;
  const elecUsageLabel = latestElecBill ? `${elecUsage} kWh` : "—";
  const elecDelta = latestElecBill && prevElecBill
    ? ((latestElecBill.totalAmount - prevElecBill.totalAmount) / prevElecBill.totalAmount) * 100
    : 0;

  // Gas: latest bill amount and usage
  const gasAmount = latestGasBill?.totalAmount ?? 0;
  const gasUsage = latestGasBill?.usage ?? 0;
  const gasUsageLabel = latestGasBill ? `${gasUsage} ${latestGasBill.usageUnit}` : "—";
  const gasDelta = latestGasBill && prevGasBill
    ? ((latestGasBill.totalAmount - prevGasBill.totalAmount) / prevGasBill.totalAmount) * 100
    : 0;

  // Water: monthly equivalent for bimonthly, else full amount
  const waterIsBimonthly = latestWaterBill ? isWaterBimonthly(latestWaterBill) : false;
  const waterAmount = latestWaterBill
    ? (waterIsBimonthly ? getMonthlyEquivalent(latestWaterBill) : latestWaterBill.totalAmount)
    : 0;
  const waterUsage = latestWaterBill
    ? (waterIsBimonthly ? getMonthlyUsageEquivalent(latestWaterBill) : latestWaterBill.usage)
    : 0;
  const waterUsageLabel = latestWaterBill
    ? (waterIsBimonthly ? `~${waterUsage} CCF/mo` : `${latestWaterBill.usage} CCF`)
    : "—";
  const waterDelta = latestWaterBill && prevWaterBill
    ? ((latestWaterBill.totalAmount - prevWaterBill.totalAmount) / prevWaterBill.totalAmount) * 100
    : 0;
  const waterProvider = latestWaterBill?.provider ?? "San Jose Water";

  // Current + previous month (last two entries in derived data) — for charts only
  const cur = monthlySpend[monthlySpend.length - 1] ?? { month: "", electricity: 0, gas: 0, water: 0, total: 0 };
  const prv = monthlySpend[monthlySpend.length - 2] ?? { month: "", electricity: 0, gas: 0, water: 0, total: 0 };

  const curElec = elecMonthly[elecMonthly.length - 1] ?? { rate: 0, kWh: 0, total: 0 };
  const prvElec = elecMonthly[elecMonthly.length - 2] ?? { rate: 0, kWh: 0, total: 0 };
  const rateDelta  = prvElec.rate > 0    ? ((curElec.rate - prvElec.rate) / prvElec.rate) * 100           : 0;

  // Insights — pick most notable
  const insights: { icon: React.ReactNode; color: string; headline: string; body: string }[] = [];
  if (gasDelta < -8 && latestGasBill && prevGasBill) {
    insights.push({
      icon: <Leaf className="w-4 h-4 text-[var(--wm-green-text)]" />,
      color: "emerald",
      headline: `Gas down ${Math.abs(gasDelta).toFixed(0)}% from last bill`,
      body: "Heating season winding down — expect it to keep falling through May.",
    });
  }
  if (rateDelta > 1) {
    insights.push({
      icon: <Zap className="w-4 h-4 text-[#e8a838]" />,
      color: "amber",
      headline: `PG&E rate up ${rateDelta.toFixed(1)}% this cycle`,
      body: `Adjusted from $${prvElec.rate.toFixed(3)} to $${curElec.rate.toFixed(3)}/kWh.`,
    });
  }
  if (insights.length === 0) {
    if (pgePrevious) {
      insights.push({
        icon: pgeDeltaPct < 0 ? <TrendingDown className="w-4 h-4 text-[var(--wm-green-text)]" /> : <TrendingUp className="w-4 h-4 text-[#e8a838]" />,
        color: pgeDeltaPct < 0 ? "emerald" : "amber",
        headline: `PG&E (elec + gas) ${pgeDeltaPct < 0 ? "down" : "up"} ${Math.abs(pgeDeltaPct).toFixed(1)}% vs last statement`,
        body: `Last energy statement was ${fmt$(pgePrevTotal)} · this one ${fmt$(pgeTotal)}.`,
      });
    } else {
      insights.push({
        icon: <TrendingDown className="w-4 h-4 text-[var(--wm-green-text)]" />,
        color: "emerald",
        headline: "Add another PG&E bill to compare statements",
        body: "Once you have two electricity+gas cycles, we’ll show period-over-period trends here.",
      });
    }
  }
  const insight = insights[0];

  // ── Categorise a charge label into chart buckets ──────────────────────────
  function catElec(label: string): "Energy" | "Delivery" | "Programs" | "Tax" {
    const l = label.toLowerCase();
    if (l.includes("generation") || l.includes("credit") || l.includes("adjustment")) return "Energy";
    if (l.includes("delivery") || l.includes("infrastructure") || l.includes("transmission") || l.includes("distribution") || l.includes("pcia")) return "Delivery";
    if (l.includes("program") || l.includes("public purpose") || l.includes("nuclear") || l.includes("wildfire")) return "Programs";
    if (l.includes("tax") || l.includes("fee") || l.includes("surcharge") || l.includes("franchise")) return "Tax";
    return "Energy";
  }
  function catGas(label: string): "Commodity" | "Delivery" | "Tax" {
    const l = label.toLowerCase();
    if (l.includes("tax") || l.includes("fee") || l.includes("franchise") || l.includes("surcharge")) return "Tax";
    if (l.includes("delivery") || l.includes("program") || l.includes("public purpose")) return "Delivery";
    return "Commodity";
  }

  // ── Electricity charge breakdown (real or demo) ───────────────────────────
  const chargeBreakdown = isDemo
    ? elecMonthly.slice(-6).map((m) => ({
        month: m.month.split(" ")[0],
        Energy:   (ELECTRICITY_MONTHLY.find(x => x.month === m.month) as any)?.energy    ?? 0,
        Delivery: (ELECTRICITY_MONTHLY.find(x => x.month === m.month) as any)?.delivery  ?? 0,
        Programs: (ELECTRICITY_MONTHLY.find(x => x.month === m.month) as any)?.programs  ?? 0,
        Tax:      (ELECTRICITY_MONTHLY.find(x => x.month === m.month) as any)?.taxes     ?? 0,
      }))
    : [...liveBills]
        .filter(b => b.utilityType === "electricity")
        .sort((a, b) => a.billingPeriodEnd.localeCompare(b.billingPeriodEnd))
        .slice(-6)
        .map(b => {
          const buckets = { Energy: 0, Delivery: 0, Programs: 0, Tax: 0 };
          for (const c of b.charges) buckets[catElec(c.label)] += c.amount;
          const d = new Date(b.billingPeriodEnd + "T00:00:00");
          const mo = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()];
          return { month: mo, ...buckets };
        });

  const usageData = elecMonthly.map((m) => ({ month: m.month.split(" ")[0], kWh: m.kWh }));
  const rateData  = elecMonthly.map((m) => ({ month: m.month.split(" ")[0], "$/kWh": m.rate }));

  // ── Gas data (real or demo) ───────────────────────────────────────────────
  const gasData = isDemo
    ? gasMonthly.map((m) => ({
        month: m.month.split(" ")[0], therms: m.therms,
        Commodity: (GAS_MONTHLY.find(x => x.month === m.month) as any)?.commodity ?? 0,
        Delivery:  (GAS_MONTHLY.find(x => x.month === m.month) as any)?.delivery  ?? 0,
        Tax:       (GAS_MONTHLY.find(x => x.month === m.month) as any)?.taxes     ?? 0,
      }))
    : [...liveBills]
        .filter(b => b.utilityType === "gas")
        .sort((a, b) => a.billingPeriodEnd.localeCompare(b.billingPeriodEnd))
        .map(b => {
          const buckets = { Commodity: 0, Delivery: 0, Tax: 0 };
          for (const c of b.charges) buckets[catGas(c.label)] += c.amount;
          const d = new Date(b.billingPeriodEnd + "T00:00:00");
          const mo = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()];
          return { month: mo, therms: b.usage, ...buckets };
        });

  // ── Big-picture averages (exclude incomplete current month) ──────────────────
  const completedMonths = filterCompletedMonths(monthlySpend);
  const monthCount = completedMonths.length;
  const completedTotal = completedMonths.reduce((s, m) => s + m.electricity + m.gas + m.water, 0);
  const avgMonthly = monthCount > 0 ? completedTotal / monthCount : 0;
  const estAnnual = avgMonthly * 12;
  const avgElec = monthCount > 0 ? completedMonths.reduce((s, m) => s + m.electricity, 0) / monthCount : 0;
  const avgGas = monthCount > 0 ? completedMonths.reduce((s, m) => s + m.gas, 0) / monthCount : 0;
  const avgWater = monthCount > 0 ? completedMonths.reduce((s, m) => s + m.water, 0) / monthCount : 0;
  const avgRate = liveBills.filter(b => b.utilityType === "electricity" && b.unitPrice > 0)
                    .reduce((s, b, _, a) => s + b.unitPrice / a.length, 0);
  const CA_AVG_RATE = 0.27; // CA average $/kWh as of 2024
  const bestMonth = [...completedMonths].sort((a, b) => (a.electricity + a.gas + a.water) - (b.electricity + b.gas + b.water))[0];
  const worstMonth = [...completedMonths].sort((a, b) => (b.electricity + b.gas + b.water) - (a.electricity + a.gas + a.water))[0];

  // Chart data (all months including current for visualization)
  const ytdTotal = monthlySpend.reduce((s, m) => s + m.electricity + m.gas + m.water, 0);

  // Mark incomplete months for visual indication
  const monthlySpendWithMeta = monthlySpend.map(m => {
    const [monthName, yearShort] = m.month.split(" '");
    const year = 2000 + parseInt(yearShort);
    const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(monthName) + 1;
    return {
      ...m,
      isComplete: isMonthComplete(year, month),
    };
  });

  const filteredBills = utilityFilter === "all"
    ? allBills
    : allBills.filter((b) => b.utilityType === utilityFilter);

  // Guard — all hooks above, conditional returns below
  if (!isDemo && (authLoading || !activeHousehold)) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[var(--wm-bg)]">
        <div className="w-8 h-8 border-2 border-[var(--wm-border)] border-t-[#e8a838] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-dvh bg-[var(--wm-bg)] md:flex-row md:h-dvh md:overflow-hidden">

      {/* ── DESKTOP SIDEBAR ── */}
      <aside className="hidden md:flex w-56 bg-[var(--wm-surface)] border-r border-[var(--wm-border)] flex-col shrink-0">
        <div className="px-4 py-5 border-b border-[var(--wm-border-sub)]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-[#e8a838] rounded-md flex items-center justify-center">
              <Zap className="w-4 h-4 text-black" strokeWidth={2.5} />
            </div>
            <span className="font-mono text-[var(--wm-t2)] text-sm tracking-tight">whatismybill</span>
          </div>
        </div>
        <div className="px-3 py-3 border-b border-[var(--wm-border-sub)] relative">
          <button
            onClick={() => setShowHouseholdPicker(!showHouseholdPicker)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md bg-[var(--wm-surface)] hover:bg-[var(--wm-border-sub)] transition-colors text-left"
          >
            <div className="w-6 h-6 rounded-md bg-[var(--wm-amber-dim)] flex items-center justify-center shrink-0">
              <HomeIcon className="w-3 h-3 text-[#e8a838]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-[var(--wm-t2)] truncate">{activeHousehold.nickname}</p>
              <p className="text-[10px] text-[var(--wm-t3)] truncate">{activeHousehold.address ?? "Add address"}</p>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-[var(--wm-t3)] shrink-0 transition-transform ${showHouseholdPicker ? "rotate-180" : ""}`} />
          </button>
          {showHouseholdPicker && (
            <HouseholdPicker
              households={households}
              currentId={currentHouseholdId}
              onSelect={setCurrentHouseholdId}
              onAdd={() => router.push("/onboarding")}
              onClose={() => setShowHouseholdPicker(false)}
            />
          )}
        </div>
        <nav className="px-3 py-3 space-y-0.5 flex-1">
          {([
            { id: "dashboard" as View, label: "Dashboard", icon: <LayoutDashboard className="w-4 h-4" /> },
            { id: "bills"     as View, label: "All Bills",  icon: <FileText className="w-4 h-4" /> },
          ]).map((item) => (
            <button key={item.id} onClick={() => setView(item.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                view === item.id ? "bg-[#e8a838] text-black font-medium" : "text-[var(--wm-t3)] hover:bg-[var(--wm-hover)] hover:text-[var(--wm-t1)]"
              }`}>
              {item.icon}{item.label}
            </button>
          ))}
          <div className="pt-4 pb-1">
            <p className="px-3 text-[10px] font-semibold text-[var(--wm-t3)] uppercase tracking-widest">Utilities</p>
          </div>
          {([
            { id: "electricity" as UtilityFilter, label: "Electricity", icon: <Zap className="w-3.5 h-3.5" />,      cls: "text-[#d4993a] bg-[rgba(212,153,58,0.12)]" },
            { id: "gas"         as UtilityFilter, label: "Gas",         icon: <Flame className="w-3.5 h-3.5" />,    cls: "text-[#6892b0] bg-[rgba(104,146,176,0.12)]" },
            { id: "water"       as UtilityFilter, label: "Water",       icon: <Droplets className="w-3.5 h-3.5" />, cls: "text-[#47998e] bg-[rgba(71,153,142,0.12)]" },
          ]).map((u) => (
            <button key={u.id} onClick={() => { setUtilityFilter(u.id); setView("bills"); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                utilityFilter === u.id && view === "bills" ? `${u.cls} font-medium` : "text-[var(--wm-t3)] hover:bg-[var(--wm-hover)] hover:text-[var(--wm-t2)]"
              }`}>
              <span className={utilityFilter === u.id && view === "bills" ? "" : "text-[var(--wm-t3)]"}>{u.icon}</span>
              {u.label}
            </button>
          ))}
        </nav>
        <div className="px-3 pb-4 space-y-2">
          <button
            onClick={() => setShowUpload(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-[#e8a838] hover:bg-[#d4993a] text-black rounded-md text-sm font-semibold transition-colors">
            <Upload className="w-4 h-4" />Upload Bill
          </button>
          {mounted && (
            <button
              onClick={toggleTheme}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-[var(--wm-t3)] hover:text-[var(--wm-t2)] hover:bg-[var(--wm-hover)] rounded-md text-xs font-medium transition-colors"
            >
              {resolvedTheme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              {resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
            </button>
          )}
          <Link
            href="/settings"
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-[var(--wm-t3)] hover:text-[var(--wm-t2)] hover:bg-[var(--wm-surface)] rounded-md text-xs font-medium transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />Home settings
          </Link>
          {user ? (
            <button
              onClick={() => { signOut(); router.push("/login"); }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-[var(--wm-t3)] hover:text-[var(--wm-t2)] hover:bg-[var(--wm-surface)] rounded-md text-xs font-medium transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />Sign out
            </button>
          ) : (
            <Link
              href="/login"
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-[var(--wm-t3)] hover:text-[var(--wm-t2)] hover:bg-[var(--wm-surface)] rounded-md text-xs font-medium transition-colors"
            >
              Sign in
            </Link>
          )}
        </div>
      </aside>

      {/* ── CONTENT COLUMN ── */}
      <div className="flex flex-col flex-1 min-h-0 md:h-dvh md:overflow-hidden">

        {/* Mobile topbar */}
        <div className="md:hidden sticky top-0 z-10 bg-[var(--wm-surface)]/95 border-b border-[var(--wm-border)]">
          <div className="flex items-center justify-between px-4 py-3">
            {/* Brand + household switcher */}
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-[#e8a838] rounded-md flex items-center justify-center shrink-0">
                <Zap className="w-4 h-4 text-white" strokeWidth={2.5} />
              </div>
              <div className="relative">
                <button
                  onClick={() => setShowHouseholdPicker(!showHouseholdPicker)}
                  className="flex items-center gap-1 text-sm font-semibold text-[var(--wm-t1)]"
                >
                  {activeHousehold.nickname}
                  <ChevronDown className={`w-3.5 h-3.5 text-[var(--wm-t3)] transition-transform ${showHouseholdPicker ? "rotate-180" : ""}`} />
                </button>
                {showHouseholdPicker && (
                  <div className="absolute left-0 top-full mt-2 w-64">
                    <HouseholdPicker
                      households={households}
                      currentId={currentHouseholdId}
                      onSelect={setCurrentHouseholdId}
                      onAdd={() => router.push("/onboarding")}
                      onClose={() => setShowHouseholdPicker(false)}
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {mounted && (
                <button
                  onClick={toggleTheme}
                  className="p-1.5 rounded-md text-[var(--wm-t3)] hover:text-[var(--wm-t2)] hover:bg-[var(--wm-hover)] transition-colors"
                >
                  {resolvedTheme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>
              )}
              <button onClick={() => setShowUpload(true)} className="flex items-center gap-1.5 bg-[#e8a838] hover:bg-[#d4993a] text-white px-3 py-1.5 rounded-md text-xs font-semibold transition-colors">
                <Upload className="w-3.5 h-3.5" />Upload
              </button>
            </div>
          </div>
        </div>

        {/* Demo mode banner */}
        {isDemo && (
          <div className="bg-[var(--wm-amber-dim)] border-b border-[var(--wm-amber-dim)] px-4 py-2 flex items-center justify-between">
            <p className="text-xs text-[#e8a838] font-medium">Viewing sample data — <Link href="/" className="underline underline-offset-2">exit demo</Link></p>
          </div>
        )}

        {/* Desktop topbar */}
        <div className="hidden md:flex sticky top-0 z-10 bg-[var(--wm-card)]/70 border-b border-[var(--wm-border)]/80 px-8 py-4 items-center justify-between shrink-0">
          <div>
            <h1 className="font-semibold text-[var(--wm-t1)]">{view === "dashboard" ? "Dashboard" : "All Bills"}</h1>
            <p className="text-xs text-[var(--wm-t3)] mt-0.5">Apr 2025 – Mar 2026 · {activeHousehold.nickname}</p>
          </div>
          <span className="text-xs text-[var(--wm-t3)] bg-[var(--wm-border-sub)] px-3 py-1.5 rounded-md font-medium">Last 12 months</span>
        </div>

        {/* Scrollable main */}
        <main className="flex-1 overflow-y-auto pb-24 md:pb-0">

          {/* ══════════════════════ DASHBOARD VIEW ══════════════════════ */}
          {view === "dashboard" && (
            <div key="dashboard" className="animate-view-in max-w-2xl md:mx-auto px-4 md:px-8 py-4 md:py-6 space-y-4">

              {/* ── LOADING STATE ── */}
              {billsLoading && !isDemo && (
                <div className="flex flex-col items-center justify-center py-24 text-[var(--wm-t3)] gap-3">
                  <div className="w-8 h-8 border-2 border-[var(--wm-border)] border-t-[#e8a838] rounded-full animate-spin" />
                  <p className="text-sm">Loading your bills…</p>
                </div>
              )}

              {/* ── EMPTY STATE ── */}
              {!billsLoading && !hasData && !isDemo && (
                <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                  <div className="w-16 h-16 rounded-md bg-[var(--wm-amber-dim)] border border-[var(--wm-amber-dim)] flex items-center justify-center mb-5">
                    <FileText className="w-8 h-8 text-[#d4993a]" />
                  </div>
                  <h2 className="text-xl font-bold text-[var(--wm-t1)] mb-2">No bills yet</h2>
                  <p className="text-[var(--wm-t3)] text-sm max-w-xs mb-6">
                    Upload your first utility bill PDF and we&apos;ll parse it into clean, comparable data.
                  </p>
                  <button
                    onClick={() => setShowUpload(true)}
                    className="flex items-center gap-2 bg-[#e8a838] hover:bg-[#d4993a] text-white px-5 py-2.5 rounded-md font-semibold text-sm transition-colors">
                    <Upload className="w-4 h-4" /> Upload a bill
                  </button>
                  <Link href="/demo" className="mt-4 text-xs text-[var(--wm-t3)] hover:text-[var(--wm-t2)] transition-colors underline underline-offset-2">
                    Preview with sample data
                  </Link>
                </div>
              )}

              {/* ── DASHBOARD CONTENT (only shown when there&apos;s data) ── */}
              {(hasData || isDemo) && !billsLoading && (<>

              {/* ── 0. CALENDAR MONTH APPROX (water-anchored) ── */}
              <div className="bg-[var(--wm-card)] rounded-md border border-[var(--wm-border)] overflow-hidden">
                <div className="h-1 w-full bg-[var(--wm-border-sub)]" />
                <div className="px-5 pt-4 pb-5">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-10 h-10 rounded-md bg-[var(--wm-border-sub)] flex items-center justify-center shrink-0">
                      <CalendarDays className="w-5 h-5 text-[var(--wm-t2)]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-[var(--wm-t3)] uppercase tracking-widest">
                        Approx. utilities · calendar month
                      </p>
                      <p className="text-lg font-semibold text-[var(--wm-t1)] leading-tight mt-0.5">
                        {approxMonthLabel}
                      </p>
                      <p className="text-[11px] text-[var(--wm-t3)] mt-1 leading-snug">
                        {summaryAnchor.source === "water" && (
                          <>Month is tied to your <span className="font-semibold text-cyan-700">latest water</span> bill (period end). Elec, gas &amp; water are pro‑rated by billing days in this month.</>
                        )}
                        {summaryAnchor.source === "energy" && (
                          <>No water bill yet — using your latest <span className="font-semibold text-[#e8a838]">PG&amp;E</span> bill month. Add a water bill to anchor on water instead.</>
                        )}
                        {summaryAnchor.source === "today" && (
                          <>Upload bills to anchor this summary on real statement dates.</>
                        )}
                      </p>
                    </div>
                  </div>

                  {approxTotal > 0 ? (
                    <>
                      <div className="flex items-end justify-between mb-4">
                        <div>
                          <p className="text-4xl md:text-5xl font-bold text-[var(--wm-t1)] tracking-tight tabular-nums leading-none">
                            ~{fmt$(approxTotal)}
                          </p>
                          <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                            {approxPrevMonthSpend.total > 0 ? (
                              <>
                                <span className={`flex items-center gap-0.5 text-sm font-bold px-2 py-0.5 rounded-full ${
                                  approxMonthDeltaPct < 0 ? "bg-[var(--wm-green-dim)] text-[var(--wm-green-text)]" : "bg-[var(--wm-red-dim)] text-[var(--wm-red-text)]"
                                }`}>
                                  {approxMonthDeltaPct < 0 ? <ArrowDownRight className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                                  {Math.abs(approxMonthDeltaPct).toFixed(1)}%
                                </span>
                                <span className="text-sm text-[var(--wm-t3)]">vs {prevApproxMonthLabel}</span>
                              </>
                            ) : (
                              <span className="text-sm text-[var(--wm-t3)]">No prior month data to compare</span>
                            )}
                          </div>
                        </div>
                        {approxPrevMonthSpend.total > 0 && (
                          <div className="text-right pb-0.5 shrink-0">
                            <p className="text-[11px] text-[var(--wm-t3)] uppercase tracking-wider font-semibold">
                              {approxMonthDeltaPct < 0 ? "saved" : "extra"}
                            </p>
                            <p className={`text-xl font-bold tabular-nums ${approxMonthDeltaPct < 0 ? "text-[var(--wm-green-text)]" : "text-[var(--wm-red-text)]"}`}>
                              {fmtRound$(approxMonthSavedAbs)}
                            </p>
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="flex h-2.5 rounded-full overflow-hidden gap-px bg-[var(--wm-border-sub)]">
                          <div className="h-full bg-[#d4993a]" style={{ width: `${approxElecPct}%` }} />
                          <div className="h-full bg-[#6892b0]" style={{ width: `${approxGasPct}%` }} />
                          <div className="h-full bg-[#47998e]" style={{ width: `${approxWaterPct}%` }} />
                        </div>
                        <div className="flex mt-2 text-[11px] gap-3 flex-wrap">
                          <span className="text-[#e8a838] font-semibold tabular-nums">
                            Elec {fmtRound$(approxMonthSpend.electricity)}
                          </span>
                          <span className="text-blue-700 font-semibold tabular-nums">
                            Gas {fmtRound$(approxMonthSpend.gas)}
                          </span>
                          <span className="text-cyan-700 font-semibold tabular-nums">
                            Water {fmtRound$(approxMonthSpend.water)}
                          </span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-[var(--wm-t3)] py-2">
                      No billing days fall in {approxMonthLabel} yet — statements may cover other months.
                    </p>
                  )}
                </div>
              </div>

              {/* ── 1. HERO — PG&E energy statement (electricity + gas) ── */}
              <div className="bg-[var(--wm-card)] rounded-md border border-[var(--wm-border)] overflow-hidden">
                <div className="h-1 w-full bg-[var(--wm-border-sub)]" />
                <div className="px-5 pt-4 pb-5">
                  <p className="text-xs font-bold text-[var(--wm-t3)] uppercase tracking-widest mb-1">
                    PG&E · Electricity &amp; gas
                  </p>
                  <p className="text-xs text-[var(--wm-t3)] mb-3">
                    {pgeCurrent
                      ? `${fmtDate(pgeCurrent.periodStart)} – ${fmtDate(pgeCurrent.periodEnd)} · Latest energy statement`
                      : isDemo
                        ? "March 2026 · Latest energy statement"
                        : "No PG&E bills yet"}
                  </p>

                  {pgeCurrent && pgeTotal > 0 ? (
                    <>
                      <div className="flex items-end justify-between mb-5">
                        <div>
                          <p className="text-5xl font-bold text-[var(--wm-t1)] tracking-tight tabular-nums leading-none">
                            {fmt$(pgeTotal)}
                          </p>
                          <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                            {pgePrevious ? (
                              <>
                                <span className={`flex items-center gap-0.5 text-sm font-bold px-2 py-0.5 rounded-full ${
                                  pgeDeltaPct < 0 ? "bg-[var(--wm-green-dim)] text-[var(--wm-green-text)]" : "bg-[var(--wm-red-dim)] text-[var(--wm-red-text)]"
                                }`}>
                                  {pgeDeltaPct < 0 ? <ArrowDownRight className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                                  {Math.abs(pgeDeltaPct).toFixed(1)}%
                                </span>
                                <span className="text-sm text-[var(--wm-t3)]">vs previous statement</span>
                              </>
                            ) : (
                              <span className="text-sm text-[var(--wm-t3)]">Upload another PG&amp;E bill to compare statements</span>
                            )}
                          </div>
                        </div>
                        {pgePrevious && (
                          <div className="text-right pb-0.5 shrink-0">
                            <p className="text-[11px] text-[var(--wm-t3)] uppercase tracking-wider font-semibold">
                              {pgeDeltaPct < 0 ? "saved" : "extra"}
                            </p>
                            <p className={`text-2xl font-bold tabular-nums ${pgeDeltaPct < 0 ? "text-[var(--wm-green-text)]" : "text-[var(--wm-red-text)]"}`}>
                              {fmtRound$(pgeSavedAbs)}
                            </p>
                          </div>
                        )}
                      </div>

                      <p className="text-[11px] text-[var(--wm-t3)] mb-2">
                        {pgeCurrent.kWh > 0 && <span className="mr-3">{pgeCurrent.kWh.toLocaleString()} kWh</span>}
                        {pgeCurrent.therms > 0 && <span>{pgeCurrent.therms} therms</span>}
                      </p>

                      <div>
                        <div className="flex h-3 rounded-full overflow-hidden gap-px bg-[var(--wm-border-sub)]">
                          <div className="h-full bg-[#d4993a]" style={{ width: `${pgeElecBarPct}%` }} />
                          <div className="h-full bg-[#6892b0]" style={{ width: `${pgeGasBarPct}%` }} />
                        </div>
                        <div className="flex justify-between mt-2.5 text-[11px]">
                          <div>
                            <p className="font-bold text-[#e8a838]">Electricity</p>
                            <p className="text-[var(--wm-t3)] tabular-nums">{fmtRound$(pgeCurrent.elec)}</p>
                          </div>
                          <div className="text-left md:text-right">
                            <p className="font-bold text-[#6892b0]">Gas</p>
                            <p className="text-[var(--wm-t3)] tabular-nums">{fmtRound$(pgeCurrent.gas)}</p>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-[var(--wm-t3)] py-2">
                      Upload a PG&amp;E PDF — we&apos;ll split it into electricity and gas for this summary.
                    </p>
                  )}
                </div>
              </div>

              {/* ── 1b. HERO — Water (most recent bill, vs prior water bill) ── */}
              {waterHeroCurrent && (
                <div className="bg-[var(--wm-card)] rounded-md border border-[var(--wm-border)] overflow-hidden">
                  <div className="h-1 w-full bg-[var(--wm-border-sub)]" />
                  <div className="px-5 pt-4 pb-5">
                    <p className="text-xs font-bold text-[var(--wm-t3)] uppercase tracking-widest mb-1">
                      Water · Full bill
                    </p>
                    <p className="text-xs text-[var(--wm-t3)] mb-3">
                      {fmtDate(waterHeroCurrent.billingPeriodStart)} – {fmtDate(waterHeroCurrent.billingPeriodEnd)}
                      {waterHeroDays > 0 && (
                        <span className="text-[var(--wm-t3)]"> · {waterHeroDays} days</span>
                      )}
                      {waterHeroDays > 40 && (
                        <span className="ml-1 text-[#47998e] font-semibold">· bimonthly</span>
                      )}
                    </p>

                    <div className="flex items-end justify-between mb-4">
                      <div>
                        <p className="text-5xl font-bold text-[var(--wm-t1)] tracking-tight tabular-nums leading-none">
                          {fmt$(waterHeroTotal)}
                        </p>
                        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                          {waterHeroPrev ? (
                            <>
                              <span className={`flex items-center gap-0.5 text-sm font-bold px-2 py-0.5 rounded-full ${
                                waterHeroDeltaPct < 0 ? "bg-[var(--wm-green-dim)] text-[var(--wm-green-text)]" : "bg-[var(--wm-red-dim)] text-[var(--wm-red-text)]"
                              }`}>
                                {waterHeroDeltaPct < 0 ? <ArrowDownRight className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                                {Math.abs(waterHeroDeltaPct).toFixed(1)}%
                              </span>
                              <span className="text-sm text-[var(--wm-t3)]">vs previous water bill</span>
                            </>
                          ) : (
                            <span className="text-sm text-[var(--wm-t3)]">First water bill on file</span>
                          )}
                        </div>
                      </div>
                      {waterHeroPrev && (
                        <div className="text-right pb-0.5 shrink-0">
                          <p className="text-[11px] text-[var(--wm-t3)] uppercase tracking-wider font-semibold">
                            {waterHeroDeltaPct < 0 ? "saved" : "extra"}
                          </p>
                          <p className={`text-2xl font-bold tabular-nums ${waterHeroDeltaPct < 0 ? "text-[var(--wm-green-text)]" : "text-[var(--wm-red-text)]"}`}>
                            {fmtRound$(waterHeroSavedAbs)}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--wm-t2)]">
                      <span className="font-medium tabular-nums">
                        {waterHeroCurrent.usage} {waterHeroCurrent.usageUnit}
                      </span>
                      <span className="text-[var(--wm-t3)]">
                        {waterHeroCurrent.unitPrice > 0 && (
                          <>${waterHeroCurrent.unitPrice.toFixed(2)}/{waterHeroCurrent.usageUnit}</>
                        )}
                      </span>
                      <span className="text-[var(--wm-t3)]">{waterHeroCurrent.provider}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* ── 2. PER-UTILITY STATUS ── */}
              <div className="bg-[var(--wm-card)] rounded-md border border-[var(--wm-border)] overflow-hidden">
                {([
                  { type: "electricity", icon: <Zap className="w-4 h-4 text-[#e8a838]" />,      bg: "#FEF3C7", label: "Electricity", amount: elecAmount, usage: elecUsageLabel,     rawUsage: elecUsage,              rawUnit: "kWh",    provider: "PG&E",          delta: elecDelta, estLabel: null },
                  { type: "gas",         icon: <Flame className="w-4 h-4 text-[#6892b0]" />,    bg: "#DBEAFE", label: "Gas",         amount: gasAmount,         usage: gasUsageLabel,           rawUsage: gasUsage,   rawUnit: "Therms", provider: "PG&E",          delta: gasDelta,  estLabel: null },
                  { type: "water",       icon: <Droplets className="w-4 h-4 text-[#47998e]" />, bg: "#CFFAFE", label: "Water",       amount: waterAmount, usage: waterUsageLabel,      rawUsage: waterUsage,             rawUnit: "CCF",    provider: waterProvider,   delta: waterDelta, estLabel: waterIsBimonthly ? "bimonthly" : null },
                ] as { type: UtilityFilter; icon: React.ReactNode; bg: string; label: string; amount: number; usage: string; rawUsage: number; rawUnit: string; provider: string; delta: number; estLabel: string | null }[]).map((item, i, arr) => {
                  const equivs = usageEquivalents(item.rawUsage, item.rawUnit);
                  return (
                  <button
                    key={item.type}
                    className={`w-full flex items-center gap-3.5 px-4 py-4 text-left hover:bg-[var(--wm-surface)] active:bg-[var(--wm-border-sub)] transition-colors ${
                      i < arr.length - 1 ? "border-b border-[var(--wm-border-sub)]" : ""
                    }`}
                    onClick={() => { setUtilityFilter(item.type); setView("bills"); }}
                  >
                    <div className="w-10 h-10 rounded-md flex items-center justify-center shrink-0" style={{ background: item.bg }}>
                      {item.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--wm-t1)]">{item.label}</p>
                      <p className="text-xs text-[var(--wm-t3)] mt-0.5">{item.usage} · {item.provider}</p>
                      {equivs.length > 0 && (
                        <p className="text-[11px] text-[var(--wm-t3)] mt-0.5">
                          {equivs[0].icon} {equivs[0].label}
                        </p>
                      )}
                    </div>
                    <div className="text-left md:text-right shrink-0">
                      <p className="text-sm font-bold text-[var(--wm-t1)] tabular-nums">
                        {item.estLabel ? "~" : ""}{fmt$(item.amount)}{item.estLabel ? <span className="text-[10px] font-normal text-[var(--wm-t3)]">/mo</span> : null}
                      </p>
                      {item.estLabel && (
                        <span className="text-[9px] font-semibold text-[#47998e] bg-[rgba(71,153,142,0.12)] px-1.5 py-0.5 rounded">
                          {item.estLabel}
                        </span>
                      )}
                      {!item.estLabel && item.delta !== 0 && <Delta pct={item.delta} size="xs" />}
                    </div>
                    <ChevronRight className="w-4 h-4 text-[var(--wm-t4)] shrink-0" />
                  </button>
                  );
                })}
              </div>

              {/* ── 3. INSIGHT ── */}
              <div className={`rounded-md border px-4 py-3.5 flex gap-3 items-start ${
                insight.color === "emerald"
                  ? "bg-[var(--wm-green-dim)] border-[var(--wm-green-dim)]"
                  : "bg-[var(--wm-amber-dim)] border-[var(--wm-amber-dim)]"
              }`}>
                <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${
                  insight.color === "emerald" ? "bg-[var(--wm-green-dim)]" : "bg-[var(--wm-amber-dim)]"
                }`}>
                  {insight.icon}
                </div>
                <div>
                  <p className={`text-sm font-bold ${insight.color === "emerald" ? "text-[var(--wm-green-text)]" : "text-[#e8a838]"}`}>
                    {insight.headline}
                  </p>
                  <p className={`text-xs mt-0.5 leading-relaxed ${insight.color === "emerald" ? "text-[var(--wm-green-text)]" : "text-[#e8a838]"}`}>
                    {insight.body}
                  </p>
                </div>
              </div>

              {/* ── 4. AVERAGES & BENCHMARKS ── */}
              {monthCount >= 1 && (
              <div className="bg-[var(--wm-card)] rounded-md border border-[var(--wm-border)] overflow-hidden">
                <div className="px-5 pt-4 pb-1 border-b border-[var(--wm-border-sub)]">
                  <h2 className="font-semibold text-[var(--wm-t1)] text-sm">Averages & Benchmarks</h2>
                  <p className="text-xs text-[var(--wm-t3)] mt-0.5">Based on {monthCount} month{monthCount !== 1 ? "s" : ""} of data</p>
                </div>
                <div className="divide-y divide-[var(--wm-border-sub)]">
                  {/* Avg monthly + est annual */}
                  <div className="px-5 py-4 grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[11px] text-[var(--wm-t3)] font-semibold uppercase tracking-wider mb-1">Avg / month</p>
                      <p className="text-2xl font-bold text-[var(--wm-t1)] tabular-nums">{fmtRound$(avgMonthly)}</p>
                      <p className="text-xs text-[var(--wm-t3)] mt-0.5">all utilities</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-[var(--wm-t3)] font-semibold uppercase tracking-wider mb-1">Est. annual</p>
                      <p className="text-2xl font-bold text-[var(--wm-t1)] tabular-nums">{fmtRound$(estAnnual)}</p>
                      <p className="text-xs text-[var(--wm-t3)] mt-0.5">at current rate</p>
                    </div>
                  </div>

                  {/* Per-utility averages */}
                  <div className="px-5 py-3 flex gap-3">
                    {[
                      { label: "Elec avg",  value: avgElec,  color: C.electricity, show: avgElec  > 0 },
                      { label: "Gas avg",   value: avgGas,   color: C.gas,         show: avgGas   > 0 },
                      { label: "Water avg", value: avgWater, color: C.water,       show: avgWater > 0 },
                    ].filter(x => x.show).map(x => (
                      <div key={x.label} className="flex-1 bg-[var(--wm-surface)] rounded-md px-3 py-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: x.color }}>{x.label}</p>
                        <p className="text-base font-bold text-[var(--wm-t1)] tabular-nums">{fmtRound$(x.value)}<span className="text-xs font-normal text-[var(--wm-t3)]">/mo</span></p>
                      </div>
                    ))}
                  </div>

                  {/* Electricity rate vs CA average */}
                  {avgRate > 0 && (
                  <div className="px-5 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-[var(--wm-t2)]">Your avg rate</p>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-[var(--wm-t1)] tabular-nums">${avgRate.toFixed(3)}/kWh</span>
                        <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${
                          avgRate <= CA_AVG_RATE ? "bg-[var(--wm-green-dim)] text-[var(--wm-green-text)]" : "bg-[var(--wm-red-dim)] text-[var(--wm-red-text)]"
                        }`}>
                          {avgRate <= CA_AVG_RATE ? "↓" : "↑"} {Math.abs(((avgRate - CA_AVG_RATE) / CA_AVG_RATE) * 100).toFixed(0)}% vs CA avg
                        </span>
                      </div>
                    </div>
                    <div className="h-2 bg-[var(--wm-border-sub)] rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-[#d4993a]" style={{ width: `${Math.min((avgRate / (CA_AVG_RATE * 1.5)) * 100, 100)}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px] text-[var(--wm-t3)] mt-1">
                      <span>$0</span>
                      <span>CA avg ${CA_AVG_RATE}/kWh</span>
                    </div>
                  </div>
                  )}

                  {/* Best / worst months */}
                  {monthCount >= 2 && bestMonth && worstMonth && (
                  <div className="px-5 py-3 grid grid-cols-2 gap-3">
                    <div className="bg-[var(--wm-green-dim)] rounded-md px-3 py-2.5">
                      <p className="text-[10px] font-semibold text-[var(--wm-green-text)] uppercase tracking-wider mb-1">Cheapest month</p>
                      <p className="text-sm font-bold text-[var(--wm-t1)]">{bestMonth.month}</p>
                      <p className="text-xs text-[var(--wm-t3)] tabular-nums">{fmt$((bestMonth.electricity + bestMonth.gas + bestMonth.water))}</p>
                    </div>
                    <div className="bg-[var(--wm-red-dim)] rounded-md px-3 py-2.5">
                      <p className="text-[10px] font-semibold text-[var(--wm-red-text)] uppercase tracking-wider mb-1">Most expensive</p>
                      <p className="text-sm font-bold text-[var(--wm-t1)]">{worstMonth.month}</p>
                      <p className="text-xs text-[var(--wm-t3)] tabular-nums">{fmt$((worstMonth.electricity + worstMonth.gas + worstMonth.water))}</p>
                    </div>
                  </div>
                  )}
                </div>
              </div>
              )}

              {/* ── 5. RECENT BILLS ── */}
              <div className="bg-[var(--wm-card)] rounded-md border border-[var(--wm-border)] overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3.5 border-b border-[var(--wm-border-sub)]">
                  <h2 className="text-sm font-semibold text-[var(--wm-t1)]">Recent Bills</h2>
                  <button
                    onClick={() => { setUtilityFilter("all"); setView("bills"); }}
                    className="text-xs text-[var(--wm-t3)] hover:text-[var(--wm-t2)] flex items-center gap-0.5 transition-colors font-medium"
                  >
                    View all <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                {allBills.slice(0, 4).map((bill) => (
                  <BillRow key={bill.id} bill={bill} onSelect={setSelectedBillId} />
                ))}
              </div>

              {/* ── 5. TRENDS (below fold) ── */}
              <div className="pt-2">
                <SectionDivider label="Trends & History" />
              </div>

              {/* Monthly spending */}
              <div className="bg-[var(--wm-card)] rounded-md border border-[var(--wm-border)] p-4 md:p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="font-semibold text-[var(--wm-t1)] text-sm">Monthly Spending</h2>
                    <p className="text-xs text-[var(--wm-t3)] mt-0.5">All utilities · 12 months</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-[var(--wm-t3)]">12-mo total</p>
                    <p className="text-base font-bold text-[var(--wm-t1)] tabular-nums">{fmt$(ytdTotal)}</p>
                  </div>
                </div>
                <ClientOnly height="h-52">
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlySpendWithMeta} barSize={16} barCategoryGap="32%">
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={cs.grid} />
                        <XAxis dataKey="month" tick={{ fontSize: 10, fill: cs.axisText }} axisLine={false} tickLine={false} interval={1} />
                        <YAxis tick={{ fontSize: 10, fill: cs.axisText }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} width={34} />
                        <Tooltip content={<ChartTooltip dollar />} cursor={{ fill: cs.cursor, radius: 4 }} />
                        <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 11, color: cs.legendText, paddingTop: 12 }} />
                        <Bar dataKey="electricity" name="Electricity" stackId="a" fill={C.electricity} radius={[0, 0, 0, 0]} fillOpacity={1}
                          shape={(props: any) => {
                            const { x, y, width, height, payload } = props;
                            return <rect x={x} y={y} width={width} height={height} fill={C.electricity} opacity={payload.isComplete ? 1 : 0.4} />;
                          }} />
                        <Bar dataKey="gas" name="Gas" stackId="a" fill={C.gas} radius={[0, 0, 0, 0]} fillOpacity={1}
                          shape={(props: any) => {
                            const { x, y, width, height, payload } = props;
                            return <rect x={x} y={y} width={width} height={height} fill={C.gas} opacity={payload.isComplete ? 1 : 0.4} />;
                          }} />
                        <Bar dataKey="water" name="Water" stackId="a" fill={C.water} radius={[3, 3, 0, 0]} fillOpacity={1}
                          shape={(props: any) => {
                            const { x, y, width, height, payload } = props;
                            const r = 3;
                            return (
                              <path
                                d={`M ${x},${y + r} Q ${x},${y} ${x + r},${y} L ${x + width - r},${y} Q ${x + width},${y} ${x + width},${y + r} L ${x + width},${y + height} L ${x},${y + height} Z`}
                                fill={C.water}
                                opacity={payload.isComplete ? 1 : 0.4}
                              />
                            );
                          }} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </ClientOnly>
              </div>

              {/* Usage + Rate */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-[var(--wm-card)] rounded-md border border-[var(--wm-border)] p-4 md:p-5">
                  <h2 className="font-semibold text-[var(--wm-t1)] text-sm mb-1 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5" style={{ color: C.electricity }} />Electricity Usage
                  </h2>
                  <p className="text-xs text-[var(--wm-t3)] mb-3">Monthly kWh</p>
                  <ClientOnly height="h-44">
                    <div className="h-44">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={usageData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={cs.grid} />
                          <XAxis dataKey="month" tick={{ fontSize: 10, fill: cs.axisText }} axisLine={false} tickLine={false} interval={2} />
                          <YAxis tick={{ fontSize: 10, fill: cs.axisText }} axisLine={false} tickLine={false} domain={[350, 780]} width={34} />
                          <Tooltip contentStyle={{ background: cs.tooltipBg, border: `1px solid ${cs.tooltipBorder}`, borderRadius: "6px", fontSize: 12, color: cs.tooltipText }}
                            formatter={(v) => [`${Number(v)} kWh`, "Usage"]} labelStyle={{ color: cs.tooltipLabel, fontWeight: 600 }} />
                          <ReferenceLine y={550} stroke={cs.refLine} strokeDasharray="4 4"
                            label={{ value: "avg", fill: cs.refLabel, fontSize: 9, position: "insideTopRight" }} />
                          <Line type="monotone" dataKey="kWh" stroke={C.electricity} strokeWidth={2}
                            dot={{ fill: C.electricity, r: 2.5, strokeWidth: 0 }} activeDot={{ r: 4, strokeWidth: 0 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </ClientOnly>
                </div>

                <div className="bg-[var(--wm-card)] rounded-md border border-[var(--wm-border)] p-4 md:p-5">
                  <h2 className="font-semibold text-[var(--wm-t1)] text-sm mb-1 flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />Effective Rate
                  </h2>
                  <p className="text-xs text-[var(--wm-t3)] mb-3">Blended $/kWh · PG&E E-1</p>
                  <ClientOnly height="h-44">
                    <div className="h-44">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={rateData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={cs.grid} />
                          <XAxis dataKey="month" tick={{ fontSize: 10, fill: cs.axisText }} axisLine={false} tickLine={false} interval={2} />
                          <YAxis tick={{ fontSize: 10, fill: cs.axisText }} axisLine={false} tickLine={false}
                            domain={[0.285, 0.32]} tickFormatter={(v) => `$${v.toFixed(2)}`} width={38} />
                          <Tooltip contentStyle={{ background: cs.tooltipBg, border: `1px solid ${cs.tooltipBorder}`, borderRadius: "6px", fontSize: 12, color: cs.tooltipText }}
                            formatter={(v) => [`$${Number(v).toFixed(3)}/kWh`, "Rate"]} labelStyle={{ color: cs.tooltipLabel, fontWeight: 600 }} />
                          <Line type="monotone" dataKey="$/kWh" stroke={C.emerald} strokeWidth={2}
                            dot={{ fill: C.emerald, r: 2.5, strokeWidth: 0 }} activeDot={{ r: 4, strokeWidth: 0 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </ClientOnly>
                </div>
              </div>

              {/* Charge breakdown */}
              <div className="bg-[var(--wm-card)] rounded-md border border-[var(--wm-border)] p-4 md:p-5">
                <h2 className="font-semibold text-[var(--wm-t1)] text-sm mb-1">Electricity Charge Breakdown</h2>
                <p className="text-xs text-[var(--wm-t3)] mb-4">How each line item changed · last 6 months</p>
                <ClientOnly height="h-48">
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chargeBreakdown} barSize={24} barCategoryGap="32%">
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={cs.grid} />
                        <XAxis dataKey="month" tick={{ fontSize: 11, fill: cs.axisText }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: cs.axisText }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} width={34} />
                        <Tooltip content={<ChartTooltip dollar />} cursor={{ fill: cs.cursor, radius: 4 }} />
                        <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 11, color: cs.legendText, paddingTop: 12 }} />
                        <Bar dataKey="Energy"   stackId="a" fill={C.electricity} radius={[0, 0, 0, 0]} />
                        <Bar dataKey="Delivery" stackId="a" fill={C.delivery}    radius={[0, 0, 0, 0]} />
                        <Bar dataKey="Programs" stackId="a" fill={C.programs}    radius={[0, 0, 0, 0]} />
                        <Bar dataKey="Tax"      stackId="a" fill={cs.tax}       radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </ClientOnly>
              </div>

              {/* Gas seasonality */}
              <div className="bg-[var(--wm-card)] rounded-md border border-[var(--wm-border)] p-4 md:p-5">
                <h2 className="font-semibold text-[var(--wm-t1)] text-sm mb-1 flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5" style={{ color: C.gas }} />Gas Seasonality
                </h2>
                <p className="text-xs text-[var(--wm-t3)] mb-4">Therms used and cost breakdown · PG&E G-1</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <ClientOnly height="h-44">
                    <div className="h-44">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={gasData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={cs.grid} />
                          <XAxis dataKey="month" tick={{ fontSize: 10, fill: cs.axisText }} axisLine={false} tickLine={false} interval={2} />
                          <YAxis tick={{ fontSize: 10, fill: cs.axisText }} axisLine={false} tickLine={false} domain={[0, 14]} width={22} />
                          <Tooltip contentStyle={{ background: cs.tooltipBg, border: `1px solid ${cs.tooltipBorder}`, borderRadius: "6px", fontSize: 12, color: cs.tooltipText }}
                            formatter={(v) => [`${Number(v)} therms`, "Usage"]} labelStyle={{ color: cs.tooltipLabel, fontWeight: 600 }} />
                          <Line type="monotone" dataKey="therms" stroke={C.gas} strokeWidth={2}
                            dot={{ fill: C.gas, r: 2.5, strokeWidth: 0 }} activeDot={{ r: 4, strokeWidth: 0 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </ClientOnly>
                  <ClientOnly height="h-44">
                    <div className="h-44">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={gasData} barSize={16} barCategoryGap="32%">
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={cs.grid} />
                          <XAxis dataKey="month" tick={{ fontSize: 10, fill: cs.axisText }} axisLine={false} tickLine={false} interval={2} />
                          <YAxis tick={{ fontSize: 10, fill: cs.axisText }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} width={28} />
                          <Tooltip content={<ChartTooltip dollar />} cursor={{ fill: cs.cursor, radius: 4 }} />
                          <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 11, color: cs.legendText, paddingTop: 12 }} />
                          <Bar dataKey="Commodity" name="Commodity" stackId="a" fill={C.gas}   radius={[0, 0, 0, 0]} />
                          <Bar dataKey="Delivery"  name="Delivery"  stackId="a" fill="#93C5FD" radius={[0, 0, 0, 0]} />
                          <Bar dataKey="Tax"       name="Tax"       stackId="a" fill={cs.tax} radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </ClientOnly>
                </div>
              </div>

            </>)}{/* end hasData wrapper */}

            </div>
          )}

          {/* ══════════════════════ BILLS VIEW ══════════════════════ */}
          {view === "bills" && (
            <div key="bills" className="animate-view-in px-4 md:px-8 py-4 md:py-6 max-w-2xl md:mx-auto">
              <div className="md:hidden mb-4">
                <h1 className="font-bold text-[var(--wm-t1)] text-xl">All Bills</h1>
              </div>
              {/* filter tabs */}
              <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
                {([
                  { id: "all"         as UtilityFilter, label: "All" },
                  { id: "electricity" as UtilityFilter, label: "Electricity", dot: C.electricity },
                  { id: "gas"         as UtilityFilter, label: "Gas",         dot: C.gas },
                  { id: "water"       as UtilityFilter, label: "Water",       dot: C.water },
                ]).map((f) => (
                  <button key={f.id} onClick={() => setUtilityFilter(f.id)}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-semibold whitespace-nowrap transition-colors shrink-0 ${
                      utilityFilter === f.id ? "bg-[#e8a838] text-black" : "bg-[var(--wm-card)] border border-[var(--wm-border)] text-[var(--wm-t3)] hover:bg-[var(--wm-surface)]"
                    }`}>
                    {f.dot && <span className="w-2 h-2 rounded-full" style={{ background: f.dot }} />}
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="bg-[var(--wm-card)] rounded-md border border-[var(--wm-border)] overflow-hidden">
                <div className="px-4 py-3 border-b border-[var(--wm-border-sub)]">
                  <p className="text-xs font-bold text-[var(--wm-t3)] uppercase tracking-wider">{filteredBills.length} bills</p>
                </div>
                {filteredBills.map((bill) => (
                  <BillRow key={bill.id} bill={bill} onSelect={setSelectedBillId} />
                ))}
              </div>
            </div>
          )}

        </main>
      </div>

      {/* ── MOBILE BOTTOM NAV ── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-20 bg-[var(--wm-surface)]/98 border-t border-[var(--wm-border)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="flex">
          {([
            { id: "dashboard" as View, label: "Home",  icon: <LayoutDashboard className="w-5 h-5" /> },
            { id: "bills"     as View, label: "Bills", icon: <FileText className="w-5 h-5" /> },
          ]).map((item) => (
            <button key={item.id} onClick={() => setView(item.id)}
              className={`flex-1 flex flex-col items-center gap-1 py-3 transition-colors ${
                view === item.id ? "text-[#e8a838]" : "text-[var(--wm-t3)]"
              }`}>
              {item.icon}
              <span className="text-[10px] font-bold">{item.label}</span>
            </button>
          ))}
          <button
            onClick={() => setShowUpload(true)}
            className="flex-1 flex flex-col items-center gap-1 py-3 text-[#e8a838] transition-colors"
          >
            <Upload className="w-5 h-5" />
            <span className="text-[10px] font-bold">Upload</span>
          </button>
          <Link
            href="/settings"
            className="flex-1 flex flex-col items-center gap-1 py-3 text-[var(--wm-t3)] hover:text-[var(--wm-t2)] transition-colors"
          >
            <Settings className="w-5 h-5" />
            <span className="text-[10px] font-bold">Settings</span>
          </Link>
        </div>
      </nav>

      {/* ── BILL DETAIL PANEL ── */}
      {selectedBill && (
        <BillDetailPanel
          bill={selectedBill}
          prevBill={prevBill}
          onClose={() => setSelectedBillId(null)}
          onDelete={async (id) => {
            await apiFetch(`/bills/${id}`, { method: "DELETE" });
            setSelectedBillId(null);
            refreshBills();
          }}
        />
      )}

      {/* ── UPLOAD MODAL ── */}
      {showUpload && activeHousehold && (
        <UploadModal
          householdId={activeHousehold.id}
          onClose={() => setShowUpload(false)}
          onSuccess={() => { refreshBills(); }}
        />
      )}
    </div>
  );
}

export default function DashboardPageWrapper() {
  return (
    <Suspense>
      <DashboardPage />
    </Suspense>
  );
}
