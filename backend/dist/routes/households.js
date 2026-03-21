import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { households, householdMembers, users } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { generateInviteCode } from "../lib/invite-code.js";
const router = new Hono();
router.use("*", requireAuth);
// ─── Helpers ──────────────────────────────────────────────────────────────────
async function isMember(householdId, userId) {
    const row = await db
        .select()
        .from(householdMembers)
        .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, userId)))
        .limit(1);
    return row.length > 0;
}
async function isOwner(householdId, userId) {
    const row = await db
        .select()
        .from(households)
        .where(and(eq(households.id, householdId), eq(households.ownerId, userId)))
        .limit(1);
    return row.length > 0;
}
function formatHousehold(h) {
    return {
        id: h.id,
        nickname: h.nickname,
        address: h.address,
        ownerId: h.ownerId,
        inviteCode: h.inviteCode,
        inviteCodeRotatedAt: h.inviteCodeRotatedAt?.toISOString(),
        createdAt: h.createdAt.toISOString(),
    };
}
// ─── GET /households ──────────────────────────────────────────────────────────
router.get("/", async (c) => {
    const userId = c.get("userId");
    const rows = await db
        .select({ household: households })
        .from(householdMembers)
        .innerJoin(households, eq(householdMembers.householdId, households.id))
        .where(eq(householdMembers.userId, userId));
    return c.json(rows.map((r) => formatHousehold(r.household)));
});
// ─── POST /households ─────────────────────────────────────────────────────────
router.post("/", async (c) => {
    const userId = c.get("userId");
    const body = await c.req.json();
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
        if (existing.length === 0)
            break;
        inviteCode = generateInviteCode();
    }
    const [household] = await db
        .insert(households)
        .values({
        nickname: body.nickname.trim(),
        address: body.address?.trim() || undefined,
        ownerId: userId,
        inviteCode,
    })
        .returning();
    // Add owner as first member
    await db.insert(householdMembers).values({ householdId: household.id, userId });
    return c.json(formatHousehold(household), 201);
});
// ─── POST /households/join ────────────────────────────────────────────────────
router.post("/join", async (c) => {
    const userId = c.get("userId");
    const body = await c.req.json();
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
    const alreadyMember = await isMember(household.id, userId);
    if (alreadyMember) {
        return c.json({ error: "You are already a member of this home." }, 409);
    }
    await db.insert(householdMembers).values({ householdId: household.id, userId });
    return c.json(formatHousehold(household), 200);
});
// ─── GET /households/:id/members ─────────────────────────────────────────────
router.get("/:id/members", async (c) => {
    const userId = c.get("userId");
    const { id } = c.req.param();
    if (!(await isMember(id, userId))) {
        return c.json({ error: "Not a member of this home" }, 403);
    }
    const [household] = await db
        .select()
        .from(households)
        .where(eq(households.id, id))
        .limit(1);
    const rows = await db
        .select({ user: users, joinedAt: householdMembers.joinedAt })
        .from(householdMembers)
        .innerJoin(users, eq(householdMembers.userId, users.id))
        .where(eq(householdMembers.householdId, id));
    return c.json(rows.map((r) => ({
        id: r.user.id,
        name: r.user.name,
        email: r.user.email,
        isOwner: r.user.id === household.ownerId,
        joinedAt: r.joinedAt.toISOString(),
    })));
});
// ─── PATCH /households/:id ────────────────────────────────────────────────────
router.patch("/:id", async (c) => {
    const userId = c.get("userId");
    const { id } = c.req.param();
    if (!(await isOwner(id, userId))) {
        return c.json({ error: "Only the owner can update home details" }, 403);
    }
    const body = await c.req.json();
    const updates = {};
    if (body.nickname?.trim())
        updates.nickname = body.nickname.trim();
    if ("address" in body)
        updates.address = body.address?.trim() || undefined;
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
    if (!(await isMember(id, userId))) {
        return c.json({ error: "Not a member of this home" }, 403);
    }
    const [household] = await db
        .select()
        .from(households)
        .where(eq(households.id, id))
        .limit(1);
    if (household.ownerId === userId) {
        return c.json({ error: "Owners cannot leave. Transfer ownership or delete the home instead." }, 400);
    }
    await db
        .delete(householdMembers)
        .where(and(eq(householdMembers.householdId, id), eq(householdMembers.userId, userId)));
    return c.body(null, 204);
});
// ─── DELETE /households/:id/members/:userId ───────────────────────────────────
router.delete("/:id/members/:memberId", async (c) => {
    const requesterId = c.get("userId");
    const { id, memberId } = c.req.param();
    if (!(await isOwner(id, requesterId))) {
        return c.json({ error: "Only the owner can remove members" }, 403);
    }
    if (memberId === requesterId) {
        return c.json({ error: "Owners cannot remove themselves" }, 400);
    }
    await db
        .delete(householdMembers)
        .where(and(eq(householdMembers.householdId, id), eq(householdMembers.userId, memberId)));
    return c.body(null, 204);
});
// ─── POST /households/:id/invite-code/rotate ──────────────────────────────────
router.post("/:id/invite-code/rotate", async (c) => {
    const userId = c.get("userId");
    const { id } = c.req.param();
    if (!(await isOwner(id, userId))) {
        return c.json({ error: "Only the owner can rotate the invite code" }, 403);
    }
    const newCode = generateInviteCode();
    await db
        .update(households)
        .set({ inviteCode: newCode, inviteCodeRotatedAt: new Date() })
        .where(eq(households.id, id));
    return c.json({ inviteCode: newCode });
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
//# sourceMappingURL=households.js.map