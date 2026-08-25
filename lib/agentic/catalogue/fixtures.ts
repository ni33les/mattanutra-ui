import { publicProductId, publicSupplementId } from "@/lib/agentic/contract/ids";
import type {
  CatalogueProduct,
  CatalogueSnapshot,
  CatalogueSupplement
} from "@/lib/agentic/catalogue/types";
import type { ProductCandidate } from "@/lib/product-recommendation-types";
import { ACTIVE_RETAILER_ID, ACTIVE_RETAILER_NAME } from "@/lib/agentic/catalogue/market";

const SUPPLEMENT_UUIDS = {
  b12: "44444444-4444-4444-4444-444444444444",
  b6: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
  c: "55555555-5555-5555-5555-555555555555",
  calcium: "dddddddd-dddd-dddd-dddd-dddddddddddd",
  collagen: "99999999-9999-9999-9999-999999999999",
  coq10: "88888888-8888-8888-8888-888888888888",
  creatine: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  d3: "11111111-1111-1111-1111-111111111111",
  folate: "cccccccc-cccc-cccc-cccc-cccccccccccc",
  iodine: "a1a1a1a1-a1a1-41a1-a1a1-a1a1a1a1a1a1",
  iron: "77777777-7777-7777-7777-777777777777",
  k2: "f1f1f1f1-f1f1-41f1-a1f1-f1f1f1f1f1f1",
  magnesium: "33333333-3333-3333-3333-333333333333",
  omega3: "22222222-2222-2222-2222-222222222222",
  selenium: "a2a2a2a2-a2a2-42a2-a2a2-a2a2a2a2a2a2",
  sterols: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  zinc: "66666666-6666-6666-6666-666666666666"
} as const;

function supplement(
  key: keyof typeof SUPPLEMENT_UUIDS,
  name: string,
  aliases: readonly string[],
  acceptedUnits: CatalogueSupplement["acceptedUnits"]
): CatalogueSupplement {
  const uuid = SUPPLEMENT_UUIDS[key];

  return {
    acceptedUnits,
    aliases,
    name,
    supplementId: publicSupplementId(uuid),
    uuid
  };
}

export const FIXTURE_SUPPLEMENTS: readonly CatalogueSupplement[] = [
  supplement("d3", "Vitamin D3", ["Vitamin D", "D3", "Cholecalciferol", "Vit D3", "Colecalciferol"], ["IU", "mcg", "mg"]),
  supplement("omega3", "Omega-3", ["Fish oil", "EPA", "DHA", "Algae oil", "Algae omega-3", "Algal omega-3", "Algae Omega-3", "Omega 3", "n-3"], ["mg", "g"]),
  supplement("magnesium", "Magnesium", ["Mg", "Magnesium glycinate", "Magnesium citrate"], ["mg", "g"]),
  supplement("b12", "Vitamin B12", ["B12", "Cobalamin", "Methylcobalamin", "Cyanocobalamin"], ["mcg", "mg"]),
  supplement("c", "Vitamin C", ["Ascorbic acid", "Ascorbate"], ["mg", "g"]),
  supplement("zinc", "Zinc", ["Zinc picolinate", "Zinc citrate"], ["mg"]),
  supplement("iron", "Iron", ["Ferrous", "Ferrous sulfate", "Ferrous sulphate"], ["mg"]),
  supplement("coq10", "CoQ10", ["Ubiquinone", "Ubiquinol", "Coenzyme Q10"], ["mg"]),
  supplement("collagen", "Collagen", ["Collagen peptides", "Hydrolyzed collagen"], ["g", "mg"]),
  supplement("sterols", "Plant sterols", ["Phytosterols", "Plant sterol", "Plant stanols", "Stanols", "Plant sterols / stanols", "Sterols"], ["mg", "g"]),
  supplement("creatine", "Creatine", ["Creatine monohydrate", "Creapure"], ["g", "mg"]),
  supplement("folate", "Folate", ["Folic acid", "Vitamin B9", "Folacin", "Methylfolate"], ["mcg", "mg"]),
  supplement("calcium", "Calcium", ["Calcium citrate", "Calcium carbonate"], ["mg", "g"]),
  supplement("b6", "Vitamin B6", ["B6", "Pyridoxine"], ["mg", "mcg"]),
  supplement("iodine", "Iodine", ["Potassium iodide", "Iodide"], ["mcg"]),
  supplement("selenium", "Selenium", ["Selenomethionine"], ["mcg"]),
  supplement(
    "k2",
    "Vitamin K2",
    ["K2", "MK-7", "MK7", "Menaquinone-7", "Menaquinone", "Vitamin K-2"],
    ["mcg", "mg"]
  )
];

