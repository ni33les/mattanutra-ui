import type postgres from "postgres";
import { parseDose, type DoseUnit } from "@/lib/dose-conversion";
import type {
  FormulationBlueprint,
  LocalizedText
} from "@/lib/formulation-types";
import type {
  ProductRecommendationDiagnostics,
  ProductRecommendationExclusion,
  ProductRecommendationResult
} from "@/lib/product-recommendations";
import { toJsonValue } from "@/lib/assessment-store";

type Db = postgres.Sql | postgres.TransactionSql;

export type SupplementDoseParseStatus = "parsed" | "unparsed";
export type ProductDecisionOutcome = "chosen" | "near_miss" | "rejected";

export type SupplementSelectionProjection = Readonly<{
  category: string;
  dailyDose: Record<string, string>;
  dailyDoseText: string;
  doseAmount: number | null;
  doseParseStatus: SupplementDoseParseStatus;
  doseUnit: DoseUnit | null;
  effectivenessRank: number;
  itemId: string;
  safetyAction: string | null;
  safetyVisibility: string | null;
  status: string;
  supplementKey: string;
  supplementName: Record<string, string>;
  supplementNameText: string;
}>;

export type ProductDecisionProjection = Readonly<{
  coveredNeeds: unknown[];
  currency: string;
  dedupeKey: string;
  offerId: string | null;
  outcome: ProductDecisionOutcome;
  priceAmount: number | null;
  productCoveragePercent: number | null;
  productId: string;
  productTitle: string;
  rank: number | null;
  reason: string | null;
  score: number | null;
  servingMultiplier: number;
  stackContributionPercent: number | null;
  unknownAtRecommendation: boolean;
  urlUsed: string | null;
}>;

type ProjectionTask = Readonly<{
  id?: string | null;
  planId?: string | null;
}>;

async function projectionTableExists(sql: Db, tableName: string) {
  const rows = await sql<Array<{ table_name: string | null }>>`
    select to_regclass(${`public.${tableName}`})::text as table_name
  `;

  return Boolean(rows[0]?.table_name);
}

function recordFromLocalizedText(value: LocalizedText): Record<string, string> {
  if (typeof value === "string") {
    const text = value.trim();
    return text ? { en: text } : {};
  }

  const entries = Object.entries(value)
    .map(([locale, text]) => [locale, typeof text === "string" ? text.trim() : ""])
    .filter((entry): entry is [string, string] => Boolean(entry[1]));

  return Object.fromEntries(entries);
}

function preferredText(record: Record<string, string>) {
  return (
    record.en ||
    record.th ||
    Object.values(record).find((value) => value.trim()) ||
    ""
  );
}

