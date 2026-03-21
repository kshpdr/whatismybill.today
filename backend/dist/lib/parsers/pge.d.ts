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
import type { BillingHistoryEntry, PGEBill } from "./types.js";
/**
 * Parse the "Monthly Billing History" table printed on page 1 of every PG&E bill.
 * Format: "For M/DD YYYY electric $ NNN.NN gas $ NN.NN  For ..."
 *
 * This is the fallback data source for months whose PDFs have undecodable
 * CrawfordTech/archive encoding — those PDFs render visually but text cannot
 * be extracted by any standard tool.
 */
export declare function extractBillingHistory(text: string): BillingHistoryEntry[];
export declare function parsePGEText(text: string): PGEBill;
/** Quick check: does this text look like a PG&E bill? */
export declare function isPGEBill(text: string): boolean;
//# sourceMappingURL=pge.d.ts.map