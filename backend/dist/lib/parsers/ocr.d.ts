/**
 * OCR fallback for PDFs with garbled private-font encoding.
 *
 * Pipeline: PDF buffer → pdftoppm (PNG at 300 DPI) → Tesseract → plain text
 *
 * Requires system binaries:
 *   pdftoppm  — from poppler-utils (brew install poppler)
 *   tesseract — Tesseract OCR v4+ (brew install tesseract)
 *
 * Server-side only. Never import in client components.
 */
/**
 * Render each PDF page to a 300-DPI PNG via pdftoppm, then OCR with Tesseract.
 * Returns concatenated plain text from all pages, separated by form-feed chars.
 *
 * Throws if pdftoppm or tesseract are not on PATH, or if no pages are produced.
 */
export declare function extractTextViaOCR(buffer: Buffer): Promise<string>;
//# sourceMappingURL=ocr.d.ts.map