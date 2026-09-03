import { interpolatePercentile, TECH07_LIVE_BUDGET } from "@/lib/agentic/qa/latency-score";
import { RESPONSIBILITY_VERSION } from "@/lib/agentic/discovery/versions";

export type ScoreVerdict = Readonly<{
  assertionId: string;
  passed: boolean;
  reason: string;
}>;

const REAL_PRODUCT = /real[- ]product matching/i;
const STOCK_OVERLAP = /current-stock|current stock/i;
const OVERLAP = /overlap/i;
const WELLNESS_BOUNDARY = /wellness guidance only|not clinical/i;

export function scoreVal01(input: Readonly<{ description?: unknown }>): ScoreVerdict {
  const description = typeof input.description === "string" ? input.description : "";
  const words = description.trim().split(/\s+/).filter(Boolean).length;
  const hasMatching = REAL_PRODUCT.test(description);
  const hasStock = STOCK_OVERLAP.test(description);
  const hasOverlap = OVERLAP.test(description);
  const hasBoundary = WELLNESS_BOUNDARY.test(description);
  const passed =
    words > 0 &&
    words <= 60 &&
    hasMatching &&
    hasStock &&
    hasOverlap &&
    hasBoundary;
  return {
    assertionId: "VAL-01",
    passed,
    reason: passed
      ? "Connector copy states real-product matching, stock/overlap optimisation, and the wellness/not-clinical boundary."
      : `VAL-01 failed matching=${hasMatching} stock=${hasStock} overlap=${hasOverlap} boundary=${hasBoundary} words=${words}`
  };
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nested(record: unknown, path: readonly string[]): unknown {
  let current: unknown = record;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

export function scoreTech07(input: unknown): ScoreVerdict {
  const tech07 = nested(input, ["tech07"]) ?? input;
  const live =
    nested(tech07, ["live"]) ??
    nested(input, ["tech07", "live"]) ??
    nested(input, ["latencyProof", "tech07", "live"]);
  const samplesRaw =
    nested(live, ["samples"]) ??
    nested(input, ["plan_p95"]) ??
    nested(input, ["planSamples"]);
  const samples = Array.isArray(samplesRaw)
    ? samplesRaw.filter((item): item is number => typeof item === "number")
    : [];
  const n =
    readNumber(nested(live, ["n"])) ??
    readNumber(nested(input, ["n"])) ??
    samples.length;
  const concurrency =
    readNumber(nested(live, ["concurrency"])) ??
    readNumber(nested(input, ["concurrency"])) ??
    0;
  const p95Declared =
    readNumber(nested(live, ["p95Ms"])) ??
    readNumber(nested(input, ["plan_p95"])) ??
    (samples.length > 0 ? interpolatePercentile(samples, 95) : null);
  const p50Declared =
    readNumber(nested(live, ["p50Ms"])) ??
    readNumber(nested(input, ["plan_p50"])) ??
    (samples.length > 0 ? interpolatePercentile(samples, 50) : null);
  const p50 = p50Declared ?? Number.POSITIVE_INFINITY;
  const p95 = p95Declared ?? Number.POSITIVE_INFINITY;
  const passed =
    n === TECH07_LIVE_BUDGET.n &&
    concurrency === TECH07_LIVE_BUDGET.concurrency &&
    p50 <= TECH07_LIVE_BUDGET.p50BudgetMs &&
    p95 <= TECH07_LIVE_BUDGET.p95BudgetMs;
  return {
    assertionId: "TECH-07",
    passed,
    reason: passed
      ? "Live 30-plan concurrency-10 sample is inside written p50/p95 limits."
      : `TECH-07 failed n=${n} concurrency=${concurrency} p50=${p50} p95=${p95}`
  };
}

function contributionInputs(input: unknown) {
  const payment =
    readNumber(nested(input, ["paymentMinor"])) ??
    readNumber(nested(input, ["contribution", "paymentMinor"])) ??
    readNumber(nested(input, ["observe", "paymentMinor"]));
  const productCost =
    readNumber(nested(input, ["productCostMinor"])) ??
    readNumber(nested(input, ["contribution", "productCostMinor"]));
  const shipping =
    readNumber(nested(input, ["shippingSubsidyMinor"])) ??
    readNumber(nested(input, ["contribution", "shippingSubsidyMinor"])) ??
    0;
  const fee =
    readNumber(nested(input, ["paymentFeeMinor"])) ??
    readNumber(nested(input, ["contribution", "paymentFeeMinor"])) ??
    0;
  const acquisition =
    readNumber(nested(input, ["acquisitionMinor"])) ??
    readNumber(nested(input, ["contribution", "acquisitionMinor"]));
  const declared =
    readNumber(nested(input, ["contributionMinor"])) ??
    readNumber(nested(input, ["contribution", "contributionMinor"]));
  return { acquisition, declared, fee, payment, productCost, shipping };
}

export function scoreMkt09(input: unknown): ScoreVerdict {
  const values = contributionInputs(input);
  if (
    values.payment == null ||
    values.productCost == null ||
    values.acquisition == null
  ) {
    return {
      assertionId: "MKT-09",
      passed: false,
      reason: "MKT-09 missing authoritative payment, product cost, or acquisition."
    };
  }
  const expected =
    values.payment - values.productCost - values.shipping - values.fee - values.acquisition;
  const passed = values.declared === expected;
  return {
    assertionId: "MKT-09",
    passed,
    reason: passed
      ? `${values.payment} - ${values.productCost} - ${values.shipping} - ${values.fee} - ${values.acquisition} = ${expected}`
      : `MKT-09 expected ${expected} got ${values.declared}`
  };
}

const DOMAINS = ["guidance", "payment", "fulfilment", "support"] as const;

function collectVersions(input: unknown): string[] {
  const versions: string[] = [];
  const walk = (value: unknown) => {
    if (!value || typeof value !== "object") {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    const record = value as Record<string, unknown>;
    if (typeof record.responsibilityVersion === "string") {
      versions.push(record.responsibilityVersion);
    }
    if (record.responsibility && typeof record.responsibility === "object") {
      const nestedResp = record.responsibility as { version?: unknown };
      if (typeof nestedResp.version === "string") {
        versions.push(nestedResp.version);
      }
    }
    Object.values(record).forEach(walk);
  };
  walk(input);
  return versions;
}

function collectDomains(input: unknown): string[] {
  const found = new Set<string>();
  const walk = (value: unknown) => {
    if (!value || typeof value !== "object") {
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === "object" && typeof (item as { domain?: unknown }).domain === "string") {
          found.add(String((item as { domain: string }).domain));
        }
        walk(item);
      }
      return;
    }
    const record = value as Record<string, unknown>;
    for (const domain of DOMAINS) {
      if (typeof record[domain] === "string" && record[domain]) {
        found.add(domain);
      }
    }
    if (Array.isArray(record.domains)) {
      walk(record.domains);
    }
    if (record.responsibility) {
      walk(record.responsibility);
    }
    for (const child of Object.values(record)) {
      walk(child);
    }
  };
  walk(input);
  return [...found];
}

export function scoreTrust06(input: unknown): ScoreVerdict {
  const versions = [
    ...collectVersions(input),
    nested(input, ["info", "responsibilityVersion"]),
    nested(input, ["order", "responsibilityVersion"]),
    nested(input, ["responsibilityVersion"]),
    nested(input, ["checkout", "responsibility", "version"]),
    nested(input, ["responsibility", "version"])
  ].filter((item): item is string => typeof item === "string" && item.length > 0);
  const domains = collectDomains(input);
  const allVersioned = versions.length > 0 && versions.every((item) => item === RESPONSIBILITY_VERSION);
  const allDomains = DOMAINS.every((domain) => domains.includes(domain));
  const passed = allVersioned && allDomains;
  return {
    assertionId: "TRUST-06",
    passed,
    reason: passed
      ? "responsibility-3.0.0 is consistent across info/checkout/order and all four domains are present."
      : `TRUST-06 versions=${versions.join(",")} domains=${domains.join(",")}`
  };
}

export function scoreV3Assertions(input: Readonly<{
  contribution?: unknown;
  description?: unknown;
  latency?: unknown;
  responsibility?: unknown;
}>) {
  return [
    scoreVal01({ description: input.description }),
    scoreTech07(input.latency),
    scoreMkt09(input.contribution),
    scoreTrust06(input.responsibility)
  ];
}

export function canonicalScoreRows(rows: readonly ScoreVerdict[]) {
  return JSON.stringify(rows);
}
