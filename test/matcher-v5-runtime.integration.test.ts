import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { getCatalogueRuntimeRevision } from "../lib/catalogue-runtime-revision.ts";

const databaseUrl = process.env.TEST_DB_URL;
assert.ok(databaseUrl, "Runtime revision tests require isolated TEST_DB_URL");
const url = new URL(databaseUrl);
assert.equal(url.hostname, "127.0.0.1");
assert.match(url.pathname, /^\/mattanutra_lock_review(?:[_-][a-zA-Z0-9_-]+)?$/);
const sql = postgres(databaseUrl, { max: 2, onnotice: () => {} });
const id = randomUUID();
before(async () => { await sql`insert into public.products (id,platform,title,normalized_title,product_url,normalized_url) values (${id},'manual',${id},${id},${`https://fixture.example/${id}`},${`https://fixture.example/${id}`})`; });
after(async () => { try { await sql`delete from public.products where id=${id}`; } finally { await sql.end(); } });

test("WEB5-PG-01 catalogue identity exposes only committed facts and survives rollback", async () => {
 const before = await getCatalogueRuntimeRevision(sql);
 let entered!: (epoch: number) => void;
 let rejectReady!: (error: unknown) => void;
 let release!: () => void;
 const ready = new Promise<number>((resolve, reject) => { entered = resolve; rejectReady = reject; });
 const proceed = new Promise<void>(resolve => { release = resolve; });
 const change = sql.begin(async tx => {
  await tx`update public.products set administration=${tx.json({route:"topical"})} where id=${id}`;
  entered(await getCatalogueRuntimeRevision(tx)); await proceed;
 });
 void change.catch(rejectReady);
 try {
  assert.equal(await ready, before, "publication waits until commit, including for the writer");
  assert.equal(await getCatalogueRuntimeRevision(sql), before, "uncommitted evidence never changes a reader's epoch");
 } finally { release(); await change; }
 assert.equal(await getCatalogueRuntimeRevision(sql), before + 1);
 await assert.rejects(sql.begin(async tx => { await tx`update public.products set administration=null where id=${id}`; throw new Error("rollback"); }), /rollback/);
 assert.equal(await getCatalogueRuntimeRevision(sql), before + 1);
});

/** Verify committed invalidation without ever publishing uncommitted writer state. */
async function committedEpochChange(work: (tx: postgres.TransactionSql) => Promise<void>, delta: number, reason: string) {
 const before = await getCatalogueRuntimeRevision(sql);
 await sql.begin(async tx => {
  await work(tx);
  assert.equal(await getCatalogueRuntimeRevision(tx), before, "publication is deferred until commit");
 });
 assert.equal(await getCatalogueRuntimeRevision(sql), before + delta, reason);
}

test("WEB5-PG-02 organisation pricing and eligibility changes advance the epoch, telemetry does not", async () => {
 const organisationId = randomUUID();
 try {
  await sql`insert into public.organisations (id,slug,name,organisation_type) values (${organisationId},${organisationId},'Epoch fixture','tenant')`;
  await committedEpochChange(async tx => {
   await tx`update public.organisations set updated_at=now(),metadata=metadata || '{"lastViewedAt":"fixture"}'::jsonb where id=${organisationId}`;
  }, 0, "irrelevant metadata must not invalidate all plans");
  await committedEpochChange(async tx => {
   await tx`update public.organisations set metadata=metadata || '{"customerPriceMarginPercent":21}'::jsonb where id=${organisationId}`;
  }, 1, "a committed margin change invalidates cached prices");
  await committedEpochChange(async tx => {
   await tx`update public.organisations set metadata=metadata || '{"customerPriceMarginPercent":21}'::jsonb where id=${organisationId}`;
  }, 0, "same-value writes do not cause revision churn");
  await committedEpochChange(async tx => {
   await tx`update public.organisations set country_code='GB',currency='GBP' where id=${organisationId}`;
  }, 1, "market and currency changes invalidate catalogue eligibility");
  await committedEpochChange(async tx => {
   await tx`update public.organisations set status='disabled' where id=${organisationId}`;
  }, 1, "deactivating a retailer invalidates catalogue eligibility");
  await committedEpochChange(async tx => {
   await tx`update public.organisations set metadata=metadata || '{"customerPriceMarginPercent":22}'::jsonb where id=${organisationId}`;
   await tx`update public.organisations set country_code='TH',currency='THB' where id=${organisationId}`;
  }, 1, "multiple relevant edits publish one committed epoch");
 } finally { await sql`delete from public.organisations where id=${organisationId}`; }
});

test("WEB5-PG-03 brand approval changes advance the epoch without administrative-note churn", async () => {
 const brandId = randomUUID();
 try {
  await sql`insert into public.product_brands (id,name,normalized_name,status) values (${brandId},${brandId},${brandId},'approved')`;
  await committedEpochChange(async tx => {
   await tx`update public.product_brands set updated_at=now(),admin_notes='reviewed fixture' where id=${brandId}`;
  }, 0, "administrative notes do not change eligibility");
  await committedEpochChange(async tx => {
   await tx`update public.product_brands set status='pending_review' where id=${brandId}`;
  }, 1, "a committed approval change invalidates cached sellable products");
  await committedEpochChange(async tx => {
   await tx`update public.product_brands set status='pending_review' where id=${brandId}`;
  }, 0, "same-value approval writes do not cause revision churn");
 } finally { await sql`delete from public.product_brands where id=${brandId}`; }
});
