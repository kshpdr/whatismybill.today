/**
 * Single source of truth for "what may this user do in this household".
 *
 * Current members (an open stay) can read bills in their window and write.
 * Former members (only closed stays) can read bills in their past windows and
 * nothing else. Routes must go through this module rather than querying
 * householdMembers directly, so the window rules can't be bypassed.
 */

import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { householdMembers, shareLinks } from "../db/schema.js";
import type { AccessWindow } from "./access-window.js";

export interface HouseholdAccess {
  /** Has an open stay: may upload, delete, share and manage. */
  active:       boolean;
  /** The open stay's window, or null for former members. */
  activeWindow: AccessWindow | null;
  /** Every stay's window; bills are readable if they overlap any of them. */
  windows:      AccessWindow[];
}

export async function getHouseholdAccess(
  householdId: string,
  userId:      string,
): Promise<HouseholdAccess | null> {
  const rows = await db
    .select()
    .from(householdMembers)
    .where(
      and(
        eq(householdMembers.householdId, householdId),
        eq(householdMembers.userId, userId),
      )
    );
  if (rows.length === 0) return null;

  const windows = rows.map((r) => ({ from: r.accessFrom ?? null, until: r.accessUntil ?? null }));
  const open    = windows.find((w) => w.until === null) ?? null;
  return { active: open !== null, activeWindow: open, windows };
}

/**
 * Close a member's open stay and cap their share links at the same date, so
 * links they made keep showing their stay but nothing after it.
 */
export async function endStay(householdId: string, userId: string, until: string): Promise<boolean> {
  const closed = await db
    .update(householdMembers)
    .set({ accessUntil: until })
    .where(
      and(
        eq(householdMembers.householdId, householdId),
        eq(householdMembers.userId, userId),
        isNull(householdMembers.accessUntil),
      )
    )
    .returning({ id: householdMembers.id });
  if (closed.length === 0) return false;

  await db
    .update(shareLinks)
    .set({ accessUntil: until })
    .where(
      and(
        eq(shareLinks.householdId, householdId),
        eq(shareLinks.createdBy, userId),
        isNull(shareLinks.accessUntil),
      )
    );
  return true;
}
