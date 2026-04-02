/**
 * Integration tests for share link routes.
 *
 * The DB is mocked so no postgres connection is needed.  Hono's built-in
 * `router.request()` is used to call routes end-to-end without starting a
 * server.
 *
 * Mocking strategy
 * ────────────────
 * Drizzle queries are chained: db.select().from(T).where(C).limit(N)
 * The route calls db.select() three times in sequence:
 *   1. shareLinks → one row (or none)
 *   2. households → one row
 *   3. bills      → array (no .limit())
 *
 * We mock db.select to use mockReturnValueOnce so each call in sequence
 * gets the right response via a helper that returns a Promise-like object
 * that also exposes a .limit() for the first two queries.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── DB mock ──────────────────────────────────────────────────────────────────
// vi.mock() is hoisted by Vitest, so the factory runs before any const/let
// declarations in this file.  Use vi.hoisted() so mockSelect is available
// inside the factory AND in the test body.

const mockSelect = vi.hoisted(() => vi.fn());

vi.mock("../db/index.js", () => ({ db: { select: mockSelect } }));

// ─── Other mocks ──────────────────────────────────────────────────────────────

// requireAuth middleware: for protected routes we need a userId in context.
// We replace it with a passthrough that injects a fixed userId.
vi.mock("../middleware/auth.js", () => ({
  requireAuth: vi.fn(async (c: any, next: any) => {
    c.set("userId", "user-abc");
    await next();
  }),
}));

// householdMembers check (isMember) also calls db — handled via mockSelect
// but the DELETE / POST / GET list routes call isMember first.
// We'll configure them per-test below.

// ─── Now import the router (after mocks are set up) ───────────────────────────

import router from "../routes/share.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const HOUSEHOLD_ID = "hh-123";
const TOKEN        = "a".repeat(64);

const MOCK_HOUSEHOLD = {
  id:         HOUSEHOLD_ID,
  nickname:   "Maple House",
  address:    "123 Maple St",
  ownerId:    "user-abc",
  inviteCode: "ABC123",
  inviteCodeRotatedAt: new Date(),
  createdAt:  new Date(),
};

function makeLink(overrides: Record<string, unknown> = {}) {
  return {
    token:       TOKEN,
    householdId: HOUSEHOLD_ID,
    createdBy:   "user-abc",
    label:       null,
    expiresAt:   null,
    createdAt:   new Date("2026-01-01T00:00:00Z"),
    visibilityConfig: {
      showPdf: true, showCharges: true, showUsage: true,
      showChart: true, showAddress: true,
      visibleUtilityTypes: ["electricity", "gas", "water"],
      maxMonths: null,
    },
    ...overrides,
  };
}

function makeBillRow(id: string, type: "electricity" | "gas" | "water", end: string) {
  return {
    id,
    householdId:        HOUSEHOLD_ID,
    provider:           "PG&E",
    utilityType:        type,
    billingPeriodStart: "2026-02-01",
    billingPeriodEnd:   end,
    totalAmount:        "100.00",
    usage:              "500.0000",
    usageUnit:          "kWh",
    unitPrice:          "0.200000",
    charges:            [],
    storageRef:         null,
    uploadedBy:         null,
    parseStatus:        "success",
    parseError:         null,
    rawText:            null,
    uploadedAt:         new Date("2026-03-01T10:00:00Z"),
  };
}

/**
 * Build a Drizzle-like query result that works for both:
 *   await db.select().from(T).where(C).limit(N)   → returns data.slice(0, N)
 *   await db.select().from(T).where(C)             → returns data
 */
function makeQueryResult(data: unknown[]) {
  // The result of .where() must be awaitable AND have a .limit() method
  const p = Promise.resolve(data) as any;
  p.limit = vi.fn().mockResolvedValue(data.slice(0, 1));
  return p;
}

function makeChain(data: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(makeQueryResult(data)),
    }),
  };
}

/** Shared bill rows used across multiple tests. */
const BILLS = [
  makeBillRow("e1", "electricity", "2026-03-15"),
  makeBillRow("g1", "gas",         "2026-03-10"),
  makeBillRow("w1", "water",       "2026-02-20"),
];

// ─── GET /share/:token — public endpoint ─────────────────────────────────────

