/**
 * PDF bill parser — entry point (backend/Node.js).
 *
 * ── Parse flow ───────────────────────────────────────────────────────────────
 *  1. pdf-parse extracts text from the PDF's text layer
 *  2. If garbled → OCR fallback (pdftoppm + tesseract)
 *  3. Walk the PARSER_REGISTRY to find a matching provider → parse
 *  4. If no provider matched → encodingError
 *
 * ── Adding a new provider ────────────────────────────────────────────────────
 *  1. Create myprovider.ts  exporting isMyproviderBill() + parseMyproviderText()
 *  2. Add MyProviderBill to types.ts and the AnyBill union
 *  3. Push one entry to PARSER_REGISTRY below
 *  4. Add an adapter in adapter.ts
 */

import { PDFParse } from "pdf-parse";
import { isPGEBill, parsePGEText } from "./pge.js";
import { isSJWBill, parseSJWText } from "./sjw.js";
import { manualEntryToPGEBill } from "./manual.js";
import { extractTextViaOCR } from "./ocr.js";
import type {
  AnyBill,
  BillProviderType,
  ManualBillEntry,
  ParseBillResult,
} from "./types.js";

// ─── Plugin registry ──────────────────────────────────────────────────────────

interface ParserPlugin {
  type:   BillProviderType;
  detect: (text: string) => boolean;
  parse:  (text: string) => AnyBill;
}

const PARSER_REGISTRY: ParserPlugin[] = [
  { type: "PGE", detect: isPGEBill,  parse: parsePGEText  },
  { type: "SJW", detect: isSJWBill,  parse: parseSJWText  },
];

// ─── Text extraction ──────────────────────────────────────────────────────────

async function extractText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer, verbosity: 0 });
  const result = await parser.getText({});
  return result.text ?? "";
}

function isGarbledEncoding(text: string): boolean {
  const sample  = text.slice(0, 500).replace(/\s/g, "");
  if (sample.length < 20) return false;
  const letters = (sample.match(/[a-zA-Z]/g) ?? []).length;
  return letters / sample.length < 0.25;
}

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

  if (!rawText.trim() || isGarbledEncoding(rawText)) {
    let ocrText: string | null = null;
    try {
      ocrText = await extractTextViaOCR(buffer);
    } catch {
      // OCR unavailable (pdftoppm/tesseract not installed)
    }

    if (ocrText && ocrText.trim() && !isGarbledEncoding(ocrText)) {
      const ocrResult = dispatchParser(ocrText);
      if (ocrResult) {
        return {
          success:     true,
          bill:        ocrResult.bill,
          billType:    ocrResult.plugin.type,
          rawText:     ocrText,
          ocrFallback: true,
        };
      }
    }

    return {
      success: false,
      encodingError: true,
      error:
        "This PDF uses a private font encoding that cannot be decoded automatically. " +
        "Please enter the bill details manually.",
      rawText,
    };
  }

  const matched = dispatchParser(rawText);
  if (!matched) {
    return {
      success: false,
      error: `Unrecognized bill provider. Supported: ${PARSER_REGISTRY.map((p) => p.type).join(", ")}.`,
      rawText,
    };
  }

  return {
    success:  true,
    bill:     matched.bill,
    billType: matched.plugin.type,
    rawText,
  };
}

// ─── Re-exports ───────────────────────────────────────────────────────────────

export { manualEntryToPGEBill } from "./manual.js";
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
} from "./types.js";
