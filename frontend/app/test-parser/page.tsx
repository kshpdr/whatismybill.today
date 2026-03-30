"use client";

import { useState, useRef } from "react";

// ─── Types (minimal mirror of ParseBillResult) ────────────────────────────────

type ParseResult =
  | { success: true; bill: Record<string, unknown>; bills: unknown[]; ocrFallback?: boolean }
  | { success: false; encodingError: true; error?: string }
  | { success: false; encodingError?: false; error: string };

// ─── JSON renderer ────────────────────────────────────────────────────────────

function JsonValue({ val, depth = 0 }: { val: unknown; depth?: number }) {
  const [open, setOpen] = useState(depth < 2);

  if (val === null || val === undefined)
    return <span className="text-slate-400">null</span>;
  if (typeof val === "boolean")
    return <span className="text-purple-400">{String(val)}</span>;
  if (typeof val === "number")
    return <span className="text-sky-300">{val}</span>;
  if (typeof val === "string")
    return <span className="text-emerald-300">"{val}"</span>;

  if (Array.isArray(val)) {
    if (val.length === 0) return <span className="text-slate-400">[]</span>;
    return (
      <span>
        <button
          onClick={() => setOpen((o) => !o)}
          className="text-amber-400 hover:underline font-mono text-xs"
        >
          {open ? "▾" : "▸"} [{val.length}]
        </button>
        {open && (
          <div className="ml-4 border-l border-slate-700 pl-3">
            {val.map((item, i) => (
              <div key={i} className="my-0.5">
                <span className="text-slate-500 text-xs">{i}: </span>
                <JsonValue val={item} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </span>
    );
  }

  if (typeof val === "object") {
    const entries = Object.entries(val as Record<string, unknown>);
    if (entries.length === 0) return <span className="text-slate-400">{"{}"}</span>;
    return (
      <span>
        <button
          onClick={() => setOpen((o) => !o)}
          className="text-amber-400 hover:underline font-mono text-xs"
        >
          {open ? "▾" : "▸"} {"{"}…{"}"}
        </button>
        {open && (
          <div className="ml-4 border-l border-slate-700 pl-3">
            {entries.map(([k, v]) => (
              <div key={k} className="my-0.5 flex gap-1.5 flex-wrap">
                <span className="text-rose-300 shrink-0">{k}:</span>
                <JsonValue val={v} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </span>
    );
  }

  return <span className="text-slate-300">{String(val)}</span>;
}

// ─── Summary cards ────────────────────────────────────────────────────────────

function BillSummary({ bill }: { bill: Record<string, unknown> }) {
  const s = bill.summary as Record<string, number> | undefined;
  const e = bill.electricity as Record<string, unknown> | undefined;
  const g = bill.gas as Record<string, unknown> | undefined;
  const flags = bill.flags as string[] | undefined;

  const card = (label: string, value: string, sub?: string) => (
    <div className="bg-slate-800 rounded-lg p-3 text-center">
      <div className="text-slate-400 text-xs mb-1">{label}</div>
      <div className="text-white font-bold text-lg tabular-nums">{value}</div>
      {sub && <div className="text-slate-500 text-xs mt-0.5">{sub}</div>}
    </div>
  );

  const fmt$ = (n: unknown) =>
    typeof n === "number" ? `$${n.toFixed(2)}` : "—";

  return (
    <div className="space-y-4">
      {flags && flags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {flags.map((f) => (
            <span
              key={f}
              className={`text-xs font-mono px-2 py-0.5 rounded-full ${
                f === "manual_entry"
                  ? "bg-slate-700 text-slate-300"
                  : f.startsWith("missing") || f.startsWith("partial")
                  ? "bg-red-900/60 text-red-300"
                  : "bg-amber-900/60 text-amber-300"
              }`}
            >
              {f}
            </span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {card("Total Due", fmt$(s?.totalAmountDue))}
        {card("Current Charges", fmt$(s?.currentCharges))}
        {card(
          "Electricity",
          fmt$(
            typeof s?.electricDelivery === "number" &&
              typeof s?.electricGeneration === "number"
              ? s.electricDelivery + s.electricGeneration + (s.electricAdjustments ?? 0)
              : undefined
          )
        )}
        {card("Gas", fmt$(s?.gas))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {card(
          "Electric kWh",
          typeof (e as Record<string, unknown>)?.delivery === "object"
            ? `${
                ((e as Record<string, unknown>)?.delivery as Record<string, unknown>)?.usageKwh ?? "—"
              } kWh`
            : "—"
        )}
        {card(
          "Gas Therms",
          typeof (g as Record<string, unknown>)?.usageTherms === "number"
            ? `${(g as Record<string, unknown>)?.usageTherms} Th`
            : "—"
        )}
        {card("Statement", String(bill.statementDate ?? "—"))}
        {card("Due Date", String(bill.dueDate ?? "—"))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TestParserPage() {
  const [result, setResult] = useState<ParseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [tab, setTab] = useState<"summary" | "raw" | "bills" | "text">("summary");
  const [rawText, setRawText] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setFileName(file.name);
    setLoading(true);
            setResult(null);
            setRawText(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/parse-bill", { method: "POST", body: form });
      const json = await res.json();
      setResult(json);
      setRawText(json.rawText ?? null);
    } catch (err) {
      setResult({ success: false, error: String(err) });
    } finally {
      setLoading(false);
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file?.type === "application/pdf") handleFile(file);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 font-sans">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Parser Test</h1>
          <p className="text-slate-400 text-sm mt-1">
            Upload a PG&E bill PDF to inspect the parsed output.
          </p>
        </div>

        {/* Drop zone */}
        <div
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-slate-700 hover:border-slate-500 rounded-xl p-10 text-center cursor-pointer transition-colors"
        >
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={onInputChange}
          />
          {loading ? (
            <p className="text-slate-400 animate-pulse">Parsing…</p>
          ) : (
            <>
              <p className="text-slate-300 font-medium">
                Drop a PDF here or click to browse
              </p>
              {fileName && (
                <p className="text-slate-500 text-sm mt-1">{fileName}</p>
              )}
            </>
          )}
        </div>

        {/* Result */}
        {result && (
          <div className="space-y-4">
            {/* Status badge */}
            {result.success ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                <span className="text-emerald-400 font-semibold text-sm">Parsed successfully</span>
                {result.ocrFallback && (
                  <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-violet-900/60 text-violet-300 border border-violet-700">
                    OCR fallback — pdftoppm + Tesseract
                  </span>
                )}
              </div>
            ) : result.encodingError ? (
              <div className="bg-amber-900/30 border border-amber-700 rounded-lg p-4">
                <p className="text-amber-300 font-semibold">Encoding error — garbled PDF</p>
                <p className="text-amber-400/80 text-sm mt-1">
                  This PDF uses a private font encoding (CrawfordTech). Use the manual entry form instead.
                </p>
              </div>
            ) : (
              <div className="bg-red-900/30 border border-red-700 rounded-lg p-4">
                <p className="text-red-300 font-semibold">Parse failed</p>
                <p className="text-red-400/80 text-sm mt-1 font-mono">{result.error}</p>
              </div>
            )}

            {/* Tabs */}
            {result.success && (
              <>
                <div className="flex gap-1 border-b border-slate-800">
                  {([
                    ["summary", "Summary"],
                    ["raw", "Raw PGEBill"],
                    ["bills", "App Bills"],
                    ...(rawText ? [["text", result.ocrFallback ? "OCR Text" : "Extracted Text"]] : []),
                  ] as [string, string][]).map(([t, label]) => (
                    <button
                      key={t}
                      onClick={() => setTab(t as typeof tab)}
                      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                        tab === t
                          ? "border-sky-500 text-sky-400"
                          : "border-transparent text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {tab === "summary" ? (
                  <BillSummary bill={result.bill} />
                ) : tab === "raw" ? (
                  <div className="bg-slate-900 rounded-xl p-4 overflow-x-auto text-xs font-mono leading-relaxed">
                    <JsonValue val={result.bill} depth={0} />
                  </div>
                ) : tab === "bills" ? (
                  <div className="space-y-4">
                    <p className="text-slate-500 text-xs">
                      Adapted <code className="text-sky-400">Bill[]</code> records — ready to store in Firestore.
                      One PGEBill → two Bills (electricity + gas).
                    </p>
                    {(result.bills ?? []).map((b, i) => (
                      <div key={i} className="bg-slate-900 rounded-xl p-4 overflow-x-auto text-xs font-mono leading-relaxed">
                        <JsonValue val={b} depth={0} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <pre className="bg-slate-900 rounded-xl p-4 overflow-x-auto text-xs font-mono leading-relaxed text-slate-300 whitespace-pre-wrap">
                    {rawText}
                  </pre>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
