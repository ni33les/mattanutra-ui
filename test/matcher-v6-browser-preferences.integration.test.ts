import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { isolatedValidationEnvironment } from "../scripts/run-dev-advisory-validation.mjs";
import { fixtureDatabaseUrl, cleanupFixtureRelationships } from "./helpers/fixture-teardown.ts";
import { closeSqlPool, getSql, withDatabaseTransaction } from "../lib/db.ts";
import { seedPublicMatcherFixtures } from "../scripts/seed-matcher-public-fixtures.mjs";
import { currentWebCheckoutRecommendations } from "../lib/retail-product-checkout.ts";

it("ANNA-BROWSER-PG-01 numeric preference fixture retains real options and checkout selection identity", async () => {
  const database = fixtureDatabaseUrl();
  process.env.DB_URL = database.href;
  // Standalone execution must establish the same declared catalogue prerequisites
  // as the complete runner; never depend on an earlier test leaving rows behind.
  await withDatabaseTransaction(getSql()!, seedPublicMatcherFixtures);
  const directory = await mkdtemp(join(tmpdir(), "anna-browser-preferences-"));
  let saved: { planId: string; runId: string; orderId: string; adminAgentId: string } | undefined;
  try {
    const output = join(directory, "fixture.json");
    const env = { ...isolatedValidationEnvironment(process.env), TEST_DB_URL: database.href, DB_URL: database.href };
    delete env.NODE_TEST_CONTEXT;
    await promisify(execFile)(process.execPath, ["--experimental-strip-types", "--import", "./scripts/register-ts-path-loader.mjs", "scripts/seed-browser-fixtures.ts", output,
      JSON.stringify({ scenario: "numeric_preferences", locale: "th" })], { env, timeout: 60000, maxBuffer: 1024 * 1024 });
    const fixture = JSON.parse(await readFile(output, "utf8"));
    saved = fixture;
    assert.equal(fixture.locale, "th");
    assert.equal(fixture.preferenceScenario.selectedProductCount, 2);
    assert.equal(fixture.preferenceScenario.selectedDailyPills, 2);
    assert.ok(fixture.preferenceScenario.selectedPriceMinor > 0);
    assert.equal(fixture.preferenceScenario.selectedPriceMinor, fixture.preferenceScenario.firstOrderLineSubtotalMinor);
    assert.equal(fixture.preferenceScenario.preferenceAssessment.length, 3);
    for (const row of fixture.preferenceScenario.preferenceAssessment) {
      assert.equal(row.preferred, 0); assert.equal(row.status, "above_preference");
      assert.equal(row.prominent, true); assert.equal(row.complete, true);
    }
    const alternative = fixture.preferenceScenario.alternative;
    assert.ok(alternative.candidateKey); assert.equal(alternative.productIds.length, 1);
    process.env.DB_URL = database.href;
    const selected = await currentWebCheckoutRecommendations(getSql()!, {
      planId: fixture.planId, locale: "th", recommendationRunId: fixture.runId,
      candidateKey: alternative.candidateKey, selectedItemIds: alternative.productIds,
      assessmentRevision: 1, selectionRevision: 0
    });
    assert.deepEqual(selected.map(row => row.product_id), alternative.productIds);
  } finally {
    if (saved) {
      process.env.DB_URL = database.href;
      const ids = saved;
      await withDatabaseTransaction(getSql()!, async tx => {
        await tx`set local session_replication_role=replica`;
        await cleanupFixtureRelationships(tx, { planIds: [ids.planId] });
        await tx`delete from public.product_recommendation_items where run_id=${ids.runId}::uuid`;
        await tx`delete from public.retail_customer_order_lines where customer_order_id=${ids.orderId}::uuid`;
        await tx`delete from public.retail_customer_orders where id=${ids.orderId}::uuid`;
        const tables = await tx<Array<{ table_name: string }>>`select c.table_name from information_schema.columns c join information_schema.tables t
          on (c.table_schema,c.table_name)=(t.table_schema,t.table_name) where c.table_schema='public' and c.column_name='plan_id' and t.table_type='BASE TABLE'`;
        for (const { table_name } of tables) {
          assert.match(table_name, /^[a-z_]+$/);
          await tx.unsafe(`delete from public."${table_name}" where plan_id=$1`, [ids.planId]);
        }
        await tx`delete from public.agents where id=${ids.adminAgentId}::uuid`;
      });
    }
    await closeSqlPool();
    await rm(directory, { recursive: true, force: true });
  }
});
