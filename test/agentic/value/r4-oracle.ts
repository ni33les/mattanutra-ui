import { canonicalHash } from "../../../lib/agentic/value/canonical.ts";
import { asRecord, stringList } from "./impl-evidence.ts";
import { questionsOf, safetyGuidanceOf } from "./impl-harness.ts";
import { scheduleOf } from "./r3-oracle.ts";

export function economicsOf(plan: Record<string, unknown>) {
  const options = Array.isArray(plan.options) ? plan.options.map(asRecord) : [];
  const recommended = options.find((item) => item.recommended) ?? options[0];
  return asRecord(recommended?.economics ?? plan);
}

export function magCoverage(plan: Record<string, unknown>) {
  const rows = Array.isArray(plan.coverage) ? plan.coverage.map(asRecord) : [];
  return rows.find((row) => /magnesium/i.test(String(row.name))) ?? null;
}

export function durationQuestions(plan: Record<string, unknown>) {
  return questionsOf(plan).filter((row) => {
    const blob = `${row.questionId ?? ""} ${row.prompt ?? ""} ${row.promptKey ?? ""}`;
    return (
      String(row.questionId).startsWith("q_inventory_duration_") ||
      /daysremaining|inventory_duration|days remaining|stock.*last|how long/i.test(blob)
    );
  });
}

export function questionChoices(question: Record<string, unknown> | undefined) {
  return Array.isArray(question?.choices) ? question!.choices.map(asRecord) : [];
}

export function daysChoice(question: Record<string, unknown> | undefined, days: number) {
  const found = questionChoices(question).find((item) => {
    const token = String(item.choice ?? "");
    return token === `days:${days}` || token === String(days) || token === `daysRemaining:${days}`;
  });
  return found ? String(found.choice) : `days:${days}`;
}

export function unknownDurationChoice(question: Record<string, unknown> | undefined) {
  const found = questionChoices(question).find((item) =>
    /unknown/i.test(`${item.choice ?? ""} ${item.label ?? ""}`)
  );
  return found ? String(found.choice) : "unknown";
}

export function rawSchedule(plan: Record<string, unknown>, horizon: number) {
  const schedule = asRecord(plan.orderSchedule);
  const bucket = schedule[String(horizon)];
  if (Array.isArray(bucket)) {
    return bucket.map(asRecord);
  }
  const nested = asRecord(bucket);
  if (Array.isArray(nested.orders)) {
    return nested.orders.map(asRecord);
  }
  if (Array.isArray(nested.events)) {
    return nested.events.map(asRecord);
  }
  return [];
}

export function scheduleUnavailable(plan: Record<string, unknown>, horizon: number) {
  const schedule = asRecord(plan.orderSchedule);
  if (!("orderSchedule" in plan) || plan.orderSchedule == null) {
    return true;
  }
  const bucket = schedule[String(horizon)];
  if (bucket == null) {
    return true;
  }
  if (Array.isArray(bucket)) {
    return false;
  }
  const nested = asRecord(bucket);
  if (nested.available === false) {
    return true;
  }
  const reason = String(nested.unavailableReason ?? nested.reasonCode ?? nested.reason ?? "");
  return reason.length > 0 && !Array.isArray(nested.orders) && !Array.isArray(nested.events);
}

export function authoritativeEmptySchedule(plan: Record<string, unknown>, horizon: number) {
  const schedule = asRecord(plan.orderSchedule);
  const bucket = schedule[String(horizon)];
  return Array.isArray(bucket) && bucket.length === 0;
}

export function cashValue(plan: Record<string, unknown>, key: "cash30DayMinor" | "cash90DayMinor") {
  const economics = economicsOf(plan);
  if (key in plan) {
    return plan[key];
  }
  if (key in economics) {
    return economics[key];
  }
  return null;
}

export function cashIsNullNotZero(plan: Record<string, unknown>, key: "cash30DayMinor" | "cash90DayMinor") {
  const value = cashValue(plan, key);
  return value == null && value !== 0;
}

