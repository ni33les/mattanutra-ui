import type {
  CanonicalCurrent,
  DoseDimension,
  DoseError,
  DoseProvenance,
  DoseVariant,
  Exposure,
  MatcherUnit,
  ScaledAmount
} from "@/lib/matcher/types";

const MASS_NG: Record<"g" | "mcg" | "mg", bigint> = {
  g: BigInt(1000000000),
  mcg: BigInt(1000),
  mg: BigInt(1000000)
};

const CFU: Record<"billion_cfu" | "cfu" | "million_cfu", bigint> = {
  billion_cfu: BigInt(1000000000),
  cfu: BigInt(1),
  million_cfu: BigInt(1000000)
};

const IU_TO_MASS_NG: ReadonlyArray<{
  aliases: readonly string[];
  ngPerIu: bigint;
}> = [
  {
    aliases: [
      "vitamin_d",
      "vitamin_d3",
      "d3",
      "vit_d",
      "vit_d3",
      "cholecalciferol",
      "colecalciferol"
    ],
    ngPerIu: BigInt(25)
  },
  {
    aliases: [
      "alpha_tocopherol",
      "d_alpha_tocopherol",
      "tocopherol",
      "vitamin_e"
    ],
    ngPerIu: BigInt(670_000)
  }
];

const MAX_ABS = BigInt(10) ** BigInt(24);

