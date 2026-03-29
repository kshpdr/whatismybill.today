"use client";

import { useState, useEffect } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  Zap, Flame, Droplets, LayoutDashboard, FileText,
  BarChart2, Upload, ChevronRight, ArrowUpRight,
  ArrowDownRight, LogOut, Settings, Trash2, Home,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// DESIGN SYSTEM
//
// Reference: Cursor, Linear, Vercel, OpenAI
//
// Rules:
//  1. Background is near-black (#0a0a0a). Surfaces are slightly lighter.
//  2. Borders are 1px at ~7–10% white opacity. That's the only separation.
//  3. Color exists only to communicate meaning — not for decoration.
//     Three utility colors, intentionally desaturated to not compete.
//  4. All numbers are monospace. Always. Non-negotiable.
//  5. No shadows. No blur. No gradients. No glow.
//  6. Hover states are +1 stop brighter background. That's it.
//  7. Radius is 6px everywhere. Consistent.
//  8. Motion is 150ms ease-out. Fast and confident.
// ─────────────────────────────────────────────────────────────────────────────

// Surfaces
const bg      = "#0a0a0a";
const surface = "#0f0f0f";
const card    = "#141414";
const hover   = "#1a1a1a";
const active  = "#1f1f1f";

// Accent — one. Amber for the brand.
const amber   = "#e8a838";

// Utility colors — desaturated so they read as "data" not "decoration"
const C = {
  electricity: "#d4993a",  // amber, slightly duller
  gas:         "#6892b0",  // steel blue
  water:       "#47998e",  // muted teal
  up:   "#f87171",         // red-400
  down: "#4ade80",         // green-400
};

// ── Data ─────────────────────────────────────────────────────────────────────

const MONTHS = [
  { m: "Sep", e: 98,  g: 22,  w: 56,  t: 176 },
  { m: "Oct", e: 112, g: 45,  w: 56,  t: 213 },
  { m: "Nov", e: 134, g: 89,  w: 58,  t: 281 },
  { m: "Dec", e: 145, g: 124, w: 58,  t: 327 },
  { m: "Jan", e: 151, g: 132, w: 62,  t: 345 },
  { m: "Feb", e: 138, g: 105, w: 62,  t: 305 },
  { m: "Mar", e: 122, g: 67,  w: 64,  t: 253 },
];

const BILLS = [
  { id: "1", type: "electricity", provider: "PG&E",           period: "Feb 5 – Mar 6, 2025",  usage: "612 kWh",    amount: 122.78, delta: -11.3 },
  { id: "2", type: "gas",         provider: "PG&E",           period: "Feb 5 – Mar 6, 2025",  usage: "21 therms",  amount:  67.34, delta: -12.1 },
  { id: "3", type: "water",       provider: "San Jose Water", period: "Jan 1 – Feb 28, 2025", usage: "9 CCF",      amount: 128.66, delta:   4.2 },
  { id: "4", type: "electricity", provider: "PG&E",           period: "Jan 7 – Feb 4, 2025",  usage: "698 kWh",    amount: 138.42, delta:   5.8 },
  { id: "5", type: "gas",         provider: "PG&E",           period: "Jan 7 – Feb 4, 2025",  usage: "31 therms",  amount: 105.21, delta:  -3.4 },
  { id: "6", type: "electricity", provider: "PG&E",           period: "Dec 6 – Jan 6, 2025",  usage: "745 kWh",    amount: 144.91, delta:   2.1 },
  { id: "7", type: "gas",         provider: "PG&E",           period: "Dec 6 – Jan 6, 2025",  usage: "39 therms",  amount: 124.33, delta:   8.9 },
  { id: "8", type: "water",       provider: "San Jose Water", period: "Nov 1 – Dec 31, 2024", usage: "8 CCF",      amount: 116.00, delta:  -1.7 },
];

const CHARGES = [
  { label: "Energy Generation",     amount: 68.92 },
  { label: "Electric Delivery",     amount: 35.12 },
  { label: "Public Purpose Programs",amount: 13.21 },
  { label: "Taxes & Fees",          amount:  5.53 },
];

type Screen = "dashboard" | "bills" | "detail" | "insights";

// ── Shared atoms ──────────────────────────────────────────────────────────────

