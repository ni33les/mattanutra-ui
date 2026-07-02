import type {
  AdminProductDetailRow,
  AdminProductRow,
} from "@/lib/admin-products";
import { normalizeDoseUnit } from "@/lib/dose-conversion";
import {
  normalizeProductFactKey,
  normalizeProductFactName,
  productFactAliasKeys,
  productFactLooksLikeConcentration,
} from "@/lib/product-key-matching";
import { factComparableAmount } from "@/lib/product-recommendation-metrics";

type ProductEditableRow = AdminProductRow | AdminProductDetailRow;
type ProductFact = AdminProductRow["facts"][number];

export type ProductMatchingProfileRow = Readonly<{
  amountLabel: string;
  comparableAmount: number | null;
  confidence: ProductFact["confidence"] | "mixed";
  displayName: string;
  id: string;
  normalizedKey: string;
  sourceLabel: string;
  sourceNames: readonly string[];
  status: "aggregate" | "matchable" | "not_matchable";
  statusLabel: string;
  supplementId: string | null;
  supplementStatus: string | null;
}>;

function matchingProfileNumber(value: number) {
  if (Number.isInteger(value)) {
    return value.toString();
  }

  return value
    .toFixed(4)
    .replace(/0+$/, "")
    .replace(/\.$/, "");
}

function matchingProfileAmountLabel(
  amount: number | null,
  unit: string | null,
) {
  const normalizedUnit = unit?.trim() ?? "";

  return amount !== null && normalizedUnit
    ? `${matchingProfileNumber(amount)} ${normalizedUnit}`
    : "-";
}

function matchingProfileFactName(fact: ProductFact) {
  const rawName = fact.name.trim() || fact.normalizedName.trim();
  const normalizedName = rawName ? normalizeProductFactName(rawName) : "";

  return normalizedName || rawName || "Unnamed fact";
}

function matchingProfileFactKey(fact: ProductFact) {
  return normalizeProductFactKey(fact.normalizedName || fact.name);
}

function matchingProfileFactStatus(
  fact: ProductFact,
  comparableAmount: number | null,
  normalizedKey: string,
) {
  if (!normalizedKey) {
    return "No matcher key";
  }

  if (
    productFactLooksLikeConcentration(fact.name) ||
    productFactLooksLikeConcentration(fact.normalizedName)
  ) {
    return "Concentration-only";
  }

  if (fact.amount === null || fact.amount <= 0 || !fact.unit?.trim()) {
    return "Missing dose";
  }

  if (comparableAmount === null) {
    return "Dose not comparable";
  }

  return "Matchable";
}

function omegaSourceForFact(fact: ProductFact): "DHA" | "EPA" | null {
  const directKeys = [
    normalizeProductFactKey(fact.name),
    normalizeProductFactKey(fact.normalizedName),
    ...(fact.aliasKeys ?? []).map((alias) => normalizeProductFactKey(alias)),
  ].filter(Boolean);

  if (
    directKeys.some(
      (key) => key === "dha" || key.includes("docosahexaenoic_acid"),
    )
  ) {
    return "DHA";
  }

  if (
    directKeys.some(
      (key) => key === "epa" || key.includes("eicosapentaenoic_acid"),
    )
  ) {
    return "EPA";
  }

  return null;
}

function omegaAliasesToGroup(fact: ProductFact) {
  return productFactAliasKeys(
    fact.name || fact.normalizedName,
    fact.aliasKeys,
  ).includes("omega_3");
}

function buildOmegaMatchingProfileRow(
  facts: readonly ProductFact[],
): ProductMatchingProfileRow | null {
  const omegaSources = facts
    .map((fact) => {
      const sourceName = omegaSourceForFact(fact);
      const comparableAmount = factComparableAmount(fact);

      return sourceName && omegaAliasesToGroup(fact) && comparableAmount !== null
        ? {
            comparableAmount,
            fact,
            sourceName,
          }
        : null;
    })
    .filter((source): source is NonNullable<typeof source> => Boolean(source));
  const hasDha = omegaSources.some((source) => source.sourceName === "DHA");
  const hasEpa = omegaSources.some((source) => source.sourceName === "EPA");

  if (!hasDha || !hasEpa) {
    return null;
  }

  const sourceNames = (["DHA", "EPA"] as const).filter((sourceName) =>
    omegaSources.some((source) => source.sourceName === sourceName)
  );
  const unitGroups = [
    ...new Set(
      omegaSources.map((source) =>
        source.fact.unit ? normalizeDoseUnit(source.fact.unit) : null,
      ),
    ),
  ];
  const sharedUnit = unitGroups.length === 1 ? unitGroups[0] : null;
  const amountLabel =
    sharedUnit &&
    omegaSources.every((source) => source.fact.amount !== null)
      ? matchingProfileAmountLabel(
          omegaSources.reduce(
            (total, source) => total + (source.fact.amount ?? 0),
            0,
          ),
          omegaSources[0]?.fact.unit ?? sharedUnit,
        )
      : `${matchingProfileNumber(
          omegaSources.reduce(
            (total, source) => total + source.comparableAmount,
            0,
          ),
        )} comparable`;
  const confidenceValues = [
    ...new Set(omegaSources.map((source) => source.fact.confidence)),
  ];

  return {
    amountLabel,
    comparableAmount: omegaSources.reduce(
      (total, source) => total + source.comparableAmount,
      0,
    ),
    confidence:
      confidenceValues.length === 1 ? confidenceValues[0] ?? "mixed" : "mixed",
    displayName: "Omega-3",
    id: "aggregate:omega_3",
    normalizedKey: "omega_3",
    sourceLabel: sourceNames.join(", "),
    sourceNames,
    status: "aggregate",
    statusLabel: "Grouped for matcher",
    supplementId: null,
    supplementStatus: null,
  };
}

export function buildProductMatchingProfile(
  row: ProductEditableRow,
): ProductMatchingProfileRow[] {
  const factRows = row.facts.map((fact) => {
    const comparableAmount = factComparableAmount(fact);
    const normalizedKey = matchingProfileFactKey(fact);
    const statusLabel = matchingProfileFactStatus(
      fact,
      comparableAmount,
      normalizedKey,
    );
    const sourceName = fact.name.trim() || fact.normalizedName.trim() || "-";

    return {
      amountLabel: matchingProfileAmountLabel(fact.amount, fact.unit),
      comparableAmount,
      confidence: fact.confidence,
      displayName: matchingProfileFactName(fact),
      id: fact.id,
      normalizedKey,
      sourceLabel: sourceName,
      sourceNames: sourceName === "-" ? [] : [sourceName],
      status: statusLabel === "Matchable" ? "matchable" : "not_matchable",
      statusLabel,
      supplementId: fact.supplementId ?? null,
      supplementStatus: fact.supplementStatus ?? null,
    } satisfies ProductMatchingProfileRow;
  });
  const omegaRow = buildOmegaMatchingProfileRow(row.facts);

  return omegaRow ? [omegaRow, ...factRows] : factRows;
}
