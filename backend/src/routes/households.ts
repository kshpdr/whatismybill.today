import { Hono } from "hono";
import { eq, and, isNull, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import { households, householdMembers, shareLinks, users } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { generateInviteCode } from "../lib/invite-code.js";
import { getHouseholdAccess, endStay } from "../lib/household-access.js";
import { isIsoDate, todayIso } from "../lib/access-window.js";

type Vars = { Variables: { userId: string } };
const router = new Hono<Vars>();

router.use("*", requireAuth);

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function isOwner(householdId: string, userId: string): Promise<boolean> {
  const row = await db
    .select()
    .from(households)
    .where(and(eq(households.id, householdId), eq(households.ownerId, userId)))
    .limit(1);
  return row.length > 0;
}

async function rotateInviteCode(householdId: string): Promise<string> {
  const inviteCode = generateInviteCode();
  await db
    .update(households)
    .set({ inviteCode, inviteCodeRotatedAt: new Date() })
    .where(eq(households.id, householdId));
  return inviteCode;
}

type MembershipRow = typeof householdMembers.$inferSelect;

function formatMembership(m: Pick<MembershipRow, "accessFrom" | "accessUntil">) {
  return {
    active:      m.accessUntil === null,
    accessFrom:  m.accessFrom ?? null,
    accessUntil: m.accessUntil ?? null,
  };
}

/** Former members get no invite code: they must not be able to rejoin on their own. */
function formatHousehold(
  h: typeof households.$inferSelect,
  membership: Pick<MembershipRow, "accessFrom" | "accessUntil"> = { accessFrom: null, accessUntil: null },
) {
  const m = formatMembership(membership);
  return {
    id:                  h.id,
    nickname:            h.nickname,
    address:             h.address,
    ownerId:             h.ownerId,
    inviteCode:          m.active ? h.inviteCode : null,
    inviteCodeRotatedAt: h.inviteCodeRotatedAt?.toISOString(),
    createdAt:           h.createdAt.toISOString(),
    membership:          m,
  };
}

/** Validate an inclusive stay window; returns an error message or null. */
function validateStayDates(from: string | null, until: string | null): string | null {
  if (from !== null && !isIsoDate(from))   return "accessFrom must be a YYYY-MM-DD date";
  if (until !== null && !isIsoDate(until)) return "accessUntil must be a YYYY-MM-DD date";
  if (until !== null && until > todayIso()) return "Move-out date can't be in the future";
  if (from !== null && until !== null && from > until) return "Move-in date must be on or before move-out date";
  return null;
}

// ─── GET /households ──────────────────────────────────────────────────────────

router.get("/", async (c) => {
  const userId = c.get("userId");
  const rows = await db
    .select({ household: households, membership: householdMembers })
    .from(householdMembers)
    .innerJoin(households, eq(householdMembers.householdId, households.id))
    .where(eq(householdMembers.userId, userId))
    .orderBy(desc(householdMembers.joinedAt));

  // One entry per household: the open stay if there is one, else the latest.
  const byHousehold = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const seen = byHousehold.get(r.household.id);
    if (!seen || (seen.membership.accessUntil !== null && r.membership.accessUntil === null)) {
      byHousehold.set(r.household.id, r);
    }
  }

  return c.json([...byHousehold.values()].map((r) => formatHousehold(r.household, r.membership)));
});

// ─── POST /households ─────────────────────────────────────────────────────────

router.post("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{ nickname: string; address?: string }>();

  if (!body.nickname?.trim()) {
    return c.json({ error: "nickname is required" }, 400);
  }

  let inviteCode = generateInviteCode();
  // Ensure uniqueness (astronomically unlikely to collide but be safe)
  for (let i = 0; i < 5; i++) {
    const existing = await db
      .select()
      .from(households)
      .where(eq(households.inviteCode, inviteCode))
      .limit(1);
    if (existing.length === 0) break;
    inviteCode = generateInviteCode();
  }

  const [household] = await db
    .insert(households)
    .values({
      nickname:   body.nickname.trim(),
      address:    body.address?.trim() || undefined,
      ownerId:    userId,
      inviteCode,
    })
    .returning();

  // The owner's stay is unbounded so they always see the full history.
  await db.insert(householdMembers).values({ householdId: household.id, userId });

  return c.json(formatHousehold(household), 201);
});

