/**
 * Deterministic PG&E bill parser.
 * Input: raw text extracted from a PG&E PDF bill (combined electricity + gas).
 * Output: normalized PGEBill object with validation flags.
 *
 * Parsing strategy:
 *   1. Extract full text (done by caller)
 *   2. Split into named sections using text anchors
 *   3. Parse each section independently with targeted regex
 *   4. Merge into normalized schema
 *   5. Compute derived fields and run validation
 *
 * No AI, no OCR, no network calls. Pure string → structured data.
 */

import type { BillingHistoryEntry, GasSegment, LineItem, PGEBill } from "./types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse a dollar string like "$1,234.56", "1234.56", or "-58.40" to a number. */
function parseAmt(s: string): number {
  if (!s) return 0;
  const cleaned = s.replace(/,/g, "").replace(/^\$/, "").trim();
  return parseFloat(cleaned) || 0;
}

/** Convert MM/DD/YYYY to ISO YYYY-MM-DD. Returns empty string if invalid. */
function toISO(mmddyyyy: string): string {
  const m = mmddyyyy.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return "";
  return `${m[3]}-${m[1]}-${m[2]}`;
}

/** Find the first regex match and return capture group 1 (trimmed). */
function first(text: string, re: RegExp): string {
  return text.match(re)?.[1]?.trim() ?? "";
}

/**
 * Extract a slice of the full text starting after `startAnchor`
 * and ending just before the first occurrence of `endAnchor`.
 * If endAnchor is not found, returns everything after startAnchor.
 */
function section(text: string, startAnchor: string, endAnchor?: string): string {
  const si = text.indexOf(startAnchor);
  if (si === -1) return "";
  const after = text.slice(si + startAnchor.length);
  if (!endAnchor) return after;
  const ei = after.indexOf(endAnchor);
  return ei === -1 ? after : after.slice(0, ei);
}

// ─── Section parsers ──────────────────────────────────────────────────────────

function parseSummary(text: string) {
  // The summary section lives between "Your Account Summary" and the first
  // page break or next major section.
  const raw = section(text, "Your Account Summary", "-- 1 of");

  const electricDelivery = parseAmt(
    first(raw, /Current PG&E Electric Delivery Charges\s+\$?([\d,]+\.?\d*)/)
  );
  const electricAdjustments = parseAmt(
    first(raw, /Electric Adjustments\s+(-?[\d,]+\.?\d*)/)
  );
  const electricGeneration = parseAmt(
    first(raw, /San Jose Clean Energy Electric Generation Charges\s+([\d,]+\.?\d*)/)
  );
  const gas = parseAmt(
    first(raw, /Current Gas Charges\s+([\d,]+\.?\d*)/)
  );

  // "Total Amount Due   by MM/DD/YYYY   $NNN.NN" (in-period summary line)
  const totalAmountDue = parseAmt(
    first(raw, /Total Amount Due\s+by\s+\S+\s+\$?([\d,]+\.?\d*)/)
  );

  const previousBalance = parseAmt(
    first(raw, /Amount Due on Previous Statement\s+\$?([\d,]+\.?\d*)/)
  );
  // Payments show as negative in the bill text, e.g. "-241.72"
  const paymentsReceived = parseAmt(
    first(raw, /Payment\(s\) Received Since Last Statement\s+(-?[\d,]+\.?\d*)/)
  );
  const balanceForward = parseAmt(
    first(raw, /Previous Unpaid Balance\s+\$?([\d,]+\.?\d*)/)
  );

  // currentCharges = charges generated this period only (excludes past-due carry-over)
  const currentCharges =
    totalAmountDue - Math.max(0, balanceForward);

  return {
    electricDelivery,
    electricAdjustments,
    electricGeneration,
    gas,
    currentCharges,
    totalAmountDue,
    previousBalance: previousBalance || undefined,
    paymentsReceived: paymentsReceived || undefined,
    balanceForward: balanceForward || undefined,
  };
}

