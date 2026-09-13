import assert from 'node:assert/strict';
import { execFileSync, fork } from 'node:child_process';
import { writeFileSync, openSync, closeSync } from 'node:fs';
import { resolve } from 'node:path';
import { payloadHash } from './mcp-payload/proof.mjs';
const [output, control] = process.argv.slice(2), root = process.cwd();
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
assert.equal(git(control, 'rev-parse', 'HEAD'), 'e588c405473480ef5e0796c6f48d195365d450fc');
assert.equal(git(control, 'status', '--porcelain'), '');
const rows = [];
for (const [mode, cwd] of [['control', control], ['candidate', root]]) {
  const log = openSync(resolve(output, `comparison-${mode}.log`), 'wx', 0o600);
  let value;
  try {
    const code = await new Promise((done, reject) => {
      const child = fork(resolve(root, 'test/mcp-streaming/benchmark-case.mjs'), [mode], { cwd,
        execArgv: ['--experimental-strip-types', '--import', resolve(cwd, 'test/helpers/offline-network.mjs'), '--import', resolve(cwd, 'scripts/register-ts-path-loader.mjs')],
        env: { ...process.env, AGENTIC_BUILD_ID: git(cwd, 'rev-parse', 'HEAD') }, stdio: ['ignore', log, log, 'ipc'] });
      const timer = setTimeout(() => child.kill('SIGKILL'), 30_000);
      child.on('message', message => { value = message; });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); done(code); });
    });
    assert.equal(code, 0, `Failed ${mode} comparison`); assert.equal(value?.passed, true);
  } finally { closeSync(log); }
  writeFileSync(resolve(output, `comparison-${mode}.json`), JSON.stringify(value, null, 2), { flag: 'wx', mode: 0o600 });
  rows.push(value);
}
assert.deepEqual(rows[0].input, rows[1].input);
assert.equal(rows[0].fixtureSha256, rows[1].fixtureSha256);
assert.deepEqual(rows[0].semantic, rows[1].semantic, 'Ordered products, quantities, prices, ingredient facts and advice must match');
assert.deepEqual(rows[0].work, rows[1].work, 'Streaming cannot add or remove search attempts');
for (const row of rows) { assert.equal(row.work.attempts, 8000); assert.equal(row.work.reservedAttempts, 0); assert.ok(row.semantic.choices.length > 0 && row.semantic.choices[0].ingredients.length > 0); }
assert.ok(rows[0].followUpPolls > 0); assert.equal(rows[1].planCalls, 1); assert.equal(rows[1].followUpPolls, 0);
assert.ok(rows[1].timings.deliveryAfterCommitMs < 1000, 'Committed results must not wait for the three-second polling interval');
const report = { passed: true, releaseBase: git(control, 'rev-parse', 'HEAD'), sourceCommit: git(root, 'rev-parse', 'HEAD'),
  fixtureSha256: rows[0].fixtureSha256, semanticSha256: payloadHash(JSON.stringify(rows[0].semantic)),
  normalization: 'Only capability handle is removed from semantic comparison. Timings and request counts remain separate.',
  environment: 'Isolated frozen-catalogue comparison; memory repository reads, no live database or provider actions. PostgreSQL delivery is verified in the integration cases.',
  rows: rows.map(({ mode, timings, planCalls, followUpPolls, repositoryReads, metrics, work }) => ({ mode, timings, planCalls, followUpPolls, repositoryReads, metrics, work })) };
writeFileSync(resolve(output, 'completion-comparison.json'), JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify(report));
