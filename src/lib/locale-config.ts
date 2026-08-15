/**
 * Default location lookup for onboarding address forms.
 *
 * Structured as a lookup keyed by a "region key" so it can be swapped for a
 * backend-driven source (e.g. an app_config row or a regions table) later
 * without touching the UI: replace `lookupRegionDefaults` with a fetch.
 */
export type RegionDefaults = {
  key: string;
  city: string;
  state: string;
  country: string;
  pincodePrefix: string;
};

const REGIONS: Record<string, RegionDefaults> = {
  latur: {
    key: "latur",
    city: "Latur",
    state: "Maharashtra",
    country: "India",
    pincodePrefix: "413",
  },
};

export const DEFAULT_REGION_KEY = "latur";

export function lookupRegionDefaults(key: string = DEFAULT_REGION_KEY): RegionDefaults {
  return REGIONS[key] ?? REGIONS[DEFAULT_REGION_KEY]!;
}
