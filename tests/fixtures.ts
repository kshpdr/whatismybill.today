/**
 * Test fixtures with realistic bill data.
 * Based on actual PG&E and San Jose Water bill structures.
 */

import type { Bill } from "@/lib/types";
import type { PGEBill, SJWBill, ParseBillResult } from "@/lib/parsers/types";

// ─── Dates ──────────────────────────────────────────────────────────────────
// Test suite assumes "today" is March 21, 2026

export const TODAY = new Date("2026-03-21T12:00:00Z");

// ─── Bill Records (stored format) ───────────────────────────────────────────

/**
 * Electricity bill: Oct 14 – Nov 12, 2025 (29 days)
 * Expected pro-rating:
 *   - October: 17 days (Oct 14-31) → 17/29 = 58.62%
 *   - November: 12 days (Nov 1-12) → 12/29 = 41.38%
 */
export const ELEC_OCT_NOV: Bill = {
  id: "test-elec-oct-nov-2025",
  householdId: "test-household",
  provider: "PG&E",
  utilityType: "electricity",
  billingPeriodStart: "2025-10-14",
  billingPeriodEnd: "2025-11-12",
  totalAmount: 100,
  usage: 500,
  usageUnit: "kWh",
  unitPrice: 0.2,
  charges: [
    { label: "Generation (SJCE)", amount: 40 },
    { label: "Delivery & Infrastructure", amount: 50 },
    { label: "Taxes & Fees", amount: 10 },
  ],
  storageRef: "test/elec-oct-nov.pdf",
  uploadedAt: "2025-11-15T10:00:00Z",
};

/**
 * Gas bill: Oct 14 – Nov 10, 2025 (27 days)
 * Same statement as ELEC_OCT_NOV (gas meter read is often a day or two different)
 * Expected pro-rating: 17 days Oct, 10 days Nov
 */
export const GAS_OCT: Bill = {
  id: "test-gas-oct-2025",
  householdId: "test-household",
  provider: "PG&E",
  utilityType: "gas",
  billingPeriodStart: "2025-10-14",
  billingPeriodEnd: "2025-11-10",
  totalAmount: 50,
  usage: 20,
  usageUnit: "Therms",
  unitPrice: 2.5,
  charges: [
    { label: "Gas Commodity", amount: 40 },
    { label: "Taxes & Fees", amount: 10 },
  ],
  storageRef: "test/elec-oct-nov.pdf", // Same PDF as electricity
  uploadedAt: "2025-11-15T10:00:00Z",
};

/**
 * Water bill: Sep 5 – Nov 3, 2025 (59 days) - bimonthly
 * Expected pro-rating:
 *   - September: 25 days (Sep 5-30) → 25/59 = 42.37%
 *   - October: 31 days (Oct 1-31) → 31/59 = 52.54%
 *   - November: 3 days (Nov 1-3) → 3/59 = 5.08%
 */
export const WATER_SEP_NOV: Bill = {
  id: "test-water-sep-nov-2025",
  householdId: "test-household",
  provider: "San Jose Water",
  utilityType: "water",
  billingPeriodStart: "2025-09-05",
  billingPeriodEnd: "2025-11-03",
  totalAmount: 200,
  usage: 15,
  usageUnit: "CCF",
  unitPrice: 13.33,
  charges: [
    { label: "Service Charge", amount: 40 },
    { label: "Quantity Charges", amount: 150 },
    { label: "Taxes & Fees", amount: 10 },
  ],
  storageRef: "test/water-sep-nov.pdf",
  uploadedAt: "2025-11-10T10:00:00Z",
};

/**
 * Electricity bill: Nov 12 – Dec 11, 2025 (29 days)
 * Expected pro-rating:
 *   - November: 18 days (Nov 12-30) → 18/29 = 62.07%
 *   - December: 11 days (Dec 1-11) → 11/29 = 37.93%
 */
export const ELEC_NOV_DEC: Bill = {
  id: "test-elec-nov-dec-2025",
  householdId: "test-household",
  provider: "PG&E",
  utilityType: "electricity",
  billingPeriodStart: "2025-11-12",
  billingPeriodEnd: "2025-12-11",
  totalAmount: 120,
  usage: 550,
  usageUnit: "kWh",
  unitPrice: 0.218,
  charges: [
    { label: "Generation (SJCE)", amount: 48 },
    { label: "Delivery & Infrastructure", amount: 60 },
    { label: "Taxes & Fees", amount: 12 },
  ],
  storageRef: "test/elec-nov-dec.pdf",
  uploadedAt: "2025-12-15T10:00:00Z",
};

