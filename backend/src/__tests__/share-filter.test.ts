/**
 * Unit tests for share-filter.ts
 *
 * These tests cover the core data-filtering logic for share links.
 * No database connection is required — all functions are pure.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  mergeVisibilityConfig,
  filterBillsByVisibility,
  type FilterableBill,
} from "../lib/share-filter.js";
import { SHARE_VISIBILITY_DEFAULTS } from "../db/schema.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** Stable "today" used across all tests that need date math. */
const NOW = new Date("2026-04-01T00:00:00Z");

function makeBill(
  overrides: Partial<FilterableBill> & { id?: string }
): FilterableBill & { id: string } {
  return {
    id: overrides.id ?? "bill-" + Math.random().toString(36).slice(2),
    utilityType: overrides.utilityType ?? "electricity",
    billingPeriodEnd: overrides.billingPeriodEnd ?? "2026-03-15",
  };
}

const ELEC_RECENT  = makeBill({ id: "e1", utilityType: "electricity", billingPeriodEnd: "2026-03-15" });
const ELEC_OLD     = makeBill({ id: "e2", utilityType: "electricity", billingPeriodEnd: "2025-06-30" });
const GAS_RECENT   = makeBill({ id: "g1", utilityType: "gas",         billingPeriodEnd: "2026-03-10" });
const GAS_OLD      = makeBill({ id: "g2", utilityType: "gas",         billingPeriodEnd: "2025-07-15" });
const WATER_RECENT = makeBill({ id: "w1", utilityType: "water",       billingPeriodEnd: "2026-02-20" });
const WATER_OLD    = makeBill({ id: "w2", utilityType: "water",       billingPeriodEnd: "2025-05-01" });

const ALL_BILLS = [ELEC_RECENT, ELEC_OLD, GAS_RECENT, GAS_OLD, WATER_RECENT, WATER_OLD];

// ─── mergeVisibilityConfig ────────────────────────────────────────────────────

describe("mergeVisibilityConfig", () => {
  it("returns full defaults when called with an empty object", () => {
    const cfg = mergeVisibilityConfig({});
    expect(cfg).toEqual(SHARE_VISIBILITY_DEFAULTS);
  });

  it("returns full defaults when called with null", () => {
    expect(mergeVisibilityConfig(null)).toEqual(SHARE_VISIBILITY_DEFAULTS);
  });

  it("returns full defaults when called with undefined", () => {
    expect(mergeVisibilityConfig(undefined)).toEqual(SHARE_VISIBILITY_DEFAULTS);
  });

  it("overrides individual boolean flags", () => {
    const cfg = mergeVisibilityConfig({ showPdf: false, showAddress: false });
    expect(cfg.showPdf).toBe(false);
    expect(cfg.showAddress).toBe(false);
    // Others unchanged
    expect(cfg.showCharges).toBe(true);
    expect(cfg.showUsage).toBe(true);
    expect(cfg.showChart).toBe(true);
  });

  it("overrides visibleUtilityTypes", () => {
    const cfg = mergeVisibilityConfig({ visibleUtilityTypes: ["water"] });
    expect(cfg.visibleUtilityTypes).toEqual(["water"]);
  });

  it("overrides maxMonths", () => {
    const cfg = mergeVisibilityConfig({ maxMonths: 6 });
    expect(cfg.maxMonths).toBe(6);
  });

  it("backward compat: old links without new fields get defaults for those fields", () => {
    // Simulate a row stored before visibleUtilityTypes / maxMonths were added
    const oldConfig = { showPdf: true, showCharges: true, showUsage: true, showChart: false, showAddress: true };
    const cfg = mergeVisibilityConfig(oldConfig);
    // Old overrides preserved
    expect(cfg.showChart).toBe(false);
    // New fields filled in from defaults
    expect(cfg.visibleUtilityTypes).toEqual(["electricity", "gas", "water"]);
    expect(cfg.maxMonths).toBeNull();
  });

  it("preserves all fields when given a complete config", () => {
    const custom = {
      showPdf: false,
      showCharges: false,
      showUsage: false,
      showChart: false,
      showAddress: false,
      visibleUtilityTypes: ["gas"] as ("electricity" | "gas" | "water")[],
      maxMonths: 3,
    };
    expect(mergeVisibilityConfig(custom)).toEqual(custom);
  });
});

// ─── filterBillsByVisibility — utility type filter ────────────────────────────

