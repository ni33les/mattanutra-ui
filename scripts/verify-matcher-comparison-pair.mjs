#!/usr/bin/env node
/** Read-only comparison evidence verification. Never executes a matcher or test. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ANNA = ['anna-dev-create', 'anna-dev-revise', 'anna-uat-create', 'anna-uat-revise'];
const SYNTHETIC = ['SYN-01-symmetric-dose', 'SYN-02-error-distribution', 'SYN-03-pills-price', 'SYN-04-product-count', 'SYN-05-zero-preferences', 'SYN-06-unknown-evidence', 'SYN-07-scoped-limits-continued', 'SYN-08-estimated-interval', 'SYN-09-core-optional', 'SYN-10-sparse-exclusions', 'SYN-11-empty-purchase-fallback', 'SYN-12-powder-interior'];
const TOP = ['source-before.json', 'profiles.json', 'report.json', 'summary.json', 'report.html', 'report.csv', 'latency.json', 'manifest.json'];
const HEX = /^[a-f0-9]{64}$/;
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
const canonicalJSON = value => JSON.stringify(canonical(value));
const fingerprint = value => createHash('sha256').update(canonicalJSON(value)).digest('hex');
const same = (a, b, message) => assert.equal(canonicalJSON(a), canonicalJSON(b), message);
function safeId(value) { assert.match(value, /^[A-Za-z0-9][A-Za-z0-9_-]{0,120}$/, 'Unsafe evidence identity'); }
async function readJSON(root, file) {
  try { return JSON.parse(await readFile(join(root, file), 'utf8')); }
  catch { throw new Error(`Missing or invalid complete JSON evidence: ${file}`); }
}
async function inventory(root, prefix = '') {
  const files = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const file = prefix ? `${prefix}/${entry.name}` : entry.name;
    assert.ok(!entry.isSymbolicLink(), `Evidence symlink is not permitted: ${file}`);
    if (entry.isDirectory()) files.push(...await inventory(root, file));
    else {
      assert.ok(entry.isFile(), `Non-regular evidence artifact: ${file}`);
      const hash = createHash('sha256'); let bytes = 0;
      for await (const chunk of createReadStream(join(root, file))) { bytes += chunk.length; hash.update(chunk); }
      files.push({ file, sha256: hash.digest('hex'), bytes });
    }
  }
  return files.sort((a, b) => a.file.localeCompare(b.file));
}
async function jsonLines(root, file, consume) {
  try { assert.ok((await lstat(join(root, file))).isFile()); } catch { throw new Error(`Missing candidate evidence artifact: ${file}`); }
  let count = 0;
  const lines = createInterface({ input: createReadStream(join(root, file)), crlfDelay: Infinity });
  for await (const line of lines) {
    assert.ok(line.trim(), `Empty/incomplete JSONL evidence line: ${file}`);
    let row; try { row = JSON.parse(line); } catch { throw new Error(`Incomplete JSONL evidence: ${file}`); }
    consume(row, count++);
  }
  assert.ok(count > 0, `Empty/incomplete candidate evidence: ${file}`);
  return count;
}
function sourceIdentity(source) {
  assert.match(source?.commit ?? '', /^[a-f0-9]{40}$/, 'Invalid source commit');
  assert.ok(Array.isArray(source.files) && source.files.length > 0, 'Missing source inventory');
  assert.equal(new Set(source.files.map(row => row.file)).size, source.files.length, 'Duplicate source inventory');
  for (const row of source.files) { assert.ok(typeof row.file === 'string' && row.file.length); assert.match(row.sha256, HEX); }
  assert.equal(source.sourceSha256, fingerprint(source.files), 'Source inventory fingerprint mismatch');
}
function profileHash(profile, weight) {
  const metrics = ['productCount', 'dailyPills', 'priceMinor'];
  const weights = Object.fromEntries(metrics.map(key => [key, weight === undefined ? profile.preferenceWeights[key] : String(Number(weight))]));
  const scales = { ...Object.fromEntries(metrics.map(key => [key, profile.zeroPreferenceScales[key]])), currency: profile.zeroPreferenceScales.currency };
  const definition = { version: profile.version, id: profile.id, nutrientAlpha: profile.nutrientAlpha,
    preferenceCurve: profile.preferenceCurve, preferenceWeights: weights, zeroPreferenceScales: scales };
  return createHash('sha256').update(JSON.stringify(definition)).digest('hex');
}
function exactRatio(value, name) {
  assert.ok(value && typeof value.numerator === 'string' && /^\d+$/.test(value.numerator) && typeof value.denominator === 'string' && /^[1-9]\d*$/.test(value.denominator), `Invalid exact score ${name}`);
}
function winnerMetrics(part, signatures, name) {
  assert.ok(part && Object.hasOwn(part, 'metrics') && Object.hasOwn(part, 'score'), `Incomplete ${name} result`);
  if (part.metrics === null) assert.equal(part.score, null, `Unexpected score without ${name} winner`);
  else {
    assert.ok(signatures.has(part.metrics.signature), `${name} winner absent from candidate evidence`);
    assert.ok(part.score && typeof part.score === 'object', `Missing ${name} score breakdown`);
  }
  if (part.purchaseFallback) assert.ok(signatures.has(part.purchaseFallback.signature), `${name} fallback absent from pool`);
  if (part.incompleteCandidates) {
    assert.ok(Number.isSafeInteger(part.incompleteCandidates.count) && part.incompleteCandidates.count >= 0, `Invalid ${name} incomplete cohort count`);
    assert.ok(Array.isArray(part.incompleteCandidates.examples) && part.incompleteCandidates.examples.length <= part.incompleteCandidates.count, `Incomplete ${name} cohort examples`);
    for (const row of part.incompleteCandidates.examples) assert.ok(signatures.has(row.signature), `${name} incomplete example absent from pool`);
  }
}

async function validateRun(root, files) {
  assert.ok(!files.some(row => row.file === 'failure.json' || row.file.endsWith('/failure.json')), 'Failed comparison has failure evidence');
  const manifest = await readJSON(root, 'manifest.json');
  assert.equal(manifest.version, 'matcher-comparison-evidence-1', 'Unsupported comparison manifest');
  assert.equal(manifest.passed, true, 'Comparison manifest is not passed');
  assert.equal(manifest.sourceUnchanged, true, 'Comparison source is not unchanged');
  sourceIdentity(manifest.sourceBefore); sourceIdentity(manifest.sourceAfter);
  same(manifest.sourceBefore, manifest.sourceAfter, 'Source changed during comparison');
  same(await readJSON(root, 'source-before.json'), manifest.sourceBefore, 'Source-before artifact mismatch');
  const report = await readJSON(root, 'report.json');
  assert.equal(report.sourceCommit, manifest.sourceBefore.commit, 'Report source commit mismatch');
  assert.equal(report.provenance?.sourceSha256, manifest.sourceBefore.sourceSha256, 'Report source identity mismatch');
  assert.equal(report.provenance?.effort, manifest.effort, 'Report effort mismatch');
  assert.ok(['standard', 'expanded'].includes(manifest.effort), 'Invalid comparison effort');
  assert.ok(['anna', 'synthetic', 'anna-and-synthetic'].includes(report.provenance.corpus), 'Invalid comparison corpus');
  assert.ok(!(manifest.effort === 'expanded' && report.provenance.corpus === 'synthetic'), 'Invalid expanded synthetic corpus');
  const ids = manifest.effort === 'expanded' || report.provenance.corpus === 'anna' ? ANNA : report.provenance.corpus === 'synthetic' ? SYNTHETIC : [...ANNA, ...SYNTHETIC];
  assert.ok(Array.isArray(report.cases), 'Missing report case inventory');
  same(report.cases.map(row => row.id), ids, 'Incomplete or changed report case inventory');
  assert.equal(manifest.cases, ids.length, 'Manifest case count mismatch');
  assert.equal(manifest.resultFingerprint, fingerprint(report), 'Report result fingerprint mismatch');
  const profiles = await readJSON(root, 'profiles.json');
  assert.ok(Array.isArray(profiles) && profiles.length > 0, 'Empty profile inventory');
  assert.equal(new Set(profiles.map(row => row.id)).size, profiles.length, 'Duplicate profile inventory');
  for (const profile of profiles) {
    safeId(profile.id); assert.equal(profile.version, 'experiment-score-1', 'Invalid profile version');
    assert.ok(['off', 'linear', 'quadratic'].includes(profile.preferenceCurve), 'Invalid profile curve');
    assert.equal(profile.hash, profileHash(profile), 'Profile definition/hash mismatch');
  }
  assert.equal(manifest.profiles, profiles.length, 'Manifest profile count mismatch');
  assert.equal(manifest.comparisons, ids.length * profiles.length, 'Manifest comparison count mismatch');
  const expected = [...TOP], inputs = [];
  for (const caseRow of report.cases) {
    safeId(caseRow.id);
    assert.equal(caseRow.kind, ANNA.includes(caseRow.id) ? 'catalogue' : 'synthetic', 'Case kind mismatch');
    const directory = `cases/${caseRow.id}`;
    expected.push(...['input.json', 'baseline-result.json', 'pool.jsonl', 'comparison.json'].map(file => `${directory}/${file}`));
    same(await readJSON(root, `${directory}/comparison.json`), caseRow, 'Per-case report differs from complete report');
    const input = await readJSON(root, `${directory}/input.json`); inputs.push(input);
    assert.equal(input.id, caseRow.id, 'Case input identity mismatch'); assert.equal(input.kind, caseRow.kind, 'Case input kind mismatch');
    assert.equal(caseRow.provenance?.requestFingerprint, fingerprint(input.request), 'Request fingerprint mismatch');
    assert.equal(caseRow.provenance?.catalogueFingerprint, fingerprint(input.catalog), 'Catalogue fingerprint mismatch');
    assert.equal(caseRow.provenance?.effort, manifest.effort, 'Case effort mismatch');
    const baseline = await readJSON(root, `${directory}/baseline-result.json`);
    assert.equal(caseRow.provenance?.baselineIdentity, fingerprint(baseline), 'Baseline result fingerprint mismatch');
    const signatures = new Set(), poolHasher = createHash('sha256').update('[');
    let previous = '';
    const poolCount = await jsonLines(root, `${directory}/pool.jsonl`, (row, index) => {
      assert.ok(typeof row.signature === 'string' && row.signature.length > 0 && !signatures.has(row.signature), 'Duplicate or missing pool candidate identity');
      if (index) assert.ok(previous.localeCompare(row.signature) < 0, 'Pool candidate evidence is not canonical');
      previous = row.signature; signatures.add(row.signature);
      assert.ok(Array.isArray(row.doses) && Array.isArray(row.exposure) && Array.isArray(row.delivered) && Array.isArray(row.unknownProductIds), 'Missing complete candidate dose/exposure evidence');
      assert.ok(row.dailyPills === null || Number.isFinite(row.dailyPills) && row.dailyPills >= 0, 'Invalid candidate pill evidence');
      assert.equal(new Set(row.doses.map(dose => dose.productId)).size, row.productCount, 'Candidate product/dose count mismatch');
      for (const values of [row.exposure, row.delivered]) {
        assert.equal(new Set(values.map(item => item[0])).size, values.length, 'Duplicate candidate exposure identity');
        for (const item of values) assert.ok(Array.isArray(item) && item.length === 2 && typeof item[0] === 'string' && typeof item[1] === 'string' && /^\d+$/.test(item[1]), 'Invalid exact candidate exposure evidence');
      }
      assert.ok(Number.isSafeInteger(row.productCount) && row.productCount >= 0 && Number.isSafeInteger(row.priceMinor) && row.priceMinor >= 0, 'Invalid candidate commerce evidence');
      for (const dose of row.doses) assert.ok(dose.productId && dose.variantId && dose.sellerId === row.sellerId && Number.isFinite(dose.servingsPerDay) && dose.servingsPerDay > 0, 'Invalid candidate dose evidence');
      poolHasher.update((index ? ',' : '') + canonicalJSON({ signature: row.signature, exposure: row.exposure, pills: row.dailyPills, price: row.priceMinor }));
    });
    const poolHash = poolHasher.update(']').digest('hex');
    assert.equal(caseRow.provenance?.poolHash, poolHash, 'Pool fingerprint mismatch');
    assert.equal(caseRow.provenance?.poolSize, poolCount, 'Pool count mismatch');
    if (caseRow.baseline) assert.ok(signatures.has(caseRow.baseline.signature), 'Baseline winner absent from candidate evidence');
    same(caseRow.profiles.map(row => [row.profileId, row.profileHash]), profiles.map(row => [row.id, row.hash]), 'Incomplete case profile inventory');
    for (const [index, row] of caseRow.profiles.entries()) {
      const profile = profiles[index];
      winnerMetrics(row.fullSearch, signatures, 'full-search'); winnerMetrics(row.commonPool, signatures, 'common-pool');
      const search = row.fullSearch.searchSummary;
      assert.ok(search && typeof search.complete === 'boolean' && Number.isSafeInteger(search.expansionAttempts) && search.expansionAttempts >= 0 && Number.isSafeInteger(search.expansionBudget) && search.expansionBudget >= search.expansionAttempts, 'Missing or invalid bounded search evidence');
      assert.equal(row.commonPool.poolSize, poolCount, 'Common pool count mismatch'); assert.equal(row.commonPool.poolHash, poolHash, 'Common pool identity mismatch');
      const sensitivities = profile.preferenceCurve === 'off' ? [] : ['0.10', '0.50'];
      same((row.sensitivity ?? []).map(item => item.weight), sensitivities, 'Incomplete sensitivity inventory');
      const scoreFiles = [{ file: `${profile.id}-cross-scores.jsonl`, hash: profile.hash }];
      for (const item of row.sensitivity ?? []) {
        assert.equal(item.scope, 'rescoring_only', 'Sensitivity must be rescoring-only'); winnerMetrics(item, signatures, 'sensitivity');
        scoreFiles.push({ file: `${profile.id}-weight-${item.weight}-cross-scores.jsonl`, hash: profileHash(profile, item.weight) });
      }
      for (const descriptor of scoreFiles) {
        const file = `${directory}/${descriptor.file}`; expected.push(file); const observed = new Set();
        const count = await jsonLines(root, file, score => {
          assert.ok(signatures.has(score.signature) && !observed.has(score.signature), 'Cross-score candidate inventory mismatch'); observed.add(score.signature);
          assert.equal(score.profileId, profile.id, 'Cross-score profile mismatch'); assert.equal(score.profileHash, descriptor.hash, 'Cross-score profile hash mismatch');
          assert.equal(typeof score.complete, 'boolean', 'Missing score completeness'); assert.ok(Array.isArray(score.missingComponents), 'Missing score component completeness');
          exactRatio(score.nutrientTotal, 'nutrient total');
          if (score.complete) { exactRatio(score.total, 'total'); exactRatio(score.preferenceTotal, 'preference total'); assert.equal(score.missingComponents.length, 0, 'Complete score contains missing components'); }
          else { assert.equal(score.total, null, 'Incomplete score has a comparable total'); assert.equal(score.preferenceTotal, null, 'Incomplete preference total is not null'); assert.ok(score.missingComponents.length > 0, 'Incomplete score hides missing components'); }
        });
        assert.equal(count, poolCount, 'Incomplete cross-score candidate inventory');
      }
    }
    if (caseRow.kind === 'synthetic') {
      expected.push(`${directory}/oracle.json`);
      const oracle = await readJSON(root, `${directory}/oracle.json`);
      assert.equal(oracle.exhaustive, true, 'Incomplete finite-grid oracle'); assert.equal(oracle.gridOnly, true, 'Oracle scope is not finite-grid only');
      assert.ok(Number.isSafeInteger(oracle.enumerated) && oracle.enumerated > 0 && Array.isArray(oracle.candidates) && oracle.candidates.length > 0, 'Missing oracle candidate evidence');
      for (const row of caseRow.profiles) assert.ok(row.oracle?.gridComplete === true && row.oracle.scope === 'exhaustive_declared_grid_only', 'Missing case oracle completeness');
    }
  }
  assert.equal(manifest.corpusFingerprint, fingerprint(inputs), 'Complete corpus fingerprint mismatch');
  const summary = await readJSON(root, 'summary.json');
  same(summary.results?.map(row => [row.caseId, row.kind, row.profileId]), report.cases.flatMap(row => row.profiles.map(profile => [row.id, row.kind, profile.profileId])), 'Incomplete summary comparison inventory');
  assert.match(await readFile(join(root, 'report.html'), 'utf8'), /<!doctype html>/i, 'Missing standalone HTML evidence');
  assert.match(await readFile(join(root, 'report.csv'), 'utf8'), /^"case_id","kind","profile_id"/, 'Missing CSV evidence');
  const latency = await readJSON(root, 'latency.json'); assert.equal(latency.descriptiveOnly, true, 'Latency exclusion is not descriptive-only');
  same(latency.cases?.map(row => row.caseId), ids, 'Incomplete latency case inventory');
  same(files.map(row => row.file), expected.sort((a, b) => a.localeCompare(b)), 'Missing or extra evidence artifact inventory');
  if (manifest.artifacts !== undefined) same([...manifest.artifacts].sort((a,b) => a.file.localeCompare(b.file)), files.filter(row => !['manifest.json', 'latency.json'].includes(row.file)).map(({ file, sha256 }) => ({ file, sha256 })), 'Manifest artifact fingerprints or inventory changed');
  return { manifest, profiles };
}

export async function verifyComparisonPair(leftInput, rightInput) {
  const left = await realpath(resolve(leftInput)), right = await realpath(resolve(rightInput));
  assert.notEqual(left, right, 'Pair requires two distinct evidence directories');
  assert.ok((await lstat(left)).isDirectory() && (await lstat(right)).isDirectory(), 'Pair inputs must be directories');
  const leftFiles = await inventory(left), rightFiles = await inventory(right);
  const a = await validateRun(left, leftFiles), b = await validateRun(right, rightFiles);
  same(a.manifest.sourceBefore, b.manifest.sourceBefore, 'Comparison source identities differ');
  same(a.profiles, b.profiles, 'Comparison profiles differ');
  for (const field of ['effort', 'cases', 'profiles', 'comparisons', 'corpusFingerprint', 'resultFingerprint']) same(a.manifest[field], b.manifest[field], `Comparison ${field} differs`);
  const evidenceFiles = leftFiles.filter(row => row.file !== 'latency.json');
  same(evidenceFiles, rightFiles.filter(row => row.file !== 'latency.json'), 'Comparison evidence artifact bytes differ');
  same(await inventory(left), leftFiles, 'Left evidence changed during pair verification');
  same(await inventory(right), rightFiles, 'Right evidence changed during pair verification');
  return {
    version: 'matcher-comparison-pair-1', passed: true, left, right, excluded: ['latency.json'],
    sourceCommit: a.manifest.sourceBefore.commit, sourceSha256: a.manifest.sourceBefore.sourceSha256,
    effort: a.manifest.effort, cases: a.manifest.cases, profiles: a.manifest.profiles, comparisons: a.manifest.comparisons,
    corpusFingerprint: a.manifest.corpusFingerprint, resultFingerprint: a.manifest.resultFingerprint,
    evidenceFiles, evidenceFingerprint: fingerprint(evidenceFiles)
  };
}
export async function main(args = process.argv.slice(2)) {
  assert.ok(args.length === 4 && args[2] === '--output' && isAbsolute(args[3]), 'Use LEFT_DIRECTORY RIGHT_DIRECTORY --output ABSOLUTE_NEW_FILE');
  const output = join(await realpath(dirname(resolve(args[3]))), basename(args[3]));
  const checkout = await realpath(fileURLToPath(new URL('..', import.meta.url)));
  const local = relative(checkout, output);
  assert.ok(local.startsWith('..') || isAbsolute(local), 'Pair receipt must be outside the source checkout');
  for (const directory of args.slice(0, 2)) {
    const inside = relative(await realpath(resolve(directory)), output);
    assert.ok(inside.startsWith('..') || isAbsolute(inside), 'Pair receipt must be outside both preserved input directories');
  }
  const result = await verifyComparisonPair(args[0], args[1]);
  await writeFile(output, canonicalJSON(result) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ passed: result.passed, output, evidenceFiles: result.evidenceFiles.length, resultFingerprint: result.resultFingerprint, evidenceFingerprint: result.evidenceFingerprint }));
  return result;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
