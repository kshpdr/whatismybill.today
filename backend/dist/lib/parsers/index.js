/**
 * PDF bill parser entry point — server-side only (Node.js).
 *
 * Three paths:
 *   Happy      pdf-parse extracts text → regex parser → PGEBill
 *   OCR        garbled font PDFs → pdftoppm + tesseract → same regex parser → PGEBill + ocrFallback: true
 *   Manual     encodingError: true → frontend shows manual form → manualEntryToPGEBill()
 */
import { PDFParse } from "pdf-parse";
import { isPGEBill, parsePGEText } from "./pge.js";
import { extractTextViaOCR } from "./ocr.js";
// ─── PDF text extraction ───────────────────────────────────────────────────────
async function extractText(buffer) {
    const parser = new PDFParse({ data: buffer, verbosity: 0 });
    const result = await parser.getText({});
    return result.text ?? "";
}
/**
 * Detect garbled private-font encoding (CrawfordTech archive reprints).
 * Heuristic: less than 25% of characters are ASCII letters → garbled.
 */
function isGarbledEncoding(text) {
    const sample = text.slice(0, 500).replace(/\s/g, "");
    if (sample.length < 20)
        return false;
    const letters = (sample.match(/[a-zA-Z]/g) ?? []).length;
    return letters / sample.length < 0.25;
}
// ─── Primary parse path ────────────────────────────────────────────────────────
export async function parseBillPDF(buffer) {
    let rawText;
    // Step 1: try pdf-parse
    try {
        rawText = await extractText(buffer);
    }
    catch (err) {
        return {
            success: false,
            error: `PDF text extraction failed: ${err instanceof Error ? err.message : String(err)}`,
        };
    }
    // Step 2: garbled encoding → try OCR fallback before giving up
    if (!rawText.trim() || isGarbledEncoding(rawText)) {
        let ocrText = null;
        try {
            ocrText = await extractTextViaOCR(buffer);
        }
        catch {
            // OCR not available (pdftoppm/tesseract not installed) — fall through
        }
        if (ocrText && ocrText.trim() && !isGarbledEncoding(ocrText)) {
            rawText = ocrText;
            // Continue to Step 3 with OCR text, marking ocrFallback
            if (isPGEBill(rawText)) {
                try {
                    const bill = parsePGEText(rawText);
                    return { success: true, bill, rawText, ocrFallback: true };
                }
                catch (err) {
                    return {
                        success: false,
                        error: `PG&E parsing failed (OCR path): ${err instanceof Error ? err.message : String(err)}`,
                        rawText,
                        ocrFallback: true,
                    };
                }
            }
        }
        // OCR either unavailable or also garbled — ask for manual entry
        return {
            success: false,
            encodingError: true,
            error: "This PDF uses a private font encoding that cannot be decoded automatically. " +
                "Please enter the bill details manually.",
            rawText,
        };
    }
    // Step 3: normal text extraction succeeded
    if (isPGEBill(rawText)) {
        try {
            const bill = parsePGEText(rawText);
            return { success: true, bill, rawText };
        }
        catch (err) {
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
export { manualEntryToPGEBill } from "./manual.js";
//# sourceMappingURL=index.js.map