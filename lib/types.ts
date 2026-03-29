export type UtilityType = "electricity" | "gas" | "water";
export type ParseStatus = "success" | "failed" | "encoding_error";
export type MemberRole  = "owner" | "member";

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface UserProfile {
  id:        string;
  email:     string;
  name:      string;
}

// ─── Households ───────────────────────────────────────────────────────────────

export interface Household {
  id:                   string;
  nickname:             string;
  address?:             string;
  ownerId:              string;
  inviteCode:           string;
  inviteCodeRotatedAt?: string;
  createdAt:            string;
}

export interface HouseholdMember {
  id:       string;
  name:     string;
  email:    string;
  isOwner:  boolean;
  joinedAt: string;
}

// ─── Bills ────────────────────────────────────────────────────────────────────

export interface LineCharge {
  label:  string;
  amount: number;
}

export interface Bill {
  id:                   string;
  householdId:          string;
  provider:             string;
  utilityType:          UtilityType;
  billingPeriodStart:   string;    // ISO date YYYY-MM-DD
  billingPeriodEnd:     string;
  totalAmount:          number;
  usage:                number;
  usageUnit:            string;    // "kWh" | "Therms" | "CCF"
  unitPrice:            number;
  charges:              LineCharge[];
  storageRef:           string | null;
  uploadedBy?:          string;
  parseStatus?:         ParseStatus;
  parseError?:          string;
  uploadedAt:           string;    // ISO timestamp
}

export type BillInput = Omit<Bill, "id" | "uploadedAt">;