describe("filterBillsByVisibility — utility type filter", () => {
  it("returns all bills when all utility types are allowed (default)", () => {
    const cfg = mergeVisibilityConfig({});
    const result = filterBillsByVisibility(ALL_BILLS, cfg, NOW);
    expect(result).toHaveLength(ALL_BILLS.length);
  });

  it("returns only electricity bills", () => {
    const cfg = mergeVisibilityConfig({ visibleUtilityTypes: ["electricity"] });
    const result = filterBillsByVisibility(ALL_BILLS, cfg, NOW);
    expect(result.every((b) => b.utilityType === "electricity")).toBe(true);
    expect(result).toHaveLength(2);
  });

  it("returns only gas bills", () => {
    const cfg = mergeVisibilityConfig({ visibleUtilityTypes: ["gas"] });
    const result = filterBillsByVisibility(ALL_BILLS, cfg, NOW);
    expect(result.every((b) => b.utilityType === "gas")).toBe(true);
    expect(result).toHaveLength(2);
  });

  it("returns only water bills", () => {
    const cfg = mergeVisibilityConfig({ visibleUtilityTypes: ["water"] });
    const result = filterBillsByVisibility(ALL_BILLS, cfg, NOW);
    expect(result.every((b) => b.utilityType === "water")).toBe(true);
    expect(result).toHaveLength(2);
  });

  it("returns electricity + gas when water is excluded", () => {
    const cfg = mergeVisibilityConfig({ visibleUtilityTypes: ["electricity", "gas"] });
    const result = filterBillsByVisibility(ALL_BILLS, cfg, NOW);
    expect(result.some((b) => b.utilityType === "water")).toBe(false);
    expect(result).toHaveLength(4);
  });

  it("returns empty array when visibleUtilityTypes is empty", () => {
    const cfg = mergeVisibilityConfig({ visibleUtilityTypes: [] });
    const result = filterBillsByVisibility(ALL_BILLS, cfg, NOW);
    expect(result).toHaveLength(0);
  });

  it("returns empty array when input bills are empty", () => {
    const cfg = mergeVisibilityConfig({});
    expect(filterBillsByVisibility([], cfg, NOW)).toHaveLength(0);
  });

  it("drops bills whose utilityType is not a recognised value", () => {
    const strangeBill = makeBill({ utilityType: "solar" as any });
    const cfg = mergeVisibilityConfig({});
    // All three defaults are present; "solar" is not in defaults
    const result = filterBillsByVisibility([strangeBill], cfg, NOW);
    expect(result).toHaveLength(0);
  });
});

// ─── filterBillsByVisibility — history / maxMonths filter ─────────────────────

describe("filterBillsByVisibility — maxMonths filter", () => {
  // NOW = 2026-04-01
  // 3 months ≈ 90 days → cutoff ≈ 2026-01-01
  // 6 months ≈ 180 days → cutoff ≈ 2025-10-03
  // 12 months ≈ 360 days → cutoff ≈ 2025-04-07

  it("does not filter by date when maxMonths is null (default)", () => {
    const cfg = mergeVisibilityConfig({ maxMonths: null });
    expect(filterBillsByVisibility(ALL_BILLS, cfg, NOW)).toHaveLength(ALL_BILLS.length);
  });

  it("keeps only recent electricity bills when maxMonths=3", () => {
    const cfg = mergeVisibilityConfig({
      visibleUtilityTypes: ["electricity"],
      maxMonths: 3,
    });
    const result = filterBillsByVisibility(ALL_BILLS, cfg, NOW);
    // ELEC_RECENT (2026-03-15) is within 90 days of 2026-04-01 ✓
    // ELEC_OLD    (2025-06-30) is ~9 months ago ✗
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("e1");
  });

  it("keeps all electricity when maxMonths=12 (both bills within 12 months)", () => {
    // ELEC_OLD = 2025-06-30, cutoff for 12 mo from 2026-04-01 ≈ 2025-04-07
    // 2025-06-30 > 2025-04-07 → should be KEPT
    const cfg = mergeVisibilityConfig({
      visibleUtilityTypes: ["electricity"],
      maxMonths: 12,
    });
    const result = filterBillsByVisibility(ALL_BILLS, cfg, NOW);
    expect(result).toHaveLength(2);
  });

  it("cutoff boundary: bill exactly on cutoff date is KEPT", () => {
    // 3 months ≈ 90 days. NOW = 2026-04-01. cutoff ≈ 2026-01-01.
    // Create a bill exactly 90 days before NOW.
    const cutoffMs = NOW.getTime() - 3 * 30 * 86_400_000;
    const cutoffDate = new Date(cutoffMs).toISOString().slice(0, 10);
    const billOnCutoff = makeBill({ id: "on-cutoff", billingPeriodEnd: cutoffDate });
    const cfg = mergeVisibilityConfig({ visibleUtilityTypes: ["electricity"], maxMonths: 3 });
    // billingPeriodEnd === cutoffDate → NOT filtered (filter is `< cutoff`, not `<=`)
    const result = filterBillsByVisibility([billOnCutoff], cfg, NOW);
    expect(result).toHaveLength(1);
  });

  it("cutoff boundary: bill one day before cutoff date is dropped", () => {
    const cutoffMs = NOW.getTime() - 3 * 30 * 86_400_000;
    const dayBeforeCutoff = new Date(cutoffMs - 86_400_000).toISOString().slice(0, 10);
    const oldBill = makeBill({ id: "just-before", billingPeriodEnd: dayBeforeCutoff });
    const cfg = mergeVisibilityConfig({ visibleUtilityTypes: ["electricity"], maxMonths: 3 });
    const result = filterBillsByVisibility([oldBill], cfg, NOW);
    expect(result).toHaveLength(0);
  });
});

