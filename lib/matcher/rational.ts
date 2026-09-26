/** Exact arithmetic for matching and offline scoring policies; never rounds a comparison. */
export type Rational = Readonly<{ num: bigint; den: bigint }>;
export type Decimal = string | number;

const zero = BigInt(0), one = BigInt(1);

function gcd(a: bigint, b: bigint): bigint {
  if (a < zero) a = -a;
  while (b !== zero) { const rest = a % b; a = b; b = rest; }
  return a || one;
}
export function rational(num: bigint, den = one): Rational {
  if (den === zero) throw new Error("Rational denominator is zero");
  if (den < zero) { num = -num; den = -den; }
  if (num === zero) return ZERO;
  if (den === one) return num === one ? ONE : Object.freeze({ num, den });
  const divisor = gcd(num, den);
  return Object.freeze({ num: num / divisor, den: den / divisor });
}

export const ZERO: Rational = Object.freeze({ num: zero, den: one });
export const ONE: Rational = Object.freeze({ num: one, den: one });
export const add = (a: Rational, b: Rational): Rational => a.num === zero ? b : b.num === zero ? a : a.den === b.den ? rational(a.num + b.num, a.den) : rational(a.num * b.den + b.num * a.den, a.den * b.den);
export const subtract = (a: Rational, b: Rational): Rational => b.num === zero ? a : a.den === b.den ? rational(a.num - b.num, a.den) : rational(a.num * b.den - b.num * a.den, a.den * b.den);
export const multiply = (a: Rational, b: Rational): Rational => a.num === zero || b.num === zero ? ZERO : a.num === a.den ? b : b.num === b.den ? a : rational(a.num * b.num, a.den * b.den);
export const divide = (a: Rational, b: Rational): Rational => b.num !== zero && b.num === b.den ? a : rational(a.num * b.den, a.den * b.num);
export function compare(a: Rational, b: Rational): number {
  if (a === b) return 0;
  const delta = a.den === b.den ? a.num - b.num : a.num * b.den - b.num * a.den;
  return delta < zero ? -1 : delta > zero ? 1 : 0;
}
export const abs = (value: Rational): Rational => value.num < zero ? rational(-value.num, value.den) : value;
export const positive = (value: Rational): Rational => value.num > zero ? value : ZERO;
export function sum(values: readonly Rational[]): Rational {
  let num = zero, den = one;
  for (const value of values) {
    if (value.num === zero) continue;
    const common = den === value.den ? den : gcd(den, value.den);
    num = num * (value.den / common) + value.num * (den / common);
    den *= value.den / common;
  }
  return rational(num, den);
}
export function compileLinearTerms(values: readonly Rational[]) {
  const denominator = values.reduce((den, value) => den / gcd(den, value.den) * value.den, one);
  return Object.freeze({ denominator, numerators: Object.freeze(values.map(value => value.num * (denominator / value.den))) });
}
export function linearSum(values: ReturnType<typeof compileLinearTerms>, weights: ReturnType<typeof compileLinearTerms>): Rational {
  if (values.numerators.length !== weights.numerators.length) throw new Error("Exact linear axes must match");
  let num = zero;
  for (let i = 0; i < values.numerators.length; i++) num += values.numerators[i]! * weights.numerators[i]!;
  return rational(num, values.denominator * weights.denominator);
}
export const serialize = (value: Rational) => ({ numerator: String(value.num), denominator: String(value.den) });

export function fromDecimal(value: unknown): Rational {
  if (typeof value !== "string" && typeof value !== "number") throw new Error("Expected a finite decimal coefficient");
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Expected a finite decimal coefficient");
  if (typeof value === "number" && Number.isSafeInteger(value)) return value === 0 ? ZERO : value === 1 ? ONE : rational(BigInt(value));
  const text = String(value);
  if (text.length > 256) throw new Error("Decimal representation exceeds 256 characters");
  const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text);
  if (!match) throw new Error("Expected a finite decimal coefficient");
  const exponent = Number(match[4] ?? 0) - (match[3]?.length ?? 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 256) throw new Error("Decimal exponent exceeds the precise representation limit");
  const num = BigInt(match[2]! + (match[3] ?? "")) * (match[1] === "-" ? -one : one);
  return exponent >= 0 ? rational(num * BigInt(10) ** BigInt(exponent)) : rational(num, BigInt(10) ** BigInt(-exponent));
}

/** Profile parameters originate in finite decimals; this is a lossless JSON form. */
export function toDecimal(value: Rational): string {
  const normalized = rational(value.num, value.den);
  let denominator = normalized.den, twos = 0, fives = 0;
  while (denominator % BigInt(2) === zero) { denominator /= BigInt(2); twos += 1; }
  while (denominator % BigInt(5) === zero) { denominator /= BigInt(5); fives += 1; }
  if (denominator !== one) throw new Error("Rational does not have a finite decimal representation");
  const places = Math.max(twos, fives);
  const num = normalized.num * BigInt(2) ** BigInt(places - twos) * BigInt(5) ** BigInt(places - fives);
  const sign = num < zero ? "-" : "", digits = String(num < zero ? -num : num).padStart(places + 1, "0");
  return places ? `${sign}${digits.slice(0, -places)}.${digits.slice(-places)}`.replace(/0+$/, "").replace(/\.$/, "") : sign + digits;
}

export function toNumber(value: Rational): number {
  const n = Number(value.num), d = Number(value.den);
  if (Number.isFinite(n) && Number.isFinite(d)) return n / d;
  if (value.num === zero) return 0;
  const sign = value.num < zero ? -1 : 1;
  const numerator = String(value.num < zero ? -value.num : value.num), denominator = String(value.den);
  const a = numerator.slice(0, 17), b = denominator.slice(0, 17);
  return sign * Number(`${(Number(a) / 10 ** (a.length - 1)) / (Number(b) / 10 ** (b.length - 1))}e${numerator.length - denominator.length}`);
}
