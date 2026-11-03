export type UtilityType = "electricity" | "gas" | "water";
export type ParseStatus = "success" | "failed" | "encoding_error";
export type MemberRole  = "owner" | "member";

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface UserProfile {
  id:             string;
  email:          string | null;   // null for Telegram-only accounts
  name:           string;
  telegramLinked?: boolean;         // present on /auth/me
}

/** Payload handed to the browser by the Telegram Login Widget. */
export interface TelegramAuthPayload {
  id:          number;
  first_name?: string;
  last_name?:  string;
  username?:   string;
  photo_url?:  string;
  auth_date:   number;
  hash:        string;
}

// ─── Households ───────────────────────────────────────────────────────────────

/**
 * A stay in a household. Bills are visible when their billing period overlaps
 * [accessFrom, accessUntil] (inclusive ISO dates; null = unbounded). Former
 * members (accessUntil set) are read-only.
 */
export interface Membership {
  active:      boolean;
  accessFrom:  string | null;
  accessUntil: string | null;
}

export interface Household {
  id:                   string;
  nickname:             string;
  address?:             string;
  ownerId:              string;
  inviteCode:           string | null;   // null for former members
  inviteCodeRotatedAt?: string;
  createdAt:            string;
  membership?:          Membership;
}

export interface HouseholdMember extends Membership {
  id:           string;          // user id
  membershipId: string;
  name:         string;
  email:        string | null;
  isOwner:      boolean;
  joinedAt:     string;
}

export function isReadOnlyHousehold(h: Pick<Household, "membership"> | null | undefined): boolean {
  return h?.membership?.active === false;
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
