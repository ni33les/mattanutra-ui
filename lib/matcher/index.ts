import { matchingDiagnosticsFor } from "@/lib/matcher/diagnostics";
import { ProductDoseValidationError, validateProductDoseProposals } from "@/lib/matcher/serving-grid";
import { compileGroups, isDeferredConditional } from "@/lib/matcher/candidates";
import { orderInvariantRequest } from "@/lib/matcher/canonicalizer";
import { DEFAULT_MATCHER_CONFIG } from "@/lib/matcher/config";
import { rejectedCandidatesFor } from "@/lib/matcher/explainer";
import { amountFromScaled } from "@/lib/matcher/dose";
import { knownTargetExposure } from "@/lib/matcher/target-basis";
import { equivalentSellerOffers } from "@/lib/matcher/seller-offers";
import { seedState } from "@/lib/matcher/search";
import { searchCursorResult, archivedSearchStates } from "@/lib/matcher/search-cursor";
import { createMatchCursor, advanceMatchCursor, matchCursorAttempts, type MatchCursor } from "@/lib/matcher/match-cursor";
import { compareBaskets, hasFewerConcerns, scoreState, selectOptions } from "@/lib/matcher/selector";
import type { CanonicalRequest, CatalogSnapshot, LossCertificate, MatchResult, MatcherConfig, MatcherLeftover, ProductGroup, ScoredBasket, SearchState } from "@/lib/matcher/types";

/** Evidence about a concrete attempted addition/replacement; never a claim that
 * a health concern makes a product unavailable, or that a bounded winner is optimal. */
function lossCertificatesFor(request: CanonicalRequest, catalog: CatalogSnapshot, groups: readonly ProductGroup[], selected: ScoredBasket | null, trimmed: boolean): LossCertificate[] {
  if (!selected || !trimmed) return [];
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
        const amount = (units: bigint) => amountFromScaled({ ...target.requested, units }, target.requestedUnit, target.name);
        certificates.push({ candidate_fact_id: null, candidate_product_id: group.productId, catalogue_id: catalog.catalogueVersion,
          conflicting_product_ids: selected.productIds.filter((id) => id !== group.productId), conflicting_rule_id: "deterministic_search_budget",
          exposure_before: amount(before), exposure_after: amount(before + addition), limit: null,
          rejection_class: "approximate", target_supplement_id: target.subjectId, unit: target.requestedUnit });
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
      push({
        amount: summary?.remainingGap ?? target.requestedAmount,
        name: target.name,
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
  config: MatcherConfig = DEFAULT_MATCHER_CONFIG, compiledGroups?: readonly ProductGroup[],
  observeCandidate?: (sellerId: string, state: SearchState, groups: readonly ProductGroup[]) => void, completedCursor?: MatchCursor): MatchResult {
  const proposalIssues = validateProductDoseProposals(request, catalog);
  if (proposalIssues.length) throw new ProductDoseValidationError(proposalIssues);
  request = orderInvariantRequest(request);
  const groups = compiledGroups ? [...compiledGroups] : compileGroups(request, catalog);
  const cursor = completedCursor ?? createMatchCursor(request, catalog, config, groups);
  while (!cursor.done) advanceMatchCursor(cursor, request, 8_000);
  const scored: ScoredBasket[] = [];
  const sourceStates = new Map<string, { state: SearchState; groups: readonly ProductGroup[] }>();
  const empty = scoreState({ groups: [], request, sellerId: "", state: seedState(request) });
  if (empty) scored.push(empty);
  let trimmed = false;
  const searchStatus: { mode: MatchResult["searchMode"] } = { mode: "exact" };
  const expansionAttempts = matchCursorAttempts(cursor), expansionBudget = cursor.expansionBudget, effort = cursor.effort;
  const perSellerGroups = new Map<string, readonly ProductGroup[]>();
  for (const seller of cursor.sellers) {
    const run = searchCursorResult(seller.cursor, request);
    perSellerGroups.set(seller.sellerId, run.groups);
    trimmed ||= run.trimmed;
    if (run.mode === "bounded") searchStatus.mode = "bounded";
    if (observeCandidate) for (const state of archivedSearchStates(seller.cursor)) observeCandidate(seller.sellerId, state, run.groups);
    for (const state of run.complete) {
      const basket = scoreState({ groups: run.groups, request, sellerId: seller.sellerId, state });
      if (basket && basket.productCount > 0) {
        scored.push(basket);
        sourceStates.set(basket.variantIds.join("|"), { state, groups: run.groups });
      }
    }
  }
  const exploredGroups = [...perSellerGroups.values()].flat();
  const preliminary = selectOptions({ baskets: scored, request, config });
  // Recover commercial ties only for retained role candidates. This bounded
  // projection compares quotes for existing baskets, with no extra dose search.
  for (const basket of [preliminary.selected, ...preliminary.alternatives]) {
    if (!basket) continue;
    const source = sourceStates.get(basket.variantIds.join("|"));
    if (!source) continue;
    for (const offer of equivalentSellerOffers(source.state, source.groups, exploredGroups)) {
      const priced = scoreState({ ...offer, request });
      if (priced) scored.push(priced);
    }
  }
  const winner = selectOptions({ baskets: scored, request, config });
  const targetFrontiers = request.targets.filter((target) => !isDeferredConditional(target)).map((target) => ({
    subjectId: target.subjectId, name: target.name,
    productIds: [...new Set(scored.filter((row) => (row.coverageBySubject.get(target.subjectId) ?? 0) > 0)
      .sort((a, b) => compareBaskets(a, b, request, config)).flatMap((row) => row.productIds.filter((id) =>
        exploredGroups.some((group) => group.sellerId === row.sellerId && group.productId === id && group.variants.some((variant) =>
          row.variantIds.includes(variant.variantId) && (variant.contributions.get(target.subjectId)?.units ?? BigInt(0)) > BigInt(0))))))].slice(0, 3)
  }));
  const found = winner.alternatives.some((row) => winner.selected && hasFewerConcerns(row, winner.selected, request));
  const hasConcerns = Boolean(winner.selected && (winner.selected.safety.findings.length || winner.selected.doseFit?.over || winner.selected.doseFit?.limit));
  const alternativeSearch: NonNullable<MatchResult["alternativeSearch"]> = found
    ? { status: "found", reason: "A distinct option has fewer concerns and no lower coverage for any requested target." }
    : !hasConcerns ? { status: "not_needed", reason: "The selected option raises no assessed concerns." }
    : trimmed ? { status: "incomplete", reason: "No qualifying alternative was found within the deterministic search budget; absence is not proven." }
    : { status: "none_found", reason: "No distinct option with fewer concerns and no lower per-target coverage exists among the eligible product and dose combinations." };
  const searchSummary = { effort, expansionAttempts, expansionBudget, complete: !trimmed && searchStatus.mode === "exact", canExpand: effort === "standard" && (trimmed || searchStatus.mode === "bounded") };
  const rejected = rejectedCandidatesFor(request, catalog, groups);
  const matchingDiagnostics = matchingDiagnosticsFor({ request, catalog, groups, baskets: scored, selected: winner.selected, searchSummary, rejected });
  return { ...winner, alternativeSearch, searchSummary, matchingDiagnostics, leftovers: leftoversFor(request, winner.selected),
    lossCertificates: lossCertificatesFor(request, catalog, exploredGroups, winner.selected, trimmed),
    rejected, searchMode: searchStatus.mode, targetFrontiers, trimmed };
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
