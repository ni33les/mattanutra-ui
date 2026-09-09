import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import postgres from "postgres";
import { writeProductRecommendationDecisionRows, type ProductDecisionProjection } from "../../lib/recommendation-selection-projections.ts";
assert.ok(process.env.TEST_DB_URL, "Isolated PostgreSQL is required");
const url = new URL(process.env.TEST_DB_URL); assert.equal(url.hostname, "127.0.0.1"); assert.match(url.pathname, /^\/mattanutra_lock_review_ax_/);
const sql = postgres(url.href, { max: 2, prepare: false }); after(() => sql.end());

test("LOCK-BATCH-01 decision publication uses one statement for all rows and preserves last-write replay", async () => {
  const rolledBack = new Error("fixture rollback");
  await assert.rejects(sql.begin(async tx => {
    const [run] = await tx`insert into public.product_recommendation_runs default values returning id`;
    const rows: ProductDecisionProjection[] = [];
    for (let n = 0; n < 4; n++) {
      const id = randomUUID();
      await tx`insert into public.products(id,platform,title,normalized_title,product_url,normalized_url)
        values(${id}::uuid,'manual','Lock fixture','lock fixture',${'https://fixture.invalid/'+id},${'https://fixture.invalid/'+id})`;
      rows.push({ productId:id,productTitle:"Lock fixture",outcome:"chosen",dedupeKey:id,rank:n+1,score:9,
        productCoveragePercent:75,stackContributionPercent:25,servingMultiplier:2,coveredNeeds:[{sourceId:"d3",amount:50}],
        reason:null,urlUsed:"https://fixture.invalid",priceAmount:123.45,currency:"THB",unknownAtRecommendation:false,
        availabilityStatus:null,etaDate:null,priceSource:null,retailSellableProductId:null,selectedRetailerOrganisationId:null,unitPriceAmount:123.45 });
    }
    let insertCount = 0;
    const observed = new Proxy(tx, { apply(target, receiver, args) {
      if (/insert into public.product_recommendation_decisions/i.test(args[0].join("?"))) insertCount++;
      return Reflect.apply(target, receiver, args);
    } });
    assert.equal(await writeProductRecommendationDecisionRows(observed, { rows, runId:run.id, generatedAt:"2026-09-09T00:00:00Z" }),4);
    assert.equal(insertCount,1,"row count must not multiply protected round trips");
    let stored = await tx`select product_id,rank,serving_multiplier,covered_needs,price_amount from public.product_recommendation_decisions where run_id=${run.id}::uuid order by rank`;
    assert.equal(stored.length,4);
    for (let n=0;n<4;n++) { assert.equal(stored[n].product_id,rows[n].productId);assert.equal(stored[n].serving_multiplier,2);assert.deepEqual(stored[n].covered_needs,rows[n].coveredNeeds);assert.equal(Number(stored[n].price_amount),123.45); }
    await writeProductRecommendationDecisionRows(observed, { rows:[rows[0], {...rows[0], reason:"Final replay value"}],runId:run.id });
    stored = await tx`select reason from public.product_recommendation_decisions where run_id=${run.id}::uuid and product_id=${rows[0].productId}::uuid`;
    assert.equal(stored[0].reason,"Final replay value");
    throw rolledBack;
  }), error => error === rolledBack);
});
