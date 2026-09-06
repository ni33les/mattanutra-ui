export const UAT_NL_PACK = "MattaNutra UAT Non-Latency Remediation — DEV TDD Pack v1.0";
export const UAT_NL_BASELINE_SHA = "cbb81ea3b0b02c8a29fbb7b6064add6c91843285";
export const UAT_NL_CLOCK = "2026-09-02T09:00:00.000Z";
export const UAT_NL_SUCCESS_DEADLINE_MS = 60_000;
export const UAT_NL_CLIENT_DEADLINE_MS = 90_000;

export const UAT_NL_PACK_HASH =
  "76e7b2763f75a9c1418fe8651b26ad81bc71d1de9fd4c2a6b6f6800d4435b2f8";
export const UAT_NL_RUNNER_HASH =
  "4e88c9bef7c80ea9e9bd38599c9eb4d90367659b185526d54b03689ee14a1320";
export const UAT_NL_LOCK_HASH =
  "d8d0ad9f2e0d3ad64176a52041ec9671f4c341cfdf49180ad3da8f6292f92eee";
export const UAT_NL_NL_DEF_HASH =
  "574b78411253f20a7f52a23ade7350a6277d632d14555775c5043bbbd05accca";
export const UAT_NL_SCHEMA_CHECKSUM =
  "5a34f93589f374518b642359e0cbe1b419dcfb0230cdfe5e1f85fe95e32a63e6";

export const UAT_NL_NL_EXCLUSION = ["/checks/TECH-07"] as const;

export const F_READY = {
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

export const ESTABLISHED_COUNTERS = {
  catalogueSnapshots: 1,
  planMatchHits: 1,
  planMatchMisses: 0,
  "queries.catalogue.snapshot.TH": 1,
  "queries.plan.match": 1,
  "queries.plan.match.hit": 1
} as const;

export function uatNlFreshKey(repeat: 1 | 2, index: number) {
  return `dev-uat-nl-r${repeat}-fresh-${String(index).padStart(2, "0")}-0001`;
}

export const UAT_NL_T02_IDS = [
  "UAT-NL-T02-RED-01",
  "UAT-NL-T02-RED-02",
  "UAT-NL-T02-RED-03",
  "UAT-NL-T02-RED-04",
  "UAT-NL-T02-RED-05"
] as const;

export const UAT_NL_MKT10_IDS = [
  "UAT-NL-MKT10-RED-01",
  "UAT-NL-MKT10-RED-02",
  "UAT-NL-MKT10-RED-03",
  "UAT-NL-MKT10-RED-04",
  "UAT-NL-MKT10-RED-05"
] as const;

export const UAT_NL_X_IDS = [
  "UAT-NL-X-RED-01",
  "UAT-NL-X-RED-02",
  "UAT-NL-X-RED-03"
] as const;

export const UAT_NL_TEST_IDS = [
  ...UAT_NL_T02_IDS,
  ...UAT_NL_MKT10_IDS,
  ...UAT_NL_X_IDS
] as const;
