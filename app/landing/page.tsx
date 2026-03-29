import CoverageMapClient from "@/app/components/CoverageMapClient";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#0a0a0a] text-[rgba(255,255,255,0.90)]">
      <div className="max-w-4xl mx-auto px-6 py-16 space-y-16">

        {/* Hero */}
        <section className="space-y-4">
          <h1 className="text-2xl font-semibold tracking-tight">
            whatismybill.today
          </h1>
          <p className="text-[rgba(255,255,255,0.55)] text-sm max-w-lg">
            Upload your utility bills. We parse them automatically and show you
            exactly what you&apos;re paying for — broken down by charge,
            compared month over month.
          </p>
          <div className="flex gap-2 pt-2">
            <a
              href="/signup"
              className="bg-[#e8a838] hover:bg-[#d4993a] text-black font-semibold text-sm rounded-md px-4 py-2 transition-colors duration-150"
            >
              Get started
            </a>
            <a
              href="/demo"
              className="border border-[rgba(255,255,255,0.07)] hover:bg-[#1a1a1a] text-[rgba(255,255,255,0.55)] text-sm rounded-md px-4 py-2 transition-colors duration-150"
            >
              View demo
            </a>
          </div>
        </section>

        {/* Coverage Map */}
        <section className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[rgba(255,255,255,0.30)] mb-1">
              Coverage
            </p>
            <h2 className="text-base text-[rgba(255,255,255,0.90)]">
              Supported regions
            </h2>
            <p className="text-sm text-[rgba(255,255,255,0.55)] mt-1">
              Automatic parsing is available where we have a provider-specific
              parser. More regions ship as we add parsers.
            </p>
          </div>

          <CoverageMapClient />

          <div className="bg-[#141414] border border-[rgba(255,255,255,0.07)] rounded-md p-4 space-y-2">
            <p className="text-xs text-[rgba(255,255,255,0.40)]">
              Verified regions are counties I&apos;ve personally tested end-to-end.
              &ldquo;Might work&rdquo; regions share the same provider — the parser should handle them,
              but I haven&apos;t confirmed it myself. If your county falls in either category,
              give it a try and let me know how it goes.
            </p>
            <p className="text-xs text-[rgba(255,255,255,0.25)]">
              Don&apos;t see your provider?{" "}
              <a
                href="mailto:hello@whatismybill.today"
                className="text-[#e8a838] hover:underline"
              >
                Request coverage
              </a>{" "}
              — manual entry is always available regardless of location.
            </p>
          </div>
        </section>

      </div>
    </main>
  );
}
