import type { CanonicalRequest } from "../../lib/matcher/types.ts";
import { compileGroups } from '../../lib/matcher/candidates.ts';
import { createSearchCursor, advanceSearchCursor, archivedSearchStates, searchCursorResult } from '../../lib/matcher/search-cursor.ts';
import { encodeSearchCursor, decodeSearchCursor } from '../../lib/matcher/cursor-codec-server.ts';
import { DEFAULT_MATCHER_CONFIG } from '../../lib/matcher/config.ts';
import { seedState, tryAddVariant } from '../../lib/matcher/search.ts';
import { doseFitScore } from '../../lib/matcher/dose-fit.ts';
import { closestDoseOption } from "./flexible-v5-fixtures.ts";
import assert from 'node:assert/strict';
import { it } from 'node:test';
import { match } from '../../lib/matcher/index.ts';
import { canonicalizeTargets, canonicalizeCurrents } from '../../lib/matcher/canonicalizer.ts';
import { catalog, product, request } from './flexible-v5-fixtures.ts';
it('V5-SEARCH-05: a companion product creates a supported remaining-gap quantity absent from standalone breakpoints', () => {
  const targets = canonicalizeTargets({ targets: ['a', 'b'].map(subjectId => ({ subjectId, name: subjectId.toUpperCase(), amount: 100, unit: 'mg' as const })) }).targets;
  const result = match(request({ targets, productDoses: [{ productId: 'companion', servingsPerDay: 1 }] }),
    catalog([product('companion', { a: 40, b: 100 }), product('small', { a: 10 })]));
  const selected = closestDoseOption(result);
  assert.equal(selected?.doseFit?.total, 0);
  assert.deepEqual(selected?.variantIds.slice().sort(), ['seller:companion:x1', 'seller:small:x6']);
  assert.deepEqual(selected?.variantDoses?.find(row => row.productId === 'small'), { productId: 'small', dailyUnits: 6, dailyPills: 6 });
});

// The final completion group can receive exactly one new expansion. Build its
// already evaluated practical/reference bases independently of search, so this
// boundary test cannot pass merely because a wider search found the witness.
function completionBoundary(options: { unitsPerServing?: number; onlyPractical?: boolean; target?: number; basis?: "supplemental" | "total_daily"; exactQuantity?: number; intake?: Partial<CanonicalRequest> } = {}) {
  const unitsPerServing = options.unitsPerServing ?? 1;
  const targets = canonicalizeTargets({ targets: [
    { subjectId: 'a', name: 'A', amount: 100, unit: 'mg' },
    { subjectId: 'b', name: 'B', amount: options.target ?? 20, unit: 'mg', basis: options.basis ?? 'supplemental' }
  ] }).targets;
  const r = request({ targets, ...options.intake });
  const administration = (units: number) => ({ route: 'oral' as const, physicalUnit: 'capsule' as const,
    unitsPerServing: units, doseIncrement: 1, packQuantity: 30,
    provenance: { status: 'verified' as const, sourceUrl: 'https://example.test/label', sourceText: 'One whole capsule is supported.', verifiedAt: '2026-09-26T00:00:00Z' } });
  const groups = compileGroups(r, catalog([
    product('base', { a: 100, b: 5 }, 100, { administration: administration(1), pillCountKnown: true }),
    product('completion', { b: 5 * unitsPerServing }, 100, { administration: administration(unitsPerServing), pillCountKnown: true, dailyPillsPerServing: unitsPerServing })
  ]));
  const baseGroup = groups.find(group => group.productId === 'base')!;
  const completingGroup = groups.find(group => group.productId === 'completion')!;
  const base = tryAddVariant(seedState(r), baseGroup.variants.find(row => row.dailyUnits === 1)!, baseGroup, r)!;
  const exactQuantity = options.exactQuantity ?? 3 / unitsPerServing;
  const practical = tryAddVariant(base, completingGroup.variants.find(row => row.dailyUnits === exactQuantity)!, completingGroup, r)!;
  assert.ok(base && practical);
  const cursor = createSearchCursor(groups, r, { ...DEFAULT_MATCHER_CONFIG, expansionBudget: 1 });
  // Resume the ordinary repair-to-second transition with its last attempt.
  cursor.exact = false; cursor.phase = 'repair'; cursor.repairLimit = 0;
  cursor.repaired = options.onlyPractical ? [base] : [practical, base];
  cursor.review = [...cursor.repaired]; cursor.unreviewed = [];
  return { cursor, r, exactQuantity, practical, base };
}

