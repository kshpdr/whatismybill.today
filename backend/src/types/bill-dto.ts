/**
 * BillDTO — mirrors the frontend Bill shape.
 * Used by the adapter to produce structured bill objects before DB insertion.
 * The route then converts BillDTO → NewBill (Drizzle numeric strings).
 */

export type ParseStatus = "success" | "failed" | "encoding_error";

export interface LineCharge {
  label:  string;
  amount: number;
}

export interface Bill {
  id:                  string;
  householdId:         string;
  provider:            string;
  utilityType:         "electricity" | "gas" | "water";
  billingPeriodStart:  string;
  billingPeriodEnd:    string;
  totalAmount:         number;
  usage:               number;
  usageUnit:           string;
  unitPrice:           number;
  charges:             LineCharge[];
  storageRef:          string | null;
  uploadedBy?:         string;
  parseStatus?:        ParseStatus;
  uploadedAt:          string;
}
