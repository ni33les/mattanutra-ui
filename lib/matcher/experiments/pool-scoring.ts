import type { CanonicalRequest } from '@/lib/matcher/types';
import { resolveProfile, type ScoringProfile } from '@/lib/matcher/experiments/profiles';
import { add, compare, serialize, type Rational } from '@/lib/matcher/experiments/rational';
import { scoreExposure, scorePreferences, type ExperimentalScore, type ScoringActuals } from '@/lib/matcher/experiments/score';
import {
  compareCommercialCandidates, rankCandidates, retainedCandidate, scoreCandidate,
  type ExperimentCandidate, type ExperimentCandidateInput
} from '@/lib/matcher/experiments/search';

export type CrossScore = Readonly<{
  signature: string; profileId: string; profileHash: string;
  total: ReturnType<typeof serialize> | null; nutrientTotal: ReturnType<typeof serialize>;
  preferenceTotal: ReturnType<typeof serialize> | null;
  complete: boolean; nutrientEvidenceComplete: boolean; missingComponents: readonly string[];
}>;
export type PoolEvaluation = Readonly<{
  selected: ExperimentCandidate | null; purchaseFallback: ExperimentCandidate | null;
  incompleteCandidates: Readonly<{ count: number; examples: readonly ExperimentCandidate[] }>;
  /** Cumulative scalar-cache misses, or full-ranker candidate evaluations for
   * the protected-priority fallback. Winner ledger materialization is separate. */
  nutrientEvaluations: number;
}>;
type NutrientSummary = Readonly<{ nutrientTotal: Rational; nutrientEvidenceComplete: boolean }>;
type Minimum = Readonly<{ candidate: ExperimentCandidateInput; value: Rational }>;

function crossScore(profile: ScoringProfile, signature: string,
  score: Pick<ExperimentalScore, 'total' | 'nutrientTotal' | 'preferenceTotal' | 'complete' | 'nutrientEvidenceComplete' | 'missingComponents'>): CrossScore {
  return { signature, profileId: profile.id, profileHash: profile.hash,
    total: score.total === null ? null : serialize(score.total), nutrientTotal: serialize(score.nutrientTotal),
    preferenceTotal: score.preferenceTotal === null ? null : serialize(score.preferenceTotal),
    complete: score.complete, nutrientEvidenceComplete: score.nutrientEvidenceComplete, missingComponents: score.missingComponents };
}

/** One private request/pool snapshot owns this cache. Nutrient totals are
 * calculated from full endpoint objectives for each exact alpha, never by
 * transforming a previously aggregated linear loss. Losers retain no ledger. */
export function createPoolScorer(requestInput: CanonicalRequest, poolInput: readonly ExperimentCandidateInput[]) {
  if (!poolInput.length) throw new Error('Missing candidate evidence for common-pool scoring');
  const signatures = new Set<string>();
  for (const candidate of poolInput) {
    if (!candidate.signature || signatures.has(candidate.signature)) throw new Error('Missing or duplicate candidate signature in common pool');
    signatures.add(candidate.signature);
  }
  // Clone the complete object graph together so shared group metadata remains
  // shared. Do not clone callers' obsolete per-profile score ledgers. Neither
  // later input mutation nor returned winner mutation can change cached facts.
  const { request, pool } = structuredClone({ request: requestInput,
    pool: poolInput.map(({ signature, sellerId, state, groups }) => ({ signature, sellerId, state, groups })) });
  const candidates = pool.filter(candidate => retainedCandidate(request, candidate.state));
  const cache = new Map<string, Map<string, NutrientSummary>>();
  let nutrientEvaluations = 0;
  const protectedTargets = request.targets.some(row => row.importance === 'optional') &&
    request.targets.some(row => row.importance === 'required' || row.importance === 'core');

  function evaluate(profileInput: ScoringProfile, onScore?: (row: CrossScore) => void): PoolEvaluation {
    const profile = resolveProfile(profileInput);
    // Preserve the exact existing raw-vector Pareto policy, including inactive
    // preference weights. These bounded synthetic pools need no new frontier.
    if (protectedTargets) {
      const ranked = rankCandidates(profile, request, candidates);
      nutrientEvaluations += ranked.candidates.length;
      for (const candidate of ranked.candidates) onScore?.(crossScore(profile, candidate.signature, candidate.score));
      return { selected: structuredClone(ranked.selected), purchaseFallback: structuredClone(ranked.purchaseFallback),
        incompleteCandidates: { count: ranked.incompleteCandidates.length,
          examples: structuredClone(ranked.incompleteCandidates.filter(row => row.state.count > 0).slice(0, 3)) }, nutrientEvaluations };
    }
    const alpha = `${profile.nutrientAlpha.num}/${profile.nutrientAlpha.den}`;
    let nutrientCache = cache.get(alpha);
    if (!nutrientCache) { nutrientCache = new Map(); cache.set(alpha, nutrientCache); }
    let selected: Minimum | null = null, purchase: Minimum | null = null, incompletePurchase: Minimum | null = null;
    let incompleteCount = 0;
    const examples: ExperimentCandidateInput[] = [];
    const minimum = (previous: Minimum | null, candidate: ExperimentCandidateInput, value: Rational): Minimum =>
      !previous || (compare(value, previous.value) || compareCommercialCandidates(candidate, previous.candidate, request)) < 0
        ? { candidate, value } : previous;
    for (const candidate of candidates) {
      const actual: ScoringActuals = { productCount: candidate.state.count,
        dailyPills: candidate.state.pillCountKnown === false ? null : candidate.state.pills,
        priceMinor: candidate.state.price, currency: request.currency };
      const preference = scorePreferences(profile, request, actual);
      let nutrient = nutrientCache.get(candidate.signature);
      if (!nutrient) {
        const full = scoreExposure(profile, request, candidate.state.exposure, actual);
        nutrient = { nutrientTotal: full.nutrientTotal,
          nutrientEvidenceComplete: full.nutrientEvidenceComplete && !candidate.state.unknownProductIds?.length };
        nutrientCache.set(candidate.signature, nutrient); nutrientEvaluations++;
      }
      const total = preference.preferenceTotal === null ? null : add(nutrient.nutrientTotal, preference.preferenceTotal);
      onScore?.(crossScore(profile, candidate.signature, { ...nutrient, total,
        preferenceTotal: preference.preferenceTotal, complete: preference.complete, missingComponents: preference.missingComponents }));
      if (total !== null) {
        selected = minimum(selected, candidate, total);
        if (candidate.state.count > 0) purchase = minimum(purchase, candidate, total);
      } else {
        incompleteCount++;
        if (candidate.state.count > 0) {
          incompletePurchase = minimum(incompletePurchase, candidate, nutrient.nutrientTotal);
          examples.push(candidate); examples.sort((a, b) => a.signature.localeCompare(b.signature));
          if (examples.length > 3) examples.pop();
        }
      }
    }
    const full = new Map<string, ExperimentCandidate>();
    const materialize = (candidate: ExperimentCandidateInput | undefined): ExperimentCandidate | null => {
      if (!candidate) return null;
      let scored = full.get(candidate.signature);
      if (!scored) { scored = scoreCandidate(profile, request, structuredClone(candidate)); full.set(candidate.signature, scored); }
      return scored;
    };
    return { selected: materialize(selected?.candidate), purchaseFallback: materialize((purchase ?? incompletePurchase)?.candidate),
      incompleteCandidates: { count: incompleteCount, examples: examples.map(candidate => materialize(candidate)!) }, nutrientEvaluations };
  }
  return { evaluate };
}
