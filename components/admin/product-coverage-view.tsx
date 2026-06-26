import {
  ArrowTopRightOnSquareIcon,
  BeakerIcon,
  CheckCircleIcon,
  CurrencyDollarIcon,
  ExclamationTriangleIcon
} from "@heroicons/react/24/outline";
import type {
  AdminPlanCoverageSimulationData,
  AdminProductCoverageData,
  AdminSimulationProductUsefulnessRow,
  AdminSupplementCoverageProductRow,
  AdminSupplementCoverageRow,
  SupplementCoverageState
} from "@/lib/admin-product-coverage";
import type { Locale } from "@/lib/i18n";
import { classNames } from "@/components/admin/dashboard-shared";
import { SafeImage } from "@/components/safe-image";

function numberText(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function percentText(value: number) {
  return `${numberText(value)}%`;
}

function moneyText(amount: number | null, currency: string) {
  if (amount === null) {
    return "No price";
  }

  return new Intl.NumberFormat("en-US", {
    currency,
    maximumFractionDigits: 0,
    style: "currency"
  }).format(amount);
}

function productDetailHref(
  productId: string,
  locale: Locale,
  accessToken: string
) {
  const params = new URLSearchParams();

  if (accessToken) {
    params.set("access_token", accessToken);
  }

  return `/${locale}/admin/products/${productId}${params.size > 0 ? `?${params.toString()}` : ""}`;
}

function dashboardHref(
  view: "plan-coverage-simulator" | "product-coverage",
  locale: Locale,
  accessToken: string,
  params: Record<string, string | number | null | undefined> = {}
) {
  const search = new URLSearchParams({ view });

  if (accessToken) {
    search.set("access_token", accessToken);
  }

  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) {
      search.set(key, String(value));
    }
  }

  return `/${locale}/admin/dashboard?${search.toString()}`;
}

function stateLabel(state: SupplementCoverageState) {
  if (state === "covered") {
    return "Covered";
  }

  if (state === "pending_review") {
    return "Pending review";
  }

  return state === "dirty" ? "Dirty data" : "Missing";
}

function stateClassName(state: SupplementCoverageState) {
  if (state === "covered") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (state === "pending_review") {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }

  if (state === "dirty") {
    return "bg-rose-50 text-rose-700 ring-rose-200";
  }

  return "bg-slate-100 text-slate-600 ring-slate-200";
}

function Badge({
  children,
  className
}: Readonly<{
  children: React.ReactNode;
  className?: string;
}>) {
  return (
    <span
      className={classNames(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1",
        className ?? "bg-slate-100 text-slate-700 ring-slate-200"
      )}
    >
      {children}
    </span>
  );
}

function Kpi({
  label,
  value,
  icon: Icon
}: Readonly<{
  label: string;
  value: string;
  icon: typeof BeakerIcon;
}>) {
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <Icon className="size-5 text-[#1FA77A]" aria-hidden={true} />
      </div>
      <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
    </div>
  );
}

function ProductCoverageRow({
  accessToken,
  locale,
  product
}: Readonly<{
  accessToken: string;
  locale: Locale;
  product: AdminSupplementCoverageProductRow;
}>) {
  return (
    <div className="grid gap-3 border-t border-slate-200 py-4 md:grid-cols-[minmax(0,1fr)_140px_160px_120px] md:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <div className="size-12 shrink-0 overflow-hidden rounded-md bg-slate-100 ring-1 ring-slate-200">
          {product.imageUrl ? (
            <SafeImage
              alt=""
              className="size-full object-cover"
              height={48}
              src={product.imageUrl}
              width={48}
            />
          ) : null}
        </div>
        <div className="min-w-0">
          <a
            className="inline-flex max-w-full items-center gap-1 truncate text-sm font-semibold text-slate-950 hover:text-[#168060]"
            href={productDetailHref(product.id, locale, accessToken)}
          >
            <span className="truncate">{product.title}</span>
            <ArrowTopRightOnSquareIcon className="size-4 shrink-0" aria-hidden={true} />
          </a>
          <p className="mt-1 text-xs text-slate-500">
            {[product.brandName, product.productKind, product.productAudience]
              .filter(Boolean)
              .join(" · ") || "No brand"}
          </p>
          <p className="mt-1 text-xs text-slate-500">{product.why}</p>
        </div>
      </div>
      <div className="text-sm text-slate-700">
        <span className="font-semibold text-slate-950">{product.doseLabel ?? "No dose"}</span>
        <p className="text-xs text-slate-500">{product.canonicalFactCount} linked facts</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge
          className={
            product.eligible
              ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
              : "bg-amber-50 text-amber-700 ring-amber-200"
          }
        >
          {product.eligible ? "Eligible" : product.status.replace("_", " ")}
        </Badge>
        {product.retailAvailable ? (
          <Badge className="bg-sky-50 text-sky-700 ring-sky-200">Retail ready</Badge>
        ) : null}
      </div>
      <p className="text-sm font-semibold text-slate-900">
        {moneyText(product.cheapestPriceAmount, product.currency)}
      </p>
    </div>
  );
}

