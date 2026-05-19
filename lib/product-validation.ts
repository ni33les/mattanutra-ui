import {
  comparableDoseAmount,
  doseExceedsLimit,
  normalizeDoseUnit,
  parseDoseLimit
} from "@/lib/dose-conversion";
import {
  normalizeProductFactKey,
  normalizeProductFactName,
  productFactLooksLikeConcentration
} from "@/lib/product-recommendations";

export type ValidationStatus = "failed" | "needs_review" | "pass";

export type ValidationReason =
  | "concentration_only"
  | "dirty_name"
  | "missing_image"
  | "missing_source_url"
  | "no_canonical_match"
  | "no_dosed_facts"
  | "source_conflict"
  | "unsafe_dose";

export type ValidationFact = Readonly<{
  amount?: number | null;
  confidence?: string | null;
  foodId?: string | null;
  itemType?: "food" | "nutrient" | "supplement" | string | null;
  maxAmount?: number | string | null;
  maxUnit?: string | null;
  name?: string | null;
  normalizedName?: string | null;
  nutrientId?: string | null;
  source?: string | null;
  sourceText?: string | null;
  supplementId?: string | null;
  supplementStatus?: string | null;
  unit?: string | null;
}>;

export type ValidationInput = Readonly<{
  facts: readonly ValidationFact[];
  imageUrl?: string | null;
  labelStatus?: string | null;
  productUrl?: string | null;
  sourceUrl?: string | null;
}>;

export type ValidationResult = Readonly<{
  checkedAt: string;
  matchableFactCount: number;
  reasons: ValidationReason[];
  status: ValidationStatus;
  summary: string;
}>;

