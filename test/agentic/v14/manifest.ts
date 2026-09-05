export const V14_PACK = "MattaNutra DEV TDD Pack v1.4";
export const V14_CLOCK_00 = "2026-09-02T00:00:00.000Z";
export const V14_CLOCK_09 = "2026-09-02T09:00:00.000Z";
export const V14_CLIENT_DEADLINE_MS = 90_000;
export const V14_BEGIN_RUN_GROUPS = 11;
export const V14_BEGIN_RUN_WAVE = 8;

export const V14_ATTR_IDS = [
  "ATTR-RED-01",
  "ATTR-RED-02",
  "ATTR-RED-03",
  "ATTR-RED-04",
  "ATTR-RED-05"
] as const;

export const V14_QA_IDS = [
  "QA-RC-RED-01",
  "QA-RC-RED-02",
  "QA-RC-RED-03",
  "QA-RC-RED-04",
  "QA-RC-RED-05",
  "QA-RC-RED-06",
  "QA-RC-RED-07"
] as const;

export const V14_EXEC_IDS = [
  "EXEC-RC-RED-01",
  "EXEC-RC-RED-02",
  "EXEC-RC-RED-03",
  "EXEC-RC-RED-04",
  "EXEC-RC-RED-05",
  "EXEC-RC-RED-06",
  "EXEC-RC-RED-07"
] as const;

export const V14_CAP_IDS = [
  "CAP-RC-RED-01",
  "CAP-RC-RED-02",
  "CAP-RC-RED-03",
  "CAP-RC-RED-04",
  "CAP-RC-RED-05",
  "CAP-RC-RED-06"
] as const;

export const V14_DEADLINE_IDS = [
  "DEADLINE-RED-01",
  "DEADLINE-RED-02",
  "DEADLINE-RED-03",
  "DEADLINE-RED-04",
  "DEADLINE-RED-05"
] as const;

export const V14_EDGE_IDS = [
  "EDGE-RC-RED-01",
  "EDGE-RC-RED-02",
  "EDGE-RC-RED-03",
  "EDGE-RC-RED-04"
] as const;

export const V14_JOIN_IDS = [
  "JOIN-RC-01",
  "JOIN-RC-02",
  "JOIN-RC-03",
  "JOIN-RC-04",
  "JOIN-RC-05",
  "JOIN-RC-06",
  "JOIN-RC-07",
  "JOIN-RC-08"
] as const;

export const V14_TEST_IDS = [
  ...V14_ATTR_IDS,
  ...V14_QA_IDS,
  ...V14_EXEC_IDS,
  ...V14_CAP_IDS,
  ...V14_DEADLINE_IDS,
  ...V14_EDGE_IDS,
  ...V14_JOIN_IDS
] as const;
