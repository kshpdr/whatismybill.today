/**
 * Adapter layer: parsed bill types → Bill[] (app data model)
 *
 * Provider mappings:
 *   PGEBill  →  [electricityBill, gasBill]  (one PDF → two Bills)
 *   SJWBill  →  [waterBill]                 (one PDF → one Bill)
 *
 * Adding a new provider:
 *   1. Create myProviderToBill(s)() here
 *   2. Add a case to toBills()
 *
 * This module is safe to import in client components — no Node.js deps.
 */

import type { Bill } from "../types";
import type { AnyBill, ParseBillResult, PGEBill, SJWBill } from "./types";

// ─── External metadata ────────────────────────────────────────────────────────

/**
 * Fields that come from the upload context, not from the bill itself.
 * The backend or route handler provides these when creating Bill records.
 */
export interface BillMeta {
  householdId: string;
  storageRef:  string;       // Firebase Storage path to the original PDF
  uploadedBy?: string;       // uid of the user who uploaded
  uploadedAt?: string;       // ISO timestamp — defaults to now if omitted
  ocrFallback?: boolean;     // true when bill was parsed via OCR path
}

// ─── Charge categorisation ────────────────────────────────────────────────────

const PROGRAMS_KW = ["public purpose", "ppp", "nuclear decommission", "wildfire fund", "wildfire hardening"];
const DELIVERY_KW = ["transmission", "distribution", "pcia", "power charge indifference", "competition transition", "recovery bond"];
const TAXES_KW    = ["tax", "franchise", "fee", "surcharge"];

