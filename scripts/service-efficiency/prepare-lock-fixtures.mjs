import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PUBLIC_MATCHER_FIXTURES } from "../seed-matcher-public-fixtures.mjs";

/** Structural fixture prerequisites only. No clinical limits or commercial prices are invented. */
export async function prepareLockFixtures(sql, databaseUrl) {
  const url=new URL(databaseUrl);assert.equal(url.hostname,"127.0.0.1");assert.match(url.pathname,/^\/mattanutra_lock_review_ax_/);
  await sql.unsafe(readFileSync("db-rollout/product-administration-schema.sql","utf8"));
  const inserted=[];
  for(const name of [...new Set(PUBLIC_MATCHER_FIXTURES.map(row=>row.nutrient))]) {
    const existing=await sql`select id from public.supplements where name=${name}`;
    assert.ok(existing.length<=1,`Ambiguous fixture reference: ${name}`);
    if(existing.length)continue;
    const hex=createHash("sha256").update(`service-efficiency-lock-fixture-v1:${name}`).digest("hex");
    const id=`${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
    await sql`insert into public.supplements(id,name,normalized_name,category,source,source_payload)
      values(${id}::uuid,${name},${name.toLowerCase().replace(/[^a-z0-9]+/g,"_")},'test_fixture','service-efficiency-lock-fixture-v1','{"synthetic":true}'::jsonb)`;
    inserted.push({id,name});
  }
  return {version:"service-efficiency-lock-fixture-v1",inserted,clinicalLimitsWritten:0,pricesWritten:0};
}
