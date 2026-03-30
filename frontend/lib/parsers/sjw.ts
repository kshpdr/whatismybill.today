/**
 * San Jose Water Company bill parser.
 *
 * Bill structure (single-page format):
 *   Header      — account number, bill date, due date
 *   Billing Info — customer name, address, period, rate code
 *   Meter Reading — previous/current reads, total CCF
 *   Consumption History — CCF, gallons, days, gal/day
 *   Current Charges — service charge, tiered quantity charges,
 *                     surcharges/taxes/adjustments, Current Charges total
 *   Footer — previous balance, payments received (CR), total due
 *
 * Notes:
 *  - Bills are often bimonthly; monthlyAllocations pro-rates by days-in-month.
 *  - Use monthlySpend (= currentCharges) for analytics, never totalAmountDue.
 *  - "Auto Pay" due date is stored as "AUTO_PAY".
 *  - Tier rate values always have exactly 4 decimal places in SJW PDFs;
 *    this lets us split the merged `<rate><amount>` token precisely.
 */

import type { LineItem, MonthlyAllocation, SJWBill, SJWTier } from "./types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseAmt(s: string): number {
  return parseFloat(s.replace(/,/g, "").replace(/\$$/, "")) || 0;
}

function toISO(mmddyyyy: string): string {
  const [m, d, y] = mmddyyyy.split("/");
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function daysBetween(isoA: string, isoB: string): number {
  return Math.round(
    (new Date(isoB + "T00:00:00").getTime() -
      new Date(isoA + "T00:00:00").getTime()) /
      86_400_000
  );
}

// ─── Detection ────────────────────────────────────────────────────────────────

export function isSJWBill(text: string): boolean {
  return (
    /san\s+jose\s+water/i.test(text) &&
    /CURRENT CHARGES/i.test(text) &&
    /Billing Period/i.test(text)
  );
}

// ─── Monthly allocation ───────────────────────────────────────────────────────

function computeMonthlyAllocations(
  periodStart: string,
  periodEnd: string,
  totalUsage: number,
  totalSpend: number
): MonthlyAllocation[] {
  if (!periodStart || !periodEnd) return [];

  const start = new Date(periodStart + "T00:00:00");
  const end   = new Date(periodEnd   + "T00:00:00");
  // Total days is end - start (end date excluded from billing per meter-read convention)
  const totalDays = daysBetween(periodStart, periodEnd);
  if (totalDays <= 0) return [];

  const allocations: MonthlyAllocation[] = [];
  // Walk month by month from start to end
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1);

  while (cursor <= end) {
    const y = cursor.getFullYear();
    const mo = cursor.getMonth();

    const sliceStart = cursor > start ? cursor : start;
    const monthEnd   = new Date(y, mo + 1, 0); // last calendar day of month
    const sliceEnd   = monthEnd < end ? monthEnd : end;

    // Days in this slice (sliceStart inclusive, sliceEnd exclusive like billing convention)
    const sliceDays = Math.max(
      0,
      Math.round((sliceEnd.getTime() - sliceStart.getTime()) / 86_400_000)
    );

    if (sliceDays > 0) {
      const ratio = sliceDays / totalDays;
      allocations.push({
        month: `${y}-${String(mo + 1).padStart(2, "0")}`,
        days:  sliceDays,
        usage: round2(totalUsage * ratio),
        spend: round2(totalSpend * ratio),
      });
    }

    cursor = new Date(y, mo + 1, 1);
  }

  return allocations;
}

// ─── Charge section parsers ───────────────────────────────────────────────────

/**
 * Parse tier quantity charge lines.
 * Format in PDF: `{qty}X ${rate4decimal}{amount}` — rate always has 4 decimal
 * places, which lets us split the merged token precisely.
 * e.g. "3.80000X $4.656217.69"  →  qty=3.8, rate=4.6562, amount=17.69
 */
function parseTiers(block: string): SJWTier[] {
  const tiers: SJWTier[] = [];
  // rate always has exactly 4 decimal digits → use that to split token
  const re = /([\d.]+)\s*[Xx]\s*\$([\d]+\.[\d]{4})([\d,]+\.[\d]{2})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    tiers.push({
      quantity: parseFloat(m[1]),
      rate:     parseFloat(m[2]),
      amount:   parseAmt(m[3]),
    });
  }
  return tiers;
}

/**
 * Parse the named line items that follow the tier charges.
 * Handles both:
 *   same-line:  "Safe Drinking Wtr Ln 2008-B0.03"
 *   next-line:  "2024 GRC Balance and Memo \n5.13"
 */
