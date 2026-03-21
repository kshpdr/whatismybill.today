import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import { bills, householdMembers } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { parseBillPDF } from "../lib/parsers/index.js";
import { mapPGEBillToRows } from "../lib/map-to-bill.js";
import { saveFile, getFile, deleteFile } from "../lib/storage.js";
import { randomUUID } from "crypto";

type Vars = { Variables: { userId: string } };
const router = new Hono<Vars>();

router.use("*", requireAuth);

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function isMember(householdId: string, userId: string): Promise<boolean> {
  const row = await db
    .select()
    .from(householdMembers)
    .where(
      and(
        eq(householdMembers.householdId, householdId),
        eq(householdMembers.userId, userId)
      )
    )
    .limit(1);
  return row.length > 0;
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
  if (!(await isMember(householdId, userId))) {
    return c.json({ error: "Not a member of this household" }, 403);
  }

  const rows = await db
    .select()
    .from(bills)
    .where(eq(bills.householdId, householdId))
    .orderBy(desc(bills.billingPeriodStart));

  return c.json(rows.map(formatBill));
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
  if (!(await isMember(householdId, userId))) {
    return c.json({ error: "Not a member of this household" }, 403);
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Give the PDF a stable ID before parsing so storage ref is determined upfront
  const pdfId     = randomUUID();
  const storageRef = await saveFile(householdId, pdfId, buffer);

  // Parse the PDF
  const parseResult = await parseBillPDF(buffer);

  if (!parseResult.success) {
    if (parseResult.encodingError) {
      return c.json({ error: "encoding_error", message: parseResult.error, storageRef }, 422);
    }
    return c.json({ error: "parse_failed", message: parseResult.error }, 422);
  }

  const rows = mapPGEBillToRows(
    parseResult.bill!,
    storageRef,
    householdId,
    userId,
    parseResult.ocrFallback ?? false
  );

  if (rows.length === 0) {
    return c.json({ error: "parse_failed", message: "No bill data could be extracted" }, 422);
  }

  const inserted = await db.insert(bills).values(rows).returning();
  return c.json({ bills: inserted.map(formatBill) }, 201);
});

// ─── GET /bills/:id ───────────────────────────────────────────────────────────

router.get("/:id", async (c) => {
  const userId = c.get("userId");
  const { id } = c.req.param();

  const [bill] = await db.select().from(bills).where(eq(bills.id, id)).limit(1);
  if (!bill) return c.json({ error: "Bill not found" }, 404);

  if (!(await isMember(bill.householdId, userId))) {
    return c.json({ error: "Not a member of this household" }, 403);
  }

  return c.json(formatBill(bill));
});

// ─── GET /bills/:id/pdf ───────────────────────────────────────────────────────

router.get("/:id/pdf", async (c) => {
  const userId = c.get("userId");
  const { id } = c.req.param();

  const [bill] = await db.select().from(bills).where(eq(bills.id, id)).limit(1);
  if (!bill) return c.json({ error: "Bill not found" }, 404);

  if (!(await isMember(bill.householdId, userId))) {
    return c.json({ error: "Not a member of this household" }, 403);
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

  const [bill] = await db.select().from(bills).where(eq(bills.id, id)).limit(1);
  if (!bill) return c.json({ error: "Bill not found" }, 404);

  if (!(await isMember(bill.householdId, userId))) {
    return c.json({ error: "Not a member of this household" }, 403);
  }

  await db.delete(bills).where(eq(bills.id, id));
  await deleteFile(bill.storageRef);

  return c.body(null, 204);
});

export default router;
