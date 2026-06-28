import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("supplement admin popup", () => {
  it("hard deletes supplements while accounting for orphaned product facts", async () => {
    const route = await readFile("app/api/admin/supplements/[id]/route.ts", "utf8");
    const service = await readFile("lib/admin-supplements.ts", "utf8");
    const schema = await readFile("db-schema.sql", "utf8");

    assert.match(route, /export async function DELETE/);
    assert.match(route, /deleteAdminSupplement/);
    assert.match(service, /export async function deleteAdminSupplement/);
    assert.match(service, /productIdsUsingSupplement/);
    assert.match(service, /refreshAndPersistProductValidations/);
    assert.match(service, /delete from public\.supplements/);
    assert.match(service, /action:\s*"deleted"/);
    assert.match(schema, /product_facts_product_id_fkey[\s\S]*ON DELETE CASCADE/);
    assert.match(schema, /product_facts_supplement_id_fkey[\s\S]*ON DELETE SET NULL/);
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
    const rebuildPrd = await readFile("scripts/rebuild-prd-db.mjs", "utf8");
    const rebuildUat = await readFile("scripts/rebuild-uat-db.mjs", "utf8");
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
    assert.match(schemaScript, /create table if not exists public\.supplement_country_availability/);
    assert.match(packageJson, /supplements:country-availability:schema:apply/);
    assert.match(rebuildPrd, /supplements:country-availability:schema:apply/);
    assert.match(rebuildUat, /supplements:country-availability:schema:apply/);
  });
});
