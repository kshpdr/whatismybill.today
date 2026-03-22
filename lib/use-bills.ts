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

/**
 * Derive monthly aggregates from a flat list of bills.
 *
 * ALL utility types are pro-rated across calendar months using
 * day-overlap ratios so that a bill covering Oct 5 – Nov 3 allocates
 * ~83 % to October and ~10 % to November instead of dumping the full
 * amount into November (the billingPeriodEnd month).
 */
export function deriveMonthlySpend(bills: Bill[]): MonthlySpend[] {
  const map = new Map<string, MonthlySpend & { _key: string }>();

  function ensureRow(label: string, key: string) {
    if (!map.has(key)) {
      map.set(key, { _key: key, month: label, electricity: 0, gas: 0, water: 0, total: 0 });
    }
    return map.get(key)!;
  }

  for (const b of bills) {
    const start     = new Date(b.billingPeriodStart + "T00:00:00");
    const end       = new Date(b.billingPeriodEnd   + "T00:00:00");
    const totalDays = Math.round((end.getTime() - start.getTime()) / 86_400_000);
    if (totalDays <= 0) continue;

    let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cursor <= end) {
      const y  = cursor.getFullYear();
      const mo = cursor.getMonth();
      const sliceStart = cursor > start ? cursor : start;
      const monthEnd   = new Date(y, mo + 1, 0);   // last day of month
      const sliceEnd   = monthEnd < end ? monthEnd : end;
      const days = Math.max(
        0,
        Math.round((sliceEnd.getTime() - sliceStart.getTime()) / 86_400_000),
      );
      if (days > 0) {
        const label = `${MONTH_LABELS[mo]} '${String(y).slice(2)}`;
        const key   = `${y}-${String(mo + 1).padStart(2, "0")}`;
        const row   = ensureRow(label, key);
        const alloc = Math.round((b.totalAmount * days / totalDays) * 100) / 100;

        if (b.utilityType === "electricity") row.electricity += alloc;
        else if (b.utilityType === "gas")    row.gas         += alloc;
        else if (b.utilityType === "water")  row.water       += alloc;
        row.total = Math.round((row.electricity + row.gas + row.water) * 100) / 100;
      }
      cursor = new Date(y, mo + 1, 1);
    }
  }

  return [...map.values()]
    .sort((a, b) => a._key.localeCompare(b._key))
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .map(({ _key, ...rest }) => rest as MonthlySpend);
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

// ─── Calendar month “approximate spend” (water-anchored summary) ─────────────

export interface ApproxUtilityMonthSpend {
  electricity: number;
  gas: number;
  water: number;
  total: number;
}

export type UtilitySummaryAnchorSource = "water" | "energy" | "today";

/**
 * Which calendar month the dashboard “utility summary” refers to.
 * Prefers the month of the latest water bill’s billingPeriodEnd (cutoff).
 * If no water bills, uses the latest electricity or gas bill’s end month.
 * If no bills, uses the current calendar month.
 */
export function utilitySummaryAnchorMonth(bills: Bill[]): {
  year: number;
  month: number;
  source: UtilitySummaryAnchorSource;
} {
  const water = [...bills]
    .filter((b) => b.utilityType === "water")
    .sort((a, b) => b.billingPeriodEnd.localeCompare(a.billingPeriodEnd))[0];
  if (water) {
    const d = new Date(water.billingPeriodEnd + "T00:00:00");
    return { year: d.getFullYear(), month: d.getMonth() + 1, source: "water" };
  }
  const energy = [...bills]
    .filter((b) => b.utilityType === "electricity" || b.utilityType === "gas")
    .sort((a, b) => b.billingPeriodEnd.localeCompare(a.billingPeriodEnd))[0];
  if (energy) {
    const d = new Date(energy.billingPeriodEnd + "T00:00:00");
    return { year: d.getFullYear(), month: d.getMonth() + 1, source: "energy" };
  }
  const n = new Date();
  return { year: n.getFullYear(), month: n.getMonth() + 1, source: "today" };
}

/**
 * Overlap between a bill’s [start, end) day span and a calendar month,
 * using the same convention as water pro-rating in deriveMonthlySpend.
 */
function overlapDaysInCalendarMonth(
  periodStart: string,
  periodEnd: string,
  year: number,
  month: number // 1–12
): { overlapDays: number; periodDays: number } {
  const start = new Date(periodStart + "T00:00:00");
  const end   = new Date(periodEnd + "T00:00:00");
  const periodDays = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  if (periodDays <= 0) return { overlapDays: 0, periodDays: 0 };

  const mo = month - 1;
  const monthStart = new Date(year, mo, 1);
  const monthEnd   = new Date(year, mo + 1, 0);
  const sliceStart = monthStart > start ? monthStart : start;
  const sliceEnd   = monthEnd < end ? monthEnd : end;
  const overlapDays = Math.max(
    0,
    Math.round((sliceEnd.getTime() - sliceStart.getTime()) / 86_400_000)
  );
  return { overlapDays, periodDays };
}

/**
 * Approximate spend in one calendar month: each bill’s totalAmount is allocated
 * as (overlapDays / periodDays) × amount. Electricity & gas use the same
 * day-based split as water so PG&E periods that straddle months don’t dump
 * the full amount into a single month.
 */
export function deriveApproxUtilitySpendInMonth(
  bills: Bill[],
  year: number,
  month: number
): ApproxUtilityMonthSpend {
  let electricity = 0;
  let gas = 0;
  let water = 0;

  for (const b of bills) {
    const { overlapDays, periodDays } = overlapDaysInCalendarMonth(
      b.billingPeriodStart,
      b.billingPeriodEnd,
      year,
      month
    );
    if (overlapDays <= 0 || periodDays <= 0) continue;
    const alloc =
      Math.round(((b.totalAmount * overlapDays) / periodDays) * 100) / 100;
    if (b.utilityType === "electricity") electricity += alloc;
    else if (b.utilityType === "gas") gas += alloc;
    else if (b.utilityType === "water") water += alloc;
  }

  const total =
    Math.round((electricity + gas + water) * 100) / 100;
  return { electricity, gas, water, total };
}
