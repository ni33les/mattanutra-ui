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
  title?: string | null;
}>;

export type ValidationResult = Readonly<{
  checkedAt: string;
  matchableFactCount: number;
  reasons: ValidationReason[];
  status: ValidationStatus;
  summary: string;
}>;

export type PersistedValidationCache = Readonly<{
  checkedAt?: string | null;
  reasons?: readonly string[] | null;
  status?: string | null;
  summary?: string | null;
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
const SOURCE_IDENTITY_ALIAS_GROUPS: readonly (readonly string[])[] = [
  ["ashwagandha", "ashwaganda", "withania_somnifera"],
  ["coq10", "coenzyme_q10", "ubiquinone", "ubiquinol"],
  ["creatine"],
  ["curcumin", "curacumin", "turmeric"],
  ["lecithin"],
  ["magnesium"],
  ["omega_3", "fish_oil", "fish"],
  ["probiotics", "probiotic"],
  ["theanine"],
  ["vitamin_b12", "b12"],
  ["vitamin_c"],
  ["vitamin_d", "vitamin_d3", "d3"],
  ["zinc"]
];
const SOURCE_IDENTITY_ALIASES = SOURCE_IDENTITY_ALIAS_GROUPS.map((group) =>
  group.map((value) => normalizeProductFactKey(value)).filter(Boolean)
);

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

function textContainsIdentityAlias(text: string, alias: string) {
  return text === alias || text.startsWith(`${alias}_`) ||
    text.endsWith(`_${alias}`) || text.includes(`_${alias}_`);
}

function identityGroupIndexes(value: string | null | undefined) {
  const normalized = normalizeProductFactKey(String(value ?? ""));

  if (!normalized) {
    return new Set<number>();
  }

  const matches = new Set<number>();

  for (const [index, aliases] of SOURCE_IDENTITY_ALIASES.entries()) {
    if (aliases.some((alias) => textContainsIdentityAlias(normalized, alias))) {
      matches.add(index);
    }
  }

  return matches;
}

function productUrlIdentityText(input: ValidationInput) {
  const rawUrl = input.productUrl || input.sourceUrl;

  if (!rawUrl) {
    return "";
  }

  try {
    const url = new URL(rawUrl);
    const parts = url.pathname.split("/").filter(Boolean);

    return parts.at(-1) ?? "";
  } catch {
    const parts = rawUrl.split(/[/?#]/)[0]?.split("/").filter(Boolean) ?? [];

    return parts.at(-1) ?? rawUrl;
  }
}

function productSourceIdentityConflicts(input: ValidationInput) {
  const sourceGroups = identityGroupIndexes(productUrlIdentityText(input));

  if (sourceGroups.size < 1) {
    return false;
  }

  const productIdentityText = [
    input.title,
    ...input.facts.flatMap((fact) => [
      fact.name,
      fact.normalizedName,
      fact.sourceText
    ])
  ].filter((value): value is string => hasUsableText(value));
  const productGroups = new Set<number>();

  for (const value of productIdentityText) {
    for (const group of identityGroupIndexes(value)) {
      productGroups.add(group);
    }
  }

  return [...sourceGroups].some((group) => !productGroups.has(group));
}

export function productFactLooksDirtyForMatching(fact: ValidationFact) {
  const rawName = factName(fact);
  const normalized = normalizeProductFactKey(rawName);
  const sourceText = String(fact.sourceText ?? "");
  const cleanCanonicalDose = hasCanonicalMatch(fact) && hasDose(fact);

  if (!rawName.trim()) {
    return true;
  }

  if (productFactLooksLikeConcentration(rawName)) {
    return true;
  }

  if (productFactLooksLikeConcentration(sourceText) && !cleanCanonicalDose) {
    return true;
  }

  if (/\b\d+(?:[,.]\d+)?\s*%/.test(rawName)) {
    return true;
  }

  if (/\b\d+(?:[,.]\d+)?\s*%/.test(sourceText) && !cleanCanonicalDose) {
    return true;
  }

  if (/\b(?:equivalent|eq\.?|dry|fresh)\b.*\b(?:extract|fruit|root|leaf|herb)\b/i.test(rawName)) {
    return true;
  }

  if (
    /\b(?:equivalent|eq\.?|dry|fresh)\b.*\b(?:extract|fruit|root|leaf|herb)\b/i.test(sourceText) &&
    !cleanCanonicalDose
  ) {
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

function formattedDoseLimit(fact: ValidationFact) {
  const maxAmount = numberOrNull(fact.maxAmount);

  if (maxAmount === null || !hasUsableText(fact.maxUnit)) {
    return null;
  }

  return `${Number.isInteger(maxAmount) ? maxAmount.toFixed(0) : maxAmount} ${fact.maxUnit}`;
}

export function productFactObservableIssueMessages(fact: ValidationFact) {
  const issues: string[] = [];
  const amount = numberOrNull(fact.amount);
  const unit = hasUsableText(fact.unit) ? normalizeDoseUnit(fact.unit!) : null;
  const limit = parseDoseLimit(numberOrNull(fact.maxAmount), fact.maxUnit ?? null);
  const canonicalMatch = hasCanonicalMatch(fact);

  if (!factName(fact).trim()) {
    issues.push("Missing ingredient name");
  }

  if (!canonicalMatch) {
    issues.push("No canonical match");
  }

  if (amount === null || !hasUsableText(fact.unit)) {
    issues.push("Missing usable dose");
  } else if (!unit) {
    issues.push(`Unit ${fact.unit} cannot be compared`);
  }

  if (productFactLooksDirtyForMatching(fact)) {
    issues.push("Fact name or source text needs cleanup before matching");
  }

  if (fact.supplementStatus === "blocked") {
    issues.push("Canonical supplement is ignored");
  }

  if (amount !== null && unit && limit) {
    const exceedsLimit = doseExceedsLimit(
      {
        amount,
        originalText: `${amount} ${unit}`,
        unit
      },
      limit,
      normalizeProductFactKey(factName(fact))
    );

    if (exceedsLimit === true) {
      const formattedLimit = formattedDoseLimit(fact);

      issues.push(
        formattedLimit
          ? `Exceeds configured safe dose of ${formattedLimit}`
          : "Exceeds configured safe dose"
      );
    }
  }

  if (amount !== null && unit && !limit && canonicalMatch) {
    issues.push("No configured safe dose to compare against");
  }

  return issues;
}

export function validationCacheMismatchReasons(
  persisted: PersistedValidationCache,
  recomputed: ValidationResult
) {
  const reasons: string[] = [];
  const persistedReasons = [...(persisted.reasons ?? [])].sort();
  const recomputedReasons = [...recomputed.reasons].sort();

  if (!persisted.status) {
    reasons.push("missing_status");
  } else if (persisted.status !== recomputed.status) {
    reasons.push("status");
  }

  if (persistedReasons.join("|") !== recomputedReasons.join("|")) {
    reasons.push("reasons");
  }

  if ((persisted.summary ?? "") !== recomputed.summary) {
    reasons.push("summary");
  }

  return reasons;
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

  if (productSourceIdentityConflicts(input)) {
    reasons.add("source_conflict");
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