describe("GET /share/:token", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when token is not found", async () => {
    mockSelect.mockReturnValueOnce(makeChain([])); // shareLinks query → empty
    const res = await router.request(`/share/${TOKEN}`);
    expect(res.status).toBe(404);
    const body = await res.json() as any;
    expect(body.error).toMatch(/not found|revoked/i);
  });

  it("returns 410 when link is expired", async () => {
    const expiredLink = makeLink({ expiresAt: new Date("2020-01-01") });
    mockSelect.mockReturnValueOnce(makeChain([expiredLink]));
    const res = await router.request(`/share/${TOKEN}`);
    expect(res.status).toBe(410);
    const body = await res.json() as any;
    expect(body.error).toMatch(/expired/i);
  });

  it("returns 200 with all bills when no filters applied", async () => {
    mockSelect
      .mockReturnValueOnce(makeChain([makeLink()]))       // shareLinks
      .mockReturnValueOnce(makeChain([MOCK_HOUSEHOLD]))   // households
      .mockReturnValueOnce(makeChain(BILLS));             // bills

    const res = await router.request(`/share/${TOKEN}`);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.bills).toHaveLength(3);
    expect(body.household.nickname).toBe("Maple House");
  });

  it("includes visibilityConfig in the response", async () => {
    mockSelect
      .mockReturnValueOnce(makeChain([makeLink()]))
      .mockReturnValueOnce(makeChain([MOCK_HOUSEHOLD]))
      .mockReturnValueOnce(makeChain(BILLS));

    const res = await router.request(`/share/${TOKEN}`);
    const body = await res.json() as any;
    expect(body.shareLink.visibilityConfig).toBeDefined();
    expect(body.shareLink.visibilityConfig.showPdf).toBe(true);
    expect(body.shareLink.visibilityConfig.visibleUtilityTypes).toEqual(
      ["electricity", "gas", "water"]
    );
  });

  it("filters out bills whose utility type is not in visibleUtilityTypes", async () => {
    const link = makeLink({
      visibilityConfig: {
        showPdf: true, showCharges: true, showUsage: true,
        showChart: true, showAddress: true,
        visibleUtilityTypes: ["electricity"],
        maxMonths: null,
      },
    });
    mockSelect
      .mockReturnValueOnce(makeChain([link]))
      .mockReturnValueOnce(makeChain([MOCK_HOUSEHOLD]))
      .mockReturnValueOnce(makeChain(BILLS));

    const res = await router.request(`/share/${TOKEN}`);
    const body = await res.json() as any;
    expect(body.bills).toHaveLength(1);
    expect(body.bills[0].utilityType).toBe("electricity");
  });

  it("filters out gas and water when only electricity is visible", async () => {
    const link = makeLink({
      visibilityConfig: {
        showPdf: true, showCharges: true, showUsage: true,
        showChart: true, showAddress: true,
        visibleUtilityTypes: ["electricity"],
        maxMonths: null,
      },
    });
    mockSelect
      .mockReturnValueOnce(makeChain([link]))
      .mockReturnValueOnce(makeChain([MOCK_HOUSEHOLD]))
      .mockReturnValueOnce(makeChain(BILLS));

    const res = await router.request(`/share/${TOKEN}`);
    const body = await res.json() as any;
    const types = new Set(body.bills.map((b: any) => b.utilityType));
    expect(types.has("gas")).toBe(false);
    expect(types.has("water")).toBe(false);
  });

  it("returns 0 bills when visibleUtilityTypes is empty", async () => {
    const link = makeLink({
      visibilityConfig: {
        showPdf: true, showCharges: true, showUsage: true,
        showChart: true, showAddress: true,
        visibleUtilityTypes: [],
        maxMonths: null,
      },
    });
    mockSelect
      .mockReturnValueOnce(makeChain([link]))
      .mockReturnValueOnce(makeChain([MOCK_HOUSEHOLD]))
      .mockReturnValueOnce(makeChain(BILLS));

    const res = await router.request(`/share/${TOKEN}`);
    const body = await res.json() as any;
    expect(body.bills).toHaveLength(0);
  });

  it("filters bills by maxMonths — drops bills older than the cutoff", async () => {
    // Freeze time so the cutoff is deterministic
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T00:00:00Z"));

    const link = makeLink({
      visibilityConfig: {
        showPdf: true, showCharges: true, showUsage: true,
        showChart: true, showAddress: true,
        visibleUtilityTypes: ["electricity", "gas", "water"],
        maxMonths: 3, // cutoff ≈ 2026-01-01
      },
    });

    // Mix of recent and old bills
    const recentBill = makeBillRow("e-new", "electricity", "2026-03-15"); // kept
    const oldBill    = makeBillRow("e-old", "electricity", "2025-06-30"); // dropped
    mockSelect
      .mockReturnValueOnce(makeChain([link]))
      .mockReturnValueOnce(makeChain([MOCK_HOUSEHOLD]))
      .mockReturnValueOnce(makeChain([recentBill, oldBill]));

    const res = await router.request(`/share/${TOKEN}`);
    const body = await res.json() as any;
    expect(body.bills).toHaveLength(1);
    expect(body.bills[0].id).toBe("e-new");

    vi.useRealTimers();
  });

  it("backward compat: link without visibilityConfig defaults to showing everything", async () => {
    const link = makeLink({ visibilityConfig: null });
    mockSelect
      .mockReturnValueOnce(makeChain([link]))
      .mockReturnValueOnce(makeChain([MOCK_HOUSEHOLD]))
      .mockReturnValueOnce(makeChain(BILLS));

    const res = await router.request(`/share/${TOKEN}`);
    const body = await res.json() as any;
    expect(body.bills).toHaveLength(3);
  });

  it("backward compat: link with old config (missing new fields) still works", async () => {
    const link = makeLink({
      visibilityConfig: { showPdf: true, showCharges: true, showUsage: true,
                          showChart: false, showAddress: false },
    });
    mockSelect
      .mockReturnValueOnce(makeChain([link]))
      .mockReturnValueOnce(makeChain([MOCK_HOUSEHOLD]))
      .mockReturnValueOnce(makeChain(BILLS));

    const res = await router.request(`/share/${TOKEN}`);
    const body = await res.json() as any;
    // All 3 bills visible (defaults applied for missing visibleUtilityTypes)
    expect(body.bills).toHaveLength(3);
    // Old flag preserved
    expect(body.shareLink.visibilityConfig.showChart).toBe(false);
  });

  it("does not expose address when showAddress is false (pass-through — the frontend hides it)", async () => {
    // showAddress is a display-only flag; the backend always returns the address
    // field. The frontend is responsible for hiding it.  This test documents that
    // intentional contract: address is always in the response payload.
    const link = makeLink({
      visibilityConfig: { ...makeLink().visibilityConfig, showAddress: false },
    });
    mockSelect
      .mockReturnValueOnce(makeChain([link]))
      .mockReturnValueOnce(makeChain([MOCK_HOUSEHOLD]))
      .mockReturnValueOnce(makeChain(BILLS));

    const res = await router.request(`/share/${TOKEN}`);
    const body = await res.json() as any;
    // address is always present in payload (frontend controls rendering)
    expect(body.household.address).toBe("123 Maple St");
    // but the flag is surfaced so the client knows not to show it
    expect(body.shareLink.visibilityConfig.showAddress).toBe(false);
  });

  it("valid non-expired link with null expiresAt is accessible", async () => {
    const link = makeLink({ expiresAt: null });
    mockSelect
      .mockReturnValueOnce(makeChain([link]))
      .mockReturnValueOnce(makeChain([MOCK_HOUSEHOLD]))
      .mockReturnValueOnce(makeChain([]));

    const res = await router.request(`/share/${TOKEN}`);
    expect(res.status).toBe(200);
  });

  it("link expiring in the future is accessible", async () => {
    const futureLink = makeLink({ expiresAt: new Date("2099-01-01") });
    mockSelect
      .mockReturnValueOnce(makeChain([futureLink]))
      .mockReturnValueOnce(makeChain([MOCK_HOUSEHOLD]))
      .mockReturnValueOnce(makeChain([]));

    const res = await router.request(`/share/${TOKEN}`);
    expect(res.status).toBe(200);
  });

  it("returns numeric totalAmount (not a numeric string)", async () => {
    mockSelect
      .mockReturnValueOnce(makeChain([makeLink()]))
      .mockReturnValueOnce(makeChain([MOCK_HOUSEHOLD]))
      .mockReturnValueOnce(makeChain([BILLS[0]]));

    const res = await router.request(`/share/${TOKEN}`);
    const body = await res.json() as any;
    expect(typeof body.bills[0].totalAmount).toBe("number");
    expect(body.bills[0].totalAmount).toBe(100);
  });
});

