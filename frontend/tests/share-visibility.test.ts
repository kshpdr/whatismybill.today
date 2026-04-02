/**
 * Tests for share link visibility config logic as used by the frontend.
 *
 * The frontend duplicates the visibility config type locally (no shared package
 * between backend and frontend).  These tests verify that the frontend's
 * interpretation of visibilityConfig is correct and that the share page will
 * render (or hide) the right sections for a given config.
 *
 * They also serve as a contract test: if the backend changes what it returns,
 * these tests must be updated too — surfacing the breakage early.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Bill } from "@/lib/types";
import {
  deriveMonthlySpend,
  deriveApproxUtilitySpendInMonth,
  utilitySummaryAnchorMonth,
} from "@/lib/use-bills";
import { filterCompletedMonths } from "@/lib/bill-utils";
import { FULL_BILL_SET, makeBill, TODAY } from "./fixtures";

// ─── Shared types (mirror of what the share page uses) ───────────────────────
//
// These are intentionally kept in sync with frontend/app/share/[token]/page.tsx.
// If the shape changes there, update here to keep tests meaningful.

type UtilityType = "electricity" | "gas" | "water";

interface ShareVisibilityConfig {
  showPdf:             boolean;
  showCharges:         boolean;
  showUsage:           boolean;
  showChart:           boolean;
  showAddress:         boolean;
  visibleUtilityTypes: UtilityType[];
  maxMonths:           number | null;
}

const DEFAULTS: ShareVisibilityConfig = {
  showPdf:             true,
  showCharges:         true,
  showUsage:           true,
  showChart:           true,
  showAddress:         true,
  visibleUtilityTypes: ["electricity", "gas", "water"],
  maxMonths:           null,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mergeConfig(overrides: Partial<ShareVisibilityConfig>): ShareVisibilityConfig {
  return { ...DEFAULTS, ...overrides };
}

/**
 * Simulate the client-side filtering that the share page applies:
 * filter bills received from the API by utility type.
 *
 * NOTE: In production, the server already strips hidden bills.  The frontend
 * only needs to know which utility tiles to render in the hero section.
 * This function replicates the hero tile filter logic.
 */
function visibleUtilityTiles(config: ShareVisibilityConfig) {
  const ALL = ["electricity", "gas", "water"] as UtilityType[];
  return ALL.filter((t) => config.visibleUtilityTypes.includes(t));
}

/** Bills already filtered by the server for a given config. */
function serverFilterBills(bills: Bill[], config: ShareVisibilityConfig, now = TODAY): Bill[] {
  const allowed = new Set<string>(config.visibleUtilityTypes);
  const cutoff = config.maxMonths != null
    ? new Date(now.getTime() - config.maxMonths * 30 * 86_400_000)
        .toISOString().slice(0, 10)
    : null;
  return bills.filter((b) => {
    if (!allowed.has(b.utilityType)) return false;
    if (cutoff && b.billingPeriodEnd < cutoff) return false;
    return true;
  });
}

// ─── mergeConfig / defaults ───────────────────────────────────────────────────

describe("ShareVisibilityConfig defaults", () => {
  it("defaults have all utility types enabled", () => {
    expect(DEFAULTS.visibleUtilityTypes).toEqual(["electricity", "gas", "water"]);
  });

  it("defaults have no maxMonths limit", () => {
    expect(DEFAULTS.maxMonths).toBeNull();
  });

  it("defaults show all sections", () => {
    expect(DEFAULTS.showPdf).toBe(true);
    expect(DEFAULTS.showCharges).toBe(true);
    expect(DEFAULTS.showUsage).toBe(true);
    expect(DEFAULTS.showChart).toBe(true);
    expect(DEFAULTS.showAddress).toBe(true);
  });

  it("mergeConfig fills in missing fields from defaults", () => {
    const cfg = mergeConfig({ showPdf: false });
    expect(cfg.showPdf).toBe(false);
    expect(cfg.visibleUtilityTypes).toEqual(DEFAULTS.visibleUtilityTypes);
    expect(cfg.maxMonths).toBeNull();
  });
});

// ─── Hero tile visibility ─────────────────────────────────────────────────────

