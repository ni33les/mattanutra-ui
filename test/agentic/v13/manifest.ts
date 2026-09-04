export const V13_PACK = "MattaNutra DEV TDD Pack v1.3";
export const V13_CLOCK_00 = "2026-09-02T00:00:00.000Z";
export const V13_CLOCK_09 = "2026-09-02T09:00:00.000Z";
export const V13_CLOCK_40 = "2026-09-02T09:40:00.000Z";
export const V13_EXPIRY_09_15 = "2026-09-02T09:15:00.000Z";
export const V13_EXPIRY_00_15 = "2026-09-02T00:15:00.000Z";
export const V13_ACQUISITION = 1000;
export const V13_FEE = 0;
export const V13_SUBSIDY = 0;

export const V13_FUNNEL = [
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

export const V13_SEQUENCES = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export const V13_CTX_IDS = [
  "CTX-RED-01",
  "CTX-RED-02",
  "CTX-RED-03",
  "CTX-RED-04",
  "CTX-RED-05",
  "CTX-RED-06",
  "CTX-RED-07",
  "CTX-RED-08"
] as const;

export const V13_OBS_IDS = [
  "OBS-RED-01",
  "OBS-RED-02",
  "OBS-RED-03",
  "OBS-RED-04",
  "OBS-RED-05",
  "OBS-RED-06",
  "OBS-RED-07"
] as const;

export const V13_LAT_IDS = [
  "LAT-ATTR-01",
  "LAT-ATTR-02",
  "LAT-ATTR-03"
] as const;

export const V13_JOIN_IDS = [
  "JOIN-DET-01",
  "JOIN-DET-02",
  "JOIN-DET-03",
  "JOIN-DET-04",
  "JOIN-DET-05",
  "JOIN-DET-06",
  "JOIN-DET-07"
] as const;

export const V13_TEST_IDS = [
  ...V13_CTX_IDS,
  ...V13_OBS_IDS,
  ...V13_LAT_IDS,
  ...V13_JOIN_IDS
] as const;
