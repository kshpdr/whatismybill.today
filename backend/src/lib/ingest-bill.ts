/**
 * Shared bill-ingestion pipeline.
 *
 * Given a raw PDF buffer, this saves the PDF (unless privacy mode), parses it,
 * maps it to DB rows, and inserts them. Used by both the HTTP upload route
 * (`routes/bills.ts`) and the Telegram bot (`lib/telegram-handler.ts`) so the
 * two entry points stay in lock-step.
 */

import { randomUUID } from "crypto";
import { db } from "../db/index.js";
import { bills } from "../db/schema.js";
import { parseBillPDF } from "./parsers/index.js";
import { mapBillToRows } from "./map-to-bill.js";
import { saveFile } from "./storage.js";

export type IngestErrorCode = "encoding_error" | "parse_failed";

export interface IngestSuccess {
  ok: true;
  /** The inserted bill rows (a single PG&E PDF yields two: electricity + gas). */
  bills: (typeof bills.$inferSelect)[];
  storageRef: string | null;
}

export interface IngestFailure {
  ok: false;
  error: IngestErrorCode;
  message?: string;
  /** Present even on encoding errors so the caller can offer manual entry. */
  storageRef: string | null;
}

export type IngestResult = IngestSuccess | IngestFailure;

export interface IngestOptions {
  householdId: string;
  userId: string;
  /** When true, the original PDF is not persisted to disk. */
  privacyMode?: boolean;
}

/**
 * Parse and persist a bill from a PDF buffer. Mirrors the logic previously
 * inlined in `POST /bills/upload`.
 */
export async function ingestBillFromBuffer(
  buffer: Buffer,
  { householdId, userId, privacyMode = false }: IngestOptions,
): Promise<IngestResult> {
  // Save the PDF first (so it survives even an encoding failure, enabling
  // manual entry against the stored file), unless the user opted out.
  let storageRef: string | null = null;
  if (!privacyMode) {
    storageRef = await saveFile(householdId, randomUUID(), buffer);
  }

  const parseResult = await parseBillPDF(buffer);

  if (!parseResult.success) {
    return {
      ok: false,
      error: parseResult.encodingError ? "encoding_error" : "parse_failed",
      message: parseResult.error,
      storageRef,
    };
  }

  const rows = mapBillToRows(
    parseResult,
    storageRef,
    householdId,
    userId,
    privacyMode ? null : parseResult.rawText,
  );

  if (rows.length === 0) {
    return {
      ok: false,
      error: "parse_failed",
      message: "No bill data could be extracted",
      storageRef,
    };
  }

  const inserted = await db.insert(bills).values(rows).returning();
  return { ok: true, bills: inserted, storageRef };
}
