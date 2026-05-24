import type {
  ProductAudience,
  ProductAvailabilityStatus,
  ProductConfidence,
  ProductKind,
  ProductPlatform,
  ProductStatus
} from "@/lib/product-recommendations";
import type { ValidationResult } from "@/lib/product-validation";
import type { ProductCandidateFact } from "@/lib/product-recommendations";
import type { ProductCountryCode } from "@/lib/product-countries";

export type { ProductCountryCode } from "@/lib/product-countries";

// Status / label / platform guards and sets (pure, no side effects)
const productStatuses = new Set<ProductStatus>([
  "approved",
  "ignored",
  "pending_review"
]);
const productPlatforms = new Set<ProductPlatform>(["lazada", "manual", "shopee"]);
const productLabelStatuses = new Set<ProductLabelStatus>([
  "failed",
  "missing",
  "parsed",
  "stale"
]);
const productAvailabilityStatuses = new Set<ProductAvailabilityStatus>([
  "in_stock",
  "out_of_stock",
  "unavailable",
  "unknown"
]);
const productAudiences = new Set<ProductAudience>(["both", "female", "male"]);

export type ProductAffiliateStatus = "active" | "flagged_stale" | "none";
export type ProductLabelStatus = "failed" | "missing" | "parsed" | "stale";
export type ProductValidationCacheStatus = "fresh" | "missing" | "stale";

export type ProductFactSupplementStatus = "active" | "blocked";

export type AdminProductFact = ProductCandidateFact & Readonly<{
  id: string;
  maxAmount: number | null;
  maxUnit: string | null;
  safetyFlags: readonly string[];
  source: string | null;
  sourceText: string | null;
  sourceUrl: string | null;
  supplementStatus: ProductFactSupplementStatus | null;
}>;

export type AdminProductOffer = Readonly<{
  availabilityStatus: ProductAvailabilityStatus;
  commissionRate: number | null;
  currency: string;
  id: string;
  linkType: "affiliate" | "direct";
  network: string | null;
  platform: string | null;
  priceAmount: number | null;
  priority: number;
  status: "active" | "flagged_stale" | "inactive";
  url: string;
}>;

export type AdminProductTranslationStatus = "complete" | "draft" | "missing";

export type AdminProductTranslation = Readonly<{
  description: string | null;
  locale: string;
  status: AdminProductTranslationStatus;
  title: string | null;
  updatedAt: string | null;
}>;

export type AdminProductRow = Readonly<{
  affiliateStatus: ProductAffiliateStatus;
  aiCorrectionNotes: string | null;
  availabilityStatus: ProductAvailabilityStatus;
  availableCountryCodes: ProductCountryCode[];
  brandId: string | null;
  brandName: string | null;
  brandStatus: ProductStatus | null;
  category: string | null;
  currency: string;
  description: string | null;
  descriptionEn: string | null;
  descriptionTh: string | null;
  displayDescription: string | null;
  displayTitle: string;
  facts: AdminProductFact[];
  fdaApprovalNumber: string | null;
  id: string;
  imageUrl: string | null;
  importReviewTaskId: string | null;
  importStatus: string | null;
  labelStatus: ProductLabelStatus;
  manufacturerCountryCodes: ProductCountryCode[];
  status: ProductStatus;
  validation: ValidationResult;
  validationCacheStatus: ProductValidationCacheStatus;
  validationCacheStaleReasons: string[];
  validationLabel: string;
  productAudience: ProductAudience;
  platform: ProductPlatform;
  priceAmount: number | null;
  productImportDuplicateProductIds: string[];
  productImportId: string | null;
  productKind: ProductKind;
  productUrl: string;
  recommendationHistory: {
    averageProductCoveragePercent: number | null;
    averageStackCoveragePercent: number | null;
    chosenCount: number;
    lastRecommendedAt: string | null;
  };
  offers: AdminProductOffer[];
  region: string;
  sourceEvidence: {
    importId: string | null;
    importReviewTaskId: string | null;
    importStatus: string | null;
    sourceUrl: string | null;
  };
  title: string;
  titleEn: string | null;
  titleTh: string | null;
  translations: Record<string, AdminProductTranslation>;
  updatedAt: string;
}>;

export type AdminProductsData = Readonly<{
  databaseAvailable: boolean;
  generatedAt: string;
  platforms: ProductPlatform[];
  rows: AdminProductRow[];
  summary: {
    activeAffiliate: number;
    dirtyData: number;
    ignored: number;
    missingFacts: number;
    missingImage: number;
    pendingReview: number;
    total: number;
    approved: number;
  };
}>;

export type ProductImportRunRow = Readonly<{
  approvedCount: number;
  brandName: string;
  completedAt: string | null;
  failedCount: number;
  id: string;
  notes: string | null;
  requestedAutoApprove: boolean;
  source: string;
  stagedCount: number;
  startedAt: string;
  status: "completed" | "failed" | "running";
  totalProducts: number;
}>;

