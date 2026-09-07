/** Exact arithmetic for offline scoring policies; never rounds a comparison. */
export type Rational = Readonly<{ num: bigint; den: bigint }>;
export type Decimal = string | number;

export function rational(num: bigint, den = 1n): Rational {
  if (den === 0n) throw new Error("Rational denominator is zero");
  if (den < 0n) { num = -num; den = -den; }
  let a = num < 0n ? -num : num, b = den;
  while (b !== 0n) [a, b] = [b, a % b];
  const divisor = a || 1n;
  return Object.freeze({ num: num / divisor, den: den / divisor });
}

export const ZERO = rational(0n);
export const ONE = rational(1n);
export const add = (a: Rational, b: Rational): Rational => rational(a.num * b.den + b.num * a.den, a.den * b.den);
export const subtract = (a: Rational, b: Rational): Rational => rational(a.num * b.den - b.num * a.den, a.den * b.den);
export const multiply = (a: Rational, b: Rational): Rational => rational(a.num * b.num, a.den * b.den);
export const divide = (a: Rational, b: Rational): Rational => rational(a.num * b.den, a.den * b.num);
export function compare(a: Rational, b: Rational): number {
  const delta = a.num * b.den - b.num * a.den;
  return delta < 0n ? -1 : delta > 0n ? 1 : 0;
}
export const abs = (value: Rational): Rational => value.num < 0n ? rational(-value.num, value.den) : value;
export const positive = (value: Rational): Rational => value.num > 0n ? value : ZERO;
export const sum = (values: readonly Rational[]): Rational => values.reduce(add, ZERO);
export const serialize = (value: Rational) => ({ numerator: String(value.num), denominator: String(value.den) });

export function fromDecimal(value: unknown): Rational {
  if (typeof value !== "string" && typeof value !== "number") throw new Error("Expected a finite decimal coefficient");
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Expected a finite decimal coefficient");
  const text = String(value);
  if (text.length > 256) throw new Error("Decimal representation exceeds 256 characters");
  const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text);
  if (!match) throw new Error("Expected a finite decimal coefficient");
  const exponent = Number(match[4] ?? 0) - (match[3]?.length ?? 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 256) throw new Error("Decimal exponent exceeds the precise representation limit");
  const num = BigInt(match[2]! + (match[3] ?? "")) * (match[1] === "-" ? -1n : 1n);
  return exponent >= 0 ? rational(num * 10n ** BigInt(exponent)) : rational(num, 10n ** BigInt(-exponent));
}

/** Profile parameters originate in finite decimals; this is a lossless JSON form. */
export function toDecimal(value: Rational): string {
  const normalized = rational(value.num, value.den);
  let denominator = normalized.den, twos = 0, fives = 0;
  while (denominator % 2n === 0n) { denominator /= 2n; twos += 1; }
  while (denominator % 5n === 0n) { denominator /= 5n; fives += 1; }
  if (denominator !== 1n) throw new Error("Rational does not have a finite decimal representation");
  const places = Math.max(twos, fives);
  const num = normalized.num * 2n ** BigInt(places - twos) * 5n ** BigInt(places - fives);
  const sign = num < 0n ? "-" : "", digits = String(num < 0n ? -num : num).padStart(places + 1, "0");
  return places ? `${sign}${digits.slice(0, -places)}.${digits.slice(-places)}`.replace(/0+$/, "").replace(/\.$/, "") : sign + digits;
}

export function toNumber(value: Rational): number {
  const n = Number(value.num), d = Number(value.den);
  if (Number.isFinite(n) && Number.isFinite(d)) return n / d;
  if (value.num === 0n) return 0;
  const sign = value.num < 0n ? -1 : 1;
  const numerator = String(value.num < 0n ? -value.num : value.num), denominator = String(value.den);
  const a = numerator.slice(0, 17), b = denominator.slice(0, 17);
  return sign * Number(`${(Number(a) / 10 ** (a.length - 1)) / (Number(b) / 10 ** (b.length - 1))}e${numerator.length - denominator.length}`);
}
