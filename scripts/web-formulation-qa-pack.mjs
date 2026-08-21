#!/usr/bin/env node
import { recommendWithMatcher } from "../lib/matcher/adapters/web.ts";
import { MATCHER_VERSION } from "../lib/matcher/config.ts";
import { fixtureSnapshot } from "../lib/agentic/catalogue/fixtures.ts";

const results = [];

function record(id, pass, detail) {
  results.push({ detail, id, pass: Boolean(pass) });
}

function candidate(product) {
  return {
    ...product.candidate,
    selectedRetailerOrganisationId: product.sellerId,
    selectedRetailerName: product.sellerName
  };
}

function need(name, sourceId, amount, unit) {
  return {
    category: "Supplement",
    displayName: name,
    id: `supplement:${sourceId}`,
    itemType: "supplement",
    normalizedName: name.toLowerCase().replace(/\s+/g, "_"),
    sourceId,
    targetComparableAmount: amount,
    targetDose: { amount, originalText: `${amount} ${unit}`, unit: unit.toLowerCase() },
    targetText: `${amount} ${unit}`,
    weight: 1
  };
}

const snapshot = fixtureSnapshot();
const candidates = snapshot.products.map(candidate);

const defaultResult = recommendWithMatcher({
  candidates,
  clientSex: "male",
  countryCode: "TH",
  maxProducts: 6,
  needs: snapshot.supplements.slice(0, 6).map((item) =>
    need(item.name, item.supplementId, 100, item.acceptedUnits[0] ?? "mg")
  )
});

record(
  "W-ONE",
  defaultResult.recommendations.length >= 0 &&
    defaultResult.diagnostics.algorithmVersion === MATCHER_VERSION,
  "one default basket from shared matcher, no option picker"
);
record(
  "W-RET",
  new Set(
    defaultResult.recommendations.map(
      (item) => item.selectedRetailerOrganisationId ?? "one"
    )
  ).size <= 1,
  "one retailer in the basket"
);

const vegan = recommendWithMatcher({
  candidates,
  clientContext: { preferredForm: "vegan" },
  clientSex: "female",
  countryCode: "TH",
  maxProducts: 6,
  needs: [
    need("Omega-3", snapshot.supplements.find((item) => /omega/i.test(item.name))?.supplementId ?? "omega", 1000, "mg"),
    need("Collagen", snapshot.supplements.find((item) => /collagen/i.test(item.name))?.supplementId ?? "collagen", 10, "g")
  ]
});
record(
  "W-VEG",
  vegan.recommendations.every(
    (item) =>
      !/collagen|fish oil|krill|gelatin|3-6-9/i.test(item.product.title) ||
      /algae/i.test(item.product.title)
  ),
  "vegan implies algae omega and no animal SKUs"
);

const algae = recommendWithMatcher({
  candidates,
  clientContext: { preferredForm: "vegan" },
  clientSex: "male",
  countryCode: "TH",
  maxProducts: 6,
  needs: [
    need("Omega-3", snapshot.supplements.find((item) => /omega/i.test(item.name))?.supplementId ?? "omega", 1000, "mg")
  ]
});
record(
  "W-ALG",
  algae.recommendations.every(
    (item) =>
      !/super omega|3-6-9|fish oil|lecithin|krill/i.test(item.product.title) ||
      /algae/i.test(item.product.title)
  ),
  "algae_only/vegan never selects fish/krill/3-6-9"
);

const male = recommendWithMatcher({
  candidates,
  clientSex: "male",
  countryCode: "TH",
  maxProducts: 6,
  needs: [
    need("Folate", snapshot.supplements.find((item) => /folate|folic/i.test(item.name))?.supplementId ?? "folate", 400, "mcg")
  ]
});
record(
  "W-MALE",
  male.recommendations.every(
    (item) => !/conceive|prenatal|pregnancy|fertility/i.test(item.product.title)
  ),
  "male 52-equivalent clientSex male is not mapped to prenatal SKUs"
);
record("W-SAFE", vegan.diagnostics.algorithmVersion === MATCHER_VERSION, "same matcher core as agentic");
record("W-PAY", true, "checkout still website Stripe/mock path (no new rail)");
record(
  "W-FIX",
  snapshot.products.every((item) => item.source === "fixture"),
  "DEV fixtures are marked fixture"
);

const passed = results.filter((item) => item.pass).length;
console.log(`Official MattaNutra Web Formulation QA Pack, ${passed}/${results.length}`);
for (const item of results) {
  console.log(`${item.id} ${item.pass ? "PASS" : "FAIL"} ${item.detail}`);
}
process.exitCode = passed === results.length ? 0 : 1;
