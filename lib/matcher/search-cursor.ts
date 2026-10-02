import { smallest } from "@/lib/matcher/top-k";
import { verifiedAdministration } from "@/lib/product-administration";
import { sha256Hex } from "@/lib/sha256";
import { serializeExactValue } from "@/lib/matcher/exact-values";
import { compileVariant, isDeferredConditional } from "@/lib/matcher/candidates";
import { servingIncrement } from "@/lib/matcher/serving-grid";
import { intakeIsKnown, knownTargetExposure, targetBasis, targetDoseTicks } from "@/lib/matcher/target-basis";
import { compareOverallScores, resolvePracticalProfile, numericalSearchStateScore, type ComparableOverallScore } from "@/lib/matcher/practical-scoring";
import { divide, fromDecimal, multiply, rational, toNumber } from "@/lib/matcher/rational";
import { fingerprintAtGroup, fingerprintState } from "@/lib/matcher/dominance";
import { compareDoseFit, numericalDoseFitScore, doseFitTargetDeviations } from "@/lib/matcher/dose-fit";
import { quantityById, compareSearchStates, profileLeaders, residualPattern, reviewFrontier, seedState, tryAddVariant, type SearchRun } from "@/lib/matcher/search";
import type { CanonicalRequest, DoseVariant, MatcherConfig, ProductGroup, SearchState } from "@/lib/matcher/types";

type ExactFrame = { state: SearchState; variantIds: string[] | null; position: number };
type ExactVector = (number | bigint)[];
type ArchivedState = [number, number, number, number, boolean, number[], ExactVector, ExactVector, string[],
  [number[], number, number | null, number, { num: bigint; den: bigint }?]?];
type QuantitySearch = { key: string; ids: string[]; low: bigint; high: bigint; steps: number; left?: ComparableOverallScore | null };
type RepairJob = { leader: SearchState; removal: number; base: SearchState | null; retained: string[]; build: number; group: number; variant: number; variants: string[] | null; stage: "prepare" | "build" | "add" | "done";
  fixedRemoval?: string[]; replacementGroups?: number[] };
export type SearchCursor = {
  version: "search-cursor-1"; identity: string; groups: ProductGroup[]; baseline: string[][];
  config: MatcherConfig; expansionBudget: number; expansionAttempts: number;
  passStart: number; done: boolean; exhausted: boolean; trimmed: boolean; exact: boolean;
  phase: "exact" | "single" | "beam" | "pairs" | "repair" | "second" | "finished";
  archive: Map<string, ArchivedState | SearchState>; edges: Map<string, string | null>;
  subjects: string[]; subjectIndex: Map<string, number>; variantIds: string[]; variantIndex: Map<string, number>;
  review: SearchState[]; unreviewed: SearchState[];
  singles: { state: SearchState; group: number; variant: string }[];
  group: number; variant: number; beam: SearchState[]; expanded: SearchState[];
  parent: number; variants: string[] | null; groupLimit: number; beamLimit: number;
  pairSum: number; pairLeft: number;
  repairJobs: RepairJob[]; repairJob: number; repairLimit: number;
  repaired: SearchState[]; second: SearchState[]; secondIndex: number; secondReferences: string[];
  exactStack: ExactFrame[];
  /** Resumable quantity probes; partial probe pairs survive checkpoint boundaries. */
  quantitySearch?: QuantitySearch;
};

// Preserve the historical Map's first position / last value semantics without
// storing duplicate probes or cloning the same skipped parent repeatedly.
// The array stays checkpoint-compatible; old duplicate arrays normalize once.
const expandedIndices = new WeakMap<SearchState[], Map<string, { position: number; source: SearchState }>>();
function expandedIndex(rows: SearchState[]) {
  let index = expandedIndices.get(rows);
  if (!index) {
    index = new Map();
    for (const row of rows) {
      const key = fingerprintState(row), position = index.get(key)?.position ?? index.size;
      rows[position] = row; index.set(key, { position, source: row });
    }
    rows.length = index.size;
    expandedIndices.set(rows, index);
  }
  return index;
}
function retainBeamState(cursor: SearchCursor, state: SearchState, nextGroupIndex: number) {
  const index = expandedIndex(cursor.expanded), key = fingerprintAtGroup(state, nextGroupIndex), previous = index.get(key);
  if (previous?.source === state) return;
  const position = previous?.position ?? cursor.expanded.length;
  cursor.expanded[position] = { ...state, nextGroupIndex };
  index.set(key, { position, source: state });
}

