import { compileGroups, groupsBySeller } from "@/lib/matcher/candidates";
import { DEFAULT_MATCHER_CONFIG } from "@/lib/matcher/config";
import { aggregateDailyExposure, isDoseError } from "@/lib/matcher/dose";
import { evaluateSafety } from "@/lib/matcher/safety";
import { searchGroups } from "@/lib/matcher/search";
import { scoreState, selectOptions } from "@/lib/matcher/selector";
import type {
  CanonicalRequest,
  CatalogSnapshot,
  MatchResult,
  MatcherConfig,
  MatcherLeftover,
  ScoredBasket
} from "@/lib/matcher/types";

function leftoversFor(
  request: CanonicalRequest,
  selected: ScoredBasket | null
): MatcherLeftover[] {
  const leftovers: MatcherLeftover[] = [...request.leftovers];
  const seen = new Set(leftovers.map((item) => `${item.reason}:${item.name}`));

  const push = (item: MatcherLeftover) => {
    const key = `${item.reason}:${item.name}`;

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    leftovers.push(item);
  };

  for (const target of request.targets) {
    const coverage = selected?.coverageBySubject.get(target.subjectId) ?? 0;
    const percent = Math.round(coverage / 100);

    if (!selected || percent <= 0) {
      push({
        amount: target.requestedAmount,
        name: target.name,
        reason: "uncovered",
        severity: "high",
        subjectId: target.subjectId,
        unit: target.requestedUnit
      });
    } else if (percent < 90) {
      push({
        amount: target.requestedAmount,
        name: target.name,
        note: `covered ${percent}%`,
        reason: "dose_gap",
        severity: "medium",
        subjectId: target.subjectId,
        unit: target.requestedUnit
      });
    }
  }

  return leftovers;
}

export function match(
  request: CanonicalRequest,
  catalog: CatalogSnapshot,
  config: MatcherConfig = DEFAULT_MATCHER_CONFIG
): MatchResult {
  const baselineExposure = aggregateDailyExposure({
    current: request.currentSupplements,
    variants: []
  });

  if (!isDoseError(baselineExposure)) {
    const baseline = evaluateSafety({
      exposure: baselineExposure,
      products: catalog.products,
      request,
      variants: []
    });

    if (baseline.hardBlocked && request.selectorMode === "agentic") {
      return {
        alternatives: [],
        leftovers: leftoversFor(request, null),
        searchMode: "exact",
        selected: null,
        trimmed: false
      };
    }
  }

  const deadlineAt = Date.now() + config.searchDeadlineMs;
  const groups = compileGroups(
    request,
    catalog,
    Math.max(Date.now(), deadlineAt - 400)
  );
  const sellers = groupsBySeller(groups, request);
  const scored: ScoredBasket[] = [];
  let mode: "bounded" | "exact" = "exact";
  let trimmed = false;

  for (const seller of sellers) {
    const remaining = Math.max(0, deadlineAt - Date.now());
    const run = searchGroups(seller.groups, request, {
      ...config,
      searchDeadlineMs: remaining
    });
    mode = run.mode === "bounded" ? "bounded" : mode;
    trimmed = trimmed || run.trimmed;

    for (const state of run.complete) {
      const basket = scoreState({
        groups: seller.groups,
        request,
        sellerId: seller.sellerId,
        state
      });

      if (basket) {
        scored.push(basket);
      }
    }
  }

  const bySeller = new Map<string, ScoredBasket[]>();

  for (const basket of scored) {
    const list = bySeller.get(basket.sellerId) ?? [];
    list.push(basket);
    bySeller.set(basket.sellerId, list);
  }

  let winner: ReturnType<typeof selectOptions> = {
    alternatives: [],
    selected: null
  };

  for (const [, baskets] of [...bySeller.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    const option = selectOptions({ baskets, config, request });

    if (!option.selected) {
      continue;
    }

    if (
      !winner.selected ||
      option.selected.aggregateCoverage > winner.selected.aggregateCoverage ||
      (option.selected.aggregateCoverage === winner.selected.aggregateCoverage &&
        option.selected.priceMinor < winner.selected.priceMinor)
    ) {
      winner = option;
    }
  }

  return {
    alternatives: winner.alternatives,
    leftovers: leftoversFor(request, winner.selected),
    searchMode: mode,
    selected: winner.selected,
    trimmed
  };
}

export { DEFAULT_MATCHER_CONFIG, MATCHER_VERSION } from "@/lib/matcher/config";
export { scaleAmount, aggregateDailyExposure, isDoseError } from "@/lib/matcher/dose";
export { evaluateSafety } from "@/lib/matcher/safety";
export { productEligible } from "@/lib/matcher/eligibility";
export { compileGroups } from "@/lib/matcher/candidates";
export { optionIdFor, publicCoveragePercent } from "@/lib/matcher/explainer";
export { impliedOmegaPreference } from "@/lib/matcher/canonicalizer";
export type * from "@/lib/matcher/types";
