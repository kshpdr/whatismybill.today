/**
 * Pure functions for share-link visibility filtering.
 *
 * Extracted from share.ts so they can be unit-tested without a DB connection.
 * The route calls filterBillsByVisibility() after fetching raw rows from postgres.
 */

import type { ShareVisibilityConfig, UtilityType } from "../db/schema.js";
import { SHARE_VISIBILITY_DEFAULTS } from "../db/schema.js";

/**
 * A minimal bill shape required for filtering.
 * The actual DB row has more fields; this interface keeps tests independent
 * of the full schema.
 */
export interface FilterableBill {
  utilityType:     string; // "electricity" | "gas" | "water"
  billingPeriodEnd: string; // ISO date YYYY-MM-DD
}

/**
 * Merge a stored JSONB config (which may be partial / from an old schema)
 * with the current defaults.  Always returns a complete ShareVisibilityConfig.
 *
 * Old share links stored before the visibleUtilityTypes / maxMonths fields were
 * added will have those keys missing.  Spreading defaults first and then the
 * stored object guarantees all keys are present.
 */
export function mergeVisibilityConfig(stored: unknown): ShareVisibilityConfig {
  const override =
    stored !== null && typeof stored === "object" ? stored : {};
  return { ...SHARE_VISIBILITY_DEFAULTS, ...override } as ShareVisibilityConfig;
}

/**
 * Filter bills according to the visibility config.
 *
 * @param bills  Raw bill rows from the DB (or any object with the two required fields).
 * @param config Fully-merged visibility config (use mergeVisibilityConfig first).
 * @param now    Injectable clock for testability; defaults to Date.now().
 * @returns      Subset of bills that should be transmitted to the share-link viewer.
 */
export function filterBillsByVisibility<T extends FilterableBill>(
  bills:  T[],
  config: ShareVisibilityConfig,
  now:    Date = new Date(),
): T[] {
  const allowed = new Set<string>(config.visibleUtilityTypes);

  // cutoffDate is the earliest billingPeriodEnd (inclusive) to show.
  // We approximate 1 month ≈ 30 days.
  const cutoffDate: string | null =
    config.maxMonths != null
      ? new Date(now.getTime() - config.maxMonths * 30 * 86_400_000)
          .toISOString()
          .slice(0, 10)
      : null;

  return bills.filter((b) => {
    // Drop bill if its utility type is not in the allowed set
    if (!allowed.has(b.utilityType)) return false;
    // Drop bill if it ended before the cutoff date (string comparison is
    // correct for ISO YYYY-MM-DD format)
    if (cutoffDate !== null && b.billingPeriodEnd < cutoffDate) return false;
    return true;
  });
}