/**
 * Gas bill: Nov 12 – Dec 9, 2025 (27 days)
 * Same statement as ELEC_NOV_DEC (gas meter read 2 days before)
 */
export const GAS_NOV: Bill = {
  id: "test-gas-nov-2025",
  householdId: "test-household",
  provider: "PG&E",
  utilityType: "gas",
  billingPeriodStart: "2025-11-12",
  billingPeriodEnd: "2025-12-09",
  totalAmount: 60,
  usage: 25,
  usageUnit: "Therms",
  unitPrice: 2.4,
  charges: [
    { label: "Gas Commodity", amount: 48 },
    { label: "Taxes & Fees", amount: 12 },
  ],
  storageRef: "test/elec-nov-dec.pdf",
  uploadedAt: "2025-12-15T10:00:00Z",
};

/**
 * Electricity bill: Dec 11 – Jan 12, 2026 (32 days)
 * Expected pro-rating:
 *   - December: 20 days (Dec 11-31) → 20/32 = 62.5%
 *   - January: 12 days (Jan 1-12) → 12/32 = 37.5%
 */
export const ELEC_DEC_JAN: Bill = {
  id: "test-elec-dec-jan-2026",
  householdId: "test-household",
  provider: "PG&E",
  utilityType: "electricity",
  billingPeriodStart: "2025-12-11",
  billingPeriodEnd: "2026-01-12",
  totalAmount: 150,
  usage: 600,
  usageUnit: "kWh",
  unitPrice: 0.25,
  charges: [
    { label: "Generation (SJCE)", amount: 60 },
    { label: "Delivery & Infrastructure", amount: 75 },
    { label: "Taxes & Fees", amount: 15 },
  ],
  storageRef: "test/elec-dec-jan.pdf",
  uploadedAt: "2026-01-15T10:00:00Z",
};

/**
 * Gas bill: Dec 11 – Jan 10, 2026 (30 days)
 * Same statement as ELEC_DEC_JAN (gas meter read 2 days before)
 */
export const GAS_DEC: Bill = {
  id: "test-gas-dec-2025",
  householdId: "test-household",
  provider: "PG&E",
  utilityType: "gas",
  billingPeriodStart: "2025-12-11",
  billingPeriodEnd: "2026-01-10",
  totalAmount: 80,
  usage: 35,
  usageUnit: "Therms",
  unitPrice: 2.29,
  charges: [
    { label: "Gas Commodity", amount: 65 },
    { label: "Taxes & Fees", amount: 15 },
  ],
  storageRef: "test/elec-dec-jan.pdf",
  uploadedAt: "2026-01-15T10:00:00Z",
};

/**
 * Water bill: Nov 3 – Jan 5, 2026 (63 days) - bimonthly
 * Expected pro-rating:
 *   - November: 27 days (Nov 3-30) → 27/63 = 42.86%
 *   - December: 31 days (Dec 1-31) → 31/63 = 49.21%
 *   - January: 5 days (Jan 1-5) → 5/63 = 7.94%
 */
export const WATER_NOV_JAN: Bill = {
  id: "test-water-nov-jan-2026",
  householdId: "test-household",
  provider: "San Jose Water",
  utilityType: "water",
  billingPeriodStart: "2025-11-03",
  billingPeriodEnd: "2026-01-05",
  totalAmount: 220,
  usage: 16,
  usageUnit: "CCF",
  unitPrice: 13.75,
  charges: [
    { label: "Service Charge", amount: 42 },
    { label: "Quantity Charges", amount: 165 },
    { label: "Taxes & Fees", amount: 13 },
  ],
  storageRef: "test/water-nov-jan.pdf",
  uploadedAt: "2026-01-10T10:00:00Z",
};

/**
 * Electricity bill: Jan 12 – Feb 10, 2026 (29 days)
 * Expected pro-rating:
 *   - January: 19 days (Jan 12-31) → 19/29 = 65.52%
 *   - February: 10 days (Feb 1-10) → 10/29 = 34.48%
 */
export const ELEC_JAN_FEB: Bill = {
  id: "test-elec-jan-feb-2026",
  householdId: "test-household",
  provider: "PG&E",
  utilityType: "electricity",
  billingPeriodStart: "2026-01-12",
  billingPeriodEnd: "2026-02-10",
  totalAmount: 140,
  usage: 580,
  usageUnit: "kWh",
  unitPrice: 0.241,
  charges: [
    { label: "Generation (SJCE)", amount: 56 },
    { label: "Delivery & Infrastructure", amount: 70 },
    { label: "Taxes & Fees", amount: 14 },
  ],
  storageRef: "test/elec-jan-feb.pdf",
  uploadedAt: "2026-02-15T10:00:00Z",
};

