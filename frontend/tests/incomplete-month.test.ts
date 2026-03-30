/**
 * Tests for incomplete month handling.
 * 
 * The current calendar month should be EXCLUDED from:
 * - Average monthly spend calculations
 * - Cheapest/most expensive month comparisons
 * 
 * This prevents March (incomplete) from showing as "cheapest" at $39.50
 * when it should be excluded entirely from those metrics.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isMonthComplete,
  filterCompletedMonths,
  getLatestBillOfType,
  getPreviousBillOfType,
  getBillingDays,
  isWaterBimonthly,
  getMonthlyEquivalent,
  getMonthlyUsageEquivalent,
} from "@/lib/bill-utils";
import { deriveMonthlySpend } from "@/lib/use-bills";
import {
  FULL_BILL_SET,
  WATER_JAN_MAR,
  ELEC_FEB_MAR,
  ELEC_JAN_FEB,
  GAS_FEB,
  makeBill,
} from "./fixtures";

describe("isMonthComplete", () => {
  describe("with mocked date (March 21, 2026)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-03-21T12:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("returns false for current month (March 2026)", () => {
      expect(isMonthComplete(2026, 3)).toBe(false);
    });

    it("returns false for future months", () => {
      expect(isMonthComplete(2026, 4)).toBe(false); // April
      expect(isMonthComplete(2026, 12)).toBe(false); // December
      expect(isMonthComplete(2027, 1)).toBe(false); // Next year
    });

    it("returns true for past months in current year", () => {
      expect(isMonthComplete(2026, 1)).toBe(true); // January
      expect(isMonthComplete(2026, 2)).toBe(true); // February
    });

    it("returns true for all months in past years", () => {
      expect(isMonthComplete(2025, 12)).toBe(true);
      expect(isMonthComplete(2025, 1)).toBe(true);
      expect(isMonthComplete(2024, 6)).toBe(true);
    });
  });

  describe("with explicit asOfDate", () => {
    it("correctly handles last day of month", () => {
      // Note: These use UTC times. The function creates a local Date for comparison.
      // At 23:59:59 UTC on Jan 31, in local time it might already be Feb 1.
      // Use local dates to avoid timezone issues.
      const lastDayOfJan = new Date(2026, 0, 31, 23, 59, 59); // Jan 31 local
      const firstDayOfFeb = new Date(2026, 1, 1, 0, 0, 1); // Feb 1 local

      // On Jan 31, January is not yet complete
      expect(isMonthComplete(2026, 1, lastDayOfJan)).toBe(false);
      // On Feb 1, January is complete
      expect(isMonthComplete(2026, 1, firstDayOfFeb)).toBe(true);
    });

    it("handles February correctly (non-leap year)", () => {
      const lastDayOfFeb2026 = new Date(2026, 1, 28, 23, 59, 59); // Feb 28 local
      const firstDayOfMar2026 = new Date(2026, 2, 1, 0, 0, 1); // Mar 1 local

      expect(isMonthComplete(2026, 2, lastDayOfFeb2026)).toBe(false);
      expect(isMonthComplete(2026, 2, firstDayOfMar2026)).toBe(true);
    });

    it("handles February correctly (leap year)", () => {
      const lastDayOfFeb2024 = new Date(2024, 1, 29, 23, 59, 59); // Feb 29 local
      const firstDayOfMar2024 = new Date(2024, 2, 1, 0, 0, 1); // Mar 1 local

      expect(isMonthComplete(2024, 2, lastDayOfFeb2024)).toBe(false);
      expect(isMonthComplete(2024, 2, firstDayOfMar2024)).toBe(true);
    });
  });
});

describe("filterCompletedMonths", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-21T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("excludes current month from monthly spend data", () => {
    const monthlySpend = deriveMonthlySpend(FULL_BILL_SET);
    const completed = filterCompletedMonths(monthlySpend);

    // March 2026 should be excluded
    const months = completed.map((m) => m.month);
    expect(months).not.toContain("Mar '26");
  });

  it("includes all past completed months", () => {
    const monthlySpend = deriveMonthlySpend(FULL_BILL_SET);
    const completed = filterCompletedMonths(monthlySpend);

    const months = completed.map((m) => m.month);
    expect(months).toContain("Sep '25");
    expect(months).toContain("Oct '25");
    expect(months).toContain("Nov '25");
    expect(months).toContain("Dec '25");
    expect(months).toContain("Jan '26");
    expect(months).toContain("Feb '26");
  });

  it("returns fewer items than input when current month has data", () => {
    const monthlySpend = deriveMonthlySpend(FULL_BILL_SET);
    const completed = filterCompletedMonths(monthlySpend);

    // Original should have Mar '26, filtered should not
    expect(completed.length).toBeLessThan(monthlySpend.length);
  });

  it("handles empty input", () => {
    const completed = filterCompletedMonths([]);
    expect(completed).toHaveLength(0);
  });
});

describe("average calculation with completed months only", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-21T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("computes correct average excluding current month", () => {
    const monthlySpend = deriveMonthlySpend(FULL_BILL_SET);
    const completed = filterCompletedMonths(monthlySpend);

    // Calculate average from completed months
    const total = completed.reduce(
      (sum, m) => sum + m.electricity + m.gas + m.water,
      0
    );
    const avg = total / completed.length;

    // Average should be reasonable (not artificially low from partial March)
    expect(avg).toBeGreaterThan(200); // Each month should have >$200 average
  });

  it("finds correct cheapest month (excluding current)", () => {
    const monthlySpend = deriveMonthlySpend(FULL_BILL_SET);
    const completed = filterCompletedMonths(monthlySpend);

    const cheapest = [...completed].sort(
      (a, b) =>
        a.electricity + a.gas + a.water - (b.electricity + b.gas + b.water)
    )[0];

    // Cheapest should NOT be March (current incomplete month)
    expect(cheapest.month).not.toBe("Mar '26");

    // Sep '25 will be cheapest (only water, no elec/gas) - that's valid
    // The key point is we excluded the incomplete month
    expect(completed.some((m) => m.month === "Mar '26")).toBe(false);
  });

  it("finds correct most expensive month (excluding current)", () => {
    const monthlySpend = deriveMonthlySpend(FULL_BILL_SET);
    const completed = filterCompletedMonths(monthlySpend);

    const mostExpensive = [...completed].sort(
      (a, b) =>
        b.electricity + b.gas + b.water - (a.electricity + a.gas + a.water)
    )[0];

    // Most expensive should also not be March (incomplete)
    expect(mostExpensive.month).not.toBe("Mar '26");
  });
});

describe("getLatestBillOfType", () => {
  it("returns latest electricity bill", () => {
    const latest = getLatestBillOfType(FULL_BILL_SET, "electricity");

    expect(latest).toBeDefined();
    expect(latest!.id).toBe(ELEC_FEB_MAR.id);
    expect(latest!.billingPeriodEnd).toBe("2026-03-12");
  });

  it("returns latest gas bill", () => {
    const latest = getLatestBillOfType(FULL_BILL_SET, "gas");

    expect(latest).toBeDefined();
    expect(latest!.id).toBe(GAS_FEB.id);
    // GAS_FEB now ends Mar 10 (matching ELEC_FEB_MAR's period)
    expect(latest!.billingPeriodEnd).toBe("2026-03-10");
  });

  it("returns latest water bill", () => {
    const latest = getLatestBillOfType(FULL_BILL_SET, "water");

    expect(latest).toBeDefined();
    expect(latest!.id).toBe(WATER_JAN_MAR.id);
    expect(latest!.billingPeriodEnd).toBe("2026-03-06");
  });

  it("returns undefined when no bills of type exist", () => {
    const elecOnly = FULL_BILL_SET.filter(
      (b) => b.utilityType === "electricity"
    );
    const latest = getLatestBillOfType(elecOnly, "water");

    expect(latest).toBeUndefined();
  });
});

describe("getPreviousBillOfType", () => {
  it("returns the bill before the latest", () => {
    const prev = getPreviousBillOfType(FULL_BILL_SET, "electricity");

    expect(prev).toBeDefined();
    expect(prev!.id).toBe(ELEC_JAN_FEB.id);
    expect(prev!.billingPeriodEnd).toBe("2026-02-10");
  });

  it("returns undefined when only one bill exists", () => {
    const singleBill = [ELEC_FEB_MAR];
    const prev = getPreviousBillOfType(singleBill, "electricity");

    expect(prev).toBeUndefined();
  });
});

describe("getBillingDays", () => {
  it("calculates days correctly for a monthly bill", () => {
    const days = getBillingDays(ELEC_FEB_MAR);
    // Feb 10 – Mar 12 = 30 days
    expect(days).toBe(30);
  });

  it("calculates days correctly for a bimonthly bill", () => {
    const days = getBillingDays(WATER_JAN_MAR);
    // Jan 5 – Mar 6 = 60 days
    expect(days).toBe(60);
  });
});

describe("isWaterBimonthly", () => {
  it("returns true for >40 day water bill", () => {
    expect(isWaterBimonthly(WATER_JAN_MAR)).toBe(true); // 60 days
  });

  it("returns false for <=40 day water bill", () => {
    const monthlyWater = makeBill({
      utilityType: "water",
      billingPeriodStart: "2026-02-01",
      billingPeriodEnd: "2026-03-01", // 28 days
      totalAmount: 100,
    });
    expect(isWaterBimonthly(monthlyWater)).toBe(false);
  });

  it("returns false for non-water bills", () => {
    expect(isWaterBimonthly(ELEC_FEB_MAR)).toBe(false);
  });
});

describe("getMonthlyEquivalent", () => {
  it("normalizes bimonthly water to monthly equivalent", () => {
    // WATER_JAN_MAR: $240 over 60 days
    // Monthly equivalent = 240 / 60 * 30 = $120
    const monthly = getMonthlyEquivalent(WATER_JAN_MAR);
    expect(monthly).toBe(120);
  });

  it("returns close to original for ~30 day bills", () => {
    // ELEC_FEB_MAR: $130 over 30 days
    // Monthly equivalent = 130 / 30 * 30 = $130
    const monthly = getMonthlyEquivalent(ELEC_FEB_MAR);
    expect(monthly).toBe(130);
  });
});

describe("getMonthlyUsageEquivalent", () => {
  it("normalizes bimonthly water usage to monthly", () => {
    // WATER_JAN_MAR: 18 CCF over 60 days
    // Monthly equivalent = 18 / 60 * 30 = 9 CCF
    const monthly = getMonthlyUsageEquivalent(WATER_JAN_MAR);
    expect(monthly).toBe(9);
  });
});

describe("per-utility status data source", () => {
  /**
   * This test documents the correct behavior for the per-utility status cards.
   * They should use STATEMENT-LEVEL data (latest bill), not pro-rated calendar data.
   */

  it("electricity status should use latest bill totalAmount", () => {
    const latestElec = getLatestBillOfType(FULL_BILL_SET, "electricity");
    const prevElec = getPreviousBillOfType(FULL_BILL_SET, "electricity");

    expect(latestElec).toBeDefined();
    expect(prevElec).toBeDefined();

    // The displayed amount should be the full bill amount
    expect(latestElec!.totalAmount).toBe(130); // ELEC_FEB_MAR

    // Delta should compare statement-to-statement
    const delta =
      ((latestElec!.totalAmount - prevElec!.totalAmount) /
        prevElec!.totalAmount) *
      100;
    // 130 vs 140 = -7.14%
    expect(delta).toBeCloseTo(-7.14, 1);
  });

  it("gas status should use latest bill totalAmount", () => {
    const latestGas = getLatestBillOfType(FULL_BILL_SET, "gas");
    const prevGas = getPreviousBillOfType(FULL_BILL_SET, "gas");

    expect(latestGas).toBeDefined();
    expect(prevGas).toBeDefined();

    // GAS_FEB now ends Mar 10, so it's the latest
    expect(latestGas!.totalAmount).toBe(71);

    // Delta: 71 vs 90 (GAS_JAN) = -21.1%
    const delta =
      ((latestGas!.totalAmount - prevGas!.totalAmount) /
        prevGas!.totalAmount) *
      100;
    expect(delta).toBeCloseTo(-21.1, 1);
  });

  it("water status should use monthly equivalent for bimonthly", () => {
    const latestWater = getLatestBillOfType(FULL_BILL_SET, "water");

    expect(latestWater).toBeDefined();
    expect(isWaterBimonthly(latestWater!)).toBe(true);

    // Displayed amount should be monthly equivalent
    const monthlyAmount = getMonthlyEquivalent(latestWater!);
    expect(monthlyAmount).toBe(120); // $240 / 60 days * 30 = $120

    // Displayed usage should be monthly equivalent
    const monthlyUsage = getMonthlyUsageEquivalent(latestWater!);
    expect(monthlyUsage).toBe(9); // 18 CCF / 60 * 30 = 9
  });
});