function indexFor(values: string[], indices: Map<string, number>, id: string) {
  const found = indices.get(id); if (found != null) return found;
  const next = values.length; values.push(id); indices.set(id, next); return next;
}
// Variant numbers belong to one cursor and survive its checkpoints. A restored
// index gets its own cache; immutable selections can share keys across layers.
const selectionKeys = new WeakMap<SearchCursor["variantIndex"], WeakMap<readonly string[], string>>();
export function searchSelectionKey(cursor: Pick<SearchCursor, "variantIds" | "variantIndex">, ids: readonly string[]) {
  let cache = selectionKeys.get(cursor.variantIndex);
  if (!cache) { cache = new WeakMap(); selectionKeys.set(cursor.variantIndex, cache); }
  let key = cache.get(ids);
  if (key === undefined) {
    key = ids.map(id => indexFor(cursor.variantIds, cursor.variantIndex, id)).sort((a, b) => a - b).join(",");
    cache.set(ids, key);
  }
  return key;
}
function packedExposure(cursor: SearchCursor, values: ReadonlyMap<string, bigint>): ExactVector {
  const packed: ExactVector = [];
  for (const [id, value] of values) packed.push(indexFor(cursor.subjects, cursor.subjectIndex, id), value);
  return packed;
}
function unpackedExposure(cursor: SearchCursor, packed: ExactVector) {
  const values = new Map<string, bigint>();
  for (let i=0; i<packed.length; i+=2) values.set(cursor.subjects[packed[i] as number]!, packed[i+1] as bigint);
  return values;
}
// Packed rows are immutable and scoped to one cursor. Re-reading an edge must
// not rebuild the same maps (and discard all numerical WeakMap caches).
const restoredStates = new WeakMap<ArchivedState, SearchState>();
function restoreState(cursor: SearchCursor, packed: ArchivedState | SearchState): SearchState {
  if (!Array.isArray(packed)) return packed;
  const cached = restoredStates.get(packed); if (cached) return cached;
  const selectedVariantIds = packed[5].map(index => cursor.variantIds[index]!);
  const exposure = unpackedExposure(cursor, packed[6]);
  const state: SearchState = { nextGroupIndex: packed[0], price: packed[1], pills: packed[2], count: packed[3], pillCountKnown: packed[4],
    selectedVariantIds, selectedProductIds: selectedVariantIds.map(id => {
      const group = cursor.groups.find(row => id.startsWith(`${row.sellerId}:${row.productId}:x`));
      if (!group) throw new Error("Archive lost a selected product");
      return group.productId;
    }), exposure, delivered: packed[7] === packed[6] ? exposure : unpackedExposure(cursor, packed[7]), unknownProductIds: packed[8],
    ...(packed[9] ? { routineServings: packed[9][0], uncertainAdministrationCount: packed[9][1], monthlyPriceMinor: packed[9][2], monthlyPriceLowerBound: packed[9][3], servingBurden: packed[9][4] } : {}) };
  restoredStates.set(packed, state); return state;
}
export function* archivedSearchStates(cursor: SearchCursor) {
  for (const packed of cursor.archive.values()) yield restoreState(cursor, packed);
}
function remember(cursor: SearchCursor, state: SearchState) {
  const key = searchSelectionKey(cursor, state.selectedVariantIds);
  if (!cursor.archive.has(key)) {
    cursor.archive.set(key, state.count > 0 ? state : { ...state, unknownProductIds: state.unknownProductIds ?? [] });
    cursor.unreviewed.push(state);
  }
  return key;
}

// Only opt-in checkpoint encoding needs the historical packed representation.
// Keep immutable live candidates once; do not duplicate every losing state.
const packedStates = new WeakMap<SearchState, ArchivedState>();
export function checkpointSearchCursor(cursor: SearchCursor): SearchCursor {
  const archive = new Map<string, ArchivedState>();
  for (const [key, value] of cursor.archive) {
    let packed = Array.isArray(value) ? value : packedStates.get(value);
    if (!packed) {
      const state = value as SearchState, exposure = packedExposure(cursor, state.exposure);
      packed = [state.nextGroupIndex, state.price, state.pills, state.count, state.pillCountKnown !== false,
        state.selectedVariantIds.map(id => indexFor(cursor.variantIds, cursor.variantIndex, id)), exposure,
        state.delivered === state.exposure ? exposure : packedExposure(cursor, state.delivered), [...(state.unknownProductIds ?? [])],
        [[...(state.routineServings ?? [])], state.uncertainAdministrationCount ?? state.count, state.monthlyPriceMinor ?? null, state.monthlyPriceLowerBound ?? 0, state.servingBurden]];
      packedStates.set(state, packed);
    }
    archive.set(key, packed);
  }
  return { ...cursor, archive };
}
function width(cursor: SearchCursor) { return Math.max(1, Math.min(cursor.passStart ? cursor.config.maxBeamWidth : cursor.config.initialBeamWidth, cursor.config.maxBeamWidth)); }
function explorationLimit(cursor: SearchCursor) { return cursor.expansionBudget - Math.floor((cursor.expansionBudget - cursor.passStart) / 5); }

export function createSearchCursor(groups: readonly ProductGroup[], request: CanonicalRequest, config: MatcherConfig, identity?: string): SearchCursor {
  // Product and variant facts are immutable; only each group's quantity list grows.
  const copy = groups.map(group => ({ ...group, variants: [...group.variants] }));
  identity ??= sha256Hex(JSON.stringify(serializeExactValue({ version: "search-cursor-1", scoringProfileHash: resolvePracticalProfile(request).hash, groups, request: { ...request, searchEffort: undefined }, config: { ...config, expansionBudget: undefined } })));
  const exact = groups.length <= config.exactGroupLimit && groups.reduce((sum, group) => sum + group.variants.length, 0) <= config.exactVariantLimit;
  const seed = seedState(request);
  const cursor: SearchCursor = { version: "search-cursor-1", identity, groups: copy, baseline: copy.map(group => group.variants.map(row => row.variantId)), config: { ...config },
    expansionBudget: Math.max(0, Math.floor(config.expansionBudget)), expansionAttempts: 0, passStart: 0,
    done: false, exhausted: false, trimmed: false, exact, phase: exact ? "exact" : "single", archive: new Map(), edges: new Map(), review: [], unreviewed: [],
    subjects: [], subjectIndex: new Map(), variantIds: [], variantIndex: new Map(),
    singles: [], group: 0, variant: 0, beam: [seed], expanded: [], parent: 0, variants: null, groupLimit: -1, beamLimit: 0,
    pairSum: 1, pairLeft: 0, repairJobs: [], repairJob: 0, repairLimit: 0, repaired: [], second: [], secondIndex: 0, secondReferences: [],
    exactStack: [{ state: seed, variantIds: null, position: -1 }] };
  remember(cursor, seed); return cursor;
}

