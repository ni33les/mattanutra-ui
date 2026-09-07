import { createHash } from 'node:crypto';
import { match } from '@/lib/matcher';
import { compileGroups, compileVariant, groupsBySeller } from '@/lib/matcher/candidates';
import { orderInvariantRequest } from '@/lib/matcher/canonicalizer';
import { DEFAULT_MATCHER_CONFIG } from '@/lib/matcher/config';
import { aggregateCoverage } from '@/lib/matcher/dominance';
import { seedState, searchGroups } from '@/lib/matcher/search';
import { basketSignature, scoreState } from '@/lib/matcher/selector';
import { servingIncrement, validateProductDoseProposals, ProductDoseValidationError } from '@/lib/matcher/serving-grid';
import type { CanonicalRequest, CatalogSnapshot, DoseVariant, MatchResult, ProductGroup, ScoredBasket, SearchState } from '@/lib/matcher/types';
import { abs, compare, divide, positive, subtract, ZERO, type Rational } from '@/lib/matcher/experiments/rational';
import { resolveProfile, type ScoringProfile } from '@/lib/matcher/experiments/profiles';
import { compareScores, scoreExposure, type ExperimentalScore } from '@/lib/matcher/experiments/score';

export const EXPERIMENT_SEARCH_VERSION = 'offline-scoring-search-1';
export type ExperimentCandidate = Readonly<{
  signature: string; sellerId: string; state: SearchState; groups: readonly ProductGroup[]; score: ExperimentalScore;
}>;
export type ExperimentSearchResult = Readonly<{
  profile: ScoringProfile; identity: string; inputIdentity: string; baseline: MatchResult;
  selected: ExperimentCandidate | null; purchaseFallback: ExperimentCandidate | null;
  incompleteCandidates: readonly ExperimentCandidate[]; candidates: readonly ExperimentCandidate[];
  searchSummary: { expansionAttempts: number; expansionBudget: number; quantityProbes: number; complete: boolean;
    completenessScope: 'generated_variants_only'; effort: 'standard' | 'expanded' };
}>;

