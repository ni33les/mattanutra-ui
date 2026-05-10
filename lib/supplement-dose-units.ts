export const supplementDoseUnits = [
  "mcg/day",
  "mg/day",
  "g/day",
  "IU/day",
  "ml/day",
  "tablet/day",
  "capsule/day",
  "mcg",
  "mg",
  "g",
  "IU",
  "ml",
  "tablet",
  "capsule"
] as const;

export type SupplementDoseUnit = (typeof supplementDoseUnits)[number];

