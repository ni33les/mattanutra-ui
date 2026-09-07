import { ProductDoseValidationError, validateProductDoseProposals } from "@/lib/matcher/serving-grid";
import { compileGroups, groupsBySeller, isDeferredConditional } from "@/lib/matcher/candidates";
import { orderInvariantRequest } from "@/lib/matcher/canonicalizer";
import { DEFAULT_MATCHER_CONFIG } from "@/lib/matcher/config";
import { rejectedCandidatesFor } from "@/lib/matcher/explainer";
import { amountFromScaled } from "@/lib/matcher/dose";
import { knownTargetExposure } from "@/lib/matcher/target-basis";
import { searchGroups, seedState, tryAddVariant } from "@/lib/matcher/search";
import { compareBaskets, hasFewerConcerns, scoreState, selectOptions } from "@/lib/matcher/selector";
import type { CanonicalRequest, CatalogSnapshot, LossCertificate, MatchResult, MatcherConfig, MatcherLeftover, ProductGroup, ScoredBasket } from "@/lib/matcher/types";

/** Evidence about a concrete attempted addition/replacement; never a claim that
 * a health concern makes a product unavailable, or that a bounded winner is optimal. */
function lossCertificatesFor(request: CanonicalRequest, catalog: CatalogSnapshot, groups: readonly ProductGroup[], selected: ScoredBasket | null, trimmed: boolean): LossCertificate[] {
  if (!selected) return [];
  const certificates: LossCertificate[] = [];
  for (const target of request.targets) {
    if (isDeferredConditional(target)) continue;
    const before = knownTargetExposure(request, target, selected.exposure.totals.get(target.subjectId)?.units ?? BigInt(0));
    if (before >= target.requested.units) continue;
    for (const group of groups) {
      if (selected.sellerId && group.sellerId !== selected.sellerId) continue;
      const existing = group.variants.find((row) => selected.variantIds.includes(row.variantId));
      for (const variant of group.variants) {
        const addition = (variant.contributions.get(target.subjectId)?.units ?? BigInt(0)) - (existing?.contributions.get(target.subjectId)?.units ?? BigInt(0));
        if (addition <= BigInt(0)) continue;
        const pills = selected.dailyPills - (existing?.dailyPills ?? 0) + variant.dailyPills;
        const price = selected.priceMinor + (existing ? 0 : group.product.unitPriceMinor);
        const count = selected.productCount + (existing ? 0 : 1);
        const rule = request.maxDailyPills != null && pills > request.maxDailyPills ? "max_pills" :
          request.maxPriceMinor != null && price > request.maxPriceMinor ? "budget" : request.maxProductCount != null && count > request.maxProductCount ? "max_products" : null;
        if (!rule && !trimmed) continue;
        const amount = (units: bigint) => amountFromScaled({ ...target.requested, units }, target.requestedUnit, target.name);
        certificates.push({ candidate_fact_id: null, candidate_product_id: group.productId, catalogue_id: catalog.catalogueVersion,
          conflicting_product_ids: selected.productIds.filter((id) => id !== group.productId), conflicting_rule_id: rule ?? "deterministic_search_budget",
          exposure_before: amount(before), exposure_after: amount(before + addition), limit: rule === "max_pills" ? request.maxDailyPills : rule === "budget" ? request.maxPriceMinor : rule === "max_products" ? request.maxProductCount : null,
          rejection_class: rule ? "hard_constraint" : "approximate", target_supplement_id: target.subjectId, unit: target.requestedUnit });
        break;
      }
    }
  }
  return certificates;
}

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
    if (isDeferredConditional(target)) continue;
    const summary = selected?.coverageSummary?.find(row => row.subjectId === target.subjectId);
    const coverage = selected?.coverageBySubject.get(target.subjectId) ?? 0;
    const percent = Math.round(coverage / 100);

    if (!selected || percent <= 0) {
      const constraint =
        selected &&
        request.maxProductCount != null &&
        selected.productCount >= request.maxProductCount
          ? "hard_constraint:maxProductCount"
          : selected &&
              request.maxDailyPills != null &&
              selected.dailyPills >= request.maxDailyPills
            ? "hard_constraint:maxDailyPills"
            : selected &&
                request.maxPriceMinor != null &&
                selected.priceMinor >= request.maxPriceMinor
              ? "hard_constraint:maxPriceMinor"
              : undefined;
      push({
        amount: summary?.remainingGap ?? target.requestedAmount,
        name: target.name,
        ...(constraint ? { note: constraint } : {}),
        reason: "uncovered",
        severity: "high",
        subjectId: target.subjectId,
        unit: target.requestedUnit
      });
    } else if (coverage < 10000) {
      push({
        amount: summary?.remainingGap ?? target.requestedAmount,
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


/** Bounded deterministic work, with dose fit prioritized throughout the search.
 * Wall-clock limits belong to the caller's processing/retry protocol. A slow
 * machine must not publish a different completed basket from the same inputs.
 */
export function match(request: CanonicalRequest, catalog: CatalogSnapshot,
  config: MatcherConfig = DEFAULT_MATCHER_CONFIG, compiledGroups?: readonly ProductGroup[]): MatchResult {
  const proposalIssues = validateProductDoseProposals(request, catalog);
  if (proposalIssues.length) throw new ProductDoseValidationError(proposalIssues);
  request = orderInvariantRequest(request);
  const groups = compiledGroups ? [...compiledGroups] : compileGroups(request, catalog);
  const sellers = groupsBySeller(groups, request, config.sellerGroupLimit);
  const scored: ScoredBasket[] = [];
  const empty = scoreState({ groups: [], request, sellerId: "", state: seedState(request) });
  if (empty) scored.push(empty);
  let trimmed = false;
  let mode: MatchResult["searchMode"] = "exact";
  for (const seller of sellers) {
    const run = searchGroups(seller.groups, request, config);
    trimmed ||= run.trimmed;
    if (run.mode === "bounded") mode = "bounded";
    for (const state of run.complete) {
      const basket = scoreState({ groups: seller.groups, request, sellerId: seller.sellerId, state });
      if (basket && basket.productCount > 0) scored.push(basket);
    }
    // Always retain the individually valid options. An exhausted beam must not
    // hide a labelled choice or make a clinically concerned product unavailable.
    for (const group of seller.groups) for (const variant of group.variants) {
      const state = tryAddVariant(seedState(request), variant, group, request);
      if (!state) continue;
      const basket = scoreState({ groups: seller.groups, request, sellerId: seller.sellerId, state });
      if (basket) scored.push(basket);
    }
  }
  const winner = selectOptions({ baskets: scored, request, config });
  const targetFrontiers = request.targets.filter((target) => !isDeferredConditional(target)).map((target) => ({
    subjectId: target.subjectId, name: target.name,
    productIds: [...new Set(scored.filter((row) => (row.coverageBySubject.get(target.subjectId) ?? 0) > 0)
      .sort((a, b) => compareBaskets(a, b, request, config)).flatMap((row) => row.productIds.filter((id) =>
        groups.some((group) => group.sellerId === row.sellerId && group.productId === id && group.variants.some((variant) =>
          row.variantIds.includes(variant.variantId) && (variant.contributions.get(target.subjectId)?.units ?? BigInt(0)) > BigInt(0))))))].slice(0, 3)
  }));
  const found = winner.alternatives.some((row) => winner.selected && hasFewerConcerns(row, winner.selected, request));
  const hasConcerns = Boolean(winner.selected && (winner.selected.safety.findings.length || winner.selected.doseFit?.over || winner.selected.doseFit?.limit));
  const alternativeSearch: NonNullable<MatchResult["alternativeSearch"]> = found
    ? { status: "found", reason: "A distinct option has fewer concerns and no lower coverage for any requested target." }
    : !hasConcerns ? { status: "not_needed", reason: "The selected option raises no assessed concerns." }
    : trimmed ? { status: "incomplete", reason: "No qualifying alternative was found within the deterministic search budget; absence is not proven." }
    : { status: "none_found", reason: "No distinct option with fewer concerns and no lower per-target coverage exists among the eligible product and dose combinations." };
  return { ...winner, alternativeSearch, leftovers: leftoversFor(request, winner.selected),
    lossCertificates: lossCertificatesFor(request, catalog, groups, winner.selected, trimmed),
    rejected: rejectedCandidatesFor(request, catalog, groups), searchMode: mode, targetFrontiers, trimmed };
}

export { DEFAULT_MATCHER_CONFIG, MATCHER_VERSION } from "@/lib/matcher/config";
export {
  scaleAmount,
  convertAmount,
  aggregateDailyExposure,
  isDoseError
} from "@/lib/matcher/dose";
export { evaluateSafety } from "@/lib/matcher/safety";
export { productEligible } from "@/lib/matcher/eligibility";
export { compileGroups } from "@/lib/matcher/candidates";
export {
  optionIdFor,
  publicCoveragePercent,
  rejectedCandidatesFor,
  summarizeRejections,
  DEV_REJECTED_DUMP_LIMIT,
  PUBLIC_REJECTED_SAMPLE_LIMIT
} from "@/lib/matcher/explainer";
export { impliedOmegaPreference } from "@/lib/matcher/canonicalizer";
export { productRejectionReason } from "@/lib/matcher/eligibility";
export type * from "@/lib/matcher/types";

export { validateProductDoseProposals, ProductDoseValidationError } from "@/lib/matcher/serving-grid";
