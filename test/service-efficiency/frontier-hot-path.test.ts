import assert from 'node:assert/strict';
import test from 'node:test';

const select = async () => (await import('../../lib/matcher/top-k.ts')).smallest;
const rows = Array.from({ length: 2000 }, (_, id) => ({ id, score: (id * 7919) % 103 }));

test('EFF-HOT-08 bounded selection preserves stable sort order and ties without mutating candidates', async () => {
  const smallest = await select(), original = [...rows];
  for (const limit of [0, 1, 12, 24, 48, 2000, 2100]) {
    const result = smallest(rows, limit, (a, b) => a.score - b.score);
    assert.deepEqual(result, [...rows].sort((a, b) => a.score - b.score).slice(0, limit));
  }
  assert.deepEqual(rows, original);
  assert.deepEqual(smallest([], 12, () => 0), []);
  assert.deepEqual(smallest(rows, 12, () => Number.NaN), rows.slice(0, 12));
});

test('EFF-HOT-09 selecting a small frontier reduces comparisons against a complete sort', async () => {
  const smallest = await select();
  let partial = 0, full = 0;
  const expected = [...rows].sort((a, b) => { full++; return a.score - b.score; }).slice(0, 12);
  const result = smallest(rows, 12, (a, b) => { partial++; return a.score - b.score; });
  assert.deepEqual(result, expected);
  assert.ok(partial < full / 2, `${partial} comparisons must be less than half of ${full}`);
});
