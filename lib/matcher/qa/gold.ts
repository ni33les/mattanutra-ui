import { qaProduct } from "@/lib/matcher/qa/product";
import type { CatalogSnapshot, MatcherProduct } from "@/lib/matcher/types";

export const QA_GOLD_VERSION = "QA-GOLD-v1";

export const QA_GOLD_PRODUCTS: readonly MatcherProduct[] = [
  qaProduct({
    id: "G-D3-1000",
    facts: [{ amount: 1000, key: "d3" }],
    priceThb: 100
  }),
  qaProduct({
    id: "G-D3-2000",
    facts: [{ amount: 2000, key: "d3" }],
    priceThb: 160
  }),
  qaProduct({
    id: "G-O3-FISH-1000",
    dietary: "fish",
    facts: [{ amount: 1000, key: "omega" }],
    form: "softgel",
    omega: "fish",
    pills: 2,
    priceThb: 300,
    title: "G-O3-FISH-1000 Fish Oil"
  }),
  qaProduct({
    id: "G-O3-ALGAE-500",
    dietary: "algae",
    facts: [{ amount: 500, key: "omega", name: "Algae omega-3" }],
    form: "softgel",
    omega: "algae",
    priceThb: 260,
    title: "G-O3-ALGAE-500 Algae Omega-3"
  }),
  qaProduct({
    id: "G-MAG-100",
    facts: [{ amount: 100, key: "mag" }],
    form: "capsule",
    priceThb: 80
  }),
  qaProduct({
    id: "G-MAG-200",
    facts: [{ amount: 200, key: "mag" }],
    form: "capsule",
    priceThb: 120
  }),
  qaProduct({
    id: "G-B12-250",
    facts: [{ amount: 250, key: "b12" }],
    priceThb: 90
  }),
  qaProduct({
    id: "G-C-500",
    facts: [{ amount: 500, key: "c" }],
    priceThb: 100
  }),
  qaProduct({
    id: "G-BASE-COMBO",
    facts: [
      { amount: 2000, key: "d3" },
      { amount: 200, key: "mag" },
      { amount: 250, key: "b12" },
      { amount: 500, key: "c" }
    ],
    form: "capsule",
    pills: 2,
    priceThb: 350
  }),
  qaProduct({
    id: "G-HIGH-TRAP",
    facts: [
      { amount: 5000, key: "d3" },
      { amount: 600, key: "mag" },
      { amount: 1000, key: "b12" },
      { amount: 1500, key: "c" }
    ],
    priceThb: 50
  }),
  qaProduct({
    id: "G-INCIDENTAL-C",
    facts: [
      { amount: 1, key: "collagen" },
      { amount: 250, key: "c" }
    ],
    form: "capsule",
    priceThb: 70
  }),
  qaProduct({
    audience: "female",
    facts: [
      { amount: 400, key: "folate" },
      { amount: 18, key: "iron" },
      { amount: 150, key: "iodine" },
      { amount: 600, key: "d3" }
    ],
    id: "G-PRECARE",
    pills: 2,
    prenatal: true,
    priceThb: 250,
    title: "G-PRECARE Prenatal"
  }),
  qaProduct({
    id: "G-FOLATE-400",
    facts: [{ amount: 400, key: "folate" }],
    priceThb: 80
  }),
  qaProduct({
    id: "G-CALCIUM-500",
    facts: [{ amount: 500, key: "calcium" }],
    priceThb: 120
  }),
  qaProduct({
    id: "G-B6-10",
    facts: [{ amount: 10, key: "b6" }],
    priceThb: 60
  }),
  qaProduct({
    id: "G-IODINE-150",
    facts: [{ amount: 150, key: "iodine" }],
    priceThb: 70
  }),
  qaProduct({
    id: "G-SELENIUM-100",
    facts: [{ amount: 100, key: "selenium" }],
    priceThb: 75
  }),
  qaProduct({
    id: "G-ZINC-15",
    facts: [{ amount: 15, key: "zinc" }],
    priceThb: 65
  }),
  qaProduct({
    id: "G-IRON-18",
    facts: [{ amount: 18, key: "iron" }],
    priceThb: 70
  }),
  qaProduct({
    id: "G-COQ10-100",
    facts: [{ amount: 100, key: "coq10" }],
    form: "capsule",
    priceThb: 200
  }),
  qaProduct({
    dietary: "any",
    facts: [{ amount: 5, key: "collagen" }],
    form: "powder",
    id: "G-COLLAGEN-5G",
    pills: 1,
    priceThb: 180,
    title: "G-COLLAGEN-5G Collagen Peptides"
  }),
  qaProduct({
    dietary: "plant",
    facts: [{ amount: 5, key: "creatine" }],
    form: "powder",
    id: "G-CREATINE-5G",
    pills: 1,
    priceThb: 150
  }),
  qaProduct({
    facts: [{ amount: 2000, key: "sterols" }],
    form: "sachet",
    id: "G-STEROLS-2000",
    pills: 1,
    priceThb: 200
  }),
  qaProduct({
    facts: [{ amount: 100, key: "k2", name: "Vitamin K2" }],
    form: "capsule",
    id: "G-K2-MK7-100",
    priceThb: 130,
    title: "G-K2-MK7-100 Menaquinone-7"
  }),
  qaProduct({
    facts: [{ amount: 2000, key: "d3" }],
    id: "G-OOS-D3-2000",
    priceThb: 10,
    stock: "unavailable"
  }),
  qaProduct({
    countries: ["US"],
    currency: "USD",
    facts: [{ amount: 2000, key: "d3" }],
    id: "G-FOREIGN-D3",
    priceThb: 1,
    sellerId: "seller_us",
    sellerName: "US"
  })
];

export const QA_GOLD_CATALOG: CatalogSnapshot = {
  availabilityAsOf: "2026-01-01T00:00:00.000Z",
  catalogueVersion: QA_GOLD_VERSION,
  products: QA_GOLD_PRODUCTS
};

export function qaGoldById(id: string) {
  return QA_GOLD_PRODUCTS.find((item) => item.productId === id) ?? null;
}

export function qaGoldIds() {
  return QA_GOLD_PRODUCTS.map((item) => item.productId);
}
