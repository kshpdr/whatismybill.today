export interface LineItem {
    label: string;
    amount: number;
}
/**
 * One entry from the "Monthly Billing History" table printed on page 1 of every bill.
 * PG&E includes the last 7 months of electric+gas totals here.
 */
export interface BillingHistoryEntry {
    statementDate: string;
    electricTotal: number;
    gasTotal: number;
    monthlySpend: number;
}
/**
 * One sub-period block within a gas detail page.
 * Gas billing periods often span month boundaries, so PG&E splits them into
 * segments — each with its own tier rates and allowances.
 * These are NOT separate bills; they're internal accounting segments.
 */
export interface GasSegment {
    periodStart: string;
    periodEnd: string;
    tier1Allowance?: number;
    tier1Usage?: number;
    tier2Usage?: number;
    lineItems: LineItem[];
    subtotal: number;
}
/**
 * Normalized representation of a PG&E combined electricity + gas bill.
 * One PDF → one PGEBill (contains both electricity and gas sections).
 * Server-side only — never import in client components.
 */
export interface PGEBill {
    provider: "PG&E";
    accountNumber: string;
    statementDate: string;
    dueDate: string;
    customerName: string;
    serviceAddress: string;
    summary: {
        electricDelivery: number;
        electricAdjustments: number;
        electricGeneration: number;
        gas: number;
        currentCharges: number;
        totalAmountDue: number;
        previousBalance?: number;
        paymentsReceived?: number;
        balanceForward?: number;
    };
    electricity: {
        periodStart: string;
        periodEnd: string;
        billingDays: number;
        usageTotal: number;
        usageUnit: "kWh";
        delivery: {
            total: number;
            lineItems: LineItem[];
        };
        generation: {
            total: number;
            lineItems: LineItem[];
        };
        adjustments: number;
        total: number;
        effectiveUnitPrice: number;
    };
    gas: {
        periodStart: string;
        periodEnd: string;
        billingDays: number;
        usageTotal: number;
        usageUnit: "Therms";
        lineItems: LineItem[];
        /**
         * Optional per-segment breakdown. One entry per sub-period block on the
         * gas detail page. Sum of segment subtotals should equal gas.total.
         */
        segments?: GasSegment[];
        total: number;
        effectiveUnitPrice: number;
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
export interface ParseBillResult {
    success: boolean;
    bill?: PGEBill;
    error?: string;
    rawText?: string;
    /**
     * True when the PDF has an undecodable private font encoding (CrawfordTech
     * archive reprints). The bill rendered visually but text cannot be extracted.
     * Show the manual entry form to the user in this case.
     */
    encodingError?: boolean;
    /**
     * True when the primary pdf-parse extraction failed and the result was
     * obtained by rendering the PDF to images and running Tesseract OCR.
     * Quality may be slightly lower; watch for missing_* flags in bill.flags.
     */
    ocrFallback?: boolean;
}
/**
 * What a user types into the manual bill entry form.
 * All required fields map 1:1 to dashboard-critical values.
 * Optional fields allow capturing more detail if the user has time.
 *
 * This is intentionally flat and human-friendly — no nested objects,
 * no computed fields, no internal IDs.
 */
export interface ManualBillEntry {
    provider: "PG&E";
    accountNumber: string;
    statementDate: string;
    dueDate: string;
    totalAmountDue: number;
    balanceForward?: number;
    electricityPeriodStart: string;
    electricityPeriodEnd: string;
    electricityUsageKwh: number;
    electricityDeliveryCost: number;
    electricityGenerationCost: number;
    electricityAdjustments?: number;
    gasPeriodStart: string;
    gasPeriodEnd: string;
    gasUsageTherms: number;
    gasCost: number;
}
//# sourceMappingURL=types.d.ts.map