/**
 * Tests for parser → adapter contracts.
 * 
 * Verifies that parsed bills (PGEBill, SJWBill) are correctly converted
 * to the universal Bill format for storage.
 */

import { describe, it, expect } from "vitest";
import {
  toBills,
  pgeToBills,
  sjwToBill,
  pgeToElectricityBill,
  pgeToGasBill,
} from "@/lib/parsers/adapter";
import type { BillMeta } from "@/lib/parsers/adapter";
import {
  SAMPLE_PGE_BILL,
  SAMPLE_SJW_BILL,
  SAMPLE_PARSE_RESULT_PGE,
  SAMPLE_PARSE_RESULT_SJW,
} from "./fixtures";

const TEST_META: BillMeta = {
  householdId: "test-household-123",
  storageRef: "bills/test-household-123/2026-02/statement.pdf",
  uploadedBy: "user-456",
  uploadedAt: "2026-02-20T10:00:00Z",
};

describe("PGE adapter", () => {
  describe("pgeToBills - produces two Bill records", () => {
    it("returns exactly 2 bills (electricity + gas)", () => {
      const bills = pgeToBills(SAMPLE_PGE_BILL, TEST_META);

      expect(bills).toHaveLength(2);
      expect(bills[0].utilityType).toBe("electricity");
      expect(bills[1].utilityType).toBe("gas");
    });

    it("preserves household metadata on both bills", () => {
      const bills = pgeToBills(SAMPLE_PGE_BILL, TEST_META);

      for (const bill of bills) {
        expect(bill.householdId).toBe(TEST_META.householdId);
        expect(bill.storageRef).toBe(TEST_META.storageRef);
        expect(bill.uploadedBy).toBe(TEST_META.uploadedBy);
        expect(bill.uploadedAt).toBe(TEST_META.uploadedAt);
      }
    });
  });

  describe("pgeToElectricityBill", () => {
    it("maps billing period correctly", () => {
      const bill = pgeToElectricityBill(SAMPLE_PGE_BILL, TEST_META);

      expect(bill.billingPeriodStart).toBe(SAMPLE_PGE_BILL.electricity.periodStart);
      expect(bill.billingPeriodEnd).toBe(SAMPLE_PGE_BILL.electricity.periodEnd);
    });

    it("uses electricity.total (current charges only)", () => {
      const bill = pgeToElectricityBill(SAMPLE_PGE_BILL, TEST_META);

      // Total should be delivery + adjustments + generation = 65 + 0 + 52 = 117
      expect(bill.totalAmount).toBe(SAMPLE_PGE_BILL.electricity.total);
      expect(bill.totalAmount).toBe(117);
    });

    it("maps usage correctly", () => {
      const bill = pgeToElectricityBill(SAMPLE_PGE_BILL, TEST_META);

      expect(bill.usage).toBe(SAMPLE_PGE_BILL.electricity.usageTotal);
      expect(bill.usageUnit).toBe("kWh");
    });

    it("computes effective unit price", () => {
      const bill = pgeToElectricityBill(SAMPLE_PGE_BILL, TEST_META);

      // unitPrice = total / usage = 117 / 580 = 0.2017
      expect(bill.unitPrice).toBeCloseTo(
        SAMPLE_PGE_BILL.electricity.effectiveUnitPrice,
        2
      );
    });

    it("categorizes charges into buckets", () => {
      const bill = pgeToElectricityBill(SAMPLE_PGE_BILL, TEST_META);

      // Should have Generation, Delivery & Infrastructure, Public Purpose Programs, Taxes & Fees
      const labels = bill.charges.map((c) => c.label);

      expect(labels).toContain("Generation (SJCE)");
      expect(
        labels.some(
          (l) =>
            l.includes("Delivery") ||
            l.includes("Infrastructure") ||
            l.includes("Programs") ||
            l.includes("Taxes")
        )
      ).toBe(true);
    });

    it("charge amounts sum to approximately totalAmount", () => {
      const bill = pgeToElectricityBill(SAMPLE_PGE_BILL, TEST_META);

      const chargeSum = bill.charges.reduce((sum, c) => sum + c.amount, 0);

      // Allow small rounding tolerance
      expect(chargeSum).toBeCloseTo(bill.totalAmount, 0);
    });
  });

  describe("pgeToGasBill", () => {
    it("maps billing period correctly", () => {
      const bill = pgeToGasBill(SAMPLE_PGE_BILL, TEST_META);

      expect(bill.billingPeriodStart).toBe(SAMPLE_PGE_BILL.gas.periodStart);
      expect(bill.billingPeriodEnd).toBe(SAMPLE_PGE_BILL.gas.periodEnd);
    });

    it("uses gas.total (current charges only)", () => {
      const bill = pgeToGasBill(SAMPLE_PGE_BILL, TEST_META);

      expect(bill.totalAmount).toBe(SAMPLE_PGE_BILL.gas.total);
      expect(bill.totalAmount).toBe(71);
    });

    it("maps usage correctly", () => {
      const bill = pgeToGasBill(SAMPLE_PGE_BILL, TEST_META);

      expect(bill.usage).toBe(SAMPLE_PGE_BILL.gas.usageTotal);
      expect(bill.usageUnit).toBe("Therms");
    });

    it("categorizes gas charges", () => {
      const bill = pgeToGasBill(SAMPLE_PGE_BILL, TEST_META);

      const labels = bill.charges.map((c) => c.label);

      // Should have Gas Commodity and optionally Programs/Taxes
      expect(
        labels.some((l) => l.includes("Gas") || l.includes("Commodity"))
      ).toBe(true);
    });
  });
});