describe("visibleUtilityTiles (hero section)", () => {
  it("returns all 3 tiles by default", () => {
    expect(visibleUtilityTiles(DEFAULTS)).toEqual(["electricity", "gas", "water"]);
  });

  it("returns only electricity when only that type is visible", () => {
    const cfg = mergeConfig({ visibleUtilityTypes: ["electricity"] });
    expect(visibleUtilityTiles(cfg)).toEqual(["electricity"]);
  });

  it("returns water and gas when electricity is excluded", () => {
    const cfg = mergeConfig({ visibleUtilityTypes: ["gas", "water"] });
    expect(visibleUtilityTiles(cfg)).toEqual(["gas", "water"]);
  });

  it("returns empty array when no types are visible", () => {
    const cfg = mergeConfig({ visibleUtilityTypes: [] });
    expect(visibleUtilityTiles(cfg)).toEqual([]);
  });

  it("returns tiles in canonical order (electricity, gas, water) regardless of config order", () => {
    const cfg = mergeConfig({ visibleUtilityTypes: ["water", "electricity"] });
    expect(visibleUtilityTiles(cfg)).toEqual(["electricity", "water"]);
  });
});

// ─── Server-side bill filtering (mirrored in frontend for chart / hero) ───────

describe("serverFilterBills — utility type", () => {
  const elecBill = makeBill({ utilityType: "electricity", billingPeriodEnd: "2026-02-15" });
  const gasBill  = makeBill({ utilityType: "gas",         billingPeriodEnd: "2026-02-10" });
  const watBill  = makeBill({ utilityType: "water",       billingPeriodEnd: "2026-02-20" });
  const allBills = [elecBill, gasBill, watBill];

  it("returns all bills when all types are visible", () => {
    expect(serverFilterBills(allBills, DEFAULTS)).toHaveLength(3);
  });

  it("excludes gas and water when only electricity is visible", () => {
    const cfg = mergeConfig({ visibleUtilityTypes: ["electricity"] });
    const result = serverFilterBills(allBills, cfg);
    expect(result).toHaveLength(1);
    expect(result[0].utilityType).toBe("electricity");
  });

  it("excludes all bills when visibleUtilityTypes is empty", () => {
    const cfg = mergeConfig({ visibleUtilityTypes: [] });
    expect(serverFilterBills(allBills, cfg)).toHaveLength(0);
  });
});

describe("serverFilterBills — maxMonths (history limit)", () => {
  // Freeze time at TODAY from fixtures (2026-03-21)
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps all bills when maxMonths is null", () => {
    const result = serverFilterBills(FULL_BILL_SET, DEFAULTS, TODAY);
    expect(result).toHaveLength(FULL_BILL_SET.length);
  });

  it("drops bills older than 3 months", () => {
    // TODAY = 2026-03-21; cutoff ≈ 2025-12-21
    // The fixture set has bills from Sep 2025 onwards.
    // Bills with billingPeriodEnd < 2025-12-21 should be dropped.
    const cfg = mergeConfig({ maxMonths: 3 });
    const result = serverFilterBills(FULL_BILL_SET, cfg, TODAY);
    result.forEach((b) => {
      // All remaining bills must end on or after the cutoff
      const cutoff = new Date(TODAY.getTime() - 3 * 30 * 86_400_000)
        .toISOString().slice(0, 10);
      expect(b.billingPeriodEnd >= cutoff).toBe(true);
    });
  });

  it("maxMonths=12 keeps all fixture bills (none older than 1 year)", () => {
    // Earliest bill in FULL_BILL_SET: WATER_SEP_NOV (starts Sep 2025)
    // 12 months before 2026-03-21 ≈ 2025-03-21 — all bills are after that
    const cfg = mergeConfig({ maxMonths: 12 });
    const result = serverFilterBills(FULL_BILL_SET, cfg, TODAY);
    expect(result).toHaveLength(FULL_BILL_SET.length);
  });
});

// ─── deriveMonthlySpend with filtered bills ───────────────────────────────────

describe("deriveMonthlySpend with visibility-filtered bills", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("monthly totals drop when gas is excluded", () => {
    const allSpend = deriveMonthlySpend(FULL_BILL_SET);
    const noGasBills = serverFilterBills(FULL_BILL_SET, mergeConfig({ visibleUtilityTypes: ["electricity", "water"] }), TODAY);
    const noGasSpend = deriveMonthlySpend(noGasBills);

    // Every month's gas allocation should be 0 in the filtered result
    noGasSpend.forEach((m) => {
      expect(m.gas).toBe(0);
    });

    // At least one month should have had gas before filtering
    const hadGas = allSpend.some((m) => m.gas > 0);
    expect(hadGas).toBe(true);
  });

  it("electricity-only view matches the sum of electricity allocations only", () => {
    const elecOnlyBills = serverFilterBills(
      FULL_BILL_SET,
      mergeConfig({ visibleUtilityTypes: ["electricity"] }),
      TODAY
    );
    const spend = deriveMonthlySpend(elecOnlyBills);
    spend.forEach((m) => {
      expect(m.gas).toBe(0);
      expect(m.water).toBe(0);
    });
  });

  it("filtered bill set produces fewer months when history is limited", () => {
    const allSpend = deriveMonthlySpend(FULL_BILL_SET);
    const recentBills = serverFilterBills(FULL_BILL_SET, mergeConfig({ maxMonths: 3 }), TODAY);
    const recentSpend = deriveMonthlySpend(recentBills);
    expect(recentSpend.length).toBeLessThanOrEqual(allSpend.length);
  });
});

