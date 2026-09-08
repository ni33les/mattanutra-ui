/** Independent, finite-grid experiment oracle. No production scoring, search,
 * candidate generation, eligibility or selection implementation is used here. */
export type OracleDecimal = string | number;
export type OracleExact = Readonly<{ numerator: string; denominator: string }>;
type Q = Readonly<{ n: bigint; d: bigint }>;
type ProfileRational = Readonly<{ num: bigint; den: bigint }>;
type Metric = "productCount" | "dailyPills" | "priceMinor";
type Scope = "supplemental" | "dietary";
export type OracleProfile = Readonly<{
  id: string;
  nutrientAlpha: ProfileRational;
  preferenceCurve: "off" | "linear" | "quadratic";
  preferenceWeights: Readonly<Record<Metric, ProfileRational>>;
  zeroPreferenceScales: Readonly<Record<Metric, ProfileRational> & { currency: string }>;
}>;
export type ExperimentOracleFixture = Readonly<{
  currency: string;
  /** Every amount for a subject uses this declared canonical unit. No conversion is inferred. */
  subjectUnits: Readonly<Record<string, string>>;
  targets: readonly Readonly<{ subjectId: string; amount: OracleDecimal; basis: "supplemental" | "total_daily"; importance: "required" | "core" | "optional" }>[];
  /** Each subject has exactly one row per scope, including explicitly known zero or unknown null. */
  intake: readonly Readonly<{ subjectId: string; scope: Scope; certainty: "known" | "estimated" | "unknown"; amount: OracleDecimal | null; minimum?: OracleDecimal; maximum?: OracleDecimal }>[];
  limits: readonly Readonly<{ subjectId: string; amount: OracleDecimal; scope: "supplemental" | "total" }>[];
  products: readonly Readonly<{ productId: string; sellerId: string; priceMinor: number | null; pillsPerServing: OracleDecimal | null;
    doses: readonly OracleDecimal[]; contributions: Readonly<Record<string, OracleDecimal | null>>; eligible: boolean }>[];
  preferences?: Readonly<Partial<Record<Metric, OracleDecimal | null>>>;
  excludeProductIds?: readonly string[];
  excludeSubjectIds?: readonly string[];
  productDoses?: readonly Readonly<{ productId: string; servingsPerDay: OracleDecimal }>[];
  requiredProductIds?: readonly string[];
  optimization?: "balanced" | "best_coverage" | "fewest_pills" | "lowest_cost";
}>;

const Z: Q = { n: BigInt(0), d: BigInt(1) }, ONE: Q = { n: BigInt(1), d: BigInt(1) };
const METRICS: readonly Metric[] = ["productCount", "dailyPills", "priceMinor"];
const MAX_ENUMERATION = 250_000;
function q(n: bigint, d = BigInt(1)): Q {
  if (d <= BigInt(0)) throw new Error("Oracle denominator must be positive");
  let a = n < BigInt(0) ? -n : n, b = d;
  while (b) [a, b] = [b, a % b];
  return { n: n / (a || BigInt(1)), d: d / (a || BigInt(1)) };
}
function decimal(input: OracleDecimal): Q {
  const value = /^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(String(input));
  if (!value) throw new Error(`Invalid oracle decimal: ${input}`);
  const exp = Number(value[4] ?? 0) - (value[3]?.length ?? 0);
  if (!Number.isSafeInteger(exp) || Math.abs(exp) > 40) throw new Error("Oracle decimal precision limit exceeded");
  const n = BigInt(value[2] + (value[3] ?? "")) * (value[1] === "-" ? -BigInt(1) : BigInt(1));
  return exp >= 0 ? q(n * BigInt(10) ** BigInt(exp)) : q(n, BigInt(10) ** BigInt(-exp));
}
const add = (a: Q, b: Q) => q(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a: Q, b: Q) => q(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a: Q, b: Q) => q(a.n * b.n, a.d * b.d);
const div = (a: Q, b: Q) => { if (b.n <= BigInt(0)) throw new Error("Oracle positive divisor required"); return q(a.n * b.d, a.d * b.n); };
const cmp = (a: Q, b: Q) => a.n * b.d < b.n * a.d ? -1 : a.n * b.d > b.n * a.d ? 1 : 0;
const pos = (a: Q) => cmp(a, Z) > 0 ? a : Z;
const abs = (a: Q) => q(a.n < BigInt(0) ? -a.n : a.n, a.d);
const sum = (a: readonly Q[]) => a.reduce(add, Z);
const exact = (a: Q): OracleExact => ({ numerator: String(a.n), denominator: String(a.d) });
const value = (a: Q) => Number(a.n) / Number(a.d);
const fromProfile = (a: ProfileRational) => q(a.num, a.den);
const curve = (d: Q, alpha: Q) => add(mul(sub(ONE, alpha), d), mul(alpha, mul(d, d)));
const metricFacts = (a: Q) => ({ value: value(a), exact: exact(a) });
const positiveDecimal = (a: OracleDecimal, name: string, zero = false) => { const result = decimal(a); if (cmp(result, Z) < (zero ? 0 : 1)) throw new Error(`Invalid ${name}`); return result; };

