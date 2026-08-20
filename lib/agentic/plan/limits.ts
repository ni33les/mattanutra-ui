export function upperLimitAmount(name: string, unit: string): number | null {
  if (!/zinc/i.test(name)) {
    return null;
  }

  if (unit === "mg") {
    return 40;
  }

  if (unit === "mcg") {
    return 40_000;
  }

  if (unit === "g") {
    return 0.04;
  }

  return null;
}
