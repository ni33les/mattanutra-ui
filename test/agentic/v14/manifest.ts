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

export const V14_TEST_IDS = [...V14_ATTR_IDS, ...V14_QA_IDS, ...V14_EXEC_IDS] as const;
