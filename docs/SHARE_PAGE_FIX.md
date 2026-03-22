# Share Page Fix - March 21, 2026

## Critical Bug Found & Fixed

### The Problem
The share/landlord view (`/share/[token]`) was using **the same incorrect logic** that we just fixed in the main dashboard:

**Line 217-221 (BEFORE)**:
```typescript
const cur = monthlySpend[monthlySpend.length - 1] // Pro-rated calendar month!
const curTotal = cur.electricity + cur.gas + cur.water; // $39.05 for incomplete March
```

This caused the hero card to show **$39.05** for March 2026 instead of the correct approximate spend based on the latest bills.

### Root Cause
The share page was:
1. ❌ Using pro-rated calendar-month data for the hero total
2. ❌ Comparing incomplete month vs previous month (unfair delta)
3. ❌ Not using anchor month logic
4. ❌ No visual indicator for incomplete months in chart

### The Fix
Applied **identical principles** from the main dashboard fix:

#### 1. Hero Card Total (Lines 222-227)
**NOW USES**: `deriveApproxUtilitySpendInMonth()` based on `utilitySummaryAnchorMonth()`

```typescript
const anchorYearMonth = utilitySummaryAnchorMonth(allBills);
const approxMonthSpend = anchorYearMonth 
  ? deriveApproxUtilitySpendInMonth(allBills, anchorYearMonth.year, anchorYearMonth.month)
  : { electricity: 0, gas: 0, water: 0 };
const curTotal = approxMonthSpend.electricity + approxMonthSpend.gas + approxMonthSpend.water;
```

**Result**: Shows ~$200-300 (actual latest bills) instead of $39.05 (pro-rated partial March)

#### 2. Delta Calculation (Lines 229-232)
**NOW COMPARES**: Current approx spend vs. last *completed* month

```typescript
const completedMonths = filterCompletedMonths(monthlySpend);
const prevMonth = completedMonths[completedMonths.length - 1];
const prvTotal = prevMonth ? (prevMonth.electricity + prevMonth.gas + prevMonth.water) : 0;
const totalDeltaPct = prvTotal > 0 ? ((curTotal - prvTotal) / prvTotal) * 100 : 0;
```

**Result**: Fair comparison (complete month vs complete month)

#### 3. Incomplete Month Indicator (Lines 272-281)
**NOW SHOWS**: 
- "Mar '26 · Month in progress" for incomplete months
- "Approximate · bills still arriving" instead of delta percentage
- Hides misleading delta when month is incomplete

```typescript
const anchorIsIncomplete = anchorYearMonth ? !isMonthComplete(anchorYearMonth.year, anchorYearMonth.month) : false;

// In the hero render:
{anchorIsIncomplete ? (
  <span className="text-sm text-slate-400">Approximate · bills still arriving</span>
) : /* show delta */}
```

#### 4. Visual Chart Indicator (Lines 321-343)
**NOW RENDERS**: Incomplete months at 40% opacity

```typescript
const monthlySpendWithMeta = monthlySpend.map(m => {
  // ... parse month/year from label
  return { ...m, isComplete: isMonthComplete(year, month) };
});

// In each Bar component:
shape={(props: any) => {
  const { x, y, width, height, payload } = props;
  return <rect x={x} y={y} width={width} height={height} fill={color} opacity={payload.isComplete ? 1 : 0.4} />;
}}
```

## Architecture Alignment

All fixes align with `docs/ARCHITECTURE.md`:

✅ **Section 4.1-4.2**: Hero uses approximate spend from anchor month (statement-level)  
✅ **Section 5.1**: Incomplete month handling - no misleading deltas, visual indicators  
✅ **Section 4.6**: Chart shows all months with visual distinction for incomplete  

## What Changed

### Files Modified
1. `app/share/[token]/page.tsx` - Applied all 4 fixes above

### New Imports
```typescript
import {
  deriveMonthlySpend, deriveElecMonthly, deriveGasMonthly,
  utilitySummaryAnchorMonth, deriveApproxUtilitySpendInMonth,  // NEW
} from "@/lib/use-bills";
import {
  filterCompletedMonths,  // NEW
  isMonthComplete,        // NEW
} from "@/lib/bill-utils";
```

## Before vs After

### Share Page Hero (March 21, 2026)

**BEFORE (Bug)**:
```
$39.05  ❌ (pro-rated March partial)
↓ 92.3% vs Feb '26  ❌ (unfair comparison)

Electricity: $18.56
Gas: $20.94
Water: $0
```

**AFTER (Fixed)**:
```
$221.00  ✓ (approx based on latest bills)
Mar '26 · Month in progress
Approximate · bills still arriving  ✓ (no misleading delta)

Electricity: $130.00  ✓ (latest Feb 10 - Mar 12 bill)
Gas: $71.00          ✓ (latest Feb 10 - Mar 10 bill)
Water: $20.00        ✓ (pro-rated from latest bimonthly)
```

### Monthly Spending Chart
- **BEFORE**: All bars full opacity, March bar misleadingly short
- **AFTER**: March bar at 40% opacity, visually indicating incomplete data

## Testing

✅ **Build**: Successful (no TypeScript errors)  
✅ **Tests**: 107/107 passing (no regressions)  
✅ **Architecture**: Fully aligned with documented contracts  

## Summary

The share page had the **exact same bug** as the main dashboard. It's now fixed using the **same architectural principles**:

1. Use statement-level data (latest bills) for current displays
2. Exclude incomplete months from aggregate calculations
3. Never compare incomplete vs complete months
4. Visually indicate partial/in-progress data

Both views are now consistent and accurate. 🎉