describe("SJW adapter", () => {
  describe("sjwToBill - produces one Bill record", () => {
    it("returns exactly 1 bill (water)", () => {
      const bills = toBills(SAMPLE_PARSE_RESULT_SJW, TEST_META);

      expect(bills).toHaveLength(1);
      expect(bills[0].utilityType).toBe("water");
    });

    it("uses correct provider", () => {
      const bill = sjwToBill(SAMPLE_SJW_BILL, TEST_META);

      expect(bill.provider).toBe("San Jose Water");
    });
  });

  describe("sjwToBill details", () => {
    it("maps billing period correctly", () => {
      const bill = sjwToBill(SAMPLE_SJW_BILL, TEST_META);

      expect(bill.billingPeriodStart).toBe(SAMPLE_SJW_BILL.periodStart);
      expect(bill.billingPeriodEnd).toBe(SAMPLE_SJW_BILL.periodEnd);
    });

    it("uses monthlySpend (charges.total), NOT totalAmountDue", () => {
      const bill = sjwToBill(SAMPLE_SJW_BILL, TEST_META);

      // CRITICAL: We use charges.total, not totalAmountDue
      // This is current period charges only, no balance carryover
      expect(bill.totalAmount).toBe(SAMPLE_SJW_BILL.monthlySpend);
      expect(bill.totalAmount).toBe(SAMPLE_SJW_BILL.charges.total);
      expect(bill.totalAmount).toBe(240);
    });

    it("maps usage correctly", () => {
      const bill = sjwToBill(SAMPLE_SJW_BILL, TEST_META);

      expect(bill.usage).toBe(SAMPLE_SJW_BILL.usageTotal);
      expect(bill.usageUnit).toBe("CCF");
    });

    it("computes effective unit price", () => {
      const bill = sjwToBill(SAMPLE_SJW_BILL, TEST_META);

      // unitPrice = charges.total / usage = 240 / 18 = 13.33
      expect(bill.unitPrice).toBeCloseTo(
        SAMPLE_SJW_BILL.effectiveUnitPrice,
        1
      );
    });

    it("categorizes water charges", () => {
      const bill = sjwToBill(SAMPLE_SJW_BILL, TEST_META);

      const labels = bill.charges.map((c) => c.label);

      // Should have Service Charge, Quantity Charges, and possibly Programs/Taxes
      expect(labels.some((l) => l.includes("Service"))).toBe(true);
      expect(labels.some((l) => l.includes("Quantity"))).toBe(true);
    });
  });
});

