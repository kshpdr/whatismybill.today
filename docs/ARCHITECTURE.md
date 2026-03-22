# whatismybill.today — Data Architecture & Display Contract

## 1. Overview

Users upload utility bill PDFs (PG&E electricity+gas, San Jose Water). We parse them, store structured data, and display dashboards with breakdowns, trends, and averages.

**Core challenge**: Bills arrive at different cadences (monthly PG&E, bimonthly water), cover different date ranges, and we need to present coherent calendar-month aggregates while keeping statement-level data accurate.

---

## 2. Data Layers

### Layer 1: Parsed Bill (provider-specific)

Raw extraction from PDF. Provider-specific types (`PGEBill`, `SJWBill`).

- **PGEBill**: One PDF → one object containing both electricity + gas sections, each with their own billing period, usage, line items, and totals.
- **SJWBill**: One PDF → one object with water data, tiers, service charges, and `monthlyAllocations` (parser-computed split across calendar months).

These are ephemeral — used during parsing, never stored directly.

### Layer 2: Stored Bill (universal `Bill` record)

One DB row per utility per billing period. A PG&E PDF produces **two** rows (electricity, gas); a SJW PDF produces **one** row (water).

```
┌──────────────────────────────────────────────────────────────────┐
│ Bill (DB row)                                                    │
├──────────────────────────────────────────────────────────────────┤
│ id, householdId, provider, utilityType                           │
│ billingPeriodStart, billingPeriodEnd    ← exact dates from bill  │
│ totalAmount                            ← current charges only*  │
│ usage, usageUnit, unitPrice            ← from the bill          │
│ charges[]                              ← categorised line items │
│ storageRef, uploadedBy, parseStatus, uploadedAt                  │
└──────────────────────────────────────────────────────────────────┘
```

**Critical rule for `totalAmount`**:
- **PG&E electricity**: `delivery.total + adjustments + generation.total` (current period charges, excludes any carried-over past-due balance)
- **PG&E gas**: `gas.total` (current period charges)
- **Water (SJW)**: `charges.total` (current charges, NOT `totalAmountDue` which may include previous balance)

This ensures analytics reflect actual consumption cost for the period, not payment history.

### Layer 3: Calendar-Month Normalized Data (derived, never stored)

Computed at display time from Bill records. Pro-rates each bill's `totalAmount` across the calendar months its billing period spans.

---

## 3. Normalization: Statement → Calendar Month

### 3.1 The Pro-Rating Formula

For a bill covering `[periodStart, periodEnd]` with `totalAmount`:

```
For each calendar month M that overlaps [periodStart, periodEnd]:
  overlapDays = days of [periodStart, periodEnd] that fall within M
  periodDays  = total days in [periodStart, periodEnd]
  allocated   = totalAmount × (overlapDays / periodDays)
```

This applies uniformly to **all utility types** (electricity, gas, water).

### 3.2 Why This Matters

| Bill type | Typical period | Effect |
|-----------|---------------|--------|
| PG&E electricity | ~30 days, e.g. Oct 14 – Nov 12 | ~57% allocated to October, ~43% to November |
| PG&E gas | ~30 days, e.g. Oct 1 – Oct 31 | 100% in October |
| SJW water | ~60 days, e.g. Sep 5 – Nov 3 | Split across Sep (~43%), Oct (~52%), Nov (~5%) |

### 3.3 Usage Pro-Rating

Currently we only pro-rate `totalAmount` (dollars). We do NOT pro-rate `usage` into calendar months because:
- Usage is not linearly distributed across days (it's weather and behavior dependent)
- For charts that show usage (kWh, therms, CCF), we display **statement-level** data, not calendar-normalized data

**Decision point**: Should we also pro-rate usage? Current answer: No. Show usage as statement-level only. The water "~X CCF/mo" display divides by billing days × 30 as a rough monthly equivalent, but this is a display label, not a stored value.

---

## 4. Dashboard Display Sections & Their Data Sources

### 4.1 "Approx. Utilities — Calendar Month" (top hero card)

**Purpose**: Answer "roughly how much did I spend on utilities in month X?"

**Data source**: `deriveApproxUtilitySpendInMonth(bills, year, month)`

**Anchor month selection** (via `utilitySummaryAnchorMonth`):
1. Prefer the month of the latest water bill's `billingPeriodEnd` (water drives the display because it's bimonthly and often the most recent reference point)
2. Fallback: latest electricity/gas bill's end month
3. Fallback: current calendar month

