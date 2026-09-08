import { basketOfCandidate, type ExperimentCandidate } from "./search.ts";
import { assessPreferences, type PreferenceAssessment } from "../preferences.ts";
import { compare, fromDecimal, rational, type Rational } from "./rational.ts";
import type { ExperimentalScore } from "./score.ts";
import type { CanonicalRequest, CoverageSummaryRow, DoseFitScore, ScoredBasket } from "../types.ts";

export type NeutralComparison = "improved" | "unchanged" | "worsened" | "tradeoff" | "incomparable";
export type CandidateMetrics = Readonly<{
  signature: string; sellerId: string; productIds: readonly string[];
  variantDoses: NonNullable<ScoredBasket["variantDoses"]>;
  productCount: number; dailyPills: number | null; priceMinor: number; baselineDoseLoss: number; maxProportionalDeviation: number; currency: string; purchaseEligible: boolean;
  coverage: readonly CoverageSummaryRow[];
  targetDeviations: DoseFitScore["perTarget"];
  continuedDoseDeviations: NonNullable<DoseFitScore["perContinuedDose"]>;
  references: readonly (DoseFitScore["perLimit"][number] & { referenceConfidence?: string; basisRationale?: string | null })[];
  preferences: readonly PreferenceAssessment[];
  safety: readonly Record<string, unknown>[];
  uncertaintyNotes: readonly string[];
  /** Lower is better on every axis; null means that axis cannot be compared. */
  neutralVector: Readonly<Record<string, string | null>>;
}>;
export type ScoreBreakdown = Record<string, unknown>;
export type AdditionalCandidates = Readonly<{
  purchaseFallback?: CandidateMetrics | null;
  incompleteCandidates?: Readonly<{ count: number; examples: readonly CandidateMetrics[] }>;
}>;
export type ProfileComparison = Readonly<{
  profileId: string; profileHash: string;
  fullSearch: AdditionalCandidates & Readonly<{ metrics: CandidateMetrics | null; score: ScoreBreakdown | null; searchSummary: Readonly<{ expansionAttempts: number; expansionBudget: number; complete: boolean; effort?: string; quantityProbes?: number }> }>;
  commonPool: AdditionalCandidates & Readonly<{ metrics: CandidateMetrics | null; score: ScoreBreakdown | null; poolSize: number; poolHash?: string; complete?: boolean }>;
  sensitivity?: readonly Readonly<{ weight: string; scope: "rescoring_only"; metrics: CandidateMetrics | null; score: ScoreBreakdown | null }>[];
  oracle?: Record<string, unknown>;
}>;
export type CaseComparison = Readonly<{
  id: string; kind: "catalogue" | "synthetic"; provenance?: Record<string, unknown>;
  baseline: CandidateMetrics | null; profiles: readonly ProfileComparison[];
}>;
export type ComparisonReport = Readonly<{
  title: string; sourceCommit: string; provenance?: Record<string, unknown>;
  cases: readonly CaseComparison[];
  shortlist?: readonly Readonly<{ profileId: string; reason: string }>[];
}>;

function exact(value: Rational): string { return value.den === BigInt(1) ? String(value.num) : `${value.num}/${value.den}`; }
/** Serializes the full decomposition, including rational quantities too large for Number. */
export function scoreBreakdown(score: ExperimentalScore): ScoreBreakdown {
  function convert(value: unknown): unknown {
    if (typeof value === "bigint") return String(value);
    if (Array.isArray(value)) return value.map(convert);
    if (value && typeof value === "object") {
      const row = value as Record<string, unknown>;
      if (typeof row.num === "bigint" && typeof row.den === "bigint" && Object.keys(row).length === 2) return exact(value as Rational);
      return Object.fromEntries(Object.entries(row).map(([key, item]) => [key, convert(item)]));
    }
    return value;
  }
  return convert(score) as ScoreBreakdown;
}