export function normalizeRecommendationKey(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function supplementSelectionRowsFromFormulation(
  formulation: Pick<FormulationBlueprint, "supplementBreakdown">
): SupplementSelectionProjection[] {
  return formulation.supplementBreakdown.map((ingredient) => {
    const supplementName = recordFromLocalizedText(ingredient.supplement);
    const supplementNameText = preferredText(supplementName) || ingredient.id;
    const dailyDose = recordFromLocalizedText(ingredient.dailyDose);
    const dailyDoseText = preferredText(dailyDose);
    const parsedDose = dailyDoseText
      ? parseDose(dailyDoseText, ingredient.id || supplementNameText)
      : null;

    return {
      category: ingredient.category,
      dailyDose,
      dailyDoseText,
      doseAmount: parsedDose?.amount ?? null,
      doseParseStatus: parsedDose ? "parsed" : "unparsed",
      doseUnit: parsedDose?.unit ?? null,
      effectivenessRank: ingredient.effectivenessRank,
      itemId: ingredient.id,
      safetyAction: ingredient.safety?.action ?? null,
      safetyVisibility: ingredient.safety?.visibility ?? null,
      status: ingredient.status,
      supplementKey: normalizeRecommendationKey(supplementNameText || ingredient.id),
      supplementName,
      supplementNameText
    };
  });
}

export async function findCanonicalSupplementId(
  sql: Db,
  supplementKey: string
) {
  if (!supplementKey) {
    return null;
  }

  const rows = await sql<Array<{ id: string }>>`
    select supplements.id::text as id
    from public.supplements supplements
    where supplements.normalized_name = ${supplementKey}
    union
    select supplement_aliases.supplement_id::text as id
    from public.supplement_aliases supplement_aliases
    where supplement_aliases.normalized_alias = ${supplementKey}
    limit 1
  `;

  return rows[0]?.id ?? null;
}

export async function projectSupplementRecommendationSelections(
  sql: Db,
  input: Readonly<{
    formulation: Pick<FormulationBlueprint, "supplementBreakdown">;
    formulationVersion: number;
    generatedAt?: Date | string | null;
    modelVersion: string | null;
    task: ProjectionTask;
  }>
) {
  if (!input.task.planId) {
    return 0;
  }

  if (!(await projectionTableExists(sql, "supplement_recommendation_selections"))) {
    return 0;
  }

  const rows = supplementSelectionRowsFromFormulation(input.formulation);
  const isExample = input.modelVersion?.endsWith(":example") ?? false;
  const markCurrent = !isExample;

  if (markCurrent) {
    await sql`
      update public.supplement_recommendation_selections
      set is_current = false
      where plan_id = ${input.task.planId}::uuid
    `;
  }

  for (const row of rows) {
    const supplementId = await findCanonicalSupplementId(sql, row.supplementKey);

    await sql`
      insert into public.supplement_recommendation_selections (
        plan_id,
        formulation_version,
        task_id,
        model_version,
        item_id,
        supplement_id,
        supplement_name,
        supplement_name_text,
        category,
        status,
        effectiveness_rank,
        daily_dose,
        daily_dose_text,
        dose_amount,
        dose_unit,
        dose_parse_status,
        safety_action,
        safety_visibility,
        is_current,
        generated_at,
        created_at
      )
      values (
        ${input.task.planId}::uuid,
        ${input.formulationVersion},
        ${input.task.id ?? null}::uuid,
        ${input.modelVersion},
        ${row.itemId},
        ${supplementId}::uuid,
        ${sql.json(toJsonValue(row.supplementName))}::jsonb,
        ${row.supplementNameText},
        ${row.category},
        ${row.status},
        ${row.effectivenessRank},
        ${sql.json(toJsonValue(row.dailyDose))}::jsonb,
        ${row.dailyDoseText},
        ${row.doseAmount},
        ${row.doseUnit},
        ${row.doseParseStatus},
        ${row.safetyAction},
        ${row.safetyVisibility},
        ${markCurrent},
        ${input.generatedAt ?? new Date()},
        now()
      )
      on conflict (plan_id, formulation_version, item_id) do update set
        task_id = excluded.task_id,
        model_version = excluded.model_version,
        supplement_id = excluded.supplement_id,
        supplement_name = excluded.supplement_name,
        supplement_name_text = excluded.supplement_name_text,
        category = excluded.category,
        status = excluded.status,
        effectiveness_rank = excluded.effectiveness_rank,
        daily_dose = excluded.daily_dose,
        daily_dose_text = excluded.daily_dose_text,
        dose_amount = excluded.dose_amount,
        dose_unit = excluded.dose_unit,
        dose_parse_status = excluded.dose_parse_status,
        safety_action = excluded.safety_action,
        safety_visibility = excluded.safety_visibility,
        is_current = excluded.is_current,
        generated_at = excluded.generated_at
    `;
  }

  return rows.length;
}

function actionableProductRejection(reason: string | null | undefined) {
  return Boolean(reason && reason !== "Product does not cover current client needs");
}

function productDecisionDedupeKey(
  outcome: ProductDecisionOutcome,
  productId: string,
  reason?: string | null
) {
  return [
    outcome,
    productId,
    outcome === "rejected" ? normalizeRecommendationKey(reason ?? "rejected") : ""
  ].join(":");
}

function uniqueProductDecisions(rows: ProductDecisionProjection[]) {
  const seen = new Set<string>();
  const unique: ProductDecisionProjection[] = [];

  for (const row of rows) {
    if (seen.has(row.dedupeKey)) {
      continue;
    }

    seen.add(row.dedupeKey);
    unique.push(row);
  }

  return unique;
}

export function productDecisionRowsFromRecommendationResult(
  result: ProductRecommendationResult
): ProductDecisionProjection[] {
  const chosenProductIds = new Set<string>();
  const rows: ProductDecisionProjection[] = [];

  for (const item of result.recommendations) {
    chosenProductIds.add(item.product.id);
    rows.push({
      coveredNeeds: [...item.coveredNeeds],
      currency: item.product.currency || "THB",
      dedupeKey: productDecisionDedupeKey("chosen", item.product.id),
      offerId: item.offerId,
      outcome: "chosen",
      priceAmount: item.product.priceAmount ?? null,
      productCoveragePercent: item.productCoveragePercent,
      productId: item.product.id,
      productTitle: item.product.title,
      rank: item.rank,
      reason: null,
      score: item.score,
      servingMultiplier: Math.max(1, Math.round(item.servingMultiplier || 1)),
      stackContributionPercent: item.stackContributionPercent,
      unknownAtRecommendation: item.unknownAtRecommendation,
      urlUsed: item.url
    });
  }

  const nearMisses = result.diagnostics.nearMisses ?? [];

  for (const item of nearMisses) {
    if (chosenProductIds.has(item.productId)) {
      continue;
    }

    rows.push({
      coveredNeeds: [],
      currency: "THB",
      dedupeKey: productDecisionDedupeKey("near_miss", item.productId),
      offerId: null,
      outcome: "near_miss",
      priceAmount: null,
      productCoveragePercent: item.coveragePercent,
      productId: item.productId,
      productTitle: item.title,
      rank: null,
      reason: item.reason,
      score: null,
      servingMultiplier: 1,
      stackContributionPercent: null,
      unknownAtRecommendation: false,
      urlUsed: null
    });
  }

  const rejectedProductIds = new Set(
    rows
      .filter((row) => row.outcome !== "rejected")
      .map((row) => row.productId)
  );

  for (const item of result.exclusions) {
    if (
      rejectedProductIds.has(item.productId) ||
      !actionableProductRejection(item.reason)
    ) {
      continue;
    }

    rows.push(productDecisionRowFromExclusion(item));
  }

  return uniqueProductDecisions(rows);
}

function productDecisionRowFromExclusion(
  item: ProductRecommendationExclusion
): ProductDecisionProjection {
  return {
    coveredNeeds: [],
    currency: "THB",
    dedupeKey: productDecisionDedupeKey("rejected", item.productId, item.reason),
    offerId: null,
    outcome: "rejected",
    priceAmount: null,
    productCoveragePercent: null,
    productId: item.productId,
    productTitle: item.title,
    rank: null,
    reason: item.reason,
    score: null,
    servingMultiplier: 1,
    stackContributionPercent: null,
    unknownAtRecommendation: false,
    urlUsed: null
  };
}

function productDecisionRowsFromDiagnostics(
  diagnostics: Partial<ProductRecommendationDiagnostics>,
  exclusions: ProductRecommendationExclusion[]
) {
  return productDecisionRowsFromRecommendationResult({
    clientNeeds: [],
    diagnostics: {
      algorithmVersion: diagnostics.algorithmVersion,
      blockedProducts: diagnostics.blockedProducts ?? [],
      coverage: diagnostics.coverage ?? {
        foodCoveragePercent: 0,
        supplementProductCoveragePercent: 0,
        totalPlanCoveragePercent: 0
      },
      factIssues: diagnostics.factIssues ?? [],
      matchedNeeds: diagnostics.matchedNeeds ?? [],
      marketRegion: diagnostics.marketRegion,
      nearMisses: diagnostics.nearMisses ?? [],
      productsConsidered: diagnostics.productsConsidered ?? 0,
      stackPreference: diagnostics.stackPreference,
      trace: diagnostics.trace,
      unmatchedNeeds: diagnostics.unmatchedNeeds ?? []
    },
    exclusions,
    foodCoveragePercent: diagnostics.coverage?.foodCoveragePercent ?? 0,
    recommendations: [],
    stackCoveragePercent:
      diagnostics.coverage?.supplementProductCoveragePercent ?? 0,
    supplementProductCoveragePercent:
      diagnostics.coverage?.supplementProductCoveragePercent ?? 0,
    totalPlanCoveragePercent: diagnostics.coverage?.totalPlanCoveragePercent ?? 0
  });
}

export function productDecisionRowsFromStoredRun(input: Readonly<{
  diagnostics: unknown;
  exclusions: unknown;
  items: ReadonlyArray<{
    covered_needs: unknown;
    currency: string | null;
    offer_id: string | null;
    price_amount: number | string | null;
    product_coverage_percent: number | string | null;
    product_id: string;
    product_title: string;
    rank: number | string | null;
    score: number | string | null;
    serving_multiplier: number | string | null;
    stack_contribution_percent: number | string | null;
    unknown_at_recommendation: boolean | null;
    url_used: string | null;
  }>;
}>): ProductDecisionProjection[] {
  const rows = input.items.map((item) => {
    const productId = item.product_id;

    return {
      coveredNeeds: Array.isArray(item.covered_needs) ? item.covered_needs : [],
      currency: item.currency || "THB",
      dedupeKey: productDecisionDedupeKey("chosen", productId),
      offerId: item.offer_id,
      outcome: "chosen" as const,
      priceAmount: numberOrNull(item.price_amount),
      productCoveragePercent: numberOrNull(item.product_coverage_percent),
      productId,
      productTitle: item.product_title,
      rank: numberOrNull(item.rank),
      reason: null,
      score: numberOrNull(item.score),
      servingMultiplier: Math.max(
        1,
        Math.round(numberOrNull(item.serving_multiplier) ?? 1)
      ),
      stackContributionPercent: numberOrNull(item.stack_contribution_percent),
      unknownAtRecommendation: item.unknown_at_recommendation === true,
      urlUsed: item.url_used
    };
  });
  const diagnostics = objectValue(input.diagnostics) as Partial<ProductRecommendationDiagnostics>;
  const exclusions = Array.isArray(input.exclusions)
    ? input.exclusions
        .map((item) => {
          const record = objectValue(item);
          const productId = stringValue(record.productId);
          const title = stringValue(record.title);
          const reason = stringValue(record.reason);

          return productId && title && reason
            ? { productId, reason, title }
            : null;
        })
        .filter((item): item is ProductRecommendationExclusion => Boolean(item))
    : [];

  return uniqueProductDecisions([
    ...rows,
    ...productDecisionRowsFromDiagnostics(diagnostics, exclusions).filter(
      (row) => !rows.some((chosen) => chosen.productId === row.productId)
    )
  ]);
}

function numberOrNull(value: number | string | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
}

export async function writeProductRecommendationDecisionRows(
  sql: Db,
  input: Readonly<{
    generatedAt?: Date | string | null;
    planId?: string | null;
    rows: ProductDecisionProjection[];
    runId: string;
    taskId?: string | null;
  }>
) {
  if (!(await projectionTableExists(sql, "product_recommendation_decisions"))) {
    return 0;
  }

  if (input.planId) {
    await sql`
      update public.product_recommendation_decisions
      set is_current = false
      where plan_id = ${input.planId}::uuid
    `;
  }

  for (const row of input.rows) {
    await sql`
      insert into public.product_recommendation_decisions (
        run_id,
        plan_id,
        task_id,
        product_id,
        product_title,
        outcome,
        dedupe_key,
        rank,
        score,
        product_coverage_percent,
        stack_contribution_percent,
        serving_multiplier,
        covered_needs,
        reason,
        offer_id,
        url_used,
        price_amount,
        currency,
        unknown_at_recommendation,
        is_current,
        generated_at,
        created_at
      )
      values (
        ${input.runId}::uuid,
        ${input.planId ?? null}::uuid,
        ${input.taskId ?? null}::uuid,
        ${row.productId}::uuid,
        ${row.productTitle},
        ${row.outcome},
        ${row.dedupeKey},
        ${row.rank},
        ${row.score},
        ${row.productCoveragePercent},
        ${row.stackContributionPercent},
        ${row.servingMultiplier},
        ${sql.json(toJsonValue(row.coveredNeeds))}::jsonb,
        ${row.reason},
        ${row.offerId}::uuid,
        ${row.urlUsed},
        ${row.priceAmount},
        ${row.currency},
        ${row.unknownAtRecommendation},
        ${Boolean(input.planId)},
        ${input.generatedAt ?? new Date()},
        now()
      )
      on conflict (run_id, dedupe_key) do update set
        plan_id = excluded.plan_id,
        task_id = excluded.task_id,
        product_id = excluded.product_id,
        product_title = excluded.product_title,
        outcome = excluded.outcome,
        rank = excluded.rank,
        score = excluded.score,
        product_coverage_percent = excluded.product_coverage_percent,
        stack_contribution_percent = excluded.stack_contribution_percent,
        serving_multiplier = excluded.serving_multiplier,
        covered_needs = excluded.covered_needs,
        reason = excluded.reason,
        offer_id = excluded.offer_id,
        url_used = excluded.url_used,
        price_amount = excluded.price_amount,
        currency = excluded.currency,
        unknown_at_recommendation = excluded.unknown_at_recommendation,
        is_current = excluded.is_current,
        generated_at = excluded.generated_at
    `;
  }

  return input.rows.length;
}

export async function projectProductRecommendationDecisions(
  sql: Db,
  input: Readonly<{
    generatedAt?: Date | string | null;
    result: ProductRecommendationResult;
    runId: string;
    task: ProjectionTask;
  }>
) {
  return writeProductRecommendationDecisionRows(sql, {
    generatedAt: input.generatedAt,
    planId: input.task.planId,
    rows: productDecisionRowsFromRecommendationResult(input.result),
    runId: input.runId,
    taskId: input.task.id
  });
}
