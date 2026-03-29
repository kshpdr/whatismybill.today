"use client";

import dynamic from "next/dynamic";

const CoverageMap = dynamic(() => import("@/app/components/CoverageMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[420px] bg-[var(--wm-surface)] border border-[var(--wm-border)] rounded-md animate-pulse" />
  ),
});

export default function CoverageMapClient() {
  return <CoverageMap />;
}
