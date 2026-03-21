import type { PGEBill } from "./parsers/types.js";
import type { NewBill } from "../db/schema.js";
/**
 * Maps a parsed PGEBill to two NewBill rows ready for DB insertion.
 * Delegates charge categorisation to the adapter (pgeToBills),
 * then converts numeric fields to strings for Drizzle.
 */
export declare function mapPGEBillToRows(bill: PGEBill, storageRef: string, householdId: string, uploadedBy: string, ocrFallback?: boolean): NewBill[];
//# sourceMappingURL=map-to-bill.d.ts.map