/** Defaults are independent declarations, not production arithmetic helpers. */
export const ORACLE_PROFILES: readonly OracleProfile[] = [0, 0.5, 1].flatMap(alpha => (["off", "linear", "quadratic"] as const).map(preferenceCurve => ({
  id: `${alpha === 0 ? "linear" : alpha === 0.5 ? "mixed" : "quadratic"}-${preferenceCurve}`,
  nutrientAlpha: { num: decimal(alpha).n, den: decimal(alpha).d }, preferenceCurve,
  preferenceWeights: Object.fromEntries(METRICS.map(key => [key, { num: BigInt(1), den: BigInt(4) }])) as Record<Metric, ProfileRational>,
  zeroPreferenceScales: { productCount: { num: BigInt(1), den: BigInt(1) }, dailyPills: { num: BigInt(1), den: BigInt(1) }, priceMinor: { num: BigInt(10000), den: BigInt(1) }, currency: "THB" }
})));

type Point = Readonly<{ supplemental: Q; dietary: Q; targetDeviation: Q; targetExcess: Q; under: Q; continuedIncrease: Q; limits: readonly Q[] }>;
type Subject = Readonly<{ subjectId: string; target: ExperimentOracleFixture["targets"][number] | undefined; points: readonly Point[]; nutrientEvidenceComplete: boolean }>;
export type OracleCandidate = Readonly<{
  signature: string;
  quantities: readonly Readonly<{ productId: string; sellerId: string; servingsPerDay: number; exact: OracleExact }>[];
  purchaseEligible: boolean;
  metrics: Readonly<{ productCount: number; dailyPills: number | null; priceMinor: number | null; nutrientEvidenceComplete: boolean;
    subjects: readonly Readonly<{ subjectId: string; unit: string; basis: string | null; importance: string | null; nutrientEvidenceComplete: boolean;
      supplementalCertainty: "known" | "estimated" | "unknown"; dietaryCertainty: "known" | "estimated" | "unknown";
      supplementalNominal: number | null; dietaryNominal: number | null; quantifiedExposureOnly: boolean;
      points: readonly Readonly<{ supplemental: ReturnType<typeof metricFacts>; dietary: ReturnType<typeof metricFacts>; targetDeviation: ReturnType<typeof metricFacts>; targetExcess: ReturnType<typeof metricFacts>; under: ReturnType<typeof metricFacts>; continuedIncrease: ReturnType<typeof metricFacts>; limitExcesses: readonly ReturnType<typeof metricFacts>[] }>[] }>[] }>;
  scores: Readonly<Record<string, Readonly<{ complete: boolean; nutrientEvidenceComplete: boolean; exact: OracleExact | null; quantifiedNutrientExact: OracleExact;
    preferenceExact: OracleExact | null; incompleteReasons: readonly string[]; protectedPareto: boolean }>>>;
}>;
type Working = { candidate: OracleCandidate; subjects: Subject[]; protectedVector: Q[]; scoreValues: Map<string, Q | null>; coverageBasisPoints: number; commercialSignature: string };