function parseChargeLineItems(block: string): LineItem[] {
  // Remove tier lines so they don't interfere
  const noTiers = block.replace(/([\d.]+)\s*[Xx]\s*\$[\d]+\.[\d]{4}[\d,]+\.[\d]{2}/g, "");

  const lines = noTiers
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const items: LineItem[] = [];
  let i = 0;

  const AMT_RE = /^([\d,]+\.\d{2})$/;

  while (i < lines.length) {
    const line = lines[i];

    // Skip "Quantity Charges" header
    if (/^Quantity Charges$/i.test(line)) { i++; continue; }
    // Stop at totals / balance lines
    if (/^Current Charges$/i.test(line)) break;
    if (/^Previous Balance/i.test(line)) break;

    // Try: label + amount on same line  e.g. "City Utility Users Tax 5%11.34"
    const sameLineMatch = line.match(/^(.+?)\s*\$?([\d,]+\.\d{2})\s*$/);
    if (sameLineMatch) {
      const label  = sameLineMatch[1].trim();
      const amount = parseAmt(sameLineMatch[2]);
      // Reject if "label" looks like a tier line or is empty
      if (label && !/[Xx]\s*\$/i.test(label)) {
        items.push({ label, amount });
        i++;
        continue;
      }
    }

    // Try: label on this line, bare amount on next line
    if (i + 1 < lines.length && AMT_RE.test(lines[i + 1])) {
      const amount = parseAmt(lines[i + 1]);
      items.push({ label: line, amount });
      i += 2;
      continue;
    }

    i++;
  }

  return items;
}

// ─── Main parser ──────────────────────────────────────────────────────────────