function categorise(label: string): "generation" | "delivery" | "programs" | "taxes" | "other" {
  const l = label.toLowerCase();
  if (PROGRAMS_KW.some((k) => l.includes(k))) return "programs";
  if (DELIVERY_KW.some((k) => l.includes(k)))  return "delivery";
  if (TAXES_KW.some((k) => l.includes(k)))     return "taxes";
  return "other";
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// ─── Electricity charges ──────────────────────────────────────────────────────

function electricityCharges(pge: PGEBill): Bill["charges"] {
  const out: Bill["charges"] = [];

  // Generation is always its own line (SJCE)
  out.push({ label: "Generation (SJCE)", amount: round2(pge.electricity.generation.total) });

  // Climate Credit or other adjustments (typically 0 or negative)
  if (pge.electricity.adjustments !== 0) {
    out.push({ label: "Credits & Adjustments", amount: round2(pge.electricity.adjustments) });
  }

  const items = pge.electricity.delivery.lineItems;

  if (items.length > 0) {
    // Aggregate delivery line items into 3 buckets
    let delivery = 0, programs = 0, taxes = 0, other = 0;
    for (const item of items) {
      const cat = categorise(item.label);
      if      (cat === "delivery")  delivery  += item.amount;
      else if (cat === "programs")  programs  += item.amount;
      else if (cat === "taxes")     taxes     += item.amount;
      else                          other     += item.amount;
    }
    const deliveryTotal = round2(delivery + other);
    if (deliveryTotal !== 0) out.push({ label: "Delivery & Infrastructure", amount: deliveryTotal });
    if (programs !== 0)      out.push({ label: "Public Purpose Programs",   amount: round2(programs) });
    if (taxes    !== 0)      out.push({ label: "Taxes & Fees",              amount: round2(taxes) });
  } else {
    // Breakdown page wasn't parsed — fall back to delivery total
    out.push({ label: "Delivery", amount: round2(pge.electricity.delivery.total) });
  }

  return out;
}

// ─── Gas charges ──────────────────────────────────────────────────────────────

function gasCharges(pge: PGEBill): Bill["charges"] {
  const items = pge.gas.lineItems;
  if (items.length === 0) {
    return [{ label: "Gas Charges", amount: round2(pge.gas.total) }];
  }

  let commodity = 0, programs = 0, taxes = 0;
  for (const item of items) {
    const l = item.label.toLowerCase();
    if (l.includes("ppp") || l.includes("public purpose")) {
      programs += item.amount;
    } else if (l.includes("tax") || l.includes("franchise")) {
      taxes += item.amount;
    } else {
      // Tier 1/2 usage, commodity
      commodity += item.amount;
    }
  }

  const out: Bill["charges"] = [];
  if (commodity !== 0) out.push({ label: "Gas Commodity",   amount: round2(commodity) });
  if (programs  !== 0) out.push({ label: "Programs",        amount: round2(programs) });
  if (taxes     !== 0) out.push({ label: "Taxes & Fees",    amount: round2(taxes) });
  return out.length > 0 ? out : [{ label: "Gas Charges", amount: round2(pge.gas.total) }];
}

// ─── parseStatus helper ───────────────────────────────────────────────────────

function parseStatusFromFlags(flags: string[], ocrFallback?: boolean): Bill["parseStatus"] {
  // Any flag that starts with "missing_" on a critical field = warn but still success
  // We don't degrade to "failed" here — if we have a PGEBill, parsing succeeded.
  if (ocrFallback) return "success"; // OCR-derived bills are valid
  return "success";
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function pgeToElectricityBill(pge: PGEBill, meta: BillMeta): Bill {
  return {
    id:                 `${meta.householdId}-elec-${pge.electricity.periodStart}`,
    householdId:        meta.householdId,
    provider:           pge.provider,
    utilityType:        "electricity",
    billingPeriodStart: pge.electricity.periodStart,
    billingPeriodEnd:   pge.electricity.periodEnd,
    totalAmount:        round2(pge.electricity.total),
    usage:              pge.electricity.usageTotal,
    usageUnit:          "kWh",
    unitPrice:          round2(pge.electricity.effectiveUnitPrice),
    charges:            electricityCharges(pge),
    storageRef:         meta.storageRef,
    uploadedBy:         meta.uploadedBy,
    parseStatus:        parseStatusFromFlags(pge.flags, meta.ocrFallback),
    uploadedAt:         meta.uploadedAt ?? new Date().toISOString(),
  };
}

export function pgeToGasBill(pge: PGEBill, meta: BillMeta): Bill {
  return {
    id:                 `${meta.householdId}-gas-${pge.gas.periodStart}`,
    householdId:        meta.householdId,
    provider:           pge.provider,
    utilityType:        "gas",
    billingPeriodStart: pge.gas.periodStart,
    billingPeriodEnd:   pge.gas.periodEnd,
    totalAmount:        round2(pge.gas.total),
    usage:              pge.gas.usageTotal,
    usageUnit:          "Therms",
    unitPrice:          round2(pge.gas.effectiveUnitPrice),
    charges:            gasCharges(pge),
    storageRef:         meta.storageRef,
    uploadedBy:         meta.uploadedBy,
    parseStatus:        parseStatusFromFlags(pge.flags, meta.ocrFallback),
    uploadedAt:         meta.uploadedAt ?? new Date().toISOString(),
  };
}

/**
 * Main entry point.
 * Returns [electricityBill, gasBill] — always two items for a PG&E combined bill.
 */
export function pgeToBills(pge: PGEBill, meta: BillMeta): [Bill, Bill] {
  return [
    pgeToElectricityBill(pge, meta),
    pgeToGasBill(pge, meta),
  ];
}

// ─── SJW (San Jose Water) adapter ─────────────────────────────────────────────

function waterCharges(sjw: SJWBill): Bill["charges"] {
  const out: Bill["charges"] = [];

  if (sjw.charges.serviceCharge > 0) {
    out.push({ label: "Service Charge", amount: round2(sjw.charges.serviceCharge) });
  }

  const tierTotal = round2(sjw.charges.tiers.reduce((s, t) => s + t.amount, 0));
  if (tierTotal > 0) {
    out.push({ label: "Quantity Charges", amount: tierTotal });
  }

  let programs = 0, taxes = 0, other = 0;
  for (const item of sjw.charges.lineItems) {
    const l = item.label.toLowerCase();
    if (l.includes("puc") || l.includes("surcharge") || l.includes("assist")) {
      programs += item.amount;
    } else if (l.includes("tax") || l.includes("franchise") || l.includes("fee")) {
      taxes += item.amount;
    } else {
      other += item.amount;
    }
  }

  if (programs > 0) out.push({ label: "Programs & Surcharges", amount: round2(programs) });
  if (taxes    > 0) out.push({ label: "Taxes & Fees",          amount: round2(taxes) });
  if (other    > 0) out.push({ label: "Other Adjustments",     amount: round2(other) });

  return out.length > 0 ? out : [{ label: "Water Charges", amount: round2(sjw.charges.total) }];
}

export function sjwToBill(sjw: SJWBill, meta: BillMeta): Bill {
  return {
    id:                 `${meta.householdId}-water-${sjw.periodStart}`,
    householdId:        meta.householdId,
    provider:           sjw.provider,
    utilityType:        "water",
    billingPeriodStart: sjw.periodStart,
    billingPeriodEnd:   sjw.periodEnd,
    totalAmount:        round2(sjw.monthlySpend),
    usage:              sjw.usageTotal,
    usageUnit:          "CCF",
    unitPrice:          round2(sjw.effectiveUnitPrice),
    charges:            waterCharges(sjw),
    storageRef:         meta.storageRef,
    uploadedBy:         meta.uploadedBy,
    parseStatus:        sjw.flags.some((f) => f.startsWith("missing_")) ? "failed" : "success",
    uploadedAt:         meta.uploadedAt ?? new Date().toISOString(),
  };
}

// ─── Unified entry point ──────────────────────────────────────────────────────

/**
 * Convert any successfully-parsed bill into one or more Bill records.
 * Use this in route handlers after parseBillPDF() returns success.
 *
 * @example
 *   const result = await parseBillPDF(buffer);
 *   if (result.success && result.bill) {
 *     const bills = toBills(result, { householdId, storageRef, uploadedBy });
 *     // store bills in Firestore
 *   }
 */
export function toBills(result: ParseBillResult, meta: BillMeta): Bill[] {
  if (!result.success || !result.bill) return [];
  const billMeta = { ...meta, ocrFallback: result.ocrFallback };
  if (result.billType === "SJW") {
    return [sjwToBill(result.bill as SJWBill, billMeta)];
  }
  return pgeToBills(result.bill as PGEBill, billMeta);
}