function validate(f: ExperimentOracleFixture, profiles: readonly OracleProfile[]) {
  if (!f.currency || !Object.keys(f.subjectUnits).length || Object.values(f.subjectUnits).some(unit => !unit)) throw new Error("Explicit currency and subject units required");
  if (f.optimization != null && !["balanced", "best_coverage", "fewest_pills", "lowest_cost"].includes(f.optimization)) throw new Error("Invalid oracle commercial objective");
  const subjects = new Set(Object.keys(f.subjectUnits));
  if (new Set(f.targets.map(t => t.subjectId)).size !== f.targets.length) throw new Error("Duplicate oracle target");
  for (const t of f.targets) {
    if (!subjects.has(t.subjectId) || !["supplemental", "total_daily"].includes(t.basis) || !["required", "core", "optional"].includes(t.importance)) throw new Error("Explicit target basis and importance required");
    positiveDecimal(t.amount, "target");
  }
  for (const id of subjects) for (const scope of ["supplemental", "dietary"] as const) {
    const rows = f.intake.filter(row => row.subjectId === id && row.scope === scope);
    if (rows.length !== 1) throw new Error(`Explicit intake certainty required: ${id}/${scope}`);
    const row = rows[0]!;
    if (!["known", "estimated", "unknown"].includes(row.certainty)) throw new Error("Explicit intake certainty required");
    if (row.certainty === "unknown") { if (row.amount !== null || row.minimum != null || row.maximum != null) throw new Error("Unknown intake must be null, never zero"); }
    else {
      if (row.amount === null) throw new Error("Quantified intake requires amount");
      const amount = positiveDecimal(row.amount, "intake", true), lo = positiveDecimal(row.minimum ?? row.amount, "intake minimum", true), hi = positiveDecimal(row.maximum ?? row.amount, "intake maximum", true);
      if (cmp(lo, amount) > 0 || cmp(amount, hi) > 0 || row.certainty === "known" && (cmp(lo, hi) !== 0)) throw new Error("Invalid intake interval or knownness");
    }
  }
  if (f.intake.some(row => !subjects.has(row.subjectId) || !["supplemental", "dietary"].includes(row.scope))) throw new Error("Unexpected oracle intake identity");
  for (const limit of f.limits) { if (!subjects.has(limit.subjectId) || !["total", "supplemental"].includes(limit.scope)) throw new Error("Explicit reference scope required"); positiveDecimal(limit.amount, "limit"); }
  if (new Set(f.products.map(p => `${p.sellerId}:${p.productId}`)).size !== f.products.length) throw new Error("Duplicate oracle listing");
  if (f.products.length > 64) throw new Error("Oracle enumeration limit: at most64 explicit listings");
  let leaves = BigInt(1);
  for (const p of f.products) {
    if (!p.productId || !p.sellerId || typeof p.eligible !== "boolean" || !p.doses.length) throw new Error("Explicit product identity, eligibility and dose grid required");
    const doses = p.doses.map(d => positiveDecimal(d, "physical dose"));
    if (new Set(doses.map(d => `${d.n}/${d.d}`)).size !== doses.length) throw new Error("Duplicate oracle dose grid quantity");
    leaves *= BigInt(doses.length + 1);
    if (leaves > BigInt(MAX_ENUMERATION)) throw new Error(`Oracle enumeration limit (${MAX_ENUMERATION}) exceeded; no partial oracle is returned`);
    if (p.priceMinor !== null && (!Number.isSafeInteger(p.priceMinor) || p.priceMinor < 0)) throw new Error("Invalid price");
    if (p.pillsPerServing !== null) positiveDecimal(p.pillsPerServing, "pills", true);
    for (const [id, amount] of Object.entries(p.contributions)) { if (!subjects.has(id)) throw new Error("Contribution unit not declared"); if (amount !== null) positiveDecimal(amount, "contribution", true); }
  }
  for (const key of METRICS) if (f.preferences?.[key] != null) positiveDecimal(f.preferences[key]!, "preference", true);
  if (!profiles.length || new Set(profiles.map(p => p.id)).size !== profiles.length) throw new Error("Unique explicit profiles required");
  for (const p of profiles) {
    const alpha = fromProfile(p.nutrientAlpha);
    if (cmp(alpha, Z) < 0 || cmp(alpha, ONE) > 0 || !["off", "linear", "quadratic"].includes(p.preferenceCurve)) throw new Error("Invalid profile alpha or curve");
    for (const key of METRICS) {
      if (cmp(fromProfile(p.preferenceWeights[key]), Z) < 0 || cmp(fromProfile(p.zeroPreferenceScales[key]), Z) <= 0) throw new Error("Invalid profile preference weight or zero scale");
    }
    if (p.preferenceCurve !== "off" && cmp(fromProfile(p.preferenceWeights.priceMinor), Z) > 0 && f.preferences?.priceMinor != null && cmp(decimal(f.preferences.priceMinor), Z) === 0 && f.currency !== p.zeroPreferenceScales.currency) throw new Error("Zero-price normalization requires the fixture currency; no implicit exchange rate");
  }
  for (const proposal of f.productDoses ?? []) {
    if (f.excludeProductIds?.includes(proposal.productId) || !f.products.some(p => p.productId === proposal.productId && p.eligible && p.doses.some(d => cmp(decimal(d), decimal(proposal.servingsPerDay)) === 0))) throw new Error("Proposed product quantity conflicts with the explicit feasible grid or exclusion");
  }
}