// ─── POST /households/join ────────────────────────────────────────────────────

router.post("/join", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{ inviteCode: string }>();
  const code = body.inviteCode?.toUpperCase().trim();

  if (!code || code.length !== 6) {
    return c.json({ error: "A 6-character invite code is required" }, 400);
  }

  const [household] = await db
    .select()
    .from(households)
    .where(eq(households.inviteCode, code))
    .limit(1);

  if (!household) {
    return c.json({ error: "No home found with that code. Check the code and try again." }, 404);
  }

  const access = await getHouseholdAccess(household.id, userId);
  if (access?.active) {
    return c.json({ error: "You are already a member of this home." }, 409);
  }

  // New stays start today; the owner can backdate the move-in date afterwards.
  const [membership] = await db
    .insert(householdMembers)
    .values({ householdId: household.id, userId, accessFrom: todayIso() })
    .returning();
  return c.json(formatHousehold(household, membership), 200);
});

// ─── GET /households/:id/members ─────────────────────────────────────────────

router.get("/:id/members", async (c) => {
  const userId = c.get("userId");
  const { id } = c.req.param();

  const access = await getHouseholdAccess(id, userId);
  if (!access?.active) {
    return c.json({ error: "Not a member of this home" }, 403);
  }

  const [household] = await db
    .select()
    .from(households)
    .where(eq(households.id, id))
    .limit(1);

  const rows = await db
    .select({ user: users, membership: householdMembers })
    .from(householdMembers)
    .innerJoin(users, eq(householdMembers.userId, users.id))
    .where(eq(householdMembers.householdId, id))
    .orderBy(householdMembers.joinedAt);

  return c.json(
    rows.map((r) => ({
      id:           r.user.id,
      membershipId: r.membership.id,
      name:         r.user.name,
      email:        r.user.email,
      isOwner:      r.user.id === household.ownerId,
      joinedAt:     r.membership.joinedAt.toISOString(),
      ...formatMembership(r.membership),
    }))
  );
});

// ─── PATCH /households/:id ────────────────────────────────────────────────────

router.patch("/:id", async (c) => {
  const userId = c.get("userId");
  const { id } = c.req.param();

  if (!(await isOwner(id, userId))) {
    return c.json({ error: "Only the owner can update home details" }, 403);
  }

  const body = await c.req.json<{ nickname?: string; address?: string }>();
  const updates: Partial<typeof households.$inferInsert> = {};
  if (body.nickname?.trim()) updates.nickname = body.nickname.trim();
  if ("address" in body)      updates.address  = body.address?.trim() || undefined;

  if (Object.keys(updates).length === 0) {
    return c.json({ error: "Nothing to update" }, 400);
  }

  const [updated] = await db
    .update(households)
    .set(updates)
    .where(eq(households.id, id))
    .returning();

  return c.json(formatHousehold(updated));
});

// ─── POST /households/:id/leave ───────────────────────────────────────────────

router.post("/:id/leave", async (c) => {
  const userId = c.get("userId");
  const { id } = c.req.param();

  const access = await getHouseholdAccess(id, userId);
  if (!access?.active) {
    return c.json({ error: "Not a member of this home" }, 403);
  }

  if (await isOwner(id, userId)) {
    return c.json(
      { error: "Owners cannot leave. Transfer ownership or delete the home instead." },
      400
    );
  }

  await endStay(id, userId, todayIso());
  return c.body(null, 204);
});

// ─── DELETE /households/:id/members/:memberId ─────────────────────────────────
// Default: end the member's stay (they keep read-only access to it).
// ?until=YYYY-MM-DD backdates the move-out. ?purge=true removes all access.
// Either way the invite code is rotated, since the removed member knows it.

