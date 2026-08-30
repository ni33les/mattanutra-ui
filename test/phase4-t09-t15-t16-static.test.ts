import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import sourceCatalog from "../content/i18n/source/en.json" with { type: "json" };
import thCatalog from "../content/i18n/locales/th.json" with { type: "json" };
import zhCnCatalog from "../content/i18n/locales/zh-CN.json" with { type: "json" };
import { t } from "../lib/i18n-messages.ts";

const formulaExplainIds = [
  "customer.revealLabels.formulaCategoryExplain.foundation",
  "customer.revealLabels.formulaCategoryExplain.foundationAddOn",
  "customer.revealLabels.formulaCategoryExplain.targeted"
] as const;

describe("Phase 4 T09/T15/T16", () => {
  it("T09 shows i18n Foundation/Add-on/Targeted explanations on the existing reveal grouping UI", async () => {
    const [reveal, copy] = await Promise.all([
      readFile("components/reveal-final-results.tsx", "utf8"),
      readFile("components/formulation-reveal-copy.ts", "utf8")
    ]);

    assert.match(copy, /formulaCategoryExplain/);
    assert.match(copy, /export function localizedCategoryExplanation/);
    assert.match(reveal, /localizedCategoryExplanation\(category, locale\)/);
    assert.match(reveal, /data-testid="formula-category-explain"/);
    assert.doesNotMatch(
      sourceCatalog["customer.revealLabels.formulaCategoryExplain.foundation"].defaultMessage,
      /lorem|Panya/i
    );

    for (const id of formulaExplainIds) {
      assert.ok(sourceCatalog[id]?.defaultMessage);
      assert.ok(thCatalog[id]);
      assert.ok(zhCnCatalog[id]);
      assert.notEqual(t("en", id), t("th", id));
    }
  });

  it("T15 reuses quiz/reveal/match rails and looks up pharmacies from organisations", async () => {
    const [
      pharmacy,
      search,
      workItems,
      capture,
      quiz,
      inStorePage,
      entryPage,
      healthscorePage
    ] = await Promise.all([
      readFile("lib/pharmacy-in-store.ts", "utf8"),
      readFile("lib/admin-product-search.ts", "utf8"),
      readFile("lib/task-work-items.ts", "utf8"),
      readFile("app/api/assessment/route.ts", "utf8"),
      readFile("components/chat-questionnaire/chat-questionnaire.tsx", "utf8"),
      readFile("app/[locale]/p/[pharmacyId]/page.tsx", "utf8"),
      readFile("app/p/[pharmacyId]/page.tsx", "utf8"),
      readFile("app/[locale]/nutrition/healthscore/page.tsx", "utf8")
    ]);

    assert.match(pharmacy, /from public.organisations/);
    assert.match(pharmacy, /organisations.slug/);
    assert.match(pharmacy, /organisation_type = 'tenant'/);
    assert.doesNotMatch(pharmacy, /delight-pharmacy|enchanted-pharmacy/);
    assert.match(search, /organisationId\?: string \| null/);
    assert.match(search, /organisations.id = \$\{organisationId\}::uuid/);
    assert.match(workItems, /inStorePharmacyFromAnswers\(row\.answers\)/);
    assert.match(pharmacy, /export async function loadInStorePharmacyOrganisationId/);
    assert.match(capture, /skipHealthScore/);
    assert.match(capture, /healthScore: skipHealthScore/);
    assert.match(capture, /selectedPlan: skipHealthScore \? DEFAULT_ASSESSMENT_PLAN : null/);
    assert.match(quiz, /skipHealthScoreStep/);
    assert.match(quiz, /nutritionRevealPath/);
    assert.match(inStorePage, /ChatQuestionnaire/);
    assert.match(inStorePage, /skipHealthScore/);
    assert.match(inStorePage, /pharmacyId=\{pharmacy.slug\}/);
    assert.match(entryPage, /nutritionPharmacyPath/);
    assert.match(healthscorePage, /assessmentSkipsHealthScore/);
    assert.doesNotMatch(inStorePage, /recommendProductStackFullBeam|createCheckoutSession/);
  });

  it("T16 exports live approved products from the existing products.status query", async () => {
    const [csv, route, view] = await Promise.all([
      readFile("lib/product-catalogue-csv.ts", "utf8"),
      readFile("app/api/admin/products/catalogue/export/route.ts", "utf8"),
      readFile("components/admin/product-view.tsx", "utf8")
    ]);

    assert.match(csv, /export async function buildApprovedProductCatalogueCsv/);
    assert.match(
      csv.slice(csv.indexOf("export async function buildApprovedProductCatalogueCsv")),
      /products\.status = 'approved'/
    );
    assert.doesNotMatch(
      csv.slice(csv.indexOf("buildApprovedProductCatalogueCsv")),
      /prd_\w+|fixture dump|hardcodedSku/i
    );
    assert.match(route, /scope === "approved"/);
    assert.match(route, /buildApprovedProductCatalogueCsv/);
    assert.match(route, /filename="products.csv"/);
    assert.match(view, /params\.set\("scope", "approved"\)/);
    assert.match(view, /data-testid="approved-products-export"/);
    assert.match(view, /viewLabels.exportCsv/);
  });
});