/**
 * Gas bill: Jan 12 – Feb 8, 2026 (27 days)
 * Same statement as ELEC_JAN_FEB (gas meter read 2 days before)
 */
export const GAS_JAN: Bill = {
  id: "test-gas-jan-2026",
  householdId: "test-household",
  provider: "PG&E",
  utilityType: "gas",
  billingPeriodStart: "2026-01-12",
  billingPeriodEnd: "2026-02-08",
  totalAmount: 90,
  usage: 40,
  usageUnit: "Therms",
  unitPrice: 2.25,
  charges: [
    { label: "Gas Commodity", amount: 72 },
    { label: "Taxes & Fees", amount: 18 },
  ],
  storageRef: "test/elec-jan-feb.pdf",
  uploadedAt: "2026-02-15T10:00:00Z",
};

/**
 * Electricity bill: Feb 10 – Mar 12, 2026 (30 days)
 * Expected pro-rating:
 *   - February: 18 days (Feb 10-28) → 18/30 = 60%
 *   - March: 12 days (Mar 1-12) → 12/30 = 40%
 */
export const ELEC_FEB_MAR: Bill = {
  id: "test-elec-feb-mar-2026",
  householdId: "test-household",
  provider: "PG&E",
  utilityType: "electricity",
  billingPeriodStart: "2026-02-10",
  billingPeriodEnd: "2026-03-12",
  totalAmount: 130,
  usage: 555,
  usageUnit: "kWh",
  unitPrice: 0.234,
  charges: [
    { label: "Generation (SJCE)", amount: 52 },
    { label: "Delivery & Infrastructure", amount: 65 },
    { label: "Taxes & Fees", amount: 13 },
  ],
  storageRef: "test/elec-feb-mar.pdf",
  uploadedAt: "2026-03-15T10:00:00Z",
};

/**
 * Gas bill: Feb 10 – Mar 10, 2026 (28 days)
 * Same statement as ELEC_FEB_MAR (gas meter read 2 days before)
 */
export const GAS_FEB: Bill = {
  id: "test-gas-feb-2026",
  householdId: "test-household",
  provider: "PG&E",
  utilityType: "gas",
  billingPeriodStart: "2026-02-10",
  billingPeriodEnd: "2026-03-10",
  totalAmount: 71,
  usage: 30,
  usageUnit: "Therms",
  unitPrice: 2.37,
  charges: [
    { label: "Gas Commodity", amount: 57 },
    { label: "Taxes & Fees", amount: 14 },
  ],
  storageRef: "test/elec-feb-mar.pdf",
  uploadedAt: "2026-03-15T10:00:00Z",
};

/**
 * Water bill: Jan 5 – Mar 6, 2026 (60 days) - bimonthly
 * Expected pro-rating:
 *   - January: 26 days (Jan 5-31) → 26/60 = 43.33%
 *   - February: 28 days (Feb 1-28) → 28/60 = 46.67%
 *   - March: 6 days (Mar 1-6) → 6/60 = 10%
 */
export const WATER_JAN_MAR: Bill = {
  id: "test-water-jan-mar-2026",
  householdId: "test-household",
  provider: "San Jose Water",
  utilityType: "water",
  billingPeriodStart: "2026-01-05",
  billingPeriodEnd: "2026-03-06",
  totalAmount: 240,
  usage: 18,
  usageUnit: "CCF",
  unitPrice: 13.33,
  charges: [
    { label: "Service Charge", amount: 45 },
    { label: "Quantity Charges", amount: 180 },
    { label: "Taxes & Fees", amount: 15 },
  ],
  storageRef: "test/water-jan-mar.pdf",
  uploadedAt: "2026-03-10T10:00:00Z",
};

// ─── Bill sets for different test scenarios ─────────────────────────────────

/**
 * Full dataset: Sep 2025 – Mar 2026
 * Today is March 21, 2026 — March is incomplete
 */
export const FULL_BILL_SET: Bill[] = [
  ELEC_OCT_NOV,
  GAS_OCT,
  WATER_SEP_NOV,
  ELEC_NOV_DEC,
  GAS_NOV,
  ELEC_DEC_JAN,
  GAS_DEC,
  WATER_NOV_JAN,
  ELEC_JAN_FEB,
  GAS_JAN,
  ELEC_FEB_MAR,
  GAS_FEB,
  WATER_JAN_MAR,
];

/**
 * Only one month of complete data
 */
