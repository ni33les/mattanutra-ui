import { payableSnapshot } from "@/lib/agentic/money";
import type { BasketItem } from "@/lib/agentic/plan/types";

export function packsForHorizon(input: Readonly<{
  dailyServings: number;
  horizonDays: number;
  servingsPerPack: number | null | undefined;
}>) {
  if (
    input.servingsPerPack == null ||
    input.servingsPerPack <= 0 ||
    input.dailyServings <= 0 ||
    input.horizonDays <= 0
  ) {
    return null;
  }

  return Math.max(1, Math.ceil((input.horizonDays * input.dailyServings) / input.servingsPerPack));
}

export function cashCostForHorizon(
  items: readonly BasketItem[],
  horizonDays: number
) {
  const subtotalMinor = items.reduce((sum, item) => {
    const packs = packsForHorizon({
      dailyServings: item.servingsPerDay,
      horizonDays,
      servingsPerPack: item.servingsPerPack
    });
    if (packs == null) {
      return sum;
    }
    return sum + item.unitPriceMinor * packs;
  }, 0);

  if (items.length < 1) {
    return 0;
  }

  return payableSnapshot({ subtotalMinor }).totalPriceMinor;
}
