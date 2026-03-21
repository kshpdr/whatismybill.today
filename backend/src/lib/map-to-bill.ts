import { pgeToBills } from "./parsers/adapter.js";
import type { PGEBill } from "./parsers/types.js";
import type { NewBill } from "../db/schema.js";

/**
 * Maps a parsed PGEBill to two NewBill rows ready for DB insertion.
 * Delegates charge categorisation to the adapter (pgeToBills),
 * then converts numeric fields to strings for Drizzle.
 */
export function mapPGEBillToRows(
  bill: PGEBill,
  storageRef: string,
  householdId: string,
  uploadedBy: string,
  ocrFallback = false
): NewBill[] {
  const dtos = pgeToBills(bill, { householdId, storageRef, uploadedBy, ocrFallback });

  return dtos
    .filter((dto) => dto.totalAmount > 0)
    .map((dto): NewBill => ({
      householdId:         dto.householdId,
      provider:            dto.provider,
      utilityType:         dto.utilityType,
      billingPeriodStart:  dto.billingPeriodStart,
      billingPeriodEnd:    dto.billingPeriodEnd,
      totalAmount:         String(dto.totalAmount),
      usage:               String(dto.usage),
      usageUnit:           dto.usageUnit,
      unitPrice:           String(dto.unitPrice),
      charges:             dto.charges,
      storageRef:          dto.storageRef,
      uploadedBy:          dto.uploadedBy ?? null,
      parseStatus:         dto.parseStatus ?? "success",
    }));
}
