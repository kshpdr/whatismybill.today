import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  numeric,
  date,
  jsonb,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id:           uuid("id").primaryKey().defaultRandom(),
  email:        varchar("email", { length: 255 }).unique().notNull(),
  name:         varchar("name", { length: 255 }).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
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
    householdId: uuid("household_id")
      .references(() => households.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.householdId, t.userId] })]
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
  storageRef:           varchar("storage_ref",   { length: 500 }).notNull(), // relative path on disk
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

export const shareLinks = pgTable("share_links", {
  token:       varchar("token",        { length: 64 }).primaryKey(),
  householdId: uuid("household_id")
    .references(() => households.id, { onDelete: "cascade" })
    .notNull(),
  createdBy:   uuid("created_by").references(() => users.id).notNull(),
  label:       varchar("label",        { length: 100 }),   // e.g. "Landlord – John"
  expiresAt:   timestamp("expires_at"),                     // null = never
  createdAt:   timestamp("created_at").defaultNow().notNull(),
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
