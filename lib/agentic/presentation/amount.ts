/** Format human-readable nutrient quantities without changing arithmetic.
 * IU uses whole units; other units preserve extra requested target precision. */
export function formatNutrientAmount(amount: number, unit?: string | null, requestedAmount?: number) {
  const [coefficient, exponent = "0"] = String(requestedAmount ?? 0).toLowerCase().split("e");
  const requestedDecimals = Math.max(0, (coefficient.split(".")[1]?.length ?? 0) - Number(exponent));
  const decimals = unit === "IU" ? 0 : Math.min(20, Math.max(2, requestedDecimals));
  return new Intl.NumberFormat("en-US", { useGrouping: false, maximumFractionDigits: decimals }).format(amount);
}

/** Legacy saved overlap prose receives the same display-only correction. */
export function formatNutrientMessage(message: string, unit?: string | null, requestedAmount?: number) {
  return message.replace(/\b\d+\.\d+\b/g, amount => formatNutrientAmount(Number(amount), unit, requestedAmount));
}
