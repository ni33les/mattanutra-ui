import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import postgres from "postgres";
import { applySupplementSafetyCorrection, inspectSupplementSafetyCorrection, readSupplementSafetyHeads,
  supplementSafetyHeadsFingerprint, verifySupplementSafetyCorrection,
  type SupplementSafetyCorrection, type SupplementSafetyHead } from "../lib/supplement-safety-reference-corrections.ts";
import { loadAdminSafetyReferenceSnapshot } from "../lib/agentic/catalogue/load-safety-ceilings.ts";
import { isolatedDatabasePreflight } from "../scripts/run-full-test-suite.mjs";

assert.deepEqual(isolatedDatabasePreflight(process.env), []);
const sql = postgres(process.env.TEST_DB_URL!, { max: 1 });
type ReviewedCorrection = SupplementSafetyCorrection & { evidence: SupplementSafetyCorrection["evidence"] & { originalHeads: SupplementSafetyHead[] } };
type Manifest = { environment: "dev" | "uat"; reviewedHeadCount: number; corrections: ReviewedCorrection[] };

for (const environment of ["dev", "uat"] as const) {
  test(`ANNA-REF-MANIFEST-${environment} reviewed templates preserve original fingerprints, retire scopes and replay append-only`, async () => {
    const manifest = JSON.parse(readFileSync(new URL(`../data/corrections/anna-v6-2026-09-07/${environment}-references.json`, import.meta.url), "utf8")) as Manifest;
    assert.equal(manifest.environment, environment);
    assert.equal(manifest.corrections.length, 6);
    assert.equal(manifest.reviewedHeadCount, 18);
    assert.equal(manifest.corrections.reduce((sum, item) => sum + item.evidence.originalHeads.length, 0), 18);
    assert.equal(manifest.corrections.reduce((sum, item) => sum + item.changes.length, 0), 31);
    for (const correction of manifest.corrections) {
      verifySupplementSafetyCorrection(correction);
      assert.equal(correction.environment, environment);
      assert.equal(supplementSafetyHeadsFingerprint(correction.evidence.originalHeads), correction.expectedHeadsFingerprint,
        `${correction.correctionId} must still bind every original reviewed population/scope head`);
      assert.ok(correction.evidence.originalHeads.every(head => head.supplementId === correction.supplementId));
    }
    const rollback = new Error("Rollback reviewed reference template fixtures");
    await assert.rejects(sql.begin(async tx => {
      await tx.unsafe(readFileSync(new URL("../db-rollout/supplement-safety-reference-integrity-schema.sql", import.meta.url), "utf8"));
      const fixtureIds: string[] = [];
      for (const template of manifest.corrections) {
        const supplementId = randomUUID(); fixtureIds.push(supplementId);
        const slug = template.correctionId.replace(`anna-v6-2026-09-07-${environment}-`, "");
        await tx`insert into public.supplements (id,name,normalized_name,category)
          values (${supplementId},${`Reference manifest fixture ${slug}`},${supplementId},'Vitamin')`;
        for (const head of template.evidence.originalHeads) {
          await tx`insert into public.supplement_safety_limits
            (id,supplement_id,version,life_stage,source_scope,max_amount,max_unit,confidence,safety_flags,safety_notes,source_url,basis_rationale)
            values (${randomUUID()},${supplementId},${head.version},${head.lifeStage},${head.sourceScope},${head.maxAmount},${head.maxUnit},
              ${head.confidence},${head.safetyFlags},${head.safetyNotes},${head.sourceUrl},${head.basisRationale})`;
        }
        const before = await readSupplementSafetyHeads(tx, supplementId);
        const correction = { ...template, supplementId, correctionId: `${template.correctionId}-fixture-${supplementId}`,
          expectedHeadsFingerprint: supplementSafetyHeadsFingerprint(before) };
        assert.equal((await inspectSupplementSafetyCorrection(tx, correction)).status, "pending");
        const applied = await applySupplementSafetyCorrection(tx, correction);
        assert.equal(applied.status, "applied");
        assert.deepEqual(applied.receipt.beforeHeads, before);
        assert.deepEqual(applied.receipt.manifest.evidence, template.evidence, "The original environment evidence stays complete inside the fixture receipt");
        const after = await readSupplementSafetyHeads(tx, supplementId);
        for (const change of template.changes) {
          const actual = after.find(head => head.lifeStage === change.lifeStage && head.sourceScope === change.sourceScope);
          assert.ok(actual);
          assert.equal(actual.version, (before.find(head => head.lifeStage === change.lifeStage && head.sourceScope === change.sourceScope)?.version ?? 0) + 1);
          for (const key of ["maxAmount", "maxUnit", "confidence", "safetyFlags", "safetyNotes", "sourceUrl", "basisRationale"] as const) {
            assert.deepEqual(actual[key], change[key], `${slug}:${change.lifeStage}:${change.sourceScope}:${key}`);
          }
        }
        if (slug === "d3") {
          assert.equal(after.filter(head => head.sourceScope === "supplemental" && head.maxAmount === null).length, 7);
          assert.equal(after.find(head => head.sourceScope === "total" && head.lifeStage === "adult")?.maxAmount, 100);
          const child = after.find(head => head.sourceScope === "total" && head.lifeStage === "child_1_3");
          assert.equal(child?.maxAmount, 2500); assert.equal(child?.maxUnit, "IU");
        } else if (slug === "b6") {
          assert.equal(after.filter(head => head.sourceScope === "supplemental" && head.maxAmount === null).length, 6);
          const adult = after.find(head => head.lifeStage === "adult");
          assert.equal(adult?.maxAmount, environment === "dev" ? 30 : 50);
          assert.equal(adult?.confidence, "low");
          assert.match(adult?.basisRationale ?? "", /internal advisory threshold/i);
        } else if (slug === "b3") {
          assert.equal(after[0].maxAmount, 35); assert.equal(after[0].maxUnit, "mg/day");
          assert.match(after[0].basisRationale ?? "", /fortified foods/);
        } else {
          assert.equal(after[0].maxAmount, before[0].maxAmount, "Unverified numeric thresholds must not acquire invented replacements");
          assert.equal(after[0].confidence, "low");
          assert.match(after[0].basisRationale ?? "", /Source supports the uncertainty and cautions, not the numeric threshold/);
        }
        const originalRows = await tx`select id::text,version,max_amount,source_url,basis_rationale from public.supplement_safety_limits where id=any(${before.map(head => head.id)}::uuid[]) order by id`;
        assert.deepEqual(originalRows.map(row => ({ id: row.id, version: Number(row.version), amount: row.max_amount == null ? null : Number(row.max_amount), sourceUrl: row.source_url, rationale: row.basis_rationale })),
          [...before].sort((a,b) => a.id.localeCompare(b.id)).map(head => ({ id: head.id, version: head.version, amount: head.maxAmount, sourceUrl: head.sourceUrl, rationale: head.basisRationale })));
        const replay = await applySupplementSafetyCorrection(tx, correction);
        assert.equal(replay.status, "already_applied"); assert.deepEqual(replay.receipt, applied.receipt);
        assert.equal((await inspectSupplementSafetyCorrection(tx, correction)).status, "already_applied");
        const snapshot = await loadAdminSafetyReferenceSnapshot(tx);
        const active = snapshot.ceilings.filter(row => row.subjectId === supplementId);
        assert.equal(active.length, after.filter(head => head.maxAmount !== null).length, `${slug} active reference count`);
        if (slug === "probiotics" || slug === "b-longum") {
          assert.equal(active[0].maxUnit, "CFU");
          assert.equal(active[0].maxAmount, (slug === "probiotics" ? 100 : 20) * 1_000_000_000);
          assert.equal(active[0].referenceConfidence, "low");
          assert.equal(active[0].basisRationale, template.changes[0].basisRationale);
        }
        assert.ok(active.every(row => after.some(head => head.id === row.bandId && head.maxAmount !== null)));
      }
      const [counts] = await tx`select (select count(*)::int from public.supplement_safety_limits where supplement_id=any(${fixtureIds}::uuid[])) as versions,
        (select count(*)::int from public.supplement_safety_reference_corrections where supplement_id=any(${fixtureIds}::uuid[])) as receipts`;
      assert.equal(counts.versions, 49); assert.equal(counts.receipts, 6);
      throw rollback;
    }), error => error === rollback);
  });
}

test.after(async () => { await sql.end(); });
