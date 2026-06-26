"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowTopRightOnSquareIcon,
  ChevronDownIcon,
  PlusIcon,
  TrashIcon
} from "@heroicons/react/24/outline";
import type {
  AdminPlanCoverageDemandProfile,
  AdminPlanCoverageSimulationData,
  AdminProductCoverageData,
  AdminPlanCoverageSimulationProductStats,
  AdminPlanCoverageSimulationRunner,
  AdminSimulationNextMoveRow,
  AdminSimulationProductUsefulnessRow,
  AdminSupplementCoverageProductRow,
  AdminSupplementCoverageRow,
  SupplementCoverageState,
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
  ADMIN_PLAN_COVERAGE_SIMULATION_MAX_SAMPLES,
  SIMULATION_ARCHETYPES,
  adminPlanCoverageSimulationDataFromRunner,
  buildSimulationNextMoveRows,
  createAdminPlanCoverageSimulationRunner,
  emptyAdminPlanCoverageSimulationData,
  normalizeDemandProfiles,
  normalizeSyntheticPlanArchetypes,
  runNextAdminPlanCoverageSimulationSample
} from "@/lib/admin-product-coverage-simulation";

const SIMULATOR_STORAGE_KEY =
  "mattanutra:admin-plan-coverage-simulator:v2";
const SIMULATOR_ARCHETYPES_STORAGE_KEY =
  "mattanutra:admin-plan-coverage-archetypes:v1";
const SIMULATOR_DEMAND_STORAGE_KEY =
  "mattanutra:admin-plan-coverage-demand-profiles:v1";

type ArchetypeDraft = Readonly<{
  clientSex: "" | "female" | "male";
  description: string;
  goals: string;
  id: string;
  medications: string;
  name: string;
  needCount: string;
  preferredSupplementNames: string;
}>;

type SavedSimulationState = Readonly<{
  costValues: number[];
  coverageValues: number[];
  displayData?: AdminPlanCoverageSimulationData;
  generatedAt: string;
  inputKey: string;
  productStats: Array<[string, AdminPlanCoverageSimulationProductStats]>;
  randomState: number;
  sampleSize: number;
  unmetCounts: Array<[string, number]>;
  version: 2;
}>;

type SavedDemandProfilesState = Readonly<{
  demandKey: string;
  profiles: readonly AdminPlanCoverageDemandProfile[];
  version: 1;
}>;

type SimulatorInputStatus = "error" | "loading" | "ready";
type SimulatorClearTarget = "all" | "profiles" | "results";

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

function amountText(amount: number | null) {
  if (amount === null) {
    return "No price";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0
  }).format(amount);
}