function intake(f: ExperimentOracleFixture, subjectId: string, scope: Scope) {
  const row = f.intake.find(r => r.subjectId === subjectId && r.scope === scope)!;
  return { row, bounds: row.amount === null ? [Z] : [decimal(row.minimum ?? row.amount), decimal(row.maximum ?? row.amount)] };
}

function evaluate(f: ExperimentOracleFixture, chosen: readonly { product: ExperimentOracleFixture["products"][number]; dose: Q }[], profiles: readonly OracleProfile[]): Working {
  const subjects: Subject[] = [];
  for (const subjectId of Object.keys(f.subjectUnits).sort()) {
    const target = f.targets.find(row => row.subjectId === subjectId), supplemental = intake(f, subjectId, "supplemental"), dietary = intake(f, subjectId, "dietary");
    const limitRows = f.limits.filter(row => row.subjectId === subjectId);
    const added = sum(chosen.map(({ product, dose }) => mul(decimal(product.contributions[subjectId] ?? 0), dose)));
    const useDietary = target?.basis === "total_daily" || limitRows.some(row => row.scope === "total");
    // Bounded estimates supply evidence for the complete interval calculation.
    // They remain estimated, while an unknown quantity makes evidence incomplete.
    const nutrientEvidenceComplete = supplemental.row.certainty !== "unknown" && (!useDietary || dietary.row.certainty !== "unknown") && !chosen.some(row => row.product.contributions[subjectId] === null);
    const knownContinued = !target && supplemental.row.certainty === "known" && supplemental.row.amount !== null ? decimal(supplemental.row.amount) : Z;
    const points = supplemental.bounds.flatMap(s => dietary.bounds.map(food => {
      const totalSupp = add(s, added), delivered = add(totalSupp, target?.basis === "total_daily" ? food : Z);
      const ratio = target ? div(sub(delivered, decimal(target.amount)), decimal(target.amount)) : Z;
      return { supplemental: totalSupp, dietary: food, targetDeviation: abs(ratio), targetExcess: pos(ratio), under: pos(q(-ratio.n, ratio.d)),
        continuedIncrease: cmp(knownContinued, Z) > 0 ? div(added, knownContinued) : Z,
        limits: limitRows.map(l => div(pos(sub(add(totalSupp, l.scope === "total" ? food : Z), decimal(l.amount))), decimal(l.amount))) };
    }));
    subjects.push({ subjectId, target, points, nutrientEvidenceComplete });
  }
  const price = chosen.some(row => row.product.priceMinor === null) ? null : sum(chosen.map(row => decimal(row.product.priceMinor!)));
  const pills = chosen.some(row => row.product.pillsPerServing === null) ? null : sum(chosen.map(row => mul(decimal(row.product.pillsPerServing!), row.dose)));
  const actual: Record<Metric, Q | null> = { productCount: decimal(chosen.length), dailyPills: pills, priceMinor: price };
  const protectedVector = subjects.flatMap(subject => {
    const max = (fn: (point: Point) => Q) => subject.points.map(fn).reduce((a, b) => cmp(a, b) >= 0 ? a : b, Z);
    return [...(subject.target && subject.target.importance !== "optional" ? [max(p => p.targetDeviation), max(p => p.targetExcess)] : []),
      max(p => p.continuedIncrease), ...f.limits.filter(l => l.subjectId === subject.subjectId).map((_, i) => max(p => p.limits[i]!))];
  });
  const scoreValues = new Map<string, Q | null>();
  const nutrientEvidenceComplete = subjects.every(s => s.nutrientEvidenceComplete);
  const scores = Object.fromEntries(profiles.map(profile => {
    const alpha = fromProfile(profile.nutrientAlpha);
    const nutrient = sum(subjects.map(subject => subject.points.map(point => add(add(curve(point.targetDeviation, alpha), curve(point.continuedIncrease, alpha)), mul(decimal(2), sum(point.limits)))).reduce((a, b) => cmp(a, b) >= 0 ? a : b, Z)));
    let preference = Z; const incompleteReasons: string[] = [];
    for (const key of METRICS) {
      const preferredInput = f.preferences?.[key];
      if (profile.preferenceCurve === "off" || preferredInput == null || cmp(fromProfile(profile.preferenceWeights[key]), Z) === 0) continue;
      if (actual[key] === null) { incompleteReasons.push(`unknown_${key}`); continue; }
      const preferred = decimal(preferredInput), d = div(pos(sub(actual[key]!, preferred)), cmp(preferred, Z) > 0 ? preferred : fromProfile(profile.zeroPreferenceScales[key]));
      preference = add(preference, mul(fromProfile(profile.preferenceWeights[key]), profile.preferenceCurve === "quadratic" ? mul(d, d) : d));
    }
    const total = incompleteReasons.length ? null : add(nutrient, preference); scoreValues.set(profile.id, total);
    return [profile.id, { complete: total !== null, nutrientEvidenceComplete, exact: total === null ? null : exact(total), quantifiedNutrientExact: exact(nutrient), preferenceExact: total === null ? null : exact(preference), incompleteReasons, protectedPareto: false }];
  }));
  const quantities = chosen.map(({ product, dose }) => ({ productId: product.productId, sellerId: product.sellerId, servingsPerDay: value(dose), exact: exact(dose) }));
  const signature = quantities.length ? quantities.map(row => `${row.sellerId}:${row.productId}@${row.exact.numerator}/${row.exact.denominator}`).join("|") : "empty";
  const commercialSignature = quantities.length ? `${quantities[0]!.sellerId}|${quantities.map(row => `${row.sellerId}:${row.productId}:x${row.servingsPerDay}`).sort().join("|")}` : "empty";
  const coveragePoints = f.targets.map(target => {
    const current = f.intake.filter(row => row.subjectId === target.subjectId && row.certainty === "known" && (row.scope === "supplemental" || target.basis === "total_daily"));
    const got = add(sum(current.map(row => decimal(row.amount!))), sum(chosen.map(({ product, dose }) => mul(decimal(product.contributions[target.subjectId] ?? 0), dose))));
    const ratio = div(cmp(got, decimal(target.amount)) > 0 ? decimal(target.amount) : got, decimal(target.amount));
    return Number((ratio.n * BigInt(10000)) / ratio.d);
  });
  const coverageBasisPoints = coveragePoints.length ? Math.round(coveragePoints.reduce((a, b) => a + b, 0) / coveragePoints.length) : 0;
  return { subjects, protectedVector, scoreValues, coverageBasisPoints, commercialSignature, candidate: { signature, quantities, purchaseEligible: chosen.length > 0,
    metrics: { productCount: chosen.length, dailyPills: pills === null ? null : value(pills), priceMinor: price === null ? null : value(price), nutrientEvidenceComplete,
      subjects: subjects.map(s => ({ subjectId: s.subjectId, unit: f.subjectUnits[s.subjectId]!, basis: s.target?.basis ?? null, importance: s.target?.importance ?? null, nutrientEvidenceComplete: s.nutrientEvidenceComplete,
        supplementalCertainty: intake(f, s.subjectId, "supplemental").row.certainty, dietaryCertainty: intake(f, s.subjectId, "dietary").row.certainty,
        supplementalNominal: intake(f, s.subjectId, "supplemental").row.amount === null ? null : Number(intake(f, s.subjectId, "supplemental").row.amount),
        dietaryNominal: intake(f, s.subjectId, "dietary").row.amount === null ? null : Number(intake(f, s.subjectId, "dietary").row.amount), quantifiedExposureOnly: !s.nutrientEvidenceComplete,
        points: s.points.map(p => ({ supplemental: metricFacts(p.supplemental), dietary: metricFacts(p.dietary), targetDeviation: metricFacts(p.targetDeviation), targetExcess: metricFacts(p.targetExcess), under: metricFacts(p.under), continuedIncrease: metricFacts(p.continuedIncrease), limitExcesses: p.limits.map(metricFacts) })) })) }, scores } };
}