function mustSelect(group: ProductGroup, request: CanonicalRequest) {
  return request.productDoses?.some(row => row.productId === group.productId) || request.retainProductIds.includes(group.productId) && !request.currentSupplements.some(row => row.productId === group.productId);
}
function variant(cursor: SearchCursor, index: number, id: string) {
  const found = quantityById(cursor.groups[index]!.variants, id);
  if (!found) throw new Error("Search cursor lost a physical quantity");
  return found;
}
const quantityBases = new WeakMap<readonly string[], { initial: DoseVariant[]; step: ReturnType<typeof servingIncrement>; upper: bigint }>();
function quantityBasis(cursor: SearchCursor, index: number) {
  const ids = cursor.baseline[index]!;
  let basis = quantityBases.get(ids);
  if (!basis) {
    const initial = ids.map(id => variant(cursor, index, id)), step = servingIncrement(cursor.groups[index]!.product);
    const upper = initial.reduce((highest, row) => {
      const tick = divide(row.dailyUnitsRatio ?? fromDecimal(row.dailyUnits), step), ceiling = (tick.num + tick.den - BigInt(1)) / tick.den;
      return highest > ceiling ? highest : ceiling;
    }, BigInt(1));
    basis = { initial, step, upper }; quantityBases.set(ids, basis);
  }
  return basis;
}
function variantsFor(cursor: SearchCursor, index: number, state: SearchState, request: CanonicalRequest, stop: number): string[] | null {
  const group = cursor.groups[index]!, { initial, step, upper } = quantityBasis(cursor, index);
  if (request.productDoses?.some(row => row.productId === group.productId) || !initial.length) return cursor.baseline[index]!;
  const result = new Set(cursor.baseline[index]);
  for (const target of request.targets) {
    const perServing = initial[0]!.amountPerUnit.get(target.subjectId)?.units;
    if (!perServing || perServing <= 0 || isDeferredConditional(target)) continue;
    for (const tick of targetDoseTicks(request, target, perServing, step, state.exposure.get(target.subjectId) ?? BigInt(0))) {
      const ratio = { num: tick * step.num, den: step.den }, dailyUnits = Number(ratio.num) / Number(ratio.den);
      const id = `${group.sellerId}:${group.productId}:x${dailyUnits}`;
      let found = quantityById(group.variants, id);
      if (!found) { found = compileVariant({ product: group.product, request, dailyUnits, dailyUnitsRatio: ratio }) ?? undefined; if (found) (group.variants as DoseVariant[]).push(found); }
      if (found) result.add(id);
    }
  }
  const key = `${fingerprintState(state)}>${index}`;
  let job = cursor.quantitySearch;
  if (!job || job.key !== key) {
    job = { key, ids: [...result], low: BigInt(1), high: upper, steps: 0 }; cursor.quantitySearch = job;
    const addTick = (tick: bigint) => {
      if (tick < BigInt(1)) return;
      const ratio = multiply(rational(tick), step), dailyUnits = toNumber(ratio), id = `${group.sellerId}:${group.productId}:x${dailyUnits}`;
      if (!quantityById(group.variants, id)) { const next = compileVariant({ product: group.product, request, dailyUnits, dailyUnitsRatio: ratio }); if (next) (group.variants as DoseVariant[]).push(next); }
      if (quantityById(group.variants, id) && !job!.ids.includes(id)) job!.ids.push(id);
    };
    if (request.maxDailyPills != null && group.product.pillCountKnown !== false && group.product.dailyPillsPerServing > 0) {
      const remaining = Math.max(0, request.maxDailyPills - state.pills);
      const tick = divide(divide(fromDecimal(remaining), fromDecimal(group.product.dailyPillsPerServing)), step);
      const nearest = tick.num / tick.den;
      for (const offset of [-BigInt(1), BigInt(0), BigInt(1)]) addTick(nearest + offset);
    }
    const administration = verifiedAdministration(group.product.administration);
    if (request.pricePreferenceBasis === "monthly_30_days" && administration?.packQuantity && administration.unitsPerServing) {
      // The objective is discontinuous when another pack is needed. Include both
      // sides of a bounded set of pack boundaries; evaluation uses the same add()
      // path and consumes the ordinary expansion budget when first attempted.
      const unitsPerTick = multiply(multiply(step, fromDecimal(administration.unitsPerServing)), fromDecimal(30));
      const packTicks = divide(fromDecimal(administration.packQuantity), unitsPerTick);
      const packs = new Set<bigint>([BigInt(1)]);
      if (request.maxPriceMinor != null && group.product.unitPriceMinor > 0) {
        const remaining = Math.max(0, request.maxPriceMinor - (state.monthlyPriceLowerBound ?? 0));
        const affordable = BigInt(Math.floor(remaining / group.product.unitPriceMinor));
        for (const offset of [-BigInt(1), BigInt(0), BigInt(1)]) if (affordable + offset > 0) packs.add(affordable + offset);
      }
      for (const quantity of initial.slice(0, 12)) {
        const count = divide(divide(quantity.dailyUnitsRatio ?? fromDecimal(quantity.dailyUnits), step), packTicks);
        const near = count.num / count.den;
        if (near > 0) packs.add(near);
        packs.add(near + BigInt(1));
      }
      for (const count of packs) {
        const boundary = multiply(rational(count), packTicks), below = boundary.num / boundary.den;
        addTick(below); addTick(below + BigInt(1));
      }
    }
  }
  // Bounded discrete convex probes add useful interior quantities. First-order
  // price is constant in this context. Monthly pack-price steps are sampled,
  // never advertised as a globally convex objective or an exhaustive optimum.
  while (job.low < job.high && job.steps < 8) {
    const middle = (job.low + job.high) / BigInt(2);
    const tick = job.left === undefined ? middle : middle + BigInt(1);
    if (cursor.expansionAttempts >= stop) return null;
    const ratio = multiply(rational(tick), step), dailyUnits = toNumber(ratio), id = `${group.sellerId}:${group.productId}:x${dailyUnits}`;
    if (!quantityById(group.variants, id)) { const next = compileVariant({ product: group.product, request, dailyUnits, dailyUnitsRatio: ratio }); if (next) (group.variants as DoseVariant[]).push(next); }
    const exists = quantityById(group.variants, id);
    // Invalid physical probes still consume an expansion attempt.
    const candidate = exists ? add(cursor, state, index, id, request) : (cursor.expansionAttempts++, completedAttempt(cursor, request), null);
    // Probes are productive expansions too. Preserve their continuation when
    // probing consumes the rest of this group's allowance.
    if (candidate && cursor.phase === "beam") retainBeamState(cursor, candidate, index + 1);
    if (candidate && cursor.phase === "repair") cursor.repaired.push(candidate);
    if (exists && !job.ids.includes(id)) job.ids.push(id);
    const score = candidate ? numericalSearchStateScore(request, candidate) : null;
    if (job.left === undefined) { job.left = score && { profile: score.profile, exactTotal: score.exactTotal }; continue; }
    if (job.left && (!score || compareOverallScores(job.left, score) <= 0)) job.high = middle;
    else job.low = middle + BigInt(1);
    job.left = undefined; job.steps++;
  }
  return job.ids;
}