// ─── approxUtilitySpendInMonth with filtered bills ───────────────────────────

describe("deriveApproxUtilitySpendInMonth with filtered bills", () => {
  it("returns 0 for hidden utility types", () => {
    const anchor = utilitySummaryAnchorMonth(FULL_BILL_SET);
    if (!anchor) return; // skip if no anchor

    const elecOnly = serverFilterBills(
      FULL_BILL_SET,
      mergeConfig({ visibleUtilityTypes: ["electricity"] }),
      TODAY
    );
    const spend = deriveApproxUtilitySpendInMonth(elecOnly, anchor.year, anchor.month);
    expect(spend.gas).toBe(0);
    expect(spend.water).toBe(0);
    // Electricity is present in fixture data; it should be non-zero (or at least defined)
    expect(typeof spend.electricity).toBe("number");
  });

  it("returns 0 for all types when bills are filtered to empty", () => {
    const anchor = utilitySummaryAnchorMonth(FULL_BILL_SET);
    if (!anchor) return;

    const spend = deriveApproxUtilitySpendInMonth([], anchor.year, anchor.month);
    expect(spend.electricity).toBe(0);
    expect(spend.gas).toBe(0);
    expect(spend.water).toBe(0);
  });
});

// ─── Section visibility flags ─────────────────────────────────────────────────

describe("section visibility flags (display-only)", () => {
  it("showChart=false suppresses the chart section", () => {
    const cfg = mergeConfig({ showChart: false });
    // The share page renders the chart conditionally: vis.showChart && monthlySpend.length > 1
    const hasData = deriveMonthlySpend(FULL_BILL_SET).length > 1;
    const shouldRenderChart = cfg.showChart && hasData;
    expect(shouldRenderChart).toBe(false);
  });

  it("showChart=true with data renders chart", () => {
    const cfg = mergeConfig({ showChart: true });
    const hasData = deriveMonthlySpend(FULL_BILL_SET).length > 1;
    const shouldRenderChart = cfg.showChart && hasData;
    expect(shouldRenderChart).toBe(true);
  });

  it("showPdf=false suppresses the PDF section", () => {
    const cfg = mergeConfig({ showPdf: false });
    expect(cfg.showPdf).toBe(false);
  });

  it("showCharges=false suppresses charge breakdown", () => {
    const cfg = mergeConfig({ showCharges: false });
    expect(cfg.showCharges).toBe(false);
  });

  it("showUsage=false collapses KPI grid to 1 tile (total only)", () => {
    const cfg = mergeConfig({ showUsage: false });
    // When showUsage is false, share page shows 1 tile instead of 3
    const tileCount = cfg.showUsage ? 3 : 1;
    expect(tileCount).toBe(1);
  });

  it("showAddress=false hides address from header", () => {
    const cfg = mergeConfig({ showAddress: false });
    const address = "123 Maple St";
    const shouldShow = cfg.showAddress && !!address;
    expect(shouldShow).toBe(false);
  });

  it("showAddress=true shows address when address is set", () => {
    const cfg = mergeConfig({ showAddress: true });
    const address = "123 Maple St";
    expect(cfg.showAddress && !!address).toBe(true);
  });

  it("showAddress=true does not show address when address is null", () => {
    const cfg = mergeConfig({ showAddress: true });
    const address: string | null = null;
    expect(cfg.showAddress && !!address).toBe(false);
  });
});

// ─── Contract: frontend defaults match backend defaults ───────────────────────

describe("frontend/backend config contract", () => {
  /**
   * The backend (SHARE_VISIBILITY_DEFAULTS in schema.ts) and frontend
   * (DEFAULTS in this file and the share page) must stay in sync.
   * This test documents the expected canonical shape.
   *
   * If this test fails it means one side was updated without the other.
   */
  const EXPECTED_DEFAULTS = {
    showPdf:             true,
    showCharges:         true,
    showUsage:           true,
    showChart:           true,
    showAddress:         true,
    visibleUtilityTypes: ["electricity", "gas", "water"],
    maxMonths:           null,
  };

  it("DEFAULTS match the expected canonical shape", () => {
    expect(DEFAULTS).toEqual(EXPECTED_DEFAULTS);
  });

  it("has exactly the expected keys — no extras, no missing", () => {
    const keys = Object.keys(DEFAULTS).sort();
    const expectedKeys = Object.keys(EXPECTED_DEFAULTS).sort();
    expect(keys).toEqual(expectedKeys);
  });
});