/** Exhaustive only over the fixture's published explicit grids. Refuses oversized
 * grids before enumeration; no finite grid is claimed to cover all physical doses. */
export function enumerateOracle(fixture: ExperimentOracleFixture, profiles: readonly OracleProfile[] = ORACLE_PROFILES) {
  validate(fixture, profiles);
  const products = [...fixture.products].sort((a, b) => `${a.sellerId}:${a.productId}`.localeCompare(`${b.sellerId}:${b.productId}`));
  const working: Working[] = []; let enumerated = 0;
  function visit(index: number, chosen: readonly { product: ExperimentOracleFixture["products"][number]; dose: Q }[]) {
    if (index === products.length) {
      if (++enumerated > MAX_ENUMERATION) throw new Error("Oracle enumeration limit exceeded");
      if ((fixture.requiredProductIds ?? []).some(id => !chosen.some(row => row.product.productId === id)) || (fixture.productDoses ?? []).some(d => !chosen.some(row => row.product.productId === d.productId && cmp(row.dose, decimal(d.servingsPerDay)) === 0))) return;
      working.push(evaluate(fixture, chosen, profiles)); return;
    }
    const p = products[index]!; visit(index + 1, chosen);
    if (!p.eligible || fixture.excludeProductIds?.includes(p.productId) || fixture.excludeSubjectIds?.some(id => Object.hasOwn(p.contributions, id)) || chosen.some(row => row.product.sellerId !== p.sellerId || row.product.productId === p.productId)) return;
    for (const dose of p.doses.map(decimal).sort(cmp)) visit(index + 1, [...chosen, { product: p, dose }]);
  }
  visit(0, []);
  const dominates = (a: Working, b: Working) => a.protectedVector.every((x, i) => cmp(x, b.protectedVector[i]!) <= 0) && a.protectedVector.some((x, i) => cmp(x, b.protectedVector[i]!) < 0);
  const protectedPareto = new Set(working.filter(a => !working.some(b => dominates(b, a))));
  const activePreference = (profile: OracleProfile) => profile.preferenceCurve !== "off" && METRICS.some(key => fixture.preferences?.[key] != null && cmp(fromProfile(profile.preferenceWeights[key]), Z) > 0);
  const protect = (profile: OracleProfile) => !activePreference(profile) && fixture.targets.some(t => t.importance === "optional") && fixture.targets.some(t => t.importance !== "optional");
  const ordered = (profile: OracleProfile) => [...working].filter(a => a.scoreValues.get(profile.id) !== null && (!protect(profile) || protectedPareto.has(a))).sort((a, b) => {
    const score = cmp(a.scoreValues.get(profile.id)!, b.scoreValues.get(profile.id)!); if (score) return score;
    const unknownPills = Number(a.candidate.metrics.dailyPills === null) - Number(b.candidate.metrics.dailyPills === null);
    const pillDifference = unknownPills || (a.candidate.metrics.dailyPills === null ? 0 : a.candidate.metrics.dailyPills - (b.candidate.metrics.dailyPills ?? 0));
    if (fixture.optimization === "fewest_pills" && pillDifference) return pillDifference;
    if (["balanced", "best_coverage"].includes(fixture.optimization ?? "balanced") && a.coverageBasisPoints !== b.coverageBasisPoints) return b.coverageBasisPoints - a.coverageBasisPoints;
    for (const key of ["priceMinor", "dailyPills", "productCount"] as const) {
      const x = a.candidate.metrics[key], y = b.candidate.metrics[key];
      if ((x === null) !== (y === null)) return x === null ? 1 : -1;
      if (x !== null && y !== null && x !== y) return x - y;
    }
    return a.commercialSignature.localeCompare(b.commercialSignature);
  });
  return { exhaustive: true as const, gridOnly: true as const, enumerated,
    candidates: working.map(row => ({ ...row.candidate, scores: Object.fromEntries(Object.entries(row.candidate.scores).map(([id, score]) => [id, { ...score, protectedPareto: protectedPareto.has(row) }])) })),
    profiles: Object.fromEntries(profiles.map(profile => { const ranked = ordered(profile); return [profile.id, { selectedSignature: ranked[0]?.candidate.signature ?? null, rankedSignatures: ranked.map(row => row.candidate.signature), protectedPolicy: protect(profile) ? "raw_protected_pareto" : activePreference(profile) ? "explicit_preference_tradeoff" : "nutrient_score_without_optional_core_conflict" }]; })) };
}
