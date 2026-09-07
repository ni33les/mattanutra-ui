import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import postgres from "postgres";
import { seedPublicMatcherFixtures } from "../scripts/seed-matcher-public-fixtures.mjs";
import { loadProductRows } from "../lib/admin-product-read-model.ts";
import { rowFromDb } from "../lib/admin-product-mappers.ts";
import { getLiveSaleEligibleRetailerCandidateSets } from "../lib/admin-product-search.ts";
import { recommendWithMatcher } from "../lib/matcher/adapters/web.ts";
import { resetMatcherSafetyCeilings, setMatcherSafetyCeilings } from "../lib/matcher/safety-ceilings.ts";

const databaseUrl = process.env.TEST_DB_URL;
assert.ok(databaseUrl, "Advisory catalogue tests require an isolated TEST_DB_URL");
const database = new URL(databaseUrl);
assert.equal(database.hostname, "127.0.0.1");
assert.match(database.pathname, /^\/mattanutra_lock_review(?:[_-][a-zA-Z0-9_-]+)?$/);
assert.equal(process.env.DB_URL, databaseUrl);

test("CAT-ADVICE-PG-01 above-limit products survive the actual reader and remain selectable with quantified web advice", async () => {
  const sql = postgres(databaseUrl, { max: 1 });
  const rollback = new Error("Roll back advisory catalogue fixtures");
  try {
    await assert.rejects(sql.begin(async tx => {
      const seeded = await seedPublicMatcherFixtures(tx);
      const high = seeded.products.find(row => row.key === "d3-high")!;
      await tx`insert into public.supplement_safety_limits (id,supplement_id,version,life_stage,source_scope,max_amount,max_unit,confidence,source_url)
        values (${randomUUID()},${high.supplementId},987654,'adult','supplemental',4000,'IU','high','https://fixture.example/d3-limit')`;
      const rows = await loadProductRows(high.productId, { sql: tx });
      assert.equal(rows?.length, 1);
      const raw = rows![0]!;
      assert.equal(rowFromDb(raw).status, "approved");
      assert.equal(rowFromDb(raw).validation.status, "pass");
      for (const status of ["pending_review", "ignored"] as const) assert.equal(rowFromDb({ ...raw, status }).status, status);
      const sets = await getLiveSaleEligibleRetailerCandidateSets({ sql: tx, countryCode: "TH", organisationId: seeded.organisationId });
      const candidate = sets.flatMap(set => set.candidates).find(row => row.id === high.productId);
      assert.ok(candidate, "The health reference limit must not silently remove an ordinarily eligible product");
      setMatcherSafetyCeilings([{ subjectId: high.supplementId, name: "Vitamin D3", maxAmount: 4000, maxUnit: "IU" }]);
      const result = recommendWithMatcher({ candidates: [candidate], needs: [{ id: high.supplementId, sourceId: high.supplementId,
        displayName: "Vitamin D3", normalizedName: "vitamin_d3", category: "Supplement", itemType: "supplement", weight: 1,
        targetComparableAmount: 25000, targetText: "1000 IU/day", targetDose: { amount: 1000, unit: "IU", originalText: "1000 IU/day" } }],
        clientContext: { currentSupplements: "none", ageYears: 40, lifestage: "adult" } });
      const option = result.diagnostics.matching?.options.find(row => row.productIds.includes(high.productId));
      assert.ok(option);
      assert.equal(option.purchaseEligible, true);
      const advice = option.advice.find(row => row.code === "reference_limit_exceeded");
      assert.ok(advice);
      assert.equal(advice.referenceLimit?.amount, 4000);
      assert.equal(advice.amount, high.amount);
      assert.equal(advice.ingredient, "Vitamin D3");
      assert.equal(advice.severity, "high");
      assert.ok(advice.uncertainty);
      throw rollback;
    }), error => error === rollback);
  } finally { resetMatcherSafetyCeilings(); await sql.end(); }
});