**What it shows**:
- Total approximate spend for the anchor month (sum of electricity + gas + water allocations)
- Percentage breakdown bar (elec / gas / water)
- Delta vs. the previous calendar month's allocation

**Known issue — incomplete months**: If the anchor month is the current month and it's not over yet, the total will be artificially low because:
1. Bills with periods ending before today only have partial overlap with the current month
2. No future bills exist yet to cover the rest of the month

**Proposed fix**: See Section 6.1.

### 4.2 "PG&E — Electricity & Gas" (hero card)

**Purpose**: Show the latest combined PG&E energy statement total, with trend vs. previous statement.

**Data source**: `pgeStatementCycles(bills)` — groups electricity + gas Bill records from the same PDF (matched by `storageRef`, or by `billingPeriodEnd` proximity within 10 days).

**What it shows**:
- Combined `electricity.totalAmount + gas.totalAmount` for the latest cycle
- Percentage delta vs. the previous cycle
- kWh and therms from the latest cycle
- Elec/gas split bar

**This is statement-level data** — no pro-rating. Shows the actual bill amounts.

### 4.3 "Water — Full Bill" (hero card)

**Purpose**: Show the latest water bill total with trend.

**Data source**: Latest Bill where `utilityType === "water"`, sorted by `billingPeriodEnd`.

**What it shows**:
- Full bill `totalAmount` (the actual bill, not monthly equivalent)
- Billing period dates + day count
- "bimonthly" badge if billing days > 40
- Delta vs. previous water bill
- Usage in CCF, effective $/CCF, provider

**This is statement-level data**.

### 4.4 "Per-Utility Status" (three-row card)

**Purpose**: Quick glance at each utility's current cost and usage.

**Current behavior (BUGGY)**:
- Electricity and gas: Uses `cur` from `deriveMonthlySpend` — the LAST entry in calendar-month array, which may be a partial month.
- Water: Uses `monthlyWaterAmount = totalAmount / billingDays × 30` — a rough monthly estimate from the latest water bill.

**What we SHOULD show**:

| Utility | Amount | Usage | Source |
|---------|--------|-------|--------|
| Electricity | Latest bill's totalAmount | Latest bill's usage + unit | Statement-level |
| Gas | Latest bill's totalAmount | Latest bill's usage + unit | Statement-level |
| Water | ~$X/mo (totalAmount / billingDays × 30) | ~X CCF/mo | Statement-level, with monthly normalization for display |

**Delta**: Compare each against the previous bill of the same type (statement-level comparison, not calendar-month).

**Rationale**: The "per-utility status" card answers "what did my latest bill say?" — it should use statement-level data, not pro-rated calendar data.

### 4.5 "Averages & Benchmarks"

**Purpose**: Long-term context — average monthly spend, estimated annual, cheapest/most expensive month, rate vs. CA average.

**Data source**: `deriveMonthlySpend(bills)` — calendar-month normalized data.

#### 4.5.1 Average Monthly Spend

```
avgMonthly = sum(allMonths.total) / completedMonthCount
```

**Critical rule**: Exclude the current (potentially incomplete) month from the average. A month is "complete" if its last day has passed, OR if we have billing data from all three utilities with period ends in or past that month.

**Simpler heuristic**: A calendar month is complete if `today > last day of that month`. The current calendar month is always excluded from averages.

#### 4.5.2 Estimated Annual

```
estAnnual = avgMonthly × 12
```

Uses the same completed-months-only average.

#### 4.5.3 Per-Utility Averages

```
avgElec  = sum(completedMonths.electricity) / completedMonthCount
avgGas   = sum(completedMonths.gas) / completedMonthCount
avgWater = sum(completedMonths.water) / completedMonthCount
```

Same exclusion rule.

#### 4.5.4 Cheapest / Most Expensive Month

