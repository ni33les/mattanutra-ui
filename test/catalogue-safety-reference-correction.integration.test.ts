import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import postgres from "postgres";
import { appendSupplementSafetyLimitVersion } from "../lib/supplement-safety-limit-versions.ts";
import { isolatedDatabasePreflight } from "../scripts/run-full-test-suite.mjs";

assert.deepEqual(isolatedDatabasePreflight(process.env), []);
const sql = postgres(process.env.TEST_DB_URL!, { max: 3 });
const band = { lifeStage: "adult" as const, sourceScope: "supplemental" as const, maxAmount: 1000, maxUnit: "mcg/day",
  confidence: "high" as const, safetyFlags: [], safetyNotes: "Historical fixture", sourceUrl: "https://fixture.example/old", basisRationale: "Historical" };

async function fixture(work: (tx: postgres.TransactionSql, supplementId: string, service: typeof import("../lib/supplement-safety-reference-corrections.ts")) => Promise<void>) {
  const service = await import("../lib/supplement-safety-reference-corrections.ts");
  const rollback = new Error("Rollback correction fixture");
  await assert.rejects(sql.begin(async tx => {
    await tx.unsafe(readFileSync(new URL("../db-rollout/supplement-safety-reference-integrity-schema.sql", import.meta.url), "utf8"));
    const supplementId = randomUUID();
    await tx`insert into public.supplements (id,name,normalized_name,category) values (${supplementId},${`Correction ${supplementId}`},${supplementId},'Vitamin')`;
    await appendSupplementSafetyLimitVersion(tx, { ...band, supplementId });
    await work(tx, supplementId, service);
    throw rollback;
  }), error => error === rollback);
}

test("ANNA-REF-PG-04 correction retires and replaces scopes atomically, preserves evidence and replays without writes", async () => {
  await fixture(async (tx, supplementId, service) => {
    const before = await service.readSupplementSafetyHeads(tx, supplementId);
    const correction = { environment: "dev" as const, manifestId: "anna-v6-reference-review-fixture-dev", correctionId: "anna-v6-fixture-dev-d3",
      supplementId, expectedHeadsFingerprint: service.supplementSafetyHeadsFingerprint(before),
      changes: [{ ...band, maxAmount: null, sourceUrl: "https://fixture.example/authority", basisRationale: "Retire duplicate supplemental band" },
        { ...band, sourceScope: "total" as const, maxAmount: 100, sourceUrl: "https://fixture.example/authority", basisRationale: "Adult all-source intake" }],
      evidence: { originalAmount: 100, originalUnit: "mcg/day", population: "adults", form: "vitamin D", sourceScope: "total", rationale: "Verified fixture review" } };
    const first = await service.applySupplementSafetyCorrection(tx, correction);
    assert.equal(first.status, "applied");
    const heads = await service.readSupplementSafetyHeads(tx, supplementId);
    assert.equal(heads.find(row => row.sourceScope === "supplemental")?.maxAmount, null);
    assert.equal(heads.find(row => row.sourceScope === "total")?.maxAmount, 100);
    assert.deepEqual(first.receipt.manifest.evidence, correction.evidence);
    assert.deepEqual(first.receipt.beforeHeads, before);
    const second = await service.applySupplementSafetyCorrection(tx, correction);
    assert.equal(second.status, "already_applied");
    assert.deepEqual(second.receipt, first.receipt);
    const [counts] = await tx`select (select count(*)::int from public.supplement_safety_limits where supplement_id=${supplementId}) as versions,
      (select count(*)::int from public.supplement_safety_reference_corrections where supplement_id=${supplementId}) as receipts`;
    assert.equal(counts.versions, 3); assert.equal(counts.receipts, 1);
    await assert.rejects(tx.savepoint(async nested => {
      await nested`update public.supplement_safety_reference_corrections set manifest_id='rewritten' where supplement_id=${supplementId}`;
    }), /append|immutable|mutat|version/i);
    await assert.rejects(service.applySupplementSafetyCorrection(tx, { ...correction, evidence: { rationale: "Different unreviewed manifest" } }), /manifest.*conflict/i);
    assert.deepEqual(await service.readSupplementSafetyHeads(tx, supplementId), heads);
  });
});

test("ANNA-REF-PG-05 changed population heads and replay drift abort with no correction writes", async () => {
  await fixture(async (tx, supplementId, service) => {
    const heads = await service.readSupplementSafetyHeads(tx, supplementId);
    const correction = { environment: "uat" as const, manifestId: "anna-v6-reference-review-fixture-uat", correctionId: "anna-v6-fixture-uat-d3", supplementId,
      expectedHeadsFingerprint: service.supplementSafetyHeadsFingerprint(heads), changes: [{ ...band, maxAmount: 100 }], evidence: { rationale: "Fixture review" } };
    await appendSupplementSafetyLimitVersion(tx, { ...band, supplementId, lifeStage: "child_4_8", maxAmount: 75 });
    await assert.rejects(service.applySupplementSafetyCorrection(tx, correction), /heads.*changed/i);
    const ready = { ...correction, expectedHeadsFingerprint: service.supplementSafetyHeadsFingerprint(await service.readSupplementSafetyHeads(tx, supplementId)) };
    await service.applySupplementSafetyCorrection(tx, ready);
    await appendSupplementSafetyLimitVersion(tx, { ...band, supplementId, maxAmount: 90 });
    await assert.rejects(service.inspectSupplementSafetyCorrection(tx, ready), /replay.*drift/i);
    await assert.rejects(service.applySupplementSafetyCorrection(tx, ready), /replay.*drift/i);
    const [row] = await tx`select count(*)::int as count from public.supplement_safety_reference_corrections where supplement_id=${supplementId}`;
    assert.equal(row.count, 1);
  });
});

test.after(async () => { await sql.end(); });
