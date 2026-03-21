"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "./api/client";
import type { Bill } from "./types";

// ─── Raw API fetch ────────────────────────────────────────────────────────────

export function useBills(householdId: string | null | undefined) {
  const [bills,   setBills]   = useState<Bill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!householdId) { setBills([]); return; }
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<Bill[]>(`/bills?householdId=${householdId}`);
      setBills(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load bills");
      setBills([]);
    } finally {
      setLoading(false);
    }
  }, [householdId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { bills, loading, error, refresh: fetch };
}

// ─── Derived data helpers ─────────────────────────────────────────────────────

export interface MonthlySpend {
  month:       string;   // "Jan", "Feb", …
  electricity: number;
  gas:         number;
  water:       number;
  total:       number;
}

export interface MonthlyElecDetail {
  month: string;
  kWh:   number;
  rate:  number;
  total: number;
}

export interface MonthlyGasDetail {
  month:  string;
  therms: number;
  rate:   number;
  total:  number;
}

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function billMonth(bill: Bill): string {
  // Use billingPeriodEnd to group bills — PG&E electricity and gas have the
  // same statement but slightly different start dates (e.g. electricity starts
  // Sep 14, gas starts Oct 1), but both *end* in the same calendar month.
  const d = new Date(bill.billingPeriodEnd + "T00:00:00");
  return `${MONTH_LABELS[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
}

/** Derive monthly aggregates from a flat list of bills. */
export function deriveMonthlySpend(bills: Bill[]): MonthlySpend[] {
  const map = new Map<string, MonthlySpend>();
  // Sort bills by period end so months appear in chronological order
  const sorted = [...bills].sort((a, b) =>
    a.billingPeriodEnd.localeCompare(b.billingPeriodEnd)
  );
  for (const b of sorted) {
    const m = billMonth(b);
    const row = map.get(m) ?? { month: m, electricity: 0, gas: 0, water: 0, total: 0 };
    const amt = b.totalAmount;
    if (b.utilityType === "electricity") row.electricity += amt;
    else if (b.utilityType === "gas")    row.gas         += amt;
    else if (b.utilityType === "water")  row.water       += amt;
    row.total = row.electricity + row.gas + row.water;
    map.set(m, row);
  }
  return Array.from(map.values());
}

export function deriveElecMonthly(bills: Bill[]): MonthlyElecDetail[] {
  return bills
    .filter((b) => b.utilityType === "electricity")
    .sort((a, b) => a.billingPeriodEnd.localeCompare(b.billingPeriodEnd))
    .map((b) => ({
      month: billMonth(b),
      kWh:   b.usage,
      rate:  b.unitPrice,
      total: b.totalAmount,
    }));
}

export function deriveGasMonthly(bills: Bill[]): MonthlyGasDetail[] {
  return bills
    .filter((b) => b.utilityType === "gas")
    .sort((a, b) => a.billingPeriodEnd.localeCompare(b.billingPeriodEnd))
    .map((b) => ({
      month:  billMonth(b),
      therms: b.usage,
      rate:   b.unitPrice,
      total:  b.totalAmount,
    }));
}
