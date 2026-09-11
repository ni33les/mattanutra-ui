import assert from 'node:assert/strict';
import test from 'node:test';
import { request, product, catalog } from '../matcher/flexible-v5-fixtures.ts';
import { createMatchCursor, advanceMatchCursor, expandMatchCursor, matchCursorAttempts } from '../../lib/matcher/match-cursor.ts';
import { DEFAULT_MATCHER_CONFIG, match } from '../../lib/matcher/index.ts';
import { encodeMatchCursorBytes, decodeMatchCursor } from '../../lib/matcher/cursor-codec-server.ts';

const fixture = () => ({ input: request(), products: catalog([product('one', { a: 75 }), product('two', { a: 50 })]), config: { ...DEFAULT_MATCHER_CONFIG, expansionBudget: 8 } });

test('EFF-HOT-05 the final productive chunk marks completion without a zero-work continuation', () => {
  const { input, products, config } = fixture();
  const cursor = createMatchCursor(input, products, config);
  advanceMatchCursor(cursor, input, 8);
  assert.equal(matchCursorAttempts(cursor), 8);
  assert.equal(cursor.done, true);
  assert.deepEqual(match(input, products, config, undefined, undefined, cursor), match(input, products, config));
});

test('EFF-HOT-06 old unfinished terminal checkpoints recover without consuming attempts', () => {
  const { input, products, config } = fixture();
  const cursor = createMatchCursor(input, products, config);
  advanceMatchCursor(cursor, input, 8);
  cursor.done = false; // The previous writer needed a zero-work finalization call.
  const restored = decodeMatchCursor(encodeMatchCursorBytes(cursor), cursor.identity);
  advanceMatchCursor(restored, input, 1);
  assert.equal(restored.done, true);
  assert.equal(matchCursorAttempts(restored), 8);
  assert.deepEqual(match(input, products, config, undefined, undefined, restored), match(input, products, config));
});

test('EFF-HOT-07 terminal standard checkpoints remain expandable and resume identically', () => {
  const { input, products, config } = fixture();
  const cursor = createMatchCursor(input, products, config);
  advanceMatchCursor(cursor, input, 8);
  const restored = decodeMatchCursor(encodeMatchCursorBytes(cursor), cursor.identity);
  expandMatchCursor(cursor); expandMatchCursor(restored);
  for (const current of [cursor, restored]) advanceMatchCursor(current, input, 16);
  assert.equal(matchCursorAttempts(cursor), matchCursorAttempts(restored));
  assert.ok(matchCursorAttempts(cursor) > 8);
  assert.deepEqual(restored, cursor);
});