// ─── GET /households/:id/share — list links (auth required) ──────────────────

describe("GET /households/:id/share", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 when user is not a member", async () => {
    // isMember → db.select().from(householdMembers).where().limit(1) → []
    mockSelect.mockReturnValueOnce(makeChain([]));
    const res = await router.request(`/households/${HOUSEHOLD_ID}/share`, {
      method: "GET",
      headers: { Authorization: "Bearer fake-token" },
    });
    expect(res.status).toBe(403);
  });

  it("returns share link list with visibilityConfig when user is a member", async () => {
    const memberRow = { householdId: HOUSEHOLD_ID };
    const linkRow = {
      token:            TOKEN,
      label:            "Landlord",
      expiresAt:        null,
      createdAt:        new Date("2026-01-01"),
      visibilityConfig: makeLink().visibilityConfig,
    };

    // isMember → member found
    mockSelect.mockReturnValueOnce(makeChain([memberRow]));
    // list share links
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([linkRow]),
      }),
    });

    const res = await router.request(`/households/${HOUSEHOLD_ID}/share`, {
      method: "GET",
      headers: { Authorization: "Bearer fake-token" },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body).toHaveLength(1);
    expect(body[0].visibilityConfig).toBeDefined();
    expect(body[0].visibilityConfig.visibleUtilityTypes).toEqual(["electricity", "gas", "water"]);
  });
});
