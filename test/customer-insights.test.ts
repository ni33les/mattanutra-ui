import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  applyCustomerInsightSegmentAi,
  buildCustomerInsightArchetypes,
  buildCustomerInsightSegments,
  customerInsightsAiPromptInput
} from "../lib/admin-customer-insights.ts";
import { adminViewPermission } from "../lib/admin-rbac.ts";

const timestamp = new Date(Date.now() - 2 * 86_400_000).toISOString();

function customer(overrides: Record<string, unknown> = {}) {
  return {
    archetypeId: "right_amount_formula:36-45:female:pre-menopause:energy",
    archetypeLabel: "40-ish pre-menopause woman focused on Energy",
    campaign: "summer-living",
    capturedAt: timestamp,
    constraints: ["Busy mornings"],
    contactEmail: "niran@example.com",
    demographics: {
      ageBand: "36-45",
      ageLabel: "40-ish",
      lifeStage: "pre-menopause",
      reproductiveStatus: "none",
      sex: "female",
      sexLabel: "woman"
    },
    entitlement: "right_amount_formula",
    entitlementLabel: "Right Amount Formula",
    firstName: "Niran",
    funnelStage: "paid",
    goals: ["Energy", "Sleep"],
    healthScore: {
      band: "Building foundation",
      focusAreas: ["Sleep", "Stress"],
      score: 68
    },
    identifiable: true,
    lastActivityAt: timestamp,
    lastEvent: "payment_succeeded",
    locale: "en",
    orderNumber: "MN-1001",
    orderStatus: "placed",
    panya: {
      channelAddress: "line:niran",
      channelType: "line",
      escalationCount: 0,
      failedCount: 0,
      inboundCount: 2,
      lastMessageAt: timestamp,
      latestSnippets: ["Can I take this with breakfast?"],
      messageCount: 4,
      outboundCount: 2
    },
    planId: "11111111-1111-4111-8111-111111111111",
    productInterests: ["Calcium-D"],
    profile: "Female / 165 cm / 58 kg",
    region: "Thailand",
    selectedPlan: "precision",
    source: "line",
    status: "completed",
    supplementInterests: ["Magnesium Glycinate"],
    updatedAt: timestamp,
    ...overrides
  };
}

describe("customer intelligence insights", () => {
  it("wires the customer insights dashboard view and marketing permission", () => {
    const dashboardContent = readFileSync(
      "components/admin/dashboard-content.tsx",
      "utf8"
    );
    const dashboard = readFileSync("components/admin-dashboard.tsx", "utf8");
    const page = readFileSync("app/[locale]/admin/dashboard/page.tsx", "utf8");
    const zhContent = readFileSync(
      "components/admin/dashboard-content.zh-CN.json",
      "utf8"
    );

    assert.match(dashboardContent, /"customer-insights"/);
    assert.match(dashboardContent, /Customer Intelligence/);
    assert.match(zhContent, /客户洞察/);
    assert.match(dashboard, /AdminCustomerInsightsView/);
    assert.match(page, /getAdminCustomerInsightsData\(range\)/);
    assert.equal(adminViewPermission("customer-insights"), "marketing.read");
  });

  it("keeps optional tables guarded in the read model", () => {
    const readModel = readFileSync("lib/admin-customer-insights.ts", "utf8");

    assert.match(readModel, /to_regclass\('public\.communication_messages'\)/);
    assert.match(readModel, /to_regclass\('public\.retail_checkout_payments'\)/);
    assert.match(readModel, /to_regclass\('public\.product_recommendation_decisions'\)/);
    assert.match(readModel, /\banswers,\s*\n\s*answer_summary/);
    assert.match(readModel, /!availability\.communicationMessages/);
    assert.match(readModel, /!availability\.retailCheckoutPayments/);
    assert.match(readModel, /!availability\.productDecisions/);
  });

  it("groups exact customers into plan-aware personality archetypes", () => {
    const archetypes = buildCustomerInsightArchetypes([
      customer()
    ] as never);
    const archetype = archetypes[0];

    assert.ok(archetype);
    assert.equal(archetype.label, "40-ish pre-menopause woman focused on Energy");
    assert.equal(archetype.planLabel, "Right Amount Formula");
    assert.equal(archetype.count, 1);
    assert.equal(archetype.panyaEngaged, 1);
    assert.ok(archetype.signalMix.includes("Energy"));
  });

  it("assigns deterministic segments from plan, Nong Mata, order and HealthScore signals", () => {
    const { customers, segments } = buildCustomerInsightSegments([
      customer()
    ] as never);
    const row = customers[0];

    assert.ok(row);
    assert.equal(row.primarySegmentId, "panya-engaged-paid");
    assert.ok(row.segmentIds.includes("right-amount-formula-ready"));
    assert.ok(row.segmentIds.includes("order-in-progress"));
    assert.ok(row.segmentIds.includes("healthscore-opportunity"));
    assert.equal(row.purchaseReadinessScore, 100);
    assert.ok(
      segments.some(
        (segment) =>
          segment.id === "panya-engaged-paid" &&
          segment.panyaEngaged === 1 &&
          segment.customersWithOrders === 1
      )
    );
  });

  it("keeps AI enrichment inputs segment-level and applies safe generated labels", () => {
    const { segments } = buildCustomerInsightSegments([customer()] as never);
    const prompt = JSON.stringify(customerInsightsAiPromptInput(segments));
    const enriched = applyCustomerInsightSegmentAi(segments, [
      {
        id: "panya-engaged-paid",
        label: "High-touch formula starters",
        likelyMotivation: "They want a confident next step.",
        likelyObjection: "They may need proof before buying more.",
        marketingAngle: "Show practical momentum.",
        nextMessageTheme: "Offer a short check-in around routine fit."
      }
    ]);

    assert.doesNotMatch(prompt, /niran@example\.com/i);
    assert.doesNotMatch(prompt, /line:niran/i);
    assert.doesNotMatch(prompt, /Can I take this/i);
    assert.equal(enriched.find((segment) => segment.id === "panya-engaged-paid")?.label, "High-touch formula starters");
  });

  it("exports exact customer identity and order fields from the filtered table", () => {
    const view = readFileSync("components/admin/customer-insights-view.tsx", "utf8");

    assert.match(view, /first_name/);
    assert.match(view, /email/);
    assert.match(view, /line_or_channel/);
    assert.match(view, /archetype/);
    assert.match(view, /age_band/);
    assert.match(view, /order_number/);
    assert.match(view, /product_interests/);
    assert.match(view, /supplement_interests/);
  });

  it("keeps the customer atlas compact instead of stretching vertically", () => {
    const view = readFileSync("components/admin/customer-insights-view.tsx", "utf8");

    assert.match(view, /className="h-\[230px\] w-full"/);
    assert.match(view, /grid grid-cols-1 items-start gap-6/);
    assert.match(view, /Personality archetypes/);
  });
});