/** Materialize only displayed winners; candidate pools remain lightweight search states. */
export function candidateMetrics(candidate: ExperimentCandidate | null, request: CanonicalRequest): CandidateMetrics | null {
  if (!candidate) return null;
  const basket = basketOfCandidate(candidate, request);
  if (!basket) throw new Error(`Report candidate failed physical/eligibility revalidation: ${candidate.signature}`);
  const fit = basket.doseFit;
  if (!fit) throw new Error("Report candidate has no factual dose ledger");
  const dailyPills = basket.pillCountKnown === false ? null : basket.dailyPills;
  const uncertainty = new Set(candidate.score.uncertaintyNotes);
  for (const id of fit.unknownSubjectIds) uncertainty.add(`unknown_exposure:${id}`);
  for (const id of fit.estimatedSubjectIds) uncertainty.add(`estimated_exposure:${id}`);
  if (dailyPills === null) uncertainty.add("unknown_daily_pills");
  const neutralVector: Record<string, string | null> = {
    product_count: String(basket.productCount), price_minor: String(basket.priceMinor),
    daily_pills: dailyPills === null ? null : exact(fromDecimal(dailyPills))
  };
  for (const row of fit.perTarget) {
    neutralVector[`target_under:${row.subjectId}`] = row.certainty === "known" ? exact(fromDecimal(row.under)) : null;
    neutralVector[`target_over:${row.subjectId}`] = row.certainty === "known" ? exact(fromDecimal(row.over)) : null;
  }
  for (const row of fit.perContinuedDose ?? []) neutralVector[`continued_excess:${row.subjectId}`] = row.certainty === "known" ? exact(fromDecimal(row.over)) : null;
  const references = fit.perLimit.map(row => {
    const reference = request.safetyCeilings?.find(ceiling => ceiling.subjectId === row.subjectId && (ceiling.sourceScope ?? "supplemental") === row.sourceScope && (row.ruleId === null || row.ruleId.includes(ceiling.bandId ?? "\u0000")));
    // A provenance-free synthetic limit may have no band ID. Match its declared
    // scope/name only after the production ledger has selected the actual rule.
    const declared = reference ?? request.safetyCeilings?.find(ceiling => ceiling.subjectId === row.subjectId && (ceiling.sourceScope ?? "supplemental") === row.sourceScope && ceiling.name === row.name && !ceiling.bandId);
    neutralVector[`limit_excess:${row.sourceScope}:${row.subjectId}`] = row.certainty === "known" ? exact(fromDecimal(row.excess)) : null;
    if (declared?.referenceConfidence && declared.referenceConfidence !== "high") uncertainty.add(`unverified_reference:${row.sourceScope}:${row.subjectId}`);
    return { ...row, ...(declared?.referenceConfidence ? { referenceConfidence: declared.referenceConfidence } : {}), ...(declared?.basisRationale === undefined ? {} : { basisRationale: declared.basisRationale }) };
  });
  return {
    signature: candidate.signature, sellerId: basket.sellerId, productIds: basket.productIds, variantDoses: basket.variantDoses ?? [],
    productCount: basket.productCount, dailyPills, priceMinor: basket.priceMinor, baselineDoseLoss: fit.total,
    maxProportionalDeviation: Math.max(0, ...fit.perTarget.flatMap(row => [row.under, row.over])), currency: request.currency,
    purchaseEligible: basket.productCount > 0 && !basket.safety.hardBlocked,
    coverage: basket.coverageSummary ?? [], targetDeviations: fit.perTarget, continuedDoseDeviations: fit.perContinuedDose ?? [], references,
    preferences: assessPreferences(request, { productCount: basket.productCount, dailyPills, firstOrderGoodsPriceMinor: basket.priceMinor, currency: request.currency }),
    safety: basket.safety.findings.map(row => ({ code: row.code, severity: row.severity ?? "info", action: "review", subjectId: row.subjectId, sourceScope: row.sourceScope ?? null, ruleId: row.ruleId, authorityUrl: row.authorityUrl ?? null, uncertainty: row.uncertainty ?? [], exposureUnits: row.exposureUnits === null ? null : String(row.exposureUnits), thresholdUnits: row.thresholdUnits === null ? null : String(row.thresholdUnits), unit: row.unit })),
    uncertaintyNotes: [...uncertainty].sort(), neutralVector
  };
}
function parseExact(value: string): Rational {
  const parts = value.split("/");
  if (parts.length === 1) return fromDecimal(value);
  if (parts.length !== 2 || !/^-?\d+$/.test(parts[0]!) || !/^\d+$/.test(parts[1]!)) throw new Error("Invalid exact metric");
  return rational(BigInt(parts[0]!), BigInt(parts[1]!));
}
export function compareMetrics(before: CandidateMetrics | null, after: CandidateMetrics | null): NeutralComparison {
  if (!before || !after || before.currency !== after.currency) return "incomparable";
  const keys = Object.keys(before.neutralVector).sort();
  if (!keys.length || keys.join("\0") !== Object.keys(after.neutralVector).sort().join("\0")) return "incomparable";
  let improved = false, worsened = false;
  for (const key of keys) {
    const left = before.neutralVector[key], right = after.neutralVector[key];
    if (left == null || right == null) return "incomparable";
    const direction = compare(parseExact(right), parseExact(left));
    improved ||= direction < 0; worsened ||= direction > 0;
  }
  return improved && worsened ? "tradeoff" : improved ? "improved" : worsened ? "worsened" : "unchanged";
}

