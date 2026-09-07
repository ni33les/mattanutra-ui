#!/usr/bin/env node
import './matcher-experiment-offline.mjs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync, writeSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileGroups } from '@/lib/matcher/candidates';
import { candidateEvidenceIdentity, parseComparisonArguments, joinCandidatePool, oraclePool } from '@/lib/matcher/experiments/comparison';
import { loadAnnaCases } from '@/lib/matcher/experiments/frozen-corpus';
import { syntheticCorpus } from '@/lib/matcher/experiments/synthetic-corpus';
import { listProfiles, profileDefinition, resolveProfile, withPreferenceWeight, type ScoringProfile } from '@/lib/matcher/experiments/profiles';
import { canonicalJSON, fingerprint, rankCandidates, runExperimentSearch, scoreCandidate, type ExperimentCandidate, type ExperimentCandidateInput, type ExperimentSearchResult } from '@/lib/matcher/experiments/search';
import { candidateMetrics, compareMetrics, factualChanges, renderComparisonReport, scoreBreakdown, type CaseComparison, type ComparisonReport, type ProfileComparison } from '@/lib/matcher/experiments/report';
import { subtract, serialize } from '@/lib/matcher/experiments/rational';
import type { ExperimentCase } from '@/lib/matcher/experiments/corpus-types';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
function sourceIdentity() {
  const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' })
    .split('\0').filter(file => file && existsSync(join(ROOT, file))).sort()
    .map(file => ({ file, sha256: sha256(readFileSync(join(ROOT, file))) }));
  return { sourceSha256: fingerprint(files), commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(), files };
}
function save(path: string, value: unknown) { writeFileSync(path, canonicalJSON(value) + '\n', { flag: 'wx', mode: 0o600 }); }
function jsonLines(path: string, values: Iterable<unknown>) {
  const fd = openSync(path, 'wx', 0o600);
  try { for (const value of values) writeSync(fd, canonicalJSON(value) + '\n'); } finally { closeSync(fd); }
}
function candidateEvidence(candidate: ExperimentCandidateInput) {
  const doses = candidate.groups.flatMap(group => group.variants.filter(row => candidate.state.selectedVariantIds.includes(row.variantId))
    .map(row => ({ productId: group.productId, sellerId: group.sellerId, variantId: row.variantId, servingsPerDay: row.dailyUnits, ratio: row.dailyUnitsRatio })));
  return { signature: candidate.signature, sellerId: candidate.sellerId, doses, exposure: candidate.state.exposure, delivered: candidate.state.delivered,
    productCount: candidate.state.count, dailyPills: candidate.state.pillCountKnown === false ? null : candidate.state.pills,
    priceMinor: candidate.state.price, unknownProductIds: candidate.state.unknownProductIds ?? [] };
}
function additional(result: Pick<ExperimentSearchResult, 'purchaseFallback' | 'incompleteCandidates'>, input: ExperimentCase) {
  return { purchaseFallback: candidateMetrics(result.purchaseFallback, input.request),
    incompleteCandidates: { count: result.incompleteCandidates.length,
      examples: result.incompleteCandidates.filter(row => row.state.count > 0).slice(0, 3).map(row => candidateMetrics(row, input.request)!) } };
}
function compactRun(result: ExperimentSearchResult): ExperimentSearchResult {
  return { ...result, candidates: [], incompleteCandidates: [] };
}
function* crossScores(profile: ScoringProfile, candidates: readonly ExperimentCandidate[]) {
  for (const candidate of candidates) yield { signature: candidate.signature, profileId: profile.id, profileHash: profile.hash,
    total: candidate.score.total ? serialize(candidate.score.total) : null, nutrientTotal: serialize(candidate.score.nutrientTotal),
    preferenceTotal: candidate.score.preferenceTotal ? serialize(candidate.score.preferenceTotal) : null,
    complete: candidate.score.complete, nutrientEvidenceComplete: candidate.score.nutrientEvidenceComplete, missingComponents: candidate.score.missingComponents };
}