export function canonicalJSON(value: unknown): string {
  const ordered = (row: unknown): unknown => {
    if (typeof row === 'bigint') return row.toString();
    if (row instanceof Map) return [...row.entries()].sort(([a], [b]) => String(a).localeCompare(String(b))).map(([k,v]) => [k, ordered(v)]);
    if (row instanceof Set) return [...row].sort().map(ordered);
    if (Array.isArray(row)) return row.map(ordered);
    if (row && typeof row === 'object') return Object.fromEntries(Object.entries(row).sort(([a], [b]) => a.localeCompare(b)).map(([k,v]) => [k, ordered(v)]));
    return row;
  };
  return JSON.stringify(ordered(value));
}
export const fingerprint = (value: unknown) => createHash('sha256').update(canonicalJSON(value)).digest('hex');
export function candidateSignature(sellerId: string, state: SearchState) {
  return state.count === 0 ? 'empty' : `${sellerId}|${[...state.selectedVariantIds].sort().join('|')}`;
}
function retained(request: CanonicalRequest, state: SearchState) {
  return (request.productDoses ?? []).every(row => state.selectedProductIds?.includes(row.productId)) &&
    request.retainProductIds.every(id => state.selectedProductIds?.includes(id) || request.currentSupplements.some(row => row.productId === id)) &&
    request.retainSubjectIds.every(id => (state.exposure.get(id) ?? BigInt(0)) > BigInt(0));
}
export function basketOfCandidate(candidate: ExperimentCandidate, request: CanonicalRequest): ScoredBasket | null {
  return scoreState({ request, state: candidate.state, sellerId: candidate.sellerId, groups: candidate.groups });
}
export function scoreCandidate(profile: ScoringProfile, request: CanonicalRequest, candidate: ExperimentCandidate): ExperimentCandidate {
  const score = scoreExposure(profile, request, candidate.state.exposure, {
    productCount: candidate.state.count, dailyPills: candidate.state.pillCountKnown === false ? null : candidate.state.pills,
    priceMinor: candidate.state.price, currency: request.currency });
  return { ...candidate, score: withProductEvidence(score, candidate.state, candidate.groups) };
}
function withProductEvidence(score: ExperimentalScore, state: SearchState, groups?: readonly ProductGroup[]): ExperimentalScore {
  if (!state.unknownProductIds?.length) return score;
  const selected = new Set(state.selectedVariantIds);
  const variants = groups?.flatMap(group => state.unknownProductIds!.includes(group.productId)
    ? group.variants.filter(variant => selected.has(variant.variantId)) : []) ?? [];
  const subjects = new Set(variants.flatMap(variant => variant.unknownSubjectIds?.length ? variant.unknownSubjectIds : ['*']));
  if (!subjects.size) subjects.add('*');
  return { ...score, nutrientEvidenceComplete: false,
    perTarget: score.perTarget.map(row => subjects.has('*') || subjects.has(row.subjectId) ? { ...row, certainty: 'unknown' as const } : row),
    uncertaintyNotes: [...new Set([...score.uncertaintyNotes, ...[...subjects].map(id => `unknown_product_amount:${id}`)])].sort() };
}
function commercial(a: ExperimentCandidate, b: ExperimentCandidate, request: CanonicalRequest) {
  const pills = Number(a.state.pillCountKnown === false) - Number(b.state.pillCountKnown === false) ||
    (a.state.pillCountKnown === false ? 0 : a.state.pills - b.state.pills);
  if (request.optimization === 'fewest_pills' && pills) return pills;
  if (request.optimization === 'balanced' || request.optimization === 'best_coverage') {
    const coverage = aggregateCoverage(request,b.state.delivered)-aggregateCoverage(request,a.state.delivered);
    if (coverage) return coverage;
  }
  return a.state.price - b.state.price || pills || a.state.count - b.state.count || a.signature.localeCompare(b.signature);
}
function protectedVector(candidate: ExperimentCandidate, request: CanonicalRequest) {
  const ids = new Set(request.targets.filter(row => row.importance === 'required' || row.importance === 'core').map(row => row.subjectId));
  const fit = candidate.score;
  const vector = new Map<string, Rational>();
  // Protect the raw facts at every interval endpoint, independently of which
  // endpoint supplies a particular scoring profile's worst whole objective.
  for (const row of fit.perTarget) if (ids.has(row.subjectId)) {
    const lower = divide(subtract(row.exposureMinimum, row.target), row.target);
    const upper = divide(subtract(row.exposureMaximum, row.target), row.target);
    vector.set(`d:${row.subjectId}`, compare(abs(lower), abs(upper)) >= 0 ? abs(lower) : abs(upper));
    vector.set(`o:${row.subjectId}`, positive(upper));
  }
  for (const row of fit.perContinuedDose) vector.set(`c:${row.subjectId}`, row.deviation);
  for (const row of fit.perLimit) vector.set(`l:${row.sourceScope}:${row.subjectId}`, positive(divide(subtract(row.exposureMaximum, row.limit), row.limit)));
  return vector;
}
function protectedFrontier(candidates: readonly ExperimentCandidate[], request: CanonicalRequest) {
  type Group = { vector: ReadonlyMap<string, Rational>; candidates: ExperimentCandidate[] };
  const equivalent = new Map<string, Group>();
  for (const candidate of candidates) {
    const vector = protectedVector(candidate, request);
    const key = canonicalJSON(new Map([...vector].filter(([, value]) => value.num !== BigInt(0))));
    const group = equivalent.get(key);
    if (group) group.candidates.push(candidate);
    else equivalent.set(key, { vector, candidates: [candidate] });
  }
  const dominates = (a: Group, b: Group) => {
    let strict = false;
    for (const key of new Set([...a.vector.keys(), ...b.vector.keys()])) {
      const direction = compare(a.vector.get(key) ?? ZERO, b.vector.get(key) ?? ZERO);
      if (direction > 0) return false;
      if (direction < 0) strict = true;
    }
    return strict;
  };
  // Compare distinct vectors only against the current frontier. Identical raw
  // facts retain every commercial choice without an all-pairs pool scan.
  let frontier: Group[] = [];
  for (const group of equivalent.values()) {
    if (frontier.some(other => dominates(other, group))) continue;
    frontier = frontier.filter(other => !dominates(group, other));
    frontier.push(group);
  }
  return frontier.flatMap(group => group.candidates);
}
function hasActivePreference(profile: ScoringProfile, request: CanonicalRequest) {
  return profile.preferenceCurve !== 'off' && ([
    ['productCount', request.maxProductCount], ['dailyPills', request.maxDailyPills], ['priceMinor', request.maxPriceMinor]
  ] as const).some(([metric, preferred]) => preferred != null && profile.preferenceWeights[metric].num > BigInt(0));
}
export function rankCandidates(profile: ScoringProfile, request: CanonicalRequest, pool: readonly ExperimentCandidate[]) {
  const scored = pool.filter(row => retained(request, row.state)).map(row => scoreCandidate(profile, request, row));
  const complete = scored.filter(row => row.score.complete);
  const incomplete = scored.filter(row => !row.score.complete).sort((a,b) => a.signature.localeCompare(b.signature));
  let eligible = complete;
  if (!hasActivePreference(profile, request) && request.targets.some(row => row.importance === 'optional') &&
    request.targets.some(row => row.importance === 'required' || row.importance === 'core')) {
    eligible = protectedFrontier(complete, request);
  }
  const order = (a: ExperimentCandidate,b: ExperimentCandidate) => compareScores(a.score,b.score) || commercial(a,b,request);
  eligible.sort(order); complete.sort(order);
  let purchaseFallback = complete.find(row => row.state.count > 0) ?? null;
  if (!purchaseFallback) for (const candidate of incomplete) {
    if (candidate.state.count > 0 && (!purchaseFallback ||
      (compare(candidate.score.nutrientTotal, purchaseFallback.score.nutrientTotal) || commercial(candidate, purchaseFallback, request)) < 0)) purchaseFallback = candidate;
  }
  // An unknown active preference makes the whole score incomparable. It does
  // not erase the purchasable basket or turn its conditional score into zero.
  return { selected: eligible[0] ?? null, rankedCandidates: eligible, purchaseFallback, incompleteCandidates: incomplete, candidates: scored };
}

