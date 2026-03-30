/**
 * Utility functions for bill processing and grouping.
 * Extracted from page.tsx for testability.
 */

import type { Bill } from "./types";

const PGE_PAIR_MAX_DAY_GAP = 10;

export interface PGEStatementCycle {
  periodStart: string;
  periodEnd: string;
  total: number;
  elec: number;
  gas: number;
  kWh: number;
  therms: number;
}

/**
 * Groups PG&E electricity and gas bills into statement cycles.
 * 
 * One PG&E statement = electricity + gas from the same PDF.
 * They share `storageRef` in production, but `billingPeriodEnd` often differs
 * by 1–2 days (meter read dates), so we must NOT group only by periodEnd.
 * 
 * Pair strategy: prefer same storageRef; else match opposite utility when
 * period ends are within PGE_PAIR_MAX_DAY_GAP days.
 */
export function pgeStatementCycles(bills: Bill[]): PGEStatementCycle[] {
  const energy = bills.filter(
    (b) => b.utilityType === "electricity" || b.utilityType === "gas"
  );
  if (energy.length === 0) return [];

  const used = new Set<string>();
  const clusters: Bill[][] = [];

  const sorted = [...energy].sort((a, b) =>
    b.billingPeriodEnd.localeCompare(a.billingPeriodEnd)
  );

  function findPartner(seed: Bill): Bill | null {
    const want = seed.utilityType === "electricity" ? "gas" : "electricity";
    const seedEnd = new Date(seed.billingPeriodEnd + "T00:00:00").getTime();
    let best: Bill | null = null;
    let bestScore = -Infinity;

    for (const c of energy) {
      if (used.has(c.id) || c.utilityType !== want) continue;
      const cEnd = new Date(c.billingPeriodEnd + "T00:00:00").getTime();
      const days = Math.abs(seedEnd - cEnd) / 86_400_000;
      if (days > PGE_PAIR_MAX_DAY_GAP) continue;

      let score = 100 - days;
      if (
        seed.storageRef &&
        c.storageRef &&
        seed.storageRef === c.storageRef
      ) {
        score += 80;
      }
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best;
  }

  for (const b of sorted) {
    if (used.has(b.id)) continue;
    const cluster: Bill[] = [b];
    used.add(b.id);
    const partner = findPartner(b);
    if (partner) {
      cluster.push(partner);
      used.add(partner.id);
    }
    clusters.push(cluster);
  }

  return clusters
    .map((list) => {
      const periodStart = list
        .map((x) => x.billingPeriodStart)
        .reduce((a, b) => (a < b ? a : b));
      const periodEnd = list
        .map((x) => x.billingPeriodEnd)
        .reduce((a, b) => (a > b ? a : b));
      const elecBill = list.find((x) => x.utilityType === "electricity");
      const gasBill = list.find((x) => x.utilityType === "gas");
      const elec = elecBill?.totalAmount ?? 0;
      const gas = gasBill?.totalAmount ?? 0;
      return {
        periodStart,
        periodEnd,
        total: elec + gas,
        elec,
        gas,
        kWh: elecBill?.usage ?? 0,
        therms: gasBill?.usage ?? 0,
      };
    })
    .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
}

/**
 * Checks if a month is complete (all days have passed).
 * A month is complete on the first day of the NEXT month (00:00:00 or later).
 * 
 * @param year - Full year (e.g., 2026)
 * @param month - 1-indexed month (1 = January)
 * @param asOfDate - Reference date (defaults to now)
 */
export function isMonthComplete(
  year: number,
  month: number,
  asOfDate: Date = new Date()
): boolean {
  // First moment of the next month
  const firstOfNextMonth = new Date(year, month, 1, 0, 0, 0, 0); // month is 1-indexed, Date uses 0-indexed months
  return asOfDate >= firstOfNextMonth;
}

/**
 * Filters monthly spend data to only include complete months.
 * Used for computing averages and min/max.
 * 
 * @param monthlyData - Array with `month` field like "Jan '26"
 * @param asOfDate - Reference date (defaults to now)
 */
export function filterCompletedMonths<T extends { month: string }>(
  monthlyData: T[],
  asOfDate: Date = new Date()
): T[] {
  return monthlyData.filter((m) => {
    // Parse "Jan '26" format
    const match = m.month.match(/^(\w+)\s+'(\d{2})$/);
    if (!match) return false;

    const monthNames = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];
    const monthIndex = monthNames.indexOf(match[1]);
    if (monthIndex === -1) return false;

    const year = 2000 + parseInt(match[2], 10);
    const month = monthIndex + 1; // 1-indexed

    return isMonthComplete(year, month, asOfDate);
  });
}

/**
 * Gets the latest bill of a specific utility type.
 */
export function getLatestBillOfType(
  bills: Bill[],
  utilityType: Bill["utilityType"]
): Bill | undefined {
  return [...bills]
    .filter((b) => b.utilityType === utilityType)
    .sort((a, b) => b.billingPeriodEnd.localeCompare(a.billingPeriodEnd))[0];
}

/**
 * Gets the previous bill of the same utility type (the one before the latest).
 */
export function getPreviousBillOfType(
  bills: Bill[],
  utilityType: Bill["utilityType"]
): Bill | undefined {
  return [...bills]
    .filter((b) => b.utilityType === utilityType)
    .sort((a, b) => b.billingPeriodEnd.localeCompare(a.billingPeriodEnd))[1];
}

/**
 * Computes billing days from period start/end.
 */
export function getBillingDays(bill: Bill): number {
  const start = new Date(bill.billingPeriodStart + "T00:00:00");
  const end = new Date(bill.billingPeriodEnd + "T00:00:00");
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

/**
 * Checks if a water bill is bimonthly (>40 days).
 */
export function isWaterBimonthly(bill: Bill): boolean {
  if (bill.utilityType !== "water") return false;
  return getBillingDays(bill) > 40;
}

/**
 * Computes estimated monthly amount for a bimonthly bill.
 */
export function getMonthlyEquivalent(bill: Bill): number {
  const days = getBillingDays(bill);
  if (days <= 0) return bill.totalAmount;
  return Math.round((bill.totalAmount / days) * 30 * 100) / 100;
}

/**
 * Computes estimated monthly usage for a bimonthly bill.
 */
export function getMonthlyUsageEquivalent(bill: Bill): number {
  const days = getBillingDays(bill);
  if (days <= 0) return bill.usage;
  return Math.round((bill.usage / days) * 30 * 10) / 10;
}
