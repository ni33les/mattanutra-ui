export const V12_PACK = "MattaNutra DEV TDD Pack v1.2";
export const V12_CLOCK_00 = "2026-09-02T00:00:00.000Z";
export const V12_CLOCK_09 = "2026-09-02T09:00:00.000Z";
export const V12_CLOCK_10 = "2026-09-02T09:10:00.000Z";
export const V12_CLOCK_20 = "2026-09-02T09:20:00.000Z";
export const V12_CLOCK_30 = "2026-09-02T09:30:00.000Z";
export const V12_CLOCK_40 = "2026-09-02T09:40:00.000Z";
export const V12_EXPIRY_09_15 = "2026-09-02T09:15:00.000Z";
export const V12_ACQUISITION = 1000;
export const V12_PAYMENT = 39800;
export const V12_PRODUCT_COST = 34800;
export const V12_CONTRIBUTION = 4000;
export const V12_SUBSIDY = 0;
export const V12_FEE = 0;

export const V12_FUNNEL = [
  "connector_viewed",
  "connected",
  "plan_ready",
  "confirmed",
  "checkout_created",
  "payment_declined",
  "paid",
  "dispatched",
  "delivered"
] as const;

export const V12_SEQUENCES = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export const V12_CTX_IDS = [
  "CTX-RED-01",
  "CTX-RED-02",
  "CTX-RED-03",
  "CTX-RED-04",
  "CTX-RED-05",
  "CTX-RED-06",
  "CTX-RED-07"
] as const;

export const V12_SEQ_IDS = [
  "SEQ-RED-01",
  "SEQ-RED-02",
  "SEQ-RED-03",
  "SEQ-RED-04",
  "SEQ-RED-05",
  "SEQ-RED-06"
] as const;

export const V12_OBS_IDS = [
  "OBS-RED-01",
  "OBS-RED-02",
  "OBS-RED-03",
  "OBS-RED-04",
  "OBS-RED-05",
  "OBS-RED-06",
  "OBS-RED-07"
] as const;

export const V12_AB_IDS = [
  "AB-DET-01",
  "AB-DET-02",
  "AB-DET-03",
  "AB-DET-04",
  "AB-DET-05",
  "AB-DET-06",
  "AB-DET-07",
  "AB-DET-08"
] as const;

export const V12_TEST_IDS = [
  ...V12_CTX_IDS,
  ...V12_SEQ_IDS,
  ...V12_OBS_IDS,
  ...V12_AB_IDS
] as const;

export const V12_SCHEDULES = ["S1", "S2", "S3", "S4", "S5"] as const;