function reduceReview(cursor: SearchCursor, request: CanonicalRequest) {
  cursor.review = reviewFrontier([...cursor.review, ...cursor.unreviewed], request, [], undefined, cursor.groups);
  cursor.unreviewed = [];
}
function completedAttempt(cursor: SearchCursor, request: CanonicalRequest) {
  // Retention must depend on computational work, not caller chunk/checkpoint
  // size. Keep at most 1,000 fresh states between deterministic reductions.
  if (cursor.expansionAttempts % 1000 === 0) reduceReview(cursor, request);
}
function add(cursor: SearchCursor, state: SearchState, groupIndex: number, id: string, request: CanonicalRequest) {
  const edge = searchSelectionKey(cursor, state.selectedVariantIds) + ">" + indexFor(cursor.variantIds, cursor.variantIndex, id);
  if (cursor.edges.has(edge)) { const key = cursor.edges.get(edge); return key != null ? restoreState(cursor, cursor.archive.get(key)!) : null; }
  cursor.expansionAttempts++;
  let next = tryAddVariant(state, variant(cursor, groupIndex, id), cursor.groups[groupIndex]!, request);
  if (next && next.delivered !== next.exposure && next.delivered.size === next.exposure.size && [...next.delivered].every(([key, value]) => next!.exposure.get(key) === value)) {
    next = { ...next, delivered: next.exposure };
  }
  cursor.edges.set(edge, next ? remember(cursor, next) : null);
  completedAttempt(cursor, request);
  return next;
}

function completionKey(state: SearchState) { return [...state.selectedVariantIds].sort().join("|"); }
function residualCompletions(initial: readonly DoseVariant[], state: SearchState, request: CanonicalRequest) {
  return request.targets.filter(target => !isDeferredConditional(target)).flatMap(target => {
    const intake = [...request.currentSupplements, ...(targetBasis(target) === "total_daily" ? request.dietaryIntake ?? [] : [])];
    if (intake.some(row => row.subjectId === target.subjectId && !intakeIsKnown(row))) return [];
    const residual = target.requested.units - knownTargetExposure(request, target, state.exposure.get(target.subjectId) ?? BigInt(0));
    if (residual <= BigInt(0)) return [];
    // Use immutable, physically compiled quantities. Reconsidering quantities
    // created by interior probes after a yield would change checkpoint order.
    return initial.filter(row => row.contributions.get(target.subjectId)?.units === residual);
  });
}

