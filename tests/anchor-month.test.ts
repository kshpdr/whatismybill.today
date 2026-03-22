/**
 * Tests for utility summary anchor month selection.
 * 
 * The anchor month determines which calendar month the dashboard
 * "Approx. Utilities" card refers to.
 * 
 * Priority:
 * 1. Latest water bill's billingPeriodEnd month (water is bimonthly, most recent cutoff)
 * 2. Latest electricity/gas bill's billingPeriodEnd month
 * 3. Current calendar month (if no bills)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { utilitySummaryAnchorMonth } from "@/lib/use-bills";
import {
  FULL_BILL_SET,
  WATER_ONLY_SET,
  ENERGY_ONLY_SET,
  WATER_JAN_MAR,
  ELEC_FEB_MAR,
  makeBill,
} from "./fixtures";

describe("utilitySummaryAnchorMonth", () => {
  describe("priority 1: water bill anchor", () => {
    it("uses latest water bill's period end month", () => {
      const result = utilitySummaryAnchorMonth(FULL_BILL_SET);

      // Latest water bill in FULL_BILL_SET is WATER_JAN_MAR (ends 2026-03-06)
      expect(result.year).toBe(2026);
      expect(result.month).toBe(3);
      expect(result.source).toBe("water");
    });

    it("prefers water over energy even if energy is more recent", () => {
      // Add an electricity bill that ends after the water bill
      const recentElec = makeBill({
        utilityType: "electricity",
        billingPeriodStart: "2026-03-12",
        billingPeriodEnd: "2026-04-10",
        totalAmount: 100,
      });

      const bills = [...WATER_ONLY_SET, recentElec];
      const result = utilitySummaryAnchorMonth(bills);

      // Should still use water (latest water ends Mar 6)
      expect(result.source).toBe("water");
      expect(result.month).toBe(3); // March
    });

    it("uses the LATEST water bill when multiple exist", () => {
      const result = utilitySummaryAnchorMonth(WATER_ONLY_SET);

      // Latest water in WATER_ONLY_SET is WATER_JAN_MAR (ends 2026-03-06)
      expect(result.year).toBe(2026);
      expect(result.month).toBe(3);
    });
  });

  describe("priority 2: energy bill anchor (no water)", () => {
    it("falls back to latest energy bill when no water bills", () => {
      const result = utilitySummaryAnchorMonth(ENERGY_ONLY_SET);

      // Latest energy bill is ELEC_FEB_MAR (ends 2026-03-12)
      expect(result.year).toBe(2026);
      expect(result.month).toBe(3);
      expect(result.source).toBe("energy");
    });

    it("uses electricity when no gas bills", () => {
      const elecOnly = ENERGY_ONLY_SET.filter(
        (b) => b.utilityType === "electricity"
      );
      const result = utilitySummaryAnchorMonth(elecOnly);

      expect(result.source).toBe("energy");
    });

    it("uses gas when no electricity bills", () => {
      const gasOnly = ENERGY_ONLY_SET.filter((b) => b.utilityType === "gas");
      const result = utilitySummaryAnchorMonth(gasOnly);

      expect(result.source).toBe("energy");
    });

    it("uses whichever energy bill is latest (elec or gas)", () => {
      // Create gas bill more recent than any electricity
      const recentGas = makeBill({
        utilityType: "gas",
        billingPeriodStart: "2026-04-01",
        billingPeriodEnd: "2026-04-30",
        totalAmount: 50,
      });

      const elecOnly = ENERGY_ONLY_SET.filter(
        (b) => b.utilityType === "electricity"
      );
      const bills = [...elecOnly, recentGas];
      const result = utilitySummaryAnchorMonth(bills);

      expect(result.year).toBe(2026);
      expect(result.month).toBe(4); // April from gas bill
    });
  });

  describe("priority 3: current month (no bills)", () => {
    beforeEach(() => {
      // Mock Date to March 21, 2026
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-03-21T12:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("uses current calendar month when no bills exist", () => {
      const result = utilitySummaryAnchorMonth([]);

      expect(result.year).toBe(2026);
      expect(result.month).toBe(3);
      expect(result.source).toBe("today");
    });
  });

  describe("edge cases", () => {
    it("handles single water bill", () => {
      const result = utilitySummaryAnchorMonth([WATER_JAN_MAR]);

      expect(result.year).toBe(2026);
      expect(result.month).toBe(3);
      expect(result.source).toBe("water");
    });

    it("handles single electricity bill", () => {
      const result = utilitySummaryAnchorMonth([ELEC_FEB_MAR]);

      expect(result.year).toBe(2026);
      expect(result.month).toBe(3);
      expect(result.source).toBe("energy");
    });

    it("correctly extracts month from billingPeriodEnd string", () => {
      const bill = makeBill({
        utilityType: "water",
        billingPeriodStart: "2025-11-01",
        billingPeriodEnd: "2025-12-31", // Dec 31
        totalAmount: 100,
      });

      const result = utilitySummaryAnchorMonth([bill]);

      expect(result.year).toBe(2025);
      expect(result.month).toBe(12); // December
    });

    it("handles year boundary correctly", () => {
      const bill = makeBill({
        utilityType: "water",
        billingPeriodStart: "2025-12-01",
        billingPeriodEnd: "2026-01-15", // Jan 2026
        totalAmount: 100,
      });

      const result = utilitySummaryAnchorMonth([bill]);

      expect(result.year).toBe(2026);
      expect(result.month).toBe(1);
    });
  });
});
