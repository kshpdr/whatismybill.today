/**
 * Converts a ManualBillEntry (form data) into a PGEBill so the rest of the
 * app — dashboard, Firestore writes, charts — treats manual and parsed bills
 * identically.
 *
 * Computed fields (effectiveUnitPrice, totals, currentCharges) are derived
 * the same way the PDF parser derives them, so numbers stay consistent.
 */

import type { ManualBillEntry, PGEBill } from "./types";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function daysBetween(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.round(ms / 86_400_000);
}

export function manualEntryToPGEBill(entry: ManualBillEntry): PGEBill {
  const adj = entry.electricityAdjustments ?? 0;
  const balanceFwd = entry.balanceForward ?? 0;

  const elTotal = round2(
    entry.electricityDeliveryCost + adj + entry.electricityGenerationCost
  );
  const elEffectivePrice =
    entry.electricityUsageKwh > 0
      ? round2((elTotal / entry.electricityUsageKwh) * 100000) / 100000
      : 0;

  const gasEffectivePrice =
    entry.gasUsageTherms > 0
      ? round2((entry.gasCost / entry.gasUsageTherms) * 100000) / 100000
      : 0;

  const currentCharges = round2(entry.totalAmountDue - Math.max(0, balanceFwd));

  return {
    provider: "PG&E",

    accountNumber: entry.accountNumber,
    statementDate: entry.statementDate,
    dueDate: entry.dueDate,

    // Not available from a manual entry
    customerName: "",
    serviceAddress: "",

    summary: {
      electricDelivery: entry.electricityDeliveryCost,
      electricAdjustments: adj,
      electricGeneration: entry.electricityGenerationCost,
      gas: entry.gasCost,
      currentCharges,
      totalAmountDue: entry.totalAmountDue,
      ...(balanceFwd > 0 ? { balanceForward: balanceFwd } : {}),
    },

    electricity: {
      periodStart: entry.electricityPeriodStart,
      periodEnd: entry.electricityPeriodEnd,
      billingDays: daysBetween(entry.electricityPeriodStart, entry.electricityPeriodEnd),

      usageTotal: entry.electricityUsageKwh,
      usageUnit: "kWh",

      delivery: { total: entry.electricityDeliveryCost, lineItems: [] },
      generation: { total: entry.electricityGenerationCost, lineItems: [] },
      adjustments: adj,

      total: elTotal,
      effectiveUnitPrice: elEffectivePrice,
    },

    gas: {
      periodStart: entry.gasPeriodStart,
      periodEnd: entry.gasPeriodEnd,
      billingDays: daysBetween(entry.gasPeriodStart, entry.gasPeriodEnd),

      usageTotal: entry.gasUsageTherms,
      usageUnit: "Therms",

      lineItems: [],
      total: entry.gasCost,
      effectiveUnitPrice: gasEffectivePrice,
    },

    monthlySpend: currentCharges,

    flags: ["manual_entry"],
  };
}
