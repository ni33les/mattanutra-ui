export type DoseUnit =
  | "billion_cfu"
  | "cfu"
  | "g"
  | "iu"
  | "mcg"
  | "mg"
  | "million_cfu";

export type ParsedDose = Readonly<{
  amount: number;
  originalText: string;
  unit: DoseUnit;
}>;

const MASS_TO_MCG: Record<"g" | "mcg" | "mg", number> = {
  g: 1_000_000,
  mcg: 1,
  mg: 1_000
};

const CFU_TO_UNITS: Record<"billion_cfu" | "cfu" | "million_cfu", number> = {
  billion_cfu: 1_000_000_000,
  cfu: 1,
  million_cfu: 1_000_000
};

type IuConversionRule = Readonly<{
  aliases: readonly string[];
  iuToUnitFactor: number;
  unit: "g" | "mcg" | "mg";
}>;

const IU_CONVERSION_RULES: readonly IuConversionRule[] = [
  {
    aliases: ["vitamin_d", "vitamin_d3", "cholecalciferol"],
    iuToUnitFactor: 1 / 40,
    unit: "mcg"
  },
  {
    aliases: [
      "alpha_tocopherol",
      "d_alpha_tocopherol",
      "tocopherol",
      "vitamin_e"
    ],
    // Use the natural alpha-tocopherol conversion when the label only says IU.
    // It is the more conservative comparison against mg safety limits.
    iuToUnitFactor: 0.67,
    unit: "mg"
  }
];

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizeDoseUnit(value: string): DoseUnit | null {
  const unit = value
    .toLowerCase()
    .replace("µg", "mcg")
    .replace("ug", "mcg")
    .replace(/colony\s*forming\s*units?/g, "cfu")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "_");

  if (unit === "g" || unit === "iu" || unit === "mcg" || unit === "mg") {
    return unit;
  }

  if (unit === "cfu") {
    return "cfu";
  }

  if (unit === "billion_cfu" || unit === "bn_cfu") {
    return "billion_cfu";
  }

  if (unit === "million_cfu" || unit === "m_cfu") {
    return "million_cfu";
  }

  return null;
}

function iuConversionRule(supplementKey?: string | null) {
  if (!supplementKey) {
    return null;
  }

  const normalized = normalizeKey(supplementKey);

  return (
    IU_CONVERSION_RULES.find((rule) => rule.aliases.includes(normalized)) ??
    null
  );
}

function massInMcg(dose: ParsedDose) {
  return dose.unit === "g" || dose.unit === "mcg" || dose.unit === "mg"
    ? dose.amount * MASS_TO_MCG[dose.unit]
    : null;
}

function cfuAmount(dose: ParsedDose) {
  return dose.unit === "billion_cfu" ||
    dose.unit === "cfu" ||
    dose.unit === "million_cfu"
    ? dose.amount * CFU_TO_UNITS[dose.unit]
    : null;
}

export function comparableDoseAmount(
  dose: ParsedDose,
  supplementKey?: string | null
) {
  if (dose.unit !== "iu") {
    return massInMcg(dose) ?? cfuAmount(dose);
  }

  const rule = iuConversionRule(supplementKey);

  if (!rule) {
    return null;
  }

  return dose.amount * rule.iuToUnitFactor * MASS_TO_MCG[rule.unit];
}

function sortWeight(dose: ParsedDose, supplementKey?: string | null) {
  return comparableDoseAmount(dose, supplementKey) ?? dose.amount;
}

export function parseDose(
  text: string,
  supplementKey?: string | null
): ParsedDose | null {
  const matches = [
    ...text
      .toLowerCase()
      .replaceAll(",", "")
      .replaceAll("µg", "mcg")
      .replaceAll("ug", "mcg")
      .matchAll(/(\d+(?:\.\d+)?)\s*(billion\s*cfu|million\s*cfu|bn\s*cfu|m\s*cfu|cfu|mcg|mg|g|iu)\b/g)
  ];

  const parsed = matches
    .map((match) => {
      const amount = Number(match[1]);
      const unit = normalizeDoseUnit(match[2] ?? "");

      return Number.isFinite(amount) && unit
        ? ({ amount, originalText: text, unit } satisfies ParsedDose)
        : null;
    })
    .filter((candidate): candidate is ParsedDose => Boolean(candidate));

  if (parsed.length < 1) {
    return null;
  }

  return parsed.sort(
    (first, second) =>
      sortWeight(second, supplementKey) - sortWeight(first, supplementKey)
  )[0];
}

export function parseDoseLimit(
  maxAmount: number | null,
  maxUnit: string | null
): ParsedDose | null {
  if (maxAmount === null || maxAmount < 0 || !maxUnit) {
    return null;
  }

  const unit = normalizeDoseUnit(
    maxUnit
      .toLowerCase()
      .replace("mcg rae", "mcg")
      .match(/\b(billion\s*cfu|million\s*cfu|bn\s*cfu|m\s*cfu|cfu|mcg|µg|ug|mg|g|iu)\b/)?.[1] ?? ""
  );

  return unit ? { amount: maxAmount, originalText: maxUnit, unit } : null;
}

export function doseExceedsLimit(
  dose: ParsedDose,
  limit: ParsedDose,
  supplementKey?: string | null
) {
  if (dose.unit === limit.unit) {
    return dose.amount > limit.amount;
  }

  const doseAmount = comparableDoseAmount(dose, supplementKey);
  const limitAmount = comparableDoseAmount(limit, supplementKey);

  return doseAmount !== null && limitAmount !== null
    ? doseAmount > limitAmount
    : null;
}
