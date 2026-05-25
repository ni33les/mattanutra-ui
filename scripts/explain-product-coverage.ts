import { closeSqlPool, getSql } from "@/lib/db";
import { normalizeProductFactKey } from "@/lib/product-recommendations";

type JsonRecord = Record<string, unknown>;

function argValue(name: string) {
  const prefix = `--${name}=`;
  const directIndex = process.argv.indexOf(`--${name}`);

  if (directIndex >= 0) {
    return process.argv[directIndex + 1] ?? "";
  }

  return process.argv
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length) ?? null;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function recordRows(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter(isRecord)
    : [];
}

function textValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizedText(value: unknown) {
  return normalizeProductFactKey(String(value ?? ""));
}

function valueMatchesNeed(value: unknown, query: string | null) {
  if (!query) {
    return true;
  }

  const haystack = normalizedText(value);
  const needle = normalizedText(query);

  return Boolean(haystack && needle && haystack.includes(needle));
}

function needMatches(need: JsonRecord, query: string | null) {
  if (!query) {
    return true;
  }

  return (
    valueMatchesNeed(need.id, query) ||
    valueMatchesNeed(need.sourceId, query) ||
    valueMatchesNeed(need.displayName, query)
  );
}

function uniqueRows(rows: JsonRecord[]) {
  const seen = new Set<string>();
  const unique: JsonRecord[] = [];

  for (const row of rows) {
    const key = [
      textValue(row.productId),
      textValue(row.title),
      textValue(row.reason)
    ].join("|");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(row);
  }

  return unique;
}

function compactContext(answers: JsonRecord, diagnostics: JsonRecord) {
  const contextSignals = isRecord(diagnostics.trace)
    ? diagnostics.trace.contextSignals
    : null;
  const traceContext = isRecord(contextSignals) ? contextSignals : {};

  return {
    conditions: traceContext.conditions ?? answers.conditions ?? null,
    lifestage: traceContext.lifestage ?? answers.reproStatus ?? null,
    medicationTypes: traceContext.medicationTypes ?? answers.medTypes ?? null,
    medications: traceContext.medications ?? answers.meds ?? null,
    sex: answers.sex ?? null
  };
}

function renderText(report: JsonRecord) {
  const selected = recordRows(report.selectedProducts);
  const needs = recordRows(report.needs);
  const relatedProducts = recordRows(report.relatedProducts);
  const lines = [
    `Product coverage: plan ${report.planId}`,
    `Run: ${report.recommendationRunId ?? "missing"} (${report.generatedAt ?? "not generated"})`,
    `Coverage: ${report.supplementProductCoveragePercent ?? 0}% supplement products, ${report.totalCoveragePercent ?? 0}% total`,
    `Context: ${JSON.stringify(report.clientContext)}`
  ];

  if (selected.length > 0) {
    lines.push("", "Selected products:");
    for (const item of selected) {
      const covered = Array.isArray(item.coveredNeeds)
        ? item.coveredNeeds.join(", ")
        : "";

      lines.push(
        `- #${item.rank} ${item.title} (${item.productCoveragePercent}% product fit, ${item.stackContributionPercent}% stack): ${covered}`
      );
    }
  }

  lines.push("", report.needQuery ? `Need focus: ${report.needQuery}` : "Needs:");

  for (const need of needs) {
    const reason = textValue(need.bestRejectedReason);
    const product = textValue(need.bestRejectedProductTitle);
    const detail = [
      `${need.coveragePercent}% covered`,
      reason ? reason : null,
      product ? `candidate: ${product}` : null
    ].filter(Boolean).join("; ");

    lines.push(`- ${need.displayName}: ${detail}`);
  }

  if (relatedProducts.length > 0) {
    lines.push("", "Related rejected or near-miss products:");
    for (const product of relatedProducts.slice(0, 12)) {
      lines.push(`- ${product.title}: ${product.reason}`);
    }
  }

  return lines.join("\n");
}

const planId = argValue("plan");
const needQuery = argValue("need");
const jsonOutput = process.argv.includes("--json");

if (!planId) {
  throw new Error("Usage: npm run coverage:explain -- --plan=<uuid> [--need=ashwagandha] [--json]");
}

const sql = getSql();

if (!sql) {
  throw new Error("DB_CONNECTION is not configured");
}

