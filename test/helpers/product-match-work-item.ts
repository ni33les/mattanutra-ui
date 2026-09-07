import type { ProductCandidate, ProductRecommendationNeed } from "../../lib/product-recommendation-types.ts";
import type { ProductMatchWorkItem } from "../../workers/product-matcher-pool.ts";

function need(
  overrides: Partial<ProductRecommendationNeed> &
    Pick<ProductRecommendationNeed, "id" | "displayName" | "normalizedName" | "sourceId">
): ProductRecommendationNeed {
  return {
    aliasKeys: overrides.aliasKeys ?? [overrides.normalizedName],
    category: overrides.itemType === "food" ? "Food" : "Foundation",
    displayName: overrides.displayName,
    id: overrides.id,
    itemType: overrides.itemType ?? "supplement",
    normalizedName: overrides.normalizedName,
    sourceId: overrides.sourceId,
    targetComparableAmount: overrides.targetComparableAmount ?? null,
    targetDose: overrides.targetDose ?? null,
    targetText: overrides.targetText ?? null,
    weight: overrides.weight ?? 1
  };
}

function candidate(input: Readonly<{
  automatedSafetyPassed?: boolean;
  availableCountryCodes?: string[];
  brandName?: string;
  brandStatus?: ProductCandidate["brandStatus"];
  facts: ReadonlyArray<{
    amount: number | null;
    name: string;
    normalizedName: string;
    unit: string | null;
  }>;
  id: string;
  productAudience?: "both" | "female" | "male";
  retailSellableProductId?: string | null;
  status?: ProductCandidate["status"];
  title: string;
  validationStatus?: "failed" | "pass";
}>): ProductCandidate {
  return {
    automatedSafetyPassed: input.automatedSafetyPassed ?? true,
    availabilityStatus: "in_stock",
    availableCountryCodes: input.availableCountryCodes ?? ["TH"],
    brandName: input.brandName ?? "Delight",
    brandStatus: input.brandStatus ?? "approved",
    currency: "THB",
    facts: input.facts.map((fact) => ({
      amount: fact.amount,
      comparableAmount: fact.amount,
      confidence: "high" as const,
      itemType: "supplement" as const,
      name: fact.name,
      normalizedName: fact.normalizedName,
      unit: fact.unit
    })),
    id: input.id,
    labelStatus: "parsed",
    platform: "manual",
    priceAmount: 350,
    productAudience: input.productAudience ?? "both",
    productUrl: `https://example.com/${input.id}`,
    region: "TH",
    retailAvailabilityStatus: "available_now",
    retailSellableProductId: input.retailSellableProductId ?? `sellable-${input.id}`,
    selectedRetailerName: "Delight Pharmacy",
    selectedRetailerOrganisationId: "delight",
    status: input.status ?? "approved",
    title: input.title,
    validation: {
      checkedAt: new Date(0).toISOString(),
      matchableFactCount: input.facts.length,
      reasons: [],
      status: input.validationStatus ?? "pass",
      summary: ""
    }
  };
}

function dosedNeed(
  input: Readonly<{
    amount: number;
    displayName: string;
    id: string;
    normalizedName: string;
    unit: "mcg" | "mg";
    weight?: number;
  }>
): ProductRecommendationNeed {
  return need({
    displayName: input.displayName,
    id: input.id,
    normalizedName: input.normalizedName,
    sourceId: input.normalizedName,
    targetComparableAmount: input.amount,
    targetDose: {
      amount: input.amount,
      originalText: `${input.amount} ${input.unit}/day`,
      unit: input.unit
    },
    targetText: `${input.amount} ${input.unit}/day`,
    weight: input.weight ?? 1
  });
}


export function productMatchWorkItem() {
const names=["Vitamin C","Magnesium","Zinc","Calcium","Vitamin B12","Vitamin B6","Vitamin D3","Iron"];
const needs=names.map((name,i)=>dosedNeed({amount:i===6?25:100,displayName:name,id:name,normalizedName:name.toLowerCase().replaceAll(" ","_"),unit:i===6?"mcg":"mg"}));
const candidates=Array.from({length:240},(_,i)=>candidate({id:"cpu-"+i,title:"Supplement "+i,facts:[i%8,(i+3)%8].map(n=>({amount:n===6?25:100,name:names[n],normalizedName:needs[n].normalizedName,unit:n===6?"mcg":"mg"}))}));
const item: ProductMatchWorkItem={historicalReferenceFixture:true,taskType:"generate_product_recommendations",taskId:"cpu-probe",planId:"cpu-probe",needs,clientContext:{ageYears:38,lifestage:"adult"},clientSex:"male",countryCode:"TH",stackPreference:"balanced",retailerCandidateSets:[{candidates,organisationId:"delight",organisationName:"Delight",currency:"THB",dispatchCity:"Bangkok",etaDate:null,productCount:candidates.length,subtotalAmount:0}]};
return item;
}
