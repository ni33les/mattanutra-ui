#!/usr/bin/env node
/** Explicit synthetic catalogue additions for isolated HTTP acceptance, never live data. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { isolatedValidationEnvironment } from "./run-dev-advisory-validation.mjs";

const TAG = "matcher-v5-public-fixture-1";
function id(name) {
  const hex = createHash("sha256").update(`${TAG}:${name}`).digest("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
export const PUBLIC_MATCHER_FIXTURES = Object.freeze([
  { key: "d3", nutrient: "Vitamin D3", amount: 1000, unit: "IU", rrpPriceThb: 17 },
  { key: "c", nutrient: "Vitamin C", amount: 250, unit: "mg", rrpPriceThb: 23 },
  { key: "magnesium", nutrient: "Magnesium", amount: 100, unit: "mg", rrpPriceThb: 31 },
  { key: "zinc", nutrient: "Zinc", amount: 5, unit: "mg", rrpPriceThb: 37 },
  { key: "iron", nutrient: "Iron", amount: 6, unit: "mg", rrpPriceThb: 41 },
  { key: "b12", nutrient: "Vitamin B12", amount: 100, unit: "mcg", rrpPriceThb: 43 },
  { key: "selenium", nutrient: "Selenium", amount: 25, unit: "mcg", rrpPriceThb: 47 },
  { key: "calcium", nutrient: "Calcium", amount: 200, unit: "mg", rrpPriceThb: 53 },
  { key: "d3-high", nutrient: "Vitamin D3", amount: 6000, unit: "IU", rrpPriceThb: 19 }
]);
export function publicFixtureDefinition(row) {
  const productId = id(`product:${row.key}`), sourceUrl = `https://fixtures.example.test/${TAG}/${row.key}`;
  const sourceText = `Synthetic acceptance label: one tablet supplies ${row.amount} ${row.unit} ${row.nutrient}. One pack contains 30 whole tablets. This is a declared test fixture, not a marketed product.`;
  return { ...row, productId, sourceUrl, sourceText, imageUrl: "/healthscore/box-v7.jpg", administration: { route: "oral", physicalUnit: "tablet", unitsPerServing: 1, doseIncrement: 1, packQuantity: 30,
    provenance: { status: "verified", sourceUrl, sourceText, verifiedAt: "2026-09-07T00:00:00.000Z" } } };
}

/** Caller supplies the transaction, allowing the integration test to roll back everything. */
export async function seedPublicMatcherFixtures(tx) {
  const organisationId = id("retailer"), slug = "matcher-v5-isolated-fixture-retailer";
  await tx`insert into public.organisations (id,slug,name,organisation_type,status,default_locale,country_code,currency,metadata)
    values (${organisationId},${slug},'Synthetic Matcher Acceptance Retailer','tenant','active','en','TH','THB',${tx.json({ fixture: TAG })}) on conflict (id) do nothing`;
  const [organisation] = await tx`select slug,metadata from public.organisations where id=${organisationId}`;
  assert.equal(organisation?.slug, slug, "Synthetic retailer ID must never replace a real retailer");
  assert.equal(organisation.metadata.fixture, TAG);
  const seeded = [];
  for (const row of PUBLIC_MATCHER_FIXTURES) {
    const fixture = publicFixtureDefinition(row);
    const supplements = await tx`select id,name from public.supplements where name=${row.nutrient}`;
    assert.equal(supplements.length, 1, `Fixture requires one canonical ${row.nutrient} reference`);
    const supplementId = supplements[0].id;
    await tx`insert into public.products (id,platform,region,title,normalized_title,product_url,normalized_url,source_url,image_url,description,source_snapshot,
      product_kind,product_audience,status,label_status,availability_status,price_amount,currency,source,validation_status,administration)
      values (${fixture.productId},'manual','TH',${`Synthetic fixture ${row.nutrient} ${row.amount} ${row.unit}`},${`synthetic_fixture_${row.key}`},
      ${fixture.sourceUrl},${fixture.sourceUrl},${fixture.sourceUrl},${fixture.imageUrl},${fixture.sourceText},${tx.json({ fixture: TAG })},'supplement','both','approved','parsed','in_stock',
      ${row.rrpPriceThb},'THB',${TAG},'pass',${tx.json(fixture.administration)}) on conflict (id) do nothing`;
    const [product] = await tx`select source,source_snapshot,administration,price_amount,status,validation_status,image_url from public.products where id=${fixture.productId}`;
    assert.equal(product.source, TAG, "Synthetic fixture must never upgrade copied catalogue facts");
    assert.equal(product.source_snapshot.fixture, TAG);
    assert.ok(product.image_url === null || product.image_url === fixture.imageUrl, "Fixture image cannot overwrite an unexpected value");
    // Early v1 preparation lacked its local image; repair only this explicitly identified synthetic field.
    if (product.image_url === null) await tx`update public.products set image_url=${fixture.imageUrl} where id=${fixture.productId} and source=${TAG} and image_url is null`;
    assert.deepEqual(product.administration, fixture.administration, "Existing fixture physical metadata must match its declared label");
    assert.equal(Number(product.price_amount), row.rrpPriceThb, "Historical synthetic fixture prices cannot be rewritten to make a test green");
    assert.equal(product.status, "approved"); assert.equal(product.validation_status, "pass");
    const factId = id(`fact:${row.key}`), listingId = id(`listing:${row.key}`), stockId = id(`stock:${row.key}`);
    const normalized = row.nutrient.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    await tx`insert into public.product_facts (id,product_id,item_type,supplement_id,name,normalized_name,amount,unit,serving_label,confidence,source,source_url,source_text)
      values (${factId},${fixture.productId},'supplement',${supplementId},${row.nutrient},${normalized},${row.amount},${row.unit},'1 tablet','high',${TAG},${fixture.sourceUrl},${fixture.sourceText}) on conflict (id) do nothing`;
    const [fact] = await tx`select product_id,supplement_id,amount,unit,confidence,source from public.product_facts where id=${factId}`;
    assert.equal(fact.source, TAG); assert.equal(fact.product_id, fixture.productId); assert.equal(fact.supplement_id, supplementId);
    assert.equal(Number(fact.amount), row.amount); assert.equal(fact.unit, row.unit); assert.equal(fact.confidence, "high");
    await tx`insert into public.retail_sellable_products (id,organisation_id,product_id,status,rrp_price_amount,wholesale_price_amount,currency,backorder_policy,metadata)
      values (${listingId},${organisationId},${fixture.productId},'active',${row.rrpPriceThb},${row.rrpPriceThb},'THB','allow',${tx.json({ fixture: TAG })}) on conflict (id) do nothing`;
    const [listing] = await tx`select organisation_id,product_id,rrp_price_amount,currency,metadata from public.retail_sellable_products where id=${listingId}`;
    assert.equal(listing.organisation_id, organisationId); assert.equal(listing.product_id, fixture.productId); assert.equal(Number(listing.rrp_price_amount), row.rrpPriceThb); assert.equal(listing.currency, "THB"); assert.equal(listing.metadata.fixture, TAG);
    await tx`insert into public.retail_product_stock (id,organisation_id,product_id,status,stock_quantity,retail_price_amount,wholesale_price_amount,currency,metadata)
      values (${stockId},${organisationId},${fixture.productId},'active',100,${row.rrpPriceThb},${row.rrpPriceThb},'THB',${tx.json({ fixture: TAG })}) on conflict (id) do nothing`;
    const [stock] = await tx`select organisation_id,product_id,metadata from public.retail_product_stock where id=${stockId}`;
    assert.equal(stock.organisation_id, organisationId); assert.equal(stock.product_id, fixture.productId); assert.equal(stock.metadata.fixture, TAG);
    seeded.push({ ...fixture, supplementId, factId, listingId });
  }
  return { version: TAG, organisationId, products: seeded, copiedCatalogueRowsUpdated: 0, providerRequests: 0 };
}
async function main() {
  isolatedValidationEnvironment(process.env);
  if (process.argv.length !== 3) throw new Error("Usage: seed-matcher-public-fixtures.mjs output.json (isolated TEST_DB_URL required)");
  const sql = postgres(process.env.TEST_DB_URL, { max: 1, prepare: false });
  try {
    const result = await sql.begin(tx => seedPublicMatcherFixtures(tx));
    writeFileSync(resolve(process.argv[2]), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify({ fixture: result.version, products: result.products.length, copiedCatalogueRowsUpdated: 0 }));
  } finally { await sql.end(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
