"use client";

import dynamic from "next/dynamic";

const CoverageMap = dynamic(() => import("@/app/components/CoverageMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[420px] bg-[#0f0f0f] border border-[rgba(255,255,255,0.07)] rounded-md animate-pulse" />
  ),
});

export default function CoverageMapClient() {
  return <CoverageMap />;
}
