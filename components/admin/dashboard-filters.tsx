import { useState } from "react";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import type { AdminLeadsData } from "@/lib/admin-query-data";
import type {
  AdminDashboardData,
  AdminDashboardRange
} from "@/lib/admin-dashboard-data";
import {
  adminDashboardFilterEntries,
  emptyAdminDashboardFilters,
  hasAdminDashboardFilters,
  type AdminDashboardFilters
} from "@/lib/admin-dashboard-filters";
import { localeLabels, publicLocales, type Locale } from "@/lib/i18n";
import {
  rangeOrder,
  type AdminContent,
  type AdminDashboardView
} from "@/components/admin/dashboard-content";
import {
  adminLocaleTextClass,
  adminHref,
  adminLeadHref,
  classNames,
  buttonGroupItemClasses
} from "@/components/admin/dashboard-shared";

export function TimeframeSelector({
  accessToken,
  data,
  filters,
  labels,
  leadsData,
  locale,
  view
}: Readonly<{
  accessToken: string;
  data: AdminDashboardData;
  filters: AdminDashboardFilters;
  labels: AdminContent;
  leadsData?: AdminLeadsData;
  locale: Locale;
  view: AdminDashboardView;
}>) {
  return (
    <div className="isolate inline-flex rounded-md shadow-sm">
      {rangeOrder.map((range, index) => (
        <a
          key={range}
          href={
            leadsData
              ? adminLeadHref(
                  adminHref(locale, accessToken, range, view, filters),
                  {
                    ...leadsData,
                    search: { ...leadsData.search, dateFrom: "", dateTo: "" }
                  }
                )
              : adminHref(locale, accessToken, range, view, filters)
          }
          aria-current={
            data.range === range &&
            !leadsData?.search.dateFrom &&
            !leadsData?.search.dateTo
              ? "page"
              : undefined
          }
          className={buttonGroupItemClasses(
            data.range === range &&
              !leadsData?.search.dateFrom &&
              !leadsData?.search.dateTo,
            index,
            rangeOrder.length
          )}
        >
          {labels.ranges[range]}
        </a>
      ))}
    </div>
  );
}

export function LocaleFilterSelector({
  accessToken,
  filters,
  leadsData,
  locale,
  range,
  view
}: Readonly<{
  accessToken: string;
  filters: AdminDashboardFilters;
  leadsData?: AdminLeadsData;
  locale: Locale;
  range: AdminDashboardRange;
  view: AdminDashboardView;
}>) {
  const localeOptions = publicLocales.map((value) => ({
    label: localeLabels[value],
    value
  }));
  const activeLocales =
    filters.locale === "none"
      ? new Set<string>()
      : filters.locale
        ? new Set(
            filters.locale
              .split(",")
              .filter((value) => publicLocales.includes(value as Locale))
          )
        : new Set<string>(publicLocales);

  function toggledLocaleFilter(value: string) {
    const next = new Set(activeLocales);

    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }

    if (next.size === localeOptions.length) {
      return "";
    }

    if (next.size === 0) {
      return "none";
    }

    return publicLocales.filter((localeCode) => next.has(localeCode)).join(",");
  }

  return (
    <div className="isolate inline-flex rounded-md shadow-sm">
      {localeOptions.map((option, index) => {
        const active = activeLocales.has(option.value);
        const href = adminHref(locale, accessToken, range, view, {
          ...filters,
          locale: toggledLocaleFilter(option.value)
        });

        return (
          <a
            key={option.label}
            href={leadsData ? adminLeadHref(href, leadsData) : href}
            aria-current={active ? "page" : undefined}
            className={buttonGroupItemClasses(
              active,
              index,
              localeOptions.length
            )}
          >
            {option.label}
          </a>
        );
      })}
    </div>
  );
}

