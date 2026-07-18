/**
 * Telegram ↔ account mapping helpers for the bot.
 *
 * Users are keyed by their Telegram id (`users.telegramId`, unique) — the same
 * key the Login Widget and account-linking flow set (`routes/auth.ts`). The bot
 * only ever *finds* an existing user; it never creates one (account creation and
 * linking happen on the website, with explicit user consent).
 */

import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, households, householdMembers } from "../db/schema.js";

type User = typeof users.$inferSelect;
type Household = typeof households.$inferSelect;

/** Look up a user by their Telegram id. Returns null if none exists. */
export async function findTelegramUser(telegramId: string): Promise<User | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.telegramId, telegramId))
    .limit(1);
  return user ?? null;
}

/**
 * Return the user's primary household — the first one they belong to,
 * ordered by join time so it's stable. Null when they have none.
 *
 * A user can belong to several households; the bot uses this single pick and
 * names it in its replies. A `/sethousehold` selector can be layered on later.
 */
export async function getPrimaryHousehold(userId: string): Promise<Household | null> {
  const [row] = await db
    .select({ household: households })
    .from(householdMembers)
    .innerJoin(households, eq(householdMembers.householdId, households.id))
    .where(eq(householdMembers.userId, userId))
    .orderBy(householdMembers.joinedAt)
    .limit(1);
  return row?.household ?? null;
}
