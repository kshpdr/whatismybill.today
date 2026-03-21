# Bill Parser Architecture

## Overview

The parser turns a PG&E PDF bill into structured data that the dashboard can consume. It runs server-side only (Node.js) and is completely decoupled from the UI.

```
PDF upload
    │
    ▼
parseBillPDF(buffer)          lib/parsers/index.ts
    │
    ├─ pdf-parse extracts text
    │
    ├─ isGarbledEncoding?
    │     yes → OCR fallback (pdftoppm + tesseract)   lib/parsers/ocr.ts
    │     no  → continue with text
    │
    ├─ isPGEBill? → parsePGEText(text)               lib/parsers/pge.ts
    │
    └─ returns ParseBillResult
          .success = true  → .bill (PGEBill)
          .encodingError   → show manual entry form
          .ocrFallback     → bill is valid, flag for UI

pgeToBills(pge, meta)         lib/parsers/adapter.ts
    │
    ├─ pgeToElectricityBill()
    └─ pgeToGasBill()
          │
          └─ returns [Bill, Bill]  (app data model)
```

---

## Schema: PGEBill (parser output)

One PDF → one `PGEBill`. Contains electricity **and** gas — PG&E bills both on the same statement.

```
PGEBill
 ├── provider, accountNumber, statementDate, dueDate
 ├── customerName, serviceAddress
 ├── summary
 │    ├── electricDelivery       "Current PG&E Electric Delivery Charges"
 │    ├── electricAdjustments    Climate Credit (0 or negative)
 │    ├── electricGeneration     "San Jose Clean Energy" charges
 │    ├── gas                    "Current Gas Charges"
 │    ├── currentCharges         charges for this period only (≠ totalAmountDue if past-due)
 │    ├── totalAmountDue         includes any carried-over balance
 │    ├── previousBalance?
 │    ├── paymentsReceived?
 │    └── balanceForward?
 │
 ├── electricity
 │    ├── periodStart/End, billingDays
 │    ├── usageTotal (kWh), usageUnit
 │    ├── delivery.total, delivery.lineItems   (from breakdown page)
 │    ├── generation.total, generation.lineItems
 │    ├── adjustments
 │    ├── total                  delivery + adjustments + generation (net)
 │    └── effectiveUnitPrice     $/kWh
 │
 ├── gas
 │    ├── periodStart/End, billingDays
 │    ├── usageTotal (Therms), usageUnit
 │    ├── lineItems              aggregated across all segments
 │    ├── segments?[]            per-sub-period detail (multi-month gas periods)
 │    ├── total
 │    └── effectiveUnitPrice     $/Therm
 │
 ├── monthlySpend               = currentCharges (excludes past-due carry)
 ├── billingHistory?[]          last 7 months from PG&E's history table
 └── flags[]                    validation warnings (see below)
```

---

## Schema: Bill (app data model)

One `Bill` = one utility type for one period. Stored in Firestore. Used by the dashboard.

```
Bill
 ├── id, householdId
 ├── provider               "PG&E"
 ├── utilityType            "electricity" | "gas" | "water"
 ├── billingPeriodStart/End ISO date
 ├── totalAmount            $ for this utility this period
 ├── usage                  kWh | Therms | CCF
 ├── usageUnit              "kWh" | "Therms" | "CCF"
 ├── unitPrice              $/unit (effective)
 ├── charges[]              { label, amount } — pie chart data
 ├── storageRef             Firebase Storage path to original PDF
 ├── uploadedBy?            uid
 ├── parseStatus            "success" | "failed" | "encoding_error"
 └── uploadedAt             ISO timestamp
```

---

## Adapter: PGEBill → Bill[]

```
1 PGEBill  →  2 Bill records

  electricity Bill:
    utilityType       = "electricity"
    billingPeriodStart = pge.electricity.periodStart
    totalAmount       = pge.electricity.total
    usage             = pge.electricity.usageTotal
    usageUnit         = "kWh"
    unitPrice         = pge.electricity.effectiveUnitPrice
    charges           = [
      Generation (SJCE)        ← electricity.generation.total
      Credits & Adjustments    ← electricity.adjustments  (if ≠ 0)
      Delivery & Infrastructure ← delivery line items, grouped
      Public Purpose Programs  ← delivery line items, grouped
      Taxes & Fees             ← delivery line items, grouped
    ]

  gas Bill:
    utilityType       = "gas"
    billingPeriodStart = pge.gas.periodStart
    totalAmount       = pge.gas.total
    usage             = pge.gas.usageTotal
    usageUnit         = "Therms"
    unitPrice         = pge.gas.effectiveUnitPrice
    charges           = [
      Gas Commodity   ← tier 1/2 usage line items
      Programs        ← PPP surcharge
      Taxes & Fees    ← utility users' tax, franchise
    ]
```

**Usage:**
```typescript
import { pgeToBills } from "@/lib/parsers/adapter";

const [elecBill, gasBill] = pgeToBills(pge, {
  householdId: "hh-123",
  storageRef:  "households/hh-123/bills/2025-10.pdf",
  uploadedBy:  user.uid,
});
// → store both in Firestore
```

---

## Dashboard data flow

```
Firestore bills collection
    │
    ▼
GET /api/bills?householdId=…          (backend — your separate API)
    │
    ▼
useBills(householdId)                 lib/use-bills.ts
    │
    ├── deriveMonthlySpend(bills)     → stacked bar chart data
    ├── deriveElecMonthly(bills)      → electricity trend chart
    └── deriveGasMonthly(bills)       → gas trend chart
```

Each `Bill` in Firestore feeds directly into these derive functions — no further transformation needed.

---

## Validation flags

Flags are set by the parser when values look inconsistent. A bill can still be used even if flagged — treat them as warnings, not errors.

| Flag | Meaning |
|------|---------|
| `missing_account` | Account number not found |
| `missing_dates` | Statement/due date missing |
| `missing_electricity` | Electric section didn't parse |
| `missing_gas` | Gas section didn't parse |
| `missing_generation` | SJCE generation charges not found |
| `partial_bill` | Billing period dates missing from detail page |
| `usage_mismatch` | kWh or Therms from two sources don't match |
| `gas_segment_mismatch` | Sum of gas segment subtotals ≠ gas.total |
| `manual_entry` | Bill was entered manually, not parsed |

---

## Manual entry fallback

When `ParseBillResult.encodingError = true` (garbled CrawfordTech PDFs), show the manual entry form. The user fills in `ManualBillEntry` fields, and:

```typescript
import { manualEntryToPGEBill } from "@/lib/parsers/manual";
import { pgeToBills } from "@/lib/parsers/adapter";

const pge  = manualEntryToPGEBill(formData);
const bills = pgeToBills(pge, meta);
// → store same as parsed bills
```

Manual bills are tagged with the `manual_entry` flag and have no `charges` detail beyond the top-level totals.

---

## File map

```
lib/
 ├── types.ts                  Bill, BillInput, LineCharge (app data model)
 └── parsers/
      ├── types.ts             PGEBill, ParseBillResult, ManualBillEntry
      ├── index.ts             parseBillPDF(buffer) — entry point, server-only
      ├── pge.ts               parsePGEText(text) — regex parser
      ├── ocr.ts               extractTextViaOCR(buffer) — pdftoppm + tesseract
      ├── manual.ts            manualEntryToPGEBill(entry)
      └── adapter.ts           pgeToBills(pge, meta) — safe to import anywhere
```