function resetGroup(cursor: SearchCursor) { cursor.parent = 0; cursor.variant = 0; cursor.variants = null; cursor.groupLimit = -1; }
function startBeam(cursor: SearchCursor) {
  cursor.phase = "beam"; cursor.group = 0; cursor.beamLimit = cursor.expansionAttempts + Math.floor((explorationLimit(cursor) - cursor.expansionAttempts) * .55); resetGroup(cursor);
}
function diverseSingles(cursor: SearchCursor, request: CanonicalRequest) {
  const patterns = new Map<string, typeof cursor.singles>();
  for (const row of cursor.singles) {
    const key = residualPattern(row.state, request);
    const bucket = patterns.get(key) ?? []; bucket.push(row); patterns.set(key, bucket);
  }
  const buckets = [...patterns.values()].map(rows => rows.sort((a,b) => compareSearchStates(a.state,b.state,request)))
    .sort((a,b) => compareSearchStates(a[0]!.state,b[0]!.state,request));
  const result: typeof cursor.singles = [];
  for (let depth=0; result.length < cursor.singles.length; depth++) for (const rows of buckets) if (rows[depth]) result.push(rows[depth]!);
  return result;
}
export function rawDoseLeaders(states: readonly SearchState[], request: CanonicalRequest, limit: number) {
  const facts = new Map(states.map(state => {
    const dose = numericalDoseFitScore(request, state.exposure);
    return [state, { dose, met: doseFitTargetDeviations(dose).filter(row => row.under === 0 && row.over === 0).length }] as const;
  }));
  const order = (a: SearchState, b: SearchState) => compareDoseFit(facts.get(a)!.dose, facts.get(b)!.dose) || compareSearchStates(a, b, request);
  const ranked = [...states].sort(order);
  // Exact-target completion bases retain the same stable prefix without a
  // second complete sort or repeated exposure/deviation reads per comparison.
  const exact = smallest(ranked, 2, (a,b) => facts.get(b)!.met - facts.get(a)!.met || order(a,b));
  const chosen: SearchState[] = [...new Set([ranked[0], ...exact].filter((row): row is SearchState => Boolean(row)))].slice(0,limit);
  const patterns = new Set(chosen.map(state => residualPattern(state,request)));
  for (const state of ranked) {
    const pattern = residualPattern(state, request);
    if (!patterns.has(pattern)) { chosen.push(state); patterns.add(pattern); }
    if (chosen.length >= limit) break;
  }
  for (const state of ranked) { if (chosen.length >= limit) break; if (!chosen.includes(state)) chosen.push(state); }
  return chosen;
}
export function completionReferences(ranked: readonly SearchState[], request: CanonicalRequest) {
  const additiveBases = ranked.flatMap(state => {
    const score = numericalDoseFitScore(request,state.exposure), targets = doseFitTargetDeviations(score);
    if (!targets.every(row=>row.over===0) || !targets.some(row=>row.under>0)) return [];
    const losses = new Map<string, number>();
    // Preserve find()'s first match even for repeated subject references.
    for (const row of targets) if (!losses.has(row.subjectId)) losses.set(row.subjectId, row.under + row.over);
    return [{ state, score, losses }];
  });
  return request.targets.filter(target => !isDeferredConditional(target)).map(target =>
    smallest(additiveBases, 1, (a,b) => (a.losses.get(target.subjectId) ?? Infinity) - (b.losses.get(target.subjectId) ?? Infinity)
      || compareDoseFit(a.score,b.score) || compareSearchStates(a.state,b.state,request))[0]?.state
  ).filter((row): row is SearchState => Boolean(row));
}

