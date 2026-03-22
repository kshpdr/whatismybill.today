"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Zap, Flame, Droplets, FileText, ChevronRight, X,
  ArrowUpRight, ArrowDownRight, Shield,
} from "lucide-react";
import type { Bill } from "@/lib/types";
import {
  deriveMonthlySpend, deriveElecMonthly, deriveGasMonthly,
  utilitySummaryAnchorMonth, deriveApproxUtilitySpendInMonth,
} from "@/lib/use-bills";
import {
  filterCompletedMonths,
  isMonthComplete,
} from "@/lib/bill-utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const fmt$ = (n: number) => `$${n.toFixed(2)}`;
const fmtDate = (s: string) =>
  new Date(s + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });

function ClientOnly({ children, height }: { children: React.ReactNode; height: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className={height} />;
  return <>{children}</>;
}

const C = { electricity: "#F59E0B", gas: "#60A5FA", water: "#22D3EE" };

// ─── Bill row ─────────────────────────────────────────────────────────────────

function BillRow({ bill, token, onSelect }: { bill: Bill; token: string; onSelect: (b: Bill) => void }) {
  const bg = bill.utilityType === "electricity" ? "#FEF3C7" : bill.utilityType === "gas" ? "#DBEAFE" : "#CFFAFE";
  return (
    <button
      className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors text-left"
      onClick={() => onSelect(bill)}
    >
      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: bg }}>
        {bill.utilityType === "electricity" && <Zap className="w-4 h-4 text-amber-600" />}
        {bill.utilityType === "gas"         && <Flame className="w-4 h-4 text-blue-600" />}
        {bill.utilityType === "water"       && <Droplets className="w-4 h-4 text-cyan-600" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800">{bill.provider}</p>
        <p className="text-xs text-slate-400 mt-0.5">
          {fmtDate(bill.billingPeriodStart)} – {fmtDate(bill.billingPeriodEnd)} · {bill.usage > 0 ? `${bill.usage} ${bill.usageUnit}` : bill.usageUnit}
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-sm font-semibold text-slate-900 tabular-nums">{fmt$(bill.totalAmount)}</span>
        <ChevronRight className="w-4 h-4 text-slate-300" />
      </div>
    </button>
  );
}

// ─── Bill detail panel ────────────────────────────────────────────────────────

