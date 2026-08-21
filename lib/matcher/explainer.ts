import { createHash } from "node:crypto";
import { COVERAGE_SCALE } from "@/lib/matcher/config";
import type { ScoredBasket } from "@/lib/matcher/types";

export function publicCoveragePercent(basket: ScoredBasket | null) {
  if (!basket) {
    return 0;
  }

  return Math.round(basket.aggregateCoverage / (COVERAGE_SCALE / 100));
}

export function optionIdFor(productIds: readonly string[]) {
  return `opt_${createHash("sha256")
    .update([...productIds].sort().join("|"))
    .digest("hex")
    .slice(0, 16)}`;
}
