import { comparableDoseAmount, parseDose } from "@/lib/dose-conversion";

function supplementKey(name: string) {
  return name.toLowerCase().replace(/\s+/g, "_");
}

export function doseComparable(amount: number, unit: string, name: string) {
  const parsed = parseDose(`${amount} ${unit}`, supplementKey(name));

  if (!parsed) {
    return amount;
  }

  return comparableDoseAmount(parsed, supplementKey(name)) ?? amount;
}

export function fromComparable(
  comparable: number,
  unit: string,
  name: string
) {
  const one = doseComparable(1, unit, name);

  if (!one) {
    return comparable;
  }

  return comparable / one;
}

export function roundDose(value: number) {
  return Math.round(value * 1000) / 1000;
}