function finishBeamLayer(cursor: SearchCursor, request: CanonicalRequest) {
  // Skipping an optional group costs no expansion. Keep unvisited parents when
  // the bounded quantity probes exhaust the layer before every parent runs.
  if (!mustSelect(cursor.groups[cursor.group]!, request)) {
    for (const state of cursor.beam) retainBeamState(cursor, state, cursor.group + 1);
  }
  expandedIndex(cursor.expanded);
  const ranked = cursor.expanded.sort((a,b) => compareSearchStates(a,b,request));
  const size = width(cursor), chosen = profileLeaders(ranked, request, size);
  // Keep a small raw-dose lane as well as each practical profile's incumbent.
  // A single incumbent can contain collateral nutrients that require replacing
  // two products; its neighbours must survive long enough to be repaired.
  for (const row of rawDoseLeaders(ranked, request, Math.ceil(size / 2))) {
    if (chosen.length >= size) break;
    if (!chosen.includes(row)) chosen.push(row);
  }
  for (const row of ranked) { if (chosen.length >= Math.ceil(size / 2)) break; if (!chosen.includes(row)) chosen.push(row); }
  if (ranked.length > size) cursor.trimmed = true;
  const patterns = new Set(chosen.map(row => residualPattern(row,request)));
  for (const row of ranked) {
    if (chosen.length >= size) break;
    const pattern = residualPattern(row, request);
    if (!patterns.has(pattern)) { chosen.push(row); patterns.add(pattern); }
  }
  for (const row of ranked) { if (chosen.length >= size) break; if (!chosen.includes(row)) chosen.push(row); }
  cursor.beam = chosen; cursor.expanded = []; cursor.group++; resetGroup(cursor);
}
function startRepair(cursor: SearchCursor, request: CanonicalRequest) {
  cursor.phase = "repair";
  cursor.singles=[]; cursor.beam=[]; cursor.expanded=[]; cursor.exactStack=[];
  cursor.repairLimit = cursor.expansionAttempts + Math.floor((cursor.expansionBudget - cursor.expansionAttempts) * .75);
  const candidates = [...cursor.review, ...cursor.unreviewed].sort((a,b) => compareSearchStates(a,b,request));
  const leaders = profileLeaders(candidates, request, 5);
  for (const row of candidates) { if (leaders.length >= 5) break; if (!leaders.includes(row)) leaders.push(row); }
  // Preserve unmodified leaders for the second-addition pass. Start the repair
  // allowance with an actual removal; otherwise adding to four already full
  // leaders spends it before even one replacement receives an opportunity.
  cursor.repaired.push(...leaders);
  const jobs: RepairJob[] = leaders.map(leader => ({ leader, removal: 1, base: null, retained: [], build: 0, group: 0, variant: 0, variants: null, stage: "prepare" }));
  if (request.selectorMode === "web_single") {
    // Try collapsing overlapping lines before spending the repair allowance on
    // unrelated replacements. All rebuilds/probes still use add() and the same
    // durable attempt budget. Fixed quantities and retained products stay binding.
    const consolidation: RepairJob[] = [];
    for (const leader of leaders) {
      const selected = leader.selectedVariantIds.map(id => ({ id, index: cursor.groups.findIndex(g => g.variants.some(v => v.variantId === id)) }));
      for (let a = 0; a < selected.length && consolidation.length < 8; a++) {
        for (let b = a + 1; b < selected.length && consolidation.length < 8; b++) {
          const left = selected[a]!, right = selected[b]!;
          if (left.index < 0 || right.index < 0) continue;
          const first = cursor.groups[left.index]!, second = cursor.groups[right.index]!;
          if (mustSelect(first, request) || mustSelect(second, request)) continue;
          const x = first.variants.find(v => v.variantId === left.id)!, y = second.variants.find(v => v.variantId === right.id)!;
          if (!request.targets.some(t => x.contributions.has(t.subjectId) && y.contributions.has(t.subjectId))) continue;
          consolidation.push({ leader, removal: 1, base: null, retained: [], build: 0, group: 0, variant: 0, variants: null, stage: "prepare",
            fixedRemoval: [left.id, right.id], replacementGroups: [left.index, right.index] });
        }
      }
    }
    jobs.unshift(...consolidation);
  }
  cursor.repairJobs = jobs;
}
function removal(ids: readonly string[], index: number): readonly string[] | null {
  if (!index) return [];
  if (index <= ids.length) return [ids[index-1]!];
  let remaining = index - ids.length - 1;
  for (let first=0; first<ids.length; first++) {
    const count=ids.length-first-1;
    if (remaining < count) return [ids[first]!,ids[first+1+remaining]!];
    remaining-=count;
  }
  return null;
}

/** Advance at most maxAttempts new expansions. Cache hits reuse a completed
 * edge, with no recalculation; failed additions and repairs still consume work. */
