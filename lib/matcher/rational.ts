/** Exact arithmetic for matching and offline scoring policies; never rounds a comparison. */
export type Rational = Readonly<{ num: bigint; den: bigint }>;
export type Decimal = string | number;

export function rational(num: bigint, den = BigInt(1)): Rational {
  if (den === BigInt(0)) throw new Error("Rational denominator is zero");
  if (den < BigInt(0)) { num = -num; den = -den; }
  if (den === BigInt(1)) return Object.freeze({ num, den });
  if (num === BigInt(0)) return Object.freeze({ num, den: BigInt(1) });
  let a = num < BigInt(0) ? -num : num, b = den;
  while (b !== BigInt(0)) [a, b] = [b, a % b];
  const divisor = a || BigInt(1);
  return Object.freeze({ num: num / divisor, den: den / divisor });
}

export const ZERO = rational(BigInt(0));
export const ONE = rational(BigInt(1));
export const add = (a: Rational, b: Rational): Rational => a.num === BigInt(0) ? b : b.num === BigInt(0) ? a : rational(a.num * b.den + b.num * a.den, a.den * b.den);
export const subtract = (a: Rational, b: Rational): Rational => b.num === BigInt(0) ? a : rational(a.num * b.den - b.num * a.den, a.den * b.den);
export const multiply = (a: Rational, b: Rational): Rational => a.num === BigInt(0) || b.num === BigInt(0) ? ZERO : a.num === a.den ? b : b.num === b.den ? a : rational(a.num * b.num, a.den * b.den);
export const divide = (a: Rational, b: Rational): Rational => b.num !== BigInt(0) && b.num === b.den ? a : rational(a.num * b.den, a.den * b.num);
export function compare(a: Rational, b: Rational): number {
  const delta = a.num * b.den - b.num * a.den;
  return delta < BigInt(0) ? -1 : delta > BigInt(0) ? 1 : 0;
}
export const abs = (value: Rational): Rational => value.num < BigInt(0) ? rational(-value.num, value.den) : value;
export const positive = (value: Rational): Rational => value.num > BigInt(0) ? value : ZERO;
export const sum = (values: readonly Rational[]): Rational => values.reduce(add, ZERO);
export const serialize = (value: Rational) => ({ numerator: String(value.num), denominator: String(value.den) });

export function fromDecimal(value: unknown): Rational {
  if (typeof value !== "string" && typeof value !== "number") throw new Error("Expected a finite decimal coefficient");
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Expected a finite decimal coefficient");
  if (typeof value === "number" && Number.isSafeInteger(value)) return rational(BigInt(value));
  const text = String(value);
  if (text.length > 256) throw new Error("Decimal representation exceeds 256 characters");
  const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text);
  if (!match) throw new Error("Expected a finite decimal coefficient");
  const exponent = Number(match[4] ?? 0) - (match[3]?.length ?? 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 256) throw new Error("Decimal exponent exceeds the precise representation limit");
  const num = BigInt(match[2]! + (match[3] ?? "")) * (match[1] === "-" ? -BigInt(1) : BigInt(1));
  return exponent >= 0 ? rational(num * BigInt(10) ** BigInt(exponent)) : rational(num, BigInt(10) ** BigInt(-exponent));
}

/** Profile parameters originate in finite decimals; this is a lossless JSON form. */
export function toDecimal(value: Rational): string {
  const normalized = rational(value.num, value.den);
  let denominator = normalized.den, twos = 0, fives = 0;
  while (denominator % BigInt(2) === BigInt(0)) { denominator /= BigInt(2); twos += 1; }
  while (denominator % BigInt(5) === BigInt(0)) { denominator /= BigInt(5); fives += 1; }
  if (denominator !== BigInt(1)) throw new Error("Rational does not have a finite decimal representation");
  const places = Math.max(twos, fives);
  const num = normalized.num * BigInt(2) ** BigInt(places - twos) * BigInt(5) ** BigInt(places - fives);
  const sign = num < BigInt(0) ? "-" : "", digits = String(num < BigInt(0) ? -num : num).padStart(places + 1, "0");
  return places ? `${sign}${digits.slice(0, -places)}.${digits.slice(-places)}`.replace(/0+$/, "").replace(/\.$/, "") : sign + digits;
}

export function toNumber(value: Rational): number {
  const n = Number(value.num), d = Number(value.den);
  if (Number.isFinite(n) && Number.isFinite(d)) return n / d;
  if (value.num === BigInt(0)) return 0;
  const sign = value.num < BigInt(0) ? -1 : 1;
  const numerator = String(value.num < BigInt(0) ? -value.num : value.num), denominator = String(value.den);
  const a = numerator.slice(0, 17), b = denominator.slice(0, 17);
  return sign * Number(`${(Number(a) / 10 ** (a.length - 1)) / (Number(b) / 10 ** (b.length - 1))}e${numerator.length - denominator.length}`);
}
