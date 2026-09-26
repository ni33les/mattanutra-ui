import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

// Exercise the real live-cache branch in isolation. Its SQL/epoch dependencies
// are controlled; no fixture-only cache or database/network access is involved.
function probe(scenario: string) {
  const source = `
    import assert from 'node:assert/strict';
    import { mock } from 'node:test';
    import { setImmediate as nextTurn } from 'node:timers/promises';
    delete process.env.NODE_TEST_CONTEXT;
    let clock = 1_000_000, revision = 1, loads = 0, query = async () => [];
    mock.method(Date, 'now', () => clock);
    mock.module('./lib/db.ts', { namedExports: { getSql: () => (...args) => query(...args) } });
    mock.module('./lib/catalogue-runtime-revision.ts', { namedExports: { getCatalogueRuntimeRevision: async () => revision } });
    mock.module('./lib/agentic/catalogue/live-supplements.ts', { namedExports: {
      loadLiveSupplementsForCountry: async () => [{ uuid: 'fixture', supplementId: 'fixture', name: 'Load ' + (++loads), aliases: [], acceptedUnits: ['mg'] }],
      buildContributionIndex: () => new Map()
    } });
    const { cachedLiveRetailSnapshot: read, warmLiveRetailSnapshot: warm, requireCachedLiveRetailSnapshot: current, resetLiveCatalogueCache: reset } = await import('./lib/agentic/catalogue/live.ts');
    const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
    reset();
    ${scenario}
    mock.restoreAll();
  `;
  return execFileSync(process.execPath, [
    "--experimental-test-module-mocks", "--experimental-strip-types",
    "--import", "./scripts/register-ts-path-loader.mjs", "--input-type=module", "-e", source
  ], { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, NODE_TEST_CONTEXT: "" }, timeout: 10_000 });
}

test("QUALITY-CACHE-01 failed background refresh is observed while same-epoch facts remain available", () => {
  assert.doesNotThrow(() => probe(`
    const original = await read('TH');
    clock += 600_001;
    const failures = [];
    process.on('unhandledRejection', error => failures.push(error));
    const failedQuery = deferred();
    query = async () => { failedQuery.resolve(); throw new Error('Controlled refresh failure'); };
    assert.equal(await read('TH'), original);
    await failedQuery.promise;
    await nextTurn(); await nextTurn();
    assert.deepEqual(failures, [], 'A background refresh must not reject an unobserved promise');
    query = async () => [];
    assert.equal(await read('TH'), original);
    await warm('TH');
    assert.equal(current('TH').supplements[0].name, 'Load 3');
  `));
});

test("QUALITY-CACHE-02 an obsolete load cannot republish after reset or replace a newer load", () => {
  assert.doesNotThrow(() => probe(`
    const entered = deferred(), release = deferred(); let queries = 0;
    query = async () => { if (++queries === 1) { entered.resolve(); await release.promise; } return []; };
    const old = read('TH');
    await entered.promise;
    reset();
    const fresh = await read('TH');
    assert.equal(fresh.supplements[0].name, 'Load 2');
    release.resolve();
    assert.equal((await old).supplements[0].name, 'Load 1');
    assert.equal(current('TH'), fresh, 'An obsolete load must not publish into the active cache');
  `));
});

test("QUALITY-CACHE-03 concurrent cold reads share one load and a changed epoch never returns old facts", () => {
  assert.doesNotThrow(() => probe(`
    const results = await Promise.all(Array.from({ length: 8 }, () => read('TH')));
    assert.equal(loads, 1);
    assert.ok(results.every(value => value === results[0]));
    revision++;
    query = async () => { throw new Error('New epoch unavailable'); };
    await assert.rejects(read('TH'), /New epoch unavailable/);
    query = async () => [];
    const next = await read('TH');
    assert.equal(next.runtimeRevision, 2);
    assert.notEqual(next, results[0]);
  `));
});

test("QUALITY-CACHE-04 a catalogue epoch change during loading rejects the inconsistent snapshot", () => {
  assert.doesNotThrow(() => probe(`
    query = async () => { revision++; return []; };
    await assert.rejects(read('TH'), /Catalogue changed during snapshot load/);
    assert.throws(() => current('TH'), /not ready/);
  `));
});
