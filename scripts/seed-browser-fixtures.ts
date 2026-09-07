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
try {
  // Organisation writes advance catalogue identity. Provision every admin
  // dependency before compiling a recommendation, then reuse the target in E2E.
  const adminTargetId = await withDatabaseTransaction(sql, async tx => {
    const [platform] = await tx`insert into public.organisations (slug, name, organisation_type, status) values ('mattanutra', 'MattaNutra', 'platform', 'active')
      on conflict (lower(slug)) do update set status = 'active' returning id`;
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
  const { product, set } = choice;
  const facts = product.facts.filter(fact => fact.amount && fact.amount > 0 && fact.unit && parseDose(`${fact.amount} ${fact.unit}`, fact.normalizedName));
  const formulation: FormulationBlueprint & Pick<FormulationResult, "sectionStatuses"> = { sectionStatuses: { supplements: "ready", foods: "ready" }, supplementBreakdown: facts.map((fact, index) => ({
    id: fact.normalizedName || `fixture-${index}`, supplement: fact.name, category: "Supplement", dailyDose: `${fact.amount} ${fact.unit}/day`,
    effectivenessRank: index + 1, rationale: "Browser fixture for current advisory guidance.", status: "add"
  })) };
  const needs = buildProductNeeds({ formulation, foodGuidance: null });
  const recommendation = recommendWithMatcher({ candidates: [product], needs, countryCode: "TH", clientContext: { ageYears: 40, lifestage: "adult", currentSupplements: "none" }, stackPreference: "balanced", catalogueFingerprint: valueCatalogueFingerprint(catalogue) });
  assert.ok(recommendation.recommendations.length, "Browser fixture must contain an actual product basket");
  const selectedIds = recommendation.recommendations.map(item => item.product.id);
  const selectedOptionId = recommendation.diagnostics.matching!.selectedOptionId!;
  const price = Number(product.unitPriceAmount ?? product.priceAmount);
  assert.ok(price > 0);
  const rawAnswers = { firstName: "Browser Fixture", sex: "female", age: "36-45", goals: ["energy", "bone"], activity: "light", meds: "none", kidney: "normal", liver: "normal", surgery: "none", supplements: "none", reproStatus: "none" };
  const answers = { ...rawAnswers, inputProvenance: captureInputProvenance(rawAnswers) };
  const score = completeHealthScoreFixture("en");
  const retailer = { ...set, candidates: undefined, productCount: selectedIds.length, subtotalAmount: price, supplementProductCoveragePercent: 100, totalPlanCoveragePercent: 100, unavailableReason: null, backorderCount: 0 };
  const address = { addressLine1: "1 Fixture Road", city: "Bangkok", province: "Bangkok", postalCode: "10110", country: "TH", customerEmail: "browser-fixture@example.test", customerName: "Browser Fixture", phone: "+66000000000" };
  const quoteLines = [{ productId: product.id, productTitle: product.title, imageUrl: product.imageUrl ?? null, quantity: 1, unitPriceAmount: price, currency: product.currency, etaDate: null }];
  await withDatabaseTransaction(sql, async tx => {
    await persistAssessmentSubmission({ answers, locale: "en", status: "ready", selectedPlan: "precision", snapshot: createAssessmentSnapshot({ planId, healthScore: score }) });
    const generation = (await loadGenerationInput(tx, planId, "en"))!;
    await tx`insert into public.assessment_healthscore_results (plan_id, revision, locale, generator_version, result)
      values (${planId}::uuid, ${generation.revision}, 'en', ${FUNNEL_GENERATOR_VERSION}, ${tx.json(toJsonValue(score))})`;
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
      values (${runId}::uuid, ${planId}::uuid, ${generation.revision}, 'en', ${FUNNEL_GENERATOR_VERSION}, 0, ${Number(catalogueEpoch.revision)}, ${catalogueFingerprint}, 'standard',
        ${recommendation.stackCoveragePercent}, ${recommendation.supplementProductCoveragePercent}, ${recommendation.totalPlanCoveragePercent},
        ${tx.json(toJsonValue(needs))}, ${tx.json(toJsonValue({ ...recommendation.diagnostics, retailerOptions: [retailer], selectedRetailer: retailer }))}, 'Synthetic browser fixture; no provider transaction')`;
    for (const item of recommendation.recommendations) await tx`insert into public.product_recommendation_items
      (run_id, product_id, rank, score, product_coverage_percent, stack_contribution_percent, serving_multiplier, covered_needs, why, url_used, price_amount, currency,
        selected_retailer_organisation_id, retail_sellable_product_id, availability_status, unit_price_amount, image_url)
      values (${runId}::uuid, ${item.product.id}::uuid, ${item.rank}, ${item.score}, ${item.productCoveragePercent}, ${item.stackContributionPercent}, ${item.servingMultiplier},
        ${tx.json(toJsonValue(item.coveredNeeds))}, ${item.why}, ${item.url}, ${price}, ${product.currency}, ${set.organisationId}::uuid,
        ${item.retailSellableProductId ?? null}::uuid, 'available_now', ${price}, ${product.imageUrl ?? null})`;
    await tx`insert into public.payments (id, plan_id, selected_plan, status, fulfillment_status, amount, stripe_mode, paid_at, metadata)
      values (${randomUUID()}::uuid, ${planId}::uuid, 'precision', 'paid', 'complete', 690000000, 'mock', now(), '{"source":"isolated_browser_fixture","synthetic":true}')`;
    await tx`insert into public.retail_customer_orders (id, organisation_id, order_number, source, customer_name, customer_email, status, currency, placed_at, metadata)
      values (${orderId}::uuid, ${set.organisationId}::uuid, ${orderNumber}, 'checkout', 'Browser Fixture', 'browser-fixture@example.test', 'placed', ${product.currency}, now(), '{"source":"isolated_browser_fixture","synthetic":true}')`;
    await tx`insert into public.retail_customer_order_lines (customer_order_id, organisation_id, product_id, quantity_ordered, retail_price_amount, metadata)
      values (${orderId}::uuid, ${set.organisationId}::uuid, ${product.id}::uuid, 1, ${price}, '{"source":"isolated_browser_fixture","synthetic":true}')`;
    await tx`insert into public.retail_checkout_payments (id, plan_id, recommendation_run_id, retail_customer_order_id, selected_retailer_organisation_id, status,
      amount, currency, stripe_mode, customer_email, customer_name, customer_phone, shipping_address, selected_item_ids, quote_lines, metadata, idempotency_key, paid_at, fulfilled_at)
      values (${paymentId}::uuid, ${planId}::uuid, ${runId}::uuid, ${orderId}::uuid, ${set.organisationId}::uuid, 'fulfilled',
        ${Math.round(price * 1_000_000)}, ${product.currency}, 'mock', 'browser-fixture@example.test', 'Browser Fixture', '+66000000000', ${tx.json(address)}, ${selectedIds}::text[],
        ${tx.json(toJsonValue(quoteLines))}, '{"source":"isolated_browser_fixture","synthetic":true,"channel":"web"}', ${`browser-fixture:${paymentId}`}, now(), now())`;

  });
  const checkoutQuery = new URLSearchParams({ plan: planId, selected: selectedIds.join(","), removed: "", run: runId, option: selectedOptionId, revision: "1", selectionRevision: "0", retailer: set.organisationId });
  const fixtures = { planId, runId, paymentId, orderId, orderNumber, adminAgentId, generatorVersion: FUNNEL_GENERATOR_VERSION,
    ADMIN_E2E_TARGET_ORGANISATION_ID: adminTargetId,
    REVEAL_VISUAL_SMOKE_URL: new URL(`/en/nutrition/reveal?plan=${planId}`, base).href,
    MOBILE_UX_REVEAL_URL: new URL(`/en/nutrition/reveal?plan=${planId}`, base).href,
    MOBILE_UX_CHECKOUT_URL: new URL(`/en/basket/checkout?${checkoutQuery}`, base).href,
    MOBILE_UX_ORDER_URL: new URL(`/en/order/track/${orderNumber}`, base).href };
  await writeFile(outputPath, `${JSON.stringify(fixtures, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  console.log(`BROWSER_FIXTURES:${JSON.stringify({ ...fixtures, outputPath })}`);
} finally { await closeSqlPool(); }