function FilterInput({
  label,
  locale,
  name,
  value
}: Readonly<{
  label: string;
  locale: Locale;
  name: keyof AdminDashboardFilters;
  value: string;
}>) {
  return (
    <label className="block">
      <span
        className={classNames(
          "text-xs font-semibold text-gray-500",
          locale === "en"
            ? "uppercase tracking-[0.14em]"
            : adminLocaleTextClass(locale, "label")
        )}
      >
        {label}
      </span>
      <input
        type="text"
        name={name}
        defaultValue={value}
        className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-inset ring-gray-200 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-[#1FA77A]"
      />
    </label>
  );
}

function FilterSelect({
  label,
  locale,
  name,
  options,
  value
}: Readonly<{
  label: string;
  locale: Locale;
  name: keyof AdminDashboardFilters;
  options: Array<Readonly<{ label: string; value: string }>>;
  value: string;
}>) {
  return (
    <label className="block">
      <span
        className={classNames(
          "text-xs font-semibold text-gray-500",
          locale === "en"
            ? "uppercase tracking-[0.14em]"
            : adminLocaleTextClass(locale, "label")
        )}
      >
        {label}
      </span>
      <select
        name={name}
        defaultValue={value}
        className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-inset ring-gray-200 focus:ring-2 focus:ring-inset focus:ring-[#1FA77A]"
      >
        {options.map((option) => (
          <option key={option.value || "all"} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function AdminFilterPanel({
  accessToken,
  filters,
  labels,
  leadsData,
  locale,
  range,
  view
}: Readonly<{
  accessToken: string;
  filters: AdminDashboardFilters;
  labels: AdminContent;
  leadsData?: AdminLeadsData;
  locale: Locale;
  range: AdminDashboardRange;
  view: AdminDashboardView;
}>) {
  const [dateFrom, setDateFrom] = useState(leadsData?.search.dateFrom ?? "");
  const [dateTo, setDateTo] = useState(leadsData?.search.dateTo ?? "");
  const panelFilters = { ...filters, locale: "" };
  const activeFilters = adminDashboardFilterEntries(panelFilters);
  const hasPanelFilters = hasAdminDashboardFilters(panelFilters);
  const clearHref = adminHref(locale, accessToken, range, view, {
    ...emptyAdminDashboardFilters,
    locale: filters.locale
  });

  const advancedFields = (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <FilterInput
        locale={locale}
        label={labels.filters.source}
        name="source"
        value={filters.source}
      />
      <FilterInput
        locale={locale}
        label={labels.filters.medium}
        name="medium"
        value={filters.medium}
      />
      <FilterInput
        locale={locale}
        label={labels.filters.campaign}
        name="campaign"
        value={filters.campaign}
      />
      <FilterInput
        locale={locale}
        label={labels.filters.campaignId}
        name="campaignId"
        value={filters.campaignId}
      />
      <FilterInput
        locale={locale}
        label={labels.filters.affiliate}
        name="affiliate"
        value={filters.affiliate}
      />
      <FilterInput
        locale={locale}
        label={labels.filters.promoCode}
        name="promoCode"
        value={filters.promoCode}
      />
      <FilterSelect
        locale={locale}
        label={labels.filters.selectedPlan}
        name="selectedPlan"
        value={filters.selectedPlan}
        options={[
          { label: labels.contentPages.all, value: "" },
          { label: "Precision", value: "precision" },
          { label: "Pro", value: "pro" }
        ]}
      />
      <FilterSelect
        locale={locale}
        label={labels.filters.device}
        name="device"
        value={filters.device}
        options={[
          { label: labels.contentPages.all, value: "" },
          { label: "Mobile", value: "mobile" },
          { label: "Tablet", value: "tablet" },
          { label: "Desktop", value: "desktop" }
        ]}
      />
      <FilterInput
        locale={locale}
        label={labels.filters.planId}
        name="planId"
        value={filters.planId}
      />
      <FilterInput
        locale={locale}
        label={labels.filters.ray}
        name="ray"
        value={filters.ray}
      />
      <FilterInput
        locale={locale}
        label={labels.filters.emailHash}
        name="emailHash"
        value={filters.emailHash}
      />
    </div>
  );

  return (
    <details
      className="mt-6 rounded-2xl bg-white shadow-sm ring-1 ring-gray-200"
      open={hasPanelFilters || Boolean(leadsData)}
    >
      <summary className="group flex cursor-pointer list-none items-center gap-3 p-5 marker:hidden">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <span
            className={classNames(
              "text-sm font-semibold text-gray-500",
              locale === "en"
                ? "uppercase tracking-[0.16em]"
                : adminLocaleTextClass(locale, "label")
            )}
          >
            {labels.filters.title}
          </span>
          {hasPanelFilters ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {activeFilters.map(([key, value]) => (
                <span
                  key={key}
                  className="rounded-full bg-gray-50 px-2.5 py-1 font-medium text-gray-700 ring-1 ring-gray-200"
                >
                  {labels.filters[key]}: {value}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <ChevronDownIcon
          aria-hidden={true}
          className="ml-auto size-4 shrink-0 text-gray-400 transition-transform group-open:rotate-180"
        />
      </summary>

      <form
        action={`/${locale}/admin/dashboard`}
        method="get"
        className="border-t border-gray-100 p-5"
      >
        <input type="hidden" name="access_token" value={accessToken} />
        <input
          type="hidden"
          name="range"
          value={leadsData && (dateFrom || dateTo) ? "all" : range}
        />
        <input type="hidden" name="view" value={view} />
        <input type="hidden" name="locale" value={filters.locale} />

        {leadsData ? (
          <div className="mb-5 space-y-3 border-b border-gray-100 pb-5">
            <label className="block text-sm font-semibold text-gray-700">
              {labels.marketingPages.search}
              <input
                className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-200 focus:ring-2 focus:ring-[#1FA77A]"
                defaultValue={leadsData.search.q}
                name="q"
                type="search"
                aria-describedby="lead-search-hint"
              />
            </label>
            <p className="text-sm text-gray-500" id="lead-search-hint">
              {labels.marketingPages.searchHint}
            </p>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <label className="block text-sm font-medium text-gray-700">
                {labels.marketingPages.dateFrom}
                <input
                  className="mt-1 block w-full rounded-md px-3 py-2 ring-1 ring-inset ring-gray-200"
                  name="dateFrom"
                  type="date"
                  value={dateFrom}
                  max={dateTo || undefined}
                  onChange={(event) => setDateFrom(event.target.value)}
                />
              </label>
              <label className="block text-sm font-medium text-gray-700">
                {labels.marketingPages.dateTo}
                <input
                  className="mt-1 block w-full rounded-md px-3 py-2 ring-1 ring-inset ring-gray-200"
                  name="dateTo"
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(event) => setDateTo(event.target.value)}
                />
              </label>
              <label className="block text-sm font-medium text-gray-700">
                {labels.marketingPages.currentStage}
                <select
                  className="mt-1 block w-full rounded-md px-3 py-2 ring-1 ring-inset ring-gray-200"
                  name="status"
                  defaultValue={leadsData.status}
                >
                  <option value="">{labels.marketingPages.allStages}</option>
                  {[
                    ["observed", "Observed"],
                    ["landed", labels.marketingPages.landed],
                    [
                      "assessment_started",
                      labels.marketingPages.assessmentStarts
                    ],
                    [
                      "assessment_completed",
                      labels.marketingPages.assessmentCompletions
                    ],
                    ["healthscore", labels.marketingPages.healthScoreViews],
                    ["free_requested", "Free requested"],
                    ["resume_requested", "Resume requested"],
                    ["free_sent", "Free sent"],
                    ["precision", "Precision"],
                    ["pro", "Pro"]
                  ].map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-gray-700">
                {labels.marketingPages.pageSize}
                <select
                  className="mt-1 block w-full rounded-md px-3 py-2 ring-1 ring-inset ring-gray-200"
                  name="limit"
                  defaultValue={leadsData.pagination.limit}
                >
                  {[...new Set([25, 50, 100, leadsData.pagination.limit])]
                    .sort((a, b) => a - b)
                    .map((limit) => (
                      <option key={limit} value={limit}>
                        {limit}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <input
              name="timeZone"
              type="hidden"
              value={leadsData.search.timeZone}
            />
            <p className="text-xs text-gray-500">
              {labels.marketingPages.dateHint} {leadsData.search.timeZone}
            </p>
          </div>
        ) : null}

        {leadsData ? (
          <details open={hasPanelFilters}>
            <summary className="cursor-pointer text-sm font-semibold text-gray-600">
              {labels.marketingPages.advancedFilters}
            </summary>
            <div className="mt-4">{advancedFields}</div>
          </details>
        ) : (
          advancedFields
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="rounded-md bg-[#1FA77A] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#188B66] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1FA77A]"
          >
            {labels.filters.apply}
          </button>
          <a
            href={clearHref}
            className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
          >
            {labels.filters.clear}
          </a>
        </div>
      </form>
    </details>
  );
}
