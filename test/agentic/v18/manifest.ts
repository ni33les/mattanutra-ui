export const V18_PACK = "MattaNutra DEV TDD Implementation Pack v1.8";
export const V18_BASELINE = "38a6fd373f17dc3721e9dd85184a54583ba33798";
export const V18_CLOCK = "2026-09-02T09:00:00.000Z";
export const V18_STABLE_MESSAGE = "This product covers Magnesium at 301.5 mg per day.";

export const V18_PACK_HASH =
  "76e7b2763f75a9c1418fe8651b26ad81bc71d1de9fd4c2a6b6f6800d4435b2f8";
export const V18_RUNNER_HASH =
  "4e88c9bef7c80ea9e9bd38599c9eb4d90367659b185526d54b03689ee14a1320";
export const V18_LOCK_HASH =
  "d8d0ad9f2e0d3ad64176a52041ec9671f4c341cfdf49180ad3da8f6292f92eee";
export const V18_NL_DEF_HASH =
  "574b78411253f20a7f52a23ade7350a6277d632d14555775c5043bbbd05accca";
export const V18_NL_EXCLUSION = ["/checks/TECH-07"] as const;

export const F_READY_EN = {
  destinationCountry: "TH",
  locale: "en",
  optimization: "balanced" as const,
  profile: {
    ageYears: 30,
    lifeStage: "adult" as const,
    sex: "male" as const
  },
  requirements: {},
  targets: [
    {
      amount: 300,
      importance: "core" as const,
      name: "Magnesium",
      unit: "mg" as const
    }
  ]
};

export const F_READY_TH = {
  ...F_READY_EN,
  locale: "th"
};

export const LOCALE_PRESENTATION_ROOTS = [
  "/compactDecision/what",
  "/compactDecision/why",
  "/compactDecision/when"
] as const;

export const EXISTING_PRESENTATION_ROOTS = [
  "/locale",
  "/summary",
  "/reason",
  "/reasonKey",
  "/explanation",
  "/questions",
  "/safetyGuidance",
  "/options",
  "/nextActions"
] as const;

export const FORBIDDEN_DIFF_PREFIXES = [
  "/basket",
  "/coverage",
  "/canonical",
  "/orderSchedule",
  "/compactDecision/cost"
] as const;

export function v18Key(testId: string, run: 1 | 2, label: string) {
  const raw = `dev-l8-${testId}-${label}-r${run}`;
  return raw.padEnd(16, "0").slice(0, 48);
}

export const V18_TEST_IDS = [
  "DEV-LOC-001",
  "DEV-LOC-002",
  "DEV-LOC-003",
  "DEV-LOC-004",
  "DEV-MUT-001",
  "DEV-MUT-002",
  "DEV-MUT-003",
  "DEV-DET-001",
  "DEV-DET-002",
  "DEV-DET-003",
  "DEV-HYGIENE-01"
] as const;
