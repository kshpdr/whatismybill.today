import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  numeric,
  date,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id:           uuid("id").primaryKey().defaultRandom(),
  // email/passwordHash are nullable: Telegram-login users have neither until
  // they optionally add an email later.
  email:        varchar("email", { length: 255 }).unique(),
  name:         varchar("name", { length: 255 }).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }),
  telegramId:   varchar("telegram_id", { length: 32 }).unique(),
  createdAt:    timestamp("created_at").defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  ownedHouseholds: many(households),
  memberOf:        many(householdMembers),
  uploadedBills:   many(bills),
}));

// ─── Households ───────────────────────────────────────────────────────────────

export const households = pgTable("households", {
  id:                    uuid("id").primaryKey().defaultRandom(),
  nickname:              varchar("nickname", { length: 255 }).notNull(),
  address:               varchar("address",  { length: 500 }),
  ownerId:               uuid("owner_id").references(() => users.id).notNull(),
  inviteCode:            varchar("invite_code", { length: 6 }).unique().notNull(),
  inviteCodeRotatedAt:   timestamp("invite_code_rotated_at").defaultNow().notNull(),
  createdAt:             timestamp("created_at").defaultNow().notNull(),
});

export const householdsRelations = relations(households, ({ one, many }) => ({
  owner:   one(users, { fields: [households.ownerId], references: [users.id] }),
  members: many(householdMembers),
  bills:   many(bills),
}));

// ─── Household members (join table) ──────────────────────────────────────────

export const householdMembers = pgTable(
  "household_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .references(() => households.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
    // Stay window (inclusive). accessFrom null = sees all history;
    // accessUntil null = current member, set = former member (read-only).
    accessFrom:  date("access_from"),
    accessUntil: date("access_until"),
  },
  // A person can have several past stays but only one current one.
  (t) => [
    uniqueIndex("household_members_active_unique")
      .on(t.householdId, t.userId)
      .where(sql`${t.accessUntil} IS NULL`),
  ]
);

export const householdMembersRelations = relations(householdMembers, ({ one }) => ({
  household: one(households, { fields: [householdMembers.householdId], references: [households.id] }),
  user:      one(users,      { fields: [householdMembers.userId],      references: [users.id] }),
}));

// ─── Bills ────────────────────────────────────────────────────────────────────

export const bills = pgTable("bills", {
  id:                   uuid("id").primaryKey().defaultRandom(),
  householdId:          uuid("household_id")
    .references(() => households.id, { onDelete: "cascade" })
    .notNull(),
  provider:             varchar("provider",      { length: 100 }).notNull(),
  utilityType:          varchar("utility_type",  { length: 20  }).notNull(), // electricity | gas | water
  billingPeriodStart:   date("billing_period_start").notNull(),
  billingPeriodEnd:     date("billing_period_end").notNull(),
  totalAmount:          numeric("total_amount",  { precision: 10, scale: 2 }).notNull(),
  usage:                numeric("usage",         { precision: 10, scale: 4 }).notNull(),
  usageUnit:            varchar("usage_unit",    { length: 20  }).notNull(), // kWh | Therms | CCF
  unitPrice:            numeric("unit_price",    { precision: 10, scale: 6 }).notNull(),
  charges:              jsonb("charges").notNull().$type<{ label: string; amount: number }[]>(),
  storageRef:           varchar("storage_ref",   { length: 500 }), // relative path on disk; null when privacyMode=true
  uploadedBy:           uuid("uploaded_by").references(() => users.id),
  parseStatus:          varchar("parse_status",  { length: 20  }).notNull().default("success"),
  parseError:           text("parse_error"),
  rawText:              text("raw_text"),
  uploadedAt:           timestamp("uploaded_at").defaultNow().notNull(),
});

export const billsRelations = relations(bills, ({ one }) => ({
  household: one(households, { fields: [bills.householdId], references: [households.id] }),
  uploadedBy: one(users,     { fields: [bills.uploadedBy],  references: [users.id] }),
}));

// ─── Share links ──────────────────────────────────────────────────────────────
// A share link lets anyone with the token view a household's bills read-only.

export type UtilityType = "electricity" | "gas" | "water";

export interface ShareVisibilityConfig {
  showPdf:              boolean;       // allow viewing original PDF
  showCharges:          boolean;       // show charge breakdown line items
  showUsage:            boolean;       // show usage amount and unit price
  showChart:            boolean;       // show monthly spending chart
  showAddress:          boolean;       // show property address in header
  visibleUtilityTypes:  UtilityType[]; // which utility types to include; all three = no filter
  maxMonths:            number | null; // limit bill history; null = no limit
}

export const SHARE_VISIBILITY_DEFAULTS: ShareVisibilityConfig = {
  showPdf:             true,
  showCharges:         true,
  showUsage:           true,
  showChart:           true,
  showAddress:         true,
  visibleUtilityTypes: ["electricity", "gas", "water"],
  maxMonths:           null,
};

export const shareLinks = pgTable("share_links", {
  token:            varchar("token",        { length: 64 }).primaryKey(),
  householdId:      uuid("household_id")
    .references(() => households.id, { onDelete: "cascade" })
    .notNull(),
  createdBy:        uuid("created_by").references(() => users.id).notNull(),
  label:            varchar("label",        { length: 100 }),   // e.g. "Landlord – John"
  expiresAt:        timestamp("expires_at"),                     // null = never
  createdAt:        timestamp("created_at").defaultNow().notNull(),
  visibilityConfig: jsonb("visibility_config")
    .notNull()
    .default(SHARE_VISIBILITY_DEFAULTS)
    .$type<ShareVisibilityConfig>(),
  // Snapshot of the creator's stay window, so a link never exposes bills the
  // creator couldn't see. Capped when the creator moves out.
  accessFrom:       date("access_from"),
  accessUntil:      date("access_until"),
});

export const shareLinksRelations = relations(shareLinks, ({ one }) => ({
  household: one(households, { fields: [shareLinks.householdId], references: [households.id] }),
  createdBy: one(users,      { fields: [shareLinks.createdBy],   references: [users.id] }),
}));

// ─── Inferred types ───────────────────────────────────────────────────────────

export type User            = typeof users.$inferSelect;
export type NewUser         = typeof users.$inferInsert;
export type Household       = typeof households.$inferSelect;
export type NewHousehold    = typeof households.$inferInsert;
export type HouseholdMember = typeof householdMembers.$inferSelect;
export type Bill            = typeof bills.$inferSelect;
export type NewBill         = typeof bills.$inferInsert;
export type ShareLink       = typeof shareLinks.$inferSelect;
export type NewShareLink    = typeof shareLinks.$inferInsert;
