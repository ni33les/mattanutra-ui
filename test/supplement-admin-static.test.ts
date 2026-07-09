import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("supplement admin popup", () => {
  it("soft deletes supplements while accounting for orphaned product facts", async () => {
    const route = await readFile("app/api/admin/supplements/[id]/route.ts", "utf8");
    const service = await readFile("lib/admin-supplements.ts", "utf8");
    const schema = await readFile("db-schema.sql", "utf8");

    assert.match(route, /export async function DELETE/);
    assert.match(route, /deleteAdminSupplement/);
    assert.match(service, /export async function deleteAdminSupplement/);
    assert.match(service, /productIdsUsingSupplement/);
    assert.match(service, /refreshAndPersistProductValidations/);
    assert.match(service, /update public\.product_facts[\s\S]*set supplement_id = null/);
    assert.match(service, /delete from public\.supplement_aliases/);
    assert.match(service, /update public\.supplements/);
    assert.match(service, /source_payload[\s\S]*'deleted', true/);
    assert.match(service, /'deletedAt', \$\{deletedAt\}::text/);
    assert.match(service, /'deletedBy', \$\{deletedBy\}::text/);
    assert.match(service, /normalized_name = concat/);
    assert.match(service, /action:\s*"deleted"/);
    assert.match(service, /syncEnglishSupplementTranslationName/);
    assert.match(service, /supplement_canonical_name_update/);
    assert.match(schema, /product_facts_product_id_fkey[\s\S]*ON DELETE CASCADE/);
    assert.match(schema, /product_facts_supplement_id_fkey[\s\S]*ON DELETE SET NULL/);
    assert.match(schema, /supplement_safety_limits_supplement_id_fkey[\s\S]*ON DELETE RESTRICT/);
    assert.doesNotMatch(service, /delete from public\.supplements/);
    assert.doesNotMatch(service, /delete from public\.supplement_safety_limits/);
    assert.doesNotMatch(service, /delete from public\.supplement_versions/);
  });

  it("uses one popup to create, AI-suggest, edit, save, and delete supplements", async () => {
    const view = await readFile("components/admin/supplement-view.tsx", "utf8");
    const createModal = await readFile(
      "components/admin/supplement-create-modal.tsx",
      "utf8"
    );
    const createRoute = await readFile("app/api/admin/supplements/route.ts", "utf8");
    const suggestion = await readFile("lib/supplement-dose-suggestion.ts", "utf8");
    const labels = await readFile("components/admin/dashboard-content.tsx", "utf8");

    assert.doesNotMatch(view, /CreateSupplementModal/);
    assert.match(createModal, /export function CreateSupplementModal/);
    assert.match(view, /newSupplementDraftId/);
    assert.match(view, /createSupplementFromDraft/);
    assert.match(view, /setSearch\(name\)/);
    assert.match(view, /setCategory\(""\)/);
    assert.match(view, /setStatus\(""\)/);
    assert.match(view, /method: "POST"/);
    assert.match(view, /method: "PATCH"/);
    assert.match(view, /method: "DELETE"/);
    assert.match(view, /labels\.supplements\.deleteSupplement/);
    assert.match(view, /labels\.supplements\.primaryUseCase/);
    assert.match(view, /category:\s*row\.category/);
    assert.match(view, /primaryUseCase:\s*row\.primaryUseCase/);
    assert.match(view, /category:\s*[\s\S]*suggestion\.category/);
    assert.match(createRoute, /primaryUseCase:\s*textOrNull\(body\.primaryUseCase\)/);
    assert.match(suggestion, /category, primaryUseCase/);
    assert.match(labels, /deleteSupplementConfirm/);
    assert.match(labels, /primaryUseCase/);
  });

  it("supports country-specific supplement allow and block overrides", async () => {
    const view = await readFile("components/admin/supplement-view.tsx", "utf8");
    const service = await readFile("lib/admin-supplements.ts", "utf8");
    const createRoute = await readFile("app/api/admin/supplements/route.ts", "utf8");
    const updateRoute = await readFile("app/api/admin/supplements/[id]/route.ts", "utf8");
    const schema = await readFile("db-schema.sql", "utf8");
    const packageJson = await readFile("package.json", "utf8");
    const deployDev = await readFile("scripts/deploy-dev.mjs", "utf8");
    const deployUat = await readFile("scripts/deploy-uat.mjs", "utf8");
    const rebuildPrd = await readFile("scripts/rebuild-prd-db.mjs", "utf8");
    const rebuildUat = await readFile("scripts/rebuild-uat-db.mjs", "utf8");
    const uatSmoke = await readFile("scripts/uat-smoke.mjs", "utf8");
    const repairScript = await readFile(
      "scripts/repair-ashwagandha-country-availability.ts",
      "utf8"
    );
    const schemaScript = await readFile(
      "scripts/apply-supplement-country-availability-schema.ts",
      "utf8"
    );

    assert.match(schema, /CREATE TABLE public\.supplement_country_availability/);
    assert.match(schema, /PRIMARY KEY \(supplement_id, country_code\)/);
    assert.match(service, /countryAvailability/);
    assert.match(service, /replaceSupplementCountryAvailability/);
    assert.match(service, /normalizeSupplementAvailabilityCountryCode/);
    assert.match(service, /source_payload/);
    assert.match(createRoute, /parseCountryAvailability/);
    assert.match(updateRoute, /parseCountryAvailability/);
    assert.match(view, /Country rules/);
    assert.match(view, /item\.status === "blocked" \? "Blocked" : "Allowed"/);
    assert.match(view, /\{item\.countryCode\}/);
    assert.match(view, /value="allowed"/);
    assert.match(view, /productCountryOptions/);
    assert.match(view, /countryAvailability: row\.countryAvailability/);
    assert.match(repairScript, /Ashwaganda/);
    assert.match(repairScript, /countryCode: "TH"[\s\S]*status: "blocked"/);
    assert.match(repairScript, /countryCode: "GB"[\s\S]*status: "allowed"/);
    assert.match(repairScript, /source_payload/);
    assert.match(schemaScript, /DB_SCHEMA_URL/);
    assert.match(schemaScript, /DB_OWNER_URL/);
    assert.match(schemaScript, /cannot create in schema public/);
    assert.match(schemaScript, /create table public\.supplement_country_availability/);
    assert.match(
      schemaScript,
      /grant select, insert, update, delete on table[\s\S]*public\.supplement_country_availability/
    );
    assert.match(packageJson, /supplements:country-availability:schema:apply/);
    assert.match(packageJson, /dev-runtime-schema:verify/);
    assert.match(deployDev, /supplements:country-availability:schema:apply/);
    assert.match(deployDev, /DB_SCHEMA_URL/);
    assert.match(deployDev, /dev-runtime-schema:verify/);
    assert.match(deployUat, /supplements:country-availability:schema:apply/);
    assert.match(deployUat, /UAT_DB_SCHEMA_URL/);
    assert.match(deployUat, /UAT_DB_URL/);
    assert.match(uatSmoke, /"supplement_country_availability"/);
    assert.match(rebuildPrd, /supplements:country-availability:schema:apply/);
    assert.match(rebuildUat, /supplements:country-availability:schema:apply/);
  });
});
