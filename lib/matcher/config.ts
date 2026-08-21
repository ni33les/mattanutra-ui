import type { MatcherConfig } from "@/lib/matcher/types";

export const MATCHER_VERSION = "pareto-hybrid-1";

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

export const MATERIAL_COVERAGE_POINTS = 5;
export const MATERIAL_PRICE_MINOR = 1000;
export const MATERIAL_PILL_DELTA = 1;
export const COVERAGE_SCALE = 10_000;
export const COVERED_THRESHOLD = 90;
export const OVER_TARGET_THRESHOLD = 125;