export const SINGLE_MONTH_SET: Bill[] = [ELEC_OCT_NOV, GAS_OCT];

/**
 * Only water bills (bimonthly)
 */
export const WATER_ONLY_SET: Bill[] = [WATER_SEP_NOV, WATER_NOV_JAN, WATER_JAN_MAR];

/**
 * Only energy bills (no water)
 */
export const ENERGY_ONLY_SET: Bill[] = [
  ELEC_OCT_NOV,
  GAS_OCT,
  ELEC_NOV_DEC,
  GAS_NOV,
  ELEC_DEC_JAN,
  GAS_DEC,
  ELEC_JAN_FEB,
  GAS_JAN,
  ELEC_FEB_MAR,
  GAS_FEB,
];

// ─── Expected calendar-month allocations ────────────────────────────────────

/**
 * Expected monthly allocations from FULL_BILL_SET
 * These are manually calculated based on the pro-rating formula.
 * 
 * For each bill: allocated = totalAmount × (overlapDays / totalDays)
 * Rounded to 2 decimal places.
 */
export const EXPECTED_MONTHLY_ALLOCATIONS = {
  "2025-09": {
    electricity: 0,
    gas: 0,
    // Water Sep 5 – Nov 3: 25 days in Sep out of 59 total = 25/59 × 200 = 84.75
    water: 84.75,
    total: 84.75,
  },
  "2025-10": {
    // Elec Oct 14 – Nov 12: 17 days in Oct out of 29 total = 17/29 × 100 = 58.62
    electricity: 58.62,
    // Gas Oct 14 – Nov 10: 17 days in Oct out of 27 total = 17/27 × 50 = 31.48
    gas: 31.48,
    // Water Sep 5 – Nov 3: 31 days in Oct out of 59 total = 31/59 × 200 = 105.08
    water: 105.08,
    total: 195.18,
  },
  "2025-11": {
    // Elec Oct-Nov: 12 days in Nov out of 29 = 12/29 × 100 = 41.38
    // Elec Nov-Dec: 18 days in Nov out of 29 = 18/29 × 120 = 74.48
    electricity: 41.38 + 74.48,
    // Gas Oct-Nov: 10 days in Nov out of 27 = 10/27 × 50 = 18.52
    // Gas Nov: 29 days in Nov out of 29 = 100%
    gas: 18.52 + 60,
    // Water Sep-Nov: 3 days in Nov out of 59 = 3/59 × 200 = 10.17
    // Water Nov-Jan: 27 days in Nov out of 63 = 27/63 × 220 = 94.29
    water: 10.17 + 94.29,
    total: 41.38 + 74.48 + 18.52 + 60 + 10.17 + 94.29,
  },
  "2025-12": {
    // Elec Nov-Dec: 11 days in Dec out of 29 = 11/29 × 120 = 45.52
    // Elec Dec-Jan: 20 days in Dec out of 32 = 20/32 × 150 = 93.75
    electricity: 45.52 + 93.75,
    // Gas Dec: 30 days in Dec out of 30 = 100%
    gas: 80,
    // Water Nov-Jan: 31 days in Dec out of 63 = 31/63 × 220 = 108.25
    water: 108.25,
    total: 45.52 + 93.75 + 80 + 108.25,
  },
  "2026-01": {
    // Elec Dec-Jan: 12 days in Jan out of 32 = 12/32 × 150 = 56.25
    // Elec Jan-Feb: 19 days in Jan out of 29 = 19/29 × 140 = 91.72
    electricity: 56.25 + 91.72,
    // Gas Jan: 30 days in Jan out of 30 = 100%
    gas: 90,
    // Water Nov-Jan: 5 days in Jan out of 63 = 5/63 × 220 = 17.46
    // Water Jan-Mar: 26 days in Jan out of 60 = 26/60 × 240 = 104
    water: 17.46 + 104,
    total: 56.25 + 91.72 + 90 + 17.46 + 104,
  },
  "2026-02": {
    // Elec Jan-Feb: 10 days in Feb out of 29 = 10/29 × 140 = 48.28
    // Elec Feb-Mar: 18 days in Feb out of 30 = 18/30 × 130 = 78
    electricity: 48.28 + 78,
    // Gas Feb: 27 days in Feb out of 27 = 100%
    gas: 71,
    // Water Jan-Mar: 28 days in Feb out of 60 = 28/60 × 240 = 112
    water: 112,
    total: 48.28 + 78 + 71 + 112,
  },
  "2026-03": {
    // Elec Feb-Mar: 12 days in Mar out of 30 = 12/30 × 130 = 52
    electricity: 52,
    gas: 0,
    // Water Jan-Mar: 6 days in Mar out of 60 = 6/60 × 240 = 24
    water: 24,
    total: 52 + 24,
  },
};

