/**
 * Converts a ManualBillEntry (form data) into a PGEBill so the rest of the
 * app — dashboard, Firestore writes, charts — treats manual and parsed bills
 * identically.
 *
 * Computed fields (effectiveUnitPrice, totals, currentCharges) are derived
 * the same way the PDF parser derives them, so numbers stay consistent.
 */
import type { ManualBillEntry, PGEBill } from "./types.js";
export declare function manualEntryToPGEBill(entry: ManualBillEntry): PGEBill;
//# sourceMappingURL=manual.d.ts.map