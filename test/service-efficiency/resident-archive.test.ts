import assert from 'node:assert/strict';
import test from 'node:test';
import { deserialize } from 'node:v8';
import { request, product, catalog } from '../matcher/flexible-v5-fixtures.ts';
import { compileGroups } from '../../lib/matcher/candidates.ts';
import { DEFAULT_MATCHER_CONFIG } from '../../lib/matcher/config.ts';
import { createSearchCursor, advanceSearchCursor, archivedSearchStates, searchCursorResult, extendSearchCursor } from '../../lib/matcher/search-cursor.ts';
import { encodeSearchCursor, decodeSearchCursor } from '../../lib/matcher/cursor-codec-server.ts';

function fixture() {
  const input = request();
  const groups = compileGroups(input, catalog([
    product('a', { a: 37 }), product('b', { a: 11 }), product('c', { a: 29 })
  ]));
  const cursor = createSearchCursor(groups, input, { ...DEFAULT_MATCHER_CONFIG, expansionBudget: 180, exactGroupLimit: 0 });
  advanceSearchCursor(cursor, input, 17);
  assert.equal(cursor.expansionAttempts, 17);
  assert.ok(cursor.archive.size > 1);
  return { input, cursor };
}

test('PERF-CPU-65 resident archive retains evaluated states without duplicating their exposure arrays', () => {
  const { cursor } = fixture();
  const states = [...archivedSearchStates(cursor)];
  assert.equal(states.length, cursor.archive.size);
  for (const [i, value] of [...cursor.archive.values()].entries()) {
    assert.strictEqual(value, states[i], 'Checkpoint-off search needs the live state, not a second packed copy');
  }
});

test('PERF-CPU-66 opt-in encoding keeps the historical packed format and leaves resident state intact', () => {
  const { input, cursor } = fixture();
  const before = [...archivedSearchStates(cursor)];
  const encoded = encodeSearchCursor(cursor);
  const wire = deserialize(Buffer.from(encoded, 'base64'));
  assert.equal(wire.version, 'search-cursor-1');
  for (const row of wire.archive.values()) {
    assert.ok(Array.isArray(row), 'Previous checkpoint readers require packed tuples');
    assert.ok(Array.isArray(row[6]));
  }
  const restored = decodeSearchCursor(encoded, cursor.identity);
  assert.deepEqual([...archivedSearchStates(restored)], before);
  assert.deepEqual([...archivedSearchStates(structuredClone(cursor))], before);
  for (const [i, state] of [...archivedSearchStates(cursor)].entries()) assert.strictEqual(state, before[i]);
  while (!cursor.done) advanceSearchCursor(cursor, input, 13);
  while (!restored.done) advanceSearchCursor(restored, input, 19);
  assert.deepEqual(searchCursorResult(restored, input), searchCursorResult(cursor, input));
  assert.equal(restored.expansionAttempts, 180);
  for (const item of [cursor, restored]) {
    extendSearchCursor(item, 320);
    while (!item.done) advanceSearchCursor(item, input, 29);
  }
  assert.equal(restored.expansionAttempts, cursor.expansionAttempts);
  assert.deepEqual(searchCursorResult(restored, input), searchCursorResult(cursor, input));
});