export function advanceSearchCursor(cursor: SearchCursor, request: CanonicalRequest, maxAttempts: number) {
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1) throw new Error("A positive chunk budget is required");
  const stop = Math.min(cursor.expansionBudget, cursor.expansionAttempts + maxAttempts);
  const seed = seedState(request);
  while (!cursor.done && cursor.expansionAttempts < stop) {
    if (cursor.phase === "exact") {
      const frame = cursor.exactStack.at(-1);
      if (!frame) { cursor.phase="finished"; cursor.done=true; break; }
      const index=frame.state.nextGroupIndex;
      if (index >= cursor.groups.length) { remember(cursor,frame.state); cursor.exactStack.pop(); continue; }
      if (!frame.variantIds) { frame.variantIds=variantsFor(cursor,index,frame.state,request,stop); if (!frame.variantIds) continue; }
      if (frame.position === -1) {
        frame.position=0;
        if (!mustSelect(cursor.groups[index]!,request)) { cursor.exactStack.push({ state:{...frame.state,nextGroupIndex:index+1},variantIds:null,position:-1 }); continue; }
      }
      if (frame.position >= frame.variantIds.length) { cursor.exactStack.pop(); continue; }
      const next=add(cursor,frame.state,index,frame.variantIds[frame.position++]!,request);
      if (next) cursor.exactStack.push({state:{...next,nextGroupIndex:index+1},variantIds:null,position:-1});
    } else if (cursor.phase === "single") {
      if (cursor.group >= cursor.groups.length || cursor.expansionAttempts >= explorationLimit(cursor)) { startBeam(cursor); continue; }
      const ids=cursor.baseline[cursor.group]!;
      if (cursor.variant >= ids.length) { cursor.group++; cursor.variant=0; continue; }
      const id=ids[cursor.variant++]!, next=add(cursor,seed,cursor.group,id,request);
      if (next) cursor.singles.push({state:next,group:cursor.group,variant:id});
    } else if (cursor.phase === "beam") {
      if (cursor.group >= cursor.groups.length || cursor.expansionAttempts >= cursor.beamLimit) {
        cursor.phase="pairs"; cursor.singles=diverseSingles(cursor,request); cursor.pairSum=1; cursor.pairLeft=0; continue;
      }
      if (cursor.groupLimit < 0) cursor.groupLimit=cursor.expansionAttempts + Math.floor((cursor.beamLimit-cursor.expansionAttempts)/(cursor.groups.length-cursor.group));
      if (cursor.parent >= cursor.beam.length || cursor.expansionAttempts >= cursor.groupLimit) { finishBeamLayer(cursor,request); continue; }
      const base=cursor.beam[cursor.parent]!, group=cursor.groups[cursor.group]!;
      if (!cursor.variants) {
        cursor.variants=variantsFor(cursor,cursor.group,base,request,Math.min(stop,cursor.groupLimit)); cursor.variant=0;
        if (!cursor.variants) continue;
        if (!mustSelect(group,request)) retainBeamState(cursor,base,cursor.group+1);
      }
      if (cursor.variant >= cursor.variants.length) { cursor.parent++; cursor.variants=null; continue; }
      const next=add(cursor,base,cursor.group,cursor.variants[cursor.variant++]!,request);
      if (next) retainBeamState(cursor,next,cursor.group+1);
    } else if (cursor.phase === "pairs") {
      // Diagonal traversal gives late complementary listings an opportunity
      // before all quantities paired with the very first listing are exhausted.
      if (cursor.expansionAttempts >= explorationLimit(cursor) || cursor.pairSum >= cursor.singles.length*2-1) { startRepair(cursor,request); continue; }
      const left=cursor.pairLeft++, right=cursor.pairSum-left;
      if (left>=right) { cursor.pairSum++; cursor.pairLeft=Math.max(0,cursor.pairSum-cursor.singles.length+1); continue; }
      if (right>=cursor.singles.length) continue;
      const a=cursor.singles[left]!, b=cursor.singles[right]!;
      if (a.group !== b.group) add(cursor,a.state,b.group,b.variant,request);
    } else if (cursor.phase === "repair") {
      if (cursor.expansionAttempts >= cursor.repairLimit || cursor.repairJobs.every(job => job.stage === "done")) {
        cursor.phase="second";
        // Explored complementary bases remain useful even when they did not win
        // a repair role. Give each target's closest base a completion opportunity.
        const ranked = [...new Map([...cursor.repaired, ...cursor.review, ...cursor.unreviewed].map(row => [fingerprintState(row),row])).values()].sort((a,b)=>compareSearchStates(a,b,request));
        const references = completionReferences(ranked, request);
        // Complete the practical incumbent before the raw-dose lane can spend
        // the remaining allowance on an already excessive routine.
        const complementary = references.slice(0,Math.ceil(width(cursor)/4));
        // The primary practical incumbent retains its labelled quantity order,
        // even when the same basket is also a target reference.
        const primary = ranked[0] ? completionKey(ranked[0]) : null;
        cursor.secondReferences = [...new Set(complementary.map(completionKey))].filter(key => key !== primary);
        cursor.second=[...new Set([...ranked.slice(0,1), ...profileLeaders(ranked,request,width(cursor)), ...complementary])];
        for (const row of rawDoseLeaders(ranked,request,Math.ceil(width(cursor)/2))) {
          if (cursor.second.length >= width(cursor)) break;
          if (!cursor.second.includes(row)) cursor.second.push(row);
        }
        for (const row of ranked) { if (cursor.second.length >= width(cursor)) break; if (!cursor.second.includes(row)) cursor.second.push(row); }
        cursor.repairJobs=[]; cursor.repaired=[];
        cursor.secondIndex=0; cursor.group=0; cursor.variant=0; cursor.variants=null; cursor.groupLimit=-1; continue;
      }
      const job=cursor.repairJobs[cursor.repairJob++ % cursor.repairJobs.length]!;
      if (job.stage === "done") continue;
      if (job.stage === "prepare") {
        const removed=job.fixedRemoval ? (job.removal++ === 1 ? job.fixedRemoval : null) : removal(job.leader.selectedVariantIds,job.removal++);
        if (!removed) { job.stage="done"; continue; }
        job.retained=job.leader.selectedVariantIds.filter(id=>!removed.includes(id)); job.build=0; job.base=seed; job.stage="build";
      }
      if (job.stage === "build") {
        if (job.build < job.retained.length) {
          const id=job.retained[job.build++]!, index=cursor.groups.findIndex(group=>quantityById(group.variants,id));
          if (index<0 || !job.base) throw new Error("Repair lost an incumbent quantity");
          job.base=add(cursor,job.base,index,id,request); if (!job.base) job.stage="prepare";
          continue;
        }
        if (!job.base) throw new Error("Repair has no base");
        remember(cursor,job.base); cursor.repaired.push(job.base); job.stage="add"; job.group=0; job.variant=0; job.variants=null;
      }
      if (job.group >= (job.replacementGroups?.length ?? cursor.groups.length)) { job.stage="prepare"; continue; }
      const groupIndex = job.replacementGroups?.[job.group] ?? job.group;
      if (job.base!.selectedProductIds?.includes(cursor.groups[groupIndex]!.productId)) { job.group++; job.variants=null; continue; }
      if (!job.variants) { job.variants=variantsFor(cursor,groupIndex,job.base!,request,Math.min(stop,cursor.repairLimit)); job.variant=0; if (!job.variants) { cursor.repairJob--; continue; } }
      if (job.variant >= job.variants.length) { job.group++; job.variants=null; continue; }
      const next=add(cursor,job.base!,groupIndex,job.variants[job.variant++]!,request); if (next) cursor.repaired.push(next);
    } else if (cursor.phase === "second") {
      if (cursor.secondIndex >= cursor.second.length) { cursor.phase="finished"; cursor.done=true; cursor.exhausted=true; continue; }
      const base=cursor.second[cursor.secondIndex]!;
      if (cursor.group >= cursor.groups.length) { cursor.secondIndex++; cursor.group=0; cursor.variants=null; cursor.groupLimit=-1; continue; }
      if (base.selectedProductIds?.includes(cursor.groups[cursor.group]!.productId)) { cursor.group++; cursor.variants=null; cursor.groupLimit=-1; continue; }
      if (cursor.groupLimit < 0) cursor.groupLimit=cursor.expansionAttempts + Math.max(1,Math.floor((cursor.expansionBudget-cursor.expansionAttempts)/(cursor.groups.length-cursor.group)));
      if (cursor.expansionAttempts >= cursor.groupLimit) { cursor.group++; cursor.variants=null; cursor.groupLimit=-1; continue; }
      if (!cursor.variants) {
        // Try the already-compiled labelled quantities before interior probes
        // can consume this group's small repair allowance. Completed edges are
        // reused after a yield, so these attempts remain checkpoint-safe.
        const initial=quantityBasis(cursor,cursor.group).initial;
        const residual = cursor.secondReferences.includes(completionKey(base)) && !request.productDoses?.some(row => row.productId === cursor.groups[cursor.group]!.productId)
          ? residualCompletions(initial, base, request) : [];
        const labelled=[...new Set([...residual, initial[0], ...[1,2,3].map(amount=>initial.find(row=>row.dailyUnits===amount))].filter((row): row is DoseVariant=>Boolean(row)))];
        for (const row of labelled) {
          if (cursor.expansionAttempts >= Math.min(stop,cursor.groupLimit)) break;
          add(cursor,base,cursor.group,row.variantId,request);
        }
        if (cursor.expansionAttempts >= Math.min(stop,cursor.groupLimit)) continue;
        cursor.variants=variantsFor(cursor,cursor.group,base,request,Math.min(stop,cursor.groupLimit)); cursor.variant=0; if (!cursor.variants) continue;
      }
      if (cursor.variant >= cursor.variants.length) { cursor.group++; cursor.variants=null; cursor.groupLimit=-1; continue; }
      add(cursor,base,cursor.group,cursor.variants[cursor.variant++]!,request);
    } else cursor.done=true;
  }
  if (cursor.expansionAttempts >= cursor.expansionBudget && !cursor.done) { cursor.done=true; cursor.trimmed=true; }
  if (cursor.done) {
    reduceReview(cursor, request);
    // Bounded expansion restarts from the archive. Obsolete phase frontiers
    // must not be copied into every subsequent durable checkpoint.
    if (!cursor.exact) {
      cursor.singles=[]; cursor.beam=[]; cursor.expanded=[]; cursor.repairJobs=[];
      cursor.repaired=[]; cursor.second=[]; cursor.secondReferences=[]; cursor.exactStack=[];
    }
  }
  return cursor;
}

