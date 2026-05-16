import {
  normalizeAdminDashboardRange,
  type AdminDashboardRange
} from "@/lib/admin-dashboard-data";
import {
  normalizeAdminDashboardFilters,
  type AdminDashboardFilters
} from "@/lib/admin-dashboard-filters";

export type AdminQueryParams = Readonly<{
  cursor: number;
  filters: AdminDashboardFilters;
  limit: number;
  range: AdminDashboardRange;
  status: string;
}>;

export type AdminQueryPagination = Readonly<{
  cursor: string | null;
  limit: number;
  nextCursor: string | null;
}>;

export function paramsRecord(searchParams: URLSearchParams) {
  const record: Record<string, string> = {};

  searchParams.forEach((value, key) => {
    record[key] = value;
  });

  return record;
}

export function normalizeQueryLimit(value: string | null) {
  const parsed = value ? Number(value) : 50;

  if (!Number.isFinite(parsed)) {
    return 50;
  }

  return Math.max(1, Math.min(100, Math.round(parsed)));
}

function normalizeCursor(value: string | null) {
  const parsed = value ? Number(value) : 0;

  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

export function normalizeAdminQueryParams(
  searchParams: URLSearchParams
): AdminQueryParams {
  const record = paramsRecord(searchParams);

  return {
    cursor: normalizeCursor(searchParams.get("cursor")),
    filters: normalizeAdminDashboardFilters(record),
    limit: normalizeQueryLimit(searchParams.get("limit")),
    range: normalizeAdminDashboardRange(searchParams.get("range") ?? undefined),
    status: (searchParams.get("status") ?? "").trim().slice(0, 80)
  };
}

export function paginateAdminRows<T>(
  rows: readonly T[],
  params: AdminQueryParams
) {
  const start = params.cursor;
  const pageRows = rows.slice(start, start + params.limit);
  const nextCursor =
    start + params.limit < rows.length ? String(start + params.limit) : null;

  return {
    pageRows,
    pagination: {
      cursor: start > 0 ? String(start) : null,
      limit: params.limit,
      nextCursor
    } satisfies AdminQueryPagination
  };
}

export function adminQueryEnvelope(
  data: unknown,
  params: AdminQueryParams,
  pagination?: AdminQueryPagination
) {
  return {
    data,
    filters: {
      ...params.filters,
      range: params.range,
      status: params.status || undefined
    },
    generatedAt: new Date().toISOString(),
    pagination:
      pagination ?? {
        cursor: params.cursor > 0 ? String(params.cursor) : null,
        limit: params.limit,
        nextCursor: null
      }
  };
}

export function dashboardQueryParams({
  filters,
  limit,
  range,
  status = ""
}: Readonly<{
  filters: AdminDashboardFilters;
  limit: number;
  range: AdminDashboardRange;
  status?: string;
}>): AdminQueryParams {
  return {
    cursor: 0,
    filters,
    limit: Math.max(1, Math.min(100, Math.round(limit))),
    range,
    status: status.trim().slice(0, 80)
  };
}
