import assert from 'node:assert/strict';
import test from 'node:test';
import { testSourceHygiene, nodeExecutionProof } from '../../scripts/test-execution-proof.mjs';

test('SPLAN-HYGIENE-01 shared hygiene rejects empty-precondition passes and automatic retries', () => {
  for (const source of ["test('fixture', () => { if (!rows.length) return; assert.equal(rows[0], 1); });",
    "test('retry', { retries: 2 }, () => assert.ok(true));", "test.only('focused', () => assert.ok(true));",
    "test('todo', { todo: true }, () => assert.ok(true));"]) assert.ok(testSourceHygiene(source, 'fixture.test.ts').length, source);
  assert.deepEqual(testSourceHygiene("test('fixture', () => { assert.ok(rows.length); assert.equal(rows[0], 1); });", 'fixture.test.ts'), []);
});
test('SPLAN-HYGIENE-02 missing, cancelled and skipped executions never count as green', () => {
  for (const events of [[], [{ file: 'fixture.test.ts', type: 'test', name: 'fixture', passed: true, skip: true }],
    [{ file: 'fixture.test.ts', type: 'test', name: 'fixture', passed: false, failureType: 'cancelledByParent' }]])
    assert.equal(nodeExecutionProof(['fixture.test.ts'], events).passed, false);
});