function subjectKey(name: string) {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function gcd(left: bigint, right: bigint): bigint {
  let a = left < BigInt(0) ? -left : left;
  let b = right < BigInt(0) ? -right : right;

  while (b !== BigInt(0)) {
    const next = a % b;
    a = b;
    b = next;
  }

  return a === BigInt(0) ? BigInt(1) : a;
}

export function numberToRational(
  amount: number
): { den: bigint; num: bigint } | DoseError {
  if (!Number.isFinite(amount)) {
    return { message: "Amount is not finite.", reason: "overflow" };
  }

  if (Number.isInteger(amount) && Math.abs(amount) <= Number.MAX_SAFE_INTEGER) {
    return { den: BigInt(1), num: BigInt(amount) };
  }

  const sign = amount < 0 ? -BigInt(1) : BigInt(1);
  const text = Math.abs(amount).toFixed(9).replace(/0+$/, "").replace(/\.$/, "");
  const [whole, frac = ""] = text.split(".");
  const den = BigInt(10) ** BigInt(frac.length);
  const num = sign * (BigInt(whole || "0") * den + BigInt(frac || "0"));
  const divisor = gcd(num, den);
  return { den: den / divisor, num: num / divisor };
}

function checkedMul(left: bigint, right: bigint): bigint | DoseError {
  const product = left * right;

  if (product > MAX_ABS || product < -MAX_ABS) {
    return { message: "Dose arithmetic overflowed.", reason: "overflow" };
  }

  return product;
}

function checkedAdd(left: bigint, right: bigint): bigint | DoseError {
  const sum = left + right;

  if (sum > MAX_ABS || sum < -MAX_ABS) {
    return { message: "Dose arithmetic overflowed.", reason: "overflow" };
  }

  return sum;
}

function iuMassNg(subjectName: string): bigint | null {
  const key = subjectKey(subjectName);
  const rule = IU_TO_MASS_NG.find(
    (item) =>
      item.aliases.includes(key) ||
      item.aliases.some((alias) => key === alias || key.endsWith(`_${alias}`))
  );
  return rule?.ngPerIu ?? null;
}

function normalizeUnit(unit: string): string {
  const token = unit
    .trim()
    .toLowerCase()
    .replace(/µ/g, "u")
    .replace(/μ/g, "u")
    .replace("µg", "mcg")
    .replace(/\bug\b/g, "mcg")
    .replace(/colony\s*forming\s*units?/g, "cfu")
    .replace(/international\s*units?/g, "iu")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (token === "i_u" || token === "ius") {
    return "iu";
  }

  if (token === "gm" || token === "gram" || token === "grams") {
    return "g";
  }

  if (token === "milligram" || token === "milligrams") {
    return "mg";
  }

  if (token === "microgram" || token === "micrograms") {
    return "mcg";
  }

  return token;
}

export function convertAmount(input: Readonly<{
  amount: number;
  fromUnit: string;
  subjectId: string;
  subjectName: string;
  toUnit: MatcherUnit;
}>): number | null {
  if (normalizeUnit(input.fromUnit) === normalizeUnit(input.toUnit)) {
    return input.amount;
  }

  const scaled = scaleAmount({
    amount: input.amount,
    subjectId: input.subjectId,
    subjectName: input.subjectName,
    unit: input.fromUnit
  });

  if ("reason" in scaled) {
    return null;
  }

  return amountFromScaled(scaled, input.toUnit, input.subjectName);
}

export function scaleAmount(input: Readonly<{
  amount: number;
  subjectId: string;
  subjectName: string;
  unit: string;
}>): ScaledAmount | DoseError {
  const rational = numberToRational(input.amount);

  if ("reason" in rational) {
    return rational;
  }

  const unit = normalizeUnit(input.unit);
  let dim: DoseDimension;
  let multiplier: bigint;

  if (unit === "g" || unit === "mcg" || unit === "mg") {
    dim = "mass_ng";
    multiplier = MASS_NG[unit];
  } else if (unit === "cfu") {
    dim = "cfu";
    multiplier = CFU.cfu;
  } else if (unit === "million_cfu" || unit === "m_cfu") {
    dim = "cfu";
    multiplier = CFU.million_cfu;
  } else if (unit === "billion_cfu" || unit === "bn_cfu") {
    dim = "cfu";
    multiplier = CFU.billion_cfu;
  } else if (unit === "iu") {
    const ng = iuMassNg(input.subjectName);

    if (ng == null) {
      return {
        message: `No exact IU conversion for ${input.subjectName}.`,
        reason: "unsupported_unit"
      };
    }

    dim = "mass_ng";
    multiplier = ng;
  } else if (unit === "ml" || unit === "serving") {
    dim = "serving_milli";
    multiplier = BigInt(1000);
  } else {
    return {
      message: `Unsupported unit ${input.unit}.`,
      reason: "unsupported_unit"
    };
  }

  const scaled = checkedMul(rational.num, multiplier);

  if (typeof scaled !== "bigint") {
    return scaled;
  }

  if (rational.den === BigInt(1)) {
    return { dim, subjectId: input.subjectId, units: scaled };
  }

  if (scaled % rational.den !== BigInt(0)) {
    const rounded = scaled / rational.den;
    const remainder = scaled % rational.den;

    if (remainder * BigInt(2) >= rational.den) {
      return {
        dim,
        subjectId: input.subjectId,
        units: rounded + (scaled < BigInt(0) ? -BigInt(1) : BigInt(1))
      };
    }

    return { dim, subjectId: input.subjectId, units: rounded };
  }

  return { dim, subjectId: input.subjectId, units: scaled / rational.den };
}

export function addScaled(
  left: ScaledAmount,
  right: ScaledAmount
): ScaledAmount | DoseError {
  if (left.dim !== right.dim || left.subjectId !== right.subjectId) {
    return {
      message: "Cannot add incomparable dose dimensions.",
      reason: "unsupported_unit"
    };
  }

  const units = checkedAdd(left.units, right.units);

  if (typeof units !== "bigint") {
    return units;
  }

  return { dim: left.dim, subjectId: left.subjectId, units };
}

export function compareScaled(left: ScaledAmount, right: ScaledAmount) {
  if (left.dim !== right.dim) {
    return null;
  }

  if (left.units < right.units) {
    return -1;
  }

  if (left.units > right.units) {
    return 1;
  }

  return 0;
}

export function minUnits(left: bigint, right: bigint) {
  return left < right ? left : right;
}

export function amountFromScaled(
  amount: ScaledAmount,
  unit: MatcherUnit,
  subjectName: string
): number | null {
  const one = scaleAmount({
    amount: 1,
    subjectId: amount.subjectId,
    subjectName,
    unit
  });

  if ("reason" in one || one.dim !== amount.dim || one.units === BigInt(0)) {
    return null;
  }

  const whole = amount.units / one.units;
  const remainder = amount.units % one.units;

  if (remainder === BigInt(0) && whole <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(whole);
  }

  return Number(amount.units) / Number(one.units);
}

export function aggregateDailyExposure(input: Readonly<{
  current: readonly CanonicalCurrent[];
  variants: readonly DoseVariant[];
}>): Exposure | DoseError {
  const totals = new Map<string, ScaledAmount>();
  const provenance: DoseProvenance[] = [];

  const add = (
    amount: ScaledAmount,
    source: DoseProvenance["source"],
    sourceId: string
  ): DoseError | null => {
    const existing = totals.get(amount.subjectId);

    if (!existing) {
      totals.set(amount.subjectId, amount);
    } else {
      const next = addScaled(existing, amount);

      if ("reason" in next) {
        return next;
      }

      totals.set(amount.subjectId, next);
    }

    provenance.push({ amount, source, sourceId, subjectId: amount.subjectId });
    return null;
  };

  const currents = [...input.current].sort((left, right) =>
    left.sourceId.localeCompare(right.sourceId) ||
    left.subjectId.localeCompare(right.subjectId)
  );

  for (const current of currents) {
    const error = add(current.daily, "current", current.sourceId);

    if (error) {
      return error;
    }
  }

  const variants = [...input.variants].sort((left, right) =>
    left.variantId.localeCompare(right.variantId)
  );

  for (const variant of variants) {
    const subjects = [...variant.contributions.keys()].sort();

    for (const subjectId of subjects) {
      const contribution = variant.contributions.get(subjectId);

      if (!contribution) {
        continue;
      }

      const error = add(contribution, "selected", variant.variantId);

      if (error) {
        return error;
      }
    }
  }

  return { provenance, totals };
}

export function unitsOrZero(
  totals: ReadonlyMap<string, ScaledAmount>,
  subjectId: string
) {
  return totals.get(subjectId)?.units ?? BigInt(0);
}

export function isDoseError(value: unknown): value is DoseError {
  return Boolean(
    value &&
      typeof value === "object" &&
      "reason" in value &&
      ((value as DoseError).reason === "overflow" ||
        (value as DoseError).reason === "unsupported_unit")
  );
}
