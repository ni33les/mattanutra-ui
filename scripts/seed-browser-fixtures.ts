import { webHealthAdvice } from "../lib/web-health-advice.ts";
/** Disposable browser fixtures only: no provider calls, charges, fulfillment or email sending. */
import "../test/helpers/offline-network.mjs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getSql, closeSqlPool, withDatabaseTransaction } from "../lib/db.ts";
import { persistAssessmentSubmission, toJsonValue } from "../lib/assessment-store.ts";
import { createAssessmentSnapshot } from "../lib/assessment-snapshot.ts";
import { captureInputProvenance } from "../lib/assessment-input-provenance.ts";
import { loadGenerationInput, FUNNEL_GENERATOR_VERSION } from "../lib/assessment-revisions.ts";
import { insertFormulationVersion, insertFoodGuidanceVersion } from "../lib/plan-version-writes.ts";
import { getLiveSaleEligibleRetailerCandidateSets } from "../lib/admin-product-search.ts";
import { buildProductNeeds } from "../lib/product-recommendation-needs.ts";
import { recommendWithMatcher } from "../lib/matcher/adapters/web.ts";
import { warmLiveRetailSnapshot } from "../lib/agentic/catalogue/live.ts";
import { valueCatalogueFingerprint } from "../lib/agentic/value/fingerprint.ts";
import { parseDose } from "../lib/dose-conversion.ts";
import { completeHealthScoreFixture } from "../test/fixtures/healthscore.ts";
import type { FormulationBlueprint, FormulationResult } from "../lib/formulation-types.ts";
import { isLocale } from "../lib/i18n.ts";