**Current behavior (BUGGY)**: Includes partial current month, making it appear as the "cheapest" month artificially.

**Fix**: Exclude any month where `today <= last day of month` (i.e., exclude current and future months).

#### 4.5.5 Average Electricity Rate

```
avgRate = sum(elecBills.unitPrice) / elecBillCount
```

This is statement-level — each bill's effective $/kWh averaged. (Alternatively, could be `totalElecSpend / totalKwh` across all bills for a weighted average; the weighted version is more accurate.)

**Recommendation**: Use weighted average:
```
avgRate = sum(elecBills.totalAmount) / sum(elecBills.usage)
```

### 4.6 "Monthly Spending" (bar chart)

**Data source**: `deriveMonthlySpend(bills)` — stacked bar: electricity, gas, water.

**Current month handling**: The bar for the current month will be short if the month is incomplete. This is acceptable for a chart (it's visually obvious), but we could add a visual indicator (dashed border, different opacity) to signal "in progress".

### 4.7 Electricity Usage, Rate, Charge Breakdown, Gas Seasonality (trend charts)

**Data source**: Statement-level — one data point per bill, plotted by `billingPeriodEnd` month.

No pro-rating needed here. Each data point represents one bill's actual values.

---

## 5. Edge Cases

### 5.1 Incomplete Current Month

**Problem**: The current calendar month has only partial billing data. Bills that end in or before the current month contribute partial pro-rated amounts. No bills exist yet for the remaining days.

**Where this matters**:
- Averages (Section 4.5) — artificially lowered
- Cheapest/most expensive (Section 4.5.4) — current month falsely appears cheapest
- Calendar month hero (Section 4.1) — shows misleadingly low total
- Monthly spending chart (Section 4.6) — short bar for current month

**Solution**:
1. **Averages & cheapest/most expensive**: Exclude the current calendar month entirely.
2. **Calendar month hero**: If anchor month = current month, show with a "month in progress" indicator and do NOT show delta vs. previous month (unfair comparison).
3. **Monthly spending chart**: Show current month bar with reduced opacity or dashed border.

### 5.2 First Month with Data

When there's only one month of data, some features degrade gracefully:
- No delta on any hero card (nothing to compare against)
- Averages section still shows, based on 1 month
- "Cheapest/most expensive" row hidden (need ≥ 2 completed months)

### 5.3 Bimonthly Water Bills

**Problem**: Water bills cover ~60 days. If we treat them as a single calendar month's data, they massively skew that month.

**Current solution**: Pro-rate by day overlap (same formula as everything else — Section 3.1). A 60-day water bill is split roughly 50/50 across two months.

**Display considerations**:
- Water hero card: Shows full bill amount (statement-level), with "bimonthly" badge and day count
- Per-utility status: Shows `~$X/mo` with `/mo` suffix and "bimonthly" badge — `totalAmount / billingDays × 30`
- Monthly spending chart: Pro-rated split — each month bar gets its fair share

**This approach is correct** and should be preserved. The key is that the raw bill stores the full amount, and normalization happens at display time.

### 5.4 PG&E Electricity and Gas: Different Billing Periods

A single PG&E PDF contains electricity and gas sections that may have slightly different billing periods (e.g., electricity Oct 14 – Nov 12, gas Oct 1 – Oct 31). These become two separate Bill records.

**How they're linked**: `storageRef` (same PDF) and `billingPeriodEnd` proximity (within 10 days).

**Display**: The PG&E hero card combines them into one "statement cycle" for a unified view.

### 5.5 Bills Straddling Month Boundaries

Most PG&E bills straddle month boundaries (e.g., Oct 14 – Nov 12). The pro-rating formula handles this correctly by allocating proportional amounts to each overlapping month.

### 5.6 Previous Balance / Payments

**Rule**: `totalAmount` in the Bill record always reflects **current period charges only**, never carried-over balances or payment history. This is enforced at the adapter layer:
- PG&E: `electricity.total` and `gas.total` (current charges)
- SJW: `charges.total` (current charges, not `totalAmountDue`)

If a user hasn't paid their previous bill, `totalAmountDue` on the PDF might be higher than `charges.total`, but we store only the current charges. This is correct for consumption analytics.

### 5.7 Zero-Amount Bills

Bills with `totalAmount <= 0` are filtered out during `mapBillToRows()`. This handles edge cases like credit-only statements.

### 5.8 Overlapping Bills (Duplicate Uploads)

Currently no de-duplication. If a user uploads the same PDF twice, two sets of Bill records are created. Future enhancement: detect duplicates by matching `provider + utilityType + billingPeriodStart + billingPeriodEnd` and reject or warn.

---

## 6. Proposed Fixes for Current Bugs

### 6.1 Fix: Exclude Current Month from Averages

In `app/page.tsx`, where we compute averages:

```
Current (wrong):
  monthCount = monthlySpend.length
  avgMonthly = ytdTotal / monthCount

Proposed (correct):
  completedMonths = monthlySpend.filter(m => isCompleteMonth(m))
  monthCount = completedMonths.length
  avgMonthly = sum(completedMonths) / monthCount
```

Where `isCompleteMonth(m)` returns `false` if the month is the current calendar month (or later).

### 6.2 Fix: Exclude Current Month from Cheapest/Most Expensive

Same filter — only consider completed months for min/max.

### 6.3 Fix: Per-Utility Status Should Use Statement-Level Data

The "per-utility status" rows should NOT use `cur` from `deriveMonthlySpend`. They should use the latest Bill of each type directly.

```
Current (wrong):
  electricity amount = cur.electricity  (pro-rated calendar month, maybe partial)
  gas amount = cur.gas

Proposed (correct):
  electricity amount = latestElecBill.totalAmount
  gas amount = latestGasBill.totalAmount
  electricity delta = (latestElecBill.totalAmount - prevElecBill.totalAmount) / prevElecBill.totalAmount
```

Water already does this correctly (uses `monthlyWaterAmount` from the latest water bill).

### 6.4 Fix: Calendar Month Hero — Incomplete Month Indicator

When `summaryAnchor.month === currentMonth && summaryAnchor.year === currentYear`:
- Add "in progress" badge
- Optionally hide delta (comparing incomplete month to complete month is misleading)
- Or show delta with a "partial" disclaimer

---

## 7. Assumptions & Decisions

### 7.1 We assume uniform daily consumption

Pro-rating `totalAmount` by days assumes the household consumed the same dollar amount every day of the billing period. In reality, heating costs vary with weather, electricity varies with AC usage, etc.

**Why this is acceptable**: We don't have daily meter data. Day-based pro-rating is the best approximation available and is standard practice in utility analytics.

### 7.2 Water usage is assumed uniform across the billing period

Same assumption as 7.1, applied to the ~60-day water billing period. The `~X CCF/mo` display is `totalUsage / billingDays × 30`.

### 7.3 We use current charges, not total amount due

`totalAmount` reflects consumption charges for the period, excluding previous balance or credits from prior periods. This ensures trends reflect actual consumption changes, not payment timing.

### 7.4 PG&E electricity and gas are treated as separate utilities

Even though they come from one PDF, they're stored and analyzed independently. The "PG&E hero card" is a display-layer grouping, not a data-layer concept.

### 7.5 A "month" in averages means a calendar month with data

If no bills overlap a given calendar month, that month simply doesn't appear in `deriveMonthlySpend`. It is NOT counted as a $0 month. This is correct — missing data is not the same as zero spend.

### 7.6 The "anchor month" for the utility summary is the latest bill's period-end month

This means the summary always refers to a month where we have at least some data. It does NOT necessarily mean the data is complete for that month.

---

## 8. Data Contracts (for testing)

### 8.1 Parser → Adapter Contract

```
Given: A successfully parsed PGEBill
Then:  toBills() returns exactly 2 Bill records (electricity + gas)
And:   Each Bill.totalAmount > 0
And:   Each Bill.totalAmount equals the current-period charges (no balance carryover)
And:   Each Bill.usage > 0
And:   Each Bill.unitPrice = totalAmount / usage (within rounding tolerance)
And:   Each Bill.charges[].amount sums to approximately totalAmount (within $0.05)

Given: A successfully parsed SJWBill
Then:  toBills() returns exactly 1 Bill record (water)
And:   Bill.totalAmount = SJWBill.charges.total (current charges, not totalAmountDue)
And:   Bill.usage = SJWBill.usageTotal
And:   Bill.unitPrice = charges.total / usageTotal
```

### 8.2 Calendar Month Normalization Contract

```
Given: A Bill with billingPeriodStart="2025-10-14", billingPeriodEnd="2025-11-12", totalAmount=$100
Then:  deriveMonthlySpend allocates:
  - October: $100 × 17/29 ≈ $58.62  (Oct 14–Oct 31 = 17 days out of 29 total)
  - November: $100 × 12/29 ≈ $41.38  (Nov 1–Nov 12 = 12 days)
And:   sum of all allocations ≈ $100 (within rounding tolerance)

Given: A water Bill with billingPeriodStart="2025-09-05", billingPeriodEnd="2025-11-03", totalAmount=$200
Then:  deriveMonthlySpend allocates across Sep, Oct, Nov proportionally
And:   sum of all allocations ≈ $200
```

### 8.3 Averages Contract

```
Given: Bills spanning Jun '25 through Feb '26 (9 completed months), and today is Mar 21, 2026
And:   Some bills also have partial overlap with Mar '26
Then:  avgMonthly should be computed over the 9 completed months (Jun–Feb)
And:   Mar '26 data should be EXCLUDED from the average
And:   cheapest/most expensive month should only consider Jun '25 – Feb '26

Given: Only 1 completed month of data
Then:  avgMonthly = that month's total
And:   cheapest/most expensive comparison is NOT shown (need ≥ 2 months)
```

### 8.4 Per-Utility Status Contract

```
Given: Latest electricity bill has totalAmount=$160, usage=555 kWh
And:   Previous electricity bill has totalAmount=$170, usage=580 kWh
Then:  Per-utility status shows:
  - Amount: $160.00 (NOT a pro-rated calendar month value)
  - Usage: 555 kWh
  - Delta: -5.9% (compared to previous bill, not previous calendar month)

Given: Latest water bill covers 59 days with totalAmount=$275.68
Then:  Per-utility status shows:
  - Amount: ~$140.18/mo (275.68 / 59 × 30)
  - Usage: ~X CCF/mo
  - Badge: "bimonthly"
```

### 8.5 PG&E Statement Cycle Contract

```
Given: An electricity Bill and a gas Bill with the same storageRef
Then:  pgeStatementCycles groups them into one cycle
And:   cycle.total = elec.totalAmount + gas.totalAmount
And:   cycle.kWh = elec.usage, cycle.therms = gas.usage

Given: An electricity Bill and a gas Bill without matching storageRef
But:   billingPeriodEnd dates within 10 days of each other
Then:  They're still grouped into one cycle
```

---

## 9. Summary of Immediate Fixes Needed

| # | Bug | Root Cause | Fix |
|---|-----|-----------|-----|
| 1 | Mar '26 shows as "cheapest month" at $39.50 | Current (incomplete) month included in min/max | Exclude months where `today < last day of month` |
| 2 | Per-utility electricity shows $18.56, gas shows $20.94 | Using pro-rated calendar-month `cur` which is partial March allocation | Use latest Bill's totalAmount directly |
| 3 | Per-utility percentages (92.3%, 88.6%) seem wrong | Computed as delta vs. partial pro-rated data | Compute delta vs. previous bill (statement-level) |
| 4 | Average monthly may be skewed | Includes partial current month in divisor | Exclude current month from average computation |

---

## 10. Future Considerations

- **Duplicate detection**: Prevent same bill uploaded twice
- **Manual entry for water**: Allow manual water bill entry (currently only PG&E manual entry exists)
- **Rate plan tracking**: Store which rate plan the household is on (E-1, E-TOU-C, etc.) for better benchmarking
- **Daily usage import**: If PG&E Green Button data becomes available, use actual daily usage instead of pro-rating
- **Multi-household water**: Handle households with shared water meters
- **Historical rate comparison**: Track rate changes over time per utility
