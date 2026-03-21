/**
 * Test script: parse all PG&E PDFs in ./bills/ and print a summary table.
 * Run: node --experimental-strip-types scripts/test-parser.mjs
 */

import { PDFParse } from "pdf-parse";
import { readFileSync, readdirSync } from "fs";
import { parsePGEText, isPGEBill, extractBillingHistory } from "../lib/parsers/pge.ts";

const BILLS_DIR = "./bills";
const files = readdirSync(BILLS_DIR)
  .filter((f) => f.endsWith(".pdf"))
  .sort();

let passed = 0;
let failed = 0;

for (const file of files) {
  const buf = readFileSync(`${BILLS_DIR}/${file}`);
  const parser = new PDFParse({ data: buf, verbosity: 0 });
  const { text } = await parser.getText({});

  if (!isPGEBill(text)) {
    // Detect garbled CrawfordTech encoding (same heuristic as parseBillPDF)
    const sample = text.slice(0, 500).replace(/\s/g, "");
    const letters = (sample.match(/[a-zA-Z]/g) ?? []).length;
    const isGarbled = sample.length > 20 && letters / sample.length < 0.25;
    console.log(
      `\n⚠  ENCODING ERROR  ${file.slice(0, 8)}… — ${isGarbled ? "private font encoding (CrawfordTech archive) → show manual entry form" : "unknown format"}`
    );
    continue;
  }

  let bill;
  try {
    bill = parsePGEText(text);
  } catch (err) {
    console.error(`\n✗  ERROR  ${file.slice(0, 8)}…`, err);
    failed++;
    continue;
  }

  const ok = (val, label) => {
    if (!val) {
      console.warn(`    ✗ MISSING: ${label}`);
      return false;
    }
    return true;
  };

  const checks = [
    ok(bill.accountNumber, "accountNumber"),
    ok(bill.statementDate, "statementDate"),
    ok(bill.customerName, "customerName"),
    ok(bill.summary.totalAmountDue, "summary.totalAmountDue"),
    ok(bill.electricity.usageTotal, "electricity.usageTotal"),
    ok(bill.electricity.delivery.total, "electricity.delivery.total"),
    ok(bill.electricity.generation.total, "electricity.generation.total"),
    ok(bill.electricity.periodStart, "electricity.periodStart"),
    ok(bill.gas.usageTotal, "gas.usageTotal"),
    ok(bill.gas.total, "gas.total"),
    ok(bill.gas.periodStart, "gas.periodStart"),
  ];

  const allOk = checks.every(Boolean);
  if (allOk) passed++;
  else failed++;

  const e = bill.electricity;
  const g = bill.gas;

  console.log(`
${"─".repeat(72)}
${allOk ? "✓" : "✗"}  ${file.slice(0, 8)}…  [${bill.statementDate}]
   Account:       ${bill.accountNumber}
   Customer:      ${bill.customerName}
   Address:       ${bill.serviceAddress}

   SUMMARY
     electricDelivery:    $${bill.summary.electricDelivery.toFixed(2)}
     electricAdjustments: $${bill.summary.electricAdjustments.toFixed(2)}
     electricGeneration:  $${bill.summary.electricGeneration.toFixed(2)}
     gas:                 $${bill.summary.gas.toFixed(2)}
     currentCharges:      $${bill.summary.currentCharges.toFixed(2)}
     totalAmountDue:      $${bill.summary.totalAmountDue.toFixed(2)}
     balanceForward:      $${(bill.summary.balanceForward ?? 0).toFixed(2)}

   ELECTRICITY  ${e.periodStart} → ${e.periodEnd}  (${e.billingDays} days)
     usage:        ${e.usageTotal.toFixed(3)} kWh
     delivery:     $${e.delivery.total.toFixed(2)}
     generation:   $${e.generation.total.toFixed(2)}
     adjustments:  $${e.adjustments.toFixed(2)}
     total:        $${e.total.toFixed(2)}
     $/kWh:        $${e.effectiveUnitPrice.toFixed(5)}
     lineItems(${e.delivery.lineItems.length}): ${e.delivery.lineItems.map((li) => `${li.label}=$${li.amount}`).join(", ") || "(none)"}

   GAS          ${g.periodStart} → ${g.periodEnd}  (${g.billingDays} days)
     usage:        ${g.usageTotal.toFixed(3)} Therms
     total:        $${g.total.toFixed(2)}
     $/Therm:      $${g.effectiveUnitPrice.toFixed(5)}
     lineItems(${g.lineItems.length}): ${g.lineItems.map((li) => `${li.label}=$${li.amount}`).join(", ") || "(none)"}
     segments(${(g.segments ?? []).length}): ${(g.segments ?? []).map((s) => `[${s.periodStart}→${s.periodEnd} T1=${s.tier1Usage ?? 0}Thm T2=${s.tier2Usage ?? 0}Thm sub=$${s.subtotal}]`).join(", ") || "(none)"}

   monthlySpend:  $${bill.monthlySpend.toFixed(2)}
   flags:         [${bill.flags.join(", ") || "none"}]
   history(${(bill.billingHistory ?? []).length}): ${(bill.billingHistory ?? []).map((h) => `${h.statementDate} elec=$${h.electricTotal} gas=$${h.gasTotal}`).join(" | ")}`);
}

console.log(`\n${"═".repeat(72)}`);
console.log(`Results: ${passed} passed, ${failed} failed (${files.length} total PDFs)`);
