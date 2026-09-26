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


test('PERF-CKPT-01 completed bounded search releases obsolete frontiers while retaining restart and expansion', () => {
  const input=request(), products=catalog(Array.from({length:12},(_,i)=>product(`checkpoint-${i}`,{a:15+i})));
  const config={...DEFAULT_MATCHER_CONFIG,exactGroupLimit:0,expansionBudget:300};
  const cursor=createMatchCursor(input,products,config);
  advanceMatchCursor(cursor,input,16);
  const active=structuredClone(cursor.sellers[0]!.cursor);
  assert.equal(active.done,false);assert.ok(active.singles.length>0,'Active exploration must retain its live frontier');
  advanceMatchCursor(cursor,input,300);assert.equal(cursor.done,true);
  const complete=cursor.sellers[0]!.cursor;
  assert.equal(complete.exact,false);assert.ok(complete.archive.size>0&&complete.review.length>0,'Archive and useful candidates must survive');
  for(const field of ['singles','beam','expanded','repairJobs','repaired','second','secondReferences','exactStack'] as const)
    assert.equal(complete[field].length,0,`Completed ${field} must not be encoded in every later checkpoint`);
  const restored=decodeMatchCursor(encodeMatchCursorBytes(cursor),cursor.identity);
  const historical=structuredClone(restored);
  Object.assign(historical.sellers[0]!.cursor,{singles:active.singles,beam:active.beam,expanded:active.expanded});
  for(const current of [cursor,restored,historical]){expandMatchCursor(current);advanceMatchCursor(current,input,400);}
  assert.deepEqual(restored,cursor);assert.deepEqual(historical,cursor);
  assert.equal(matchCursorAttempts(cursor),700,'Cleanup must not alter or consume search attempts');
});
