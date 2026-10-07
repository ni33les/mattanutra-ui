import type postgres from "postgres";
import {
  adminDashboardRangeStart,
  type AdminDashboardRange
} from "@/lib/admin-dashboard-data";
import { adminTextSearchPattern } from "@/lib/admin-dashboard-filters";

export type AdminLeadSearch = Readonly<{
  q: string;
  dateFrom: string;
  dateTo: string;
  timeZone: string;
}>;

export const emptyAdminLeadSearch: AdminLeadSearch = {
  q: "",
  dateFrom: "",
  dateTo: "",
  timeZone: "Asia/Bangkok"
};

export function normalizeAdminLeadSearch(
  params: Record<string, string | string[] | undefined>
): AdminLeadSearch {
  function value(key: string) {
    const raw = params[key];
    return (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 200) ?? "";
  }

  function date(key: string) {
    const raw = value(key);
    const parsed = new Date(`${raw}T00:00:00Z`);
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) &&
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === raw
      ? raw
      : "";
  }

  let timeZone = value("timeZone") || emptyAdminLeadSearch.timeZone;
  try {
    timeZone = new Intl.DateTimeFormat("en", { timeZone }).resolvedOptions()
      .timeZone;
  } catch {
    timeZone = emptyAdminLeadSearch.timeZone;
  }

  return {
    q: value("q"),
    dateFrom: date("dateFrom"),
    dateTo: date("dateTo"),
    timeZone
  };
}

export function adminLeadTimeSql(
  sql: postgres.Sql,
  range: AdminDashboardRange,
  search: AdminLeadSearch
) {
  // An explicit calendar range replaces the rolling dashboard timeframe.
  const start =
    search.dateFrom || search.dateTo ? null : adminDashboardRangeStart(range);
  return sql`
    (${start}::timestamptz is null or occurred_at >= ${start})
    and (${search.dateFrom || null}::date is null or occurred_at >=
      (${search.dateFrom || null}::date::timestamp at time zone ${search.timeZone}))
    and (${search.dateTo || null}::date is null or occurred_at <
      ((${search.dateTo || null}::date + 1)::timestamp at time zone ${search.timeZone}))
  `;
}

export function adminLeadSearchSql(sql: postgres.Sql, search: AdminLeadSearch) {
  const pattern = search.q ? adminTextSearchPattern(search.q) : null;
  return sql`
    (${pattern}::text is null or concat_ws(' ',
      ray::text, plan_id::text, email_hash, utm_source, traffic_source,
      source_channel, utm_medium, utm_campaign, campaign_name, campaign_id,
      affiliate_id, affiliate_ref, affiliate_sub_id, promo_code,
      selected_plan::text, event_name, replace(event_name, '_', ' '),
      event_type, event_status, path, route
    ) ilike ${pattern})
  `;
}