it('V5-SEARCH-06: one completion attempt preserves the supported exact residual and physical serving grid', () => {
  for (const unitsPerServing of [1, 2, 9]) {
    const { cursor, r, exactQuantity, practical } = completionBoundary({ unitsPerServing });
    const resumed = decodeSearchCursor(encodeSearchCursor(cursor), cursor.identity);
    // Observe the active completion phase; terminal cleanup deliberately frees
    // this frontier after its attempts have been archived.
    let second = cursor.second, firstBase: readonly string[] | undefined;
    Object.defineProperty(cursor, 'second', { enumerable: true, get: () => second, set: value => {
      second = value; if (value.length) firstBase ??= value[0].selectedVariantIds;
    } });
    advanceSearchCursor(cursor, r, 1); advanceSearchCursor(resumed, r, 1);
    assert.deepEqual(searchCursorResult(resumed, r), searchCursorResult(cursor, r));
    assert.deepEqual(firstBase, practical.selectedVariantIds, 'The practical incumbent keeps first priority');
    assert.equal(cursor.expansionAttempts, 1);
    assert.equal(cursor.edges.size, 1);
    const attempted = cursor.variantIds[Number([...cursor.edges.keys()][0]!.split('>')[1])];
    assert.equal(attempted, `seller:completion:x${exactQuantity}`);
    assert.ok([...archivedSearchStates(cursor)].some(state => doseFitScore(r, state.exposure).total === 0));
    assert.equal(cursor.done, true);
  }
});

it('V5-SEARCH-07: residual ordering leaves the primary practical base unchanged across a checkpoint', () => {
  const { cursor, r } = completionBoundary({ onlyPractical: true });
  const resumed = decodeSearchCursor(encodeSearchCursor(cursor), cursor.identity);
  advanceSearchCursor(cursor, r, 1); advanceSearchCursor(resumed, r, 1);
  assert.deepEqual(searchCursorResult(resumed, r), searchCursorResult(cursor, r));
  const attempted = cursor.variantIds[Number([...cursor.edges.keys()][0]!.split('>')[1])];
  assert.equal(attempted, 'seller:completion:x1');
  assert.equal(cursor.expansionAttempts, 1);
});


it('V5-SEARCH-08: residual ordering respects target intake basis and keeps uncertain exposure uncertain', () => {
  const known = canonicalizeCurrents([{ subjectId: 'b', name: 'B', dailyAmount: 5, unit: 'mg', sourceId: 'known' }]);
  const estimated = canonicalizeCurrents([{ subjectId: 'b', name: 'B', dailyAmount: 5, minimumDailyAmount: 2, maximumDailyAmount: 8, certainty: 'estimated', unit: 'mg', sourceId: 'estimate' }]);
  assert.ok(!('error' in known) && !('error' in estimated));
  for (const [basis, currentSupplements, dietaryIntake, exactQuantity, expected] of [
    ['total_daily', known, known, 3, 3],
    ['supplemental', known, known, 4, 4],
    ['supplemental', known, estimated, 4, 4],
    ['total_daily', known, estimated, 3, 1],
    ['supplemental', estimated, known, 4, 1]
  ] as const) {
    const { cursor, r } = completionBoundary({ basis, target: 30, exactQuantity,
      intake: { currentSupplements, dietaryIntake, unknownIntakeSubjectIds: ['*'] } });
    advanceSearchCursor(cursor, r, 1);
    const attempted = cursor.variantIds[Number([...cursor.edges.keys()][0]!.split('>')[1])];
    assert.equal(attempted, `seller:completion:x${expected}`, `${basis}: current=${currentSupplements[0]?.certainty}, diet=${dietaryIntake[0]?.certainty}`);
    assert.deepEqual(r.unknownIntakeSubjectIds, ['*']);
    assert.equal(cursor.expansionAttempts, 1);
  }
  const fixed = request({ productDoses: [{ productId: 'small', servingsPerDay: 1 }] });
  const result = match(fixed, catalog([product('small', { a: 25 })]));
  assert.deepEqual(result.selected?.variantIds, ['seller:small:x1']);
});

it('V5-SEARCH-09: changed quantity traversal refuses a checkpoint from the previous matcher identity', () => {
  const { cursor, r } = completionBoundary();
  const previous = createSearchCursor(cursor.groups, r, { ...DEFAULT_MATCHER_CONFIG, version: 'importance-matching-4', expansionBudget: 1 });
  assert.notEqual(cursor.identity, previous.identity);
  assert.throws(() => decodeSearchCursor(encodeSearchCursor(previous), cursor.identity), /identity changed/);
});
