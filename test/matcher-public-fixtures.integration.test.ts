import assert from "node:assert/strict";
import postgres from "postgres";
import { it } from "node:test";
import { isolatedValidationEnvironment } from "../scripts/run-dev-advisory-validation.mjs";
import { PUBLIC_MATCHER_FIXTURES, publicFixtureDefinition, seedPublicMatcherFixtures } from "../scripts/seed-matcher-public-fixtures.mjs";

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
        assert.equal(fixture.administration.unitsPerServing, 1); assert.equal(fixture.administration.packQuantity, 30);
      }
      const [after] = await tx`select count(*)::int as products from public.products where source<>'matcher-v5-public-fixture-1'`;
      assert.deepEqual(before, after);
      throw rollback;
    }), error => error === rollback);
  } finally { await sql.end(); }
});