// ─── Parsed bill types (for adapter tests) ──────────────────────────────────

export const SAMPLE_PGE_BILL: PGEBill = {
  provider: "PG&E",
  accountNumber: "1234567890",
  statementDate: "2026-02-15",
  dueDate: "2026-03-05",
  customerName: "Test User",
  serviceAddress: "123 Test St, San Jose, CA 95112",
  summary: {
    electricDelivery: 65,
    electricAdjustments: 0,
    electricGeneration: 52,
    gas: 71,
    currentCharges: 188,
    totalAmountDue: 188,
    previousBalance: 0,
    paymentsReceived: 0,
    balanceForward: 0,
  },
  electricity: {
    periodStart: "2026-01-12",
    periodEnd: "2026-02-10",
    billingDays: 29,
    usageTotal: 580,
    usageUnit: "kWh",
    delivery: {
      total: 65,
      lineItems: [
        { label: "Transmission", amount: 10 },
        { label: "Distribution", amount: 45 },
        { label: "Public Purpose Programs", amount: 5 },
        { label: "State Tax", amount: 5 },
      ],
    },
    generation: {
      total: 52,
      lineItems: [{ label: "San Jose Clean Energy", amount: 52 }],
    },
    adjustments: 0,
    total: 117,
    effectiveUnitPrice: 0.2017,
  },
  gas: {
    periodStart: "2026-02-01",
    periodEnd: "2026-02-28",
    billingDays: 27,
    usageTotal: 30,
    usageUnit: "Therms",
    lineItems: [
      { label: "Tier 1 Usage", amount: 45 },
      { label: "Tier 2 Usage", amount: 12 },
      { label: "PPP", amount: 8 },
      { label: "State Tax", amount: 6 },
    ],
    total: 71,
    effectiveUnitPrice: 2.367,
  },
  monthlySpend: 188,
  billingHistory: [],
  flags: [],
};

export const SAMPLE_SJW_BILL: SJWBill = {
  provider: "San Jose Water",
  accountNumber: "9876543210",
  billDate: "2026-03-10",
  dueDate: "AUTO_PAY",
  customerName: "Test User",
  serviceAddress: "123 Test St, San Jose, CA 95112",
  rateCode: "R-1",
  periodStart: "2026-01-05",
  periodEnd: "2026-03-06",
  billingDays: 60,
  usageTotal: 18,
  usageUnit: "CCF",
  charges: {
    serviceCharge: 45,
    tiers: [
      { quantity: 10, rate: 8.5, amount: 85 },
      { quantity: 8, rate: 11.875, amount: 95 },
    ],
    lineItems: [
      { label: "GRC Surcharge", amount: 10 },
      { label: "State Tax", amount: 5 },
    ],
    total: 240,
  },
  previousBalance: 0,
  paymentsReceived: 0,
  totalAmountDue: 0, // Auto pay
  monthlySpend: 240,
  effectiveUnitPrice: 13.33,
  monthlyAllocations: [
    { month: "2026-01", days: 26, usage: 7.8, spend: 104 },
    { month: "2026-02", days: 28, usage: 8.4, spend: 112 },
    { month: "2026-03", days: 6, usage: 1.8, spend: 24 },
  ],
  flags: [],
};

export const SAMPLE_PARSE_RESULT_PGE: ParseBillResult = {
  success: true,
  bill: SAMPLE_PGE_BILL,
  billType: "PGE",
};

export const SAMPLE_PARSE_RESULT_SJW: ParseBillResult = {
  success: true,
  bill: SAMPLE_SJW_BILL,
  billType: "SJW",
};

// ─── Helper to create bills with custom dates ──────────────────────────────

export function makeBill(
  overrides: Partial<Bill> & {
    utilityType: Bill["utilityType"];
    billingPeriodStart: string;
    billingPeriodEnd: string;
    totalAmount: number;
  }
): Bill {
  return {
    id: `test-${overrides.utilityType}-${overrides.billingPeriodStart}`,
    householdId: "test-household",
    provider: overrides.utilityType === "water" ? "San Jose Water" : "PG&E",
    usageUnit: overrides.utilityType === "electricity" ? "kWh" : overrides.utilityType === "gas" ? "Therms" : "CCF",
    usage: 100,
    unitPrice: 1,
    charges: [],
    storageRef: "test/bill.pdf",
    uploadedAt: new Date().toISOString(),
    ...overrides,
  };
}