export function isProductStatus(value: string): value is ProductStatus {
  return productStatuses.has(value as ProductStatus);
}

export function isProductPlatform(value: string): value is ProductPlatform {
  return productPlatforms.has(value as ProductPlatform);
}

export function isProductLabelStatus(value: string): value is ProductLabelStatus {
  return productLabelStatuses.has(value as ProductLabelStatus);
}

export function isProductAvailabilityStatus(
  value: string
): value is ProductAvailabilityStatus {
  return productAvailabilityStatuses.has(value as ProductAvailabilityStatus);
}

export function isProductAudience(value: string): value is ProductAudience {
  return productAudiences.has(value as ProductAudience);
}

export function emptyAdminProductsData(): AdminProductsData {
  return {
    databaseAvailable: false,
    generatedAt: new Date().toISOString(),
    platforms: [],
    rows: [],
    summary: {
      activeAffiliate: 0,
      dirtyData: 0,
      ignored: 0,
      missingFacts: 0,
      missingImage: 0,
      pendingReview: 0,
      total: 0,
      approved: 0
    }
  };
}

// Internal DB row shapes (moved from god file as part of the split)
export type ProductDbRow = Readonly<{
  active_offer_id: string | null;
  active_offer_availability_status: ProductAvailabilityStatus | null;
  active_affiliate_commission_rate: string | number | null;
  active_offer_currency: string | null;
  active_affiliate_priority: string | number | null;
  active_offer_price_amount: string | number | null;
  active_affiliate_type: "affiliate" | "direct" | null;
  active_affiliate_url: string | null;
  offers: unknown;
  affiliate_status: ProductAffiliateStatus;
  availability_status: ProductAvailabilityStatus;
  available_country_codes: string[] | null;
  brand_id: string | null;
  brand_name: string | null;
  brand_status: ProductStatus | null;
  category: string | null;
  currency: string;
  current_version: string | number | null;
  description: string | null;
  description_en: string | null;
  description_th: string | null;
  facts: unknown;
  fda_approval_number: string | null;
  history_average_product_coverage_percent: string | number | null;
  history_average_stack_coverage_percent: string | number | null;
  history_chosen_count: string | number | null;
  history_last_recommended_at: Date | string | null;
  id: string;
  image_url: string | null;
  import_duplicate_product_ids: string[] | null;
  import_id: string | null;
  import_review_task_id: string | null;
  import_status: string | null;
  label_status: ProductLabelStatus;
  manufacturer_country_codes: string[] | null;
  status: ProductStatus;
  platform: ProductPlatform;
  price_amount: string | number | null;
  product_audience: ProductAudience | null;
  product_kind: ProductKind;
  product_data_expires_at: Date | string | null;
  product_url: string;
  validation_checked_at: Date | string | null;
  validation_reasons: string[] | null;
  validation_status: ValidationResult["status"] | null;
  validation_summary: string | null;
  region: string;
  source_snapshot: unknown;
  source_url: string | null;
  title: string;
  title_en: string | null;
  title_th: string | null;
  translations: unknown;
  updated_at: Date | string;
}>;

export type ProductRecommendationDbRow = Readonly<{
  active_offer_id: string | null;
  active_offer_availability_status: ProductAvailabilityStatus | null;
  active_affiliate_commission_rate: string | number | null;
  active_offer_currency: string | null;
  active_affiliate_priority: string | number | null;
  active_offer_price_amount: string | number | null;
  active_affiliate_type: "affiliate" | "direct" | null;
  active_affiliate_url: string | null;
  available_country_codes: string[] | null;
  brand_name: string | null;
  brand_status: ProductStatus | null;
  currency: string;
  description: string | null;
  description_en: string | null;
  description_th: string | null;
  facts: unknown;
  id: string;
  image_url: string | null;
  label_status: ProductLabelStatus;
  manufacturer_country_codes: string[] | null;
  status: ProductStatus;
  platform: ProductPlatform;
  product_audience: ProductAudience | null;
  product_kind: ProductKind;
  product_data_expires_at: Date | string | null;
  product_url: string;
  region: string;
  source_url: string | null;
  title: string;
  title_en: string | null;
  title_th: string | null;
}>;

export type FactDbPayload = Readonly<{
  aliases?: string[] | null;
  amount?: number | string | null;
  confidence?: ProductConfidence | null;
  foodId?: string | null;
  id?: string;
  itemType?: "food" | "nutrient" | "supplement";
  maxAmount?: number | string | null;
  maxUnit?: string | null;
  name?: string;
  normalizedName?: string;
  nutrientId?: string | null;
  servingLabel?: string | null;
  source?: string | null;
  sourceText?: string | null;
  sourceUrl?: string | null;
  supplementId?: string | null;
  supplementAudience?: ProductAudience | null;
  supplementStatus?: ProductFactSupplementStatus | null;
  safetyFlags?: string[] | null;
  unit?: string | null;
}>;
