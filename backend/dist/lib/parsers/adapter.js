/**
 * Adapter: PGEBill → Bill[]
 *
 * One PG&E PDF contains both electricity and gas on the same statement.
 * The parser produces one PGEBill; the app's data model stores them as
 * two separate Bill records (utilityType "electricity" and "gas").
 *
 * This module is safe to import in client components — it has no Node.js
 * dependencies. The parser (index.ts) is server-only; the adapter is not.
 */
// ─── Charge categorisation ────────────────────────────────────────────────────
const PROGRAMS_KW = ["public purpose", "ppp", "nuclear decommission", "wildfire fund", "wildfire hardening"];
const DELIVERY_KW = ["transmission", "distribution", "pcia", "power charge indifference", "competition transition", "recovery bond"];
const TAXES_KW = ["tax", "franchise", "fee", "surcharge"];
function categorise(label) {
    const l = label.toLowerCase();
    if (PROGRAMS_KW.some((k) => l.includes(k)))
        return "programs";
    if (DELIVERY_KW.some((k) => l.includes(k)))
        return "delivery";
    if (TAXES_KW.some((k) => l.includes(k)))
        return "taxes";
    return "other";
}
function round2(n) {
    return Math.round(n * 100) / 100;
}
// ─── Electricity charges ──────────────────────────────────────────────────────
function electricityCharges(pge) {
    const out = [];
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
            if (cat === "delivery")
                delivery += item.amount;
            else if (cat === "programs")
                programs += item.amount;
            else if (cat === "taxes")
                taxes += item.amount;
            else
                other += item.amount;
        }
        const deliveryTotal = round2(delivery + other);
        if (deliveryTotal !== 0)
            out.push({ label: "Delivery & Infrastructure", amount: deliveryTotal });
        if (programs !== 0)
            out.push({ label: "Public Purpose Programs", amount: round2(programs) });
        if (taxes !== 0)
            out.push({ label: "Taxes & Fees", amount: round2(taxes) });
    }
    else {
        // Breakdown page wasn't parsed — fall back to delivery total
        out.push({ label: "Delivery", amount: round2(pge.electricity.delivery.total) });
    }
    return out;
}
// ─── Gas charges ──────────────────────────────────────────────────────────────
function gasCharges(pge) {
    const items = pge.gas.lineItems;
    if (items.length === 0) {
        return [{ label: "Gas Charges", amount: round2(pge.gas.total) }];
    }
    let commodity = 0, programs = 0, taxes = 0;
    for (const item of items) {
        const l = item.label.toLowerCase();
        if (l.includes("ppp") || l.includes("public purpose")) {
            programs += item.amount;
        }
        else if (l.includes("tax") || l.includes("franchise")) {
            taxes += item.amount;
        }
        else {
            // Tier 1/2 usage, commodity
            commodity += item.amount;
        }
    }
    const out = [];
    if (commodity !== 0)
        out.push({ label: "Gas Commodity", amount: round2(commodity) });
    if (programs !== 0)
        out.push({ label: "Programs", amount: round2(programs) });
    if (taxes !== 0)
        out.push({ label: "Taxes & Fees", amount: round2(taxes) });
    return out.length > 0 ? out : [{ label: "Gas Charges", amount: round2(pge.gas.total) }];
}
// ─── parseStatus helper ───────────────────────────────────────────────────────
function parseStatusFromFlags(flags, ocrFallback) {
    // Any flag that starts with "missing_" on a critical field = warn but still success
    // We don't degrade to "failed" here — if we have a PGEBill, parsing succeeded.
    if (ocrFallback)
        return "success"; // OCR-derived bills are valid
    return "success";
}
// ─── Public API ───────────────────────────────────────────────────────────────
export function pgeToElectricityBill(pge, meta) {
    return {
        id: `${meta.householdId}-elec-${pge.electricity.periodStart}`,
        householdId: meta.householdId,
        provider: pge.provider,
        utilityType: "electricity",
        billingPeriodStart: pge.electricity.periodStart,
        billingPeriodEnd: pge.electricity.periodEnd,
        totalAmount: round2(pge.electricity.total),
        usage: pge.electricity.usageTotal,
        usageUnit: "kWh",
        unitPrice: round2(pge.electricity.effectiveUnitPrice),
        charges: electricityCharges(pge),
        storageRef: meta.storageRef,
        uploadedBy: meta.uploadedBy,
        parseStatus: parseStatusFromFlags(pge.flags, meta.ocrFallback),
        uploadedAt: meta.uploadedAt ?? new Date().toISOString(),
    };
}
export function pgeToGasBill(pge, meta) {
    return {
        id: `${meta.householdId}-gas-${pge.gas.periodStart}`,
        householdId: meta.householdId,
        provider: pge.provider,
        utilityType: "gas",
        billingPeriodStart: pge.gas.periodStart,
        billingPeriodEnd: pge.gas.periodEnd,
        totalAmount: round2(pge.gas.total),
        usage: pge.gas.usageTotal,
        usageUnit: "Therms",
        unitPrice: round2(pge.gas.effectiveUnitPrice),
        charges: gasCharges(pge),
        storageRef: meta.storageRef,
        uploadedBy: meta.uploadedBy,
        parseStatus: parseStatusFromFlags(pge.flags, meta.ocrFallback),
        uploadedAt: meta.uploadedAt ?? new Date().toISOString(),
    };
}
/**
 * Main entry point.
 * Returns [electricityBill, gasBill] — always two items for a PG&E combined bill.
 */
export function pgeToBills(pge, meta) {
    return [
        pgeToElectricityBill(pge, meta),
        pgeToGasBill(pge, meta),
    ];
}
//# sourceMappingURL=adapter.js.map