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
  LogOut, Settings, Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api/client";
import {
  MONTHLY_SPENDING, ELECTRICITY_MONTHLY, GAS_MONTHLY,
  WATER_MONTHLY, ALL_BILLS,
} from "@/lib/mock-data";
import { useBills, deriveMonthlySpend, deriveElecMonthly, deriveGasMonthly } from "@/lib/use-bills";
import { Bill } from "@/lib/types";

// ─── Colors ──────────────────────────────────────────────────────────────────

const C = {
  electricity: "#F59E0B",
  gas: "#60A5FA",
  water: "#22D3EE",
  delivery: "#FB923C",
  programs: "#A78BFA",
  taxes: "#94A3B8",
  emerald: "#10B981",
};

const CHARGE_COLORS_ELEC = ["#F59E0B", "#FB923C", "#A78BFA", "#94A3B8"];
const CHARGE_COLORS_GAS  = ["#60A5FA", "#93C5FD", "#94A3B8"];
const CHARGE_COLORS_WATER = ["#22D3EE", "#67E8F9", "#A5F3FC", "#94A3B8"];

function chargeColors(type: string) {
  if (type === "gas") return CHARGE_COLORS_GAS;
  if (type === "water") return CHARGE_COLORS_WATER;
  return CHARGE_COLORS_ELEC;
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
    <span className={`inline-flex items-center gap-0.5 font-semibold tabular-nums ${cls} ${good ? "text-emerald-600" : "text-red-500"}`}>
      {good ? <ArrowDownRight className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function UtilityBadge({ type }: { type: string }) {
  const m: Record<string, { cls: string; icon: React.ReactNode; label: string }> = {
    electricity: { cls: "bg-amber-100 text-amber-700 border-amber-200",  icon: <Zap className="w-3 h-3" />,      label: "Electricity" },
    gas:         { cls: "bg-blue-100 text-blue-700 border-blue-200",    icon: <Flame className="w-3 h-3" />,    label: "Gas" },
    water:       { cls: "bg-cyan-100 text-cyan-700 border-cyan-200",    icon: <Droplets className="w-3 h-3" />, label: "Water" },
  };
  const c = m[type] ?? { cls: "bg-slate-100 text-slate-600 border-slate-200", icon: null, label: type };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${c.cls}`}>
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
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-sm min-w-[150px]">
      <p className="font-semibold text-slate-700 mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-3 py-0.5">
          <span className="flex items-center gap-1.5 text-slate-500">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: p.fill ?? p.stroke }} />
            {p.name}
          </span>
          <span className="font-medium text-slate-800 tabular-nums">
            {dollar ? fmt$(p.value) : p.value}
          </span>
        </div>
      ))}
      {payload.length > 1 && dollar && (
        <div className="flex justify-between gap-3 border-t border-slate-100 mt-2 pt-2">
          <span className="text-slate-500">Total</span>
          <span className="font-semibold text-slate-900 tabular-nums">{fmt$(total)}</span>
        </div>
      )}
    </div>
  );
}

// ─── SSR guard ────────────────────────────────────────────────────────────────

function ClientOnly({ children, height }: { children: React.ReactNode; height: string }) {
  const [ok, setOk] = useState(false);
  useEffect(() => setOk(true), []);
  if (!ok) return <div className={`w-full ${height} bg-slate-50 animate-pulse rounded-xl`} />;
  return <>{children}</>;
}

// ─── Section divider ─────────────────────────────────────────────────────────

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 px-1">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">{label}</p>
      <div className="flex-1 h-px bg-slate-200" />
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
  const colors = chargeColors(bill.utilityType);
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
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <aside className="relative flex flex-col bg-white shadow-2xl w-full rounded-t-3xl max-h-[92dvh] md:rounded-none md:max-h-full md:h-full md:w-[420px]">
        {/* drag handle */}
        <div className="md:hidden flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-slate-300 rounded-full" />
        </div>

        {/* header */}
        <div className="px-5 py-3 border-b border-slate-100 flex items-start justify-between shrink-0">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <UtilityBadge type={bill.utilityType} />
              <span className="text-sm text-slate-400 font-medium">{bill.provider}</span>
              {bill.parseStatus === "success" && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">
                  parsed ✓
                </span>
              )}
              {bill.parseStatus === "failed" && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-100">
                  parse failed
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              {fmtDate(bill.billingPeriodStart)} – {fmtDate(bill.billingPeriodEnd)} · {billingDays} days
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 shrink-0">
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
              <div key={k.label} className="bg-slate-50 rounded-xl p-3 text-center">
                <p className="text-base font-semibold text-slate-900 tabular-nums">{k.value}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{k.label}</p>
              </div>
            ))}
          </div>

          {/* Human-scale equivalents */}
          {bill.usage > 0 && usageEquivalents(bill.usage, bill.usageUnit).length > 0 && (
            <div className="bg-slate-50 rounded-2xl px-4 py-3 space-y-1.5">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">That&apos;s roughly…</p>
              {usageEquivalents(bill.usage, bill.usageUnit).map((eq) => (
                <div key={eq.label} className="flex items-center gap-2">
                  <span className="text-base leading-none">{eq.icon}</span>
                  <span className="text-sm font-medium text-slate-700">{eq.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* parse error */}
          {bill.parseError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl p-3">
              <X className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
              <p className="text-xs text-red-700">{bill.parseError}</p>
            </div>
          )}

          {/* charge breakdown */}
          {bill.charges.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Charge Breakdown</h3>
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
                      contentStyle={{ border: "1px solid #E2E8F0", borderRadius: "12px", fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </ClientOnly>
            </div>
            <div className="space-y-2.5 mt-1">
              {bill.charges.map((c, i) => (
                <div key={c.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-600 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: colors[i % colors.length] }} />
                      {c.label}
                    </span>
                    <span className="font-semibold text-slate-800 tabular-nums">{fmt$(c.amount)}</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
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
              <h3 className="text-sm font-semibold text-slate-700 mb-3">vs. Previous Bill</h3>
              <div className="rounded-xl border border-slate-100 divide-y divide-slate-100 overflow-hidden">
                {[
                  { label: "Total", curr: fmt$(bill.totalAmount), prev: fmt$(prevBill.totalAmount), delta: totalDelta },
                  { label: "Usage", curr: `${bill.usage} ${bill.usageUnit}`, prev: `${prevBill.usage} ${prevBill.usageUnit}`, delta: usageDelta },
                  { label: "Rate",  curr: bill.unitPrice > 0 ? `$${bill.unitPrice.toFixed(3)}` : "—", prev: prevBill.unitPrice > 0 ? `$${prevBill.unitPrice.toFixed(3)}` : "—", delta: rateDelta },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs text-slate-500">{row.label}</span>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-slate-300 line-through tabular-nums">{row.prev}</span>
                      <span className="font-semibold text-slate-800 tabular-nums">{row.curr}</span>
                      {row.delta !== undefined && <Delta pct={row.delta} size="xs" />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* raw fields — always visible for debugging */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Raw data</h3>
            <div className="rounded-xl border border-slate-100 divide-y divide-slate-50 overflow-hidden text-xs">
              {[
                { label: "Bill ID",      value: bill.id },
                { label: "Household",    value: bill.householdId },
                { label: "Uploaded",     value: new Date(bill.uploadedAt).toLocaleString() },
                { label: "Storage ref",  value: bill.storageRef },
                { label: "Parse status", value: bill.parseStatus ?? "—" },
              ].map((r) => (
                <div key={r.label} className="flex items-start justify-between gap-3 px-4 py-2.5">
                  <span className="text-slate-400 shrink-0">{r.label}</span>
                  <span className="text-slate-700 font-mono text-right break-all">{r.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* PDF */}
          <div className="border border-slate-100 rounded-2xl p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4 text-slate-400" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-700">Original PDF</p>
                <p className="text-[11px] text-slate-400 font-mono truncate">{bill.storageRef.split("/").pop()}</p>
              </div>
            </div>
            <button
              onClick={handleViewPdf}
              disabled={pdfLoading}
              className="shrink-0 text-xs font-semibold text-blue-500 hover:text-blue-600 disabled:opacity-50 transition-colors"
            >
              {pdfLoading ? "Opening…" : "View →"}
            </button>
          </div>

          {/* delete zone */}
          <div className="pt-1 pb-2">
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-red-100 text-red-500 hover:bg-red-50 text-sm font-medium transition-colors"
              >
                <Trash2 className="w-4 h-4" /> Delete this bill
              </button>
            ) : (
              <div className="bg-red-50 border border-red-100 rounded-2xl p-4 space-y-3">
                <p className="text-sm font-semibold text-red-700 text-center">Delete this bill?</p>
                <p className="text-xs text-red-600 text-center">This removes the record and the stored PDF. This cannot be undone.</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex-1 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold disabled:opacity-60 transition-colors"
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
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm px-0 md:px-4">
      <div className="w-full md:max-w-md bg-white rounded-t-3xl md:rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-900 text-base">Upload a bill</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          {/* Drop zone */}
          {state.phase === "idle" && (
            <button
              className={`w-full border-2 border-dashed rounded-2xl p-8 flex flex-col items-center gap-3 transition-all cursor-pointer ${
                dragging ? "border-amber-400 bg-amber-50" : "border-slate-200 hover:border-amber-300 hover:bg-slate-50"
              }`}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center">
                <Upload className="w-6 h-6 text-amber-500" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-slate-800 text-sm">Drop your PDF here</p>
                <p className="text-xs text-slate-400 mt-1">or click to browse · PG&amp;E bills only for now</p>
              </div>
              <input ref={inputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={onInputChange} />
            </button>
          )}

          {/* Uploading */}
          {state.phase === "uploading" && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="w-10 h-10 border-[3px] border-slate-100 border-t-amber-400 rounded-full animate-spin" />
              <div className="text-center">
                <p className="font-semibold text-slate-800 text-sm">Parsing {state.filename}…</p>
                <p className="text-xs text-slate-400 mt-1">Extracting bill data, this takes a few seconds</p>
              </div>
            </div>
          )}

          {/* Success */}
          {state.phase === "success" && (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
                <Check className="w-6 h-6 text-emerald-600" />
              </div>
              <p className="font-bold text-slate-900">{state.count} bill{state.count !== 1 ? "s" : ""} added</p>
              <p className="text-xs text-slate-400">Dashboard is updating…</p>
            </div>
          )}

          {/* Error */}
          {state.phase === "error" && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 bg-red-50 border border-red-100 rounded-2xl p-4">
                <X className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-sm text-red-700">{state.message}</p>
              </div>
              <button
                onClick={() => setState({ phase: "idle" })}
                className="w-full py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Try another file
              </button>
            </div>
          )}

          {state.phase === "idle" && (
            <p className="text-center text-xs text-slate-400">
              Your PDF is stored securely and never shared.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Bill row (card-style, mobile-first) ─────────────────────────────────────

function BillRow({ bill, onSelect }: { bill: Bill; onSelect: (id: string) => void }) {
  const iconBg = bill.utilityType === "electricity" ? "#FEF3C7" : bill.utilityType === "gas" ? "#DBEAFE" : "#CFFAFE";
  return (
    <button
      className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-slate-50 last:border-0 hover:bg-slate-50/80 active:bg-slate-100 transition-colors text-left"
      onClick={() => onSelect(bill.id)}
    >
      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: iconBg }}>
        {bill.utilityType === "electricity" && <Zap className="w-4 h-4 text-amber-600" />}
        {bill.utilityType === "gas" && <Flame className="w-4 h-4 text-blue-600" />}
        {bill.utilityType === "water" && <Droplets className="w-4 h-4 text-cyan-600" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800">{bill.provider}</p>
        <p className="text-xs text-slate-400 mt-0.5 truncate">
          {fmtDateShort(bill.billingPeriodStart)} – {fmtDate(bill.billingPeriodEnd)} · {bill.usage} {bill.usageUnit}
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-sm font-semibold text-slate-900 tabular-nums">{fmt$(bill.totalAmount)}</span>
        <ChevronRight className="w-4 h-4 text-slate-300" />
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
      <div className="absolute left-0 right-0 top-full mt-1 z-40 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden">
        {households.map((h) => (
          <button
            key={h.id}
            onClick={() => { onSelect(h.id); onClose(); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 transition-colors text-left"
          >
            <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
              <HomeIcon className="w-3.5 h-3.5 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">{h.nickname}</p>
              {h.address && <p className="text-xs text-slate-400 truncate">{h.address}</p>}
            </div>
            {h.id === currentId && <Check className="w-4 h-4 text-amber-500 shrink-0" />}
          </button>
        ))}
        <div className="border-t border-slate-100">
          <button
            onClick={() => { onAdd(); onClose(); }}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-amber-600 hover:bg-amber-50 transition-colors"
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

  // Latest bill across all utilities — drives the "hero" period label
  const latestBill = [...allBills].sort(
    (a, b) => new Date(b.billingPeriodEnd).getTime() - new Date(a.billingPeriodEnd).getTime()
  )[0];

  // Current + previous month (last two entries in derived data)
  const cur = monthlySpend[monthlySpend.length - 1] ?? { month: "", electricity: 0, gas: 0, water: 0, total: 0 };
  const prv = monthlySpend[monthlySpend.length - 2] ?? { month: "", electricity: 0, gas: 0, water: 0, total: 0 };
  const curTotal = cur.electricity + cur.gas + cur.water;
  const prvTotal = prv.electricity + prv.gas + prv.water;
  const totalDeltaPct = prvTotal > 0 ? ((curTotal - prvTotal) / prvTotal) * 100 : 0;
  const savedAbs = Math.abs(curTotal - prvTotal);

  const curElec = elecMonthly[elecMonthly.length - 1] ?? { rate: 0, kWh: 0, total: 0 };
  const prvElec = elecMonthly[elecMonthly.length - 2] ?? { rate: 0, kWh: 0, total: 0 };
  const elecDelta  = prv.electricity > 0 ? ((cur.electricity - prv.electricity) / prv.electricity) * 100 : 0;
  const gasDelta   = prv.gas > 0         ? ((cur.gas - prv.gas) / prv.gas) * 100                         : 0;
  const waterDelta = prv.water > 0       ? ((cur.water - prv.water) / prv.water) * 100                   : 0;
  const rateDelta  = prvElec.rate > 0    ? ((curElec.rate - prvElec.rate) / prvElec.rate) * 100           : 0;

  // Proportion bar widths
  const elecPct  = curTotal > 0 ? (cur.electricity / curTotal) * 100 : 0;
  const gasPct   = curTotal > 0 ? (cur.gas / curTotal) * 100         : 0;

  // Insights — pick most notable
  const insights: { icon: React.ReactNode; color: string; headline: string; body: string }[] = [];
  if (gasDelta < -8) {
    insights.push({
      icon: <Leaf className="w-4 h-4 text-emerald-600" />,
      color: "emerald",
      headline: `Gas down ${Math.abs(gasDelta).toFixed(0)}% from February`,
      body: "Heating season winding down — expect it to keep falling through May.",
    });
  }
  if (rateDelta > 1) {
    insights.push({
      icon: <Zap className="w-4 h-4 text-amber-600" />,
      color: "amber",
      headline: `PG&E rate up ${rateDelta.toFixed(1)}% this cycle`,
      body: `Adjusted from $${prvElec.rate.toFixed(3)} to $${curElec.rate.toFixed(3)}/kWh.`,
    });
  }
  if (insights.length === 0) {
    insights.push({
      icon: <TrendingDown className="w-4 h-4 text-emerald-600" />,
      color: "emerald",
      headline: `Bills ${Math.abs(totalDeltaPct).toFixed(1)}% lower than last month`,
      body: "All three utilities came in under their February totals.",
    });
  }
  const insight = insights[0];

  // Chart data
  const ytdTotal = monthlySpend.reduce((s, m) => s + m.electricity + m.gas + m.water, 0);

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

  // ── Big-picture averages ──────────────────────────────────────────────────
  const monthCount   = monthlySpend.length;
  const avgMonthly   = monthCount > 0 ? ytdTotal / monthCount : 0;
  const estAnnual    = avgMonthly * 12;
  const avgElec      = monthCount > 0 ? monthlySpend.reduce((s, m) => s + m.electricity, 0) / monthCount : 0;
  const avgGas       = monthCount > 0 ? monthlySpend.reduce((s, m) => s + m.gas, 0) / monthCount : 0;
  const avgRate      = liveBills.filter(b => b.utilityType === "electricity" && b.unitPrice > 0)
                         .reduce((s, b, _, a) => s + b.unitPrice / a.length, 0);
  const CA_AVG_RATE  = 0.27; // CA average $/kWh as of 2024
  const bestMonth    = [...monthlySpend].sort((a, b) => (a.electricity + a.gas + a.water) - (b.electricity + b.gas + b.water))[0];
  const worstMonth   = [...monthlySpend].sort((a, b) => (b.electricity + b.gas + b.water) - (a.electricity + a.gas + a.water))[0];

  const filteredBills = utilityFilter === "all"
    ? allBills
    : allBills.filter((b) => b.utilityType === utilityFilter);

  // Current month gas/water usage label
  const latestGasBill   = [...allBills].filter(b => b.utilityType === "gas").sort((a,b) => b.billingPeriodEnd.localeCompare(a.billingPeriodEnd)).at(0);
  const latestWaterBill = [...allBills].filter(b => b.utilityType === "water").sort((a,b) => b.billingPeriodEnd.localeCompare(a.billingPeriodEnd)).at(0);
  const gasUsageLabel   = latestGasBill   ? `${latestGasBill.usage} ${latestGasBill.usageUnit}`     : "—";
  const waterUsageLabel = latestWaterBill ? `${latestWaterBill.usage} ${latestWaterBill.usageUnit}` : "—";

  // Guard — all hooks above, conditional returns below
  if (!isDemo && (authLoading || !activeHousehold)) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#F8FAFC]">
        <div className="w-8 h-8 border-2 border-slate-200 border-t-amber-400 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-dvh bg-[#F8FAFC] md:flex-row md:h-dvh md:overflow-hidden">

      {/* ── DESKTOP SIDEBAR ── */}
      <aside className="hidden md:flex w-56 bg-white border-r border-slate-200 flex-col shrink-0">
        <div className="px-4 py-5 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-amber-500 rounded-lg flex items-center justify-center shadow-sm">
              <Zap className="w-4 h-4 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-semibold text-slate-800 text-sm tracking-tight">whatismybill</span>
          </div>
        </div>
        <div className="px-3 py-3 border-b border-slate-100 relative">
          <button
            onClick={() => setShowHouseholdPicker(!showHouseholdPicker)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors text-left"
          >
            <div className="w-6 h-6 rounded-full bg-linear-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0">
              <HomeIcon className="w-3 h-3 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-700 truncate">{activeHousehold.nickname}</p>
              <p className="text-[10px] text-slate-400 truncate">{activeHousehold.address ?? "Add address"}</p>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${showHouseholdPicker ? "rotate-180" : ""}`} />
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
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-colors ${
                view === item.id ? "bg-slate-900 text-white font-medium" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
              }`}>
              {item.icon}{item.label}
            </button>
          ))}
          <div className="pt-4 pb-1">
            <p className="px-3 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Utilities</p>
          </div>
          {([
            { id: "electricity" as UtilityFilter, label: "Electricity", icon: <Zap className="w-3.5 h-3.5" />,      cls: "text-amber-600 bg-amber-50" },
            { id: "gas"         as UtilityFilter, label: "Gas",         icon: <Flame className="w-3.5 h-3.5" />,    cls: "text-blue-600 bg-blue-50" },
            { id: "water"       as UtilityFilter, label: "Water",       icon: <Droplets className="w-3.5 h-3.5" />, cls: "text-cyan-600 bg-cyan-50" },
          ]).map((u) => (
            <button key={u.id} onClick={() => { setUtilityFilter(u.id); setView("bills"); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-colors ${
                utilityFilter === u.id && view === "bills" ? `${u.cls} font-medium` : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
              }`}>
              <span className={utilityFilter === u.id && view === "bills" ? "" : "text-slate-400"}>{u.icon}</span>
              {u.label}
            </button>
          ))}
        </nav>
        <div className="px-3 pb-4 space-y-2">
          <button
            onClick={() => setShowUpload(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm">
            <Upload className="w-4 h-4" />Upload Bill
          </button>
          <Link
            href="/settings"
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl text-xs font-medium transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />Home settings
          </Link>
          {user ? (
            <button
              onClick={() => { signOut(); router.push("/login"); }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl text-xs font-medium transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />Sign out
            </button>
          ) : (
            <Link
              href="/login"
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl text-xs font-medium transition-colors"
            >
              Sign in
            </Link>
          )}
        </div>
      </aside>

      {/* ── CONTENT COLUMN ── */}
      <div className="flex flex-col flex-1 min-h-0 md:h-dvh md:overflow-hidden">

        {/* Mobile topbar */}
        <div className="md:hidden sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b border-slate-200">
          <div className="flex items-center justify-between px-4 py-3">
            {/* Brand + household switcher */}
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-amber-500 rounded-lg flex items-center justify-center shrink-0">
                <Zap className="w-4 h-4 text-white" strokeWidth={2.5} />
              </div>
              <div className="relative">
                <button
                  onClick={() => setShowHouseholdPicker(!showHouseholdPicker)}
                  className="flex items-center gap-1 text-sm font-semibold text-slate-800"
                >
                  {activeHousehold.nickname}
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${showHouseholdPicker ? "rotate-180" : ""}`} />
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
            <button className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors">
              <Upload className="w-3.5 h-3.5" />Upload
            </button>
          </div>
        </div>

        {/* Demo mode banner */}
        {isDemo && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between">
            <p className="text-xs text-amber-700 font-medium">Viewing sample data — <Link href="/" className="underline underline-offset-2">exit demo</Link></p>
          </div>
        )}

        {/* Desktop topbar */}
        <div className="hidden md:flex sticky top-0 z-10 bg-white/70 backdrop-blur-md border-b border-slate-200/80 px-8 py-4 items-center justify-between shrink-0">
          <div>
            <h1 className="font-semibold text-slate-900">{view === "dashboard" ? "Dashboard" : "All Bills"}</h1>
            <p className="text-xs text-slate-400 mt-0.5">Apr 2025 – Mar 2026 · {activeHousehold.nickname}</p>
          </div>
          <span className="text-xs text-slate-400 bg-slate-100 px-3 py-1.5 rounded-lg font-medium">Last 12 months</span>
        </div>

        {/* Scrollable main */}
        <main className="flex-1 overflow-y-auto pb-24 md:pb-0">

          {/* ══════════════════════ DASHBOARD VIEW ══════════════════════ */}
          {view === "dashboard" && (
            <div className="max-w-2xl md:mx-auto px-4 md:px-8 py-4 md:py-6 space-y-4">

              {/* ── LOADING STATE ── */}
              {billsLoading && !isDemo && (
                <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
                  <div className="w-8 h-8 border-2 border-slate-200 border-t-amber-400 rounded-full animate-spin" />
                  <p className="text-sm">Loading your bills…</p>
                </div>
              )}

              {/* ── EMPTY STATE ── */}
              {!billsLoading && !hasData && !isDemo && (
                <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                  <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center mb-5">
                    <FileText className="w-8 h-8 text-amber-400" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 mb-2">No bills yet</h2>
                  <p className="text-slate-500 text-sm max-w-xs mb-6">
                    Upload your first utility bill PDF and we&apos;ll parse it into clean, comparable data.
                  </p>
                  <button
                    onClick={() => setShowUpload(true)}
                    className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors shadow-sm">
                    <Upload className="w-4 h-4" /> Upload a bill
                  </button>
                  <Link href="/demo" className="mt-4 text-xs text-slate-400 hover:text-slate-600 transition-colors underline underline-offset-2">
                    Preview with sample data
                  </Link>
                </div>
              )}

              {/* ── DASHBOARD CONTENT (only shown when there&apos;s data) ── */}
              {(hasData || isDemo) && !billsLoading && (<>

              {/* ── 1. HERO ── */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                {/* amber accent bar */}
                <div className="h-1 w-full bg-linear-to-r from-amber-400 via-amber-300 to-cyan-300" />

                <div className="px-5 pt-4 pb-5">
                  {/* period label */}
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                    {isDemo
                      ? "March 2026 · Current billing cycle"
                      : latestBill
                        ? `${fmtDate(latestBill.billingPeriodStart)} – ${fmtDate(latestBill.billingPeriodEnd)} · Most recent bill`
                        : cur.month}
                  </p>

                  {/* big total + delta */}
                  <div className="flex items-end justify-between mb-5">
                    <div>
                      <p className="text-5xl font-bold text-slate-900 tracking-tight tabular-nums leading-none">
                        {fmt$(curTotal)}
                      </p>
                      <div className="flex items-center gap-2 mt-2.5">
                        {prv.month ? (
                          <>
                            <span className={`flex items-center gap-0.5 text-sm font-bold px-2 py-0.5 rounded-full ${
                              totalDeltaPct < 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
                            }`}>
                              {totalDeltaPct < 0 ? <ArrowDownRight className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                              {Math.abs(totalDeltaPct).toFixed(1)}%
                            </span>
                            <span className="text-sm text-slate-400">vs {prv.month}</span>
                          </>
                        ) : (
                          <span className="text-sm text-slate-400">First bill — upload more to compare</span>
                        )}
                      </div>
                    </div>
                    {prv.month && (
                    <div className="text-right pb-0.5">
                      <p className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
                        {totalDeltaPct < 0 ? "saved" : "extra"}
                      </p>
                      <p className={`text-2xl font-bold tabular-nums ${totalDeltaPct < 0 ? "text-emerald-600" : "text-red-500"}`}>
                        {fmtRound$((savedAbs))}
                      </p>
                    </div>
                    )}
                  </div>

                  {/* proportion bar */}
                  <div>
                    <div className="flex h-3 rounded-full overflow-hidden gap-px bg-slate-100">
                      <div className="h-full bg-amber-400" style={{ width: `${elecPct}%` }} />
                      <div className="h-full bg-blue-400" style={{ width: `${gasPct}%` }} />
                      <div className="h-full bg-cyan-400 flex-1" />
                    </div>
                    <div className="flex mt-2.5 text-[11px]">
                      <div style={{ width: `${elecPct}%` }} className="min-w-0">
                        <p className="font-bold text-amber-600 truncate">Electricity</p>
                        <p className="text-slate-400 tabular-nums">{fmtRound$(cur.electricity)}</p>
                      </div>
                      <div style={{ width: `${gasPct}%` }} className="min-w-0 px-1">
                        <p className="font-bold text-blue-600 truncate">Gas</p>
                        <p className="text-slate-400 tabular-nums">{fmtRound$(cur.gas)}</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-cyan-600 truncate">Water</p>
                        <p className="text-slate-400 tabular-nums">{fmtRound$(cur.water)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── 2. PER-UTILITY STATUS ── */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                {([
                  { type: "electricity", icon: <Zap className="w-4 h-4 text-amber-600" />,      bg: "#FEF3C7", label: "Electricity", amount: cur.electricity, usage: `${curElec.kWh} kWh`,     rawUsage: curElec.kWh,              rawUnit: "kWh",    provider: "PG&E",         delta: elecDelta },
                  { type: "gas",         icon: <Flame className="w-4 h-4 text-blue-600" />,    bg: "#DBEAFE", label: "Gas",         amount: cur.gas,         usage: gasUsageLabel,           rawUsage: latestGasBill?.usage ?? 0,   rawUnit: "Therms", provider: "PG&E",         delta: gasDelta },
                  { type: "water",       icon: <Droplets className="w-4 h-4 text-cyan-600" />, bg: "#CFFAFE", label: "Water",       amount: cur.water,       usage: waterUsageLabel,         rawUsage: latestWaterBill?.usage ?? 0, rawUnit: latestWaterBill?.usageUnit ?? "CCF", provider: "East Bay MUD", delta: waterDelta },
                ] as { type: UtilityFilter; icon: React.ReactNode; bg: string; label: string; amount: number; usage: string; rawUsage: number; rawUnit: string; provider: string; delta: number }[]).map((item, i, arr) => {
                  const equivs = usageEquivalents(item.rawUsage, item.rawUnit);
                  return (
                  <button
                    key={item.type}
                    className={`w-full flex items-center gap-3.5 px-4 py-4 text-left hover:bg-slate-50 active:bg-slate-100 transition-colors ${
                      i < arr.length - 1 ? "border-b border-slate-100" : ""
                    }`}
                    onClick={() => { setUtilityFilter(item.type); setView("bills"); }}
                  >
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: item.bg }}>
                      {item.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{item.label}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{item.usage} · {item.provider}</p>
                      {equivs.length > 0 && (
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {equivs[0].icon} {equivs[0].label}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-slate-900 tabular-nums">{fmt$(item.amount)}</p>
                      <Delta pct={item.delta} size="xs" />
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-200 shrink-0" />
                  </button>
                  );
                })}
              </div>

              {/* ── 3. INSIGHT ── */}
              <div className={`rounded-2xl border px-4 py-3.5 flex gap-3 items-start ${
                insight.color === "emerald"
                  ? "bg-emerald-50 border-emerald-100"
                  : "bg-amber-50 border-amber-100"
              }`}>
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                  insight.color === "emerald" ? "bg-emerald-100" : "bg-amber-100"
                }`}>
                  {insight.icon}
                </div>
                <div>
                  <p className={`text-sm font-bold ${insight.color === "emerald" ? "text-emerald-800" : "text-amber-800"}`}>
                    {insight.headline}
                  </p>
                  <p className={`text-xs mt-0.5 leading-relaxed ${insight.color === "emerald" ? "text-emerald-700" : "text-amber-700"}`}>
                    {insight.body}
                  </p>
                </div>
              </div>

              {/* ── 4. AVERAGES & BENCHMARKS ── */}
              {monthCount >= 1 && (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-5 pt-4 pb-1 border-b border-slate-100">
                  <h2 className="font-semibold text-slate-800 text-sm">Averages & Benchmarks</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Based on {monthCount} month{monthCount !== 1 ? "s" : ""} of data</p>
                </div>
                <div className="divide-y divide-slate-50">
                  {/* Avg monthly + est annual */}
                  <div className="px-5 py-4 grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider mb-1">Avg / month</p>
                      <p className="text-2xl font-bold text-slate-900 tabular-nums">{fmtRound$(avgMonthly)}</p>
                      <p className="text-xs text-slate-400 mt-0.5">all utilities</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider mb-1">Est. annual</p>
                      <p className="text-2xl font-bold text-slate-900 tabular-nums">{fmtRound$(estAnnual)}</p>
                      <p className="text-xs text-slate-400 mt-0.5">at current rate</p>
                    </div>
                  </div>

                  {/* Per-utility averages */}
                  <div className="px-5 py-3 flex gap-3">
                    {[
                      { label: "Elec avg",  value: avgElec, color: C.electricity, show: avgElec > 0 },
                      { label: "Gas avg",   value: avgGas,  color: C.gas,         show: avgGas  > 0 },
                    ].filter(x => x.show).map(x => (
                      <div key={x.label} className="flex-1 bg-slate-50 rounded-xl px-3 py-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: x.color }}>{x.label}</p>
                        <p className="text-base font-bold text-slate-900 tabular-nums">{fmtRound$(x.value)}<span className="text-xs font-normal text-slate-400">/mo</span></p>
                      </div>
                    ))}
                  </div>

                  {/* Electricity rate vs CA average */}
                  {avgRate > 0 && (
                  <div className="px-5 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-slate-600">Your avg rate</p>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900 tabular-nums">${avgRate.toFixed(3)}/kWh</span>
                        <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${
                          avgRate <= CA_AVG_RATE ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
                        }`}>
                          {avgRate <= CA_AVG_RATE ? "↓" : "↑"} {Math.abs(((avgRate - CA_AVG_RATE) / CA_AVG_RATE) * 100).toFixed(0)}% vs CA avg
                        </span>
                      </div>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-amber-400" style={{ width: `${Math.min((avgRate / (CA_AVG_RATE * 1.5)) * 100, 100)}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                      <span>$0</span>
                      <span>CA avg ${CA_AVG_RATE}/kWh</span>
                    </div>
                  </div>
                  )}

                  {/* Best / worst months */}
                  {monthCount >= 2 && bestMonth && worstMonth && (
                  <div className="px-5 py-3 grid grid-cols-2 gap-3">
                    <div className="bg-emerald-50 rounded-xl px-3 py-2.5">
                      <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider mb-1">Cheapest month</p>
                      <p className="text-sm font-bold text-slate-900">{bestMonth.month}</p>
                      <p className="text-xs text-slate-500 tabular-nums">{fmt$((bestMonth.electricity + bestMonth.gas + bestMonth.water))}</p>
                    </div>
                    <div className="bg-red-50 rounded-xl px-3 py-2.5">
                      <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wider mb-1">Most expensive</p>
                      <p className="text-sm font-bold text-slate-900">{worstMonth.month}</p>
                      <p className="text-xs text-slate-500 tabular-nums">{fmt$((worstMonth.electricity + worstMonth.gas + worstMonth.water))}</p>
                    </div>
                  </div>
                  )}
                </div>
              </div>
              )}

              {/* ── 5. RECENT BILLS ── */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100">
                  <h2 className="text-sm font-semibold text-slate-800">Recent Bills</h2>
                  <button
                    onClick={() => { setUtilityFilter("all"); setView("bills"); }}
                    className="text-xs text-slate-400 hover:text-slate-700 flex items-center gap-0.5 transition-colors font-medium"
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
              <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="font-semibold text-slate-800 text-sm">Monthly Spending</h2>
                    <p className="text-xs text-slate-400 mt-0.5">All utilities · 12 months</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-slate-400">12-mo total</p>
                    <p className="text-base font-bold text-slate-800 tabular-nums">{fmt$(ytdTotal)}</p>
                  </div>
                </div>
                <ClientOnly height="h-52">
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlySpend} barSize={16} barCategoryGap="32%">
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                        <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} interval={1} />
                        <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} width={34} />
                        <Tooltip content={<ChartTooltip dollar />} cursor={{ fill: "#F8FAFC", radius: 4 }} />
                        <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 11, color: "#64748B", paddingTop: 12 }} />
                        <Bar dataKey="electricity" name="Electricity" stackId="a" fill={C.electricity} radius={[0, 0, 0, 0]} />
                        <Bar dataKey="gas"         name="Gas"         stackId="a" fill={C.gas}         radius={[0, 0, 0, 0]} />
                        <Bar dataKey="water"       name="Water"       stackId="a" fill={C.water}       radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </ClientOnly>
              </div>

              {/* Usage + Rate */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5">
                  <h2 className="font-semibold text-slate-800 text-sm mb-1 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5" style={{ color: C.electricity }} />Electricity Usage
                  </h2>
                  <p className="text-xs text-slate-400 mb-3">Monthly kWh</p>
                  <ClientOnly height="h-44">
                    <div className="h-44">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={usageData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                          <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} interval={2} />
                          <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} domain={[350, 780]} width={34} />
                          <Tooltip contentStyle={{ border: "1px solid #E2E8F0", borderRadius: "12px", fontSize: 12 }}
                            formatter={(v) => [`${Number(v)} kWh`, "Usage"]} labelStyle={{ color: "#475569", fontWeight: 600 }} />
                          <ReferenceLine y={550} stroke="#E2E8F0" strokeDasharray="4 4"
                            label={{ value: "avg", fill: "#CBD5E1", fontSize: 9, position: "insideTopRight" }} />
                          <Line type="monotone" dataKey="kWh" stroke={C.electricity} strokeWidth={2}
                            dot={{ fill: C.electricity, r: 2.5, strokeWidth: 0 }} activeDot={{ r: 4, strokeWidth: 0 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </ClientOnly>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5">
                  <h2 className="font-semibold text-slate-800 text-sm mb-1 flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />Effective Rate
                  </h2>
                  <p className="text-xs text-slate-400 mb-3">Blended $/kWh · PG&E E-1</p>
                  <ClientOnly height="h-44">
                    <div className="h-44">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={rateData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                          <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} interval={2} />
                          <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false}
                            domain={[0.285, 0.32]} tickFormatter={(v) => `$${v.toFixed(2)}`} width={38} />
                          <Tooltip contentStyle={{ border: "1px solid #E2E8F0", borderRadius: "12px", fontSize: 12 }}
                            formatter={(v) => [`$${Number(v).toFixed(3)}/kWh`, "Rate"]} labelStyle={{ color: "#475569", fontWeight: 600 }} />
                          <Line type="monotone" dataKey="$/kWh" stroke={C.emerald} strokeWidth={2}
                            dot={{ fill: C.emerald, r: 2.5, strokeWidth: 0 }} activeDot={{ r: 4, strokeWidth: 0 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </ClientOnly>
                </div>
              </div>

              {/* Charge breakdown */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5">
                <h2 className="font-semibold text-slate-800 text-sm mb-1">Electricity Charge Breakdown</h2>
                <p className="text-xs text-slate-400 mb-4">How each line item changed · last 6 months</p>
                <ClientOnly height="h-48">
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chargeBreakdown} barSize={24} barCategoryGap="32%">
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                        <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} width={34} />
                        <Tooltip content={<ChartTooltip dollar />} cursor={{ fill: "#F8FAFC", radius: 4 }} />
                        <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 11, color: "#64748B", paddingTop: 12 }} />
                        <Bar dataKey="Energy"   stackId="a" fill={C.electricity} radius={[0, 0, 0, 0]} />
                        <Bar dataKey="Delivery" stackId="a" fill={C.delivery}    radius={[0, 0, 0, 0]} />
                        <Bar dataKey="Programs" stackId="a" fill={C.programs}    radius={[0, 0, 0, 0]} />
                        <Bar dataKey="Tax"      stackId="a" fill={C.taxes}       radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </ClientOnly>
              </div>

              {/* Gas seasonality */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5">
                <h2 className="font-semibold text-slate-800 text-sm mb-1 flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5" style={{ color: C.gas }} />Gas Seasonality
                </h2>
                <p className="text-xs text-slate-400 mb-4">Therms used and cost breakdown · PG&E G-1</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <ClientOnly height="h-44">
                    <div className="h-44">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={gasData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                          <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} interval={2} />
                          <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} domain={[0, 14]} width={22} />
                          <Tooltip contentStyle={{ border: "1px solid #E2E8F0", borderRadius: "12px", fontSize: 12 }}
                            formatter={(v) => [`${Number(v)} therms`, "Usage"]} labelStyle={{ color: "#475569", fontWeight: 600 }} />
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
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                          <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} interval={2} />
                          <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} width={28} />
                          <Tooltip content={<ChartTooltip dollar />} cursor={{ fill: "#F8FAFC", radius: 4 }} />
                          <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 11, color: "#64748B", paddingTop: 12 }} />
                          <Bar dataKey="Commodity" name="Commodity" stackId="a" fill={C.gas}   radius={[0, 0, 0, 0]} />
                          <Bar dataKey="Delivery"  name="Delivery"  stackId="a" fill="#93C5FD" radius={[0, 0, 0, 0]} />
                          <Bar dataKey="Tax"       name="Tax"       stackId="a" fill={C.taxes} radius={[3, 3, 0, 0]} />
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
            <div className="px-4 md:px-8 py-4 md:py-6 max-w-2xl md:mx-auto">
              <div className="md:hidden mb-4">
                <h1 className="font-bold text-slate-900 text-xl">All Bills</h1>
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
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors shrink-0 ${
                      utilityFilter === f.id ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-500 hover:bg-slate-50"
                    }`}>
                    {f.dot && <span className="w-2 h-2 rounded-full" style={{ background: f.dot }} />}
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{filteredBills.length} bills</p>
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
        className="md:hidden fixed bottom-0 left-0 right-0 z-20 bg-white/95 backdrop-blur-lg border-t border-slate-200"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="flex">
          {([
            { id: "dashboard" as View, label: "Home",  icon: <LayoutDashboard className="w-5 h-5" /> },
            { id: "bills"     as View, label: "Bills", icon: <FileText className="w-5 h-5" /> },
          ]).map((item) => (
            <button key={item.id} onClick={() => setView(item.id)}
              className={`flex-1 flex flex-col items-center gap-1 py-3 transition-colors ${
                view === item.id ? "text-amber-500" : "text-slate-400"
              }`}>
              {item.icon}
              <span className="text-[10px] font-bold">{item.label}</span>
            </button>
          ))}
          <button
            onClick={() => setShowUpload(true)}
            className="flex-1 flex flex-col items-center gap-1 py-3 text-amber-500 transition-colors"
          >
            <Upload className="w-5 h-5" />
            <span className="text-[10px] font-bold">Upload</span>
          </button>
          <Link
            href="/settings"
            className="flex-1 flex flex-col items-center gap-1 py-3 text-slate-400 hover:text-slate-600 transition-colors"
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
