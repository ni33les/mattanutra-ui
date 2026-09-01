/** Independent COST arithmetic. Do not import production economics modules. */

export function oraclePacksThroughHorizon(input: Readonly<{
  dailyServings: number;
  horizonDays: number;
  servingsPerPack: number;
}>) {
  if (input.servingsPerPack <= 0 || input.dailyServings <= 0 || input.horizonDays <= 0) {
    return 1;
  }

  return Math.max(1, Math.ceil((input.horizonDays * input.dailyServings) / input.servingsPerPack));
}

export function oracleLineTotal(unitPriceMinor: number, purchasedQuantity: number) {
  return unitPriceMinor * purchasedQuantity;
}

export function oracleAvailableServings(servingsPerPack: number, purchasedQuantity: number) {
  return servingsPerPack * purchasedQuantity;
}

export function oracleDaysSupplied(
  servingsPerPack: number,
  purchasedQuantity: number,
  dailyServings: number
) {
  return oracleAvailableServings(servingsPerPack, purchasedQuantity) / dailyServings;
}

export function oracleLeftoverServings(input: Readonly<{
  dailyServings: number;
  horizonDays: number;
  servingsPerPack: number;
}>) {
  const packs = oraclePacksThroughHorizon(input);
  return packs * input.servingsPerPack - input.horizonDays * input.dailyServings;
}

export function oracleCashThroughHorizon(input: Readonly<{
  dailyServings: number;
  horizonDays: number;
  servingsPerPack: number;
  shippingMinor: number;
  unitPriceMinor: number;
}>) {
  const packs = oraclePacksThroughHorizon(input);
  return packs * input.unitPriceMinor + input.shippingMinor;
}

export function oracleConsumptionThroughHorizon(input: Readonly<{
  dailyServings: number;
  horizonDays: number;
  servingsPerPack: number;
  unitPriceMinor: number;
}>) {
  const valuePerServing = input.unitPriceMinor / input.servingsPerPack;
  return Math.round(valuePerServing * input.horizonDays * input.dailyServings);
}

export function oracleSavings(baselineCash90: number, optionCash90: number) {
  const amount = baselineCash90 - optionCash90;
  const percent = baselineCash90 === 0 ? null : amount / baselineCash90;
  return { amount, percent };
}
