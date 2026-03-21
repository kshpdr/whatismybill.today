import { pgeToBills } from "./parsers/adapter.js";
/**
 * Maps a parsed PGEBill to two NewBill rows ready for DB insertion.
 * Delegates charge categorisation to the adapter (pgeToBills),
 * then converts numeric fields to strings for Drizzle.
 */
export function mapPGEBillToRows(bill, storageRef, householdId, uploadedBy, ocrFallback = false) {
    const dtos = pgeToBills(bill, { householdId, storageRef, uploadedBy, ocrFallback });
    return dtos
        .filter((dto) => dto.totalAmount > 0)
        .map((dto) => ({
        householdId: dto.householdId,
        provider: dto.provider,
        utilityType: dto.utilityType,
        billingPeriodStart: dto.billingPeriodStart,
        billingPeriodEnd: dto.billingPeriodEnd,
        totalAmount: String(dto.totalAmount),
        usage: String(dto.usage),
        usageUnit: dto.usageUnit,
        unitPrice: String(dto.unitPrice),
        charges: dto.charges,
        storageRef: dto.storageRef,
        uploadedBy: dto.uploadedBy ?? null,
        parseStatus: dto.parseStatus ?? "success",
    }));
}
//# sourceMappingURL=map-to-bill.js.map