function candidate(input: Readonly<{
  amount: number;
  comparableAmount: number;
  id: string;
  name: string;
  normalizedName: string;
  priceAmount: number;
  servingLabel: string;
  title: string;
  unit: string;
  availabilityStatus?: ProductCandidate["availabilityStatus"];
  audience?: ProductCandidate["productAudience"];
}>): ProductCandidate {
  return {
    automatedSafetyPassed: true,
    availabilityStatus: input.availabilityStatus ?? "in_stock",
    availableCountryCodes: ["TH"],
    brandStatus: "approved",
    currency: "THB",
    facts: [
      {
        amount: input.amount,
        comparableAmount: input.comparableAmount,
        confidence: "high",
        itemType: "supplement",
        name: input.name,
        normalizedName: input.normalizedName,
        servingLabel: input.servingLabel,
        supplementAudience: "both",
        unit: input.unit
      }
    ],
    id: input.id,
    imageUrl: `https://catalogue.local/${input.id}.jpg`,
    labelStatus: "parsed",
    platform: "wholesale_pharmacy_import",
    priceAmount: input.priceAmount,
    productAudience: input.audience ?? "both",
    productUrl: `https://catalogue.local/${input.id}`,
    region: "TH",
    retailAvailabilityStatus:
      input.availabilityStatus === "out_of_stock" ? "unavailable" : "available_now",
    status: "approved",
    title: input.title,
    unitPriceAmount: input.priceAmount
  };
}

function product(input: Readonly<{
  amount: number;
  comparableAmount: number;
  dailyPills: number;
  dietarySource: CatalogueProduct["dietarySource"];
  form: string;
  id: string;
  name: string;
  normalizedName: string;
  omegaSource: CatalogueProduct["omegaSource"];
  priceMinor: number;
  sku: string;
  supplementKey: keyof typeof SUPPLEMENT_UUIDS;
  title: string;
  unit: string;
  audience?: CatalogueProduct["audience"];
  orderable?: boolean;
  stockStatus?: CatalogueProduct["stockStatus"];
}>): CatalogueProduct {
  const uuid = input.id;
  const supplementId = publicSupplementId(SUPPLEMENT_UUIDS[input.supplementKey]);

  return {
    audience: input.audience ?? "adult",
    candidate: candidate({
      amount: input.amount,
      comparableAmount: input.comparableAmount,
      id: uuid,
      name: input.name,
      normalizedName: input.normalizedName,
      priceAmount: input.priceMinor / 100,
      servingLabel: `${input.dailyPills} ${input.form}/day`,
      title: input.title,
      unit: input.unit,
      audience: input.audience === "child" ? "both" : "both",
      availabilityStatus: input.stockStatus === "unavailable" ? "out_of_stock" : "in_stock"
    }),
    contributionSupplementIds: [supplementId],
    dailyPills: input.dailyPills,
    dietarySource: input.dietarySource,
    form: input.form,
    incompleteCommercialFacts: false,
    omegaSource: input.omegaSource,
    orderable: input.orderable ?? true,
    productId: publicProductId(uuid),
    retailerSku: input.sku,
    sellerId: ACTIVE_RETAILER_ID,
    sellerName: ACTIVE_RETAILER_NAME,
    source: "fixture",
    stockStatus: input.stockStatus ?? "in_stock",
    unitPriceMinor: input.priceMinor
  };
}

export function recognisedSupplementNames() {
  const names = new Set<string>();

  for (const item of FIXTURE_SUPPLEMENTS) {
    names.add(item.name);
    for (const alias of item.aliases) {
      names.add(alias);
    }
  }

  return [...names].sort((left, right) => left.localeCompare(right));
}

const PLAN_COPY_ALIASES = new Set([
  "Algae omega-3",
  "Folic acid",
  "MK-7",
  "Menaquinone-7",
  "Vitamin B9"
]);

export function recognisedNamesForPlanCopy() {
  const names: string[] = [];

  for (const item of FIXTURE_SUPPLEMENTS) {
    if (!names.includes(item.name)) {
      names.push(item.name);
    }

    for (const alias of item.aliases) {
      if (PLAN_COPY_ALIASES.has(alias) && !names.includes(alias)) {
        names.push(alias);
      }
    }
  }

  return names;
}

