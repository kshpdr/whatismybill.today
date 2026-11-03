import { describe, it, expect } from "vitest";
import {
  isBillInWindow,
  isBillInAnyWindow,
  filterBillsByWindows,
  windowContains,
  isIsoDate,
  UNBOUNDED_WINDOW,
} from "../lib/access-window.js";

const bill = (start: string, end: string) => ({ billingPeriodStart: start, billingPeriodEnd: end });

describe("isBillInWindow", () => {
  it("shows everything through an unbounded window", () => {
    expect(isBillInWindow(bill("2020-01-01", "2020-01-31"), UNBOUNDED_WINDOW)).toBe(true);
  });

  it("hides bills that ended before move-in", () => {
    expect(isBillInWindow(bill("2026-01-01", "2026-01-31"), { from: "2026-02-01", until: null })).toBe(false);
  });

  it("hides bills that started after move-out", () => {
    expect(isBillInWindow(bill("2026-03-01", "2026-03-31"), { from: null, until: "2026-02-28" })).toBe(false);
  });

  it("shows the bill spanning a move-over date to both outgoing and incoming members", () => {
    const transition = bill("2026-02-10", "2026-03-09");
    expect(isBillInWindow(transition, { from: null,         until: "2026-02-20" })).toBe(true);
    expect(isBillInWindow(transition, { from: "2026-02-21", until: null })).toBe(true);
  });

  it("treats both window edges as inclusive", () => {
    expect(isBillInWindow(bill("2026-01-01", "2026-02-01"), { from: "2026-02-01", until: null })).toBe(true);
    expect(isBillInWindow(bill("2026-02-28", "2026-03-31"), { from: null, until: "2026-02-28" })).toBe(true);
  });
});

describe("isBillInAnyWindow / filterBillsByWindows", () => {
  const stays = [
    { from: "2025-01-01", until: "2025-03-31" },
    { from: "2025-09-01", until: null },
  ];

  it("shows bills from any stay but not the gap between stays", () => {
    expect(isBillInAnyWindow(bill("2025-02-01", "2025-02-28"), stays)).toBe(true);
    expect(isBillInAnyWindow(bill("2025-06-01", "2025-06-30"), stays)).toBe(false);
    expect(isBillInAnyWindow(bill("2025-10-01", "2025-10-31"), stays)).toBe(true);
  });

  it("returns nothing when there are no windows", () => {
    expect(filterBillsByWindows([bill("2025-02-01", "2025-02-28")], [])).toEqual([]);
  });
});

describe("windowContains", () => {
  it("unbounded contains everything", () => {
    expect(windowContains(UNBOUNDED_WINDOW, { from: "2026-01-01", until: "2026-02-01" })).toBe(true);
    expect(windowContains(UNBOUNDED_WINDOW, UNBOUNDED_WINDOW)).toBe(true);
  });

  it("a later move-in does not contain an earlier or unbounded start", () => {
    const newMember = { from: "2026-03-01", until: null };
    expect(windowContains(newMember, UNBOUNDED_WINDOW)).toBe(false);
    expect(windowContains(newMember, { from: "2026-01-01", until: null })).toBe(false);
    expect(windowContains(newMember, { from: "2026-03-01", until: null })).toBe(true);
    expect(windowContains(newMember, { from: "2026-04-01", until: "2026-05-01" })).toBe(true);
  });

  it("a closed window does not contain an open-ended one", () => {
    expect(windowContains({ from: null, until: "2026-01-31" }, UNBOUNDED_WINDOW)).toBe(false);
  });
});

describe("isIsoDate", () => {
  it("accepts YYYY-MM-DD and rejects anything else", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-2-28")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate(null)).toBe(false);
  });
});