export async function compareCase(input: ExperimentCase, profiles: readonly ScoringProfile[], effort: 'standard' | 'expanded', output: string, executeSearch = runExperimentSearch) {
  const directory = join(output, 'cases', input.id); mkdirSync(directory, { recursive: true, mode: 0o700 });
  save(join(directory, 'input.json'), input);
  const started = performance.now(), timings: { profileId: string; elapsedMs: number }[] = [];
  const compiledGroups = compileGroups(input.request, input.catalog);
  const baselineProfile = resolveProfile('baseline');
  const controlStarted = performance.now();
  // Production expanded search already includes its standard pass and incumbent.
  // Run it once; controls carry baseline metadata, not another search allowance.
  let control = executeSearch({ ...input, profile: baselineProfile, compiledGroups, effort });
  const controlElapsedMs = performance.now() - controlStarted;
  save(join(directory, 'baseline-result.json'), control.baseline);
  const controlFull = { metrics: candidateMetrics(control.selected, input.request), score: control.selected ? scoreBreakdown(control.selected.score) : null,
    searchSummary: control.searchSummary, ...additional(control, input) };
  const union = new Map<string, ExperimentCandidateInput>();
  const absorb = (run: ExperimentSearchResult) => { for (const row of run.candidates) {
    const previous = union.get(row.signature);
    if (previous) assert.equal(candidateEvidenceIdentity(previous), candidateEvidenceIdentity(row), `Conflicting observed basket: ${row.signature}`);
    else union.set(row.signature, { signature: row.signature, sellerId: row.sellerId, state: row.state, groups: row.groups });
  } };
  absorb(control);
  control = compactRun(control);
  const runs = new Map<string, ExperimentSearchResult>(), full = new Map<string, ProfileComparison['fullSearch']>();
  for (const profile of profiles) {
    const start = performance.now();
    let run: ExperimentSearchResult;
    if (profile.hash === baselineProfile.hash) run = control;
    else {
      const standard = executeSearch({ ...input, profile, compiledGroups, control }); absorb(standard);
      run = effort === 'expanded' ? executeSearch({ ...input, profile, compiledGroups, effort, incumbent: standard, control }) : standard;
    }
    absorb(run);
    full.set(profile.id, profile.hash === baselineProfile.hash ? controlFull : { metrics: candidateMetrics(run.selected, input.request), score: run.selected ? scoreBreakdown(run.selected.score) : null,
      searchSummary: run.searchSummary, ...additional(run, input) });
    // Unknown candidates are already disclosed above; retain only the winner for later cross-scoring.
    runs.set(profile.id, { ...compactRun(run), incompleteCandidates: [] });
    timings.push({ profileId: profile.id, elapsedMs: profile.hash === baselineProfile.hash ? controlElapsedMs : performance.now() - start });
    console.log(`${input.id} ${effort} ${profile.id}: ${run.searchSummary.expansionAttempts} attempts, ${union.size} baskets in union`);
  }
  const oracle = input.oracleFixture ? oraclePool(input, profiles) : null;
  const common = joinCandidatePool([], [...union.values(), ...(oracle?.candidates ?? [])]);
  jsonLines(join(directory, 'pool.jsonl'), common.candidates.map(candidateEvidence));
  if (oracle) save(join(directory, 'oracle.json'), oracle.reference);
  const comparisons: ProfileComparison[] = [], attribution: Record<string, unknown>[] = [];
  const evaluatePool = (profile: ScoringProfile, suffix: string) => {
    const ranked = rankCandidates(profile, input.request, common.candidates);
    jsonLines(join(directory, `${suffix}-cross-scores.jsonl`), crossScores(profile, ranked.candidates));
    return { selected: ranked.selected, metrics: candidateMetrics(ranked.selected, input.request),
      score: ranked.selected ? scoreBreakdown(ranked.selected.score) : null, ...additional(ranked, input) };
  };
  for (const profile of profiles) {
    const pooled = evaluatePool(profile, profile.id), run = runs.get(profile.id)!;
    const sensitivity = profile.preferenceCurve === 'off' ? [] : ['0.10', '0.50'].map(weight => {
      const variant = withPreferenceWeight(profile, weight), result = evaluatePool(variant, `${profile.id}-weight-${weight}`);
      return { weight, scope: 'rescoring_only' as const, metrics: result.metrics, score: result.score };
    });
    const original = control.selected ? scoreCandidate(profile, input.request, control.selected) : null;
    const total = run.selected?.score.total, best = pooled.selected?.score.total;
    attribution.push({ profileId: profile.id, classification: profile.preferenceCurve === 'off' ? 'nutrient_only' : 'practical_alternative',
      baselineRescored: original ? scoreBreakdown(original.score) : null,
      fullSearchSignature: run.selected?.signature ?? null, commonPoolSignature: pooled.selected?.signature ?? null,
      fullSearchMinusPoolScore: total && best ? serialize(subtract(total, best)) : null,
      interpretation: 'Same-profile score difference within this pool. Protected-priority changes can outweigh a scalar difference; bounded search is not a global proof.' });
    comparisons.push({ profileId: profile.id, profileHash: profile.hash, fullSearch: full.get(profile.id)!,
      commonPool: { metrics: pooled.metrics, score: pooled.score, poolSize: common.candidates.length, poolHash: common.hash, complete: false,
        purchaseFallback: pooled.purchaseFallback, incompleteCandidates: pooled.incompleteCandidates }, sensitivity,
      oracle: oracle ? { checkedScores: oracle.checked, enumerated: oracle.reference.enumerated, scope: oracle.scope, gridComplete: true,
        ranking: oracle.rankings.find(row => row.profileId === profile.id) } : undefined });
    console.log(`${input.id} ${effort} ${profile.id}: ${common.candidates.length} baskets cross-scored, including applicable sensitivity runs`);
  }
  const row: CaseComparison = { id: input.id, kind: input.kind,
    provenance: { ...input.provenance, effort, inputIdentity: control.inputIdentity, catalogueFingerprint: fingerprint(input.catalog), requestFingerprint: fingerprint(input.request),
      poolHash: common.hash, poolSize: common.candidates.length,
      poolCompleteness: oracle ? 'bounded_union_including_exhaustive_declared_grid' : 'bounded_union_of_explored_candidates',
      physicalDomainExhaustive: false, baselineIdentity: fingerprint(control.baseline), attribution },
    baseline: candidateMetrics(control.selected, input.request), profiles: comparisons };
  save(join(directory, 'comparison.json'), row);
  return { row, timings: { caseId: input.id, elapsedMs: performance.now() - started, profiles: timings } };
}