function SupplementCoverageDetails({
  accessToken,
  locale,
  row
}: Readonly<{
  accessToken: string;
  locale: Locale;
  row: AdminSupplementCoverageRow;
}>) {
  return (
    <details className="group rounded-lg bg-white shadow-sm ring-1 ring-slate-200 open:ring-[#1FA77A]/30">
      <summary className="grid cursor-pointer list-none gap-3 p-4 md:grid-cols-[minmax(0,1.4fr)_repeat(5,minmax(88px,1fr))] md:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-sm font-bold text-slate-950">{row.supplementName}</h2>
            <Badge className={stateClassName(row.state)}>{stateLabel(row.state)}</Badge>
          </div>
          <p className="mt-1 text-xs text-slate-500">{row.category ?? "Uncategorised"}</p>
        </div>
        <Metric label="Eligible" value={row.eligibleProductCount} />
        <Metric label="Pending" value={row.pendingReviewProductCount} />
        <Metric label="Dirty" value={row.dirtyProductCount} />
        <Metric label="Retail" value={row.retailAvailableProductCount} />
        <div className="text-sm">
          <p className="text-xs font-medium text-slate-500">Cheapest</p>
          <p className="font-bold text-slate-950">
            {moneyText(row.cheapestEligiblePriceAmount, row.currency)}
          </p>
        </div>
      </summary>
      <div className="px-4 pb-2">
        {row.products.length > 0 ? (
          row.products.map((product) => (
            <ProductCoverageRow
              accessToken={accessToken}
              key={product.id}
              locale={locale}
              product={product}
            />
          ))
        ) : (
          <div className="border-t border-slate-200 py-4 text-sm text-slate-500">
            No master-list products currently link to this supplement.
          </div>
        )}
      </div>
    </details>
  );
}

function Metric({
  label,
  value
}: Readonly<{
  label: string;
  value: number;
}>) {
  return (
    <div className="text-sm">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="font-bold text-slate-950">{numberText(value)}</p>
    </div>
  );
}

export function AdminProductCoverageView({
  accessToken,
  data,
  locale
}: Readonly<{
  accessToken: string;
  data: AdminProductCoverageData;
  locale: Locale;
}>) {
  return (
    <div className="mt-6 space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Kpi
          icon={BeakerIcon}
          label="Active supplements"
          value={numberText(data.summary.activeSupplements)}
        />
        <Kpi
          icon={CheckCircleIcon}
          label="Covered"
          value={numberText(data.summary.coveredSupplements)}
        />
        <Kpi
          icon={ExclamationTriangleIcon}
          label="Pending review"
          value={numberText(data.summary.pendingReviewSupplements)}
        />
        <Kpi
          icon={ExclamationTriangleIcon}
          label="Missing"
          value={numberText(data.summary.missingSupplements)}
        />
        <Kpi
          icon={CurrencyDollarIcon}
          label="Eligible products"
          value={numberText(data.summary.totalEligibleProducts)}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Supplement coverage</h2>
          <p className="text-sm text-slate-500">
            {data.countryCode} catalogue · {numberText(data.rows.length)} active supplements
          </p>
        </div>
        <a
          className="rounded-md bg-[#20343A] px-3 py-2 text-sm font-semibold text-white hover:bg-[#16252A]"
          href={dashboardHref("plan-coverage-simulator", locale, accessToken)}
        >
          Open simulator
        </a>
      </div>

      <div className="space-y-3">
        {data.rows.map((row) => (
          <SupplementCoverageDetails
            accessToken={accessToken}
            key={row.supplementId}
            locale={locale}
            row={row}
          />
        ))}
      </div>
    </div>
  );
}