function hashText(value: string) {
  let hash = 2166136261;

  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function simulationInputKey(data: AdminPlanCoverageSimulationData) {
  return hashText(
    JSON.stringify({
      archetypes: data.input.archetypes.map((archetype) => ({
        clientSex: archetype.clientSex,
        goals: archetype.goals,
        id: archetype.id,
        medications: archetype.medications,
        needCount: archetype.needCount,
        preferredSupplementNames: archetype.preferredSupplementNames,
        source: archetype.source
      })),
      candidates: data.input.candidates.map((candidate) => ({
        audience: candidate.productAudience ?? null,
        brandStatus: candidate.brandStatus ?? null,
        facts: candidate.facts.map((fact) => ({
          amount: fact.amount,
          comparableAmount: fact.comparableAmount,
          itemType: fact.itemType,
          maxAmount: fact.maxAmount ?? null,
          maxUnit: fact.maxUnit ?? null,
          supplementId: fact.supplementId ?? null,
          unit: fact.unit
        })),
        id: candidate.id,
        labelStatus: candidate.labelStatus,
        priceAmount: candidate.priceAmount ?? null,
        status: candidate.status,
        unitPriceAmount: candidate.unitPriceAmount ?? null
      })),
      countryCode: data.input.countryCode,
      seed: data.input.seed,
      supplements: data.input.supplements.map((supplement) => ({
        id: supplement.id,
        targetComparableAmount: supplement.targetComparableAmount
      }))
    })
  );
}

function demandProfilesKey(
  data: AdminPlanCoverageSimulationData,
  archetypes: readonly SyntheticPlanArchetype[]
) {
  return hashText(
    JSON.stringify({
      archetypes: archetypes.map((archetype) => ({
        clientSex: archetype.clientSex,
        description: archetype.description,
        goals: archetype.goals,
        id: archetype.id,
        medications: archetype.medications,
        name: archetype.name,
        preferredSupplementNames: archetype.preferredSupplementNames
      })),
      countryCode: data.countryCode,
      seed: data.seed
    })
  );
}

function listText(values: readonly string[]) {
  return values.join("\n");
}

function listFromText(value: string) {
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function draftFromArchetype(archetype: SyntheticPlanArchetype): ArchetypeDraft {
  return {
    clientSex: archetype.clientSex ?? "",
    description: archetype.description,
    goals: listText(archetype.goals),
    id: archetype.id,
    medications: listText(archetype.medications),
    name: archetype.name,
    needCount: String(archetype.needCount),
    preferredSupplementNames: listText(archetype.preferredSupplementNames)
  };
}

function archetypeFromDraft(draft: ArchetypeDraft): SyntheticPlanArchetype {
  const parsedNeedCount = Number(draft.needCount);

  return normalizeSyntheticPlanArchetypes([{
    age: null,
    clientSex: draft.clientSex || null,
    customerCount: null,
    description: draft.description,
    goals: listFromText(draft.goals),
    id: draft.id,
    medications: listFromText(draft.medications),
    name: draft.name,
    needCount: Number.isFinite(parsedNeedCount) ? parsedNeedCount : 4,
    preferredSupplementNames: listFromText(draft.preferredSupplementNames),
    source: "synthetic"
  }])[0]!;
}

function newArchetypeDraft(): ArchetypeDraft {
  return {
    clientSex: "",
    description: "",
    goals: "",
    id: `custom-${Date.now().toString(36)}`,
    medications: "",
    name: "New customer profile",
    needCount: "4",
    preferredSupplementNames: ""
  };
}

function loadSavedSyntheticArchetypes() {
  try {
    const raw = window.localStorage.getItem(SIMULATOR_ARCHETYPES_STORAGE_KEY);

    if (!raw) {
      return SIMULATION_ARCHETYPES;
    }

    const parsed = JSON.parse(raw);
    const normalized = normalizeSyntheticPlanArchetypes(parsed)
      .filter((archetype) => archetype.source === "synthetic");

    return normalized.length > 0 ? normalized : SIMULATION_ARCHETYPES;
  } catch {
    return SIMULATION_ARCHETYPES;
  }
}

function saveSyntheticArchetypes(archetypes: readonly SyntheticPlanArchetype[]) {
  try {
    window.localStorage.setItem(
      SIMULATOR_ARCHETYPES_STORAGE_KEY,
      JSON.stringify(archetypes)
    );
  } catch {
    // Storage is a convenience; defaults remain available without it.
  }
}

function simulationDataWithArchetypes(
  data: AdminPlanCoverageSimulationData,
  archetypes: readonly SyntheticPlanArchetype[],
  demandProfiles: readonly AdminPlanCoverageDemandProfile[]
) {
  return emptyAdminPlanCoverageSimulationData({
    ...data.input,
    archetypes,
    databaseAvailable: data.databaseAvailable,
    demandProfiles,
    realCustomerArchetypes: data.realCustomerArchetypes,
    realCustomerProfileCount: data.realCustomerProfileCount,
    realCustomerProfiles: data.realCustomerProfiles,
    reviewPriorityProducts: data.reviewPriorityProducts
  });
}

function saveDemandProfiles(
  demandKey: string,
  profiles: readonly AdminPlanCoverageDemandProfile[]
) {
  try {
    window.localStorage.setItem(
      SIMULATOR_DEMAND_STORAGE_KEY,
      JSON.stringify({
        demandKey,
        profiles,
        version: 1
      } satisfies SavedDemandProfilesState)
    );
  } catch {
    // Storage is a convenience; profiles can be regenerated.
  }
}

function clearSavedDemandProfiles() {
  try {
    window.localStorage.removeItem(SIMULATOR_DEMAND_STORAGE_KEY);
  } catch {
    // Ignore private browsing or storage policy failures.
  }
}

function loadSavedDemandProfiles(demandKey: string) {
  try {
    const raw = window.localStorage.getItem(SIMULATOR_DEMAND_STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as Partial<SavedDemandProfilesState>;

    if (
      parsed.version !== 1 ||
      parsed.demandKey !== demandKey ||
      !Array.isArray(parsed.profiles)
    ) {
      return [];
    }

    return normalizeDemandProfiles(parsed.profiles);
  } catch {
    return [];
  }
}

function savedStateFromRunner(
  inputKey: string,
  runner: AdminPlanCoverageSimulationRunner
): SavedSimulationState {
  return {
    costValues: runner.costValues,
    coverageValues: runner.coverageValues,
    displayData: simulationDisplaySnapshotFromRunner(runner),
    generatedAt: runner.generatedAt,
    inputKey,
    productStats: [...runner.productStats.entries()],
    randomState: runner.randomState,
    sampleSize: runner.sampleSize,
    unmetCounts: [...runner.unmetCounts.entries()],
    version: 2
  };
}

function saveSimulationState(
  inputKey: string,
  runner: AdminPlanCoverageSimulationRunner
) {
  try {
    window.localStorage.setItem(
      SIMULATOR_STORAGE_KEY,
      JSON.stringify(savedStateFromRunner(inputKey, runner))
    );
  } catch {
    // Storage is a convenience; the simulator still works without it.
  }
}

function clearSavedSimulationState() {
  try {
    window.localStorage.removeItem(SIMULATOR_STORAGE_KEY);
  } catch {
    // Ignore private browsing or storage policy failures.
  }
}

function loadSavedSimulationState(inputKey: string) {
  try {
    const raw = window.localStorage.getItem(SIMULATOR_STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<SavedSimulationState>;

    if (
      parsed.version !== 2 ||
      parsed.inputKey !== inputKey ||
      !Array.isArray(parsed.coverageValues) ||
      !Array.isArray(parsed.costValues) ||
      !Array.isArray(parsed.productStats) ||
      !Array.isArray(parsed.unmetCounts) ||
      typeof parsed.randomState !== "number" ||
      typeof parsed.sampleSize !== "number"
    ) {
      return null;
    }

    return parsed as SavedSimulationState;
  } catch {
    return null;
  }
}

function savedSimulationReplayTarget(inputKey: string) {
  try {
    const raw = window.localStorage.getItem(SIMULATOR_STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<SavedSimulationState>;

    if (
      parsed.version !== 2 ||
      parsed.inputKey === inputKey ||
      typeof parsed.sampleSize !== "number" ||
      parsed.sampleSize < 1
    ) {
      return null;
    }

    return Math.min(
      ADMIN_PLAN_COVERAGE_SIMULATION_MAX_SAMPLES,
      Math.max(0, Math.floor(parsed.sampleSize))
    );
  } catch {
    return null;
  }
}

function simulationDisplaySnapshotFromRunner(
  runner: AdminPlanCoverageSimulationRunner
) {
  const data = adminPlanCoverageSimulationDataFromRunner(runner);

  return {
    ...data,
    archetypes: [],
    input: {
      ...data.input,
      archetypes: [],
      candidates: [],
      demandProfiles: [],
      supplements: []
    },
    realCustomerArchetypes: [],
    realCustomerProfiles: [],
    reviewPriorityProducts: []
  };
}

function loadSavedSimulationDisplayData(countryCode: string) {
  try {
    const raw = window.localStorage.getItem(SIMULATOR_STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<SavedSimulationState>;
    const displayData = parsed.displayData;

    if (
      parsed.version !== 2 ||
      !displayData ||
      displayData.countryCode !== countryCode ||
      typeof displayData.sampleSize !== "number" ||
      !Array.isArray(displayData.mostUsefulProducts) ||
      !Array.isArray(displayData.unmetSupplements)
    ) {
      return null;
    }

    return displayData;
  } catch {
    return null;
  }
}

function runnerFromSavedState(
  data: AdminPlanCoverageSimulationData,
  saved: SavedSimulationState
) {
  const runner = createAdminPlanCoverageSimulationRunner(data.input);

  runner.costValues = [...saved.costValues];
  runner.coverageValues = [...saved.coverageValues];
  runner.generatedAt = saved.generatedAt;
  runner.productStats = new Map(saved.productStats);
  runner.randomState = saved.randomState;
  runner.sampleSize = Math.max(0, Math.floor(saved.sampleSize));
  runner.unmetCounts = new Map(saved.unmetCounts);

  return runner;
}

function initialSimulationData(data: AdminPlanCoverageSimulationData) {
  return emptyAdminPlanCoverageSimulationData({
    ...data.input,
    databaseAvailable: data.databaseAvailable,
    realCustomerArchetypes: data.realCustomerArchetypes,
    realCustomerProfileCount: data.realCustomerProfileCount,
    realCustomerProfiles: data.realCustomerProfiles,
    reviewPriorityProducts: data.reviewPriorityProducts
  });
}

function initialSimulationDataWithCachedDisplay(
  data: AdminPlanCoverageSimulationData
) {
  return loadSavedSimulationDisplayData(data.countryCode) ?? initialSimulationData(data);
}

function waitForNextSample() {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, 24);
  });
}

function runnerWithDemandProfiles(
  runner: AdminPlanCoverageSimulationRunner,
  profiles: readonly AdminPlanCoverageDemandProfile[]
): AdminPlanCoverageSimulationRunner {
  return {
    ...runner,
    input: {
      ...runner.input,
      demandProfiles: profiles
    }
  };
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

function simulatorInputHref(
  countryCode: string,
  accessToken: string,
  range: AdminDashboardRange
) {
  const params = new URLSearchParams({ country: countryCode, range });

  if (accessToken) {
    params.set("access_token", accessToken);
  }

  return `/api/admin/product-coverage/simulation-input?${params.toString()}`;
}

function demandProfileHref(accessToken: string) {
  const params = new URLSearchParams();

  if (accessToken) {
    params.set("access_token", accessToken);
  }

  const suffix = params.toString();

  return `/api/admin/product-coverage/demand-profile${suffix ? `?${suffix}` : ""}`;
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

function NextMoveProductRow({
  accessToken,
  locale,
  row
}: Readonly<{
  accessToken: string;
  locale: Locale;
  row: AdminSimulationNextMoveRow;
}>) {
  const width = Math.max(8, Math.min(100, row.unmetDemandPercent));

  return (
    <div className="grid gap-3 border-t border-slate-200 py-4 lg:grid-cols-[44px_minmax(0,1fr)_120px_120px_120px] lg:items-center">
      <p className="text-sm font-bold text-slate-400">#{row.rank}</p>
      <div className="min-w-0">
        <a
          className="inline-flex max-w-full items-center gap-1 truncate text-sm font-semibold text-slate-950 hover:text-[#168060]"
          href={productDetailHref(row.id, locale, accessToken)}
        >
          <span className="truncate">{row.title}</span>
          <ArrowTopRightOnSquareIcon className="size-4 shrink-0" aria-hidden={true} />
        </a>
        <p className="mt-1 text-xs text-slate-500">{row.brandName ?? "No brand"}</p>
        <p className="mt-1 text-xs text-slate-500">{row.blockedReason}</p>
        <p className="mt-1 truncate text-xs text-slate-500">
          {row.unmetSupplementNames.join(" · ")}
        </p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-[#F59E0B]"
            style={{ width: `${width}%` }}
          />
        </div>
      </div>
      <div className="text-sm">
        <p className="text-xs text-slate-500">Unmet demand</p>
        <p className="font-bold text-slate-950">{numberText(row.unmetDemandCount)}</p>
      </div>
      <div className="text-sm">
        <p className="text-xs text-slate-500">Gaps</p>
        <p className="font-bold text-slate-950">
          {numberText(row.gapSupplementCount)}
        </p>
      </div>
      <div className="text-sm">
        <p className="text-xs text-slate-500">Price</p>
        <p className="font-bold text-slate-950">
          {amountText(row.expectedPriceAmount)}
        </p>
      </div>
    </div>
  );
}

function simulationMetrics(data: AdminPlanCoverageSimulationData): BusinessMetric[] {
  return [
    {
      color: "#126B4F",
      format: "percent",
      id: "averageCoverage",
      label: "Average coverage",
      series: [],
      value: percentText(data.summary.averageCoveragePercent)
    },
    {
      color: "#0F766E",
      format: "percent",
      id: "medianCoverage",
      label: "Median coverage",
      series: [],
      value: percentText(data.summary.medianCoveragePercent)
    },
    {
      color: "#F59E0B",
      format: "percent",
      id: "p10Coverage",
      label: "P10 coverage",
      series: [],
      value: percentText(data.summary.p10CoveragePercent)
    },
    {
      color: "#3A7BD5",
      format: "percent",
      id: "above75",
      label: "Above 75%",
      series: [],
      value: percentText(data.summary.percentAbove75)
    },
    {
      color: "#20343A",
      format: "number",
      id: "expectedCost",
      label: "Expected cost",
      series: [],
      value: amountText(data.summary.expectedCostAmount)
    },
    {
      color: "#8B5CF6",
      id: "samples",
      label: "Samples",
      series: [],
      value: numberText(data.sampleSize)
    }
  ];
}

function sexFilterLabel(value: "both" | "female" | "male" | null) {
  if (value === "female") {
    return "Female";
  }

  if (value === "male") {
    return "Male";
  }

  return "Any sex";
}

function simulationStatusText(
  data: AdminPlanCoverageSimulationData,
  inputStatus: SimulatorInputStatus,
  generatingProfile: boolean,
  running: boolean,
  hydrated: boolean
) {
  if (inputStatus === "loading") {
    return "Loading";
  }

  if (inputStatus === "error") {
    return "Unable to load";
  }

  if (!data.databaseAvailable) {
    return "Catalogue unavailable";
  }

  if (!hydrated) {
    return "Loading";
  }

  if (running && generatingProfile) {
    return "Generating questionnaire";
  }

  if (running) {
    return "Running simulation";
  }

  if (data.sampleSize >= ADMIN_PLAN_COVERAGE_SIMULATION_MAX_SAMPLES) {
    return "Complete";
  }

  if (data.sampleSize > 0) {
    return "Paused";
  }

  return "Ready";
}

function SimulationProgressPanel({
  demandError,
  demandProfiles,
  generating,
  hydrated,
  inputStatus,
  progressPercent,
  running,
  simulationData
}: Readonly<{
  demandError: string | null;
  demandProfiles: readonly AdminPlanCoverageDemandProfile[];
  generating: boolean;
  hydrated: boolean;
  inputStatus: SimulatorInputStatus;
  progressPercent: number;
  running: boolean;
  simulationData: AdminPlanCoverageSimulationData;
}>) {
  return (
    <section className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-950">
          {simulationStatusText(
            simulationData,
            inputStatus,
            generating,
            running,
            hydrated
          )}
        </p>
        <p className="text-sm text-slate-500">
          {numberText(Math.max(simulationData.sampleSize, demandProfiles.length))} /{" "}
          {numberText(ADMIN_PLAN_COVERAGE_SIMULATION_MAX_SAMPLES)}
        </p>
      </div>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-[#1FA77A] transition-[width]"
          style={{ width: `${Math.max(0, Math.min(100, progressPercent))}%` }}
        />
      </div>
      {demandError ? (
        <p className="mt-2 text-sm font-semibold text-rose-700">{demandError}</p>
      ) : null}
    </section>
  );
}

function ProfileSummaryRow({
  archetype,
  onRemove,
  onSelect,
  selected
}: Readonly<{
  archetype: SyntheticPlanArchetype;
  onRemove?: () => void;
  onSelect: () => void;
  selected: boolean;
}>) {
  const real = archetype.source === "customer_archetype";

  return (
    <div
      className={classNames(
        "rounded-md bg-slate-50 p-3 ring-1",
        selected
          ? "ring-2 ring-[#3A7BD5]"
          : "ring-slate-200"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <button
          className="min-w-0 flex-1 text-left"
          onClick={onSelect}
          type="button"
        >
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="truncate text-sm font-bold text-slate-950">
              {archetype.name}
            </span>
            {real ? (
              <Badge className="bg-blue-50 text-blue-700 ring-blue-200">Real</Badge>
            ) : null}
          </span>
          <span className="mt-1 block text-xs text-slate-500">
            {[
              sexFilterLabel(archetype.clientSex),
              `${numberText(archetype.needCount)} needs`,
              archetype.customerCount
                ? `${numberText(archetype.customerCount)} customers`
                : null
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </button>
        {onRemove ? (
          <button
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-white text-rose-600 ring-1 ring-rose-100 hover:bg-rose-50"
            onClick={onRemove}
            type="button"
          >
            <TrashIcon className="size-4" aria-hidden={true} />
            <span className="sr-only">Remove {archetype.name}</span>
          </button>
        ) : null}
      </div>
      {archetype.description ? (
        <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600">
          {archetype.description}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {[...archetype.goals, ...archetype.preferredSupplementNames]
          .slice(0, 5)
          .map((item) => (
            <Badge key={item}>{item}</Badge>
          ))}
      </div>
    </div>
  );
}

function SimulationProfileEditorModal({
  onClose,
  onSyntheticArchetypesChange,
  realCustomerArchetypes,
  syntheticArchetypes
}: Readonly<{
  onClose: () => void;
  onSyntheticArchetypesChange: (archetypes: readonly SyntheticPlanArchetype[]) => void;
  realCustomerArchetypes: readonly SyntheticPlanArchetype[];
  syntheticArchetypes: readonly SyntheticPlanArchetype[];
}>) {
  const mergedArchetypes = useMemo(
    () => [...syntheticArchetypes, ...realCustomerArchetypes],
    [realCustomerArchetypes, syntheticArchetypes]
  );
  const initialArchetype =
    mergedArchetypes[0] ?? SIMULATION_ARCHETYPES[0]!;
  const [selectedKey, setSelectedKey] = useState<string | null>(
    `${initialArchetype.source}:${initialArchetype.id}`
  );
  const [draft, setDraft] = useState<ArchetypeDraft | null>(
    () => draftFromArchetype(initialArchetype)
  );
  const selectedArchetype = selectedKey
    ? mergedArchetypes.find(
        (archetype) => `${archetype.source}:${archetype.id}` === selectedKey
      ) ?? null
    : null;
  const readOnly = selectedArchetype?.source === "customer_archetype";
  const disabledClassName = readOnly ? "bg-slate-100 text-slate-500" : "";

  function updateSyntheticArchetypes(next: readonly SyntheticPlanArchetype[]) {
    onSyntheticArchetypesChange(next);
    saveSyntheticArchetypes(next);
  }

  function selectArchetype(archetype: SyntheticPlanArchetype) {
    setSelectedKey(`${archetype.source}:${archetype.id}`);
    setDraft(draftFromArchetype(archetype));
  }

  function saveDraft() {
    if (!draft || readOnly) {
      return;
    }

    const nextArchetype = archetypeFromDraft(draft);
    const exists = syntheticArchetypes.some(
      (archetype) => archetype.id === nextArchetype.id
    );
    const next = exists
      ? syntheticArchetypes.map((archetype) =>
          archetype.id === nextArchetype.id ? nextArchetype : archetype
        )
      : [...syntheticArchetypes, nextArchetype];

    updateSyntheticArchetypes(next);
    setSelectedKey(`${nextArchetype.source}:${nextArchetype.id}`);
    setDraft(draftFromArchetype(nextArchetype));
  }

  function removeArchetype(id: string) {
    const next = syntheticArchetypes.filter((archetype) => archetype.id !== id);
    const fallback = next[0] ?? SIMULATION_ARCHETYPES[0]!;

    updateSyntheticArchetypes(next.length > 0 ? next : [fallback]);
    setSelectedKey(`${fallback.source}:${fallback.id}`);
    setDraft(draftFromArchetype(fallback));
  }

  function resetSyntheticArchetypes() {
    updateSyntheticArchetypes(SIMULATION_ARCHETYPES);
    setSelectedKey(`${SIMULATION_ARCHETYPES[0]!.source}:${SIMULATION_ARCHETYPES[0]!.id}`);
    setDraft(draftFromArchetype(SIMULATION_ARCHETYPES[0]!));
  }

  return (
    <AdminModal
      description={
        "Use editable synthetic archetypes plus read-only real Customer Intelligence archetypes. These are not AI prompts."
      }
      onClose={onClose}
      size="2xl"
      title="Configure simulation profiles"
    >
      <div className="space-y-5 px-6 py-5">
        <div className="grid gap-4 xl:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.1fr)]">
          <section className="rounded-lg bg-white p-4 ring-1 ring-slate-200">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-950">
                  Archetypes
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Select a card to view details. Real archetypes are read-only.
                </p>
              </div>
              <button
                className="inline-flex size-9 items-center justify-center rounded-md bg-[#20343A] text-white hover:bg-[#16252A]"
                onClick={() => {
                  setSelectedKey(null);
                  setDraft(newArchetypeDraft());
                }}
                type="button"
              >
                <PlusIcon className="size-5" aria-hidden={true} />
                <span className="sr-only">Add profile</span>
              </button>
            </div>

            <div className="mt-4 max-h-[30rem] space-y-2 overflow-y-auto pr-1">
              {mergedArchetypes.map((archetype) => (
                <ProfileSummaryRow
                  archetype={archetype}
                  key={`${archetype.source}:${archetype.id}`}
                  onRemove={
                    archetype.source === "synthetic"
                      ? () => removeArchetype(archetype.id)
                      : undefined
                  }
                  onSelect={() => selectArchetype(archetype)}
                  selected={
                    selectedKey === `${archetype.source}:${archetype.id}`
                  }
                />
              ))}
            </div>

            <button
              className="mt-4 rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
              onClick={resetSyntheticArchetypes}
              type="button"
            >
              Reset synthetic defaults
            </button>
          </section>

          <section className="rounded-lg bg-white p-4 ring-1 ring-slate-200">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-slate-950">Profile details</h3>
              {readOnly ? (
                <Badge className="bg-blue-50 text-blue-700 ring-blue-200">Real</Badge>
              ) : null}
            </div>
            {draft ? (
              <div className="mt-4 grid gap-3">
                <label className="grid gap-1 text-sm font-semibold text-slate-700">
                  Name
                  <input
                    className={classNames(
                      "rounded-md border border-slate-200 px-3 py-2 text-sm font-normal text-slate-950",
                      disabledClassName
                    )}
                    disabled={readOnly}
                    onChange={(event) =>
                      setDraft({ ...draft, name: event.target.value })
                    }
                    value={draft.name}
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm font-semibold text-slate-700">
                    Sex
                    <select
                      className={classNames(
                        "rounded-md border border-slate-200 px-3 py-2 text-sm font-normal text-slate-950",
                        disabledClassName
                      )}
                      disabled={readOnly}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          clientSex: event.target.value as ArchetypeDraft["clientSex"]
                        })
                      }
                      value={draft.clientSex}
                    >
                      <option value="">Any</option>
                      <option value="female">Female</option>
                      <option value="male">Male</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm font-semibold text-slate-700">
                    Needs
                    <input
                      className={classNames(
                        "rounded-md border border-slate-200 px-3 py-2 text-sm font-normal text-slate-950",
                        disabledClassName
                      )}
                      disabled={readOnly}
                      min={1}
                      max={12}
                      onChange={(event) =>
                        setDraft({ ...draft, needCount: event.target.value })
                      }
                      type="number"
                      value={draft.needCount}
                    />
                  </label>
                </div>
                <label className="grid gap-1 text-sm font-semibold text-slate-700">
                  Describe the person
                  <textarea
                    className={classNames(
                      "min-h-24 rounded-md border border-slate-200 px-3 py-2 text-sm font-normal text-slate-950",
                      disabledClassName
                    )}
                    disabled={readOnly}
                    onChange={(event) =>
                      setDraft({ ...draft, description: event.target.value })
                    }
                    value={draft.description}
                  />
                </label>
                <div className="grid gap-3 lg:grid-cols-3">
                  <label className="grid gap-1 text-sm font-semibold text-slate-700">
                    Goals
                    <textarea
                      className={classNames(
                        "min-h-28 rounded-md border border-slate-200 px-3 py-2 text-sm font-normal text-slate-950",
                        disabledClassName
                      )}
                      disabled={readOnly}
                      onChange={(event) =>
                        setDraft({ ...draft, goals: event.target.value })
                      }
                      value={draft.goals}
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-semibold text-slate-700">
                    Medication
                    <textarea
                      className={classNames(
                        "min-h-28 rounded-md border border-slate-200 px-3 py-2 text-sm font-normal text-slate-950",
                        disabledClassName
                      )}
                      disabled={readOnly}
                      onChange={(event) =>
                        setDraft({ ...draft, medications: event.target.value })
                      }
                      value={draft.medications}
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-semibold text-slate-700">
                    Supplements
                    <textarea
                      className={classNames(
                        "min-h-28 rounded-md border border-slate-200 px-3 py-2 text-sm font-normal text-slate-950",
                        disabledClassName
                      )}
                      disabled={readOnly}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          preferredSupplementNames: event.target.value
                        })
                      }
                      value={draft.preferredSupplementNames}
                    />
                  </label>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  {readOnly ? (
                    <p className="mr-auto text-sm text-slate-500">
                      Real archetypes come from Customer Intelligence and cannot be edited here.
                    </p>
                  ) : null}
                  <button
                    className={classNames(
                      "rounded-md px-3 py-2 text-sm font-semibold",
                      readOnly
                        ? "bg-slate-100 text-slate-400"
                        : "bg-[#20343A] text-white hover:bg-[#16252A]"
                    )}
                    disabled={readOnly}
                    onClick={saveDraft}
                    type="button"
                  >
                    Save profile
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </AdminModal>
  );
}

function SimulatorActionBar({
  canRun,
  clearTarget,
  onClear,
  onClearTargetChange,
  onConfigure,
  onRun,
  onStop,
  running
}: Readonly<{
  canRun: boolean;
  clearTarget: SimulatorClearTarget;
  onClear: () => void;
  onClearTargetChange: (target: SimulatorClearTarget) => void;
  onConfigure: () => void;
  onRun: () => void;
  onStop: () => void;
  running: boolean;
}>) {
  const groupButtonClassName =
    "relative inline-flex h-9 items-center px-3 text-sm font-semibold ring-1 ring-inset ring-slate-300 focus:z-10 focus:outline-none focus:ring-2 focus:ring-[#1FA77A]";

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div
        aria-label="Simulation controls"
        className="isolate inline-flex rounded-md shadow-sm"
        role="group"
      >
        <button
          className={classNames(
            groupButtonClassName,
            "rounded-l-md bg-white text-slate-700 hover:bg-slate-50"
          )}
          onClick={onConfigure}
          type="button"
        >
          Configure
        </button>
        <button
          className={classNames(
            groupButtonClassName,
            "-ml-px",
            canRun && !running
              ? "bg-[#20343A] text-white hover:bg-[#16252A]"
              : "bg-slate-100 text-slate-400"
          )}
          disabled={!canRun || running}
          onClick={onRun}
          type="button"
        >
          Run
        </button>
        <button
          className={classNames(
            groupButtonClassName,
            "-ml-px rounded-r-md",
            running
              ? "bg-white text-slate-700 hover:bg-slate-50"
              : "bg-slate-100 text-slate-400"
          )}
          disabled={!running}
          onClick={onStop}
          type="button"
        >
          Stop
        </button>
      </div>

      <div
        aria-label="Clear simulator state"
        className="isolate inline-flex rounded-md shadow-sm"
        role="group"
      >
        <div className="relative">
          <label className="sr-only" htmlFor="simulator-clear-target">
            Clear target
          </label>
          <select
            className="relative h-9 appearance-none rounded-l-md border-0 bg-white py-0 pl-3 pr-8 text-sm font-semibold text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus:z-10 focus:outline-none focus:ring-2 focus:ring-[#1FA77A]"
            id="simulator-clear-target"
            onChange={(event) =>
              onClearTargetChange(event.target.value as SimulatorClearTarget)
            }
            value={clearTarget}
          >
            <option value="results">Results</option>
            <option value="profiles">Profiles</option>
            <option value="all">All</option>
          </select>
          <ChevronDownIcon
            aria-hidden={true}
            className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-slate-500"
          />
        </div>
        <button
          className="relative -ml-px inline-flex h-9 items-center rounded-r-md bg-white px-3 text-sm font-semibold text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus:z-10 focus:outline-none focus:ring-2 focus:ring-[#1FA77A]"
          onClick={onClear}
          type="button"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

export function AdminPlanCoverageSimulatorView({
  accessToken,
  data,
  locale,
  range
}: Readonly<{
  accessToken: string;
  data: AdminPlanCoverageSimulationData;
  locale: Locale;
  range: AdminDashboardRange;
}>) {
  const [inputData, setInputData] = useState(data);
  const [inputStatus, setInputStatus] =
    useState<SimulatorInputStatus>("loading");
  const [inputError, setInputError] = useState<string | null>(null);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [syntheticArchetypes, setSyntheticArchetypes] = useState(
    loadSavedSyntheticArchetypes
  );
  const [clearTarget, setClearTarget] =
    useState<SimulatorClearTarget>("results");
  const [demandProfiles, setDemandProfiles] = useState<
    AdminPlanCoverageDemandProfile[]
  >([]);
  const [demandGenerating, setDemandGenerating] = useState(false);
  const [demandError, setDemandError] = useState<string | null>(null);
  const [inputRefreshNonce, setInputRefreshNonce] = useState(0);
  const activeArchetypes = useMemo(
    () => [
      ...(syntheticArchetypes.length > 0
        ? syntheticArchetypes
        : SIMULATION_ARCHETYPES),
      ...inputData.realCustomerArchetypes
    ],
    [inputData.realCustomerArchetypes, syntheticArchetypes]
  );
  const demandKey = useMemo(
    () => demandProfilesKey(inputData, activeArchetypes),
    [activeArchetypes, inputData]
  );
  const activeInputData = useMemo(
    () => simulationDataWithArchetypes(inputData, activeArchetypes, demandProfiles),
    [activeArchetypes, demandProfiles, inputData]
  );
  const inputKey = useMemo(
    () => simulationInputKey(activeInputData),
    [activeInputData]
  );
  const [simulationData, setSimulationData] = useState(() =>
    initialSimulationDataWithCachedDisplay(data)
  );
  const [hydrated, setHydrated] = useState(false);
  const [running, setRunning] = useState(false);
  const [nextMovesClearedKey, setNextMovesClearedKey] = useState<string | null>(
    null
  );
  const runnerRef = useRef<AdminPlanCoverageSimulationRunner | null>(null);
  const runTokenRef = useRef(0);
  const previousDemandKeyRef = useRef<string | null>(null);
  const runningRef = useRef(false);
  const progressPercent =
    (Math.max(simulationData.sampleSize, demandProfiles.length) /
      ADMIN_PLAN_COVERAGE_SIMULATION_MAX_SAMPLES) * 100;
  const canRun =
    hydrated &&
    inputStatus === "ready" &&
    activeInputData.databaseAvailable &&
    simulationData.sampleSize < ADMIN_PLAN_COVERAGE_SIMULATION_MAX_SAMPLES &&
    activeInputData.input.supplements.length > 0 &&
    activeInputData.input.archetypes.length > 0;
  const nextMoveRows = useMemo(
    () =>
      buildSimulationNextMoveRows({
        reviewPriorityProducts: inputData.reviewPriorityProducts,
        simulationData
      }),
    [inputData.reviewPriorityProducts, simulationData]
  );
  const nextMovesKey = useMemo(
    () =>
      hashText(
        JSON.stringify({
          inputKey,
          rows: nextMoveRows.map((row) => ({
            id: row.id,
            score: row.nextMoveScore,
            unmetDemandCount: row.unmetDemandCount
          })),
          sampleSize: simulationData.sampleSize,
          unmetSupplements: simulationData.unmetSupplements
        })
      ),
    [inputKey, nextMoveRows, simulationData.sampleSize, simulationData.unmetSupplements]
  );
  const nextMovesCleared =
    nextMoveRows.length > 0 && nextMovesClearedKey === nextMovesKey;
  const visibleNextMoveRows = nextMovesCleared ? [] : nextMoveRows;

  const replayCachedDemandProfiles = useCallback(async (
    runToken: number,
    targetSampleSize: number
  ) => {
    const profiles = [...demandProfiles].sort(
      (first, second) => first.sampleIndex - second.sampleIndex
    );

    if (profiles.length < 1 || !activeInputData.databaseAvailable) {
      return;
    }

    let runner = createAdminPlanCoverageSimulationRunner({
      ...activeInputData.input,
      demandProfiles: profiles
    });
    const target = Math.min(
      ADMIN_PLAN_COVERAGE_SIMULATION_MAX_SAMPLES,
      profiles.length,
      Math.max(1, Math.floor(targetSampleSize))
    );

    runnerRef.current = runner;
    setDemandError(null);
    setDemandGenerating(false);
    setRunning(true);
    setHydrated(true);

    try {
      while (runToken === runTokenRef.current && runner.sampleSize < target) {
        const nextData = runNextAdminPlanCoverageSimulationSample(runner);

        if (runToken !== runTokenRef.current) {
          break;
        }

        runner = runnerWithDemandProfiles(runner, profiles);
        runnerRef.current = runner;
        setSimulationData(nextData);
        saveSimulationState(inputKey, runner);

        if (
          runner.sampleSize >= target ||
          runner.sampleSize >= ADMIN_PLAN_COVERAGE_SIMULATION_MAX_SAMPLES
        ) {
          break;
        }

        if (runner.sampleSize % 8 === 0) {
          await waitForNextSample();
        }
      }
    } finally {
      if (runToken === runTokenRef.current) {
        setRunning(false);
      }
    }
  }, [activeInputData, demandProfiles, inputKey]);

  useEffect(() => {
    runningRef.current = running || demandGenerating;
  }, [demandGenerating, running]);

  useEffect(() => {
    const refreshInput = () => {
      if (runningRef.current) {
        return;
      }

      setInputRefreshNonce((value) => value + 1);
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        refreshInput();
      }
    };

    window.addEventListener("focus", refreshInput);
    window.addEventListener("pageshow", refreshInput);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.removeEventListener("focus", refreshInput);
      window.removeEventListener("pageshow", refreshInput);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      if (cancelled) {
        return;
      }

      setInputStatus("loading");
      setInputError(null);
      setInputData(data);
      const cachedSimulationData = loadSavedSimulationDisplayData(data.countryCode);
      setSimulationData(cachedSimulationData ?? initialSimulationData(data));
      setHydrated(Boolean(cachedSimulationData));
      setRunning(false);
      runnerRef.current = null;

      fetch(simulatorInputHref(data.countryCode, accessToken, range), {
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          "Cache-Control": "no-store",
          ...(accessToken ? { "x-admin-dashboard-token": accessToken } : {})
        }
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`Simulator input request failed (${response.status})`);
          }

          return response.json() as Promise<AdminPlanCoverageSimulationData>;
        })
        .then((payload) => {
          if (cancelled) {
            return;
          }

          setInputData(payload);
          setInputStatus("ready");
        })
        .catch((error) => {
          if (cancelled) {
            return;
          }

          setInputData(emptyAdminPlanCoverageSimulationData({
            countryCode: data.countryCode,
            databaseAvailable: false,
            seed: data.seed
          }));
          setInputError(error instanceof Error ? error.message : "Unknown input error");
          setInputStatus("error");
          setHydrated(true);
        });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [accessToken, data, inputRefreshNonce, range]);

  useEffect(() => {
    if (inputStatus !== "ready") {
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      if (cancelled) {
        return;
      }

      const previousDemandKey = previousDemandKeyRef.current;
      previousDemandKeyRef.current = demandKey;

      setDemandGenerating(false);
      setDemandError(null);
      setDemandProfiles(loadSavedDemandProfiles(demandKey));

      if (previousDemandKey !== null && previousDemandKey !== demandKey) {
        clearSavedSimulationState();
        runnerRef.current = null;
      }
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [demandKey, inputStatus]);

  useEffect(() => {
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      if (cancelled) {
        return;
      }

      if (running || demandGenerating) {
        return;
      }

      if (inputStatus === "loading") {
        runnerRef.current = null;
        setRunning(false);
        return;
      }

      if (inputStatus === "error" || !activeInputData.databaseAvailable) {
        runnerRef.current = null;
        setSimulationData(initialSimulationData(activeInputData));
        setRunning(false);
        setHydrated(true);
        return;
      }

      const savedState = loadSavedSimulationState(inputKey);

      if (savedState) {
        const savedRunner = runnerFromSavedState(activeInputData, savedState);
        runnerRef.current = savedRunner;
        setSimulationData(adminPlanCoverageSimulationDataFromRunner(savedRunner));
      } else {
        const replayTarget = savedSimulationReplayTarget(inputKey);

        runnerRef.current = createAdminPlanCoverageSimulationRunner(activeInputData.input);
        setSimulationData(initialSimulationData(activeInputData));

        if (
          replayTarget !== null &&
          activeInputData.input.demandProfiles.length > 0
        ) {
          runTokenRef.current += 1;
          setNextMovesClearedKey(null);
          void replayCachedDemandProfiles(runTokenRef.current, replayTarget);
          return;
        }
      }

      setRunning(false);
      setHydrated(true);
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    activeInputData,
    demandGenerating,
    inputKey,
    inputStatus,
    replayCachedDemandProfiles,
    running
  ]);

  function nextDemandProfiles(
    profiles: readonly AdminPlanCoverageDemandProfile[],
    profile: AdminPlanCoverageDemandProfile
  ) {
    return [
      ...profiles.filter((item) => item.sampleIndex !== profile.sampleIndex),
      profile
    ].sort((first, second) => first.sampleIndex - second.sampleIndex);
  }

  async function fetchDemandProfileForSample(
    sampleIndex: number,
    runToken: number
  ) {
    setDemandGenerating(true);

    const response = await fetch(demandProfileHref(accessToken), {
      body: JSON.stringify({
        accessToken,
        archetypes: activeArchetypes,
        countryCode: activeInputData.countryCode,
        locale,
        sampleIndex,
        seed: activeInputData.seed
      }),
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { "x-admin-dashboard-token": accessToken } : {})
      },
      method: "POST"
    });

    if (runToken !== runTokenRef.current) {
      return undefined;
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      throw new Error(
        payload.error ?? `Demand profile request failed (${response.status})`
      );
    }

    const payload = (await response.json()) as {
      profile?: AdminPlanCoverageDemandProfile;
    };

    if (!payload.profile) {
      throw new Error("Demand profile response did not include a profile");
    }

    return payload.profile;
  }

  async function runSimulationLoop(runToken: number) {
    let runner =
      runnerRef.current ??
      createAdminPlanCoverageSimulationRunner(activeInputData.input);
    let profiles = [...demandProfiles].sort(
      (first, second) => first.sampleIndex - second.sampleIndex
    );

    runner = runnerWithDemandProfiles(runner, profiles);
    runnerRef.current = runner;

    try {
      while (
        runToken === runTokenRef.current &&
        runner.sampleSize < ADMIN_PLAN_COVERAGE_SIMULATION_MAX_SAMPLES
      ) {
        const sampleIndex = runner.sampleSize;
        let profile = profiles.find((item) => item.sampleIndex === sampleIndex);

        if (!profile) {
          setDemandError(null);
          profile = await fetchDemandProfileForSample(sampleIndex, runToken);

          if (runToken !== runTokenRef.current || !profile) {
            break;
          }

          profiles = nextDemandProfiles(profiles, profile);
          runner = runnerWithDemandProfiles(runner, profiles);
          runnerRef.current = runner;
          setDemandProfiles(profiles);
          saveDemandProfiles(demandKey, profiles);
        }

        setDemandGenerating(false);

        if (runToken !== runTokenRef.current) {
          break;
        }

        const nextData = runNextAdminPlanCoverageSimulationSample(runner);

        if (runToken !== runTokenRef.current) {
          break;
        }

        setSimulationData(nextData);
        saveSimulationState(inputKey, runner);

        if (runner.sampleSize >= ADMIN_PLAN_COVERAGE_SIMULATION_MAX_SAMPLES) {
          break;
        }

        await waitForNextSample();
      }
    } catch (error) {
      if (runToken === runTokenRef.current) {
        setDemandError(
          error instanceof Error ? error.message : "Unable to run the simulation"
        );
      }
    } finally {
      if (runToken === runTokenRef.current) {
        setDemandGenerating(false);
        setRunning(false);
      }
    }
  }

  function startSimulation() {
    if (!canRun || running) {
      return;
    }

    runTokenRef.current += 1;
    setDemandError(null);
    setNextMovesClearedKey(null);
    setRunning(true);
    void runSimulationLoop(runTokenRef.current);
  }

  function stopSimulation() {
    runTokenRef.current += 1;
    setRunning(false);
    setDemandGenerating(false);
  }

  function clearSimulation() {
    runTokenRef.current += 1;
    setRunning(false);
    setDemandGenerating(false);
    clearSavedSimulationState();
    setNextMovesClearedKey(null);

    const runner = activeInputData.databaseAvailable
      ? createAdminPlanCoverageSimulationRunner(activeInputData.input)
      : null;

    runnerRef.current = runner;
    setSimulationData(initialSimulationData(activeInputData));
    setHydrated(true);
  }

  function clearDemandProfiles() {
    stopSimulation();
    clearSavedDemandProfiles();
    clearSavedSimulationState();
    setDemandError(null);
    setDemandProfiles([]);
    setNextMovesClearedKey(null);
    runnerRef.current = activeInputData.databaseAvailable
      ? createAdminPlanCoverageSimulationRunner({
          ...activeInputData.input,
          demandProfiles: []
        })
      : null;
    setSimulationData(initialSimulationData({
      ...activeInputData,
      input: {
        ...activeInputData.input,
        demandProfiles: []
      }
    }));
    setHydrated(true);
  }

  function clearSelectedSimulatorState() {
    if (clearTarget === "results") {
      clearSimulation();
      return;
    }

    clearDemandProfiles();
  }

  function clearNextMoves() {
    setNextMovesClearedKey(nextMovesKey);
  }

  return (
    <div className="space-y-6">
      <BusinessStatsGrid metrics={simulationMetrics(simulationData)} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Plan coverage projection</h2>
          <p className="text-sm text-slate-500">
            {simulationData.countryCode} catalogue · seed {simulationData.seed} ·{" "}
            currency {simulationData.summary.currency} ·{" "}
            {numberText(activeInputData.input.candidates.length)} eligible products
          </p>
          {inputError ? (
            <p className="mt-1 text-sm font-semibold text-rose-700">{inputError}</p>
          ) : null}
        </div>
        <SimulatorActionBar
          canRun={canRun}
          clearTarget={clearTarget}
          onClear={clearSelectedSimulatorState}
          onClearTargetChange={setClearTarget}
          onConfigure={() => setProfileEditorOpen(true)}
          onRun={startSimulation}
          onStop={stopSimulation}
          running={running}
        />
      </div>

      <SimulationProgressPanel
        demandError={demandError}
        demandProfiles={demandProfiles}
        generating={demandGenerating}
        hydrated={hydrated}
        inputStatus={inputStatus}
        progressPercent={progressPercent}
        running={running}
        simulationData={simulationData}
      />

      {profileEditorOpen ? (
        <SimulationProfileEditorModal
          onClose={() => setProfileEditorOpen(false)}
          onSyntheticArchetypesChange={(archetypes) => {
            stopSimulation();
            setSyntheticArchetypes(archetypes);
          }}
          realCustomerArchetypes={inputData.realCustomerArchetypes}
          syntheticArchetypes={syntheticArchetypes}
        />
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
        <section className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-950">Most useful products</h2>
            <Badge>{percentText(simulationData.summary.percentAbove90)} above 90%</Badge>
          </div>
          <div className="mt-2">
            {simulationData.mostUsefulProducts.length > 0 ? (
              simulationData.mostUsefulProducts.map((row) => (
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
            {simulationData.unmetSupplements.length > 0 ? (
              simulationData.unmetSupplements.map((row) => (
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
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Best next moves
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Blocked products ranked by the unmet supplement demand in this simulation.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge>{numberText(visibleNextMoveRows.length)} moves</Badge>
            <button
              className={classNames(
                "rounded-md px-3 py-2 text-sm font-semibold ring-1 ring-inset ring-slate-300",
                nextMoveRows.length > 0 && !nextMovesCleared
                  ? "bg-white text-slate-700 hover:bg-slate-50"
                  : "bg-slate-100 text-slate-400"
              )}
              disabled={nextMoveRows.length < 1 || nextMovesCleared}
              onClick={clearNextMoves}
              type="button"
            >
              Clear list
            </button>
          </div>
        </div>
        <div className="mt-2">
          {visibleNextMoveRows.length > 0 ? (
            visibleNextMoveRows.map((row) => (
              <NextMoveProductRow
                accessToken={accessToken}
                key={row.id}
                locale={locale}
                row={row}
              />
            ))
          ) : nextMovesCleared ? (
            <p className="border-t border-slate-200 py-4 text-sm text-slate-500">
              Next moves cleared for this simulation output. Run more samples to rebuild
              the list from fresh results.
            </p>
          ) : simulationData.sampleSize < 1 ? (
            <p className="border-t border-slate-200 py-4 text-sm text-slate-500">
              Run the simulation to calculate which blocked products would close the
              largest current coverage gaps.
            </p>
          ) : simulationData.unmetSupplements.length < 1 ? (
            <p className="border-t border-slate-200 py-4 text-sm text-slate-500">
              The current simulation has no unmet supplement demand to prioritise.
            </p>
          ) : (
            <p className="border-t border-slate-200 py-4 text-sm text-slate-500">
              No blocked products currently cover the unmet supplements in this
              simulation output.
            </p>
          )}
        </div>
      </section>

    </div>
  );
}
