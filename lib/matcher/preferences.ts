import { agenticMessage, negotiateLocale } from "@/lib/agentic/i18n";

export type NumericPreferences = Readonly<{
  maxProductCount?: number | null;
  maxDailyPills?: number | null;
  maxPriceMinor?: number | null;
}>;
export type PreferenceAssessment = Readonly<{
  kind: "product_count" | "daily_pills" | "first_order_goods_price";
  preferred: number | null;
  actual: number | null;
  unit: string;
  complete: boolean;
  delta: number | null;
  percent: number | null;
  status: "not_requested" | "within_preference" | "above_preference" | "unknown";
  prominent: boolean;
  message: string;
  messageKey: string;
}>;

// Compare the submitted decimal values exactly. Rounding for display must not
// turn an exact 20% deviation into a prominent warning (or hide a larger one).
function fraction(value: number) {
  const [coefficient, exponent = "0"] = String(value).toLowerCase().split("e");
  const [whole, decimal = ""] = coefficient!.split(".");
  const scale = decimal.length - Number(exponent);
  return scale >= 0
    ? { numerator: BigInt(whole! + decimal), denominator: BigInt(10) ** BigInt(scale) }
    : { numerator: BigInt(whole! + decimal) * BigInt(10) ** BigInt(-scale), denominator: BigInt(1) };
}

export function preferenceMessage(row: Pick<PreferenceAssessment, "messageKey" | "kind" | "actual" | "preferred" | "unit">, localeInput?: string) {
  const locale = negotiateLocale(localeInput);
  return agenticMessage(locale, row.messageKey, { actual: row.actual ?? "?", preferred: row.preferred ?? "?",
    preference: agenticMessage(locale, `plan.preference.${row.kind}`), unit: row.unit });
}

export function assessPreferences(preferences: NumericPreferences, actual: Readonly<{
  productCount: number;
  dailyPills: number | null;
  firstOrderGoodsPriceMinor: number | null;
  currency: string;
}>, localeInput?: string): PreferenceAssessment[] {
  const locale = negotiateLocale(localeInput);
  return ([
    { kind: "product_count", preferred: preferences.maxProductCount, actual: actual.productCount, unit: "products" },
    { kind: "daily_pills", preferred: preferences.maxDailyPills, actual: actual.dailyPills, unit: "pills/day" },
    { kind: "first_order_goods_price", preferred: preferences.maxPriceMinor, actual: actual.firstOrderGoodsPriceMinor, unit: `${actual.currency}_minor` }
  ] as const).map(row => {
    const preferred = row.preferred ?? null;
    const amount = row.actual != null && Number.isFinite(row.actual) ? row.actual : null;
    const delta = preferred == null || amount == null ? null : amount - preferred;
    const status = preferred == null ? "not_requested" : amount == null ? "unknown" : amount > preferred ? "above_preference" : "within_preference";
    let prominent = false;
    if (status === "above_preference" && amount != null && preferred != null) {
      const a = fraction(amount), p = fraction(preferred);
      prominent = preferred === 0 || a.numerator * p.denominator * BigInt(5) > p.numerator * a.denominator * BigInt(6);
    }
    const messageKey = `plan.preference.${status}`;
    return { kind: row.kind, preferred, actual: amount, unit: row.unit, complete: amount != null, delta,
      percent: delta != null && preferred != null && preferred > 0 ? delta / preferred * 100 : null,
      status, prominent, messageKey,
      message: preferenceMessage({ ...row, actual: amount, preferred, messageKey }, locale) };
  });
}
