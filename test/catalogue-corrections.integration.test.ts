import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { after, before, test } from "node:test";
import postgres from "postgres";
import { catalogueRecordFingerprint } from "../lib/catalogue-corrections.ts";

const databaseUrl = process.env.TEST_DB_URL;
assert.ok(databaseUrl, "Catalogue integration tests require an isolated TEST_DB_URL");
const url = new URL(databaseUrl);
assert.equal(url.hostname, "127.0.0.1");
assert.match(url.pathname, /^\/mattanutra_lock_review(?:[_-][a-zA-Z0-9_-]+)?$/);
const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
const run = promisify(execFile);
const productId = randomUUID();
const firstId = randomUUID();
const secondId = randomUUID();
const prefix = `test-v5-${productId}`;
let directory: string;
let path: string;
let manifest: { version: number; corrections: Array<Record<string, unknown>> };

before(async () => {
  directory = await mkdtemp(`${tmpdir()}/catalogue-v5-`);
  path = `${directory}/manifest.json`;
  await sql.unsafe(await readFile(new URL("../db-rollout/product-administration-schema.sql", import.meta.url), "utf8"));
  await sql`insert into public.products (id,platform,title,normalized_title,product_url,normalized_url) values (${productId},'manual','Catalogue isolated fixture',${productId},${`https://fixture.example/${productId}`},${`https://fixture.example/${productId}`})`;
  for (const id of [firstId, secondId]) await sql`insert into public.product_facts (id,product_id,item_type,name,normalized_name,amount,unit) values (${id},${productId},'supplement','Omega-3','omega_3',1000,'mg')`;
  manifest = { version: 1, corrections: [firstId, secondId].map(id => {
    const before = { id, product_id: productId, name: "Omega-3", amount: 1000, unit: "mg" };
    const after = { ...before, amount: 350 };
    return { correctionId: `${prefix}-${id}`, entityTable: "product_facts", entityId: id, before, after, beforeFingerprint: catalogueRecordFingerprint(before), afterFingerprint: catalogueRecordFingerprint(after), evidence: { sourceUrl: "https://fixture.example/verified-label", checkedAt: "2026-09-07", summary: "Isolated correction test." } };
  }) };
  await writeFile(path, JSON.stringify(manifest));
});
after(async () => {
  try {
    await sql.begin(async tx => {
      await tx`set local session_replication_role=replica`;
      await tx`delete from public.catalogue_correction_audit where correction_id like ${`${prefix}%`}`;
      await tx`delete from public.product_facts where product_id=${productId}`;
      await tx`delete from public.products where id=${productId}`;
    });
  } finally { await sql.end(); if (directory) await rm(directory, { recursive: true, force: true }); }
});
function response(stdout: string) {
  const start = stdout.indexOf('{\n  "apply"');
  assert.ok(start >= 0, "CLI emits its reviewed correction result");
  return JSON.parse(stdout.slice(start));
}
async function apply(...args: string[]) {
  return run(process.execPath, ["--experimental-strip-types", "--import", "./scripts/register-ts-path-loader.mjs", "scripts/apply-catalogue-corrections.ts", path, ...args], { env: { ...process.env, DB_URL: databaseUrl, MATTANUTRA_ENV: "dev" } });
}

test("CAT5-PG-01 review is read-only; conflicting second row rolls back the whole batch", async () => {
  const review = response((await apply()).stdout);
  assert.equal(review.apply, false);
  assert.equal(review.outcomes.length, 2);
  assert.ok(review.outcomes.every((item: {status: string}) => item.status === "pending"));
  assert.equal((await sql`select count(*)::int as n from public.catalogue_correction_audit where correction_id like ${`${prefix}%`}`)[0].n, 0);
  await sql`update public.product_facts set amount=750 where id=${secondId}`;
  await assert.rejects(apply("--apply"), /Catalogue changed since review/);
  assert.equal(Number((await sql`select amount from public.product_facts where id=${firstId}`)[0].amount), 1000);
  assert.equal((await sql`select count(*)::int as n from public.catalogue_correction_audit where correction_id like ${`${prefix}%`}`)[0].n, 0);
  await sql`update public.product_facts set amount=1000 where id=${secondId}`;
});

test("CAT5-PG-02 replay is idempotent and records immutable originals without changing prices", async () => {
  const first = response((await apply("--apply")).stdout);
  assert.ok(first.outcomes.every((item: {status: string}) => item.status === "applied"));
  const second = response((await apply("--apply")).stdout);
  assert.ok(second.outcomes.every((item: {status: string}) => item.status === "already_applied"));
  const audit = await sql`select before_record,after_record from public.catalogue_correction_audit where correction_id like ${`${prefix}%`}`;
  assert.equal(audit.length, 2);
  for (const row of audit) { assert.equal(Number(row.before_record.amount), 1000); assert.equal(Number(row.after_record.amount), 350); }
  await assert.rejects(sql`delete from public.catalogue_correction_audit where correction_id like ${`${prefix}%`}`, /append-only/);
  assert.equal((await sql`select price_amount,administration from public.products where id=${productId}`)[0].price_amount, null);
});