export function durationReasons(plan: Record<string, unknown>) {
  const economics = economicsOf(plan);
  const rows = [
    ...(Array.isArray(plan.unavailableReasons) ? plan.unavailableReasons : []),
    ...(Array.isArray(economics.unavailableReasons) ? economics.unavailableReasons : [])
  ].map(asRecord);
  return rows.filter((row) => {
    const names = stringList(row.missingFieldNames);
    const code = String(row.reasonCode ?? "");
    return (
      code === "current_inventory_duration_unknown" ||
      names.includes("daysRemaining") ||
      /duration/i.test(code)
    );
  });
}

export function futureCoverageClaim(plan: Record<string, unknown>) {
  const blob = JSON.stringify(plan).toLowerCase();
  if (blob.includes("no_purchase_for_horizon")) {
    return "no_purchase_for_horizon";
  }
  const reason = String(plan.reasonCode ?? asRecord(plan.explanation).reasonCode ?? "");
  if (reason === "lowest_cost") {
    return "lowest_cost";
  }
  const completeZero =
    (plan.cashComplete === true || economicsOf(plan).cashComplete === true) &&
    Number(cashValue(plan, "cash30DayMinor") ?? 0) === 0 &&
    Number(cashValue(plan, "cash90DayMinor") ?? 0) === 0 &&
    authoritativeEmptySchedule(plan, 30) &&
    authoritativeEmptySchedule(plan, 90);
  if (completeZero && (plan.status === "no_purchase" || reason === "current_inventory_covers_now")) {
    return "authoritative_empty_horizon";
  }
  return null;
}

export function presentCoverageAvailable(plan: Record<string, unknown>) {
  const row = magCoverage(plan);
  return (
    row != null &&
    Number(row.currentAmount) === 300 &&
    String(row.unit) === "mg" &&
    (row.status === "already_covered" || row.status === "covered" || row.status === "over_target")
  );
}

export function presentSafetyAvailable(plan: Record<string, unknown>) {
  const row = magCoverage(plan);
  const blocked = Array.isArray(plan.safetyGuidance)
    ? plan.safetyGuidance
        .map(asRecord)
        .some((item) => item.action === "block" && /magnesium/i.test(String(item.nutrientName ?? "")))
    : false;
  return (
    row != null &&
    Number(row.totalExposureAmount) === Number(row.currentAmount) &&
    Number(row.currentAmount) === 300 &&
    plan.status !== "blocked" &&
    !blocked
  );
}

export function serviceCanonicalHash(plan: Record<string, unknown>) {
  return String(asRecord(plan.canonical).hash ?? "");
}

export function narrativeBlob(plan: Record<string, unknown>) {
  const explanation = asRecord(plan.explanation);
  return `${plan.summary ?? ""} ${plan.reason ?? ""} ${explanation.nextAction ?? ""} ${plan.summaryKey ?? ""}`.toLowerCase();
}

export function independentLineConsumption(item: Record<string, unknown>, horizonDays: number) {
  const servingsPerPack = Number(item.servingsPerPack);
  const servingsPerDay = Number(item.servingsPerDay);
  const unitPriceMinor = Number(item.unitPriceMinor);
  if (
    !Number.isFinite(servingsPerPack) ||
    servingsPerPack <= 0 ||
    !Number.isFinite(servingsPerDay) ||
    servingsPerDay <= 0 ||
    !Number.isFinite(unitPriceMinor) ||
    unitPriceMinor <= 0
  ) {
    return null;
  }
  return Math.round((unitPriceMinor / servingsPerPack) * horizonDays * servingsPerDay);
}

export function independentBasketConsumption(
  items: readonly Record<string, unknown>[],
  horizonDays: number
) {
  const parts = items.map((item) => independentLineConsumption(item, horizonDays));
  if (parts.length < 1) {
    return 0;
  }
  if (parts.some((item) => item == null)) {
    return null;
  }
  return parts.reduce((sum, item) => sum + (item ?? 0), 0);
}