export type FactualDelta = Readonly<{ before: number | null; after: number | null; delta: number | null }>;
export function factualChanges(before: CandidateMetrics | null, after: CandidateMetrics | null) {
  if (!before || !after) return null;
  const delta = (left: number | null, right: number | null): FactualDelta => ({ before: left, after: right, delta: left === null || right === null ? null : right - left });
  return {
    productCount: delta(before.productCount, after.productCount), dailyPills: delta(before.dailyPills, after.dailyPills),
    priceMinor: before.currency === after.currency ? delta(before.priceMinor, after.priceMinor) : null,
    currency: before.currency === after.currency ? before.currency : null,
    baselineDoseLoss: delta(before.baselineDoseLoss, after.baselineDoseLoss),
    maxProportionalDeviation: delta(before.maxProportionalDeviation, after.maxProportionalDeviation),
    coverage: after.coverage.map(row => {
      const previous = before.coverage.find(item => item.subjectId === row.subjectId && item.unit === row.unit && item.basis === row.basis && item.target === row.target);
      return { subjectId: row.subjectId, unit: row.unit, basis: row.basis, target: row.target,
        knownTotal: delta(previous?.knownTotal ?? null, row.knownTotal), remainingGap: delta(previous?.remainingGap ?? null, row.remainingGap),
        excess: delta(previous?.excess ?? null, row.excess), unknownBefore: previous?.unknown ?? null, unknownAfter: row.unknown };
    }),
    scope: 'Factual changes in the quantified ledger; unknown exposure remains unknown.'
  };
}

