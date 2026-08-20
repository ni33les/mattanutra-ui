import type { ProductCandidate } from "@/lib/product-recommendation-types";

export type CatalogueUnit = "CFU" | "IU" | "g" | "mcg" | "mg" | "ml" | "serving";

export type CatalogueSupplement = Readonly<{
  acceptedUnits: readonly CatalogueUnit[];
  aliases: readonly string[];
  name: string;
  supplementId: string;
  uuid: string;
}>;

export type CatalogueProduct = Readonly<{
  audience: "adult" | "child" | "both";
  candidate: ProductCandidate;
  contributionSupplementIds: readonly string[];
  dailyPills: number;
  dietarySource: "algae" | "any" | "fish" | "plant";
  form: string;
  incompleteCommercialFacts: boolean;
  omegaSource: "algae" | "fish" | "none";
  orderable: boolean;
  productId: string;
  retailerSku: string;
  sellerId: string;
  sellerName: string;
  stockStatus: "backorder" | "in_stock" | "unavailable";
  unitPriceMinor: number;
}>;

export type CatalogueSnapshot = Readonly<{
  availabilityAsOf: string;
  catalogueVersion: string;
  products: readonly CatalogueProduct[];
  supplements: readonly CatalogueSupplement[];
}>;