export function consumptionReasons(plan: Record<string, unknown>) {
  const economics = economicsOf(plan);
  const rows = [
    ...(Array.isArray(plan.unavailableReasons) ? plan.unavailableReasons : []),
    ...(Array.isArray(economics.unavailableReasons) ? economics.unavailableReasons : [])
  ].map(asRecord);
  return rows.filter((row) => {
    const names = stringList(row.missingFieldNames);
    const code = String(row.reasonCode ?? "");
    return (
      code === "current_inventory_acquisition_cost_unknown" ||
      names.includes("acquisitionCost") ||
      /acquisition/i.test(code)
    );
  });
}

export function optionRecords(plan: Record<string, unknown>) {
  return Array.isArray(plan.options) ? plan.options.map(asRecord) : [];
}

function contributorIdentity(item: Record<string, unknown>) {
  return {
    amount: item.amount ?? null,
    productId: item.productId ?? null,
    productName: item.productName ?? null,
    source: item.source ?? null,
    unit: item.unit ?? null
  };
}

function sortContributors(items: readonly Record<string, unknown>[]) {
  return [...items]
    .map(contributorIdentity)
    .sort(
      (left, right) =>
        String(left.source).localeCompare(String(right.source)) ||
        String(left.productId).localeCompare(String(right.productId)) ||
        String(left.productName).localeCompare(String(right.productName)) ||
        Number(left.amount) - Number(right.amount)
    );
}

function safetyComparator(row: Record<string, unknown>) {
  if (typeof row.comparator === "string" && row.comparator.length > 0) {
    return row.comparator;
  }
  if (row.threshold == null || row.exposure == null) {
    return null;
  }
  if (row.action === "block") {
    return "gt";
  }
  if (row.action === "acknowledge") {
    return "gte";
  }
  return "lt";
}

export function independentSafetyCanonical(plan: Record<string, unknown>) {
  const coverage = (Array.isArray(plan.coverage) ? plan.coverage.map(asRecord) : [])
    .map((row) => ({
      contributors: sortContributors(Array.isArray(row.contributors) ? row.contributors.map(asRecord) : []),
      currentAmount: row.currentAmount ?? null,
      population: row.populationScope ?? row.population ?? null,
      requestedAmount: row.requestedAmount ?? null,
      ruleId: row.ruleId ?? null,
      rulesVersion: row.rulesVersion ?? null,
      status: row.status ?? null,
      supplementId: row.supplementId ?? null,
      totalExposureAmount: row.totalExposureAmount ?? null,
      threshold: row.upperLimitAmount ?? row.threshold ?? null,
      unit: row.unit ?? null
    }))
    .sort((left, right) => String(left.supplementId).localeCompare(String(right.supplementId)));
  const safety = safetyGuidanceOf(plan)
    .map((row) => ({
      action: row.action ?? null,
      comparator: safetyComparator(row),
      contributors: sortContributors(Array.isArray(row.contributors) ? row.contributors.map(asRecord) : []),
      exposure: row.exposure ?? null,
      nutrientName: row.nutrientName ?? null,
      population: row.populationScope ?? row.population ?? null,
      ruleId: row.ruleId ?? null,
      rulesVersion: row.rulesVersion ?? null,
      severity: row.severity ?? null,
      supplementIds: stringList(row.supplementIds).slice().sort(),
      threshold: row.threshold ?? null,
      unit: row.unit ?? null
    }))
    .sort(
      (left, right) =>
        String(left.ruleId).localeCompare(String(right.ruleId)) ||
        String(left.action).localeCompare(String(right.action)) ||
        String(left.nutrientName).localeCompare(String(right.nutrientName))
    );
  return {
    coverage,
    safety,
    status: plan.status ?? null
  };
}

export function independentSafetyHash(plan: Record<string, unknown>) {
  return canonicalHash(independentSafetyCanonical(plan));
}

export { scheduleOf };