/** Exact discrete convex minimisation; the caller charges every evaluation. */
export function discreteMinimum(evaluate: (tick: bigint) => Rational | null, maximumTick = BigInt(Number.MAX_SAFE_INTEGER)): readonly bigint[] {
  const values = new Map<bigint,Rational>();
  const at = (tick: bigint) => { if (!values.has(tick)) { const value = evaluate(tick); if (!value) return null; values.set(tick,value); } return values.get(tick)!; };
  const slope = (tick: bigint) => { const a=at(tick),b=at(tick+BigInt(1)); return a && b ? compare(b,a) : null; };
  let lo=BigInt(1), hi=BigInt(1);
  for (;;) {
    const direction=slope(hi); if(direction==null) return [...values.keys()];
    if(direction>=0) break;
    lo=hi+BigInt(1);
    if(hi>=maximumTick-BigInt(1)) return [...values.keys()];
    hi=hi*BigInt(2) > maximumTick-BigInt(1) ? maximumTick-BigInt(1) : hi*BigInt(2);
  }
  while(lo<hi) { const mid=(lo+hi)/BigInt(2); const direction=slope(mid); if(direction==null) return [...values.keys()]; if(direction>=0) hi=mid; else lo=mid+BigInt(1); }
  for(const tick of [lo>BigInt(1)?lo-BigInt(1):lo,lo,lo+BigInt(1)]) if(tick<=maximumTick) at(tick);
  return [...values.keys()];
}

