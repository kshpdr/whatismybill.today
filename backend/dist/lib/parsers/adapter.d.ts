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
import type { Bill } from "../../types/bill-dto.js";
import type { PGEBill } from "./types.js";
/**
 * Fields that come from the upload context, not from the bill itself.
 * The backend or route handler provides these when creating Bill records.
 */
export interface BillMeta {
    householdId: string;
    storageRef: string;
    uploadedBy?: string;
    uploadedAt?: string;
    ocrFallback?: boolean;
}
export declare function pgeToElectricityBill(pge: PGEBill, meta: BillMeta): Bill;
export declare function pgeToGasBill(pge: PGEBill, meta: BillMeta): Bill;
/**
 * Main entry point.
 * Returns [electricityBill, gasBill] — always two items for a PG&E combined bill.
 */
export declare function pgeToBills(pge: PGEBill, meta: BillMeta): [Bill, Bill];
//# sourceMappingURL=adapter.d.ts.map