const SOURCE_FORM_TOKENS = new Set([
  "acetate",
  "anhydrous",
  "bisglycinate",
  "carbonate",
  "chelate",
  "chloride",
  "citrate",
  "conc",
  "concentrate",
  "extract",
  "fumarate",
  "gluconate",
  "hcl",
  "hydrochloride",
  "hydrate",
  "monohydrate",
  "oxide",
  "pentahydrate",
  "phosphate",
  "powder",
  "sulfate",
  "sulphate"
]);

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function hasUsableText(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasCanonicalMatch(fact: ValidationFact) {
  return Boolean(fact.supplementId || fact.foodId || fact.nutrientId);
}

function hasDose(fact: ValidationFact) {
  return numberOrNull(fact.amount) !== null && hasUsableText(fact.unit);
}

function factName(fact: ValidationFact) {
  return String(fact.name ?? fact.normalizedName ?? "");
}

export function productFactLooksDirtyForMatching(fact: ValidationFact) {
  const rawName = factName(fact);
  const normalized = normalizeProductFactKey(rawName);
  const sourceText = String(fact.sourceText ?? "");
  const haystack = `${rawName} ${sourceText}`.toLowerCase();

  if (!rawName.trim()) {
    return true;
  }

  if (productFactLooksLikeConcentration(rawName) || productFactLooksLikeConcentration(sourceText)) {
    return true;
  }

  if (/\b\d+(?:[,.]\d+)?\s*%/.test(haystack)) {
    return true;
  }

  if (/\b(?:equivalent|eq\.?|dry|fresh)\b.*\b(?:extract|fruit|root|leaf|herb)\b/.test(haystack)) {
    return true;
  }

  const tokens = normalized.split("_").filter(Boolean);

  return !hasCanonicalMatch(fact) &&
    tokens.some((token) => SOURCE_FORM_TOKENS.has(token)) &&
    tokens.length > 1;
}

function unsafeDose(fact: ValidationFact) {
  if (fact.supplementStatus === "blocked") {
    return true;
  }

  const amount = numberOrNull(fact.amount);
  const unit = hasUsableText(fact.unit) ? normalizeDoseUnit(fact.unit!) : null;
  const maxAmount = numberOrNull(fact.maxAmount);
  const maxUnit = hasUsableText(fact.maxUnit) ? fact.maxUnit! : null;
  const limit = parseDoseLimit(maxAmount, maxUnit);

  if (amount === null || !unit || !limit || productFactLooksLikeConcentration(factName(fact))) {
    return false;
  }

  return doseExceedsLimit(
    {
      amount,
      originalText: `${amount} ${unit}`,
      unit
    },
    limit,
    normalizeProductFactKey(factName(fact))
  ) === true;
}

function matchableFact(fact: ValidationFact) {
  if (!hasCanonicalMatch(fact) || !hasDose(fact)) {
    return false;
  }

  if (productFactLooksDirtyForMatching(fact) || unsafeDose(fact)) {
    return false;
  }

  const amount = numberOrNull(fact.amount);
  const unit = hasUsableText(fact.unit) ? normalizeDoseUnit(fact.unit!) : null;

  return amount !== null &&
    Boolean(unit) &&
    comparableDoseAmount(
      {
        amount,
        originalText: `${amount} ${unit}`,
        unit: unit!
      },
      normalizeProductFactKey(factName(fact))
    ) !== null;
}

function validationSummary(
  status: ValidationStatus,
  reasons: readonly ValidationReason[],
  matchableFactCount: number
) {
  if (status === "pass") {
    return `${matchableFactCount} matchable canonical fact${matchableFactCount === 1 ? "" : "s"}.`;
  }

  if (reasons.includes("missing_image")) {
    return "Missing product image.";
  }

  if (reasons.includes("no_dosed_facts")) {
    return "No usable per-serving product facts.";
  }

  if (reasons.includes("no_canonical_match")) {
    return "No facts map to the canonical catalogue.";
  }

  if (reasons.includes("dirty_name") || reasons.includes("concentration_only")) {
    return "Product facts need cleanup before matching.";
  }

  if (reasons.includes("unsafe_dose")) {
    return "One or more facts exceed safety limits.";
  }

  return "Product data needs review before matching.";
}

export function validateProduct(input: ValidationInput): ValidationResult {
  const reasons = new Set<ValidationReason>();
  const facts = input.facts ?? [];

  if (!hasUsableText(input.imageUrl)) {
    reasons.add("missing_image");
  }

  if (!hasUsableText(input.productUrl) && !hasUsableText(input.sourceUrl)) {
    reasons.add("missing_source_url");
  }

  if (facts.length < 1) {
    reasons.add("no_dosed_facts");
  }

  if (!facts.some(hasCanonicalMatch)) {
    reasons.add("no_canonical_match");
  }

  if (!facts.some(hasDose)) {
    reasons.add("no_dosed_facts");
  }

  if (facts.some((fact) => productFactLooksLikeConcentration(factName(fact)))) {
    reasons.add("concentration_only");
  }

  if (facts.some(productFactLooksDirtyForMatching)) {
    reasons.add("dirty_name");
  }

  if (facts.some(unsafeDose)) {
    reasons.add("unsafe_dose");
  }

  if (
    facts.some((fact) =>
      hasCanonicalMatch(fact) &&
      hasDose(fact) &&
      normalizeProductFactName(factName(fact)) &&
      fact.confidence === "low"
    ) &&
    facts.some((fact) => !hasCanonicalMatch(fact))
  ) {
    reasons.add("source_conflict");
  }

  const matchableFactCount = facts.filter(matchableFact).length;

  if (matchableFactCount < 1) {
    reasons.add("no_dosed_facts");
  }

  const reasonList = [...reasons].sort();
  const hardFailed =
    reasonList.includes("unsafe_dose") ||
    (reasonList.includes("no_dosed_facts") && facts.length < 1);
  const status: ValidationStatus =
    reasonList.length < 1 && matchableFactCount > 0
      ? "pass"
      : hardFailed
        ? "failed"
        : "needs_review";

  return {
    checkedAt: new Date().toISOString(),
    matchableFactCount,
    reasons: reasonList,
    status,
    summary: validationSummary(status, reasonList, matchableFactCount)
  };
}

export function validationBlocksMatching(
  validation: ValidationResult | null | undefined
) {
  return Boolean(validation && validation.status !== "pass");
}
