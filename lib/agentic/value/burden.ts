import type { BasketItem, BurdenLedger, RetainedCurrent } from "@/lib/agentic/plan/types";

const NON_PILL_FORM = /powder|liquid|sachet|oil|drops|\bml\b/i;

function formUnits(item: BasketItem) {
  return Math.max(item.dailyPills, item.servingsPerDay, 1);
}

export function buildBurden(input: Readonly<{
  items: readonly BasketItem[];
  retainedCurrent?: readonly RetainedCurrent[];
}>): BurdenLedger {
  let administrations = 0;
  let gummies = 0;
  let pills = 0;
  let softgels = 0;
  let tablets = 0;

  for (const item of input.items) {
    const form = item.form.toLowerCase();
    const units = formUnits(item);

    if (NON_PILL_FORM.test(form)) {
      administrations += Math.max(1, item.servingsPerDay);
      continue;
    }

    if (/softgel/.test(form)) {
      softgels += units;
      continue;
    }

    if (/tablet/.test(form)) {
      tablets += units;
      continue;
    }

    if (/gumm/.test(form)) {
      gummies += units;
      continue;
    }

    pills += units;
  }

  const retained = input.retainedCurrent?.length ?? 0;

  return {
    administrationEvents: administrations,
    administrations,
    gummies,
    nonPillTotal: administrations,
    pills: pills + softgels + tablets + gummies,
    productCount: input.items.length + retained,
    softgels,
    tablets
  };
}