function ProductUsefulnessBar({
  row
}: Readonly<{
  row: AdminSimulationProductUsefulnessRow;
}>) {
  const width = Math.max(4, Math.min(100, row.averageStackContributionPercent));

  return (
    <div className="grid gap-3 border-t border-slate-200 py-4 md:grid-cols-[44px_minmax(0,1fr)_120px_120px] md:items-center">
      <p className="text-sm font-bold text-slate-400">#{row.rank}</p>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-950">{row.title}</p>
        <p className="mt-1 text-xs text-slate-500">{row.brandName ?? "No brand"}</p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-[#1FA77A]"
            style={{ width: `${width}%` }}
          />
        </div>
      </div>
      <div className="text-sm">
        <p className="text-xs text-slate-500">Chosen</p>
        <p className="font-bold text-slate-950">{numberText(row.chosenCount)}</p>
      </div>
      <div className="text-sm">
        <p className="text-xs text-slate-500">Contribution</p>
        <p className="font-bold text-slate-950">
          {percentText(row.averageStackContributionPercent)}
        </p>
      </div>
    </div>
  );
}

export function AdminPlanCoverageSimulatorView({
  accessToken,
  data,
  locale
}: Readonly<{
  accessToken: string;
  data: AdminPlanCoverageSimulationData;
  locale: Locale;
}>) {
  const sampleSizes = [32, 64, 128, 256];

  return (
    <div className="mt-6 space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <Kpi
          icon={CheckCircleIcon}
          label="Average coverage"
          value={percentText(data.summary.averageCoveragePercent)}
        />
        <Kpi
          icon={CheckCircleIcon}
          label="Median coverage"
          value={percentText(data.summary.medianCoveragePercent)}
        />
        <Kpi
          icon={ExclamationTriangleIcon}
          label="P10 coverage"
          value={percentText(data.summary.p10CoveragePercent)}
        />
        <Kpi
          icon={BeakerIcon}
          label="Above 75%"
          value={percentText(data.summary.percentAbove75)}
        />
        <Kpi
          icon={CurrencyDollarIcon}
          label="Expected cost"
          value={moneyText(data.summary.expectedCostAmount, data.summary.currency)}
        />
        <Kpi
          icon={BeakerIcon}
          label="Samples"
          value={numberText(data.sampleSize)}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Synthetic plan projection</h2>
          <p className="text-sm text-slate-500">
            {data.countryCode} catalogue · seed {data.seed}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {sampleSizes.map((sampleSize) => (
            <a
              className={classNames(
                "rounded-md px-3 py-2 text-sm font-semibold ring-1",
                sampleSize === data.sampleSize
                  ? "bg-[#20343A] text-white ring-[#20343A]"
                  : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
              )}
              href={dashboardHref(
                "plan-coverage-simulator",
                locale,
                accessToken,
                { samples: sampleSize }
              )}
              key={sampleSize}
            >
              {sampleSize}
            </a>
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
        <section className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-950">Most useful products</h2>
            <Badge>{percentText(data.summary.percentAbove90)} above 90%</Badge>
          </div>
          <div className="mt-2">
            {data.mostUsefulProducts.length > 0 ? (
              data.mostUsefulProducts.map((row) => (
                <ProductUsefulnessBar key={row.id} row={row} />
              ))
            ) : (
              <p className="border-t border-slate-200 py-4 text-sm text-slate-500">
                No eligible products were selected by the simulation.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-bold text-slate-950">Most unmet supplements</h2>
          <div className="mt-2">
            {data.unmetSupplements.length > 0 ? (
              data.unmetSupplements.map((row) => (
                <div
                  className="flex items-center justify-between gap-3 border-t border-slate-200 py-3 text-sm"
                  key={row.name}
                >
                  <span className="font-semibold text-slate-950">{row.name}</span>
                  <span className="text-slate-500">
                    {numberText(row.count)} · {percentText(row.percent)}
                  </span>
                </div>
              ))
            ) : (
              <p className="border-t border-slate-200 py-4 text-sm text-slate-500">
                Every simulated supplement need had at least partial coverage.
              </p>
            )}
          </div>
        </section>
      </div>

      <section className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-950">Compact catalogue priority</h2>
          <a
            className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            href={dashboardHref("product-coverage", locale, accessToken)}
          >
            Review supplement coverage
          </a>
        </div>
        <div className="mt-2 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.compactCatalog.map((row) => (
            <div className="rounded-md bg-slate-50 p-3 ring-1 ring-slate-200" key={row.id}>
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-bold text-slate-950">{row.title}</p>
                <Badge>#{row.rank}</Badge>
              </div>
              <p className="mt-1 text-xs text-slate-500">{row.brandName ?? "No brand"}</p>
              <div className="mt-3 flex items-center justify-between text-xs font-semibold text-slate-600">
                <span>{numberText(row.chosenCount)} selections</span>
                <span>{percentText(row.averageStackContributionPercent)}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
