import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { MCP_PACKAGES, packageStages } from '../../scripts/mcp-721-proof.mjs';
import { fullTestInventory } from '../../scripts/run-full-test-suite.mjs';

test('PRACTICAL-RELEASE-01 existing release runner requires full maintained matching and bounded package proof', () => {
  assert.equal(MCP_PACKAGES.practical?.version, '8.0.0');
  for (const stage of ['complete-mcp-regression', 'affected-tests', 'typecheck', 'release-diff-lint', 'production-build', 'affected-browser-tests', 'bounded-semantic-comparison', 'no-new-locks', 'unchanged-source-and-inputs']) assert.ok(packageStages('practical').includes(stage), stage);
  const files = fullTestInventory().mcp; assert.ok(files.includes('test/practical-matching/scoring.test.ts'));
  for (const path of ['scripts/deploy-dev.mjs', 'scripts/deploy-uat.mjs']) assert.match(readFileSync(path, 'utf8'), /--practical-matching-attestation/);
});

test('PRACTICAL-RELEASE-02 semantic comparison rejects altered doses, advice, option order or missing evidence', async () => {
  const { verifyRepeatedComparison } = await import('../../scripts/practical-matching/comparison.mjs');
  const semantic = { selected: { products: ['a'], quantity: 1, price: 100, advice: ['unknown intake'] }, options: ['a', 'b'], attempts: 700 };
  const row = (run: string) => ({ run, caseId: 'fixture', sourceCommit: 'candidate', fixtureSha256: 'inputs', semantic, measurements: { wallMs: run === 'a' ? 1 : 2 } });
  assert.doesNotThrow(() => verifyRepeatedComparison([row('a'), row('b')], ['fixture'], 'candidate'));
  for (const mutation of [{ ...semantic, options: ['b', 'a'] }, { ...semantic, attempts: 699 }, { ...semantic, selected: { ...semantic.selected, quantity: 2 } }, { ...semantic, selected: { ...semantic.selected, advice: [] } }]) {
    assert.throws(() => verifyRepeatedComparison([row('a'), { ...row('b'), semantic: mutation }], ['fixture'], 'candidate'));
  }
  assert.throws(() => verifyRepeatedComparison([row('a')], ['fixture'], 'candidate'));
  assert.throws(() => verifyRepeatedComparison([row('a'), { ...row('b'), fixtureSha256: 'other' }], ['fixture'], 'candidate'));
});

test('PRACTICAL-RELEASE-03 lock comparison permits an explicitly renamed checkout fence and rejects additions', async () => {
  const { verifyNoAddedLocks } = await import('../../scripts/practical-matching/comparison.mjs');
  const before = [{ file: 'lib/checkout.ts', owner: 'read', statement: 'select id from catalogue for share' }];
  assert.doesNotThrow(() => verifyNoAddedLocks(before, [{ ...before[0], owner: 'lockCheckout' }]));
  assert.throws(() => verifyNoAddedLocks(before, [...before, { file: 'lib/matcher/search.ts', owner: 'match', statement: 'select id from catalogue for share' }]));
});

test('PRACTICAL-RELEASE-04 compiled worker identity exists before the complete PostgreSQL and HTTP inventory', () => {
  const stages = packageStages('practical');
  assert.deepEqual(stages.slice(0, 3), ['typecheck', 'release-diff-lint', 'production-build']);
  assert.equal(stages.filter(stage => stage === 'production-build').length, 1);
  assert.ok(stages.indexOf('production-build') < stages.indexOf('complete-mcp-regression'));
});
