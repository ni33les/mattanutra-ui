import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { publicProductId, publicSupplementId } from "../../../lib/agentic/contract/ids.ts";
import { catalogueSnapshotId } from "../../../lib/agentic/catalogue/freeze.ts";
import type {
  CatalogueProduct,
  CatalogueSnapshot,
  CatalogueSupplement
} from "../../../lib/agentic/catalogue/types.ts";
import { MATCHER_VERSION } from "../../../lib/matcher/config.ts";
import { canonicalHash, canonicalJson } from "../../../lib/agentic/value/canonical.ts";
import { valueCatalogueFingerprint } from "../../../lib/agentic/value/fingerprint.ts";
import {
  freezeLiveThailandCatalogue,
  isUsableLiveFreeze
} from "../../../lib/agentic/value/freeze.ts";
import { servingsPerPackFromProduct } from "../../../lib/agentic/value/pack-facts.ts";
import { resolveValueRoles } from "../../../lib/agentic/value/roles.ts";
import { matchPlan } from "../../../lib/agentic/plan/matching.ts";
import type { CanonicalPlanState } from "../../../lib/agentic/plan/types.ts";
import { VALUE_PACK_VERSION, VALUE_ROLE_REQUEST } from "./pack-scenario.ts";

const CREATINE_UUID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const MAG_UUID = "33333333-3333-3333-3333-333333333333";
const D3_UUID = "11111111-1111-1111-1111-111111111111";

function supplement(
  uuid: string,
  name: string,
  aliases: readonly string[],
  acceptedUnits: CatalogueSupplement["acceptedUnits"]
): CatalogueSupplement {
  return {
    acceptedUnits,
    aliases,
    name,
    supplementId: publicSupplementId(uuid),
    uuid
  };
}

function retailProduct(input: Readonly<{
  amount: number;
  extraFacts?: CatalogueProduct["candidate"]["facts"];
  form: string;
  id: string;
  name: string;
  servingLabel: string;
  source?: CatalogueProduct["source"];
  supplementId: string;
  title: string;
  unit: string;
  unitPriceMinor: number;
}>): CatalogueProduct {
  const fact = {
    amount: input.amount,
    comparableAmount: input.amount,
    confidence: "high" as const,
    itemType: "supplement" as const,
    name: input.name,
    normalizedName: input.name.toLowerCase(),
    servingLabel: input.servingLabel,
    supplementId: input.supplementId,
    unit: input.unit
  };

  return {
    audience: "adult",
    candidate: {
      automatedSafetyPassed: true,
      availabilityStatus: "in_stock",
      currency: "THB",
      facts: [fact, ...(input.extraFacts ?? [])],
      id: input.id,
      labelStatus: "parsed",
      platform: "manual",
      productUrl: "https://example.test/p",
      region: "TH",
      status: "approved",
      title: input.title
    },
    contributionSupplementIds: [input.supplementId],
    dailyPills: input.form === "powder" ? 0 : 1,
    dietarySource: "any",
    form: input.form,
    incompleteCommercialFacts: false,
    omegaSource: "none",
    orderable: true,
    productId: publicProductId(input.id),
    retailerSku: input.id,
    sellerId: "retailer_th_delight",
    sellerName: "Thailand retailer",
    source: input.source ?? "retail",
    stockStatus: "in_stock",
    unitPriceMinor: input.unitPriceMinor
  };
}

function sampleSnapshot(): CatalogueSnapshot {
  const creatine = supplement(CREATINE_UUID, "Creatine", ["Creatine monohydrate"], ["g", "mg"]);
  const magnesium = supplement(MAG_UUID, "Magnesium", ["Mg"], ["mg", "g"]);
  const d3 = supplement(D3_UUID, "Vitamin D3", ["Vitamin D", "D3"], ["IU", "mcg"]);

  return {
    availabilityAsOf: "2026-08-31T00:00:00.000Z",
    catalogueVersion: "retail-TH-test",
    products: [
      retailProduct({
        amount: 3,
        form: "powder",
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
        name: "Creatine",
        servingLabel: "1 scoop",
        supplementId: creatine.supplementId,
        title: "Creatine Monohydrate",
        unit: "g",
        unitPriceMinor: 39000
      }),
      retailProduct({
        amount: 150,
        form: "capsule",
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2",
        name: "Magnesium",
        servingLabel: "1 capsule; 90 capsules per bottle",
        supplementId: magnesium.supplementId,
        title: "Magnesium Glycinate",
        unit: "mg",
        unitPriceMinor: 25000
      }),
      retailProduct({
        amount: 1000,
        form: "softgel",
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3",
        name: "Vitamin D3",
        servingLabel: "1 softgel",
        supplementId: d3.supplementId,
        title: "Vitamin D3 1000 IU",
        unit: "IU",
        unitPriceMinor: 12000
      }),
      retailProduct({
        amount: 1000,
        extraFacts: [
          {
            amount: 500,
            comparableAmount: 500,
            confidence: "moderate",
            itemType: "supplement",
            name: "Calcium",
            normalizedName: "calcium",
            servingLabel: "2 tablets",
            unit: "mg"
          }
        ],
        form: "tablet",
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4",
        name: "Vitamin D3",
        servingLabel: "2 tablets",
        supplementId: d3.supplementId,
        title: "Joint Mobility Calcium D3",
        unit: "IU",
        unitPriceMinor: 45000
      })
    ],
    supplements: [creatine, magnesium, d3]
  };
}