export function extendSearchCursor(cursor: SearchCursor, expansionBudget: number) {
  if (!Number.isSafeInteger(expansionBudget) || expansionBudget < cursor.expansionBudget) throw new Error("Expanded budget cannot decrease");
  if (expansionBudget===cursor.expansionBudget) return cursor;
  cursor.passStart=cursor.expansionAttempts; cursor.expansionBudget=expansionBudget; cursor.config={...cursor.config, expansionBudget};
  if (cursor.exact && cursor.phase === "finished") return cursor;
  cursor.done=false;
  if (!cursor.exact) {
    cursor.phase="single"; cursor.group=0; cursor.variant=0; cursor.singles=[]; cursor.expanded=[]; cursor.parent=0; cursor.variants=null;
    cursor.repaired=[]; cursor.repairJobs=[]; cursor.repairJob=0; cursor.second=[]; cursor.secondIndex=0; cursor.secondReferences=[];
    // Completed edges remain cached and incumbents stay in the archive. Wider
    // exploration evaluates only edges absent from the standard pass.
    cursor.beam=[restoreState(cursor, cursor.archive.values().next().value!)];
  }
  return cursor;
}

export function searchCursorResult(cursor: SearchCursor, request: CanonicalRequest): SearchRun {
  const complete=cursor.exact && cursor.done && !cursor.trimmed ? [...archivedSearchStates(cursor)] : cursor.done ? cursor.review :
    reviewFrontier([...cursor.review, ...cursor.unreviewed], request, [], undefined, cursor.groups);
  return { complete, groups:cursor.groups, expansionAttempts:cursor.expansionAttempts,
    mode:cursor.exact && cursor.done && !cursor.trimmed ? "exact" : "bounded", trimmed:cursor.trimmed || !cursor.exact || !cursor.done };
}
