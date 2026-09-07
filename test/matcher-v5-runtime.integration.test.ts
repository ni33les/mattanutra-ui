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