router.delete("/:id/members/:memberId", async (c) => {
  const requesterId = c.get("userId");
  const { id, memberId } = c.req.param();

  if (!(await isOwner(id, requesterId))) {
    return c.json({ error: "Only the owner can remove members" }, 403);
  }

  if (memberId === requesterId) {
    return c.json({ error: "Owners cannot remove themselves" }, 400);
  }

  if (c.req.query("purge") === "true") {
    await db
      .delete(shareLinks)
      .where(and(eq(shareLinks.householdId, id), eq(shareLinks.createdBy, memberId)));
    await db
      .delete(householdMembers)
      .where(and(eq(householdMembers.householdId, id), eq(householdMembers.userId, memberId)));
    await rotateInviteCode(id);
    return c.body(null, 204);
  }

  const [openStay] = await db
    .select()
    .from(householdMembers)
    .where(
      and(
        eq(householdMembers.householdId, id),
        eq(householdMembers.userId, memberId),
        isNull(householdMembers.accessUntil),
      )
    )
    .limit(1);
  if (!openStay) {
    return c.json({ error: "Not a current member of this home" }, 404);
  }

  const until = c.req.query("until") ?? todayIso();
  const invalid = validateStayDates(openStay.accessFrom, until);
  if (invalid) return c.json({ error: invalid }, 400);

  await endStay(id, memberId, until);
  await rotateInviteCode(id);
  return c.body(null, 204);
});

// ─── PATCH /households/:id/memberships/:membershipId ──────────────────────────
// Owner corrects a stay's move-in / move-out dates.

router.patch("/:id/memberships/:membershipId", async (c) => {
  const requesterId = c.get("userId");
  const { id, membershipId } = c.req.param();

  if (!(await isOwner(id, requesterId))) {
    return c.json({ error: "Only the owner can change move-in and move-out dates" }, 403);
  }

  const [stay] = await db
    .select()
    .from(householdMembers)
    .where(and(eq(householdMembers.id, membershipId), eq(householdMembers.householdId, id)))
    .limit(1);
  if (!stay) return c.json({ error: "Membership not found" }, 404);
  if (stay.userId === requesterId) {
    return c.json({ error: "The owner always has access to the full history" }, 400);
  }

  const body = await c.req.json<{ accessFrom?: string | null; accessUntil?: string }>()
    .catch(() => ({} as { accessFrom?: string | null; accessUntil?: string }));
  if (body.accessUntil !== undefined && stay.accessUntil === null) {
    return c.json({ error: "Remove the member to set a move-out date" }, 400);
  }

  const accessFrom  = body.accessFrom  !== undefined ? body.accessFrom  : stay.accessFrom;
  const accessUntil = body.accessUntil !== undefined ? body.accessUntil : stay.accessUntil;
  const invalid = validateStayDates(accessFrom, accessUntil);
  if (invalid) return c.json({ error: invalid }, 400);

  const [updated] = await db
    .update(householdMembers)
    .set({ accessFrom, accessUntil })
    .where(eq(householdMembers.id, membershipId))
    .returning();

  // Links carry a snapshot of their creator's stay; keep those of this stay in
  // step. Open-stay links have no end date; closed-stay links were capped at it.
  await db
    .update(shareLinks)
    .set({ accessFrom, accessUntil })
    .where(
      and(
        eq(shareLinks.householdId, id),
        eq(shareLinks.createdBy, stay.userId),
        stay.accessUntil === null
          ? isNull(shareLinks.accessUntil)
          : eq(shareLinks.accessUntil, stay.accessUntil),
      )
    );

  return c.json({ membershipId: updated.id, ...formatMembership(updated) });
});

// ─── POST /households/:id/invite-code/rotate ──────────────────────────────────

router.post("/:id/invite-code/rotate", async (c) => {
  const userId = c.get("userId");
  const { id } = c.req.param();

  if (!(await isOwner(id, userId))) {
    return c.json({ error: "Only the owner can rotate the invite code" }, 403);
  }

  return c.json({ inviteCode: await rotateInviteCode(id) });
});

// ─── DELETE /households/:id ───────────────────────────────────────────────────

router.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const { id } = c.req.param();

  if (!(await isOwner(id, userId))) {
    return c.json({ error: "Only the owner can delete this home" }, 403);
  }

  // Cascade deletes householdMembers + bills (FK onDelete: cascade)
  await db.delete(households).where(eq(households.id, id));
  return c.body(null, 204);
});

export default router;
