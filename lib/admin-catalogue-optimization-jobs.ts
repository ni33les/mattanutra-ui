import { createHash, randomUUID } from "node:crypto";
import type postgres from "postgres";
import {
  adminCataloguePotentialCandidates,
  type AdminCatalogueOptimizationData,
  type AdminPlanCoverageSimulationData,
  type AdminPlanCoverageSimulationSampleTrace
} from "@/lib/admin-product-coverage";
import { getSql } from "@/lib/db";
import type { ProductCandidate } from "@/lib/product-recommendations";
import { requiredCapabilitiesForWorkTaskType } from "@/lib/system-agents";
import { notifyTaskQueueChanged } from "@/lib/task-wakeup";

export type AdminCatalogueOptimizationJobStatus =
  | "cancelled"
  | "completed"
  | "failed"
  | "queued"
  | "running";

export type AdminCatalogueOptimizationJobView = Readonly<{
  cacheKey: string;
  candidateCount: number;
  candidateHash: string | null;
  completedAt: string | null;
  completedSamples: number;
  countryCode: string;
  createdAt: string;
  errorMessage: string | null;
  id: string;
  includePendingReviewProducts: boolean;
  message: string;
  optimization: AdminCatalogueOptimizationData | null;
  startedAt: string | null;
  stage: string;
  status: AdminCatalogueOptimizationJobStatus;
  totalSamples: number;
  updatedAt: string;
}>;

type Db = NonNullable<ReturnType<typeof getSql>>;

type JobTaskRow = Readonly<{
  completed_at: Date | string | null;
  context: unknown;
  created_at: Date | string;
  error_message: string | null;
  id: string;
  idempotency_key: string | null;
  lease_until: Date | string | null;
  payload: unknown;
  result_payload: unknown;
  started_at: Date | string | null;
  status: string;
  updated_at: Date | string;
}>;

type JobContext = Readonly<{
  cacheKey: string;
  countryCode: string;
  includePendingReviewProducts: boolean;
}>;

type JobResultPayload = Readonly<{
  approvedOptimization?: AdminCatalogueOptimizationData;
  candidateCount?: number;
  candidateHash?: string | null;
  completedSamples?: number;
  errorMessage?: string | null;
  message?: string | null;
  optimization?: AdminCatalogueOptimizationData;
  potentialTraces?: readonly AdminPlanCoverageSimulationSampleTrace[];
  stage?: string | null;
  totalSamples?: number;
}>;

export const ADMIN_CATALOGUE_OPTIMIZATION_TASK_TYPE =
  "admin_catalogue_optimization_job";
const jobIdempotencyScopeKey = "admin_catalogue_optimization_job";

function toIsoString(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : value;
}

