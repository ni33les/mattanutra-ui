/** Independent arithmetic for pack/econ/saving assertions. Do not import production economics. */

export function oracleAvailableServings(
  servingsPerPack: number,
  purchasedQuantity: number
) {
  return servingsPerPack * purchasedQuantity;
}

export function oracleDaysOfSupply(
  availableServings: number,
  dailyServings: number
) {
  if (dailyServings <= 0) {
    return null;
  }
  return availableServings / dailyServings;
}

export function oracleLineTotal(unitPriceMinor: number, purchasedQuantity: number) {
  return unitPriceMinor * purchasedQuantity;
}

export function oracleHorizonOrders(input: Readonly<{
  dailyServings: number;
  horizonDays: number;
  servingsPerPack: number;
  startingServings?: number;
}>) {
  const starting = input.startingServings ?? 0;
  const required = input.dailyServings * input.horizonDays;
  const remaining = Math.max(0, required - starting);
  if (remaining <= 0) {
    return 0;
  }
  return Math.ceil(remaining / input.servingsPerPack);
}

export function oracleConsumptionMinor(input: Readonly<{
  dailyServings: number;
  horizonDays: number;
  servingsPerPack: number;
  startingServings?: number;
  unitPriceMinor: number;
}>) {
  const consumed = Math.min(
    input.dailyServings * input.horizonDays,
    (input.startingServings ?? 0) +
      oracleHorizonOrders(input) * input.servingsPerPack
  );
  return (input.unitPriceMinor / input.servingsPerPack) * consumed;
}

export function oracleHorizonCashMinor(input: Readonly<{
  dailyServings: number;
  horizonDays: number;
  servingsPerPack: number;
  startingServings?: number;
  unitPriceMinor: number;
}>) {
  return oracleHorizonOrders(input) * input.unitPriceMinor;
}

export function oracleSavingMinor(input: Readonly<{
  baselineCashMinor: number;
  optionCashMinor: number;
}>) {
  return input.baselineCashMinor - input.optionCashMinor;
}

export function oracleNumericSavingAllowed(input: Readonly<{
  baselineComplete: boolean;
  equivalent: boolean;
  optionComplete: boolean;
}>) {
  return input.optionComplete && input.baselineComplete && input.equivalent;
}
