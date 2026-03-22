/**
 * Tests for PG&E statement cycle grouping.
 * 
 * PG&E bills contain both electricity and gas, but they're stored as
 * separate Bill records. This logic groups them back into "statement cycles"
 * for display purposes.
 * 
 * Grouping rules:
 * 1. Prefer matching by storageRef (same PDF)
 * 2. Fall back to billingPeriodEnd proximity (within 10 days)
 * 3. Always pair one electricity with one gas
 */

import { describe, it, expect } from "vitest";
import { pgeStatementCycles } from "@/lib/bill-utils";
import {
  FULL_BILL_SET,
  ENERGY_ONLY_SET,
  ELEC_OCT_NOV,
  GAS_OCT,
  ELEC_NOV_DEC,
  GAS_NOV,
  WATER_SEP_NOV,
  makeBill,
} from "./fixtures";

describe("pgeStatementCycles", () => {
  describe("basic grouping", () => {
    it("groups electricity and gas with same storageRef", () => {
      // ELEC_OCT_NOV and GAS_OCT share the same storageRef
      const bills = [ELEC_OCT_NOV, GAS_OCT];
      const cycles = pgeStatementCycles(bills);

      expect(cycles).toHaveLength(1);
      expect(cycles[0].elec).toBe(ELEC_OCT_NOV.totalAmount);
      expect(cycles[0].gas).toBe(GAS_OCT.totalAmount);
      expect(cycles[0].total).toBe(
        ELEC_OCT_NOV.totalAmount + GAS_OCT.totalAmount
      );
      expect(cycles[0].kWh).toBe(ELEC_OCT_NOV.usage);
      expect(cycles[0].therms).toBe(GAS_OCT.usage);
    });

    it("groups electricity and gas with close period ends", () => {
      // Different storageRefs but period ends within 10 days
      const elec = {
        ...ELEC_OCT_NOV,
        id: "elec-1",
        storageRef: "storage/a.pdf",
      };
      const gas = {
        ...GAS_OCT,
        id: "gas-1",
        storageRef: "storage/b.pdf",
        billingPeriodEnd: "2025-11-08", // Within 10 days of Nov 12
      };

      const cycles = pgeStatementCycles([elec, gas]);

      expect(cycles).toHaveLength(1);
      expect(cycles[0].elec).toBe(elec.totalAmount);
      expect(cycles[0].gas).toBe(gas.totalAmount);
    });

    it("does NOT group if period ends are too far apart", () => {
      const elec = {
        ...ELEC_OCT_NOV,
        id: "elec-1",
        storageRef: "storage/a.pdf",
      };
      const gas = {
        ...GAS_OCT,
        id: "gas-1",
        storageRef: "storage/b.pdf",
        billingPeriodEnd: "2025-10-31", // 12 days from Nov 12
      };

      const cycles = pgeStatementCycles([elec, gas]);

      expect(cycles).toHaveLength(2);
      // Each bill becomes its own cycle
      expect(cycles.some((c) => c.elec > 0 && c.gas === 0)).toBe(true);
      expect(cycles.some((c) => c.gas > 0 && c.elec === 0)).toBe(true);
    });
  });

  describe("multiple cycles", () => {
    it("creates multiple cycles for multiple statement periods", () => {
      const cycles = pgeStatementCycles(ENERGY_ONLY_SET);

      // ENERGY_ONLY_SET has 5 elec bills and 5 gas bills
      // Should create 5 cycles (one per statement period)
      expect(cycles).toHaveLength(5);
    });

    it("sorts cycles by period end (most recent first)", () => {
      const cycles = pgeStatementCycles(ENERGY_ONLY_SET);

      // First cycle should be the most recent (Feb-Mar)
      expect(cycles[0].periodEnd).toBe("2026-03-12");

      // Last cycle should be the oldest (Oct-Nov)
      expect(cycles[cycles.length - 1].periodEnd).toBe("2025-11-12");
    });

    it("uses earliest start and latest end for combined period", () => {
      // ELEC_OCT_NOV: Oct 14 – Nov 12
      // GAS_OCT: Oct 14 – Nov 10 (same storageRef, close dates)
      const cycles = pgeStatementCycles([ELEC_OCT_NOV, GAS_OCT]);

      // Both start Oct 14, so that's the earliest
      expect(cycles[0].periodStart).toBe("2025-10-14");
      // Elec ends Nov 12, gas ends Nov 10, so Nov 12 is latest
      expect(cycles[0].periodEnd).toBe("2025-11-12");
    });
  });

  describe("edge cases", () => {
    it("returns empty array for empty input", () => {
      const cycles = pgeStatementCycles([]);
      expect(cycles).toHaveLength(0);
    });

    it("returns empty array for water-only bills", () => {
      const cycles = pgeStatementCycles([WATER_SEP_NOV]);
      expect(cycles).toHaveLength(0);
    });

    it("handles electricity-only (no gas)", () => {
      const cycles = pgeStatementCycles([ELEC_OCT_NOV]);

      expect(cycles).toHaveLength(1);
      expect(cycles[0].elec).toBe(ELEC_OCT_NOV.totalAmount);
      expect(cycles[0].gas).toBe(0);
      expect(cycles[0].therms).toBe(0);
    });

    it("handles gas-only (no electricity)", () => {
      const cycles = pgeStatementCycles([GAS_OCT]);

      expect(cycles).toHaveLength(1);
      expect(cycles[0].gas).toBe(GAS_OCT.totalAmount);
      expect(cycles[0].elec).toBe(0);
      expect(cycles[0].kWh).toBe(0);
    });

    it("ignores water bills in the input", () => {
      const cycles = pgeStatementCycles([
        ELEC_OCT_NOV,
        GAS_OCT,
        WATER_SEP_NOV,
      ]);

      expect(cycles).toHaveLength(1);
      // Total should not include water
      expect(cycles[0].total).toBe(
        ELEC_OCT_NOV.totalAmount + GAS_OCT.totalAmount
      );
    });

    it("prefers storageRef match over closer date", () => {
      // Create two gas bills: one with matching storageRef but farther date,
      // one with different storageRef but closer date
      const elec = makeBill({
        utilityType: "electricity",
        billingPeriodStart: "2025-10-14",
        billingPeriodEnd: "2025-11-12",
        totalAmount: 100,
      });
      elec.storageRef = "pdf/statement-1.pdf";

      const gasMatch = makeBill({
        utilityType: "gas",
        billingPeriodStart: "2025-10-01",
        billingPeriodEnd: "2025-11-05", // 7 days away
        totalAmount: 50,
      });
      gasMatch.storageRef = "pdf/statement-1.pdf"; // Same ref
      gasMatch.id = "gas-match";

      const gasClose = makeBill({
        utilityType: "gas",
        billingPeriodStart: "2025-10-01",
        billingPeriodEnd: "2025-11-11", // 1 day away
        totalAmount: 60,
      });
      gasClose.storageRef = "pdf/statement-2.pdf"; // Different ref
      gasClose.id = "gas-close";

      const cycles = pgeStatementCycles([elec, gasMatch, gasClose]);

      // Should have 2 cycles: one paired (elec + gasMatch), one unpaired (gasClose)
      expect(cycles).toHaveLength(2);

      // The paired cycle should use gasMatch ($50), not gasClose ($60)
      const pairedCycle = cycles.find((c) => c.elec === 100)!;
      expect(pairedCycle.gas).toBe(50);
    });
  });

  describe("data integrity", () => {
    it("preserves all usage data", () => {
      const cycles = pgeStatementCycles([ELEC_NOV_DEC, GAS_NOV]);

      expect(cycles[0].kWh).toBe(ELEC_NOV_DEC.usage);
      expect(cycles[0].therms).toBe(GAS_NOV.usage);
    });

    it("total equals elec + gas", () => {
      const cycles = pgeStatementCycles(ENERGY_ONLY_SET);

      for (const cycle of cycles) {
        expect(cycle.total).toBe(cycle.elec + cycle.gas);
      }
    });

    it("each bill appears in exactly one cycle", () => {
      const cycles = pgeStatementCycles(ENERGY_ONLY_SET);

      // Count total elec and gas amounts across all cycles
      const totalElec = cycles.reduce((sum, c) => sum + c.elec, 0);
      const totalGas = cycles.reduce((sum, c) => sum + c.gas, 0);

      // Should equal sum of all elec/gas bills
      const expectedElec = ENERGY_ONLY_SET.filter(
        (b) => b.utilityType === "electricity"
      ).reduce((sum, b) => sum + b.totalAmount, 0);
      const expectedGas = ENERGY_ONLY_SET.filter(
        (b) => b.utilityType === "gas"
      ).reduce((sum, b) => sum + b.totalAmount, 0);

      expect(totalElec).toBe(expectedElec);
      expect(totalGas).toBe(expectedGas);
    });
  });
});
