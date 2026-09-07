#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import postgres from "postgres";

// Copy only product/reference data. Never copy people, sessions, payments or orders.
const sourceUrl = new URL(process.env.CATALOGUE_SOURCE_DB_URL);
sourceUrl.searchParams.delete("default_transaction_read_only");
const targetUrl = new URL(process.env.TEST_DB_URL);
assert.equal(targetUrl.hostname, "127.0.0.1");
assert.match(targetUrl.pathname, /^\/mattanutra_lock_review/);
assert.notEqual(sourceUrl.host + sourceUrl.pathname, targetUrl.host + targetUrl.pathname);
const source = postgres(sourceUrl.href, { max: 1, prepare: false });
const target = postgres(targetUrl.href, { max: 1 });
const tables = ["site_locales", "product_brands", "nutrients", "foods", "supplements", "supplement_aliases",
  "supplement_country_availability", "supplement_safety_limits", "supplement_translations", "products",
  "product_facts", "retail_sellable_products", "retail_product_stock"];
const manifest = [];
try {
  await source.begin("read only isolation level repeatable read", async read => {
  const organisations = await read`select id, slug, name, organisation_type, status, default_locale, country_code, currency,
    jsonb_build_object('customerPriceMarginPercent', metadata->'customerPriceMarginPercent') as metadata
    from public.organisations`;
  await target`insert into public.organisations ${target(organisations)} on conflict do nothing`;
    for (const table of tables) {
      const columns = await target`select column_name from information_schema.columns where table_schema='public'
        and table_name=${table} and is_generated='NEVER' order by ordinal_position`;
      assert.ok(columns.length, `Missing isolated table ${table}`);
      const names = columns.map(row => row.column_name);
      const rows = await read`select ${read(names)} from ${read(`public.${table}`)}`;
      // Preserve fixture FK checks and table defaults throughout the copy.
      await target.begin(async write => {
        for (let offset = 0; offset < rows.length; offset += 100) {
          await write`insert into ${write(`public.${table}`)} ${write(rows.slice(offset, offset + 100), names)} on conflict do nothing`;
        }
      });
      manifest.push({ table, rows: rows.length, sha256: createHash("sha256").update(JSON.stringify(rows)).digest("hex") });
      console.log(`${table}: ${rows.length} reference rows`);
    }
  });
  if (process.env.CATALOGUE_MANIFEST_PATH) writeFileSync(process.env.CATALOGUE_MANIFEST_PATH, JSON.stringify(manifest, null, 2), { flag: "wx" });
} finally { await source.end(); await target.end(); }
