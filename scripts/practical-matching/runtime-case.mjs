/** One pure calculation per process; both source versions receive the same allowlisted frozen inputs. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
const [root, fixtureRoot, caseId, run, output] = process.argv.slice(2);
const load = path => import(pathToFileURL(resolve(root, path)).href);
const files = ['reported-web-plan.json', 'reported-client-context.json'];
const raw = files.map(file => readFileSync(resolve(fixtureRoot, file)));
const fixtureSha256 = createHash('sha256').update(Buffer.concat(raw)).digest('hex');
const [frozen, context] = raw.map(value => JSON.parse(value));
const { setMatcherSafetyCeilings } = await load('lib/matcher/safety-ceilings.ts');
setMatcherSafetyCeilings(frozen.ceilings);
let calculate;
if (caseId === 'reported-web') {
  const { recommendWithMatcher } = await load('lib/matcher/adapters/web.ts');
  calculate = () => recommendWithMatcher({ needs: frozen.runs[0].client_needs, candidates: frozen.snapshot.products.map(row => row.candidate),
    ...context, stackPreference: 'balanced', countryCode: 'TH', catalogueFingerprint: frozen.snapshot.catalogueVersion });
} else {
  const { match } = await load('lib/matcher/index.ts');
  const { catalog, product, request } = await load('test/matcher/flexible-v5-fixtures.ts');
  const { canonicalizeTargets } = await load('lib/matcher/canonicalizer.ts');
  const make = (id, amount, units, price = 10000) => product(id, { a: amount }, price, { dailyPillsPerServing: units, pillCountKnown: true,
    administration: { route: 'oral', physicalUnit: 'tablet', unitsPerServing: units, doseIncrement: 1, packQuantity: 60,
      provenance: { status: 'verified', sourceUrl: 'https://example.test/controlled-label', sourceText: 'Frozen labelled tablet quantities.', verifiedAt: '2026-09-10' } } });
  const targets = canonicalizeTargets({ targets: [{ subjectId: 'a', name: 'A', amount: 100, unit: 'mg', basis: 'supplemental' }] }).targets;
  assert.ok(['normal', 'strong', 'fewest_pills'].includes(caseId));
  calculate = () => match(request({ targets, maxDailyPills: 3, preferenceImportance: { maxDailyPills: caseId === 'strong' ? 'strong' : 'normal' },
    optimization: caseId === 'fewest_pills' ? 'fewest_pills' : 'balanced' }), catalog([make('sixteen', 100, 16), make('manageable', 80, 3)]));
}
const cpu = process.cpuUsage(), started = performance.now();
const semantic = calculate();
const used = process.cpuUsage(cpu);
writeFileSync(output, JSON.stringify({ version: 1, run, caseId, sourceCommit: execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), fixtureSha256,
  semantic, measurements: { wallMs: performance.now() - started, cpuMs: (used.user + used.system) / 1000, maxRssBytes: process.resourceUsage().maxRSS * 1024 },
  provenance: frozen.provenance, contextProvenance: context.provenance }, (_key, value) => typeof value === 'bigint' ? { exactInteger: String(value) } : value, 2), { flag: 'wx', mode: 0o600 });
