/**
 * PDF bill parser entry point — server-side only (Node.js).
 *
 * Three paths:
 *   Happy      pdf-parse extracts text → regex parser → PGEBill
 *   OCR        garbled font PDFs → pdftoppm + tesseract → same regex parser → PGEBill + ocrFallback: true
 *   Manual     encodingError: true → frontend shows manual form → manualEntryToPGEBill()
 */
import type { ManualBillEntry, ParseBillResult } from "./types.js";
export declare function parseBillPDF(buffer: Buffer): Promise<ParseBillResult>;
export { manualEntryToPGEBill } from "./manual.js";
export type { ManualBillEntry };
export type { BillingHistoryEntry, GasSegment, LineItem, ParseBillResult, PGEBill, } from "./types.js";
//# sourceMappingURL=index.d.ts.map