try {
  const runRows = await sql<Array<{
    client_needs: unknown;
    diagnostics: unknown;
    exclusions: unknown;
    generated_at: Date | string;
    id: string;
    stack_coverage_percent: string | number;
    supplement_product_coverage_percent: string | number;
    total_coverage_percent: string | number;
  }>>`
    select
      id::text,
      client_needs,
      exclusions,
      diagnostics,
      stack_coverage_percent,
      supplement_product_coverage_percent,
      total_coverage_percent,
      generated_at
    from public.product_recommendation_runs
    where plan_id = ${planId}::uuid
    order by generated_at desc
    limit 1
  `;
  const run = runRows[0];

  if (!run) {
    throw new Error(`No product recommendation run found for plan ${planId}`);
  }

  const [assessment] = await sql<Array<{ answers: unknown }>>`
    select answers
    from public.assessments
    where plan_id = ${planId}::uuid
    limit 1
  `;
  const selectedRows = await sql<Array<{
    covered_needs: unknown;
    product_coverage_percent: string | number;
    rank: number;
    stack_contribution_percent: string | number;
    title: string;
  }>>`
    select
      product_recommendation_items.rank,
      products.title,
      product_recommendation_items.product_coverage_percent,
      product_recommendation_items.stack_contribution_percent,
      product_recommendation_items.covered_needs
    from public.product_recommendation_items
    join public.products
      on products.id = product_recommendation_items.product_id
    where product_recommendation_items.run_id = ${run.id}::uuid
    order by product_recommendation_items.rank
  `;
  const diagnostics = isRecord(run.diagnostics) ? run.diagnostics : {};
  const answers = isRecord(assessment?.answers) ? assessment.answers : {};
  const diagnosticNeeds = [
    ...recordRows(diagnostics.matchedNeeds),
    ...recordRows(diagnostics.unmatchedNeeds)
  ];
  const shortfalls = recordRows(isRecord(diagnostics.trace) ? diagnostics.trace.shortfalls : null);
  const bestRejectedTitles = new Map(
    [
      ...recordRows(diagnostics.blockedProducts),
      ...recordRows(run.exclusions)
    ]
      .filter((row) => typeof row.productId === "string")
      .map((row) => [String(row.productId), textValue(row.title)])
  );
  const needs = recordRows(run.client_needs)
    .filter((need) => needMatches(need, needQuery))
    .map((need) => {
      const diagnostic = diagnosticNeeds.find((item) =>
        textValue(item.id) === textValue(need.id)
      );
      const shortfall = shortfalls.find((item) =>
        textValue(item.id) === textValue(need.id)
      );
      const bestRejectedProductId =
        textValue(diagnostic?.bestRejectedProductId) || null;

      return {
        bestRejectedProductId,
        bestRejectedProductTitle: bestRejectedProductId
          ? bestRejectedTitles.get(bestRejectedProductId) ?? null
          : null,
        bestRejectedReason: textValue(diagnostic?.bestRejectedReason) || null,
        coveragePercent: numberValue(
          diagnostic?.coveragePercent ?? shortfall?.coveragePercent
        ),
        displayName: textValue(need.displayName),
        id: textValue(need.id),
        sourceId: textValue(need.sourceId),
        targetText: textValue(need.targetText),
        weight: numberValue(need.weight)
      };
    });
  const relatedProducts = uniqueRows([
    ...recordRows(diagnostics.blockedProducts),
    ...recordRows(diagnostics.nearMisses),
    ...recordRows(run.exclusions)
  ])
    .filter((row) =>
      !needQuery ||
      valueMatchesNeed(row.title, needQuery) ||
      valueMatchesNeed(row.reason, needQuery)
    )
    .map((row) => ({
      productId: textValue(row.productId),
      reason: textValue(row.reason),
      title: textValue(row.title)
    }));
  const explainedNeeds = needs.map((need) => {
    const related = needQuery ? relatedProducts[0] : null;
    const genericMissingReason =
      need.bestRejectedReason ===
      "No approved product in the catalogue covers this need";

    return related && genericMissingReason
      ? {
          ...need,
          bestRejectedProductId: related.productId || need.bestRejectedProductId,
          bestRejectedProductTitle: related.title || need.bestRejectedProductTitle,
          bestRejectedReason: related.reason || need.bestRejectedReason
        }
      : need;
  });
  const report = {
    clientContext: compactContext(answers, diagnostics),
    generatedAt: new Date(run.generated_at).toISOString(),
    needQuery,
    needs: explainedNeeds,
    planId,
    recommendationRunId: run.id,
    relatedProducts,
    selectedProducts: selectedRows.map((row) => ({
      coveredNeeds: recordRows(row.covered_needs).map((need) =>
        textValue(need.displayName || need.sourceId || need.id)
      ),
      productCoveragePercent: numberValue(row.product_coverage_percent),
      rank: row.rank,
      stackContributionPercent: numberValue(row.stack_contribution_percent),
      title: row.title
    })),
    stackCoveragePercent: numberValue(run.stack_coverage_percent),
    supplementProductCoveragePercent: numberValue(
      run.supplement_product_coverage_percent
    ),
    totalCoveragePercent: numberValue(run.total_coverage_percent)
  };

  console.log(jsonOutput ? JSON.stringify(report, null, 2) : renderText(report));
} finally {
  await closeSqlPool();
}