function jsonValue(value: unknown): postgres.JSONValue {
  return JSON.parse(JSON.stringify(value ?? null)) as postgres.JSONValue;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function textValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function booleanValue(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function asSimulationData(value: unknown): AdminPlanCoverageSimulationData | null {
  return value && typeof value === "object"
    ? value as AdminPlanCoverageSimulationData
    : null;
}

function asOptimization(value: unknown) {
  return value && typeof value === "object"
    ? value as AdminCatalogueOptimizationData
    : null;
}

function jobStatus(value: string): AdminCatalogueOptimizationJobStatus {
  if (value === "completed" || value === "failed" || value === "cancelled") {
    return value;
  }

  return value === "running" || value === "reserved" ? "running" : "queued";
}

export function adminCataloguePotentialCandidateHash(
  candidates: readonly ProductCandidate[]
) {
  const rawById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const hashableCandidates = adminCataloguePotentialCandidates(candidates)
    .map((candidate) => {
      const raw = rawById.get(candidate.id) ?? candidate;

      return {
        audience: candidate.productAudience ?? null,
        availabilityStatus: candidate.availabilityStatus,
        brandName: candidate.brandName ?? null,
        brandStatus: raw.brandStatus ?? null,
        currency: candidate.currency,
        facts: [...candidate.facts]
          .map((fact) => ({
            aliasKeys: fact.aliasKeys ?? [],
            amount: fact.amount,
            comparableAmount: fact.comparableAmount,
            confidence: fact.confidence,
            itemType: fact.itemType,
            maxAmount: fact.maxAmount ?? null,
            maxUnit: fact.maxUnit ?? null,
            name: fact.name,
            normalizedName: fact.normalizedName,
            safetyFlags: fact.safetyFlags ?? [],
            supplementAudience: fact.supplementAudience ?? null,
            supplementId: fact.supplementId ?? null,
            unit: fact.unit
          }))
          .sort((first, second) =>
            (first.supplementId ?? first.normalizedName).localeCompare(
              second.supplementId ?? second.normalizedName
            ) ||
            (first.amount ?? -1) - (second.amount ?? -1) ||
            (first.unit ?? "").localeCompare(second.unit ?? "")
          ),
        id: candidate.id,
        platform: candidate.platform,
        priceAmount: candidate.priceAmount ?? null,
        productKind: candidate.productKind ?? null,
        productStatus: raw.status,
        title: candidate.title,
        unitPriceAmount: candidate.unitPriceAmount ?? null
      };
    })
    .sort((first, second) => first.id.localeCompare(second.id));

  return createHash("sha256")
    .update(JSON.stringify(hashableCandidates))
    .digest("hex");
}

function jobContext(row: JobTaskRow): JobContext {
  const context = asRecord(row.context);
  const simulationData = asSimulationData(row.payload);

  return {
    cacheKey: textValue(context.cacheKey) || row.idempotency_key || row.id,
    countryCode:
      textValue(context.countryCode) ||
      simulationData?.countryCode ||
      "TH",
    includePendingReviewProducts:
      context.includePendingReviewProducts === undefined
        ? true
        : booleanValue(context.includePendingReviewProducts)
  };
}

function jobResult(row: JobTaskRow): JobResultPayload {
  return asRecord(row.result_payload) as JobResultPayload;
}

function jobView(row: JobTaskRow): AdminCatalogueOptimizationJobView {
  const context = jobContext(row);
  const result = jobResult(row);
  const simulationData = asSimulationData(row.payload);
  const totalSamples = numberValue(
    result.totalSamples,
    simulationData?.sampleTraces.length ?? 0
  );
  const status = jobStatus(row.status);

  return {
    cacheKey: context.cacheKey,
    candidateCount: numberValue(result.candidateCount),
    candidateHash: textValue(result.candidateHash) || null,
    completedAt: toIsoString(row.completed_at),
    completedSamples:
      status === "completed"
        ? totalSamples
        : numberValue(result.completedSamples),
    countryCode: context.countryCode,
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
    errorMessage: row.error_message ?? result.errorMessage ?? null,
    id: row.id,
    includePendingReviewProducts: context.includePendingReviewProducts,
    message: result.message ?? "",
    optimization: asOptimization(result.optimization),
    startedAt: toIsoString(row.started_at),
    stage: result.stage ?? status,
    status,
    totalSamples,
    updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString()
  };
}

async function platformOrganisationId(sql: Db) {
  const rows = await sql<Array<{ id: string }>>`
    select id::text
    from public.organisations
    where slug = 'mattanutra'
      and organisation_type = 'platform'
      and status = 'active'
    limit 1
  `;

  if (!rows[0]?.id) {
    throw new Error("Platform organisation is required for shared optimum basket jobs");
  }

  return rows[0].id;
}

async function jobByKey(sql: Db, cacheKey: string) {
  const rows = await sql<JobTaskRow[]>`
    select
      id::text,
      idempotency_key,
      context,
      payload,
      result_payload,
      status,
      error_message,
      lease_until,
      started_at,
      completed_at,
      created_at,
      updated_at
    from public.tasks
    where task_type = ${ADMIN_CATALOGUE_OPTIMIZATION_TASK_TYPE}
      and idempotency_scope_key = ${jobIdempotencyScopeKey}
      and idempotency_key = ${cacheKey}
    order by created_at desc
    limit 1
  `;

  return rows[0] ?? null;
}

function initialJobResult(input: Readonly<{
  message: string;
  simulationData: AdminPlanCoverageSimulationData;
}>) {
  return {
    candidateCount: 0,
    candidateHash: null,
    completedSamples: 0,
    message: input.message,
    potentialTraces: [],
    stage: "queued",
    totalSamples: input.simulationData.sampleTraces.length
  } satisfies JobResultPayload;
}

export async function getAdminCatalogueOptimizationJob(cacheKey: string) {
  const sql = getSql();

  if (!sql) {
    return null;
  }

  const row = await jobByKey(sql, cacheKey);

  return row ? jobView(row) : null;
}

export async function startAdminCatalogueOptimizationJob(input: Readonly<{
  cacheKey: string;
  forceRestart?: boolean;
  includePendingReviewProducts: boolean;
  simulationData: AdminPlanCoverageSimulationData;
}>) {
  const sql = getSql();

  if (!sql) {
    throw new Error("DB_URL is required for shared optimum basket jobs");
  }

  const existing = await jobByKey(sql, input.cacheKey);
  const existingStatus = existing ? jobStatus(existing.status) : null;
  const restartCompleted =
    input.forceRestart === true && existingStatus === "completed";

  if (
    existing &&
    existingStatus !== "failed" &&
    existingStatus !== "cancelled" &&
    !restartCompleted
  ) {
    return jobView(existing);
  }

  const context = {
    cacheKey: input.cacheKey,
    countryCode: input.simulationData.countryCode,
    includePendingReviewProducts: input.includePendingReviewProducts
  } satisfies JobContext;
  const resultPayload = initialJobResult({
    message: "Waiting to start",
    simulationData: input.simulationData
  });
  const organisationId = await platformOrganisationId(sql);

  const rows = existing
    ? await sql<JobTaskRow[]>`
        update public.tasks
        set
          context = ${sql.json(jsonValue(context))}::jsonb,
          payload = ${sql.json(jsonValue(input.simulationData))}::jsonb,
          result_payload = ${sql.json(jsonValue(resultPayload))}::jsonb,
          status = 'queued',
          error_message = null,
          lease_until = null,
          reserved_by_agent_id = null,
          started_at = null,
          completed_at = null,
          attempts = 0,
          updated_at = now()
        where id = ${existing.id}::uuid
        returning
          id::text,
          idempotency_key,
          context,
          payload,
          result_payload,
          status,
          error_message,
          lease_until,
          started_at,
          completed_at,
          created_at,
          updated_at
      `
    : await sql<JobTaskRow[]>`
        insert into public.tasks (
          id,
          organisation_id,
          task_group_id,
          group_label,
          task_type,
          title,
          description,
          actor_type,
          status,
          business_value,
          required_capabilities,
          reasoning_effort,
          context,
          payload,
          result_payload,
          priority_score,
          priority_reason,
          source_entity_type,
          idempotency_key,
          idempotency_scope_key,
          scheduled_for,
          attempts,
          max_attempts,
          created_at,
          updated_at
        )
        select
          ${randomUUID()}::uuid,
          ${organisationId}::uuid,
          ${randomUUID()}::uuid,
          'Optimum product basket',
          ${ADMIN_CATALOGUE_OPTIMIZATION_TASK_TYPE},
          'Optimum product basket',
          'Shared background calculation for the admin plan coverage simulator.',
          'system',
          'queued',
          200,
          ${requiredCapabilitiesForWorkTaskType(ADMIN_CATALOGUE_OPTIMIZATION_TASK_TYPE)}::text[],
          'none',
          ${sql.json(jsonValue(context))}::jsonb,
          ${sql.json(jsonValue(input.simulationData))}::jsonb,
          ${sql.json(jsonValue(resultPayload))}::jsonb,
          200,
          'Admin-requested simulator optimisation',
          'admin_catalogue_optimization',
          ${input.cacheKey},
          ${jobIdempotencyScopeKey},
          now(),
          0,
          1,
          now(),
          now()
        where not exists (
          select 1
          from public.tasks
          where task_type = ${ADMIN_CATALOGUE_OPTIMIZATION_TASK_TYPE}
            and idempotency_scope_key = ${jobIdempotencyScopeKey}
            and idempotency_key = ${input.cacheKey}
        )
        on conflict (idempotency_scope_key, idempotency_key)
          where idempotency_key is not null
            and status <> all (array[
              'completed'::text,
              'failed'::text,
              'cancelled'::text,
              'skipped'::text
            ])
        do nothing
        returning
          id::text,
          idempotency_key,
          context,
          payload,
          result_payload,
          status,
          error_message,
          lease_until,
          started_at,
          completed_at,
          created_at,
          updated_at
      `;
  const row = rows[0] ?? await jobByKey(sql, input.cacheKey);

  if (!row) {
    throw new Error("Unable to create or reuse shared optimum basket job");
  }

  if (rows[0]) {
    notifyTaskQueueChanged();
  }

  return jobView(row);
}

export async function cancelAdminCatalogueOptimizationJob(cacheKey: string) {
  const sql = getSql();

  if (!sql) {
    return null;
  }

  const rows = await sql<JobTaskRow[]>`
    update public.tasks
    set
      status = 'cancelled',
      result_payload = coalesce(result_payload, '{}'::jsonb) ||
        ${sql.json(jsonValue({
          message: "Cancelled",
          stage: "cancelled"
        } satisfies JobResultPayload))}::jsonb,
      lease_until = null,
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
    where task_type = ${ADMIN_CATALOGUE_OPTIMIZATION_TASK_TYPE}
      and idempotency_scope_key = ${jobIdempotencyScopeKey}
      and idempotency_key = ${cacheKey}
      and status in ('queued', 'reserved', 'running')
    returning
      id::text,
      idempotency_key,
      context,
      payload,
      result_payload,
      status,
      error_message,
      lease_until,
      started_at,
      completed_at,
      created_at,
      updated_at
  `;

  if (rows[0]) {
    notifyTaskQueueChanged();
  }

  return rows[0] ? jobView(rows[0]) : await getAdminCatalogueOptimizationJob(cacheKey);
}
