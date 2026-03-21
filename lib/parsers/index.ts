/**
 * PDF bill parser entry point.
 * Server-side only — uses pdf-parse (Node.js), never import in client components.
 *
 * Parse flow:
 *   1. pdf-parse extracts text from the PDF's text layer
 *   2. If text looks garbled → OCR fallback (pdftoppm + tesseract)
 *   3. If OCR also fails    → encodingError, show manual entry form
 *
 * Manual entry flow (after user fills the form):
 *   const bill = manualEntryToPGEBill(formData);
 *   → store bill same as a parsed one
 */

import { extractBillingHistory, isPGEBill, parsePGEText } from "./pge";
import { manualEntryToPGEBill } from "./manual";
import type { ManualBillEntry, ParseBillResult } from "./types";

// ─── PDF text extraction ───────────────────────────────────────────────────────

async function extractText(buffer: Buffer): Promise<string> {
  // Dynamic import keeps pdf-parse out of the static bundle (Turbopack compat).
  // v1 API: default export is a function, returns { text, ... }
  const pdfParse = (await import("pdf-parse")).default;
  const result = await pdfParse(buffer);
  return result.text ?? "";
}

/**
 * Detect garbled private-font encoding (CrawfordTech archive reprints).
 * These PDFs render correctly on screen but text cannot be decoded by any tool.
 * Heuristic: less than 25% of characters are ASCII letters → garbled.
 */
function isGarbledEncoding(text: string): boolean {
  const sample = text.slice(0, 500).replace(/\s/g, "");
  if (sample.length < 20) return false;
  const letters = (sample.match(/[a-zA-Z]/g) ?? []).length;
  return letters / sample.length < 0.25;
}

// ─── Primary parse path ────────────────────────────────────────────────────────

/**
 * Parse a utility bill PDF into a structured PGEBill.
 *
 * Returns:
 *   { success: true,  bill }           — parsed successfully
 *   { success: false, encodingError }  — garbled PDF, show manual entry form
 *   { success: false, error }          — unrecoverable error
 */
export async function parseBillPDF(buffer: Buffer): Promise<ParseBillResult> {
  let rawText: string;

  try {
    rawText = await extractText(buffer);
  } catch (err) {
    return {
      success: false,
      error: `PDF text extraction failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!rawText.trim()) {
    return {
      success: false,
      error: "PDF produced no extractable text (scanned/image-only PDF?)",
      rawText,
    };
  }

  if (isGarbledEncoding(rawText)) {
    // Primary extraction is garbled — try rendering to images and OCR-ing instead.
    // Dynamic import keeps child_process/fs out of the static bundle (Turbopack).
    let ocrText: string;
    try {
      const { extractTextViaOCR } = await import("./ocr");
      ocrText = await extractTextViaOCR(buffer);
    } catch (ocrErr) {
      return {
        success: false,
        encodingError: true,
        error:
          "PDF uses a private font encoding and OCR fallback failed: " +
          (ocrErr instanceof Error ? ocrErr.message : String(ocrErr)) +
          ". Please enter the bill details manually.",
        rawText,
      };
    }

    if (!isPGEBill(ocrText)) {
      return {
        success: false,
        encodingError: true,
        error:
          "OCR succeeded but could not identify this as a PG&E bill. " +
          "Please enter the bill details manually.",
        rawText: ocrText,
      };
    }

    try {
      const bill = parsePGEText(ocrText);
      return { success: true, bill, rawText: ocrText, ocrFallback: true };
    } catch (err) {
      return {
        success: false,
        encodingError: true,
        error:
          "OCR succeeded but PG&E parsing failed: " +
          (err instanceof Error ? err.message : String(err)) +
          ". Please enter the bill details manually.",
        rawText: ocrText,
      };
    }
  }

  if (isPGEBill(rawText)) {
    try {
      const bill = parsePGEText(rawText);
      return { success: true, bill, rawText };
    } catch (err) {
      return {
        success: false,
        error: `PG&E parsing failed: ${err instanceof Error ? err.message : String(err)}`,
        rawText,
      };
    }
  }

  return {
    success: false,
    error: "Unrecognized bill provider — only PG&E is supported.",
    rawText,
  };
}

// ─── Manual entry path ─────────────────────────────────────────────────────────

export { manualEntryToPGEBill } from "./manual";
export type { ManualBillEntry };

// ─── Re-exports ────────────────────────────────────────────────────────────────

export type {
  BillingHistoryEntry,
  GasSegment,
  LineItem,
  ParseBillResult,
  PGEBill,
} from "./types";

export { extractBillingHistory } from "./pge";
