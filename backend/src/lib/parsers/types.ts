export interface LineItem {
  label: string;
  amount: number;
}

/**
 * One entry from the "Monthly Billing History" table printed on page 1 of every bill.
 * PG&E includes the last 7 months of electric+gas totals here.
 */
export interface BillingHistoryEntry {
  statementDate: string; // ISO YYYY-MM-DD
  electricTotal: number; // delivery + generation combined
  gasTotal: number;
  monthlySpend: number; // electricTotal + gasTotal
}

/**
 * One sub-period block within a gas detail page.
 * Gas billing periods often span month boundaries, so PG&E splits them into
 * segments — each with its own tier rates and allowances.
 * These are NOT separate bills; they're internal accounting segments.
 */
export interface GasSegment {
  periodStart: string; // ISO YYYY-MM-DD
  periodEnd: string; // ISO YYYY-MM-DD (same as periodStart for single-day entries)
  tier1Allowance?: number; // Therms
  tier1Usage?: number; // Therms consumed in Tier 1
  tier2Usage?: number; // Therms consumed in Tier 2
  lineItems: LineItem[]; // Dollar charges for this segment
  subtotal: number; // Sum of lineItems.amount
}

/**
 * Normalized representation of a PG&E combined electricity + gas bill.
 * One PDF → one PGEBill (contains both electricity and gas sections).
 * Server-side only — never import in client components.
 */
export interface PGEBill {
  provider: "PG&E";

  accountNumber: string;
  statementDate: string; // ISO YYYY-MM-DD
  dueDate: string; // ISO YYYY-MM-DD

  customerName: string;
  serviceAddress: string;

  summary: {
    electricDelivery: number; // "Current PG&E Electric Delivery Charges" (gross, pre-adjustment)
    electricAdjustments: number; // e.g. California Climate Credit (usually 0, negative when applied)
    electricGeneration: number; // San Jose Clean Energy charges
    gas: number;

    currentCharges: number; // Actual charges this period: totalAmountDue - balanceForward
    totalAmountDue: number; // Including any past-due balance

    previousBalance?: number;
    paymentsReceived?: number;
    balanceForward?: number; // "Previous Unpaid Balance" — portion of totalAmountDue not from this period
  };

  electricity: {
    periodStart: string; // ISO YYYY-MM-DD
    periodEnd: string;
    billingDays: number;

    usageTotal: number;
    usageUnit: "kWh";

    delivery: {
      total: number; // gross, before adjustments
      lineItems: LineItem[]; // from "Your Electric Charges Breakdown" page
    };

    generation: {
      total: number;
      lineItems: LineItem[];
    };

    adjustments: number; // Climate Credit etc. (typically 0 or negative)

    total: number; // delivery.total + adjustments + generation.total (net cost to customer)
    effectiveUnitPrice: number; // $/kWh = total / usageTotal
  };

  gas: {
    periodStart: string;
    periodEnd: string;
    billingDays: number;

    usageTotal: number;
    usageUnit: "Therms";

    lineItems: LineItem[]; // Aggregated across all segments

    /**
     * Optional per-segment breakdown. One entry per sub-period block on the
     * gas detail page. Sum of segment subtotals should equal gas.total.
     */
    segments?: GasSegment[];

    total: number;
    effectiveUnitPrice: number; // $/Therm = total / usageTotal
  };

  /**
   * Best estimate of what the household actually spent this billing period.
   * = currentCharges (excludes carried-over past-due balances)
   */
  monthlySpend: number;

  /**
   * Monthly billing history table from page 1.
   * Contains the last 7 months of electric+gas totals as reported by PG&E.
   */
  billingHistory?: BillingHistoryEntry[];

  flags: string[];
}

// ─── San Jose Water bill ──────────────────────────────────────────────────────

export interface MonthlyAllocation {
  month: string;   // "YYYY-MM"
  days: number;
  usage: number;   // allocated CCF
  spend: number;   // allocated $ (from currentCharges, never totalAmountDue)
}

export interface SJWTier {
  quantity: number;
  rate: number;
  amount: number;
}

export interface SJWBill {
  provider: "San Jose Water";

  accountNumber: string;
  billDate: string;   // ISO YYYY-MM-DD
  dueDate: string;    // ISO YYYY-MM-DD | "AUTO_PAY"

  customerName: string;
  serviceAddress: string;
  rateCode: string;

  periodStart: string;
  periodEnd: string;
  billingDays: number;

  usageTotal: number;
  usageUnit: "CCF";

  charges: {
    serviceCharge: number;
    tiers: SJWTier[];
    lineItems: LineItem[];
    total: number;
  };

  previousBalance: number;
  paymentsReceived: number;
  totalAmountDue: number;

  monthlySpend: number;
  effectiveUnitPrice: number;
  monthlyAllocations: MonthlyAllocation[];

  flags: string[];
}

// ─── Union of all parsed bill types ──────────────────────────────────────────

export type AnyBill = PGEBill | SJWBill;
export type BillProviderType = "PGE" | "SJW";

// ─── Parse result ─────────────────────────────────────────────────────────────

export interface ParseBillResult {
  success: boolean;
  bill?: AnyBill;
  billType?: BillProviderType;
  error?: string;
  rawText?: string;
  encodingError?: boolean;
  ocrFallback?: boolean;
}

// ─── Manual entry ─────────────────────────────────────────────────────────────

/**
 * What a user types into the manual bill entry form.
 * All required fields map 1:1 to dashboard-critical values.
 * Optional fields allow capturing more detail if the user has time.
 *
 * This is intentionally flat and human-friendly — no nested objects,
 * no computed fields, no internal IDs.
 */
export interface ManualBillEntry {
  // Statement-level
  provider: "PG&E"; // hardcoded for MVP; expand later
  accountNumber: string;
  statementDate: string; // ISO YYYY-MM-DD
  dueDate: string; // ISO YYYY-MM-DD
  totalAmountDue: number;
  balanceForward?: number; // Only if "Previous Unpaid Balance" > 0 on the bill

  // Electricity
  electricityPeriodStart: string; // ISO YYYY-MM-DD
  electricityPeriodEnd: string; // ISO YYYY-MM-DD
  electricityUsageKwh: number;
  electricityDeliveryCost: number; // "Current PG&E Electric Delivery Charges"
  electricityGenerationCost: number; // "San Jose Clean Energy Electric Generation Charges"
  electricityAdjustments?: number; // Climate Credit (negative, e.g. -58.40)

  // Gas
  gasPeriodStart: string; // ISO YYYY-MM-DD
  gasPeriodEnd: string; // ISO YYYY-MM-DD
  gasUsageTherms: number;
  gasCost: number; // "Current Gas Charges"
}
