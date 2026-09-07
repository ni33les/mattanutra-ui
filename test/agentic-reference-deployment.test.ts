import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("Anna reference deployment compatibility", () => {
  it("ANNA-DEPLOY-01 exposes the additive schema and preserves explicit dry-run correction review", async () => {
    const pkg = JSON.parse(await readFile("package.json", "utf8"));
    const command = pkg.scripts["supplements:safety-reference-integrity:schema:apply"];
    assert.equal(typeof command, "string", "Deployment must expose the new additive migration command");
    assert.match(command, /scripts\/apply-supplement-safety-reference-integrity-schema\.ts$/);
    assert.match(await readFile("scripts/apply-supplement-safety-reference-integrity-schema.ts", "utf8"), /supplement-safety-reference-integrity-schema\.sql/);
    assert.match(pkg.scripts["supplements:safety-references:correct"], /scripts\/correct-supplement-safety-references\.ts$/);
    assert.doesNotMatch(pkg.scripts["supplements:safety-references:correct"], /--apply/);
  });

  it("ANNA-DEPLOY-02 both environments install provenance columns before the updated life-stage seeder can read them", async () => {
    for (const environment of ["dev", "uat"]) {
      const source = await readFile(`scripts/deploy-${environment}.mjs`, "utf8");
      const phase = environment === "dev"
        ? source.slice(source.indexOf("const schemaScripts"), source.indexOf("const smokeUrls"))
        : source.slice(source.indexOf("async function applyRuntimeSchema"), source.indexOf("function runCaptureWithStatus"));
      const commands = [...phase.matchAll(/"([a-z:-]+:schema:apply)"/g)].map(match => match[1]);
      const reference = commands.indexOf("supplements:safety-reference-integrity:schema:apply");
      const lifeStages = commands.indexOf("supplements:safety-limit-life-stages:schema:apply");
      assert.ok(reference >= 0 && lifeStages > reference, `${environment}: source_url/basis_rationale must exist before seeding`);
      for (const prerequisite of ["products:administration:schema:apply", "web-funnel:schema:apply", "matcher:runtime:schema:apply"]) {
        assert.ok(commands.includes(prerequisite), `${environment}: missing ${prerequisite}`);
      }
      // Data changes are a subsequent reviewed operation after the compatible
      // application and workers have started, never a pre-deployment side effect.
      assert.doesNotMatch(source, /correct-supplement-safety-references|safety-references:correct|--apply\b/);
    }
  });

  it("ANNA-DEPLOY-03 the migration preserves existing reference heads and receipt immutability", async () => {
    const sql = await readFile("db-rollout/supplement-safety-reference-integrity-schema.sql", "utf8");
    assert.match(sql, /ADD COLUMN IF NOT EXISTS source_url text/i);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS basis_rationale text/i);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.supplement_safety_reference_corrections/i);
    assert.match(sql, /BEFORE UPDATE OR DELETE[\s\S]*prevent_domain_version_mutation/i);
    assert.doesNotMatch(sql, /(?:UPDATE|DELETE FROM|TRUNCATE|DROP TABLE)\s+public\.supplement_safety_limits/i);
  });
});