const database = new URL(process.env.TEST_DB_URL!);
assert.equal(database.hostname, "127.0.0.1", "Browser fixtures require the disposable localhost database");
assert.match(database.pathname, /^\/mattanutra_lock_review(?:[_-].*)?$/);
const base = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100");
assert.equal(base.hostname, "127.0.0.1", "Browser fixtures require the isolated localhost application");
process.env.DB_URL = database.href;
process.env.DB_WORKER_URL = database.href;
process.env.STRIPE_PAYMENT_MODE = "mock";
process.env.MATTANUTRA_ENV = "dev";
const sql = getSql()!;
const planId = randomUUID(), runId = randomUUID(), paymentId = randomUUID(), orderId = randomUUID(), adminAgentId = randomUUID();
const orderNumber = `E2E-${randomUUID().slice(0, 8).toUpperCase()}`;
const outputPath = resolve(process.argv[2] ?? `/tmp/mattanutra-browser-fixtures-${Date.now()}.json`);
const scenario = process.argv[3] ? JSON.parse(process.argv[3]) : null;
assert.ok(scenario === null || (["numeric_preferences", "practical_advice"].includes(scenario.scenario) && isLocale(scenario.locale)), "Unknown isolated browser fixture scenario");
const locale = scenario?.locale ?? "en";
try {
  // Organisation writes advance catalogue identity. Provision every admin
  // dependency before compiling a recommendation, then reuse the target in E2E.
  const adminTargetId = await withDatabaseTransaction(sql, async tx => {
    const readPlatform = () => tx<Array<{ id: string; organisation_type: string; status: string }>>`
      select id,organisation_type,status from public.organisations where lower(slug)='mattanutra'`;
    let [platform] = await readPlatform();
    if (!platform) {
      await tx`insert into public.organisations (slug,name,organisation_type,status)
        values ('mattanutra','MattaNutra','platform','active') on conflict (lower(slug)) do nothing`;
      [platform] = await readPlatform();
    }
    assert.ok(platform, "Browser fixtures require the platform organisation");
    assert.equal(platform.organisation_type, "platform");
    assert.equal(platform.status, "active", "Browser fixtures cannot change existing platform eligibility");
    const [person] = await tx`insert into public.people (email, display_name, status, metadata) values ('browser-owner@example.test', 'Browser Fixture Owner', 'active', '{"source":"isolated_browser_fixture"}')
      on conflict (lower(email)) do update set status = 'active' returning id`;
    await tx`insert into public.organisation_memberships (organisation_id, person_id, role, status) values (${platform.id}::uuid, ${person.id}::uuid, 'platform_owner', 'active') on conflict do nothing`;
    await tx`insert into public.agents (id, name, organisation_id, metadata) values (${adminAgentId}::uuid, ${`Browser Fixture ${randomUUID().slice(0, 8)}`}, ${platform.id}::uuid, '{"source":"isolated_browser_fixture"}')`;
    const targetSlug = "browser-admin-target-fixture";
    const readTarget = () => tx<Array<{ id: string; name: string; organisation_type: string; status: string; metadata: { source?: string } }>>`
      select id::text,name,organisation_type,status,metadata from public.organisations where lower(slug)=lower(${targetSlug})`;
    let [target] = await readTarget();
    if (!target) {
      await tx`insert into public.organisations (slug,name,organisation_type,status,default_locale,metadata)
        values (${targetSlug},'Browser Fixture Agent Target','tenant','active','en','{"source":"browser-admin-target-fixture"}')
        on conflict (lower(slug)) do nothing`;
      [target] = await readTarget();
    }
    assert.ok(target, "Preprovisioned admin target must exist");
    assert.deepEqual({ name: target.name, type: target.organisation_type, status: target.status, source: target.metadata.source },
      { name: "Browser Fixture Agent Target", type: "tenant", status: "active", source: "browser-admin-target-fixture" },
      "Admin fixtures cannot replace an existing organisation or its commercial fields");
    return target.id;
  });
  const catalogue = await warmLiveRetailSnapshot("TH");
  const sets = await getLiveSaleEligibleRetailerCandidateSets({ sql, countryCode: "TH", limit: 1000 });
  const choices = sets.flatMap(set => set.candidates.map(product => ({ set, product }))).sort((a, b) =>
    a.set.organisationId.localeCompare(b.set.organisationId) || a.product.id.localeCompare(b.product.id));
  const choice = choices.find(({ product }) => product.administration?.route === "oral" && product.administration.provenance.status === "verified" && product.facts.some(fact => fact.amount && fact.amount > 0 && fact.unit && parseDose(`${fact.amount} ${fact.unit}`, fact.normalizedName)));
  assert.ok(choice, "Seed the isolated sale-eligible product catalogue before browser fixtures");
  let { product, set } = choice;
  let selectedCandidates = [product];
  if (scenario) {
    const fixtureRows = await sql<Array<{ id: string; normalized_title: string }>>`select id::text,normalized_title from public.products
      where source='matcher-v5-public-fixture-1' and source_snapshot->>'fixture'='matcher-v5-public-fixture-1'
        and normalized_title in ('synthetic_fixture_c','synthetic_fixture_d3') order by normalized_title`;
    assert.equal(fixtureRows.length, 2, "Numeric preference scenario requires the existing controlled C250 and D31000 labels");
    const fixtureChoices = fixtureRows.map(row => choices.find(item => item.product.id === row.id));
    assert.ok(fixtureChoices.every(Boolean), "Both fixture products must remain sellable");
    assert.equal(fixtureChoices[0]!.set.organisationId, fixtureChoices[1]!.set.organisationId);
    product = fixtureChoices[0]!.product; set = fixtureChoices[0]!.set;
    selectedCandidates = fixtureChoices.map(item => item!.product);
  }
  const facts = selectedCandidates.flatMap(item => item.facts.filter(fact => fact.amount && fact.amount > 0 && fact.unit && parseDose(`${fact.amount} ${fact.unit}`, fact.normalizedName)));
  const formulation: FormulationBlueprint & Pick<FormulationResult, "sectionStatuses"> = { sectionStatuses: { supplements: "ready", foods: "ready" }, supplementBreakdown: facts.map((fact, index) => ({
    id: fact.normalizedName || `fixture-${index}`, supplement: fact.name, category: "Supplement", dailyDose: `${fact.amount} ${fact.unit}/day`,
    effectivenessRank: index + 1, rationale: "Browser fixture for current advisory guidance.", status: "add"
  })) };
  const needs = buildProductNeeds({ formulation, foodGuidance: null });
  let recommendation = recommendWithMatcher({ candidates: selectedCandidates, needs, countryCode: "TH",
    ...(scenario ? { maxProducts: 0, budgetAmount: 0 } : {}),
    clientContext: { ageYears: 40, lifestage: "adult", currentSupplements: "none", ...(scenario ? { pillLimit: "0" } : {}) },
    stackPreference: "balanced", catalogueFingerprint: valueCatalogueFingerprint(catalogue) });
  if (scenario) {
    // This journey intentionally selects the returned full-coverage basket above
    // zero preferences. Contract 8 may recommend no purchase; selection stays valid.
    const matching = recommendation.diagnostics.matching!;
    const chosen = matching.options.find(option => option.productIds.length === 2 && option.roles?.includes("closest_dose"));
    assert.ok(chosen, "Controlled C/D3 labels must retain their exact-dose purchase alternative");
    const options = matching.options.map(option => {
      if (scenario.scenario !== "practical_advice") return option;
      const medical = webHealthAdvice({ code: "medication_interaction", kind: "context", ingredient: option.candidateKey === chosen.candidateKey ? "Selected fixture nutrient" : "Alternative fixture nutrient", evidence: "Explicit isolated UI interaction fixture" });
      const incomplete = webHealthAdvice({ code: "intake_unknown", kind: "unknown", ingredient: "Fixture intake" });
      return { ...option, advice: [medical, medical, incomplete, incomplete] };
    });
    recommendation = { ...recommendation, recommendations: [...chosen.recommendations],
      stackCoveragePercent: chosen.coveragePercent, supplementProductCoveragePercent: chosen.coveragePercent,
      diagnostics: { ...recommendation.diagnostics, matching: { ...matching, operationalStatus: "ready", selectedCandidateKey: chosen.candidateKey, options } } };
  }
  assert.ok(recommendation.recommendations.length, "Browser fixture must contain an actual product basket");
  const selectedIds = recommendation.recommendations.map(item => item.product.id);
  const selectedCandidateKey = recommendation.diagnostics.matching!.selectedCandidateKey!;
  const price = Number(product.unitPriceAmount ?? product.priceAmount);
  assert.ok(price > 0);
  const rawAnswers = { firstName: "Browser Fixture", sex: "female", age: "36-45", goals: ["energy", "bone"], activity: "light", meds: "none", kidney: "normal", liver: "normal", surgery: "none", supplements: "none", reproStatus: "none" };
  const answers = { ...rawAnswers, inputProvenance: captureInputProvenance(rawAnswers) };
  const score = completeHealthScoreFixture(locale);
  const subtotal = recommendation.recommendations.reduce((sum, row) => sum + Number(row.unitPriceAmount ?? row.product.priceAmount), 0);
  const retailer = { ...set, candidates: undefined, productCount: selectedIds.length, subtotalAmount: subtotal, supplementProductCoveragePercent: 100, totalPlanCoveragePercent: 100, unavailableReason: null, backorderCount: 0 };
  const address = { addressLine1: "1 Fixture Road", city: "Bangkok", province: "Bangkok", postalCode: "10110", country: "TH", customerEmail: "browser-fixture@example.test", customerName: "Browser Fixture", phone: "+66000000000" };
  const quoteLines = recommendation.recommendations.map(row => ({ productId: row.product.id, productTitle: row.product.title, imageUrl: row.product.imageUrl ?? null,
    quantity: 1, unitPriceAmount: Number(row.unitPriceAmount ?? row.product.priceAmount), currency: row.product.currency, etaDate: null }));
  await withDatabaseTransaction(sql, async tx => {
    await persistAssessmentSubmission({ answers, locale, status: "ready", selectedPlan: "precision", snapshot: createAssessmentSnapshot({ planId, healthScore: score }) });
    const generation = (await loadGenerationInput(tx, planId, locale))!;
    await tx`insert into public.assessment_healthscore_results (plan_id, revision, locale, generator_version, result)
      values (${planId}::uuid, ${generation.revision}, ${locale}, ${FUNNEL_GENERATOR_VERSION}, ${tx.json(toJsonValue(score))})`;
    await insertFormulationVersion(tx, { planId, generation, modelVersion: "browser-advisory-fixture", formulation });
    await insertFoodGuidanceVersion(tx, { planId, generation, modelVersion: "browser-advisory-fixture", foodGuidance: {
      foodGuidance: [{ id: "oats", category: "Food", food: "Oats", serving: "One portion", frequency: "A few times a week", effectivenessRank: 1, rationale: "A varied diet supports the plan.", status: "add" }]
    } });
    const [catalogueEpoch] = await tx`select revision from public.catalogue_runtime_revision where singleton=true`;
    assert.ok(catalogueEpoch, "Browser fixture requires the current catalogue revision schema");
    assert.equal(Number(catalogueEpoch.revision), catalogue.runtimeRevision, "Catalogue changed while preparing the browser fixture");
    const catalogueFingerprint = recommendation.diagnostics.catalogueFingerprint ?? null;
    await tx`insert into public.product_recommendation_runs (id, plan_id, assessment_revision, generation_locale, generator_version, selection_revision, catalogue_revision, catalogue_fingerprint, search_effort,
      stack_coverage_percent, supplement_product_coverage_percent, total_coverage_percent, client_needs, diagnostics, notes)
      values (${runId}::uuid, ${planId}::uuid, ${generation.revision}, ${locale}, ${FUNNEL_GENERATOR_VERSION}, 0, ${Number(catalogueEpoch.revision)}, ${catalogueFingerprint}, 'standard',
        ${recommendation.stackCoveragePercent}, ${recommendation.supplementProductCoveragePercent}, ${recommendation.totalPlanCoveragePercent},
        ${tx.json(toJsonValue(needs))}, ${tx.json(toJsonValue({ ...recommendation.diagnostics, retailerOptions: [retailer], selectedRetailer: retailer }))}, 'Synthetic browser fixture; no provider transaction')`;
    for (const item of recommendation.recommendations) await tx`insert into public.product_recommendation_items
      (run_id, product_id, rank, score, product_coverage_percent, stack_contribution_percent, serving_multiplier, covered_needs, why, url_used, price_amount, currency,
        selected_retailer_organisation_id, retail_sellable_product_id, availability_status, unit_price_amount, image_url)
      values (${runId}::uuid, ${item.product.id}::uuid, ${item.rank}, ${item.score}, ${item.productCoveragePercent}, ${item.stackContributionPercent}, ${item.servingMultiplier},
        ${tx.json(toJsonValue(item.coveredNeeds))}, ${item.why}, ${item.url}, ${Number(item.unitPriceAmount ?? item.product.priceAmount)}, ${item.product.currency}, ${set.organisationId}::uuid,
        ${item.retailSellableProductId ?? null}::uuid, 'available_now', ${Number(item.unitPriceAmount ?? item.product.priceAmount)}, ${item.product.imageUrl ?? null})`;
    await tx`insert into public.payments (id, plan_id, selected_plan, status, fulfillment_status, amount, stripe_mode, paid_at, metadata)
      values (${randomUUID()}::uuid, ${planId}::uuid, 'precision', 'paid', 'complete', 690000000, 'mock', now(), '{"source":"isolated_browser_fixture","synthetic":true}')`;
    await tx`insert into public.retail_customer_orders (id, organisation_id, order_number, source, customer_name, customer_email, status, currency, placed_at, metadata)
      values (${orderId}::uuid, ${set.organisationId}::uuid, ${orderNumber}, 'checkout', 'Browser Fixture', 'browser-fixture@example.test', 'placed', ${product.currency}, now(), '{"source":"isolated_browser_fixture","synthetic":true}')`;
    for (const line of quoteLines) await tx`insert into public.retail_customer_order_lines (customer_order_id, organisation_id, product_id, quantity_ordered, retail_price_amount, metadata)
      values (${orderId}::uuid, ${set.organisationId}::uuid, ${line.productId}::uuid, ${line.quantity}, ${line.unitPriceAmount}, '{"source":"isolated_browser_fixture","synthetic":true}')`;
    await tx`insert into public.retail_checkout_payments (id, plan_id, recommendation_run_id, retail_customer_order_id, selected_retailer_organisation_id, status,
      amount, currency, stripe_mode, customer_email, customer_name, customer_phone, shipping_address, selected_item_ids, quote_lines, metadata, idempotency_key, paid_at, fulfilled_at)
      values (${paymentId}::uuid, ${planId}::uuid, ${runId}::uuid, ${orderId}::uuid, ${set.organisationId}::uuid, 'fulfilled',
        ${Math.round(subtotal * 1_000_000)}, ${product.currency}, 'mock', 'browser-fixture@example.test', 'Browser Fixture', '+66000000000', ${tx.json(address)}, ${selectedIds}::text[],
        ${tx.json(toJsonValue(quoteLines))}, '{"source":"isolated_browser_fixture","synthetic":true,"channel":"web"}', ${`browser-fixture:${paymentId}`}, now(), now())`;

  });
  const checkoutQuery = new URLSearchParams({ plan: planId, selected: selectedIds.join(","), removed: "", run: runId, option: selectedCandidateKey, revision: "1", selectionRevision: "0", retailer: set.organisationId });
  const selectedOption = recommendation.diagnostics.matching!.options.find(option => option.candidateKey === selectedCandidateKey)!;
  const alternative = recommendation.diagnostics.matching!.options.find(option => option.candidateKey !== selectedCandidateKey && option.purchaseEligible && option.productIds.length > 0);
  if (scenario) {
    assert.equal(selectedOption.productIds.length, 2); assert.ok(alternative, "Numeric preference browser fixture requires a selectable simpler option");
    const [rrp] = await sql`select sum(price_amount)::numeric as amount from public.products where id=any(${selectedOption.productIds}::uuid[])`;
    assert.equal(Number(rrp.amount), 40, "Existing catalogue RRP fixtures remain 23 + 17 THB before the configured customer margin");
    assert.equal(selectedOption.priceMinor, Math.round(subtotal * 100), "Advice and stored checkout lines share the actual first-order goods price");
  }
  const fixtures = { planId, runId, paymentId, orderId, orderNumber, adminAgentId, locale, generatorVersion: FUNNEL_GENERATOR_VERSION,
    ...(scenario ? { preferenceScenario: { selectedProductCount: selectedOption.productIds.length, selectedProductIds: selectedOption.productIds,
      selectedDailyPills: selectedOption.dailyPills, selectedPriceMinor: selectedOption.priceMinor, firstOrderLineSubtotalMinor: Math.round(subtotal * 100), preferenceAssessment: selectedOption.preferences,
      alternative: { candidateKey: alternative!.candidateKey, productIds: alternative!.productIds } } } : {}),
    ADMIN_E2E_TARGET_ORGANISATION_ID: adminTargetId,
    REVEAL_VISUAL_SMOKE_URL: new URL(`/${locale}/nutrition/reveal?plan=${planId}`, base).href,
    MOBILE_UX_REVEAL_URL: new URL(`/${locale}/nutrition/reveal?plan=${planId}`, base).href,
    MOBILE_UX_CHECKOUT_URL: new URL(`/${locale}/basket/checkout?${checkoutQuery}`, base).href,
    MOBILE_UX_ORDER_URL: new URL(`/${locale}/order/track/${orderNumber}`, base).href };
  await writeFile(outputPath, `${JSON.stringify(fixtures, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  console.log(`BROWSER_FIXTURES:${JSON.stringify({ ...fixtures, outputPath })}`);
} finally { await closeSqlPool(); }