export function parseSJWText(text: string): SJWBill {
  const flags: string[] = [];

  // ── Header ────────────────────────────────────────────────────────────────

  // Account number appears in both header ("2488928987-2 12/30/2025 1 of 1") and stub
  // Use the stub form which is cleanly labelled
  const accountMatch =
    text.match(/Account Number:\s*([\d-]+)/i) ??
    text.match(/Account Number\s*Bill Date[\s\S]{0,5}?([\d-]{5,})/i);
  const accountNumber = accountMatch?.[1]?.trim() ?? "";

  // Bill date — appears twice in the bill; pick the one after "Bill Date:"
  const billDateMatch = text.match(/Bill Date:\s*\n?([\d]{2}\/[\d]{2}\/[\d]{4})/i);
  const billDate = billDateMatch ? toISO(billDateMatch[1]) : "";

  // Due date — may be "Auto Pay"
  const dueDateMatch = text.match(/Payment Due By:\s*([\d]{2}\/[\d]{2}\/[\d]{4})/i);
  const dueDate = dueDateMatch ? toISO(dueDateMatch[1]) : "AUTO_PAY";

  if (!accountNumber) flags.push("missing_account");
  if (!billDate)      flags.push("missing_bill_date");

  // ── Billing information ────────────────────────────────────────────────────

  const customerNameMatch   = text.match(/Customer Name:\s*(.+)/i);
  const serviceAddressMatch = text.match(/Service Address:\s*(.+)/i);
  const rateCodeMatch       = text.match(/Rate Code \/ Service Size:\s*(.+)/i);

  const customerName   = customerNameMatch?.[1]?.trim()   ?? "";
  const serviceAddress = serviceAddressMatch?.[1]?.trim() ?? "";
  const rateCode       = rateCodeMatch?.[1]?.trim()       ?? "";

  // ── Billing period ────────────────────────────────────────────────────────

  const periodMatch = text.match(
    /Billing Period:\s*(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/i
  );
  const periodStart = periodMatch ? toISO(periodMatch[1]) : "";
  const periodEnd   = periodMatch ? toISO(periodMatch[2]) : "";
  const billingDays = periodStart && periodEnd ? daysBetween(periodStart, periodEnd) : 0;

  if (!periodStart || !periodEnd) flags.push("missing_period");

  // ── Current Charges section ────────────────────────────────────────────────

  // Extract block between "CURRENT CHARGES" and "Previous Balance"
  const chargeBlockMatch = text.match(
    /CURRENT CHARGES([\s\S]+?)(?=Previous Balance|$)/i
  );
  const chargeBlock = chargeBlockMatch?.[1] ?? "";

  // Service charge
  const serviceChargeMatch = chargeBlock.match(/Service Charge\s*\$?([\d,]+\.?\d*)/i);
  const serviceCharge = serviceChargeMatch ? parseAmt(serviceChargeMatch[1]) : 0;

  // ── Total CCF ─────────────────────────────────────────────────────────────

  // Primary: sum tier quantities (always matches billing exactly).
  // Consumption history cross-check: extract the first number on the "Current"
  // line of CONSUMPTION HISTORY (numbers are concatenated without spaces in PDF).
  const tiers = parseTiers(chargeBlock);
  const tierQtyTotal = round2(tiers.reduce((s, t) => s + t.quantity, 0));

  // The CONSUMPTION HISTORY "Current" row looks like "Current107480..." where
  // the CCF is the leading portion. Extract it for validation only.
  const consumptionMatch = text.match(
    /CONSUMPTION HISTORY[\s\S]{0,300}?Current\s*(\d+)/i
  );
  const consumptionCCF = consumptionMatch ? parseFloat(consumptionMatch[1]) : 0;

  // Use tier sum as ground truth; flag if consumption history disagrees materially
  let totalCCF = tierQtyTotal;
  if (totalCCF === 0) totalCCF = consumptionCCF;  // last resort fallback

  // Named line items (GRC, surcharges, taxes, etc.)
  const lineItems = parseChargeLineItems(chargeBlock);

  // Current Charges total — the line "Current Charges" followed by the dollar amount
  // Note: "CURRENT CHARGES" (all-caps) is the section header; "Current Charges" (title-case) is the total
  const currentChargesMatch = chargeBlock.match(/Current Charges\s*\n?\$?([\d,]+\.?\d*)/i);
  const currentCharges = currentChargesMatch ? parseAmt(currentChargesMatch[1]) : 0;

  // ── Balance / payments / total ────────────────────────────────────────────

  const prevBalanceMatch = text.match(/Previous Balance\s*\n?\$?([\d,]+\.?\d*)/i);
  const previousBalance  = prevBalanceMatch ? parseAmt(prevBalanceMatch[1]) : 0;

  // "Payments Received 09/07/2025\n134.50 CR" or "No Payments Received\n0.00"
  const paymentsMatch = text.match(/Payments Received[^\n]*\n?\s*([\d,]+\.?\d*)\s*CR/i);
  const paymentsReceived = paymentsMatch ? -parseAmt(paymentsMatch[1]) : 0;

  // Total due — may be "Auto Pay"
  const totalDueMatch = text.match(/Total Due\s*\$?([\d,]+\.?\d*)/i);
  const totalAmountDue = totalDueMatch ? parseAmt(totalDueMatch[1]) : 0;

  // ── Validation ────────────────────────────────────────────────────────────

  if (currentCharges === 0) flags.push("missing_current_charges");
  if (totalCCF       === 0) flags.push("missing_usage");

  // Check: sum of all charge components ≈ currentCharges
  const computedTotal = round2(
    serviceCharge +
    tiers.reduce((s, t) => s + t.amount, 0) +
    lineItems.reduce((s, i) => s + i.amount, 0)
  );
  if (Math.abs(computedTotal - currentCharges) > 0.05) {
    flags.push("charges_mismatch");
  }

  // Check: totalAmountDue ≈ currentCharges + previousBalance + paymentsReceived
  // (paymentsReceived is negative, so effectively: current + prev - |payments|)
  if (totalAmountDue > 0) {
    const expectedTotal = round2(currentCharges + previousBalance + paymentsReceived);
    if (Math.abs(expectedTotal - totalAmountDue) > 0.05) {
      flags.push("mismatch_total");
    }
  }

  // ── Derived fields ────────────────────────────────────────────────────────

  const monthlySpend      = currentCharges;
  const effectiveUnitPrice = totalCCF > 0 ? round2(currentCharges / totalCCF) : 0;
  const monthlyAllocations = computeMonthlyAllocations(
    periodStart,
    periodEnd,
    totalCCF,
    currentCharges
  );

  return {
    provider: "San Jose Water",
    accountNumber,
    billDate,
    dueDate,
    customerName,
    serviceAddress,
    rateCode,
    periodStart,
    periodEnd,
    billingDays,
    usageTotal: totalCCF,
    usageUnit:  "CCF",
    charges: {
      serviceCharge,
      tiers,
      lineItems,
      total: currentCharges,
    },
    previousBalance,
    paymentsReceived,
    totalAmountDue,
    monthlySpend,
    effectiveUnitPrice,
    monthlyAllocations,
    flags,
  };
}