function Delta({ pct }: { pct: number }) {
  const pos = pct > 0;
  return (
    <span
      className="inline-flex items-center gap-px font-mono text-xs font-medium"
      style={{ color: pos ? C.up : C.down }}
    >
      {pos ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

const UTIL_ICON: Record<string, React.ReactNode> = {
  electricity: <Zap      className="w-3.5 h-3.5" style={{ color: C.electricity }} />,
  gas:         <Flame    className="w-3.5 h-3.5" style={{ color: C.gas         }} />,
  water:       <Droplets className="w-3.5 h-3.5" style={{ color: C.water       }} />,
};

function ChartWrap({ children, h }: { children: React.ReactNode; h: number }) {
  const [ok, setOk] = useState(false);
  useEffect(() => setOk(true), []);
  if (!ok) return (
    <div style={{ height: h, background: card, borderRadius: 4 }}
      className="animate-pulse" />
  );
  return <div style={{ height: h }}>{children}</div>;
}

// Custom tooltip — same minimalism
function MinimalTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { dataKey: string; name?: string; value: number; fill?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#1a1a1a",
      border: "1px solid rgba(255,255,255,0.10)",
      borderRadius: 6,
      padding: "8px 12px",
      fontSize: 12,
    }}>
      <p style={{ color: "rgba(255,255,255,0.40)", marginBottom: 6, fontSize: 11 }}>{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ display: "flex", justifyContent: "space-between", gap: 24, alignItems: "center" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.50)" }}>
            <span style={{ width: 6, height: 6, borderRadius: 2, background: p.fill, display: "inline-block" }} />
            {p.name ?? p.dataKey}
          </span>
          <span style={{ fontFamily: "var(--font-geist-mono)", color: "rgba(255,255,255,0.88)", fontWeight: 600 }}>
            ${p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SIDEBAR
// ─────────────────────────────────────────────────────────────────────────────

function Sidebar({ screen, setScreen }: { screen: Screen; setScreen: (s: Screen) => void }) {
  const navItems = [
    { id: "dashboard" as Screen, label: "Dashboard", icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: "bills"     as Screen, label: "Bills",     icon: <FileText        className="w-4 h-4" /> },
    { id: "insights"  as Screen, label: "Insights",  icon: <BarChart2       className="w-4 h-4" /> },
  ];

  return (
    <aside
      className="hidden md:flex flex-col shrink-0 w-52"
      style={{ background: surface, borderRight: "1px solid rgba(255,255,255,0.07)" }}
    >
      {/* Logo */}
      <div className="px-4 py-[14px]" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4" style={{ color: amber }} />
          <span className="text-sm font-semibold text-white/80 tracking-tight">whatismybill</span>
        </div>
      </div>

      {/* Household */}
      <div className="px-3 py-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <button
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors duration-150"
          style={{ color: "rgba(255,255,255,0.45)" }}
          onMouseEnter={e => (e.currentTarget.style.background = hover)}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        >
          <Home className="w-3.5 h-3.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-white/70 truncate">123 Maple St</p>
            <p className="text-[10px] text-white/30 truncate">Oakland, CA</p>
          </div>
        </button>
      </div>

      {/* Nav */}
      <nav className="px-3 py-2 flex-1 space-y-0.5">
        {navItems.map((item) => {
          const on = screen === item.id || (screen === "detail" && item.id === "bills");
          return (
            <button
              key={item.id}
              onClick={() => setScreen(item.id)}
              className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-left transition-colors duration-150"
              style={{
                background: on ? active : "transparent",
                color: on ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.40)",
                fontWeight: on ? 500 : 400,
              }}
              onMouseEnter={e => !on && (e.currentTarget.style.background = hover)}
              onMouseLeave={e => !on && (e.currentTarget.style.background = "transparent")}
            >
              {item.icon}
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="px-3 py-3 space-y-1" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
        <button
          onClick={() => setScreen("detail" as Screen)}
          className="w-full flex items-center justify-center gap-2 py-1.5 rounded-md text-xs font-semibold transition-colors duration-150"
          style={{ background: `${amber}18`, color: amber, border: `1px solid ${amber}30` }}
          onMouseEnter={e => (e.currentTarget.style.background = `${amber}28`)}
          onMouseLeave={e => (e.currentTarget.style.background = `${amber}18`)}
        >
          <Upload className="w-3.5 h-3.5" />Upload Bill
        </button>
        <button
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors duration-150"
          style={{ color: "rgba(255,255,255,0.30)" }}
          onMouseEnter={e => (e.currentTarget.style.background = hover)}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        >
          <LogOut className="w-3.5 h-3.5" />Sign out
        </button>
      </div>
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TOPBAR
// ─────────────────────────────────────────────────────────────────────────────

function Topbar({ screen }: { screen: Screen }) {
  const labels: Record<Screen, string> = {
    dashboard: "Dashboard",
    bills:     "Bills",
    detail:    "Bills",
    insights:  "Insights",
  };
  return (
    <div
      className="flex items-center justify-between px-6 py-3 shrink-0"
      style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-white/75">{labels[screen]}</span>
        {screen !== "dashboard" && (
          <>
            <span className="text-white/20">/</span>
            <span className="text-sm text-white/35">
              {screen === "detail" ? "Mar 6, 2025 · PG&E Electricity" : ""}
              {screen === "insights" ? "March 2025" : ""}
              {screen === "bills" ? "All time" : ""}
            </span>
          </>
        )}
        {screen === "dashboard" && (
          <span className="text-sm text-white/30">· March 2025</span>
        )}
      </div>
      <span
        className="text-xs font-medium px-2 py-1 rounded"
        style={{ color: "rgba(255,255,255,0.30)", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}
      >
        Last 7 months
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD SCREEN
// ─────────────────────────────────────────────────────────────────────────────

function DashboardScreen() {
  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-4">

        {/* ── KPI row ── */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "This month",  value: "$253.00",  sub: "March 2025",      delta: -17.0 },
            { label: "Monthly avg", value: "$289.00",  sub: "last 6 months",   delta: null  },
            { label: "YTD total",   value: "$1,595.00",sub: "Sep – Mar",       delta: null  },
          ].map((s) => (
            <div key={s.label}
              className="rounded-md p-4 flex flex-col gap-1"
              style={{ background: card, border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <p className="text-xs text-white/35 font-medium">{s.label}</p>
              <p className="font-mono text-xl font-semibold text-white/88 tabular-nums tracking-tight">
                {s.value}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-xs text-white/28">{s.sub}</p>
                {s.delta !== null && <Delta pct={s.delta} />}
              </div>
            </div>
          ))}
        </div>

        {/* ── Utility strip ── */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { type: "electricity", label: "Electricity", amount: "$122.78", usage: "612 kWh",    delta: 3.2,  rate: "$0.201/kWh"    },
            { type: "gas",         label: "Gas",         amount: "$67.34",  usage: "21 therms",  delta: -12.1,rate: "$3.21/therm"    },
            { type: "water",       label: "Water",       amount: "~$64/mo", usage: "~4.5 CCF/mo",delta: 1.5,  rate: "$14.22/CCF"    },
          ].map((u) => (
            <div key={u.type}
              className="rounded-md p-4 flex flex-col gap-3"
              style={{ background: card, border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {UTIL_ICON[u.type]}
                  <span className="text-xs font-medium text-white/45">{u.label}</span>
                </div>
                <Delta pct={u.delta} />
              </div>
              <div>
                <p className="font-mono text-2xl font-semibold text-white/88 tabular-nums tracking-tight">
                  {u.amount}
                </p>
                <p className="text-xs text-white/28 mt-0.5">{u.usage}</p>
              </div>
              <p className="text-xs text-white/22 font-mono">{u.rate}</p>
            </div>
          ))}
        </div>

        {/* ── Monthly spend chart ── */}
        <div
          className="rounded-md p-5"
          style={{ background: card, border: "1px solid rgba(255,255,255,0.07)" }}
        >
          <div className="flex items-center justify-between mb-5">
            <p className="text-xs font-medium text-white/40">Monthly Spend</p>
            <div className="flex items-center gap-3">
              {[
                { label: "Electricity", color: C.electricity },
                { label: "Gas",         color: C.gas         },
                { label: "Water",       color: C.water       },
              ].map((l) => (
                <span key={l.label} className="flex items-center gap-1.5 text-xs text-white/28">
                  <span className="w-2 h-2 rounded-sm" style={{ background: l.color }} />
                  {l.label}
                </span>
              ))}
            </div>
          </div>
          <ChartWrap h={160}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={MONTHS} barCategoryGap="35%" barGap={1}>
                <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
                <XAxis
                  dataKey="m"
                  tick={{ fill: "rgba(255,255,255,0.28)", fontSize: 11, fontFamily: "var(--font-geist-sans)" }}
                  axisLine={false} tickLine={false}
                />
                <YAxis
                  tick={{ fill: "rgba(255,255,255,0.28)", fontSize: 11, fontFamily: "var(--font-geist-mono)" }}
                  axisLine={false} tickLine={false}
                  tickFormatter={(v) => `$${v}`}
                />
                <Tooltip content={<MinimalTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                <Bar dataKey="e" name="Electricity" stackId="a" fill={C.electricity} radius={[0,0,0,0]} />
                <Bar dataKey="g" name="Gas"         stackId="a" fill={C.gas}         radius={[0,0,0,0]} />
                <Bar dataKey="w" name="Water"       stackId="a" fill={C.water}       radius={[2,2,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartWrap>
        </div>

        {/* ── Recent bills ── */}
        <div
          className="rounded-md overflow-hidden"
          style={{ background: card, border: "1px solid rgba(255,255,255,0.07)" }}
        >
          <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <p className="text-xs font-medium text-white/40">Recent Bills</p>
          </div>

          {/* Table header */}
          <div
            className="grid px-4 py-2"
            style={{
              gridTemplateColumns: "20px 1fr 1fr auto auto",
              gap: "0 16px",
              borderBottom: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            {["", "Provider", "Period", "Usage", "Amount"].map((h) => (
              <span key={h} className="text-[10px] font-semibold text-white/22 uppercase tracking-wider">{h}</span>
            ))}
          </div>

          {BILLS.slice(0, 5).map((bill, i) => (
            <div
              key={bill.id}
              className="grid items-center px-4 py-2.5 transition-colors duration-150 cursor-pointer"
              style={{
                gridTemplateColumns: "20px 1fr 1fr auto auto",
                gap: "0 16px",
                borderBottom: i < 4 ? "1px solid rgba(255,255,255,0.04)" : "none",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = hover)}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <span className="flex items-center">{UTIL_ICON[bill.type]}</span>
              <span className="text-sm text-white/65">{bill.provider}</span>
              <span className="text-xs text-white/35 font-mono">{bill.period.replace(", 2025", "").replace(", 2024", "")}</span>
              <span className="text-xs text-white/35 font-mono">{bill.usage}</span>
              <div className="flex items-center gap-2 justify-end">
                <span className="text-sm font-mono font-semibold text-white/80 tabular-nums">
                  ${bill.amount.toFixed(2)}
                </span>
                <Delta pct={bill.delta} />
              </div>
            </div>
          ))}
        </div>

      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BILLS SCREEN
// ─────────────────────────────────────────────────────────────────────────────

type Filter = "all" | "electricity" | "gas" | "water";

function BillsScreen() {
  const [filter, setFilter] = useState<Filter>("all");
  const shown = filter === "all" ? BILLS : BILLS.filter(b => b.type === filter);

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-4">

        {/* Filter bar */}
        <div className="flex items-center gap-1">
          {(["all","electricity","gas","water"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3 py-1 rounded text-xs font-medium transition-colors duration-150 capitalize"
              style={{
                background:  filter === f ? active : "transparent",
                color:       filter === f ? "rgba(255,255,255,0.80)" : "rgba(255,255,255,0.35)",
                border:      filter === f ? "1px solid rgba(255,255,255,0.12)" : "1px solid transparent",
              }}
            >
              {f === "all" ? "All bills" : f}
            </button>
          ))}
          <span className="ml-2 text-xs text-white/22 font-mono">{shown.length} records</span>
        </div>

        {/* Table */}
        <div
          className="rounded-md overflow-hidden"
          style={{ background: card, border: "1px solid rgba(255,255,255,0.07)" }}
        >
          {/* Header */}
          <div
            className="grid px-4 py-2.5"
            style={{
              gridTemplateColumns: "20px 1fr 1.4fr auto auto auto",
              gap: "0 16px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            {["", "Provider", "Billing Period", "Usage", "Amount", "Δ"].map((h, i) => (
              <span
                key={h + i}
                className="text-[10px] font-semibold text-white/22 uppercase tracking-wider"
                style={{ textAlign: i >= 4 ? "right" : "left" }}
              >
                {h}
              </span>
            ))}
          </div>

          {shown.map((bill, i) => (
            <div
              key={bill.id}
              className="grid items-center px-4 py-3 transition-colors duration-150 cursor-pointer"
              style={{
                gridTemplateColumns: "20px 1fr 1.4fr auto auto auto",
                gap: "0 16px",
                borderBottom: i < shown.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = hover)}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <span>{UTIL_ICON[bill.type]}</span>
              <span className="text-sm text-white/65">{bill.provider}</span>
              <span className="text-xs text-white/35 font-mono">{bill.period}</span>
              <span className="text-xs text-white/35 font-mono text-right">{bill.usage}</span>
              <span className="text-sm font-mono font-semibold text-white/80 tabular-nums text-right">
                ${bill.amount.toFixed(2)}
              </span>
              <span className="flex justify-end">
                <Delta pct={bill.delta} />
              </span>
            </div>
          ))}
        </div>

      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BILL DETAIL SCREEN
// ─────────────────────────────────────────────────────────────────────────────

function DetailScreen() {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const total = CHARGES.reduce((s, c) => s + c.amount, 0);

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-lg mx-auto px-6 py-6 space-y-4">

        {/* Primary amount */}
        <div
          className="rounded-md p-5"
          style={{ background: card, border: "1px solid rgba(255,255,255,0.07)" }}
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-4 h-4" style={{ color: C.electricity }} />
                <span className="text-sm text-white/55">PG&amp;E · Electricity</span>
                <span
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                  style={{ color: C.down, background: "rgba(74,222,128,0.10)", border: "1px solid rgba(74,222,128,0.15)" }}
                >
                  PARSED
                </span>
              </div>
              <p className="font-mono text-4xl font-semibold text-white/88 tabular-nums tracking-tight">
                $122.78
              </p>
              <p className="text-xs text-white/30 mt-1.5 font-mono">Feb 5 – Mar 6, 2025 · 29 days</p>
            </div>
            <Delta pct={-11.3} />
          </div>

          {/* KPI row */}
          <div
            className="grid grid-cols-3 gap-3 mt-5 pt-4"
            style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
          >
            {[
              { label: "Usage",     value: "612 kWh"  },
              { label: "Unit rate", value: "$0.201"   },
              { label: "vs prev.",  value: "-$15.64"  },
            ].map((k) => (
              <div key={k.label}>
                <p className="text-xs text-white/28">{k.label}</p>
                <p className="font-mono text-sm font-semibold text-white/70 mt-0.5 tabular-nums">{k.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Charge breakdown */}
        <div
          className="rounded-md overflow-hidden"
          style={{ background: card, border: "1px solid rgba(255,255,255,0.07)" }}
        >
          <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <p className="text-xs font-medium text-white/40">Charge Breakdown</p>
          </div>
          {CHARGES.map((c, i) => {
            const pct = (c.amount / total) * 100;
            return (
              <div
                key={c.label}
                className="px-4 py-3 flex items-center gap-3"
                style={{ borderBottom: i < CHARGES.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}
              >
                <p className="flex-1 text-sm text-white/55">{c.label}</p>
                {/* Inline bar */}
                <div className="w-24 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, background: C.electricity, opacity: 0.6 + (pct / 100) * 0.4 }}
                  />
                </div>
                <p className="font-mono text-sm font-semibold text-white/70 tabular-nums w-14 text-right">
                  ${c.amount.toFixed(2)}
                </p>
              </div>
            );
          })}
          <div
            className="px-4 py-3 flex items-center"
            style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.025)" }}
          >
            <p className="flex-1 text-xs font-semibold text-white/35 uppercase tracking-wide">Total</p>
            <p className="font-mono text-sm font-semibold text-white/80 tabular-nums">${total.toFixed(2)}</p>
          </div>
        </div>

        {/* Usage context */}
        <div
          className="rounded-md px-4 py-3 flex items-center gap-3"
          style={{ background: card, border: "1px solid rgba(255,255,255,0.07)" }}
        >
          <span className="text-white/25 text-xs font-medium">Usage equivalent</span>
          <span className="text-white/18">·</span>
          <span className="text-xs text-white/45">⚡ 1,836 EV miles</span>
          <span className="text-white/18">·</span>
          <span className="text-xs text-white/45">🧊 122 fridge-days</span>
        </div>

        {/* vs previous */}
        <div
          className="rounded-md overflow-hidden"
          style={{ background: card, border: "1px solid rgba(255,255,255,0.07)" }}
        >
          <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <p className="text-xs font-medium text-white/40">vs Previous Bill</p>
          </div>
          {[
            { label: "Total",  prev: "$138.42", curr: "$122.78", delta: -11.3 },
            { label: "Usage",  prev: "698 kWh", curr: "612 kWh", delta: -12.3 },
            { label: "Rate",   prev: "$0.198",  curr: "$0.201",  delta:   1.5  },
          ].map((r, i) => (
            <div
              key={r.label}
              className="px-4 py-2.5 flex items-center justify-between"
              style={{ borderBottom: i < 2 ? "1px solid rgba(255,255,255,0.04)" : "none" }}
            >
              <span className="text-xs text-white/35">{r.label}</span>
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-white/20 line-through tabular-nums">{r.prev}</span>
                <span className="font-mono text-sm font-semibold text-white/70 tabular-nums">{r.curr}</span>
                <Delta pct={r.delta} />
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded text-xs font-medium transition-colors duration-150"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.50)" }}
            onMouseEnter={e => (e.currentTarget.style.background = hover)}
            onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
          >
            View PDF
          </button>
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded text-xs font-medium transition-colors duration-150"
              style={{ background: "transparent", border: "1px solid rgba(248,113,113,0.20)", color: "rgba(248,113,113,0.60)" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(248,113,113,0.07)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <Trash2 className="w-3.5 h-3.5" />Delete
            </button>
          ) : (
            <button
              onClick={() => setConfirmDelete(false)}
              className="flex-1 py-2 rounded text-xs font-semibold transition-colors duration-150"
              style={{ background: "rgba(248,113,113,0.15)", border: "1px solid rgba(248,113,113,0.30)", color: "#f87171" }}
            >
              Confirm delete
            </button>
          )}
        </div>

      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INSIGHTS SCREEN
// ─────────────────────────────────────────────────────────────────────────────

function InsightsScreen() {
  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-4">

        {/* Stats grid */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Monthly avg",  value: "$289",    sub: "last 6 months"  },
            { label: "Est. annual",  value: "$3,468",  sub: "at current pace"},
            { label: "Cheapest mo.", value: "Sep '24", sub: "$176 total"     },
            { label: "Costliest mo.",value: "Jan '25", sub: "$345 total"     },
          ].map((s) => (
            <div key={s.label}
              className="rounded-md p-4"
              style={{ background: card, border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <p className="text-xs text-white/32">{s.label}</p>
              <p className="font-mono text-xl font-semibold text-white/80 mt-1.5 tracking-tight">{s.value}</p>
              <p className="text-xs text-white/25 mt-1">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* Trend chart */}
        <div
          className="rounded-md p-5"
          style={{ background: card, border: "1px solid rgba(255,255,255,0.07)" }}
        >
          <p className="text-xs font-medium text-white/40 mb-5">Total Monthly Spend</p>
          <ChartWrap h={140}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={MONTHS} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis
                  dataKey="m"
                  tick={{ fill: "rgba(255,255,255,0.28)", fontSize: 11 }}
                  axisLine={false} tickLine={false}
                />
                <YAxis
                  tick={{ fill: "rgba(255,255,255,0.28)", fontSize: 11, fontFamily: "var(--font-geist-mono)" }}
                  axisLine={false} tickLine={false}
                  tickFormatter={(v) => `$${v}`}
                />
                <Tooltip content={<MinimalTooltip />} cursor={{ stroke: "rgba(255,255,255,0.08)" }} />
                <Line
                  dataKey="t" name="Total"
                  type="monotone"
                  stroke={amber} strokeWidth={1.5}
                  dot={{ r: 3, fill: amber, strokeWidth: 0 }}
                  activeDot={{ r: 4, fill: amber, strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartWrap>
        </div>

        {/* Insights list */}
        <div
          className="rounded-md overflow-hidden"
          style={{ background: card, border: "1px solid rgba(255,255,255,0.07)" }}
        >
          <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <p className="text-xs font-medium text-white/40">Notable Changes</p>
          </div>
          {[
            {
              icon: "↓",
              color: C.down,
              title: "Gas down 12.1% from last statement",
              body: "From $105.21 → $67.34. Heating season declining — expect continued drops through May.",
            },
            {
              icon: "↑",
              color: C.up,
              title: "PG&E rate increased +1.5%",
              body: "Adjusted from $0.198 → $0.201/kWh this billing cycle. Lower usage partially offset the increase.",
            },
            {
              icon: "≈",
              color: "rgba(255,255,255,0.30)",
              title: "Your rate is 6.3% above CA average",
              body: "You pay $0.287/kWh vs the CA average of $0.270/kWh.",
            },
          ].map((ins, i) => (
            <div
              key={ins.title}
              className="px-4 py-4 flex items-start gap-3"
              style={{ borderBottom: i < 2 ? "1px solid rgba(255,255,255,0.04)" : "none" }}
            >
              <span
                className="font-mono text-sm font-bold mt-0.5 shrink-0 w-4 text-center"
                style={{ color: ins.color }}
              >
                {ins.icon}
              </span>
              <div>
                <p className="text-sm text-white/70 font-medium">{ins.title}</p>
                <p className="text-xs text-white/35 mt-1 leading-relaxed">{ins.body}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Rate vs CA avg — inline bar */}
        <div
          className="rounded-md p-5"
          style={{ background: card, border: "1px solid rgba(255,255,255,0.07)" }}
        >
          <div className="flex items-baseline justify-between mb-4">
            <p className="text-xs font-medium text-white/40">Electricity Rate</p>
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-lg font-semibold text-white/80">$0.287</span>
              <span className="text-xs text-white/28">you · CA avg $0.270</span>
            </div>
          </div>
          <div className="relative h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
            {/* Fill to your rate position */}
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: "62%", background: `linear-gradient(90deg, ${C.down}, ${amber})` }}
            />
          </div>
          {/* CA avg marker */}
          <div className="relative h-3 -mt-[14px] mb-1">
            <div className="absolute h-3 w-px" style={{ left: "55%", background: "rgba(255,255,255,0.25)" }} />
          </div>
          <div className="flex justify-between mt-3">
            <span className="text-[10px] text-white/20">Cheaper</span>
            <span className="text-[10px]" style={{ color: C.up }}>+6.3% above CA avg</span>
            <span className="text-[10px] text-white/20">More expensive</span>
          </div>
        </div>

      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SCREEN PICKER — minimal inline tab row in the topbar
// ─────────────────────────────────────────────────────────────────────────────

function MockupNav({ screen, setScreen }: { screen: Screen; setScreen: (s: Screen) => void }) {
  const tabs: { id: Screen; label: string }[] = [
    { id: "dashboard", label: "Dashboard"  },
    { id: "bills",     label: "Bills"      },
    { id: "detail",    label: "Bill Detail"},
    { id: "insights",  label: "Insights"   },
  ];
  return (
    <div
      className="flex items-center gap-1 px-4 py-2 shrink-0"
      style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", background: surface }}
    >
      <span className="text-[10px] font-medium text-white/20 mr-2 uppercase tracking-wider">Screen</span>
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => setScreen(t.id)}
          className="px-3 py-1 rounded text-xs font-medium transition-colors duration-150"
          style={{
            background: screen === t.id ? active : "transparent",
            color:      screen === t.id ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.30)",
            border:     screen === t.id ? "1px solid rgba(255,255,255,0.10)" : "1px solid transparent",
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOT
// ─────────────────────────────────────────────────────────────────────────────

export default function MockupPage() {
  const [screen, setScreen] = useState<Screen>("dashboard");

  return (
    <div
      className="flex flex-col h-dvh overflow-hidden"
      style={{ background: bg, fontFamily: "var(--font-geist-sans)" }}
    >
      {/* Mockup inspector nav */}
      <MockupNav screen={screen} setScreen={setScreen} />

      {/* App shell */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar screen={screen} setScreen={setScreen} />
        <div className="flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden">
          <Topbar screen={screen} />
          {screen === "dashboard" && <DashboardScreen />}
          {screen === "bills"     && <BillsScreen />}
          {screen === "detail"    && <DetailScreen />}
          {screen === "insights"  && <InsightsScreen />}
        </div>
      </div>
    </div>
  );
}
