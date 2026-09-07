import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import postgres from "postgres";
import * as admin from "../lib/admin-supplements.ts";
import { appendSupplementSafetyLimitVersion } from "../lib/supplement-safety-limit-versions.ts";
import { readSupplementSafetyHeads, supplementSafetyHeadsFingerprint } from "../lib/supplement-safety-reference-corrections.ts";
import { isolatedDatabasePreflight } from "../scripts/run-full-test-suite.mjs";

assert.deepEqual(isolatedDatabasePreflight(process.env), []);
const sql = postgres(process.env.TEST_DB_URL!, { max: 1 });

test("ANNA-REF-ADMIN-01 stale forms and missing fingerprints cannot write domain history, references or audit", async () => {
  const rollback = new Error("Rollback general admin reference fixture");
  await assert.rejects(sql.begin(async tx => {
    const id = randomUUID();
    await tx`insert into public.supplements (id,name,normalized_name,category) values (${id},${`Admin reference ${id}`},${`admin_reference_${id.replaceAll("-", "_")}`},'Vitamin')`;
    const band = { supplementId: id, confidence: "high" as const, maxAmount: 100, maxUnit: "mg/day", safetyFlags: [], safetyNotes: null };
    await appendSupplementSafetyLimitVersion(tx, band);
    const input = { id, listStatus: "active" as const, ...band, maxAmount: 80,
      expectedSafetyReferenceFingerprint: supplementSafetyHeadsFingerprint(await readSupplementSafetyHeads(tx, id)) };
    const counts = async () => {
      const [row] = await tx`select (select count(*)::int from public.supplement_safety_limits where supplement_id=${id}) as references,
        (select count(*)::int from public.supplement_admin_audit where supplement_id=${id}) as audit,
        (select count(*)::int from public.supplement_versions where supplement_id=${id}) as domain`;
      return row;
    };
    const beforeMissing = await counts();
    await assert.rejects(admin.updateAdminSupplementInTransaction(tx, { ...input, expectedSafetyReferenceFingerprint: "" }), { code: "reference_version_required" });
    assert.deepEqual(await counts(), beforeMissing);
    // A concurrent correction to another population or a retirement is part of this editor's complete reference identity.
    await appendSupplementSafetyLimitVersion(tx, { ...band, lifeStage: "child_4_8", maxAmount: null });
    const beforeStale = await counts();
    await assert.rejects(admin.updateAdminSupplementInTransaction(tx, input), { code: "reference_version_conflict" });
    assert.deepEqual(await counts(), beforeStale);
    const reviewed = { ...input, expectedSafetyReferenceFingerprint: supplementSafetyHeadsFingerprint(await readSupplementSafetyHeads(tx, id)) };
    const result = await admin.updateAdminSupplementInTransaction(tx, reviewed);
    assert.equal(result.maxAmount, 80);
    assert.equal(result.safetyReferenceFingerprint, supplementSafetyHeadsFingerprint(await readSupplementSafetyHeads(tx, id)));
    assert.notEqual(result.safetyReferenceFingerprint, reviewed.expectedSafetyReferenceFingerprint);
    const after = await counts();
    assert.equal(after.references, beforeStale.references + 1);
    assert.equal(after.audit, beforeStale.audit + 1);
    assert.equal(after.domain, beforeStale.domain + 1);
    await assert.rejects(admin.updateAdminSupplementInTransaction(tx, reviewed), { code: "reference_version_conflict" });
    assert.deepEqual(await counts(), after);
    const retired = (await readSupplementSafetyHeads(tx, id)).find(head => head.lifeStage === "child_4_8");
    assert.equal(retired?.maxAmount, null);
    throw rollback;
  }), error => error === rollback);
});

test("ANNA-REF-ADMIN-02 a supplement without a numeric reference can save without inventing a blank-unit retirement", async () => {
  const rollback = new Error("Rollback absent reference fixture");
  await assert.rejects(sql.begin(async tx => {
    const id = randomUUID(), name = `reference_${id.replaceAll("-", "_")}`;
    await tx`insert into public.supplements (id,name,normalized_name,category) values (${id},${name},${name},'Vitamin')`;
    const result = await admin.updateAdminSupplementInTransaction(tx, { id, listStatus: "active", confidence: "low", maxAmount: null,
      maxUnit: "", safetyFlags: [], safetyNotes: null, expectedSafetyReferenceFingerprint: supplementSafetyHeadsFingerprint([]) });
    assert.equal(result.maxAmount, null);
    assert.equal(result.safetyReferenceFingerprint, supplementSafetyHeadsFingerprint([]));
    assert.deepEqual(await readSupplementSafetyHeads(tx, id), []);
    throw rollback;
  }), error => error === rollback);
});

test.after(async () => { await sql.end(); });
