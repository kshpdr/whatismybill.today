"use client";

import { useState, useCallback } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { TransformWrapper, TransformComponent, useTransformContext } from "react-zoom-pan-pinch";
import { buildCountyCoverage, type CountyCoverageState, type UtilityType } from "@/lib/coverage";

const US_COUNTIES_TOPO_URL =
  "https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json";

const UTILITY_COLORS: Record<UtilityType, string> = {
  electricity: "#d4993a",
  gas:         "#6892b0",
  water:       "#47998e",
};

const UTILITY_LABELS: Record<UtilityType, string> = {
  electricity: "Electricity",
  gas:         "Gas",
  water:       "Water",
};

const countyCoverage = buildCountyCoverage();

function getPrimaryColor(utilities: UtilityType[]): string {
  if (utilities.includes("electricity")) return UTILITY_COLORS.electricity;
  if (utilities.includes("gas"))         return UTILITY_COLORS.gas;
  if (utilities.length > 0)             return UTILITY_COLORS[utilities[0]];
  return "#ffffff";
}

function getFill(state: CountyCoverageState | undefined): string {
  if (!state || state.coverage === "none") return "rgba(255,255,255,0.03)";
  const color = getPrimaryColor(state.utilities);
  // verified → solid; might work (unverified) → faint
  return state.verified ? color + "99" : color + "22";
}

function getHoverFill(state: CountyCoverageState | undefined): string {
  if (!state || state.coverage === "none") return "rgba(255,255,255,0.07)";
  const color = getPrimaryColor(state.utilities);
  return state.verified ? color + "bb" : color + "44";
}

type TooltipState = {
  x: number;
  y: number;
  county: CountyCoverageState;
} | null;

export default function CoverageMap() {
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const [hoveredFips, setHoveredFips] = useState<string | null>(null);

  const handleMoveByFips = useCallback(
    (fips: string, geoName: string, evt: React.MouseEvent) => {
      const state = countyCoverage.get(fips) ?? {
        fips,
        name: geoName,
        coverage: "none" as const,
        verified: false,
        utilities: [],
        providers: [],
      };
      setHoveredFips(fips);
      setTooltip({ x: evt.clientX, y: evt.clientY, county: state });
    },
    []
  );

  const handleLeave = useCallback(() => {
    setHoveredFips(null);
    setTooltip(null);
  }, []);

  return (
    <div className="relative w-full">
      {/* Map */}
      <div className="w-full bg-[#0f0f0f] border border-[rgba(255,255,255,0.07)] rounded-md overflow-hidden">
        <TransformWrapper
          minScale={1}
          maxScale={12}
          wheel={{ step: 0.08 }}
          doubleClick={{ step: 0.7 }}
          panning={{ velocityDisabled: true }}
        >
          <TransformComponent
            wrapperStyle={{ width: "100%", display: "block" }}
            contentStyle={{ width: "100%", display: "block" }}
          >
            <ScaledMap
              hoveredFips={hoveredFips}
              onMove={handleMoveByFips}
              onLeave={handleLeave}
            />
          </TransformComponent>
        </TransformWrapper>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-5 gap-y-2 mt-3">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block w-2.5 h-2.5 rounded-sm"
            style={{ backgroundColor: UTILITY_COLORS.electricity + "99" }}
          />
          <span className="text-xs text-[rgba(255,255,255,0.55)]">Verified</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block w-2.5 h-2.5 rounded-sm"
            style={{ backgroundColor: UTILITY_COLORS.electricity + "22", border: "1px solid rgba(255,255,255,0.08)" }}
          />
          <span className="text-xs text-[rgba(255,255,255,0.55)]">Might work</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)]" />
          <span className="text-xs text-[rgba(255,255,255,0.55)]">No parser</span>
        </div>
        <div className="ml-auto flex gap-x-3">
          {(Object.entries(UTILITY_COLORS) as [UtilityType, string][]).map(([util, color]) => (
            <div key={util} className="flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-xs text-[rgba(255,255,255,0.30)]">{UTILITY_LABELS[util]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && <CountyTooltip tooltip={tooltip} />}
    </div>
  );
}

function ScaledMap({
  hoveredFips,
  onMove,
  onLeave,
}: {
  hoveredFips: string | null;
  onMove: (fips: string, name: string, evt: React.MouseEvent) => void;
  onLeave: () => void;
}) {
  const { transformState } = useTransformContext();
  const strokeWidth = 0.5 / transformState.scale;

  return (
    <ComposableMap
      projection="geoMercator"
      projectionConfig={{ scale: 2200, center: [-119.5, 37.4] }}
      style={{ width: "100%", height: "auto" }}
      viewBox="0 0 800 560"
    >
      <Geographies geography={US_COUNTIES_TOPO_URL}>
        {({ geographies }) =>
          geographies
            .filter((geo) => geo.id.toString().padStart(5, "0").startsWith("06"))
            .map((geo) => {
              const fips = geo.id.toString().padStart(5, "0");
              const state = countyCoverage.get(fips);
              const fill = getFill(state);
              const hoverFill = getHoverFill(state);

              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={fill}
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth={strokeWidth}
                  style={{
                    default: { fill, outline: "none" },
                    hover:   { fill: hoverFill, outline: "none", cursor: "default" },
                    pressed: { outline: "none" },
                  }}
                  onMouseMove={(evt) =>
                    onMove(fips, geo.properties.name as string, evt)
                  }
                  onMouseLeave={onLeave}
                />
              );
            })
        }
      </Geographies>
    </ComposableMap>
  );
}

function CountyTooltip({ tooltip }: { tooltip: NonNullable<TooltipState> }) {
  const { x, y, county } = tooltip;

  return (
    <div
      className="fixed z-50 pointer-events-none"
      style={{ left: x + 14, top: y - 10 }}
    >
      <div className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.12)] rounded-md p-3 min-w-[190px]">
        <div className="flex items-center justify-between gap-3 mb-2">
          <span className="text-sm text-[rgba(255,255,255,0.90)]">
            {county.name} County
          </span>
          {county.coverage !== "none" && (
            <span
              className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={
                county.verified
                  ? { color: "#4ade80", backgroundColor: "rgba(74,222,128,0.10)" }
                  : { color: "rgba(255,255,255,0.40)", backgroundColor: "rgba(255,255,255,0.06)" }
              }
            >
              {county.verified ? "Verified" : "Might work"}
            </span>
          )}
        </div>

        {county.coverage === "none" ? (
          <div className="text-xs text-[rgba(255,255,255,0.30)]">No parser available</div>
        ) : (
          <div className="space-y-2">
            {county.providers.map((p) => (
              <div key={p.name}>
                <div className="text-xs text-[rgba(255,255,255,0.40)] mb-1">
                  {p.name}
                  {p.partial && (
                    <span className="ml-1 text-[rgba(255,255,255,0.25)]">(cities only)</span>
                  )}
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {p.utilities.map((u) => (
                    <span
                      key={u}
                      className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md"
                      style={{
                        color:           UTILITY_COLORS[u],
                        backgroundColor: UTILITY_COLORS[u] + "22",
                      }}
                    >
                      {u}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