function creatineState(supplementId: string): CanonicalPlanState {
  return {
    acceptedGaps: [],
    conditionCodes: [],
    currency: "THB",
    currentSupplements: [],
    destinationCountry: "TH",
    leftovers: [],
    locale: "en",
    medicationCodes: [],
    optimization: "lowest_cost",
    pinnedOptionId: null,
    profile: { ageYears: 35, lifeStage: "adult", sex: "female" },
    requirements: {},
    safetyAcknowledgement: null,
    targets: [
      {
        amount: VALUE_ROLE_REQUEST.creatine.amount,
        name: VALUE_ROLE_REQUEST.creatine.name,
        supplementId,
        unit: VALUE_ROLE_REQUEST.creatine.unit
      }
    ]
  };
}

describe("Slice 0 value harness", () => {
  it("fingerprints include nutrient facts, form, pack servings and exclude fixtures", () => {
    const snapshot = sampleSnapshot();
    const withFixture: CatalogueSnapshot = {
      ...snapshot,
      products: [
        ...snapshot.products,
        retailProduct({
          amount: 3,
          form: "powder",
          id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa9",
          name: "Creatine",
          servingLabel: "1 scoop",
          source: "fixture",
          supplementId: snapshot.supplements[0].supplementId,
          title: "Fixture Creatine",
          unit: "g",
          unitPriceMinor: 1
        })
      ]
    };

    const left = valueCatalogueFingerprint(snapshot);
    const right = valueCatalogueFingerprint(snapshot);
    assert.equal(left, right);

    const mutatedFacts: CatalogueSnapshot = {
      ...snapshot,
      products: snapshot.products.map((item, index) =>
        index === 0
          ? {
              ...item,
              candidate: {
                ...item.candidate,
                facts: item.candidate.facts.map((fact) => ({ ...fact, amount: (fact.amount ?? 0) + 1 }))
              }
            }
          : item
      )
    };

    assert.notEqual(valueCatalogueFingerprint(mutatedFacts), left);
    assert.notEqual(catalogueSnapshotId(mutatedFacts), catalogueSnapshotId(snapshot));
    assert.notEqual(
      valueCatalogueFingerprint(withFixture),
      valueCatalogueFingerprint({
        ...withFixture,
        products: withFixture.products.filter((item) => item.source !== "fixture")
      })
    );
  });

  it("does not invent pack servings from a product title", () => {
    const snapshot = sampleSnapshot();
    const titled = retailProduct({
      amount: 150,
      form: "capsule",
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5",
      name: "Magnesium",
      servingLabel: "1 capsule",
      supplementId: snapshot.supplements[1].supplementId,
      title: "Magnesium 90'S",
      unit: "mg",
      unitPriceMinor: 10000
    });

    assert.equal(servingsPerPackFromProduct(titled), null);
    assert.equal(servingsPerPackFromProduct(snapshot.products[1]), 90);
  });

  it("resolves live-shaped retail roles without fixture SKUs", () => {
    const snapshot = sampleSnapshot();
    const roles = resolveValueRoles(snapshot, VALUE_ROLE_REQUEST);

    assert.equal(roles.directCreatine.status, "resolved");
    assert.equal(roles.directMagnesium.status, "resolved");
    assert.equal(roles.dedicatedD3.status, "resolved");
    assert.equal(roles.collateralD3.status, "resolved");
    assert.equal(roles.longSupplyPack.status, "resolved");
    assert.equal(roles.baselineBasket.status, "resolved");
    assert.equal(roles.directCreatine.source, "retail");
    assert.notEqual(roles.dedicatedD3.productId, roles.collateralD3.productId);
  });

  it("canonical comparison is byte-identical twice and fails when a significant field changes", () => {
    const snapshot = sampleSnapshot();
    const creatine = snapshot.supplements[0];
    const first = matchPlan({ snapshot, state: creatineState(creatine.supplementId) });
    const second = matchPlan({ snapshot, state: creatineState(creatine.supplementId) });
    const document = {
      matcherVersion: MATCHER_VERSION,
      packVersion: VALUE_PACK_VERSION,
      productIds: first.selected?.basket.map((item) => item.productId) ?? [],
      status: first.selected ? "ready" : "empty"
    };

    assert.equal(canonicalHash(document), canonicalHash({
      matcherVersion: MATCHER_VERSION,
      packVersion: VALUE_PACK_VERSION,
      productIds: second.selected?.basket.map((item) => item.productId) ?? [],
      status: second.selected ? "ready" : "empty"
    }));
    assert.notEqual(
      canonicalJson(document),
      canonicalJson({ ...document, productIds: ["prd_changed"] })
    );
  });

  it("freezes the live Thailand catalogue without fixtures when DEV retail is available", async () => {
    const first = await freezeLiveThailandCatalogue("TH");
    const second = await freezeLiveThailandCatalogue("TH");

    if (!isUsableLiveFreeze(first)) {
      assert.equal(first.snapshot.products.some((item) => item.source === "fixture"), false);
      return;
    }

    assert.equal(first.fingerprint, second.fingerprint);
    assert.equal(first.candidateSetHash, second.candidateSetHash);
    assert.equal(first.snapshot.products.some((item) => item.source === "fixture"), false);
    assert.equal(first.countryCode, "TH");

    const roles = resolveValueRoles(first.snapshot, VALUE_ROLE_REQUEST);
    for (const role of Object.values(roles)) {
      if (role.status === "resolved") {
        assert.equal(role.source, "retail");
        assert.ok(role.productId);
      }
    }
  });
});
