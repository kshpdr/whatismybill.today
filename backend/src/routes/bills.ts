import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import { bills } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { ingestBillFromBuffer } from "../lib/ingest-bill.js";
import { getFile, deleteFile } from "../lib/storage.js";
import { getHouseholdAccess } from "../lib/household-access.js";
import { filterBillsByWindows, isBillInAnyWindow } from "../lib/access-window.js";

type Vars = { Variables: { userId: string } };
const router = new Hono<Vars>();

router.use("*", requireAuth);

// ─── Helpers ──────────────────────────────────────────────────────────────────

type BillRow = typeof bills.$inferSelect;

/**
 * Load a bill only if the user may see it. Bills outside the user's stay
 * windows are reported as not found so their existence isn't revealed.
 */
async function loadVisibleBill(id: string, userId: string) {
  const [bill] = await db.select().from(bills).where(eq(bills.id, id)).limit(1);
  if (!bill) return null;
  const access = await getHouseholdAccess(bill.householdId, userId);
  if (!access || !isBillInAnyWindow(bill, access.windows)) return null;
  return { bill, access };
}

function formatBill(b: BillRow) {
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
    storageRef:         b.storageRef,
    uploadedBy:         b.uploadedBy,
    parseStatus:        b.parseStatus,
    parseError:         b.parseError,
    uploadedAt:         b.uploadedAt.toISOString(),
  };
}

// ─── GET /bills?householdId=:id ───────────────────────────────────────────────

router.get("/", async (c) => {
  const userId      = c.get("userId");
  const householdId = c.req.query("householdId");

  if (!householdId) {
    return c.json({ error: "householdId query param is required" }, 400);
  }
  const access = await getHouseholdAccess(householdId, userId);
  if (!access) {
    return c.json({ error: "Not a member of this household" }, 403);
  }

  const rows = await db
    .select()
    .from(bills)
    .where(eq(bills.householdId, householdId))
    .orderBy(desc(bills.billingPeriodStart));

  return c.json(filterBillsByWindows(rows, access.windows).map(formatBill));
});

// ─── POST /bills/upload ───────────────────────────────────────────────────────

router.post("/upload", async (c) => {
  const userId = c.get("userId");

  // Parse multipart form
  const body = await c.req.parseBody();
  const file        = body["file"] as File | undefined;
  const householdId = body["householdId"] as string | undefined;

  if (!file || !(file instanceof File)) {
    return c.json({ error: "file is required (multipart/form-data)" }, 400);
  }
  if (!householdId) {
    return c.json({ error: "householdId is required" }, 400);
  }
  if (file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
    return c.json({ error: "Only PDF files are accepted" }, 400);
  }
  const access = await getHouseholdAccess(householdId, userId);
  if (!access?.active) {
    return c.json({ error: "Only current members can upload bills" }, 403);
  }

  const buffer      = Buffer.from(await file.arrayBuffer());
  const privacyMode = body["privacyMode"] === "true";

  const result = await ingestBillFromBuffer(buffer, { householdId, userId, privacyMode });

  if (!result.ok) {
    if (result.error === "encoding_error") {
      return c.json({ error: "encoding_error", message: result.message, storageRef: result.storageRef }, 422);
    }
    return c.json({ error: "parse_failed", message: result.message }, 422);
  }

  return c.json({ bills: result.bills.map(formatBill) }, 201);
});

// ─── GET /bills/:id ───────────────────────────────────────────────────────────

router.get("/:id", async (c) => {
  const userId = c.get("userId");
  const { id } = c.req.param();

  const visible = await loadVisibleBill(id, userId);
  if (!visible) return c.json({ error: "Bill not found" }, 404);
  const { bill } = visible;

  return c.json(formatBill(bill));
});

// ─── GET /bills/:id/pdf ───────────────────────────────────────────────────────

router.get("/:id/pdf", async (c) => {
  const userId = c.get("userId");
  const { id } = c.req.param();

  const visible = await loadVisibleBill(id, userId);
  if (!visible) return c.json({ error: "Bill not found" }, 404);
  const { bill } = visible;

  if (!bill.storageRef) {
    return c.json({ error: "PDF was not stored for this bill" }, 404);
  }

  let fileBuffer: Buffer;
  try {
    fileBuffer = await getFile(bill.storageRef);
  } catch {
    return c.json({ error: "PDF file not found on disk" }, 404);
  }

  return new Response(fileBuffer, {
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `inline; filename="bill-${id}.pdf"`,
      "Cache-Control":       "private, max-age=3600",
    },
  });
});

// ─── DELETE /bills/:id ────────────────────────────────────────────────────────

router.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const { id } = c.req.param();

  const visible = await loadVisibleBill(id, userId);
  if (!visible) return c.json({ error: "Bill not found" }, 404);
  const { bill, access } = visible;
  if (!access.active) {
    return c.json({ error: "Only current members can delete bills" }, 403);
  }

  await db.delete(bills).where(eq(bills.id, id));
  if (bill.storageRef) await deleteFile(bill.storageRef);

  return c.body(null, 204);
});

export default router;
