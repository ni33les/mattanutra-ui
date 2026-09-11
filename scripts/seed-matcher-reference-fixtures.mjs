import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

/** Active references captured in the reviewed DEV fixture, copied only into a
 * fresh isolated test database. This is not a live reference import/repair. */
export function frozenReferenceRows(frozen, supplements) {
  assert.equal(new Set(supplements.map(row => row.name)).size, supplements.length, "Ambiguous fixture nutrient names");
  const names = new Map(supplements.map(row => [row.name, row.id]));
  const seen = new Set();
  return frozen.references.ceilings.flatMap(row => {
    const supplementId = names.get(row.name);
    if (!supplementId || seen.has(row.bandId)) return [];
    assert.ok(row.bandId && Number.isInteger(row.bandVersion));
    assert.ok(Number.isFinite(row.maxAmount) && row.maxAmount > 0);
    assert.ok(["total", "supplemental"].includes(row.sourceScope));
    assert.ok(["low", "moderate", "high"].includes(row.referenceConfidence));
    seen.add(row.bandId);
    return [{ id: row.bandId, supplementId, name: row.name, version: row.bandVersion, lifeStage: row.lifeStage,
      sourceScope: row.sourceScope, maxAmount: row.maxAmount, maxUnit: row.maxUnit,
      confidence: row.referenceConfidence, sourceUrl: row.authorityUrl ?? null, rationale: row.basisRationale ?? null }];
  });
}

export async function seedMatcherReferenceFixtures(sql, databaseUrl) {
  const url = new URL(databaseUrl);
  assert.equal(url.hostname, "127.0.0.1"); assert.notEqual(url.port, "5432");
  assert.match(url.pathname, /^\/mattanutra_lock_review_ax_/);
  const [before] = await sql`select count(*)::int count from public.supplement_safety_limits`;
  assert.equal(before.count, 0, "Reference bootstrap requires an empty isolated reference table");
  const frozen = JSON.parse(gunzipSync(readFileSync("test/fixtures/mcp-evidence-images/dev-20260911.json.gz")).toString());
  const rows = frozenReferenceRows(frozen, await sql`select id::text,name from public.supplements`);
  assert.ok(rows.length > 0, "Missing captured reference prerequisites");
  await sql.begin(async tx => {
    for (const row of rows) await tx`insert into public.supplement_safety_limits
      (id,supplement_id,version,life_stage,source_scope,max_amount,max_unit,confidence,source_url,basis_rationale)
      values (${row.id}::uuid,${row.supplementId}::uuid,${row.version},${row.lifeStage},${row.sourceScope},
        ${row.maxAmount},${row.maxUnit},${row.confidence},${row.sourceUrl},${row.rationale})`;
  });
  return { count: rows.length, capturedReferenceFingerprint: frozen.references.fingerprint };
}
