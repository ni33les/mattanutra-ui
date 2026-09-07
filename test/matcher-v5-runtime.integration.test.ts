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
 let entered!: () => void;
 let release!: () => void;
 const ready = new Promise<void>(resolve => { entered = resolve; });
 const proceed = new Promise<void>(resolve => { release = resolve; });
 const change = sql.begin(async tx => {
  await tx`update public.products set administration=${tx.json({route:"topical"})} where id=${id}`;
  assert.equal(await getCatalogueRuntimeRevision(tx), before + 1);
  entered(); await proceed;
 });
 await ready;
 try { assert.equal(await getCatalogueRuntimeRevision(sql), before, "uncommitted evidence never changes a reader's epoch"); } finally { release(); await change; }
 assert.equal(await getCatalogueRuntimeRevision(sql), before + 1);
 await assert.rejects(sql.begin(async tx => { await tx`update public.products set administration=null where id=${id}`; throw new Error("rollback"); }), /rollback/);
 assert.equal(await getCatalogueRuntimeRevision(sql), before + 1);
});

test("WEB5-PG-02 organisation pricing and eligibility changes advance the epoch, telemetry does not", async () => {
 await assert.rejects(sql.begin(async tx => {
  const organisationId = randomUUID();
  await tx`insert into public.organisations (id,slug,name,organisation_type) values (${organisationId},${organisationId},'Epoch fixture','tenant')`;
  const initial = await getCatalogueRuntimeRevision(tx);
  await tx`update public.organisations set updated_at=now(),metadata=metadata || '{"lastViewedAt":"fixture"}'::jsonb where id=${organisationId}`;
  assert.equal(await getCatalogueRuntimeRevision(tx), initial, "irrelevant metadata must not invalidate all plans");
  await tx`update public.organisations set metadata=metadata || '{"customerPriceMarginPercent":21}'::jsonb where id=${organisationId}`;
  assert.equal(await getCatalogueRuntimeRevision(tx), initial + 1, "a changed margin invalidates cached prices");
  await tx`update public.organisations set metadata=metadata || '{"customerPriceMarginPercent":21}'::jsonb where id=${organisationId}`;
  assert.equal(await getCatalogueRuntimeRevision(tx), initial + 1, "same-value writes do not cause revision churn");
  await tx`update public.organisations set country_code='GB',currency='GBP' where id=${organisationId}`;
  assert.equal(await getCatalogueRuntimeRevision(tx), initial + 2, "market and currency changes invalidate catalogue eligibility");
  await tx`update public.organisations set status='disabled' where id=${organisationId}`;
  assert.equal(await getCatalogueRuntimeRevision(tx), initial + 3, "deactivating a retailer invalidates catalogue eligibility");
  throw new Error("rollback epoch fixture");
 }), /rollback epoch fixture/);
});

test("WEB5-PG-03 brand approval changes advance the epoch without administrative-note churn", async () => {
 await assert.rejects(sql.begin(async tx => {
  const brandId = randomUUID();
  await tx`insert into public.product_brands (id,name,normalized_name,status) values (${brandId},${brandId},${brandId},'approved')`;
  const initial = await getCatalogueRuntimeRevision(tx);
  await tx`update public.product_brands set updated_at=now(),admin_notes='reviewed fixture' where id=${brandId}`;
  assert.equal(await getCatalogueRuntimeRevision(tx), initial);
  await tx`update public.product_brands set status='pending_review' where id=${brandId}`;
  assert.equal(await getCatalogueRuntimeRevision(tx), initial + 1, "an unapproved brand must invalidate cached sellable products");
  await tx`update public.product_brands set status='pending_review' where id=${brandId}`;
  assert.equal(await getCatalogueRuntimeRevision(tx), initial + 1);
  throw new Error("rollback epoch fixture");
 }), /rollback epoch fixture/);
});
