export const V16_PACK = "MattaNutra DEV TDD Implementation Brief v1.6";
export const V16_BASELINE = "6c5d20ef477cf53644bed4b10f6b3e0e8e7e8268";
export const V16_CLOCK_09 = "2026-09-02T09:00:00.000Z";
export const V16_SUCCESS_DEADLINE_MS = 60_000;
export const V16_HARD_DEADLINE_MS = 75_000;
export const V16_CLIENT_DEADLINE_MS = 90_000;

export const V16_PACK_HASH =
  "76e7b2763f75a9c1418fe8651b26ad81bc71d1de9fd4c2a6b6f6800d4435b2f8";
export const V16_RUNNER_HASH =
  "4e88c9bef7c80ea9e9bd38599c9eb4d90367659b185526d54b03689ee14a1320";
export const V16_LOCK_HASH =
  "d8d0ad9f2e0d3ad64176a52041ec9671f4c341cfdf49180ad3da8f6292f92eee";
export const V16_NL_DEF_HASH =
  "574b78411253f20a7f52a23ade7350a6277d632d14555775c5043bbbd05accca";

export const V16_NL_EXCLUSION = ["/checks/TECH-07"] as const;

export const F_READY_MAG = {
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

export function v16FreshKey(repeat: 1 | 2, index: number) {
  return `dev-l2-r${repeat}-fresh-${String(index).padStart(2, "0")}-0001`;
}

export const V16_PLAN_IDS = [
  "L2-PLAN-RED-01",
  "L2-PLAN-RED-02",
  "L2-PLAN-RED-03",
  "L2-PLAN-RED-04",
  "L2-PLAN-RED-05",
  "L2-PLAN-RED-06",
  "L2-PLAN-RED-07",
  "L2-PLAN-RED-08",
  "L2-PLAN-RED-09"
] as const;

export const V16_OBS_IDS = ["L2-OBS-RED-01"] as const;

export const V16_NL_IDS = [
  "L2-NL-REG-01",
  "L2-NL-REG-02",
  "L2-NL-REG-03",
  "L2-NL-REG-04",
  "L2-NL-REG-05"
] as const;

export const V16_HYGIENE_IDS = [
  "L2-HYGIENE-01",
  "L2-HYGIENE-02",
  "L2-HYGIENE-03"
] as const;

export const V16_TEST_IDS = [
  ...V16_PLAN_IDS,
  ...V16_OBS_IDS,
  ...V16_NL_IDS,
  ...V16_HYGIENE_IDS
] as const;
