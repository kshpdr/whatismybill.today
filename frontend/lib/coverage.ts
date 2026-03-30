export type UtilityType = "electricity" | "gas" | "water";
export type GeoLevel = "state" | "county" | "city" | "zip";

export type CoverageRegion = {
  level: GeoLevel;
  id: string;
  // FIPS code for state/county (e.g. "06085")
  // slug for city (e.g. "san-jose")
  // string for zip (e.g. "95101")
  name: string;
  parentCountyFips?: string; // required when level is "city" or "zip"
  verified?: boolean; // personally tested end-to-end; unverified = same provider, may work
};

export type ProviderCoverage = {
  parserId: string; // matches key in PARSER_REGISTRY: "PGE", "SJW"
  name: string;
  utilities: UtilityType[];
  regions: CoverageRegion[];
};

// ---------------------------------------------------------------------------
// Coverage data
// Source: PG&E official service territory map (stable, published by CPUC)
// SJW: San Jose Water Company service area (Santa Clara County cities)
//
// verified: true  — personally tested, parsing confirmed end-to-end
// verified: false — same provider territory; parser should work, but untested
// ---------------------------------------------------------------------------

export const COVERAGE: ProviderCoverage[] = [
  {
    parserId: "PGE",
    name: "Pacific Gas & Electric",
    utilities: ["electricity", "gas"],
    regions: [
      // Northern California
      { level: "county", id: "06023", name: "Humboldt" },
      { level: "county", id: "06045", name: "Mendocino" },
      { level: "county", id: "06049", name: "Modoc" },
      { level: "county", id: "06093", name: "Siskiyou" },
      { level: "county", id: "06089", name: "Shasta" },
      { level: "county", id: "06063", name: "Plumas" },
      { level: "county", id: "06035", name: "Lassen" },
      { level: "county", id: "06105", name: "Trinity" },
      { level: "county", id: "06007", name: "Butte" },
      { level: "county", id: "06057", name: "Nevada" },
      { level: "county", id: "06061", name: "Placer" },
      { level: "county", id: "06115", name: "Yuba" },
      { level: "county", id: "06101", name: "Sutter" },
      { level: "county", id: "06103", name: "Tehama" },
      { level: "county", id: "06021", name: "Glenn" },
      { level: "county", id: "06011", name: "Colusa" },
      { level: "county", id: "06109", name: "Tuolumne" },
      { level: "county", id: "06091", name: "Sierra" },
      { level: "county", id: "06003", name: "Alpine" },
      // Bay Area
      { level: "county", id: "06001", name: "Alameda" },
      { level: "county", id: "06013", name: "Contra Costa" },
      { level: "county", id: "06041", name: "Marin" },
      { level: "county", id: "06055", name: "Napa" },
      { level: "county", id: "06075", name: "San Francisco" },
      { level: "county", id: "06081", name: "San Mateo" },
      { level: "county", id: "06085", name: "Santa Clara", verified: true },
      { level: "county", id: "06097", name: "Sonoma" },
      { level: "county", id: "06095", name: "Solano" },
      { level: "county", id: "06087", name: "Santa Cruz" },
      // Central Valley & Coast
      { level: "county", id: "06039", name: "Madera" },
      { level: "county", id: "06019", name: "Fresno" },
      { level: "county", id: "06029", name: "Kern" },
      { level: "county", id: "06031", name: "Kings" },
      { level: "county", id: "06047", name: "Merced" },
      { level: "county", id: "06099", name: "Stanislaus" },
      { level: "county", id: "06077", name: "San Joaquin" },
      { level: "county", id: "06005", name: "Amador" },
      { level: "county", id: "06009", name: "Calaveras" },
      { level: "county", id: "06017", name: "El Dorado" },
      { level: "county", id: "06067", name: "Sacramento" },
      { level: "county", id: "06113", name: "Yolo" },
      { level: "county", id: "06053", name: "Monterey" },
      { level: "county", id: "06079", name: "San Luis Obispo" },
      { level: "county", id: "06083", name: "Santa Barbara" },
      { level: "county", id: "06069", name: "San Benito" },
      { level: "county", id: "06043", name: "Mariposa" },
      { level: "county", id: "06051", name: "Mono" },
      { level: "county", id: "06033", name: "Lake" },
    ],
  },
  {
    parserId: "SJW",
    name: "San Jose Water",
    utilities: ["water"],
    regions: [
      { level: "city", id: "san-jose",     name: "San Jose",     parentCountyFips: "06085", verified: true },
      { level: "city", id: "campbell",     name: "Campbell",     parentCountyFips: "06085", verified: true },
      { level: "city", id: "los-gatos",    name: "Los Gatos",    parentCountyFips: "06085", verified: true },
      { level: "city", id: "monte-sereno", name: "Monte Sereno", parentCountyFips: "06085", verified: true },
      { level: "city", id: "saratoga",     name: "Saratoga",     parentCountyFips: "06085", verified: true },
      { level: "city", id: "cupertino",    name: "Cupertino",    parentCountyFips: "06085", verified: true },
    ],
  },
];

// ---------------------------------------------------------------------------
// Derived helpers for map rendering
// ---------------------------------------------------------------------------

export type CountyCoverageState = {
  fips: string;
  name: string;
  /** full = county-level region; partial = city/zip roll-up; none = no parser */
  coverage: "full" | "partial" | "none";
  /** true = at least one region in this county is personally verified */
  verified: boolean;
  utilities: UtilityType[];
  providers: { name: string; utilities: UtilityType[]; partial?: boolean; verified?: boolean }[];
};

/**
 * Derives per-county render state from COVERAGE data.
 * City-level regions roll up to their parentCountyFips as "partial".
 * A county is "verified" if any of its regions carry verified: true.
 */
export function buildCountyCoverage(): Map<string, CountyCoverageState> {
  const map = new Map<string, CountyCoverageState>();

  const ensureCounty = (fips: string, name: string) => {
    if (!map.has(fips)) {
      map.set(fips, { fips, name, coverage: "none", verified: false, utilities: [], providers: [] });
    }
    return map.get(fips)!;
  };

  for (const provider of COVERAGE) {
    for (const region of provider.regions) {
      const isVerified = region.verified === true;

      if (region.level === "county" || region.level === "state") {
        const county = ensureCounty(region.id, region.name);
        county.coverage = "full";
        if (isVerified) county.verified = true;
        for (const u of provider.utilities) {
          if (!county.utilities.includes(u)) county.utilities.push(u);
        }
        const existing = county.providers.find((p) => p.name === provider.name);
        if (existing) {
          for (const u of provider.utilities) {
            if (!existing.utilities.includes(u)) existing.utilities.push(u);
          }
          if (isVerified) existing.verified = true;
        } else {
          county.providers.push({ name: provider.name, utilities: provider.utilities, verified: isVerified });
        }
      } else if (region.level === "city" || region.level === "zip") {
        if (!region.parentCountyFips) continue;
        const county = ensureCounty(region.parentCountyFips, region.name.split(",")[0]);
        if (county.coverage !== "full") county.coverage = "partial";
        if (isVerified) county.verified = true;
        for (const u of provider.utilities) {
          if (!county.utilities.includes(u)) county.utilities.push(u);
        }
        const existing = county.providers.find((p) => p.name === provider.name);
        if (existing) {
          for (const u of provider.utilities) {
            if (!existing.utilities.includes(u)) existing.utilities.push(u);
          }
          existing.partial = true;
          if (isVerified) existing.verified = true;
        } else {
          county.providers.push({ name: provider.name, utilities: provider.utilities, partial: true, verified: isVerified });
        }
      }
    }
  }

  return map;
}
