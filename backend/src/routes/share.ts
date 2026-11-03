import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "../db/index.js";
import { shareLinks, households, bills, SHARE_VISIBILITY_DEFAULTS } from "../db/schema.js";
import type { ShareVisibilityConfig } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { mergeVisibilityConfig, filterBillsByVisibility } from "../lib/share-filter.js";
import { getHouseholdAccess } from "../lib/household-access.js";
import { filterBillsByWindows, isBillInWindow, windowContains } from "../lib/access-window.js";
import type { AccessWindow } from "../lib/access-window.js";

type Vars = { Variables: { userId: string } };
const router = new Hono<Vars>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

function linkWindow(link: { accessFrom: string | null; accessUntil: string | null }): AccessWindow {
  return { from: link.accessFrom ?? null, until: link.accessUntil ?? null };
}

function formatBill(b: typeof bills.$inferSelect) {
  return {
    id:                 b.id,
    householdId:        b.householdId,
    provider:           b.provider,
    utilityType:        b.utilityType,
    billingPeriodStart: b.billingPeriodStart,
    billingPeriodEnd:   b.billingPeriodEnd,
    totalAmount:        Number(b.totalAmount),
    usage:              Number(b.usage),
    usageUnit:          b.usageUnit,
    unitPrice:          Number(b.unitPrice),
    charges:            b.charges,
    parseStatus:        b.parseStatus,
    uploadedAt:         b.uploadedAt.toISOString(),
  };
}

// ─── POST /households/:id/share ───────────────────────────────────────────────

router.post("/households/:id/share", requireAuth, async (c) => {
  const userId      = c.get("userId");
  const householdId = c.req.param("id") as string;

  const access = await getHouseholdAccess(householdId, userId);
  if (!access?.activeWindow) {
    return c.json({ error: "Only current members can create share links" }, 403);
  }

  type Body = { label?: string; expiryDays?: number; visibilityConfig?: Partial<ShareVisibilityConfig> };
  const body: Body = await c.req.json<Body>().catch(() => ({}));
  const label      = body.label?.trim() || undefined;
  const expiryDays = body.expiryDays ?? 90;
  const expiresAt  = expiryDays > 0
    ? new Date(Date.now() + expiryDays * 86_400_000)
    : undefined;

  // Merge provided visibility overrides with defaults
  const visibilityConfig = mergeVisibilityConfig(body.visibilityConfig ?? {});

  const token = generateToken();
  const [link] = await db.insert(shareLinks).values({
    token,
    householdId,
    createdBy: userId,
    label,
    expiresAt,
    visibilityConfig,
    accessFrom:  access.activeWindow.from,
    accessUntil: access.activeWindow.until,
  }).returning();

  return c.json({
    token:            link.token,
    label:            link.label ?? null,
    expiresAt:        link.expiresAt?.toISOString() ?? null,
    createdAt:        link.createdAt.toISOString(),
    visibilityConfig: link.visibilityConfig,
  }, 201);
});

// ─── GET /households/:id/share ────────────────────────────────────────────────

router.get("/households/:id/share", requireAuth, async (c) => {
  const userId      = c.get("userId");
  const householdId = c.req.param("id") as string;

  const access = await getHouseholdAccess(householdId, userId);
  if (!access?.activeWindow) {
    return c.json({ error: "Not a member of this household" }, 403);
  }
  const memberWindow = access.activeWindow;

  const rows = await db
    .select({
      token:            shareLinks.token,
      label:            shareLinks.label,
      expiresAt:        shareLinks.expiresAt,
      createdAt:        shareLinks.createdAt,
      visibilityConfig: shareLinks.visibilityConfig,
      accessFrom:       shareLinks.accessFrom,
      accessUntil:      shareLinks.accessUntil,
    })
    .from(shareLinks)
    .where(eq(shareLinks.householdId, householdId));

  // A link token grants its whole window, so only show links that expose
  // nothing beyond what this member can already see.
  const visible = rows.filter((l) => windowContains(memberWindow, linkWindow(l)));

  return c.json(visible.map((l) => ({
    token:            l.token,
    label:            l.label ?? null,
    expiresAt:        l.expiresAt?.toISOString() ?? null,
    createdAt:        l.createdAt.toISOString(),
    visibilityConfig: l.visibilityConfig ?? SHARE_VISIBILITY_DEFAULTS,
  })));
});

