import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, it, mock } from "node:test";
import postgres from "postgres";
import { fixtureDatabaseUrl } from "./helpers/fixture-teardown.ts";

const url = fixtureDatabaseUrl();
const db = await import("../lib/db.ts");
const writer = postgres(url.href, { max: 1 });
let betweenReads: (() => Promise<void>) | undefined;
// Pause the real readiness SELECT after PostgreSQL has returned it, then commit
// on an independent connection before the real payload reader runs.
function observedSql() {
  const base = db.getSql();
  if (!base) return null;
  const observed = (...args: unknown[]) => {
    const query = (base as unknown as (...args: unknown[]) => unknown)(...args);
    if (Array.isArray(args[0]) && String(args[0][0]).includes("select a.input_revision") && betweenReads) {
      const change = betweenReads; betweenReads = undefined;
      return Promise.resolve(query).then(async rows => { await change(); return rows; });
    }
    return query;
  };
  return Object.assign(observed, base) as unknown as postgres.Sql;
}
mock.module("../lib/db.ts", { namedExports: { ...db, getSql: observedSql } });
const { getStoredFormulationRead } = await import("../lib/assessment-store.ts");
const { FUNNEL_GENERATOR_VERSION } = await import("../lib/assessment-revisions.ts");
const plans: string[] = [];
after(async () => {
  betweenReads = undefined;
  await writer.begin(async tx => {
    await tx`set local session_replication_role=replica`;
    await tx`delete from public.formulations where plan_id=any(${plans}::uuid[])`;
    await tx`delete from public.assessments where plan_id=any(${plans}::uuid[])`;
  });
  await writer.end(); await db.closeSqlPool();
});
async function assessment() {
  const id = randomUUID(); plans.push(id);
  await writer`insert into public.assessments(plan_id,locale,answers,input_revision,input_hash,journey_version)
    values(${id}::uuid,'en','{}',1,'snapshot-one','web-products-v1')`;
  return id;
}
async function formula(tx: postgres.Sql | postgres.TransactionSql, id: string, version: number, revision: number, name: string) {
  await tx`insert into public.formulations(plan_id,version,assessment_revision,generation_locale,generator_version,model_version,formulation)
    values(${id}::uuid,${version},${revision},'en',${FUNNEL_GENERATOR_VERSION},'snapshot-fixture',${tx.json({
      supplementBreakdown: [{ id: name, category: "vitamin", supplement: { en: name }, dailyDose: { en: "1 mg" }, rationale: { en: "Fixture" }, effectivenessRank: 1, status: "add" }],
      sectionStatuses: { supplements: "pending", foods: "pending" }
    })})`;
}

for (const includeProducts of [false, true]) {
  it(`pins pending readiness when a worker completes between reads (products=${includeProducts})`, async () => {
    const id = await assessment();
    betweenReads = () => formula(writer, id, 1, 1, "new-formula");
    const pending = await getStoredFormulationRead(id, { locale: "en", includeProducts });
    assert.equal(pending?.readiness?.formulationStatus, "pending");
    assert.equal(pending?.readiness?.formulaVersion, null);
    assert.equal(pending?.result.supplementBreakdown.length, 0);
    const ready = await getStoredFormulationRead(id, { locale: "en", includeProducts });
    assert.equal(ready?.readiness?.formulaVersion, 1);
    assert.equal(ready?.result.supplementBreakdown[0].id, "new-formula");
  });
  it(`pins formula version when another completion replaces it (products=${includeProducts})`, async () => {
    const id = await assessment(); await formula(writer, id, 1, 1, "original-formula");
    betweenReads = () => formula(writer, id, 2, 1, "replacement-formula");
    const original = await getStoredFormulationRead(id, { locale: "en", includeProducts });
    assert.equal(original?.readiness?.formulaVersion, 1);
    assert.equal(original?.result.supplementBreakdown[0].id, "original-formula");
    const next = await getStoredFormulationRead(id, { locale: "en", includeProducts });
    assert.equal(next?.readiness?.formulaVersion, 2);
    assert.equal(next?.result.supplementBreakdown[0].id, "replacement-formula");
  });
  it(`pins assessment identity and payload during recapture (products=${includeProducts})`, async () => {
    const id = await assessment(); await formula(writer, id, 1, 1, "revision-one");
    betweenReads = async () => {
      await writer.begin(async tx => {
        await tx`update public.assessments set input_revision=2,input_hash='snapshot-two',answers='{"age":"46-55"}' where plan_id=${id}::uuid`;
        await formula(tx, id, 2, 2, "revision-two");
      });
    };
    const original = await getStoredFormulationRead(id, { locale: "en", includeProducts });
    assert.equal(original?.readiness?.revision, 1); assert.equal(original?.readiness?.inputHash, "snapshot-one");
    assert.equal(original?.result.supplementBreakdown[0].id, "revision-one");
    const next = await getStoredFormulationRead(id, { locale: "en", includeProducts });
    assert.equal(next?.readiness?.revision, 2); assert.equal(next?.readiness?.inputHash, "snapshot-two");
    assert.equal(next?.result.supplementBreakdown[0].id, "revision-two");
  });
}