describe("toBills - unified entry point", () => {
  it("routes PGE bills correctly", () => {
    const bills = toBills(SAMPLE_PARSE_RESULT_PGE, TEST_META);

    expect(bills).toHaveLength(2);
    expect(bills[0].provider).toBe("PG&E");
    expect(bills[1].provider).toBe("PG&E");
  });

  it("routes SJW bills correctly", () => {
    const bills = toBills(SAMPLE_PARSE_RESULT_SJW, TEST_META);

    expect(bills).toHaveLength(1);
    expect(bills[0].provider).toBe("San Jose Water");
  });

  it("returns empty array for failed parse", () => {
    const result = {
      success: false,
      error: "Could not parse PDF",
    };
    const bills = toBills(result, TEST_META);

    expect(bills).toHaveLength(0);
  });

  it("returns empty array when bill is undefined", () => {
    const result = {
      success: true,
      bill: undefined,
      billType: undefined,
    };
    const bills = toBills(result, TEST_META);

    expect(bills).toHaveLength(0);
  });

  it("passes ocrFallback flag through", () => {
    const result = {
      ...SAMPLE_PARSE_RESULT_PGE,
      ocrFallback: true,
    };
    const bills = toBills(result, TEST_META);

    // parseStatus should still be success even with OCR fallback
    for (const bill of bills) {
      expect(bill.parseStatus).toBe("success");
    }
  });
});

describe("data integrity contracts", () => {
  describe("PGE contract: current charges only", () => {
    it("does not include previousBalance in totalAmount", () => {
      const pgeWithBalance = {
        ...SAMPLE_PGE_BILL,
        summary: {
          ...SAMPLE_PGE_BILL.summary,
          previousBalance: 50,
          totalAmountDue: 238, // 188 + 50
        },
      };

      const bills = pgeToBills(pgeWithBalance, TEST_META);
      const elec = bills[0];
      const gas = bills[1];

      // Electricity should still be 117 (delivery + generation)
      expect(elec.totalAmount).toBe(117);
      // Gas should still be 71
      expect(gas.totalAmount).toBe(71);
      // Neither should be affected by the 50 previous balance
      expect(elec.totalAmount + gas.totalAmount).toBe(188);
    });
  });

  describe("SJW contract: current charges only", () => {
    it("does not include previousBalance in totalAmount", () => {
      const sjwWithBalance = {
        ...SAMPLE_SJW_BILL,
        previousBalance: 100,
        totalAmountDue: 340, // 240 + 100
      };

      const bill = sjwToBill(sjwWithBalance, TEST_META);

      // Should use charges.total (240), not totalAmountDue (340)
      expect(bill.totalAmount).toBe(240);
    });
  });

  describe("unit price computation", () => {
    it("electricity unitPrice uses effectiveUnitPrice from parser (rounded)", () => {
      const bill = pgeToElectricityBill(SAMPLE_PGE_BILL, TEST_META);

      // Adapter uses the parser's effectiveUnitPrice, rounded to 2 decimal places
      // Parser computed: 117 / 580 = 0.2017...
      // Adapter rounds to 0.20
      expect(bill.unitPrice).toBeCloseTo(
        Math.round(SAMPLE_PGE_BILL.electricity.effectiveUnitPrice * 100) / 100,
        2
      );
    });

    it("gas unitPrice uses effectiveUnitPrice from parser (rounded)", () => {
      const bill = pgeToGasBill(SAMPLE_PGE_BILL, TEST_META);

      // Parser computed: 71 / 30 = 2.3666...
      // Adapter rounds to 2.37
      expect(bill.unitPrice).toBeCloseTo(
        Math.round(SAMPLE_PGE_BILL.gas.effectiveUnitPrice * 100) / 100,
        2
      );
    });

    it("water unitPrice = charges.total / usage", () => {
      const bill = sjwToBill(SAMPLE_SJW_BILL, TEST_META);

      const expected = SAMPLE_SJW_BILL.charges.total / SAMPLE_SJW_BILL.usageTotal;
      expect(bill.unitPrice).toBeCloseTo(expected, 2);
    });
  });
});
