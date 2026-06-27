import type { ValidationResult } from "@/lib/product-validation";
import type { ProductStatus } from "@/lib/product-recommendations";

export type ProductMatchingReadinessInput = Readonly<{
  availableCountryCodes: readonly string[];
  brandStatus: ProductStatus | null;
  facts: readonly unknown[];
  imageUrl: string | null;
  labelStatus: string;
  manufacturerCountryCodes: readonly string[];
  status: ProductStatus;
  validation: Pick<
    ValidationResult,
    "matchableFactCount" | "reasons" | "status" | "summary"
  > | null;
}>;

export type ProductMatchingReadinessCheck = Readonly<{
  id:
    | "brand_status"
    | "country_availability"
    | "facts"
    | "image"
    | "product_status"
    | "validation";
  label: string;
  passed: boolean;
  reason: string;
}>;

export type ProductMatchingReadiness = Readonly<{
  checks: ProductMatchingReadinessCheck[];
  primaryReason: string;
  ready: boolean;
}>;

function hasText(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasCompatibleCountryAvailability(
  input: Pick<
    ProductMatchingReadinessInput,
    "availableCountryCodes" | "manufacturerCountryCodes"
  >
) {
  if (input.availableCountryCodes.length < 1) {
    return false;
  }

  if (input.manufacturerCountryCodes.length < 1) {
    return true;
  }

  return input.availableCountryCodes.some((countryCode) =>
    input.manufacturerCountryCodes.includes(countryCode)
  );
}

function productStatusReason(status: ProductStatus) {
  if (status === "approved") {
    return "Product is approved.";
  }

  if (status === "ignored") {
    return "Product is ignored.";
  }

  return "Product is still pending review.";
}

function brandStatusReason(status: ProductStatus | null) {
  if (status === "approved") {
    return "Brand is approved.";
  }

  if (status === "ignored") {
    return "Brand is ignored.";
  }

  return "Brand is still pending review.";
}

export function productMatchingReadiness(
  input: ProductMatchingReadinessInput
): ProductMatchingReadiness {
  const validation = input.validation;
  const matchableFactCount = validation?.matchableFactCount ?? 0;
  const countryAvailabilityReady = hasCompatibleCountryAvailability(input);
  const checks: ProductMatchingReadinessCheck[] = [
    {
      id: "product_status",
      label: "Product",
      passed: input.status === "approved",
      reason: productStatusReason(input.status)
    },
    {
      id: "brand_status",
      label: "Brand",
      passed: input.brandStatus === "approved",
      reason: brandStatusReason(input.brandStatus)
    },
    {
      id: "image",
      label: "Image",
      passed: hasText(input.imageUrl),
      reason: hasText(input.imageUrl)
        ? "Product image is present."
        : "Product image is missing."
    },
    {
      id: "facts",
      label: "Facts",
      passed: input.labelStatus === "parsed" && input.facts.length > 0,
      reason:
        input.labelStatus === "parsed" && input.facts.length > 0
          ? "Product label facts are parsed."
          : "Product label facts are missing or not parsed."
    },
    {
      id: "validation",
      label: "Validation",
      passed: validation?.status === "pass" && matchableFactCount > 0,
      reason:
        validation?.status === "pass"
          ? `${matchableFactCount} usable matched fact${
              matchableFactCount === 1 ? "" : "s"
            }.`
          : validation?.summary ?? "Product validation has not passed."
    },
    {
      id: "country_availability",
      label: "Markets",
      passed: countryAvailabilityReady,
      reason: countryAvailabilityReady
        ? "Product has an active matching market."
        : "Product is not available in an active manufacturer market."
    }
  ];
  const failed = checks.find((check) => !check.passed);

  return {
    checks,
    primaryReason: failed?.reason ?? "Ready for matching.",
    ready: !failed
  };
}