export function summarize(report: ComparisonReport) {
  const summary = report.cases.flatMap(row => row.profiles.map(profile => ({ caseId: row.id, kind: row.kind, profileId: profile.profileId,
    fullSearch: compareMetrics(row.baseline, profile.fullSearch.metrics), commonPool: compareMetrics(row.baseline, profile.commonPool.metrics),
    fullSearchChanges: factualChanges(row.baseline, profile.fullSearch.metrics), commonPoolChanges: factualChanges(row.baseline, profile.commonPool.metrics),
    changedBasket: row.baseline?.signature !== profile.commonPool.metrics?.signature,
    sensitivityChanged: profile.sensitivity?.some(item => item.metrics?.signature !== profile.commonPool.metrics?.signature) ?? false })));
  return { scope: 'Observed factual differences, not a universal quality percentage', results: summary };
}
export async function main(args = process.argv.slice(2)) {
  const options = parseComparisonArguments(args, ROOT);
  if (options.listProfiles) { console.log(JSON.stringify(listProfiles().map(profile => ({ ...profileDefinition(profile), version: profile.version, hash: profile.hash })), null, 2)); return; }
  assert.ok(!existsSync(options.output), 'Evidence directory must be new; historical evidence is never overwritten');
  mkdirSync(options.output, { recursive: true, mode: 0o700 });
  const before = sourceIdentity(), startedAt = new Date().toISOString();
  save(join(options.output, 'source-before.json'), before);
  save(join(options.output, 'profiles.json'), options.profiles.map(profile => ({ ...profileDefinition(profile), version: profile.version, hash: profile.hash })));
  const partial: CaseComparison[] = [], latency: unknown[] = [];
  try {
    const cases = [ ...(options.corpus === 'synthetic' ? [] : await loadAnnaCases()),
      ...(options.effort === 'expanded' || options.corpus === 'anna' ? [] : syntheticCorpus()) ];
    assert.equal(cases.length, options.effort === 'expanded' || options.corpus === 'anna' ? 4 : options.corpus === 'synthetic' ? 12 : 16, 'Corpus is incomplete');
    assert.equal(new Set(cases.map(row => row.id)).size, cases.length, 'Duplicate corpus identity');
    for (const input of cases) { const result = await compareCase(input, options.profiles, options.effort, options.output); partial.push(result.row); latency.push(result.timings); }
    const report: ComparisonReport = { title: `Matcher scoring experiment · ${options.effort}`, sourceCommit: before.commit,
      provenance: { sourceSha256: before.sourceSha256, corpus: options.corpus, effort: options.effort, network: 'disabled', productionDefault: 'unchanged',
        builtInPreferenceWeight: '0.25', sensitivityWeights: ['0.10', '0.50'], safetyExtraWeight: '2',
        notes: ['Catalogue inputs are reconstructed corrected baselines, not fresh live snapshots.',
          'Full searches have equal expansion budgets; common-pool scores isolate scoring from candidate discovery.',
          'Synthetic enumeration is exhaustive on its declared finite quantity grid. The union and physical dose domain are not globally exhaustive.',
          'Unknown intake remains conditional evidence; missing active preference measurements have no comparable total score.'] }, cases: partial };
    const rendered = renderComparisonReport(report);
    save(join(options.output, 'report.json'), report); save(join(options.output, 'summary.json'), summarize(report));
    writeFileSync(join(options.output, 'report.html'), rendered.html, { flag: 'wx', mode: 0o600 });
    writeFileSync(join(options.output, 'report.csv'), rendered.csv, { flag: 'wx', mode: 0o600 });
    save(join(options.output, 'latency.json'), { descriptiveOnly: true, startedAt, completedAt: new Date().toISOString(), cases: latency });
    const after = sourceIdentity(), sourceUnchanged = before.sourceSha256 === after.sourceSha256;
    const artifacts = readdirSync(options.output, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile() && entry.name !== 'latency.json')
      .map(entry => { const path = join(entry.parentPath, entry.name); return { file: path.slice(options.output.length + 1), sha256: sha256(readFileSync(path)) }; })
      .sort((a, b) => a.file.localeCompare(b.file));
    const result = { version: 'matcher-comparison-evidence-1', passed: sourceUnchanged, sourceUnchanged, sourceBefore: before, sourceAfter: after,
      cases: cases.length, profiles: options.profiles.length, comparisons: partial.reduce((sum, row) => sum + row.profiles.length, 0),
      corpusFingerprint: fingerprint(cases), resultFingerprint: fingerprint(report), artifacts, effort: options.effort,
      normalization: 'Only latency.json and manifest wall-clock metadata are excluded from paired comparisons; all matching evidence is preserved.' };
    save(join(options.output, 'manifest.json'), result);
    assert.ok(sourceUnchanged, 'Source changed during comparison; results cannot attest unchanged source');
    console.log(JSON.stringify({ evidence: options.output, passed: true, cases: cases.length, comparisons: result.comparisons, resultFingerprint: result.resultFingerprint }));
    return result;
  } catch (error) {
    save(join(options.output, 'failure.json'), { passed: false, completedCases: partial.map(row => row.id), error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error instanceof Error ? error.stack : error); process.exitCode = 1; });
