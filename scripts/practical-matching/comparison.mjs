import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { scanLockSites, verifyLockSites } from '../service-efficiency/lock-register.mjs';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const PRACTICAL_COMPARISON_CASES = ['reported-web', 'normal', 'strong', 'fewest_pills', 'importance-normal', 'importance-strong'];
export function verifyRepeatedComparison(rows, cases, sourceCommit) {
  assert.ok(cases.length); assert.equal(rows.length, cases.length * 2);
  for (const id of cases) {
    const pair = rows.filter(row => row.caseId === id); assert.equal(pair.length, 2);
    assert.deepEqual(pair.map(row => row.run).sort(), ['a', 'b']);
    for (const row of pair) { assert.equal(row.sourceCommit, sourceCommit); assert.ok(row.fixtureSha256 && row.semantic && Object.keys(row.semantic).length); assert.ok(Number.isFinite(row.measurements.wallMs)); }
    assert.equal(pair[0].fixtureSha256, pair[1].fixtureSha256); assert.deepEqual(pair[0].semantic, pair[1].semantic, `Non-timing result changed: ${id}`);
  }
  return { passed: true, sourceCommit, cases: cases.map(id => ({ id, semanticSha256: hash(rows.find(row => row.caseId === id).semantic) })) };
}
export function verifyNoAddedLocks(before, after) {
  const counts = rows => { const m = new Map(); for (const row of rows) { const key = row.file + '\0' + row.statement; m.set(key, (m.get(key) ?? 0) + 1); } return m; };
  const original = counts(before);
  for (const [key, count] of counts(after)) assert.ok(count <= (original.get(key) ?? 0), `Added lock: ${key}`);
  return { passed: true, controlCount: before.length, candidateCount: after.length, controlSha256: hash(before), candidateSha256: hash(after) };
}
function selected(row) {
  const m = row.semantic.diagnostics?.matching;
  return m ? m.options.find(option => option.candidateKey === m.selectedCandidateKey) : row.semantic.selected;
}
function metrics(row) {
  const s = selected(row); assert.ok(s);
  const qty = s.dailyServings ?? s.variantDoses?.map(v => ({ servingsPerDay: v.dailyUnits })) ?? [];
  const servings = Array.isArray(qty) ? qty.map(v => typeof v === 'number' ? v : v.servingsPerDay ?? v.dailyUnits ?? v.servingMultiplier) : Object.values(qty);
  return { caseId: row.caseId, products: s.productIds, coveragePercent: s.coveragePercent ?? s.aggregateCoverage,
    dosePenalty: s.doseFit?.total, overallPenalty: s.overallScore?.overallPenalty ?? null,
    dailyPills: s.pillCountKnown === false ? null : s.dailyPills,
    pillLowerBound: s.overallScore?.preferences.maxDailyPills.actualLowerBound ?? s.dailyPills,
    labelledServings: servings, priceMinor: s.priceMinor ?? s.totalPriceMinor, adviceCount: s.advice?.length ?? s.safety?.findings.length ?? 0,
    ...row.measurements };
}
export async function runPracticalComparison(output, env, releaseBase) {
  const control = env.PRACTICAL_CONTROL_WORKTREE ?? '/tmp/mattanutra-practical-control-ab102ab3';
  const candidate = process.cwd(), git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  assert.equal(git(control, 'rev-parse', 'HEAD'), releaseBase); assert.equal(git(control, 'status', '--porcelain', '--untracked-files=no'), '');
  const candidateCommit = git(candidate, 'rev-parse', 'HEAD');
  mkdirSync(output, { recursive: false, mode: 0o700 });
  const results = { control: [], candidate: [] };
  for (const run of ['a', 'b']) for (const caseId of PRACTICAL_COMPARISON_CASES) for (const [label, root] of [['control', control], ['candidate', candidate]]) {
    const name = `${run}-${caseId}-${label}`, path = resolve(output, name + '.json'), fd = openSync(resolve(output, name + '.log'), 'wx', 0o600);
    try {
      const code = await new Promise((done, reject) => {
        const child = spawn(process.execPath, ['--experimental-strip-types', '--import', resolve(root, 'scripts/register-ts-path-loader.mjs'), '--import', resolve(root, 'test/helpers/offline-network.mjs'),
          resolve(candidate, 'scripts/practical-matching/runtime-case.mjs'), root, resolve(candidate, 'test/practical-matching/fixtures'), caseId, run, path], { cwd: root, env, stdio: ['ignore', fd, fd] });
        const timer = setTimeout(() => child.kill('SIGKILL'), 180000);
        child.once('error', error => { clearTimeout(timer); reject(error); }); child.once('exit', code => { clearTimeout(timer); done(code); });
      });
      assert.equal(code, 0, `Missing/failed comparison ${name}`); results[label].push(JSON.parse(readFileSync(path)));
    } finally { closeSync(fd); }
  }
  const checks = { control: verifyRepeatedComparison(results.control, PRACTICAL_COMPARISON_CASES, releaseBase), candidate: verifyRepeatedComparison(results.candidate, PRACTICAL_COMPARISON_CASES, candidateCommit) };
  for (const row of results.candidate) assert.equal(row.fixtureSha256, results.control.find(other => other.run === row.run && other.caseId === row.caseId).fixtureSha256);
  const report = { passed: true, reproducible: true, releaseBase, candidateCommit, checks, cases: PRACTICAL_COMPARISON_CASES,
    normalization: 'None. Full matching results, including ordered options, quantities, doses, advice, prices and attempts, are compared exactly. Timing/CPU/RSS live separately in measurements.',
    provenance: results.candidate[0].provenance, contextProvenance: results.candidate[0].contextProvenance,
    comparison: PRACTICAL_COMPARISON_CASES.map(caseId => ({ caseId, control: metrics(results.control.find(row => row.run === 'a' && row.caseId === caseId)), candidate: metrics(results.candidate.find(row => row.run === 'a' && row.caseId === caseId)) })) };
  const real = report.comparison.find(row => row.caseId === 'reported-web');
  assert.ok(real.candidate.overallPenalty != null && real.candidate.products.length > 0);
  assert.ok(real.candidate.pillLowerBound < 16, 'Reported strong web routine must improve verified burden');
  assert.ok(real.candidate.labelledServings.every(q => Number.isFinite(q) && q < 625), 'Serving burden cannot be evaded');
  const importance = report.comparison.filter(row => row.caseId.startsWith('importance-'));
  assert.equal(importance[0].candidate.dailyPills, 8); assert.equal(importance[1].candidate.dailyPills, 7);
  assert.equal(importance[0].control.dailyPills, 8); assert.equal(importance[1].control.dailyPills, 8);
  writeFileSync(resolve(output, 'comparison.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
  return report;
}
export function verifyPracticalLocks(control) {
  const original = scanLockSites(control), current = scanLockSites(process.cwd());
  assert.deepEqual(verifyLockSites(current, JSON.parse(readFileSync('test/service-efficiency/lock-register.json'))), []);
  return verifyNoAddedLocks(original, current);
}
