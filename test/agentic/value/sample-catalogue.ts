import { publicProductId, publicSupplementId } from "../../../lib/agentic/contract/ids.ts";
import type {
  CatalogueProduct,
  CatalogueSnapshot,
  CatalogueSupplement
} from "../../../lib/agentic/catalogue/types.ts";

export const SAMPLE_CREATINE_UUID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
export const SAMPLE_MAG_UUID = "33333333-3333-3333-3333-333333333333";
export const SAMPLE_D3_UUID = "11111111-1111-1111-1111-111111111111";

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

export function sampleRetailProduct(input: Readonly<{
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

export function sampleValueSnapshot(): CatalogueSnapshot {
  const creatine = supplement(SAMPLE_CREATINE_UUID, "Creatine", ["Creatine monohydrate"], ["g", "mg"]);
  const magnesium = supplement(SAMPLE_MAG_UUID, "Magnesium", ["Mg"], ["mg", "g"]);
  const d3 = supplement(SAMPLE_D3_UUID, "Vitamin D3", ["Vitamin D", "D3"], ["IU", "mcg"]);

  return {
    availabilityAsOf: "2026-08-31T00:00:00.000Z",
    catalogueVersion: "retail-TH-test",
    products: [
      sampleRetailProduct({
        amount: 3,
        form: "powder",
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
        name: "Creatine",
        servingLabel: "1 scoop; 90 servings per container",
        supplementId: creatine.supplementId,
        title: "Creatine Monohydrate",
        unit: "g",
        unitPriceMinor: 39000
      }),
      sampleRetailProduct({
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
      sampleRetailProduct({
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
      sampleRetailProduct({
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
