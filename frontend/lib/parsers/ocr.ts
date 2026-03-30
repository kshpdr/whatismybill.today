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

import { execFile } from "child_process";
import { mkdtemp, readdir, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { promisify } from "util";

const exec = promisify(execFile);

/**
 * Render each PDF page to a 300-DPI PNG via pdftoppm, then OCR with Tesseract.
 * Returns concatenated plain text from all pages, separated by form-feed chars.
 *
 * Throws if pdftoppm or tesseract are not on PATH, or if no pages are produced.
 */
export async function extractTextViaOCR(buffer: Buffer): Promise<string> {
  const tmpDir = await mkdtemp(join(tmpdir(), "bill-ocr-"));

  try {
    const pdfPath = join(tmpDir, "input.pdf");
    await writeFile(pdfPath, buffer);

    // Render all pages → page-1.png, page-2.png, …
    await exec("pdftoppm", [
      "-r", "300",   // 300 DPI: sharp enough for 8-10pt bill text
      "-png",
      pdfPath,
      join(tmpDir, "page"),
    ]);

    const pageFiles = (await readdir(tmpDir))
      .filter((f) => f.startsWith("page") && f.endsWith(".png"))
      .sort()
      .map((f) => join(tmpDir, f));

    if (pageFiles.length === 0) {
      throw new Error("pdftoppm produced no page images");
    }

    // OCR each page sequentially
    const pageTexts: string[] = [];
    for (const imgPath of pageFiles) {
      // PSM 3 = fully automatic page segmentation (no OSD)
      // OEM 3 = default LSTM engine
      const { stdout } = await exec("tesseract", [
        imgPath,
        "stdout",
        "--psm", "3",
        "--oem", "3",
        "-l", "eng",
      ]);
      pageTexts.push(stdout.trim());
    }

    return pageTexts.join("\n\f\n");
  } finally {
    // Always clean up temp files
    await rm(tmpDir, { recursive: true, force: true });
  }
}