export const FIXTURE_PRODUCTS: readonly CatalogueProduct[] = [
  product({
    amount: 2000,
    comparableAmount: 50,
    dailyPills: 1,
    dietarySource: "any",
    form: "softgel",
    id: "b1111111-1111-1111-1111-111111111111",
    name: "Vitamin D3",
    normalizedName: "vitamin_d3",
    omegaSource: "none",
    priceMinor: 39000,
    sku: "TH-D3-2000",
    supplementKey: "d3",
    title: "Vitamin D3 2000 IU",
    unit: "IU"
  }),
  product({
    amount: 1000,
    comparableAmount: 1_000_000,
    dailyPills: 1,
    dietarySource: "fish",
    form: "softgel",
    id: "b2222222-2222-2222-2222-222222222222",
    name: "Omega-3",
    normalizedName: "omega_3",
    omegaSource: "fish",
    priceMinor: 89000,
    sku: "TH-O3-FISH",
    supplementKey: "omega3",
    title: "Omega-3 Fish Oil 1000 mg",
    unit: "mg"
  }),
  product({
    amount: 1000,
    comparableAmount: 1_000_000,
    dailyPills: 2,
    dietarySource: "algae",
    form: "capsule",
    id: "b2222222-2222-2222-2222-222222222223",
    name: "Omega-3",
    normalizedName: "omega_3",
    omegaSource: "algae",
    priceMinor: 129000,
    sku: "TH-O3-ALGAE",
    supplementKey: "omega3",
    title: "Algae Omega-3 1000 mg",
    unit: "mg"
  }),
  product({
    amount: 300,
    comparableAmount: 300_000,
    dailyPills: 1,
    dietarySource: "any",
    form: "capsule",
    id: "b3333333-3333-3333-3333-333333333333",
    name: "Magnesium",
    normalizedName: "magnesium",
    omegaSource: "none",
    priceMinor: 49000,
    sku: "TH-MG-300",
    supplementKey: "magnesium",
    title: "Magnesium Glycinate 300 mg",
    unit: "mg"
  }),
  product({
    amount: 1000,
    comparableAmount: 1000,
    dailyPills: 1,
    dietarySource: "any",
    form: "tablet",
    id: "b4444444-4444-4444-4444-444444444444",
    name: "Vitamin B12",
    normalizedName: "vitamin_b12",
    omegaSource: "none",
    priceMinor: 29000,
    sku: "TH-B12-1000",
    supplementKey: "b12",
    title: "Vitamin B12 1000 mcg",
    unit: "mcg"
  }),
  product({
    amount: 1000,
    comparableAmount: 1_000_000,
    dailyPills: 1,
    dietarySource: "plant",
    form: "tablet",
    id: "b5555555-5555-5555-5555-555555555555",
    name: "Vitamin C",
    normalizedName: "vitamin_c",
    omegaSource: "none",
    priceMinor: 25000,
    sku: "TH-C-1000",
    supplementKey: "c",
    title: "Vitamin C 1000 mg",
    unit: "mg"
  }),
  product({
    amount: 25,
    comparableAmount: 25_000,
    dailyPills: 1,
    dietarySource: "any",
    form: "capsule",
    id: "b6666666-6666-6666-6666-666666666666",
    name: "Zinc",
    normalizedName: "zinc",
    omegaSource: "none",
    priceMinor: 22000,
    sku: "TH-ZN-25",
    supplementKey: "zinc",
    title: "Zinc 25 mg",
    unit: "mg"
  }),
  product({
    amount: 10,
    comparableAmount: 10_000,
    dailyPills: 1,
    dietarySource: "any",
    form: "tablet",
    id: "b7777777-7777-7777-7777-777777777777",
    name: "Iron",
    normalizedName: "iron",
    omegaSource: "none",
    priceMinor: 21000,
    sku: "TH-FE-10",
    supplementKey: "iron",
    title: "Iron 10 mg",
    unit: "mg"
  }),
  product({
    amount: 100,
    comparableAmount: 100_000,
    dailyPills: 1,
    dietarySource: "any",
    form: "capsule",
    id: "b8888888-8888-8888-8888-888888888888",
    name: "CoQ10",
    normalizedName: "coq10",
    omegaSource: "none",
    priceMinor: 79000,
    sku: "TH-Q10-100",
    supplementKey: "coq10",
    title: "CoQ10 100 mg",
    unit: "mg"
  }),
  product({
    amount: 10,
    comparableAmount: 10_000_000,
    dailyPills: 2,
    dietarySource: "any",
    form: "powder",
    id: "b9999999-9999-9999-9999-999999999999",
    name: "Collagen",
    normalizedName: "collagen",
    omegaSource: "none",
    priceMinor: 99000,
    sku: "TH-COL-10",
    supplementKey: "collagen",
    title: "Collagen Peptides 10 g",
    unit: "g"
  }),
  product({
    amount: 800,
    comparableAmount: 800_000,
    dailyPills: 1,
    dietarySource: "plant",
    form: "tablet",
    id: "baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    name: "Plant sterols",
    normalizedName: "plant_sterols",
    omegaSource: "none",
    priceMinor: 69000,
    sku: "TH-PS-800",
    supplementKey: "sterols",
    title: "Plant Sterols 800 mg",
    unit: "mg"
  }),
  product({
    amount: 2000,
    comparableAmount: 50,
    dailyPills: 1,
    dietarySource: "any",
    form: "softgel",
    id: "b1111111-1111-1111-1111-111111111112",
    name: "Vitamin D3",
    normalizedName: "vitamin_d3",
    omegaSource: "none",
    orderable: false,
    priceMinor: 15000,
    sku: "SG-D3-ONLY",
    stockStatus: "unavailable",
    supplementKey: "d3",
    title: "Singapore-only D3",
    unit: "IU"
  }),
  product({
    amount: 5,
    comparableAmount: 5_000_000,
    dailyPills: 1,
    dietarySource: "any",
    form: "powder",
    id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    name: "Creatine",
    normalizedName: "creatine",
    omegaSource: "none",
    priceMinor: 59000,
    sku: "TH-CRE-5",
    supplementKey: "creatine",
    title: "Creatine Monohydrate 5 g",
    unit: "g"
  }),
  product({
    amount: 400,
    comparableAmount: 400,
    dailyPills: 1,
    dietarySource: "any",
    form: "tablet",
    id: "cccccccc-cccc-4ccc-cccc-cccccccccccc",
    name: "Folate",
    normalizedName: "folate",
    omegaSource: "none",
    priceMinor: 19000,
    sku: "TH-FOL-400",
    supplementKey: "folate",
    title: "Folate 400 mcg",
    unit: "mcg"
  }),
  product({
    amount: 600,
    comparableAmount: 600_000,
    dailyPills: 1,
    dietarySource: "any",
    form: "tablet",
    id: "dddddddd-dddd-4ddd-dddd-dddddddddddd",
    name: "Calcium",
    normalizedName: "calcium",
    omegaSource: "none",
    priceMinor: 27000,
    sku: "TH-CA-600",
    supplementKey: "calcium",
    title: "Calcium Citrate 600 mg",
    unit: "mg"
  }),
  product({
    amount: 10,
    comparableAmount: 10_000,
    dailyPills: 1,
    dietarySource: "any",
    form: "tablet",
    id: "eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee",
    name: "Vitamin B6",
    normalizedName: "vitamin_b6",
    omegaSource: "none",
    priceMinor: 18000,
    sku: "TH-B6-10",
    supplementKey: "b6",
    title: "Vitamin B6 10 mg",
    unit: "mg"
  }),
  product({
    amount: 150,
    comparableAmount: 150,
    dailyPills: 1,
    dietarySource: "any",
    form: "tablet",
    id: "a1a1a1a1-a1a1-41a1-a1a1-a1a1a1a1a1a1",
    name: "Iodine",
    normalizedName: "iodine",
    omegaSource: "none",
    priceMinor: 16000,
    sku: "TH-IOD-150",
    supplementKey: "iodine",
    title: "Iodine 150 mcg",
    unit: "mcg"
  }),
  product({
    amount: 55,
    comparableAmount: 55,
    dailyPills: 1,
    dietarySource: "any",
    form: "capsule",
    id: "a2a2a2a2-a2a2-42a2-a2a2-a2a2a2a2a2a2",
    name: "Selenium",
    normalizedName: "selenium",
    omegaSource: "none",
    priceMinor: 17000,
    sku: "TH-SE-55",
    supplementKey: "selenium",
    title: "Selenium 55 mcg",
    unit: "mcg"
  })
];

export function fixtureSnapshot(now = "2026-08-20T00:00:00.000Z"): CatalogueSnapshot {
  return {
    availabilityAsOf: now,
    catalogueVersion: "dev-3.0.0",
    products: FIXTURE_PRODUCTS.filter((item) => item.stockStatus !== "unavailable" || item.orderable),
    supplements: FIXTURE_SUPPLEMENTS
  };
}

export function fixtureSupplementById(supplementId: string) {
  return FIXTURE_SUPPLEMENTS.find((item) => item.supplementId === supplementId) ?? null;
}
