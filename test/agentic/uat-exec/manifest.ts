export const UAT_EXEC_PACK =
  "MattaNutra UAT execute/order request-completion — DEV TDD Pack v1.0";
export const UAT_EXEC_BASELINE_SHA = "143335fe5661d0b23667026607ffbd31c80dcc42";
export const UAT_EXEC_SUCCESS_DEADLINE_MS = 60_000;
export const UAT_EXEC_CLIENT_DEADLINE_MS = 90_000;
export const UAT_EXEC_SCHEMA_CHECKSUM =
  "5a34f93589f374518b642359e0cbe1b419dcfb0230cdfe5e1f85fe95e32a63e6";
export const UAT_EXEC_PACK_HASH =
  "76e7b2763f75a9c1418fe8651b26ad81bc71d1de9fd4c2a6b6f6800d4435b2f8";
export const UAT_EXEC_RUNNER_HASH =
  "4e88c9bef7c80ea9e9bd38599c9eb4d90367659b185526d54b03689ee14a1320";
export const UAT_EXEC_LOCK_HASH =
  "d8d0ad9f2e0d3ad64176a52041ec9671f4c341cfdf49180ad3da8f6292f92eee";
export const UAT_EXEC_NL_DEF_HASH =
  "574b78411253f20a7f52a23ade7350a6277d632d14555775c5043bbbd05accca";
export const UAT_EXEC_NL_EXCLUSION = ["/checks/TECH-07"] as const;

export const UAT_EXEC_TEST_IDS = [
  "UAT-EXEC-HYGIENE-01",
  "UAT-EXEC-RED-01",
  "UAT-EXEC-RED-02",
  "UAT-EXEC-RED-03",
  "UAT-EXEC-RED-04",
  "UAT-EXEC-RED-05"
] as const;