function BillDetailPanel({ bill, token, onClose }: { bill: Bill; token: string; onClose: () => void }) {
  const [pdfLoading, setPdfLoading] = useState(false);
  const colors = ["#F59E0B", "#60A5FA", "#34D399", "#F472B6", "#A78BFA", "#FB923C"];

  async function handleViewPdf() {
    setPdfLoading(true);
    try {
      const res = await fetch(`${BASE}/share/${token}/bills/${bill.id}/pdf`);
      if (!res.ok) return;
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } finally {
      setPdfLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end md:flex-row">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <aside className="relative flex flex-col bg-white shadow-2xl w-full rounded-t-3xl max-h-[88dvh] md:rounded-none md:max-h-full md:h-full md:w-[400px]">
        <div className="md:hidden flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-slate-300 rounded-full" />
        </div>
        <div className="px-5 py-3 border-b border-slate-100 flex items-start justify-between shrink-0">
          <div className="space-y-1">
            <p className="text-sm font-bold text-slate-800 capitalize">{bill.utilityType} · {bill.provider}</p>
            <p className="text-xs text-slate-400">{fmtDate(bill.billingPeriodStart)} – {fmtDate(bill.billingPeriodEnd)}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Total",    value: fmt$(bill.totalAmount) },
              { label: bill.usageUnit || "Usage", value: bill.usage > 0 ? String(bill.usage) : "—" },
              { label: `/${bill.usageUnit}`,  value: bill.unitPrice > 0 ? `$${bill.unitPrice.toFixed(3)}` : "—" },
            ].map((k) => (
              <div key={k.label} className="bg-slate-50 rounded-xl p-3 text-center">
                <p className="text-base font-semibold text-slate-900 tabular-nums">{k.value}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{k.label}</p>
              </div>
            ))}
          </div>

          {/* Charges */}
          {bill.charges.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Charge Breakdown</h3>
              <div className="space-y-2.5">
                {bill.charges.map((c, i) => (
                  <div key={c.label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="flex items-center gap-1.5 text-slate-600">
                        <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: colors[i % colors.length] }} />
                        {c.label}
                      </span>
                      <span className="font-semibold tabular-nums">{fmt$(c.amount)}</span>
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

          {/* PDF */}
          <div className="border border-slate-100 rounded-2xl p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4 text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-700">Original PDF</p>
            </div>
            <button
              onClick={handleViewPdf}
              disabled={pdfLoading}
              className="shrink-0 text-xs font-semibold text-blue-500 hover:text-blue-600 disabled:opacity-50 transition-colors"
            >
              {pdfLoading ? "Opening…" : "View →"}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

interface ShareData {
  household: { nickname: string; address: string | null };
  bills: Bill[];
  shareLink: { label: string | null; expiresAt: string | null; createdAt: string };
}

export default function SharePage() {
  const params = useParams();
  const token  = params.token as string;

  const [data,    setData]    = useState<ShareData | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);

  useEffect(() => {
    fetch(`${BASE}/share/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error ?? "Link not found");
        }
        return res.json() as Promise<ShareData>;
      })
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-8 h-8 border-[3px] border-slate-200 border-t-amber-400 rounded-full animate-spin" />
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="text-center max-w-sm">
        <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
          <X className="w-7 h-7 text-red-400" />
        </div>
        <h1 className="text-lg font-bold text-slate-900 mb-1">Link unavailable</h1>
        <p className="text-sm text-slate-500">{error}</p>
      </div>
    </div>
  );

  if (!data) return null;

  const { household, bills: allBills, shareLink } = data;
  const monthlySpend = deriveMonthlySpend(allBills);
  const elecMonthly  = deriveElecMonthly(allBills);
  const gasMonthly   = deriveGasMonthly(allBills);

  // Use anchor month logic + approx spend (not pro-rated calendar month for incomplete months)
  const anchorYearMonth = utilitySummaryAnchorMonth(allBills);
  const approxMonthSpend = anchorYearMonth 
    ? deriveApproxUtilitySpendInMonth(allBills, anchorYearMonth.year, anchorYearMonth.month)
    : { electricity: 0, gas: 0, water: 0 };
  const curTotal = approxMonthSpend.electricity + approxMonthSpend.gas + approxMonthSpend.water;

  // For delta: compare against the previous *completed* month's pro-rated total
  const completedMonths = filterCompletedMonths(monthlySpend);
  const prevMonth = completedMonths[completedMonths.length - 1];
  const prvTotal = prevMonth ? (prevMonth.electricity + prevMonth.gas + prevMonth.water) : 0;
  const totalDeltaPct = prvTotal > 0 ? ((curTotal - prvTotal) / prvTotal) * 100 : 0;

  // Current display label (the anchor month)
  const curMonthLabel = anchorYearMonth 
    ? `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][anchorYearMonth.month - 1]} '${String(anchorYearMonth.year).slice(2)}`
    : "";
  
  // Check if anchor month is incomplete
  const anchorIsIncomplete = anchorYearMonth ? !isMonthComplete(anchorYearMonth.year, anchorYearMonth.month) : false;

  const latestBill = [...allBills].sort(
    (a, b) => new Date(b.billingPeriodEnd).getTime() - new Date(a.billingPeriodEnd).getTime()
  )[0];

  const sortedBills = [...allBills].sort(
    (a, b) => new Date(b.billingPeriodEnd).getTime() - new Date(a.billingPeriodEnd).getTime()
  );

  // Mark incomplete months for visual indication in chart
  const monthlySpendWithMeta = monthlySpend.map(m => {
    const [monthName, yearShort] = m.month.split(" '");
    const year = 2000 + parseInt(yearShort);
    const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(monthName) + 1;
    return {
      ...m,
      isComplete: isMonthComplete(year, month),
    };
  });

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-amber-500 flex items-center justify-center">
            <Zap className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900 leading-none">{household.nickname}</p>
            {household.address && <p className="text-[11px] text-slate-400 mt-0.5">{household.address}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 bg-slate-50 border border-slate-200 rounded-full px-2.5 py-1">
          <Shield className="w-3 h-3" />
          Read-only view
          {shareLink.label && <span>· {shareLink.label}</span>}
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">

        {/* Hero */}
        {allBills.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="h-1 w-full bg-gradient-to-r from-amber-400 via-amber-300 to-cyan-300" />
            <div className="px-5 pt-4 pb-5">
              {latestBill && (
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                  {anchorIsIncomplete ? `${curMonthLabel} · Month in progress` : `${curMonthLabel} · Most recent complete data`}
                </p>
              )}
              <div className="flex items-end justify-between mb-4">
                <div>
                  <p className="text-5xl font-bold text-slate-900 tracking-tight tabular-nums leading-none">
                    {fmt$(curTotal)}
                  </p>
                  <div className="flex items-center gap-2 mt-2.5">
                    {!anchorIsIncomplete && prevMonth ? (
                      <>
                        <span className={`flex items-center gap-0.5 text-sm font-bold px-2 py-0.5 rounded-full ${
                          totalDeltaPct < 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
                        }`}>
                          {totalDeltaPct < 0 ? <ArrowDownRight className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                          {Math.abs(totalDeltaPct).toFixed(1)}%
                        </span>
                        <span className="text-sm text-slate-400">vs {prevMonth.month}</span>
                      </>
                    ) : anchorIsIncomplete ? (
                      <span className="text-sm text-slate-400">Approximate · bills still arriving</span>
                    ) : (
                      <span className="text-sm text-slate-400">First bill on record</span>
                    )}
                  </div>
                </div>
              </div>
              {/* Utility breakdown */}
              <div className="grid grid-cols-3 gap-2 mt-2">
                {[
                  { label: "Electricity", amount: approxMonthSpend.electricity, color: C.electricity, icon: <Zap className="w-3.5 h-3.5" /> },
                  { label: "Gas",         amount: approxMonthSpend.gas,         color: C.gas,         icon: <Flame className="w-3.5 h-3.5" /> },
                  { label: "Water",       amount: approxMonthSpend.water,       color: C.water,       icon: <Droplets className="w-3.5 h-3.5" /> },
                ].map((u) => (
                  <div key={u.label} className="bg-slate-50 rounded-xl p-3">
                    <div className="flex items-center gap-1 mb-1" style={{ color: u.color }}>{u.icon}<span className="text-[10px] font-semibold">{u.label}</span></div>
                    <p className="text-sm font-bold text-slate-900 tabular-nums">{fmt$(u.amount)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Monthly chart */}
        {monthlySpend.length > 1 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <h2 className="font-semibold text-slate-800 text-sm mb-1">Monthly Spending</h2>
            <p className="text-xs text-slate-400 mb-4">All utilities combined</p>
            <ClientOnly height="h-48">
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlySpendWithMeta} barSize={16} barCategoryGap="32%">
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} width={34} />
                    <Tooltip formatter={(v) => [`$${Number(v).toFixed(2)}`, ""]}
                      contentStyle={{ border: "1px solid #E2E8F0", borderRadius: 12, fontSize: 12 }} />
                    <Bar dataKey="electricity" name="Electricity" stackId="a" fill={C.electricity} radius={[0,0,0,0]}
                      shape={(props: any) => {
                        const { x, y, width, height, payload } = props;
                        return <rect x={x} y={y} width={width} height={height} fill={C.electricity} opacity={payload.isComplete ? 1 : 0.4} />;
                      }} />
                    <Bar dataKey="gas" name="Gas" stackId="a" fill={C.gas} radius={[0,0,0,0]}
                      shape={(props: any) => {
                        const { x, y, width, height, payload } = props;
                        return <rect x={x} y={y} width={width} height={height} fill={C.gas} opacity={payload.isComplete ? 1 : 0.4} />;
                      }} />
                    <Bar dataKey="water" name="Water" stackId="a" fill={C.water} radius={[3,3,0,0]}
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
        )}

        {/* Bills list */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800 text-sm">All Bills</h2>
          </div>
          {sortedBills.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No bills uploaded yet.</p>
          ) : (
            sortedBills.map((bill) => (
              <BillRow key={bill.id} bill={bill} token={token} onSelect={setSelectedBill} />
            ))
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-400 pb-4">
          Shared via <span className="font-semibold">whatismybill.today</span>
          {shareLink.expiresAt && ` · Expires ${fmtDate(shareLink.expiresAt.split("T")[0])}`}
        </p>
      </div>

      {selectedBill && (
        <BillDetailPanel bill={selectedBill} token={token} onClose={() => setSelectedBill(null)} />
      )}
    </div>
  );
}
