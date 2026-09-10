/** Format human-readable nutrient quantities without changing arithmetic.
 * IU uses whole units; other units preserve extra requested target precision. */
export function formatNutrientAmount(amount: number, unit?: string | null, requestedAmount?: number | null) {
  const [coefficient, exponent = "0"] = String(requestedAmount ?? 0).toLowerCase().split("e");
  const requestedDecimals = Math.max(0, (coefficient.split(".")[1]?.length ?? 0) - Number(exponent));
  const smallAmountPrecision = amount !== 0 && Math.abs(amount) < 0.01 ? Math.ceil(-Math.log10(Math.abs(amount))) + 1 : 0;
  const decimals = unit === "IU" && Number.isInteger(amount) ? 0 : Math.min(20, Math.max(unit === "IU" ? 0 : 2, requestedDecimals, smallAmountPrecision));
  return new Intl.NumberFormat("en-US", { useGrouping: false, maximumFractionDigits: decimals }).format(amount);
}

/** Legacy saved overlap prose receives the same display-only correction. */
export function formatNutrientMessage(message: string, unit?: string | null, requestedAmount?: number | null) {
  return message.replace(/\b\d+\.\d+\b/g, amount => formatNutrientAmount(Number(amount), unit, requestedAmount));
}