const htmlEscape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
function json(value: unknown) { return JSON.stringify(value, null, 2); }
function csvCell(value: unknown): string {
  let text = typeof value === "string" ? value : value == null ? "" : JSON.stringify(value);
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
function details(label: string, value: unknown) { return `<details><summary>${htmlEscape(label)}</summary><pre>${htmlEscape(json(value))}</pre></details>`; }
function metricsHtml(metrics: CandidateMetrics | null): string {
  if (!metrics) return "<p>No complete comparable winner.</p>";
  const rows = metrics.coverage.map(row => `<tr><th>${htmlEscape(row.name)}</th><td>${htmlEscape(row.target)} ${htmlEscape(row.unit)}</td><td>${htmlEscape(row.knownTotal)}</td><td>${htmlEscape(row.remainingGap)}</td><td>${htmlEscape(row.excess)}</td><td>${row.unknown ? "unknown total" : row.estimatedCurrent !== 0 ? "estimated intake" : "known"}</td></tr>`).join("");
  return `<p class="numbers"><strong>${htmlEscape(metrics.productCount)} products</strong> · ${metrics.dailyPills === null ? "Unknown pills" : htmlEscape(metrics.dailyPills) + " pills/day"} · ${htmlEscape(metrics.priceMinor)} ${htmlEscape(metrics.currency)} minor units</p>
    <p class="signature">${htmlEscape(metrics.signature)}</p><p>Quantified baseline dose loss: ${htmlEscape(metrics.baselineDoseLoss)} · largest proportional target deviation: ${htmlEscape(metrics.maxProportionalDeviation)}</p>
    ${rows ? `<table><thead><tr><th>Nutrient</th><th>Target</th><th>Known total</th><th>Gap</th><th>Excess</th><th>Certainty</th></tr></thead><tbody>${rows}</tbody></table>` : ""}
    <p class="uncertainty">${metrics.uncertaintyNotes.length ? htmlEscape(metrics.uncertaintyNotes.join("; ")) : "No recorded uncertainty in this fixture."}</p>
    ${details("Doses, preferences, references and advice", metrics)}`;
}

/** Pure, deterministic artifacts. No fetches, frameworks, clocks or file writes. */
export function renderComparisonReport(report: ComparisonReport): { html: string; csv: string } {
  const columns = ["case_id", "kind", "profile_id", "profile_hash", "evaluation", "weight", "neutral_comparison", "winner_signature", "product_count", "daily_pills", "price_minor", "currency", "expansion_attempts", "expansion_budget", "search_complete", "pool_size", "coverage", "preferences", "references", "uncertainty", "exact_score_breakdown", "neutral_vector", "variant_doses", "baseline_dose_loss", "max_proportional_deviation", "factual_changes", "pool_hash", "pool_complete", "incomplete_candidate_count"];
  const csv: unknown[][] = [columns];
  function row(caseRow: CaseComparison, profile: ProfileComparison, evaluation: string, metrics: CandidateMetrics | null, score: ScoreBreakdown | null, weight: string | null = null) {
    const fullSearch = evaluation.startsWith("full_search");
    const search = fullSearch ? profile.fullSearch.searchSummary : null;
    csv.push([caseRow.id, caseRow.kind, profile.profileId, profile.profileHash, evaluation, weight, compareMetrics(caseRow.baseline, metrics), metrics?.signature, metrics?.productCount, metrics?.dailyPills, metrics?.priceMinor, metrics?.currency,
      search?.expansionAttempts, search?.expansionBudget, search?.complete, fullSearch ? null : profile.commonPool.poolSize,
      metrics?.coverage, metrics?.preferences, metrics?.references, metrics?.uncertaintyNotes, score, metrics?.neutralVector, metrics?.variantDoses, metrics?.baselineDoseLoss, metrics?.maxProportionalDeviation, factualChanges(caseRow.baseline, metrics), fullSearch ? null : profile.commonPool.poolHash, fullSearch ? null : profile.commonPool.complete, (fullSearch ? profile.fullSearch : profile.commonPool).incompleteCandidates?.count]);
  }
  function additional(caseRow: CaseComparison, profile: ProfileComparison, source: 'full_search' | 'common_pool', input: AdditionalCandidates) {
    let html = '';
    if (input.purchaseFallback) {
      row(caseRow, profile, `${source}_purchase_fallback`, input.purchaseFallback, null);
      html += `<details><summary>Purchase fallback</summary>${metricsHtml(input.purchaseFallback)}${details('Factual changes from baseline', factualChanges(caseRow.baseline, input.purchaseFallback))}</details>`;
    }
    if (input.incompleteCandidates) {
      if (input.incompleteCandidates.count < input.incompleteCandidates.examples.length) throw new Error('Incomplete candidate count is smaller than its examples');
      html += `<details><summary>${htmlEscape(input.incompleteCandidates.count)} incomplete-score candidates · ${htmlEscape(input.incompleteCandidates.examples.length)} shown</summary><p>These remain eligible candidates. Missing scoring components prevent assigning a complete score.</p>`;
      for (const metrics of input.incompleteCandidates.examples) {
        row(caseRow, profile, `${source}_incomplete_candidate`, metrics, null);
        html += metricsHtml(metrics);
      }
      html += '</details>';
    }
    return html;
  }
  const cases = report.cases.map((caseRow, caseIndex) => {
    const profiles = caseRow.profiles.map(profile => {
      row(caseRow, profile, "full_search", profile.fullSearch.metrics, profile.fullSearch.score);
      row(caseRow, profile, "common_pool", profile.commonPool.metrics, profile.commonPool.score);
      const search = profile.fullSearch.searchSummary;
      const sensitivity = (profile.sensitivity ?? []).map(item => {
        if (item.scope !== "rescoring_only") throw new Error("Weight sensitivity must be explicitly labelled rescoring_only");
        row(caseRow, profile, "rescoring_only", item.metrics, item.score, item.weight);
        return `<li>Weight ${htmlEscape(item.weight)} · rescoring_only · ${htmlEscape(compareMetrics(caseRow.baseline, item.metrics))}${metricsHtml(item.metrics)}${details("Exact sensitivity score", item.score)}</li>`;
      }).join("");
      return `<section class="profile" data-profile="${htmlEscape(profile.profileId)}"><h3>${htmlEscape(profile.profileId)}</h3><p class="hash">Profile ${htmlEscape(profile.profileHash)}</p>
        <div class="comparison"><section><h4>Full search</h4><p class="verdict">${htmlEscape(compareMetrics(caseRow.baseline, profile.fullSearch.metrics))}</p><p>${htmlEscape(search.expansionAttempts)}/${htmlEscape(search.expansionBudget)} attempts · ${search.complete ? "complete under declared search conditions" : "incomplete search"}${search.effort ? ` · ${htmlEscape(search.effort)}` : ""}</p>${metricsHtml(profile.fullSearch.metrics)}${details("Exact full-search score", profile.fullSearch.score)}${details("Factual changes from baseline", factualChanges(caseRow.baseline, profile.fullSearch.metrics))}${additional(caseRow, profile, "full_search", profile.fullSearch)}</section>
        <section><h4>Common-pool rescoring</h4><p class="verdict">${htmlEscape(compareMetrics(caseRow.baseline, profile.commonPool.metrics))}</p><p>${htmlEscape(profile.commonPool.poolSize)} frozen candidates · best within this pool${profile.commonPool.complete === undefined ? "" : profile.commonPool.complete ? " · declared complete pool" : " · incomplete pool"}${profile.commonPool.poolHash ? ` · pool ${htmlEscape(profile.commonPool.poolHash)}` : ""}</p>${metricsHtml(profile.commonPool.metrics)}${details("Exact common-pool score", profile.commonPool.score)}${details("Factual changes from baseline", factualChanges(caseRow.baseline, profile.commonPool.metrics))}${additional(caseRow, profile, "common_pool", profile.commonPool)}</section></div>
        ${sensitivity ? `<details><summary>Preference-weight sensitivity · rescoring only</summary><ul>${sensitivity}</ul></details>` : ""}${profile.oracle ? details("Independent finite-oracle evidence", profile.oracle) : ""}</section>`;
    }).join("");
    return `<article id="case-${caseIndex}" data-case="${caseIndex}"><h2>${htmlEscape(caseRow.id)} <small>${htmlEscape(caseRow.kind)}</small></h2>${details("Case provenance", caseRow.provenance ?? {})}<details><summary>Current implementation baseline</summary>${metricsHtml(caseRow.baseline)}</details>${profiles}</article>`;
  }).join("");
  const profileIds = [...new Set(report.cases.flatMap(row => row.profiles.map(profile => profile.profileId)))].sort();
  const shortlist = report.shortlist?.length ? `<section class="shortlist"><h2>Shortlist for review</h2><p>These are proposals based on observed metrics. No deployment setting is changed.</p><ul>${report.shortlist.map(item => `<li><strong>${htmlEscape(item.profileId)}</strong>: ${htmlEscape(item.reason)}</li>`).join("")}</ul></section>` : "";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${htmlEscape(report.title)}</title><style>
  :root{font-family:system-ui,sans-serif;color:#172235;background:#f3f5f7;line-height:1.5}body{margin:0}header,main{max-width:1400px;margin:auto;padding:24px}header{background:#132a43;color:#fff;max-width:none}header>div{max-width:1400px;margin:auto}h1{margin:0 0 12px}h2{font-size:1.4rem}h3{margin-bottom:4px}h4{font-size:1.15rem;margin:0}.filters{display:flex;flex-wrap:wrap;gap:16px;margin:20px 0}select{max-width:90vw;padding:8px}article,.shortlist{background:white;border:1px solid #d6dce3;border-radius:10px;padding:22px;margin:24px 0}.profile{border-top:2px solid #c4ced9;margin-top:24px;padding-top:8px}.comparison{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}.comparison>section{background:#f7f9fb;padding:16px;border-radius:8px}table{border-collapse:collapse;width:100%;font-size:.85rem}th,td{text-align:left;border-bottom:1px solid #dce3ea;padding:7px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:.75rem;background:#edf1f5;padding:12px}details{margin:12px 0}summary{cursor:pointer}.hash,.signature{font-family:monospace;overflow-wrap:anywhere;font-size:.8rem}.uncertainty{font-size:.85rem;color:#634818;overflow-wrap:anywhere}.verdict{font-weight:700}.numbers{font-size:1rem}small{font-weight:400;color:#526273}[hidden]{display:none!important}@media(max-width:900px){.comparison{grid-template-columns:1fr}header,main{padding:14px}article{padding:14px}}
  </style></head><body><header><div><h1>${htmlEscape(report.title)}</h1><p>Offline comparison · source ${htmlEscape(report.sourceCommit)}</p><p>Profile scores use different formulas and are not comparable across profiles. Neutral comparisons use factual dimensions; unknown dimensions are incomparable. Safety references remain advice, and unknown total exposure is not certified below a limit.</p></div></header><main>
  <div class="filters"><label>Case <select id="case-filter"><option value="all">All cases</option>${report.cases.map((row, index) => `<option value="${index}">${htmlEscape(row.id)}</option>`).join("")}</select></label><label>Profile <select id="profile-filter"><option value="all">All profiles</option>${profileIds.map(id => `<option value="${htmlEscape(id)}">${htmlEscape(id)}</option>`).join("")}</select></label></div>
  ${details("Report provenance", report.provenance ?? {})}${shortlist}${cases}</main><script>
  const caseFilter=document.getElementById('case-filter'),profileFilter=document.getElementById('profile-filter');
  function update(){for(const row of document.querySelectorAll('article[data-case]'))row.hidden=caseFilter.value!=='all'&&row.dataset.case!==caseFilter.value;for(const row of document.querySelectorAll('section[data-profile]'))row.hidden=profileFilter.value!=='all'&&row.dataset.profile!==profileFilter.value;}
  caseFilter.addEventListener('change',update);profileFilter.addEventListener('change',update);
  </script></body></html>`;
  return { html, csv: `${csv.map(row => row.map(csvCell).join(",")).join("\r\n")}\r\n` };
}
