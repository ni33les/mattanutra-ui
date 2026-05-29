import { ChevronDownIcon } from "@heroicons/react/24/outline";
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
  adminHref,
  buttonGroupItemClasses
} from "@/components/admin/dashboard-shared";

export function TimeframeSelector({
  accessToken,
  data,
  filters,
  labels,
  locale,
  view
}: Readonly<{
  accessToken: string;
  data: AdminDashboardData;
  filters: AdminDashboardFilters;
  labels: AdminContent;
  locale: Locale;
  view: AdminDashboardView;
}>) {
  return (
    <div className="isolate inline-flex rounded-md shadow-sm">
      {rangeOrder.map((range, index) => (
        <a
          key={range}
          href={adminHref(locale, accessToken, range, view, filters)}
          aria-current={data.range === range ? "page" : undefined}
          className={buttonGroupItemClasses(
            data.range === range,
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
  locale,
  range,
  view
}: Readonly<{
  accessToken: string;
  filters: AdminDashboardFilters;
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
        ? new Set(filters.locale.split(",").filter((value) => publicLocales.includes(value as Locale)))
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

        return (
          <a
            key={option.label}
            href={adminHref(locale, accessToken, range, view, {
              ...filters,
              locale: toggledLocaleFilter(option.value)
            })}
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
  name,
  value
}: Readonly<{
  label: string;
  name: keyof AdminDashboardFilters;
  value: string;
}>) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
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
  name,
  options,
  value
}: Readonly<{
  label: string;
  name: keyof AdminDashboardFilters;
  options: Array<Readonly<{ label: string; value: string }>>;
  value: string;
}>) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
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
  locale,
  range,
  view
}: Readonly<{
  accessToken: string;
  filters: AdminDashboardFilters;
  labels: AdminContent;
  locale: Locale;
  range: AdminDashboardRange;
  view: AdminDashboardView;
}>) {
  const panelFilters = { ...filters, locale: "" };
  const activeFilters = adminDashboardFilterEntries(panelFilters);
  const hasPanelFilters = hasAdminDashboardFilters(panelFilters);
  const clearHref = adminHref(locale, accessToken, range, view, {
    ...emptyAdminDashboardFilters,
    locale: filters.locale
  });

  return (
    <details
      className="mt-6 rounded-2xl bg-white shadow-sm ring-1 ring-gray-200"
      open={hasPanelFilters}
    >
      <summary className="group flex cursor-pointer list-none items-center gap-3 p-5 marker:hidden">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <span className="text-sm font-semibold uppercase tracking-[0.16em] text-gray-500">
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
        <input type="hidden" name="range" value={range} />
        <input type="hidden" name="view" value={view} />
        <input type="hidden" name="locale" value={filters.locale} />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <FilterInput
            label={labels.filters.source}
            name="source"
            value={filters.source}
          />
          <FilterInput
            label={labels.filters.medium}
            name="medium"
            value={filters.medium}
          />
          <FilterInput
            label={labels.filters.campaign}
            name="campaign"
            value={filters.campaign}
          />
          <FilterInput
            label={labels.filters.campaignId}
            name="campaignId"
            value={filters.campaignId}
          />
          <FilterInput
            label={labels.filters.affiliate}
            name="affiliate"
            value={filters.affiliate}
          />
          <FilterInput
            label={labels.filters.promoCode}
            name="promoCode"
            value={filters.promoCode}
          />
          <FilterSelect
            label={labels.filters.selectedPlan}
            name="selectedPlan"
            value={filters.selectedPlan}
            options={[
              { label: "All", value: "" },
              { label: "Precision", value: "precision" },
              { label: "Pro", value: "pro" }
            ]}
          />
          <FilterSelect
            label={labels.filters.device}
            name="device"
            value={filters.device}
            options={[
              { label: "All", value: "" },
              { label: "Mobile", value: "mobile" },
              { label: "Tablet", value: "tablet" },
              { label: "Desktop", value: "desktop" }
            ]}
          />
          <FilterInput
            label={labels.filters.planId}
            name="planId"
            value={filters.planId}
          />
          <FilterInput label={labels.filters.ray} name="ray" value={filters.ray} />
          <FilterInput
            label={labels.filters.emailHash}
            name="emailHash"
            value={filters.emailHash}
          />
        </div>

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