function parseElectricDelivery(text: string) {
  const raw = section(text, "Details of PG&E Electric Delivery Charges", "Details of San Jose");

  // First date range in the section = overall billing period.
  // Separator may be "-", "–" (en-dash), or "to" depending on the billing period layout.
  const periodMatch = raw.match(
    /(\d{2}\/\d{2}\/\d{4})\s*(?:[-–]|to)\s*(\d{2}\/\d{2}\/\d{4})\s*\((\d+)\s*billing days\)/
  );
  const periodStart = periodMatch ? toISO(periodMatch[1]) : "";
  const periodEnd = periodMatch ? toISO(periodMatch[2]) : "";
  const billingDays = periodMatch ? parseInt(periodMatch[3]) : 0;

  const usageTotal = parseFloat(
    first(raw, /Total Usage\s+([\d.]+)\s*kWh/) || "0"
  );

  const total = parseAmt(
    first(raw, /Total PG&E Electric Delivery Charges\s+\$?([\d,]+\.?\d*)/)
  );

  return { periodStart, periodEnd, billingDays, usageTotal, total };
}

function parseElectricGeneration(text: string) {
  const raw = section(
    text,
    "Details of San Jose Clean Energy Electric Generation",
    "Details of Gas Charges"
  );

  // "Total San Jose Clean Energy Electric\nGeneration Charges  $NNN" — label wraps across lines
  const total = parseAmt(
    first(
      raw,
      /Total San Jose Clean Energy Electric\s+Generation\s+Charges\s+\$?([\d,]+\.?\d*)/
    )
  );

  // Cross-validate kWh usage with delivery page
  const usageCrossCheck = parseFloat(
    first(raw, /Total Usage\s+([\d.]+)\s*kWh/) || "0"
  );

  // Line items: "Generation - On Peak - Winter   29.469000 kWh @ $0.16939  $4.99"
  const lineItems: LineItem[] = [];
  const lineRe =
    /^(Generation\s*-[^\t\n]+?)\s+[\d.]+\s*kWh\s+@\s+\$[\d.]+\s+\$?([\d,]+\.\d{2})/gm;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(raw)) !== null) {
    lineItems.push({ label: m[1].trim(), amount: parseAmt(m[2]) });
  }

  return { total, usageCrossCheck, lineItems };
}

/**
 * Extract line items from "Your Electric Charges Breakdown" page.
 * This page has a clean flat layout:
 *   Transmission         $11.91
 *   Distribution          60.92
 *   Nuclear Decommissioning  -0.08
 *   Total Electric Charges  $90.21  ← stop here
 *
 * IMPORTANT: "Your Electric Charges Breakdown" is also referenced earlier in
 * the bill ("See the table reflecting 'Your Electric Charges Breakdown' on the
 * last page"). We must anchor to the actual table header which includes "(from
 * page 2)" — this only appears on the physical breakdown page.
 */
function parseElectricBreakdown(text: string): LineItem[] {
  // "Breakdown (from page 2)" uniquely identifies the actual table, not the
  // forward-reference on page 2.
  const raw = section(text, "Breakdown (from page 2)", "\nTotal Electric Charges");
  if (!raw) return [];

  const items: LineItem[] = [];
  // Match: "Label\t$?-?NUMBER.XX"  (tab-separated, with optional $ and optional -)
  const re = /^([A-Za-z][^\t\n]+?)\t+\$?(-?[\d,]+\.\d{2})\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const label = m[1].trim();
    if (
      label.startsWith("Total") ||
      label.startsWith("Visit") ||
      label.startsWith("Page") ||
      label.startsWith("See ")
    )
      continue;
    items.push({ label, amount: parseAmt(m[2]) });
  }
  return items;
}

function parseGas(text: string) {
  const raw = section(text, "Details of Gas Charges", "Your Electric Charges Breakdown");

  const periodMatch = raw.match(
    /(\d{2}\/\d{2}\/\d{4})\s*(?:[-–]|to)\s*(\d{2}\/\d{2}\/\d{4})\s*\((\d+)\s*billing days\)/
  );
  const periodStart = periodMatch ? toISO(periodMatch[1]) : "";
  const periodEnd = periodMatch ? toISO(periodMatch[2]) : "";
  const billingDays = periodMatch ? parseInt(periodMatch[3]) : 0;

  const usageTotal = parseFloat(
    first(raw, /Total Usage\s+([\d.]+)\s*Therms/) || "0"
  );

  const total = parseAmt(
    first(raw, /Total Gas Charges\s+\$?([\d,]+\.?\d*)/)
  );

  const segments = parseGasSegments(raw);
  const lineItems = segments.length > 0 ? aggregateGasLineItems(segments) : [];

  return { periodStart, periodEnd, billingDays, usageTotal, total, lineItems, segments };
}

