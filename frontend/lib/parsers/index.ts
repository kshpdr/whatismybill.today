/**
 * PDF bill parser — entry point.
 * Server-side only (Node.js). Never import in client components.
 *
 * ── Parse flow ───────────────────────────────────────────────────────────────
 *  1. pdf-parse extracts text from the PDF's text layer
 *  2. If garbled → OCR fallback (pdftoppm + tesseract)
 *  3. Walk the PARSER_REGISTRY to find a matching provider → parse
 *  4. If no provider matched → encodingError (show manual entry form)
 *
 * ── Adding a new provider ────────────────────────────────────────────────────
 *  1. Create lib/parsers/myprovider.ts  exporting isMyproviderBill() + parseMyproviderText()
 *  2. Add MyProviderBill to lib/parsers/types.ts and the AnyBill union
 *  3. Push one entry to PARSER_REGISTRY below
 *  4. Add an adapter in lib/parsers/adapter.ts
 */

import { isPGEBill, parsePGEText } from "./pge";
import { isSJWBill, parseSJWText } from "./sjw";
import { manualEntryToPGEBill } from "./manual";
import type {
  AnyBill,
  BillProviderType,
  ManualBillEntry,
  ParseBillResult,
} from "./types";

// ─── Plugin registry ──────────────────────────────────────────────────────────

interface ParserPlugin {
  type:   BillProviderType;
  detect: (text: string) => boolean;
  parse:  (text: string) => AnyBill;
}

/**
 * Ordered list of provider parsers.
 * The first one whose detect() returns true wins.
 */
const PARSER_REGISTRY: ParserPlugin[] = [
  { type: "PGE", detect: isPGEBill,  parse: parsePGEText  },
  { type: "SJW", detect: isSJWBill,  parse: parseSJWText  },
];

// ─── Text extraction ──────────────────────────────────────────────────────────

async function extractText(buffer: Buffer): Promise<string> {
  // Dynamic import keeps pdf-parse out of the static bundle (Turbopack compat).
  const pdfParse = (await import("pdf-parse")).default;
  const result   = await pdfParse(buffer);
  return result.text ?? "";
}

function isGarbledEncoding(text: string): boolean {
  const sample  = text.slice(0, 500).replace(/\s/g, "");
  if (sample.length < 20) return false;
  const letters = (sample.match(/[a-zA-Z]/g) ?? []).length;
  return letters / sample.length < 0.25;
}

// ─── Core dispatcher ──────────────────────────────────────────────────────────

function dispatchParser(text: string): { plugin: ParserPlugin; bill: AnyBill } | null {
  for (const plugin of PARSER_REGISTRY) {
    if (plugin.detect(text)) {
      const bill = plugin.parse(text);
      return { plugin, bill };
    }
  }
  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

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

  // Garbled encoding → try OCR before giving up
  if (isGarbledEncoding(rawText)) {
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

    const ocrResult = dispatchParser(ocrText);
    if (!ocrResult) {
      return {
        success: false,
        encodingError: true,
        error:
          "OCR succeeded but could not identify a supported bill provider. " +
          "Please enter the bill details manually.",
        rawText: ocrText,
      };
    }

    try {
      return {
        success:     true,
        bill:        ocrResult.bill,
        billType:    ocrResult.plugin.type,
        rawText:     ocrText,
        ocrFallback: true,
      };
    } catch (err) {
      return {
        success: false,
        encodingError: true,
        error:
          "OCR succeeded but parsing failed: " +
          (err instanceof Error ? err.message : String(err)) +
          ". Please enter the bill details manually.",
        rawText: ocrText,
      };
    }
  }

  // Normal path: dispatch to the right provider
  const matched = dispatchParser(rawText);
  if (!matched) {
    return {
      success: false,
      error:
        `Unrecognized bill provider. Supported: ${PARSER_REGISTRY.map((p) => p.type).join(", ")}.`,
      rawText,
    };
  }

  try {
    return {
      success:  true,
      bill:     matched.bill,
      billType: matched.plugin.type,
      rawText,
    };
  } catch (err) {
    return {
      success: false,
      error: `${matched.plugin.type} parsing failed: ${err instanceof Error ? err.message : String(err)}`,
      rawText,
    };
  }
}

// ─── Re-exports ───────────────────────────────────────────────────────────────

export { manualEntryToPGEBill } from "./manual";
export type { ManualBillEntry };

export type {
  AnyBill,
  BillProviderType,
  BillingHistoryEntry,
  GasSegment,
  LineItem,
  MonthlyAllocation,
  ParseBillResult,
  PGEBill,
  SJWBill,
  SJWTier,
} from "./types";
