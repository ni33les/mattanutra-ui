import type { MatcherConfig } from "@/lib/matcher/types";

export const MATCHER_VERSION = "importance-matching-3";
export const DOSE_FIT_VERSION = "dose-fit-1";
export const UPPER_LIMIT_EXTRA_WEIGHT = 2;

export const DEFAULT_MATCHER_CONFIG: MatcherConfig = {
  exactGroupLimit: 8,
  exactVariantLimit: 16,
  expansionBudget: 8_000,
  initialBeamWidth: 24,
  maxBeamWidth: 48,
  searchDeadlineMs: 2_500,
  usefulCoverageFloor: 90,
  version: MATCHER_VERSION
};

export const WEB_MATCHER_CONFIG: MatcherConfig = {
  ...DEFAULT_MATCHER_CONFIG,
  searchDeadlineMs: 400,
  skipPostMatchCompact: true
};

// Compatibility export: compact changes penalty weights, never the search policy.
export const WEB_COMPACT_MATCHER_CONFIG: MatcherConfig = WEB_MATCHER_CONFIG;

export const MATERIAL_COVERAGE_POINTS = 5;
export const MATERIAL_PRICE_MINOR = 1000;
export const MATERIAL_PILL_DELTA = 1;
export const COVERAGE_SCALE = 10_000;
export const COVERED_THRESHOLD = 100;
export const OVER_TARGET_THRESHOLD = 125;
