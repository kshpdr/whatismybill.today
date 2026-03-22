import { toBills } from "./parsers/adapter.js";
import type { AnyBill, BillProviderType, ParseBillResult } from "./parsers/types.js";
import type { NewBill } from "../db/schema.js";

/**
 * Maps a parsed bill (any provider) to one or more NewBill rows for DB insertion.
 * Delegates charge categorisation and field mapping to the adapter layer.
 * Converts numeric fields to strings for Drizzle.
 */
export function mapBillToRows(
  result: ParseBillResult,
  storageRef: string,
  householdId: string,
  uploadedBy: string,
): NewBill[] {
  const dtos = toBills(result, { householdId, storageRef, uploadedBy });

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

/** @deprecated Use mapBillToRows with a full ParseBillResult instead */
export function mapPGEBillToRows(
  bill: AnyBill,
  storageRef: string,
  householdId: string,
  uploadedBy: string,
  ocrFallback = false
): NewBill[] {
  const billType: BillProviderType =
    bill.provider === "PG&E" ? "PGE" : "SJW";
  return mapBillToRows(
    { success: true, bill, billType, ocrFallback },
    storageRef,
    householdId,
    uploadedBy,
  );
}
