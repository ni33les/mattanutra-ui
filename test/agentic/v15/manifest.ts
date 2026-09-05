export const V15_PACK = "MattaNutra DEV TDD Pack v1.5";
export const V15_CLOCK_00 = "2026-09-02T00:00:00.000Z";
export const V15_CLOCK_09 = "2026-09-02T09:00:00.000Z";
export const V15_CLOCK_10 = "2026-09-02T09:10:00.000Z";
export const V15_CLOCK_20 = "2026-09-02T09:20:00.000Z";
export const V15_CLOCK_30 = "2026-09-02T09:30:00.000Z";
export const V15_CLOCK_40 = "2026-09-02T09:40:00.000Z";

export const V15_FUNNEL = [
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

export const V15_SEQUENCES = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export const V15_CLOCK_IDS = [
  "CLOCK-RED-01",
  "CLOCK-RED-02",
  "CLOCK-RED-03",
  "CLOCK-RED-04",
  "CLOCK-RED-05",
  "CLOCK-RED-06",
  "CLOCK-RED-07",
  "CLOCK-RED-08"
] as const;

export const V15_EVENT_IDS = [
  "EVENT-RED-01",
  "EVENT-RED-02",
  "EVENT-RED-03",
  "EVENT-RED-04",
  "EVENT-RED-05",
  "EVENT-RED-06",
  "EVENT-RED-07",
  "EVENT-RED-08"
] as const;

export const V15_COUNT_IDS = [
  "COUNT-RED-01",
  "COUNT-RED-02",
  "COUNT-RED-03",
  "COUNT-RED-04",
  "COUNT-RED-05",
  "COUNT-RED-06",
  "COUNT-RED-07",
  "COUNT-RED-08",
  "COUNT-RED-09",
  "COUNT-RED-10"
] as const;

export const V15_JOIN_IDS = [
  "JOIN-NL-01",
  "JOIN-NL-02",
  "JOIN-NL-03",
  "JOIN-NL-04",
  "JOIN-NL-05",
  "JOIN-NL-06",
  "JOIN-NL-07",
  "JOIN-NL-08",
  "JOIN-NL-09"
] as const;

export const V15_TEST_IDS = [
  ...V15_CLOCK_IDS,
  ...V15_EVENT_IDS,
  ...V15_COUNT_IDS,
  ...V15_JOIN_IDS
] as const;