/**
 * Parse one gas sub-period segment from its text slice.
 * Extracts tier usage quantities (Therms), dollar amounts, and surcharges.
 */
function parseGasSegment(
  segText: string,
  periodStart: string,
  periodEnd: string
): GasSegment {
  // "Tier 1 Allowance   44.40 Therms   (30 days x 1.48 Therms/day)"
  const tier1Allowance = parseFloat(
    first(segText, /Tier 1 Allowance\s+([\d.]+)\s*Therms?/) || "0"
  );

  // "Tier 1 Usage   0.490000Therms @ $2.52299  $1.24"
  // Capture group 1 = Therms quantity, group 2 = dollar amount
  const t1 = segText.match(
    /Tier 1 Usage\s+([\d.]+)\s*Therms?\s*@\s*\$[\d.]+\s+\$?([\d,]+\.\d{2})/
  );
  const tier1Usage = t1 ? parseFloat(t1[1]) : 0;
  const tier1Amount = t1 ? parseAmt(t1[2]) : 0;

  const t2 = segText.match(
    /Tier 2 Usage\s+([\d.]+)\s*Therms?\s*@\s*\$[\d.]+\s+\$?([\d,]+\.\d{2})/
  );
  const tier2Usage = t2 ? parseFloat(t2[1]) : 0;
  const tier2Amount = t2 ? parseAmt(t2[2]) : 0;

  const ppp = parseAmt(first(segText, /Gas PPP Surcharge[^\n]*?\t([\d,]+\.\d{2})/));
  const tax = parseAmt(
    first(segText, /San Jose Utility Users' Tax[^\n]*?\t([\d,]+\.\d{2})/)
  );
  const franchise = parseAmt(
    first(segText, /San Jose Franchise Surcharge\s+([\d,]+\.\d{2})/)
  );

  const lineItems: LineItem[] = [];
  if (tier1Amount) lineItems.push({ label: "Tier 1 Gas", amount: tier1Amount });
  if (tier2Amount) lineItems.push({ label: "Tier 2 Gas", amount: tier2Amount });
  if (ppp) lineItems.push({ label: "Gas PPP Surcharge", amount: ppp });
  if (tax) lineItems.push({ label: "Sales Tax", amount: tax });
  if (franchise) lineItems.push({ label: "Franchise Surcharge", amount: franchise });

  return {
    periodStart,
    periodEnd,
    ...(tier1Allowance ? { tier1Allowance } : {}),
    ...(tier1Usage ? { tier1Usage } : {}),
    ...(tier2Usage ? { tier2Usage } : {}),
    lineItems,
    subtotal: round2(lineItems.reduce((s, li) => s + li.amount, 0)),
  };
}

/**
 * Split the gas section into sub-period segments.
 * Each segment is introduced by a date (or date range) followed by "Your Tier Usage".
 * Single-day entries (e.g. "10/31/2025  Your Tier Usage") use the same date for start/end.
 */
function parseGasSegments(gasText: string): GasSegment[] {
  const headerRe =
    /(\d{2}\/\d{2}\/\d{4})(?:\s*(?:[-–]|to)\s*(\d{2}\/\d{2}\/\d{4}))?\s+Your Tier Usage/g;

  type Header = { index: number; periodStart: string; periodEnd: string };
  const headers: Header[] = [];
  let m: RegExpExecArray | null;
  while ((m = headerRe.exec(gasText)) !== null) {
    headers.push({
      index: m.index,
      periodStart: toISO(m[1]),
      periodEnd: toISO(m[2] ?? m[1]), // single-day → same date for both
    });
  }

  return headers.map((h, i) => {
    const sliceEnd =
      i + 1 < headers.length ? headers[i + 1].index : gasText.length;
    return parseGasSegment(gasText.slice(h.index, sliceEnd), h.periodStart, h.periodEnd);
  });
}

/**
 * Aggregate all segment line items into a single flattened LineItem[] for the
 * top-level gas.lineItems field (summed across sub-periods).
 */
function aggregateGasLineItems(segments: GasSegment[]): LineItem[] {
  const totals: Record<string, number> = {};
  for (const seg of segments) {
    for (const li of seg.lineItems) {
      totals[li.label] = round2((totals[li.label] ?? 0) + li.amount);
    }
  }
  return Object.entries(totals).map(([label, amount]) => ({ label, amount }));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Account info ─────────────────────────────────────────────────────────────

function parseAccountInfo(text: string) {
  // Account number appears multiple times; first match is fine
  const accountNumber = first(text, /Account No[.:]?\s+(\S+)/);

  // Statement/due dates: use the first occurrence (page 1 header)
  const statementDate = toISO(
    first(text, /Statement Date:\s+(\d{2}\/\d{2}\/\d{4})/)
  );
  const dueDate = toISO(
    first(text, /Due Date:\s+(\d{2}\/\d{2}\/\d{4})/)
  );

  // Customer name and address from "Service For:" block:
  //   Service For:\n.\nDENIS KOSHELEV\n269 SUNOL ST\nSAN JOSE, CA 95126
  const sfMatch = text.match(
    /Service For:\s*\n\.\s*\n([^\n]+)\n([^\n]+)\n([^\n]+)/
  );
  const customerName = sfMatch?.[1]?.trim() ?? "";
  const serviceAddress = sfMatch
    ? `${sfMatch[2].trim()}, ${sfMatch[3].trim()}`
    : "";

  return { accountNumber, statementDate, dueDate, customerName, serviceAddress };
}

// ─── Billing history ──────────────────────────────────────────────────────────

/**
 * Parse the "Monthly Billing History" table printed on page 1 of every PG&E bill.
 * Format: "For M/DD YYYY electric $ NNN.NN gas $ NN.NN  For ..."
 *
 * This is the fallback data source for months whose PDFs have undecodable
 * CrawfordTech/archive encoding — those PDFs render visually but text cannot
 * be extracted by any standard tool.
 */
export function extractBillingHistory(text: string): BillingHistoryEntry[] {
  const entries: BillingHistoryEntry[] = [];

  // Each entry: "For M/DD YYYY electric $ NNN.NN gas $ NN.NN"
  const re =
    /For\s+(\d{1,2}\/\d{2})\s+(\d{4})\s+electric\s+\$\s*([\d.]+)\s+gas\s+\$\s*([\d.]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    // Convert "M/DD YYYY" → ISO YYYY-MM-DD
    const [, mmdd, yyyy, elec, gas] = m;
    const [month, day] = mmdd.split("/");
    const statementDate = `${yyyy}-${month.padStart(2, "0")}-${day}`;
    const electricTotal = parseFloat(elec);
    const gasTotal = parseFloat(gas);
    entries.push({
      statementDate,
      electricTotal,
      gasTotal,
      monthlySpend: round2(electricTotal + gasTotal),
    });
  }

  return entries;
}

// ─── Main parser ──────────────────────────────────────────────────────────────

export function parsePGEText(text: string): PGEBill {
  const flags: string[] = [];

  const account = parseAccountInfo(text);
  const summary = parseSummary(text);
  const delivery = parseElectricDelivery(text);
  const generation = parseElectricGeneration(text);
  const breakdownItems = parseElectricBreakdown(text);
  const gas = parseGas(text);

  // ─── Validation ─────────────────────────────────────────────────────────────

  if (!generation.total) flags.push("missing_generation");
  if (!delivery.usageTotal) flags.push("missing_usage");
  if (!delivery.periodStart) flags.push("partial_bill");
  if (!gas.periodStart) flags.push("partial_bill");

  // Cross-validate electricity usage between delivery and generation pages
  if (
    delivery.usageTotal > 0 &&
    generation.usageCrossCheck > 0 &&
    Math.abs(delivery.usageTotal - generation.usageCrossCheck) > 0.5
  ) {
    flags.push("usage_mismatch");
  }

  // Verify current charges components sum correctly
  const computedCurrent =
    summary.electricDelivery +
    summary.electricAdjustments +
    summary.electricGeneration +
    summary.gas;
  if (
    summary.currentCharges > 0 &&
    Math.abs(computedCurrent - summary.currentCharges) > 0.10
  ) {
    flags.push("mismatch_total");
  }

  // Segment subtotals should sum close to gas.total
  if (gas.segments && gas.segments.length > 0) {
    const segSum = round2(gas.segments.reduce((s, seg) => s + seg.subtotal, 0));
    if (gas.total > 0 && Math.abs(segSum - gas.total) > 0.50) {
      flags.push("gas_segment_mismatch");
    }
  } else if (gas.lineItems.length > 0) {
    // Fallback: validate aggregated line items when no segments found
    const gasLineSum = gas.lineItems.reduce((s, li) => s + li.amount, 0);
    if (gas.total > 0 && Math.abs(gasLineSum - gas.total) > 1.0) {
      flags.push("gas_line_mismatch");
    }
  }

  // ─── Derived electricity values ──────────────────────────────────────────────

  // Prefer detail-page totals; fall back to summary values
  const delivTotal =
    delivery.total || summary.electricDelivery;
  const genTotal =
    generation.total || summary.electricGeneration;
  const elAdjustments = summary.electricAdjustments;

  // Net electricity cost = delivery (gross) + adjustments (usually negative) + generation
  const elTotal = round2(delivTotal + elAdjustments + genTotal);
  const elEffectivePrice =
    delivery.usageTotal > 0
      ? round2(elTotal / delivery.usageTotal * 100000) / 100000
      : 0;

  // ─── Derived gas values ───────────────────────────────────────────────────────

  const gasTotal = gas.total || summary.gas;
  const gasEffectivePrice =
    gas.usageTotal > 0
      ? round2(gasTotal / gas.usageTotal * 100000) / 100000
      : 0;

  // ─── Assemble output ─────────────────────────────────────────────────────────

  return {
    provider: "PG&E",

    ...account,

    summary: {
      electricDelivery: summary.electricDelivery,
      electricAdjustments: summary.electricAdjustments,
      electricGeneration: summary.electricGeneration,
      gas: summary.gas,
      currentCharges: round2(summary.currentCharges),
      totalAmountDue: summary.totalAmountDue,
      ...(summary.previousBalance !== undefined && {
        previousBalance: summary.previousBalance,
      }),
      ...(summary.paymentsReceived !== undefined && {
        paymentsReceived: summary.paymentsReceived,
      }),
      ...(summary.balanceForward !== undefined && {
        balanceForward: summary.balanceForward,
      }),
    },

    electricity: {
      periodStart: delivery.periodStart,
      periodEnd: delivery.periodEnd,
      billingDays: delivery.billingDays,

      usageTotal: delivery.usageTotal,
      usageUnit: "kWh",

      delivery: {
        total: delivTotal,
        lineItems: breakdownItems,
      },
      generation: {
        total: genTotal,
        lineItems: generation.lineItems,
      },
      adjustments: elAdjustments,

      total: elTotal,
      effectiveUnitPrice: elEffectivePrice,
    },

    gas: {
      periodStart: gas.periodStart,
      periodEnd: gas.periodEnd,
      billingDays: gas.billingDays,

      usageTotal: gas.usageTotal,
      usageUnit: "Therms",

      lineItems: gas.lineItems,
      ...(gas.segments && gas.segments.length > 0 ? { segments: gas.segments } : {}),

      total: gasTotal,
      effectiveUnitPrice: gasEffectivePrice,
    },

    monthlySpend: round2(summary.currentCharges || summary.totalAmountDue),

    billingHistory: extractBillingHistory(text),

    flags,
  };
}

/** Quick check: does this text look like a PG&E bill? */
export function isPGEBill(text: string): boolean {
  return text.includes("pge.com") || text.includes("PG&E");
}