// ─── DELETE /households/:id/share/:token ──────────────────────────────────────

router.delete("/households/:id/share/:token", requireAuth, async (c) => {
  const userId      = c.get("userId");
  const householdId = c.req.param("id")    as string;
  const token       = c.req.param("token") as string;

  const access = await getHouseholdAccess(householdId, userId);
  if (!access?.activeWindow) {
    return c.json({ error: "Not a member of this household" }, 403);
  }

  const [link] = await db.select().from(shareLinks).where(
    and(
      eq(shareLinks.token, token),
      eq(shareLinks.householdId, householdId),
    )
  ).limit(1);
  if (!link || !windowContains(access.activeWindow, linkWindow(link))) {
    return c.json({ error: "Share link not found" }, 404);
  }

  await db.delete(shareLinks).where(eq(shareLinks.token, token));

  return c.body(null, 204);
});

// ─── GET /share/:token — public, no auth ─────────────────────────────────────

router.get("/share/:token", async (c) => {
  const token = c.req.param("token") as string;

  const [link] = await db.select().from(shareLinks)
    .where(eq(shareLinks.token, token)).limit(1);

  if (!link) return c.json({ error: "Share link not found or revoked" }, 404);
  if (link.expiresAt && link.expiresAt < new Date()) {
    return c.json({ error: "Share link has expired" }, 410);
  }

  const [household] = await db.select().from(households)
    .where(eq(households.id, link.householdId)).limit(1);
  if (!household) return c.json({ error: "Household not found" }, 404);

  const allBillRows = await db.select().from(bills)
    .where(eq(bills.householdId, link.householdId));

  const visibilityConfig = mergeVisibilityConfig(link.visibilityConfig);
  const billRows = filterBillsByVisibility(
    filterBillsByWindows(allBillRows, [linkWindow(link)]),
    visibilityConfig,
  );

  return c.json({
    household: { nickname: household.nickname, address: household.address ?? null },
    bills:     billRows.map(formatBill),
    shareLink: {
      label:            link.label ?? null,
      expiresAt:        link.expiresAt?.toISOString() ?? null,
      createdAt:        link.createdAt.toISOString(),
      visibilityConfig,
    },
  });
});

// ─── GET /share/:token/bills/:billId/pdf — PDF proxy ─────────────────────────

router.get("/share/:token/bills/:billId/pdf", async (c) => {
  const token  = c.req.param("token")  as string;
  const billId = c.req.param("billId") as string;

  const [link] = await db.select().from(shareLinks)
    .where(eq(shareLinks.token, token)).limit(1);
  if (!link) return c.json({ error: "Invalid share link" }, 404);
  if (link.expiresAt && link.expiresAt < new Date()) {
    return c.json({ error: "Link expired" }, 410);
  }

  const [bill] = await db.select().from(bills).where(
    and(eq(bills.id, billId), eq(bills.householdId, link.householdId))
  ).limit(1);
  if (!bill || !isBillInWindow(bill, linkWindow(link))) return c.json({ error: "Bill not found" }, 404);
  if (!bill.storageRef) return c.json({ error: "PDF was not stored for this bill" }, 404);

  const { getFile } = await import("../lib/storage.js");
  const fileBuffer  = await getFile(bill.storageRef);

  return new Response(fileBuffer, {
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `inline; filename="bill-${billId}.pdf"`,
      "Cache-Control":       "private, max-age=3600",
    },
  });
});

export default router;
