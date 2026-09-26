import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import postgres from 'postgres';
import { runPrdLiveCatalogueSync, type RunPrdLiveCatalogueSyncInput } from '../../lib/prd-live-catalogue-sync.ts';
import { catalogueSnapshotTableNames } from '../../lib/catalogue-snapshot-tables.ts';

assert.ok(process.env.TEST_DB_URL, 'Isolated PostgreSQL is mandatory');
const url = new URL(process.env.TEST_DB_URL);
assert.equal(url.hostname, '127.0.0.1');
assert.match(url.pathname, /^\/mattanutra_lock_review/);
const reader = postgres(url.href, { max: 1, connection: { default_transaction_read_only: 'on', statement_timeout: '3s' } });
const holder = postgres(url.href, { max: 1 });
after(async () => { await reader.end(); await holder.end(); });

async function underWriter(work: (input: RunPrdLiveCatalogueSyncInput & { outputDir: string }) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'catalogue-read-lock-'));
  const [row] = await reader`select id,title,normalized_url from public.products where normalized_url is not null limit 1`;
  assert.ok(row, 'A real nonempty catalogue product is required');
  const [mode] = await reader`select current_setting('default_transaction_read_only') as value`;
  assert.equal(mode.value, 'on', 'The probe must be unable to modify catalogue or protected data');
  const tables = Object.fromEntries(catalogueSnapshotTableNames().map(table => [table, table === 'products' ? [row] : []]));
  const inputPath = join(dir, 'source.json');
  await writeFile(inputPath, JSON.stringify({ formatVersion: 1, tables }));
  const released = Promise.withResolvers<void>(), acquired = Promise.withResolvers<void>();
  const held = holder.begin(async sql => {
    const [lock] = await sql`select pg_try_advisory_xact_lock(hashtext('mattanutra-prd-live-catalogue-sync')) as locked`;
    assert.equal(lock.locked, true); acquired.resolve(); await released.promise;
  });
  held.catch(acquired.reject);
  try {
    await acquired.promise;
    await work({ sql: reader, inputPath, outputDir: join(dir, 'report'), skipValidation: true });
  } finally { released.resolve(); await held; await rm(dir, { recursive: true, force: true }); }
}

test('PERF-LOCK-09 catalogue dry-run is read-only and completes while its writer guard is held', async () => {
  await underWriter(async input => {
    const result = await runPrdLiveCatalogueSync({ ...input, apply: false });
    assert.equal(result.dryRun, true); assert.equal(result.applied, false);
    assert.equal(result.tables.products.sourceRows, 1); assert.ok(result.tables.products.targetRowsBefore! > 0);
    assert.deepEqual(JSON.parse(await readFile(join(input.outputDir, 'summary.json'), 'utf8')), result);
  });
});

test('PERF-LOCK-10 catalogue apply retains its fail-fast exclusive writer guard', async () => {
  await underWriter(async input => {
    await assert.rejects(runPrdLiveCatalogueSync({ ...input, apply: true }), /Another PRD catalogue sync appears to be running/);
  });
});
