/**
 * Date-window rules for who may see which bills.
 *
 * A membership is a stay in a household: `from` is the move-in date, `until`
 * the move-out date (both inclusive, ISO YYYY-MM-DD; null = unbounded). A bill
 * is visible to a stay when its billing period overlaps it, so the bill that
 * spans a move-over date is visible to both the outgoing and incoming member.
 *
 * Pure functions, no DB access, so the rules can be unit-tested directly.
 */

export interface AccessWindow {
  from:  string | null;
  until: string | null;
}

export interface DatedBill {
  billingPeriodStart: string;
  billingPeriodEnd:   string;
}

export const UNBOUNDED_WINDOW: AccessWindow = { from: null, until: null };

export function isBillInWindow(bill: DatedBill, window: AccessWindow): boolean {
  if (window.from  !== null && bill.billingPeriodEnd   < window.from)  return false;
  if (window.until !== null && bill.billingPeriodStart > window.until) return false;
  return true;
}

export function isBillInAnyWindow(bill: DatedBill, windows: AccessWindow[]): boolean {
  return windows.some((w) => isBillInWindow(bill, w));
}

export function filterBillsByWindows<T extends DatedBill>(bills: T[], windows: AccessWindow[]): T[] {
  return bills.filter((b) => isBillInAnyWindow(b, windows));
}

/** True when everything visible through `inner` is also visible through `outer`. */
export function windowContains(outer: AccessWindow, inner: AccessWindow): boolean {
  const fromOk  = outer.from  === null || (inner.from  !== null && inner.from  >= outer.from);
  const untilOk = outer.until === null || (inner.until !== null && inner.until <= outer.until);
  return fromOk && untilOk;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && ISO_DATE.test(value) && !Number.isNaN(Date.parse(value));
}

export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
