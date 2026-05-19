export const supplementDoseUnits = [
  "mcg/day",
  "mg/day",
  "g/day",
  "IU/day",
  "CFU/day",
  "million CFU/day",
  "billion CFU/day",
  "ml/day",
  "tablet/day",
  "capsule/day",
  "mcg",
  "mg",
  "g",
  "IU",
  "CFU",
  "million CFU",
  "billion CFU",
  "ml",
  "tablet",
  "capsule"
] as const;

export type SupplementDoseUnit = (typeof supplementDoseUnits)[number];