export function runExperimentSearch(input: Readonly<{
  request: CanonicalRequest; catalog: CatalogSnapshot; profile: ScoringProfile; effort?: 'standard'|'expanded'; budget?: number;
  incumbent?: ExperimentSearchResult; control?: ExperimentSearchResult; compiledGroups?: readonly ProductGroup[];
}>): ExperimentSearchResult {
  const request = orderInvariantRequest(input.request), profile = resolveProfile(input.profile);
  const issues = validateProductDoseProposals(request,input.catalog); if(issues.length) throw new ProductDoseValidationError(issues);
  const effort=input.effort ?? 'standard', budget=input.budget ?? (effort==='expanded'?64000:8000);
  if(!Number.isSafeInteger(budget)||budget<0) throw new Error('budget must be a non-negative safe integer');
  const inputIdentity=fingerprint({request,catalog:{...input.catalog,products:[...input.catalog.products].sort((a,b)=>`${a.sellerId}:${a.productId}`.localeCompare(`${b.sellerId}:${b.productId}`))}});
  if(input.incumbent && (input.incumbent.profile.hash!==profile.hash || input.incumbent.inputIdentity!==inputIdentity)) throw new Error('Incumbent profile or inputs do not match');
  if(input.incumbent && input.incumbent.searchSummary.expansionAttempts > budget) throw new Error('Budget is smaller than the incumbent work already performed');
  if(input.control && input.control.inputIdentity !== inputIdentity) throw new Error('Control inputs do not match');
  if(input.control && input.control.profile.hash !== resolveProfile('baseline').hash) throw new Error('Control must use the baseline profile');
  const identity=fingerprint({inputIdentity,profile:profile.hash,effort,budget,version:EXPERIMENT_SEARCH_VERSION});
  const isBaseline=profile.hash===resolveProfile('baseline').hash;
  if(isBaseline && effort === 'expanded' && budget !== 64000) throw new Error('Baseline expanded search requires its production 64,000 budget');
  // Expanded search always preserves the standard result and counts its work,
  // including when the caller has not explicitly run the standard pass.
  const incumbent = input.incumbent ?? (!isBaseline && effort === 'expanded'
    ? runExperimentSearch({ ...input, effort: 'standard', budget: Math.min(8000, budget) }) : undefined);
  const pool=new Map<string,ExperimentCandidate>();
  const scoreStateFor = (state: SearchState) => withProductEvidence(scoreExposure(profile,request,state.exposure,{productCount:state.count,dailyPills:state.pillCountKnown===false?null:state.pills,priceMinor:state.price,currency:request.currency}), state);
  const cache=new WeakMap<SearchState,ExperimentalScore>();
  const stateScore=(state:SearchState)=>{let result=cache.get(state);if(!result){result=scoreStateFor(state);cache.set(state,result);}return result;};
  const observe=(sellerId:string,state:SearchState,groups:readonly ProductGroup[])=>{
    if(!retained(request,state)) return;
    const signature=candidateSignature(sellerId,state);
    if(!pool.has(signature)) pool.set(signature,{signature,sellerId:state.count?sellerId:'',state,groups,score:stateScore(state)});
  };
  const empty=seedState(request);observe('',empty,[]);
  for(const candidate of incumbent?.candidates ?? []) pool.set(candidate.signature,candidate);
  let baseline:MatchResult;
  let used=0, probes=0, complete=true;
  const config={...DEFAULT_MATCHER_CONFIG,expansionBudget:budget};
  if(isBaseline) {
    baseline=match({...request,searchEffort:effort},input.catalog,{...config,expansionBudget:effort==='expanded'?8000:budget},input.compiledGroups,observe);
    used=baseline.searchSummary!.expansionAttempts;complete=baseline.searchSummary!.complete;
  } else {
    baseline=input.control?.baseline ?? match(request,input.catalog);
    const initial=input.compiledGroups ?? compileGroups(request,input.catalog);
    const sellers=groupsBySeller(initial,request);
    const remaining=budget-(incumbent?.searchSummary.expansionAttempts ?? 0);
    used=incumbent?.searchSummary.expansionAttempts ?? 0;probes=incumbent?.searchSummary.quantityProbes ?? 0;
    for(const [index,seller] of sellers.entries()) {
      const groups=seller.groups.map(group=>({...group,variants:[...group.variants]}));
      const prior=(incumbent?.candidates ?? []).filter(row=>row.sellerId===seller.sellerId);
      for(const candidate of prior) for(const group of groups) {
        const old=candidate.groups.find(row=>row.productId===group.productId);
        for(const variant of old?.variants ?? []) if(!group.variants.some(row=>row.variantId===variant.variantId)) group.variants.push(variant);
      }
      const allocation=Math.floor(remaining/sellers.length)+(index<remaining%sellers.length?1:0);
      const order=(a:SearchState,b:SearchState)=>{
        const x=stateScore(a),y=stateScore(b);
        return Number(!x.complete)-Number(!y.complete) || (x.complete&&y.complete?compareScores(x,y):compare(x.nutrientTotal,y.nutrientTotal)) ||
          a.price-b.price || a.count-b.count || candidateSignature(seller.sellerId,a).localeCompare(candidateSignature(seller.sellerId,b));
      };
      const run=searchGroups(groups,request,{...config,expansionBudget:allocation},prior.map(row=>row.state),{
        compare:order,cohort:state=>stateScore(state).complete?'complete':'incomplete',observe:(state,active)=>observe(seller.sellerId,state,active),
        variants:(group,state,existing,probe)=>{
          if(request.productDoses?.some(row=>row.productId===group.productId)) return existing;
          const step=servingIncrement(group.product); const variants=new Map(existing.map(row=>[row.variantId,row]));
          discreteMinimum(tick=>{
            const ratio={num:step.num*tick,den:step.den}, units=Number(ratio.num)/Number(ratio.den);
            const variant=compileVariant({product:group.product,request,dailyUnits:units,dailyUnitsRatio:ratio});
            if(!variant) return null;
            if(!group.variants.some(row=>row.variantId===variant.variantId)) (group.variants as DoseVariant[]).push(variant);
            variants.set(variant.variantId,variant);
            const next=probe(variant);if(!next)return null;probes++;
            const score=stateScore(next);return score.total;
          });
          return [...variants.values()];
        }
      });
      used+=run.expansionAttempts; complete&&=!run.trimmed && run.mode==='exact';
    }
  }
  const candidates=[...pool.values()].sort((a,b)=>a.signature.localeCompare(b.signature));
  const ranked=rankCandidates(profile,request,candidates);
  let selected: ExperimentCandidate | null=ranked.selected;
  if(isBaseline && baseline.selected) {
    const signature=baseline.selected.productCount?basketSignature(baseline.selected):'empty';
    selected=candidates.find(row=>row.signature===signature) ?? null;
    if(!selected) throw new Error('Baseline selected basket was absent from observed search candidates');
  }
  return {profile,identity,inputIdentity,baseline,selected,purchaseFallback:ranked.purchaseFallback,incompleteCandidates:ranked.incompleteCandidates,candidates,
    searchSummary:{expansionAttempts:used,expansionBudget:budget,quantityProbes:probes,complete,completenessScope:'generated_variants_only',effort}};
}
