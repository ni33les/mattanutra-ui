import assert from "node:assert/strict";
import postgres from "postgres";
import { it } from "node:test";
import { isolatedValidationEnvironment } from "../scripts/run-dev-advisory-validation.mjs";
import { PUBLIC_MATCHER_FIXTURES, publicFixtureDefinition, seedPublicMatcherFixtures } from "../scripts/seed-matcher-public-fixtures.mjs";
import { loadProductRows } from "../lib/admin-product-read-model.ts";
import { rowFromDb } from "../lib/admin-product-mappers.ts";
import { getLiveSaleEligibleRetailerCandidateSets } from "../lib/admin-product-search.ts";

it("V5-CLIENT-06 isolated public catalogue fixtures are explicit, reproducible and preserve copied products", async () => {
  isolatedValidationEnvironment(process.env);
  const sql = postgres(process.env.TEST_DB_URL!, { max: 1 });
  const rollback = new Error("Roll back declared test fixtures");
  try {
    await assert.rejects(sql.begin(async tx => {
      const [before] = await tx`select count(*)::int as products from public.products where source<>'matcher-v5-public-fixture-1'`;
      const first = await seedPublicMatcherFixtures(tx), second = await seedPublicMatcherFixtures(tx);
      assert.deepEqual(first, second);
      assert.equal(first.products.length, 9);
      assert.equal(new Set(first.products.map((row: { nutrient: string }) => row.nutrient)).size, 8);
      assert.equal(first.products.find((row: { key: string }) => row.key === "d3").amount, 1000);
      assert.ok(first.products.find((row: { key: string }) => row.key === "d3-high").amount > 4000);
      for (const row of PUBLIC_MATCHER_FIXTURES) {
        const fixture = publicFixtureDefinition(row);
        assert.equal(fixture.administration.provenance.status, "verified");
        const [stored] = await tx`select image_url from public.products where id=${fixture.productId}`;
        assert.equal(stored.image_url, fixture.imageUrl, "Ordinary catalogue eligibility requires the declared local fixture image");
        assert.equal(fixture.administration.unitsPerServing, 1); assert.equal(fixture.administration.packQuantity, 30);
      }
      const [after] = await tx`select count(*)::int as products from public.products where source<>'matcher-v5-public-fixture-1'`;
      assert.deepEqual(before, after);
      throw rollback;
    }), error => error === rollback);
  } finally { await sql.end(); }
});

it("V5-CLIENT-07 stored administration and fixture eligibility survive the actual web catalogue reader", async () => {
  isolatedValidationEnvironment(process.env);
  const sql = postgres(process.env.TEST_DB_URL!, { max: 1 });
  const rollback = new Error("Roll back web catalogue reader fixtures");
  try {
    await assert.rejects(sql.begin(async tx => {
      const seeded = await seedPublicMatcherFixtures(tx);
      const rows = await loadProductRows(null, { sql: tx, productIds: seeded.products.map(row => row.productId) });
      assert.equal(rows?.length, seeded.products.length);
      for (const fixture of seeded.products) {
        const row = rows!.find(row => row.id === fixture.productId)!;
        assert.deepEqual(rowFromDb(row).administration, fixture.administration);
        assert.equal(rowFromDb({ ...row, administration: null }).administration, null);
        const uncertain = { ...fixture.administration, provenance: { ...fixture.administration.provenance, status: "unverified" } };
        assert.deepEqual(rowFromDb({ ...row, administration: uncertain }).administration, uncertain,
          "The web reader must preserve unverified metadata without upgrading confidence");
      }
      const sets = await getLiveSaleEligibleRetailerCandidateSets({ sql: tx, countryCode: "TH", organisationId: seeded.organisationId });
      assert.equal(sets.length, 1);
      assert.deepEqual(sets[0].candidates.map(row => row.id).sort(), seeded.products.map(row => row.productId).sort(),
        "Every declared synthetic product, including the above-limit option, meets ordinary catalogue eligibility");
      throw rollback;
    }), error => error === rollback);
  } finally { await sql.end(); }
});
