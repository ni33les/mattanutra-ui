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


test('PERF-CPU-10 raw-dose leaders read each exact dose once and preserve the former stable selection', async () => {
  const { rawDoseLeaders } = await import('../../lib/matcher/search-cursor.ts');
  const { seedState, compareSearchStates, residualPattern } = await import('../../lib/matcher/search.ts');
  const { numericalDoseFitScore, doseFitTargetDeviations, compareDoseFit } = await import('../../lib/matcher/dose-fit.ts');
  const { request } = await import('../matcher/flexible-v5-fixtures.ts');
  const input = request(); let reads=0;
  const candidates=Array.from({length:1000},(_,id)=>{
    const exposure=new Map([['a',BigInt((id*7919)%1000+1)*99000n]]);
    return {...seedState(input),get exposure(){reads++;return exposure;},selectedVariantIds:[String(id)]};
  });
  const order=(a: typeof candidates[number],b: typeof candidates[number])=>compareDoseFit(numericalDoseFitScore(input,a.exposure),numericalDoseFitScore(input,b.exposure))||compareSearchStates(a,b,input);
  const ranked=[...candidates].sort(order);
  const met=(state:typeof candidates[number])=>doseFitTargetDeviations(numericalDoseFitScore(input,state.exposure)).filter(row=>row.under===0&&row.over===0).length;
  const exact=[...ranked].sort((a,b)=>met(b)-met(a)||order(a,b));
  const expected=[...new Set([ranked[0],...exact.slice(0,2)])].filter(Boolean) as typeof candidates;
  const patterns=new Set(expected.map(state=>residualPattern(state,input)));
  for(const state of ranked){const pattern=residualPattern(state,input);if(!patterns.has(pattern)){expected.push(state);patterns.add(pattern);}if(expected.length>=6)break;}
  for(const state of ranked){if(expected.length>=6)break;if(!expected.includes(state))expected.push(state);}
  reads=0;const actual=rawDoseLeaders(candidates,input,6);
  assert.deepEqual(actual,expected);
  assert.ok(reads<2*candidates.length,`${reads} exposure reads must not scale with sort comparisons`);
  assert.deepEqual(rawDoseLeaders([],input,6),[]);
});

test('PERF-CPU-34 raw-dose repair preserves stable diverse leaders without sorting every candidate', async () => {
  const { rawDoseLeaders } = await import('../../lib/matcher/search-cursor.ts');
  const { seedState, compareSearchStates, residualPattern } = await import('../../lib/matcher/search.ts');
  const { numericalDoseFitScore, doseFitTargetDeviations, compareDoseFit } = await import('../../lib/matcher/dose-fit.ts');
  const { request } = await import('../matcher/flexible-v5-fixtures.ts');
  const input = request(), base = seedState(input);
  const candidates = Array.from({ length: 320 }, (_, i) => {
    const exposure = new Map([['a', BigInt((i * 19) % 64) * 10_000_000n]]);
    return { ...base, exposure, delivered: exposure, price: i % 7, selectedVariantIds: [String(i % 16)] };
  });
  const order = (a: typeof base, b: typeof base) => compareDoseFit(numericalDoseFitScore(input, a.exposure), numericalDoseFitScore(input, b.exposure)) || compareSearchStates(a, b, input);
  const ranked = [...candidates].sort(order);
  const met = (state: typeof base) => doseFitTargetDeviations(numericalDoseFitScore(input, state.exposure)).filter(row => row.under === 0 && row.over === 0).length;
  for (const limit of [1, 2, 6, 12]) {
    const exact = [...ranked].sort((a, b) => met(b) - met(a) || order(a, b));
    const expected = [...new Set([ranked[0]!, ...exact.slice(0, 2)])].slice(0, limit);
    const patterns = new Set(expected.map(state => residualPattern(state, input)));
    for (const state of ranked) { const key = residualPattern(state, input); if (!patterns.has(key)) { expected.push(state); patterns.add(key); } if (expected.length >= limit) break; }
    for (const state of ranked) { if (expected.length >= limit) break; if (!expected.includes(state)) expected.push(state); }
    const original = Array.prototype.sort; let fullSorts = 0, actual;
    try {
      Array.prototype.sort = function (...args) {
        if (this.length === candidates.length && this[0]?.selectedVariantIds) fullSorts++;
        return Reflect.apply(original, this, args);
      };
      actual = rawDoseLeaders(candidates, input, limit);
    } finally { Array.prototype.sort = original; }
    assert.deepEqual(actual, expected);
    actual.forEach((state, i) => assert.equal(state, expected[i], 'Equal values retain the original stable identity'));
    assert.equal(fullSorts, 0, 'Only the bounded leaders and distinct pattern minima require ordering');
  }
});
