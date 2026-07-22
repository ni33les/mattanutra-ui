"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowTopRightOnSquareIcon,
  ChevronDownIcon,
  PlusIcon,
  TrashIcon
} from "@heroicons/react/24/outline";
import type {
  AdminCatalogueOptimizationData,
  AdminCatalogueOptimizationProgress,
  AdminPlanCoverageDemandProfile,
  AdminPlanCoverageSimulationData,
  AdminProductCoverageData,
  AdminPlanCoverageSimulationRunner,
  AdminSimulationNextMoveRow,
  AdminSimulationProductUsefulnessRow,
  AdminSupplementCoverageProductRow,
  AdminSupplementCoverageRow,
  SyntheticPlanArchetype
} from "@/lib/admin-product-coverage";
import type { AdminDashboardRange } from "@/lib/admin-dashboard-data";
import type { Locale } from "@/lib/i18n";
import {
  BusinessStatsGrid,
  classNames,
  type BusinessMetric
} from "@/components/admin/dashboard-shared";
import { AdminModal } from "@/components/admin/ui";
import { SafeImage } from "@/components/safe-image";
import {
  productCountryLabel,
  productCountryOptions
} from "@/lib/product-countries";
import {
  ADMIN_PLAN_COVERAGE_CONVERGENCE_MIN_SAMPLES,
  ADMIN_PLAN_COVERAGE_SIMULATION_MAX_SAMPLES,
  SIMULATION_ARCHETYPES,
  adminPlanCoverageSimulationDataFromRunner,
  buildSimulationNextMoveRows,
  createAdminPlanCoverageSimulationRunner,
  emptyAdminPlanCoverageSimulationData,
  normalizeDemandProfiles,
  runNextAdminPlanCoverageSimulationSample,
  sanitizeDemandProfilesForSimulationSupplements
} from "@/lib/admin-product-coverage-simulation";
import type { AdminCatalogueOptimizationJobView } from "@/lib/admin-catalogue-optimization-jobs";

import {
  SIMULATOR_INPUT_TIMEOUT_MS,
  numberText,
  emptyDemandProfileCacheSummary,
  allDemandProfileSampleIndexes,
  percentText,
  durationText,
  dateTimeText,
  compactListText,
  moneyText,
  amountText,
  normalizedSimulatorCountryCode,
  updateSimulatorCountryUrl,
  hashText,
  simulationInputKey,
  demandProfilesKey,
  draftFromArchetype,
  archetypeFromDraft,
  newArchetypeDraft,
  loadSavedSyntheticArchetypes,
  saveSyntheticArchetypes,
  simulationDataWithArchetypes,
  saveDemandProfiles,
  clearSavedDemandProfiles,
  loadSavedDemandProfiles,
  writeSavedSimulationState,
  saveSimulationState,
  clearSavedSimulationState,
  loadSavedCatalogueOptimization,
  loadSavedCatalogueOptimizationFromDurable,
  catalogueOptimizationMatchesSampleSize,
  saveCatalogueOptimization,
  clearSavedCatalogueOptimization,
  loadSavedSimulationState,
  loadSavedSimulationStateFromDurable,
  runnerFromSavedState,
  initialSimulationData,
  simulatorInputReady,
  productResultRows,
  priceBandClassName,
  priceBandLabel,
  productScatterRows,
  waitForNextSample,
  simulatorInputErrorMessage,
  runnerWithDemandProfiles,
  productDetailHref,
  simulatorInputHref,
  demandProfileHref,
  demandProfilesHref,
  catalogueOptimizationJobHref,
  catalogueOptimizationJobCachedProgress,
  catalogueOptimizationProgressFromJob,
  timestampMillis,
  catalogueOptimizationJobStartedAt,
  stateLabel,
  stateClassName,
  type ArchetypeDraft,
  type CatalogueOptimizationCachedProgress,
  type SimulatorInputStatus,
  type SimulatorClearTarget,
  type CatalogueOptimizationStatus,
  type PlanCoverageSimulatorMode,
  type SimulatorProgressDisplay,
  type DemandProfileCacheSummary,
  type DemandProfileCacheBatchResponse,
  type DemandProfileResponse,
  type ProductPerformanceScatterRow,
} from "@/components/admin/product-coverage-view-helpers";

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

function productCoverageMetrics(data: AdminProductCoverageData): BusinessMetric[] {
  return [
    {
      color: "#20343A",
      id: "activeSupplements",
      label: "Active supplements",
      series: [],
      value: numberText(data.summary.activeSupplements)
    },
    {
      color: "#126B4F",
      id: "coveredSupplements",
      label: "Covered",
      series: [],
      value: numberText(data.summary.coveredSupplements)
    },
    {
      color: "#F59E0B",
      id: "pendingReviewSupplements",
      label: "Pending review",
      series: [],
      value: numberText(data.summary.pendingReviewSupplements)
    },
    {
      color: "#DC2626",
      id: "missingSupplements",
      label: "Missing",
      series: [],
      value: numberText(data.summary.missingSupplements)
    },
    {
      color: "#0F766E",
      id: "eligibleProducts",
      label: "Eligible products",
      series: [],
      value: numberText(data.summary.totalEligibleProducts)
    }
  ];
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
    <div className="space-y-6">
      <BusinessStatsGrid metrics={productCoverageMetrics(data)} />

      <div>
        <h2 className="text-lg font-bold text-slate-950">Supplement coverage</h2>
        <p className="text-sm text-slate-500">
          {data.countryCode} catalogue · {numberText(data.rows.length)} active supplements
        </p>
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

export {
  AdminPlanCoverageSimulatorView,
  AdminProductOptimisationView
} from "@/components/admin/product-coverage-simulator-view";