// ─── filterBillsByVisibility — combined filters ────────────────────────────────

describe("filterBillsByVisibility — combined utility + date filters", () => {
  it("electricity only + last 6 months: drops old elec and all gas/water", () => {
    // NOW = 2026-04-01, 6 mo cutoff ≈ 2025-10-03
    // ELEC_RECENT (2026-03-15) — kept (electricity, recent) ✓
    // ELEC_OLD    (2025-06-30) — dropped (too old) ✗
    // GAS_RECENT  (2026-03-10) — dropped (wrong type) ✗
    // WATER_*     — dropped (wrong type) ✗
    const cfg = mergeVisibilityConfig({ visibleUtilityTypes: ["electricity"], maxMonths: 6 });
    const result = filterBillsByVisibility(ALL_BILLS, cfg, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("e1");
  });

  it("water + gas, last 12 months: keeps recent water and gas, drops old ones", () => {
    // NOW = 2026-04-01, 12 mo cutoff ≈ 2025-04-07
    // WATER_OLD (2025-05-01) > cutoff ≈ 2025-04-07 → KEPT
    // GAS_OLD   (2025-07-15) > cutoff ≈ 2025-04-07 → KEPT
    // WATER_RECENT / GAS_RECENT → KEPT
    // ELEC_* → DROPPED (wrong type)
    const cfg = mergeVisibilityConfig({ visibleUtilityTypes: ["water", "gas"], maxMonths: 12 });
    const result = filterBillsByVisibility(ALL_BILLS, cfg, NOW);
    const ids = result.map((b) => b.id).sort();
    expect(ids).toEqual(["g1", "g2", "w1", "w2"].sort());
  });

  it("no types + no date limit returns empty", () => {
    const cfg = mergeVisibilityConfig({ visibleUtilityTypes: [], maxMonths: null });
    expect(filterBillsByVisibility(ALL_BILLS, cfg, NOW)).toHaveLength(0);
  });

  it("preserves extra fields on bill objects (generic T)", () => {
    type RichBill = FilterableBill & { id: string; totalAmount: number };
    const bills: RichBill[] = [
      { id: "r1", utilityType: "electricity", billingPeriodEnd: "2026-03-01", totalAmount: 99 },
    ];
    const cfg = mergeVisibilityConfig({});
    const result = filterBillsByVisibility(bills, cfg, NOW);
    expect(result[0].totalAmount).toBe(99);
  });
});

// ─── filterBillsByVisibility — clock injection ────────────────────────────────

describe("filterBillsByVisibility — deterministic clock", () => {
  it("uses the injected 'now' not the system clock", () => {
    // If maxMonths=3 and now=2025-01-01, cutoff ≈ 2024-10-03
    // ELEC_RECENT (2026-03-15) is far in the future relative to 2025-01-01 → kept
    const pastNow = new Date("2025-01-01T00:00:00Z");
    const cfg = mergeVisibilityConfig({ maxMonths: 3 });
    const result = filterBillsByVisibility([ELEC_RECENT], cfg, pastNow);
    // 2026-03-15 > 2024-10-03 → kept
    expect(result).toHaveLength(1);
  });

  it("does not rely on Date.now() implicitly (no system time calls)", () => {
    // If the function accidentally uses Date.now() instead of the 'now' param
    // this test would fail when run at a different time.  Inject a sentinel date.
    const sentinel = new Date("2000-01-01T00:00:00Z");
    // maxMonths=1 → cutoff ≈ 1999-12-02 — all our fixture bills postdate 2025 → kept
    const cfg = mergeVisibilityConfig({ maxMonths: 1 });
    const result = filterBillsByVisibility(ALL_BILLS, cfg, sentinel);
    // All bills are after 1999-12-02, so all pass the date filter
    expect(result).toHaveLength(ALL_BILLS.length);
  });
});
