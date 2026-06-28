"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowTopRightOnSquareIcon,
  ChevronDownIcon,
  PlusIcon,
  TrashIcon
} from "@heroicons/react/24/outline";
import type {
  AdminCatalogueOptimizationActionRow,
  AdminCatalogueOptimizationData,
  AdminCatalogueOptimizationFrontierPoint,
  AdminCatalogueOptimizationProgress,
  AdminPlanCoverageDemandProfile,
  AdminPlanCoverageSimulationData,
  AdminPlanCoverageSimulationCheckpoint,
  AdminPlanCoverageSimulationSampleTrace,
  AdminProductCoverageData,
  AdminPlanCoverageSimulationProductStats,
  AdminPlanCoverageSimulationRunner,
  AdminPlanCoverageSimulationUnmetDemandBucket,
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
  defaultProductCountryCode,
  normalizeProductCountryCode,
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
  normalizeSyntheticPlanArchetypes,
  runNextAdminPlanCoverageSimulationSample,
  sanitizeDemandProfilesForSimulationSupplements
} from "@/lib/admin-product-coverage-simulation";

const SIMULATOR_STORAGE_KEY =
  "mattanutra:admin-plan-coverage-simulator:v4";
const SIMULATOR_ARCHETYPES_STORAGE_KEY =
  "mattanutra:admin-plan-coverage-archetypes:v1";
const SIMULATOR_DEMAND_STORAGE_KEY =
  "mattanutra:admin-plan-coverage-demand-profiles:v1";
const SIMULATOR_INPUT_TIMEOUT_MS = 30_000;

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
  convergenceCheckpoints?: readonly AdminPlanCoverageSimulationCheckpoint[];
  costValues: number[];
  coverageValues: number[];
  generatedAt: string;
  inputKey: string;
  productStats: Array<[string, AdminPlanCoverageSimulationProductStats]>;
  randomState: number;
  sampleSize: number;
  sampleTraces?: readonly AdminPlanCoverageSimulationSampleTrace[];
  unmetCounts: Array<[string, AdminPlanCoverageSimulationUnmetDemandBucket]>;
  version: 5;
}>;

type SavedDemandProfilesEntry = Readonly<{
  demandKey: string;
  savedAt?: string;
  profiles: readonly AdminPlanCoverageDemandProfile[];
}>;

type SavedDemandProfilesState = Readonly<{
  demandKey?: string;
  entries?: readonly SavedDemandProfilesEntry[];
  profiles?: readonly AdminPlanCoverageDemandProfile[];
  savedAt?: string;
  version: 1 | 2 | 3;
}>;

type SimulatorInputStatus = "error" | "loading" | "ready";
type SimulatorClearTarget = "all" | "profiles" | "results";
type CatalogueOptimizationStatus = "blocked" | "idle" | "processing" | "ready";
type SimulatorProgressDisplay = Readonly<{
  current: number;
  total: number;
}>;

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

function normalizedSimulatorCountryCode(value: string | null | undefined) {
  return normalizeProductCountryCode(value) ?? defaultProductCountryCode;
}

function updateSimulatorCountryUrl(countryCode: string) {
  const url = new URL(window.location.href);

  url.searchParams.set("country", countryCode);
  url.searchParams.set("view", "plan-coverage-simulator");
  window.history.pushState(null, "", `${url.pathname}?${url.searchParams.toString()}${url.hash}`);
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
      demandProfiles: data.input.demandProfiles.map((profile) => ({
        archetypeId: profile.archetypeId,
        clientSex: profile.clientSex,
        id: profile.id,
        needs: profile.needs.map((need) => ({
          displayName: need.displayName,
          id: need.id,
          normalizedName: need.normalizedName,
          sourceId: need.sourceId,
          targetComparableAmount: need.targetComparableAmount ?? null,
          targetText: need.targetText ?? null,
          weight: need.weight
        })),
        sampleIndex: profile.sampleIndex
      })),
      seed: data.input.seed,
      supplementGovernanceHash: data.input.supplementGovernanceHash,
      supplements: data.input.supplements.map((supplement) => ({
        id: supplement.id,
        name: supplement.name,
        normalizedName: supplement.normalizedName,
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
      seed: data.seed,
      supplementGovernanceHash: data.input.supplementGovernanceHash,
      supplements: data.input.supplements.map((supplement) => ({
        id: supplement.id,
        name: supplement.name,
        targetComparableAmount: supplement.targetComparableAmount
      }))
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
  const sanitizedDemandProfiles = sanitizeDemandProfilesForSimulationSupplements(
    demandProfiles,
    data.input.supplements
  );

  return emptyAdminPlanCoverageSimulationData({
    ...data.input,
    archetypes,
    databaseAvailable: data.databaseAvailable,
    demandProfiles: sanitizedDemandProfiles,
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
    const savedAt = new Date().toISOString();
    const currentProfiles = savedDemandProfiles(profiles);
    const entries = savedDemandProfileEntriesFromStorage();
    const nextEntries = [
      {
        demandKey,
        profiles: currentProfiles,
        savedAt
      },
      ...entries.filter((entry) => entry.demandKey !== demandKey)
    ];

    window.localStorage.setItem(
      SIMULATOR_DEMAND_STORAGE_KEY,
      JSON.stringify({
        entries: nextEntries,
        version: 3
      } satisfies SavedDemandProfilesState)
    );
  } catch {
    // Storage availability depends on the browser, but explicit clear remains the app path.
  }
}

function clearSavedDemandProfiles() {
  try {
    window.localStorage.removeItem(SIMULATOR_DEMAND_STORAGE_KEY);
  } catch {
    // Ignore private browsing or storage policy failures.
  }
}

function savedDemandProfileEntriesFromStorage(): SavedDemandProfilesEntry[] {
  try {
    const raw = window.localStorage.getItem(SIMULATOR_DEMAND_STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as Partial<SavedDemandProfilesState>;

    if (parsed.version !== 1 && parsed.version !== 2 && parsed.version !== 3) {
      return [];
    }

    const entries =
      parsed.version === 3 && Array.isArray(parsed.entries)
        ? parsed.entries
        : [];
    const normalizedEntries = entries
      .map((entry) => ({
        demandKey: typeof entry.demandKey === "string" ? entry.demandKey : "",
        profiles: savedDemandProfiles(normalizeDemandProfiles(entry.profiles)),
        savedAt: typeof entry.savedAt === "string" ? entry.savedAt : undefined
      }))
      .filter((entry) => entry.demandKey && entry.profiles.length > 0);

    if (normalizedEntries.length > 0) {
      return normalizedEntries;
    }

    if (Array.isArray(parsed.profiles)) {
      const profiles = savedDemandProfiles(normalizeDemandProfiles(parsed.profiles));

      if (profiles.length > 0) {
        return [{
          demandKey:
            parsed.version === 2 && typeof parsed.demandKey === "string"
              ? parsed.demandKey
              : "legacy",
          profiles,
          savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : undefined
        }];
      }
    }
  } catch {
    return [];
  }

  return [];
}

function loadSavedDemandProfiles(expectedDemandKey?: string) {
  const entries = savedDemandProfileEntriesFromStorage();
  const exact = expectedDemandKey
    ? entries.find((entry) => entry.demandKey === expectedDemandKey)
    : null;

  if (exact) {
    return exact.profiles;
  }

  return [...entries]
    .sort((first, second) =>
      second.profiles.length - first.profiles.length ||
      (second.savedAt ?? "").localeCompare(first.savedAt ?? "")
    )[0]?.profiles ?? [];
}

function savedDemandProfiles(
  profiles: readonly AdminPlanCoverageDemandProfile[]
) {
  const bySampleIndex = new Map<number, AdminPlanCoverageDemandProfile>();

  for (const profile of profiles) {
    if (
      profile.sampleIndex >= 0 &&
      profile.sampleIndex < ADMIN_PLAN_COVERAGE_SIMULATION_MAX_SAMPLES
    ) {
      bySampleIndex.set(profile.sampleIndex, profile);
    }
  }

  return [...bySampleIndex.values()].sort(
    (first, second) => first.sampleIndex - second.sampleIndex
  );
}

function savedStateFromRunner(
  inputKey: string,
  runner: AdminPlanCoverageSimulationRunner
): SavedSimulationState {
  return {
    convergenceCheckpoints: runner.convergenceCheckpoints,
    costValues: runner.costValues,
    coverageValues: runner.coverageValues,
    generatedAt: runner.generatedAt,
    inputKey,
    productStats: [...runner.productStats.entries()],
    randomState: runner.randomState,
    sampleSize: runner.sampleSize,
    sampleTraces: runner.sampleTraces,
    unmetCounts: [...runner.unmetCounts.entries()],
    version: 5
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
      parsed.version !== 5 ||
      parsed.inputKey !== inputKey ||
      !Array.isArray(parsed.coverageValues) ||
      !Array.isArray(parsed.costValues) ||
      !Array.isArray(parsed.productStats) ||
      !Array.isArray(parsed.sampleTraces) ||
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

function runnerFromSavedState(
  data: AdminPlanCoverageSimulationData,
  saved: SavedSimulationState
) {
  const runner = createAdminPlanCoverageSimulationRunner({
    ...data.input,
    reviewPriorityProducts: data.reviewPriorityProducts
  });

  runner.costValues = [...saved.costValues];
  runner.coverageValues = [...saved.coverageValues];
  runner.convergenceCheckpoints =
    Array.isArray(saved.convergenceCheckpoints)
      ? [...saved.convergenceCheckpoints]
      : [];
  runner.generatedAt = saved.generatedAt;
  runner.productStats = new Map(saved.productStats);
  runner.randomState = saved.randomState;
  runner.sampleSize = Math.max(0, Math.floor(saved.sampleSize));
  runner.sampleTraces = [...(saved.sampleTraces ?? [])];
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

function productResultRows(
  data: AdminPlanCoverageSimulationData,
  candidates: AdminPlanCoverageSimulationData["input"]["candidates"]
) {
  if (data.sampleSize > 0) {
    return data.mostUsefulProducts
      .filter((row) =>
        row.chosenCount > 0 ||
        row.averageStackContributionPercent > 0 ||
        row.averageProductCoveragePercent > 0
      )
      .sort((first, second) =>
        second.chosenCount - first.chosenCount ||
        second.averageStackContributionPercent -
          first.averageStackContributionPercent ||
        (first.expectedPriceAmount ?? Number.MAX_SAFE_INTEGER) -
          (second.expectedPriceAmount ?? Number.MAX_SAFE_INTEGER) ||
        first.title.localeCompare(second.title)
      )
      .map((row, index) => ({ ...row, rank: index + 1 }));
  }

  const rowsById = new Map(data.mostUsefulProducts.map((row) => [row.id, row]));
  const rows = [
    ...data.mostUsefulProducts,
    ...candidates
      .filter((candidate) => !rowsById.has(candidate.id))
      .map((candidate): AdminSimulationProductUsefulnessRow => ({
        averageProductCoveragePercent: 0,
        averageStackContributionPercent: 0,
        brandName: candidate.brandName ?? null,
        chosenCount: 0,
        expectedPriceAmount: candidate.priceAmount ?? candidate.unitPriceAmount ?? null,
        id: candidate.id,
        rank: 0,
        title: candidate.title
      }))
  ];

  return rows
    .sort((first, second) =>
      second.chosenCount - first.chosenCount ||
      second.averageStackContributionPercent -
        first.averageStackContributionPercent ||
      (first.expectedPriceAmount ?? Number.MAX_SAFE_INTEGER) -
        (second.expectedPriceAmount ?? Number.MAX_SAFE_INTEGER) ||
      first.title.localeCompare(second.title)
    )
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

type ProductPerformancePriceBand = "high" | "low" | "mid" | "unknown";

type ProductPerformanceScatterRow = AdminSimulationProductUsefulnessRow &
  Readonly<{
    chosenRatePercent: number;
    priceBand: ProductPerformancePriceBand;
  }>;

function priceBandClassName(band: ProductPerformancePriceBand) {
  switch (band) {
    case "low":
      return "#1FA77A";
    case "mid":
      return "#3A7BD5";
    case "high":
      return "#B45309";
    default:
      return "#94A3B8";
  }
}

function priceBandLabel(band: ProductPerformancePriceBand) {
  switch (band) {
    case "low":
      return "Value price";
    case "mid":
      return "Mid price";
    case "high":
      return "Premium price";
    default:
      return "No price";
  }
}

function productScatterRows(
  data: AdminPlanCoverageSimulationData,
  rows: readonly AdminSimulationProductUsefulnessRow[]
): ProductPerformanceScatterRow[] {
  if (data.sampleSize < 1) {
    return [];
  }

  const chosenRows = rows.filter((row) => row.chosenCount > 0);
  const prices = chosenRows
    .map((row) => row.expectedPriceAmount)
    .filter((price): price is number => price !== null)
    .sort((first, second) => first - second);
  const lowThreshold = prices[Math.floor(Math.max(0, prices.length - 1) * 0.33)] ?? null;
  const highThreshold = prices[Math.floor(Math.max(0, prices.length - 1) * 0.66)] ?? null;

  return chosenRows.map((row) => {
    const priceBand: ProductPerformancePriceBand =
      row.expectedPriceAmount === null || lowThreshold === null || highThreshold === null
        ? "unknown"
        : row.expectedPriceAmount <= lowThreshold
          ? "low"
          : row.expectedPriceAmount >= highThreshold
            ? "high"
            : "mid";

    return {
      ...row,
      chosenRatePercent: safeUiPercent(
        (row.chosenCount / Math.max(1, data.sampleSize)) * 100
      ),
      priceBand
    };
  });
}

function safeUiPercent(value: number) {
  return Number.isFinite(value) ? Math.round(value) : 0;
}

function waitForNextSample() {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, 24);
  });
}

function simulatorInputErrorMessage(error: unknown) {
  if (
    error instanceof DOMException &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  ) {
    return "Simulator input request timed out. Try again.";
  }

  return error instanceof Error ? error.message : "Unknown input error";
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

function catalogueOptimizationHref(accessToken: string) {
  const params = new URLSearchParams();

  if (accessToken) {
    params.set("access_token", accessToken);
  }

  const suffix = params.toString();

  return `/api/admin/product-coverage/catalogue-optimization${suffix ? `?${suffix}` : ""}`;
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
  const width =
    row.averageStackContributionPercent > 0
      ? Math.max(4, Math.min(100, row.averageStackContributionPercent))
      : 0;

  return (
    <div className="grid gap-3 border-t border-slate-200 py-4 md:grid-cols-[44px_minmax(0,1fr)_120px_120px] md:items-center">
      <p className="text-sm font-bold text-slate-400">#{row.rank}</p>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-950">{row.title}</p>
        <p className="mt-1 text-xs text-slate-500">{row.brandName ?? "No brand"}</p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className={classNames(
              "h-full rounded-full",
              row.chosenCount > 0 ? "bg-[#1FA77A]" : "bg-slate-300"
            )}
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

function ProductPerformanceScatter({
  currency,
  rows,
  sampleSize
}: Readonly<{
  currency: string;
  rows: readonly ProductPerformanceScatterRow[];
  sampleSize: number;
}>) {
  const [selectedId, setSelectedId] = useState<string | null>(rows[0]?.id ?? null);
  const selectedRow = rows.find((row) => row.id === selectedId) ?? rows[0] ?? null;
  const width = 760;
  const height = 360;
  const paddingLeft = 52;
  const paddingRight = 24;
  const paddingTop = 24;
  const paddingBottom = 54;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;
  const maxContribution = Math.max(
    10,
    ...rows.map((row) => row.averageStackContributionPercent)
  );
  const maxChosenRate = Math.max(10, ...rows.map((row) => row.chosenRatePercent));
  const xFor = (value: number) =>
    paddingLeft + (Math.max(0, value) / maxContribution) * chartWidth;
  const yFor = (value: number) =>
    paddingTop + chartHeight - (Math.max(0, value) / maxChosenRate) * chartHeight;
  const pointRadius = (row: ProductPerformanceScatterRow) =>
    Math.max(5, Math.min(11, 4 + Math.sqrt(row.chosenCount)));

  return (
    <section className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Product performance</h2>
          <p className="mt-1 text-sm text-slate-500">
            Coverage contribution versus chosen rate across {numberText(sampleSize)} samples.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
          {(["low", "mid", "high", "unknown"] as const).map((band) => (
            <span className="inline-flex items-center gap-1" key={band}>
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: priceBandClassName(band) }}
              />
              {priceBandLabel(band)}
            </span>
          ))}
        </div>
      </div>

      {sampleSize < 1 ? (
        <p className="mt-4 border-t border-slate-200 py-4 text-sm text-slate-500">
          Run the simulation to see product performance.
        </p>
      ) : rows.length < 1 ? (
        <p className="mt-4 border-t border-slate-200 py-4 text-sm text-slate-500">
          No products were selected by this simulation run.
        </p>
      ) : (
        <>
          <svg
            aria-label="Product performance scatter"
            className="mt-4 h-80 w-full overflow-visible"
            role="img"
            viewBox={`0 0 ${width} ${height}`}
          >
            {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
              const x = paddingLeft + tick * chartWidth;
              const y = paddingTop + chartHeight - tick * chartHeight;

              return (
                <g key={tick}>
                  <line
                    className="stroke-slate-200"
                    strokeWidth="1"
                    x1={paddingLeft}
                    x2={width - paddingRight}
                    y1={y}
                    y2={y}
                  />
                  <line
                    className="stroke-slate-100"
                    strokeWidth="1"
                    x1={x}
                    x2={x}
                    y1={paddingTop}
                    y2={paddingTop + chartHeight}
                  />
                  <text
                    className="fill-slate-400 text-[11px]"
                    textAnchor="end"
                    x={paddingLeft - 8}
                    y={y + 4}
                  >
                    {percentText(Math.round(maxChosenRate * tick))}
                  </text>
                  <text
                    className="fill-slate-400 text-[11px]"
                    textAnchor="middle"
                    x={x}
                    y={height - 18}
                  >
                    {percentText(Math.round(maxContribution * tick))}
                  </text>
                </g>
              );
            })}
            <line
              className="stroke-slate-300"
              strokeWidth="1.5"
              x1={paddingLeft}
              x2={width - paddingRight}
              y1={paddingTop + chartHeight}
              y2={paddingTop + chartHeight}
            />
            <line
              className="stroke-slate-300"
              strokeWidth="1.5"
              x1={paddingLeft}
              x2={paddingLeft}
              y1={paddingTop}
              y2={paddingTop + chartHeight}
            />
            <text
              className="fill-slate-500 text-[12px] font-semibold"
              textAnchor="middle"
              x={paddingLeft + chartWidth / 2}
              y={height - 2}
            >
              Average stack coverage contribution
            </text>
            <text
              className="fill-slate-500 text-[12px] font-semibold"
              textAnchor="middle"
              transform={`rotate(-90 ${16} ${paddingTop + chartHeight / 2})`}
              x={16}
              y={paddingTop + chartHeight / 2}
            >
              Chosen rate
            </text>
            {rows.map((row) => {
              const selected = selectedRow?.id === row.id;

              return (
                <circle
                  aria-label={`${row.title}, chosen ${numberText(row.chosenCount)} times, ${percentText(row.chosenRatePercent)} chosen rate, ${percentText(row.averageStackContributionPercent)} contribution`}
                  className="cursor-pointer outline-none transition-opacity focus:opacity-100"
                  cx={xFor(row.averageStackContributionPercent)}
                  cy={yFor(row.chosenRatePercent)}
                  fill={priceBandClassName(row.priceBand)}
                  key={row.id}
                  onClick={() => setSelectedId(row.id)}
                  onFocus={() => setSelectedId(row.id)}
                  onMouseEnter={() => setSelectedId(row.id)}
                  opacity={selected ? 1 : 0.72}
                  r={pointRadius(row)}
                  role="button"
                  stroke={selected ? "#0F172A" : "white"}
                  strokeWidth={selected ? 3 : 2}
                  tabIndex={0}
                >
                  <title>
                    {row.title} · {numberText(row.chosenCount)} chosen ·{" "}
                    {percentText(row.chosenRatePercent)} chosen rate
                  </title>
                </circle>
              );
            })}
          </svg>

          {selectedRow ? (
            <div className="mt-3 grid gap-2 rounded-md bg-slate-50 p-3 text-sm ring-1 ring-slate-200 md:grid-cols-[minmax(0,1fr)_repeat(4,auto)] md:items-center">
              <div className="min-w-0">
                <p className="truncate font-bold text-slate-950">{selectedRow.title}</p>
                <p className="text-xs text-slate-500">
                  {selectedRow.brandName ?? "No brand"} · {priceBandLabel(selectedRow.priceBand)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Chosen</p>
                <p className="font-bold text-slate-950">{numberText(selectedRow.chosenCount)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Chosen rate</p>
                <p className="font-bold text-slate-950">
                  {percentText(selectedRow.chosenRatePercent)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Contribution</p>
                <p className="font-bold text-slate-950">
                  {percentText(selectedRow.averageStackContributionPercent)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Price ({currency})</p>
                <p className="font-bold text-slate-950">
                  {amountText(selectedRow.expectedPriceAmount)}
                </p>
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function optimizationActionLabel(actionType: AdminCatalogueOptimizationActionRow["actionType"]) {
  if (actionType === "carry") {
    return "Carry";
  }

  if (actionType === "review_first") {
    return "Review first";
  }

  if (actionType === "source_missing") {
    return "Source missing";
  }

  return "Consider retiring";
}

function optimizationActionClassName(
  actionType: AdminCatalogueOptimizationActionRow["actionType"]
) {
  if (actionType === "carry") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (actionType === "review_first") {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }

  if (actionType === "source_missing") {
    return "bg-blue-50 text-blue-700 ring-blue-200";
  }

  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function CatalogueOptimizationMetric({
  label,
  value
}: Readonly<{
  label: string;
  value: string;
}>) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 truncate text-lg font-bold text-slate-950">{value}</p>
    </div>
  );
}

function CatalogueFrontierChart({
  frontier
}: Readonly<{
  frontier: readonly AdminCatalogueOptimizationFrontierPoint[];
}>) {
  const width = 760;
  const height = 260;
  const paddingLeft = 52;
  const paddingRight = 24;
  const paddingTop = 24;
  const paddingBottom = 46;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;
  const maxProducts = Math.max(1, ...frontier.map((point) => point.productCount));
  const maxRetained = Math.max(
    100,
    ...frontier.map((point) => point.retainedAverageCoveragePercent)
  );
  const xFor = (value: number) =>
    paddingLeft + (Math.max(0, value) / maxProducts) * chartWidth;
  const yFor = (value: number) =>
    paddingTop + chartHeight - (Math.max(0, value) / maxRetained) * chartHeight;
  const linePoints = frontier
    .map((point) => `${xFor(point.productCount)},${yFor(point.retainedAverageCoveragePercent)}`)
    .join(" ");

  if (frontier.length < 1) {
    return (
      <p className="mt-4 border-t border-slate-200 py-4 text-sm text-slate-500">
        Run the simulation to calculate the minimum catalogue frontier.
      </p>
    );
  }

  return (
    <svg
      aria-label="Minimum catalogue frontier"
      className="mt-4 h-64 w-full overflow-visible"
      role="img"
      viewBox={`0 0 ${width} ${height}`}
    >
      {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
        const x = paddingLeft + tick * chartWidth;
        const y = paddingTop + chartHeight - tick * chartHeight;

        return (
          <g key={tick}>
            <line
              className="stroke-slate-200"
              strokeWidth="1"
              x1={paddingLeft}
              x2={width - paddingRight}
              y1={y}
              y2={y}
            />
            <line
              className="stroke-slate-100"
              strokeWidth="1"
              x1={x}
              x2={x}
              y1={paddingTop}
              y2={paddingTop + chartHeight}
            />
            <text
              className="fill-slate-400 text-[11px]"
              textAnchor="end"
              x={paddingLeft - 8}
              y={y + 4}
            >
              {percentText(Math.round(maxRetained * tick))}
            </text>
            <text
              className="fill-slate-400 text-[11px]"
              textAnchor="middle"
              x={x}
              y={height - 16}
            >
              {numberText(Math.round(maxProducts * tick))}
            </text>
          </g>
        );
      })}
      <line
        className="stroke-slate-300"
        strokeWidth="1.5"
        x1={paddingLeft}
        x2={width - paddingRight}
        y1={paddingTop + chartHeight}
        y2={paddingTop + chartHeight}
      />
      <line
        className="stroke-slate-300"
        strokeWidth="1.5"
        x1={paddingLeft}
        x2={paddingLeft}
        y1={paddingTop}
        y2={paddingTop + chartHeight}
      />
      <polyline
        fill="none"
        points={linePoints}
        stroke="#3A7BD5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
      />
      {frontier.map((point) => (
        <circle
          cx={xFor(point.productCount)}
          cy={yFor(point.retainedAverageCoveragePercent)}
          fill={point.recommended ? "#1FA77A" : point.withinCoverageFloor ? "#3A7BD5" : "#CBD5E1"}
          key={`${point.productCount}:${point.productIds.join("-")}`}
          r={point.recommended ? 7 : 5}
          stroke="white"
          strokeWidth="2"
        >
          <title>
            {numberText(point.productCount)} products ·{" "}
            {percentText(point.retainedAverageCoveragePercent)} average coverage retained
          </title>
        </circle>
      ))}
      <text
        className="fill-slate-500 text-[12px] font-semibold"
        textAnchor="middle"
        x={paddingLeft + chartWidth / 2}
        y={height - 1}
      >
        Products carried
      </text>
      <text
        className="fill-slate-500 text-[12px] font-semibold"
        textAnchor="middle"
        transform={`rotate(-90 ${16} ${paddingTop + chartHeight / 2})`}
        x={16}
        y={paddingTop + chartHeight / 2}
      >
        Average coverage retained
      </text>
    </svg>
  );
}

function CatalogueOptimizationActionRow({
  accessToken,
  locale,
  row
}: Readonly<{
  accessToken: string;
  locale: Locale;
  row: AdminCatalogueOptimizationActionRow;
}>) {
  const href = row.productId
    ? productDetailHref(row.productId, locale, accessToken)
    : null;

  return (
    <div className="grid gap-3 border-t border-slate-200 py-4 lg:grid-cols-[44px_minmax(0,1fr)_120px_120px_120px] lg:items-center">
      <p className="text-sm font-bold text-slate-400">#{row.rank}</p>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {href ? (
            <a
              className="inline-flex min-w-0 items-center gap-1 truncate text-sm font-semibold text-slate-950 hover:text-[#168060]"
              href={href}
            >
              <span className="truncate">{row.title}</span>
              <ArrowTopRightOnSquareIcon className="size-4 shrink-0" aria-hidden={true} />
            </a>
          ) : (
            <span className="truncate text-sm font-semibold text-slate-950">
              {row.title}
            </span>
          )}
          <Badge className={optimizationActionClassName(row.actionType)}>
            {optimizationActionLabel(row.actionType)}
          </Badge>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {row.brandName ?? row.statusLabel}
        </p>
        <p className="mt-1 text-xs font-medium text-slate-700">{row.reason}</p>
      </div>
      <div className="text-sm">
        <p className="text-xs text-slate-500">Profiles</p>
        <p className="font-bold text-slate-950">{numberText(row.affectedPlanCount)}</p>
      </div>
      <div className="text-sm">
        <p className="text-xs text-slate-500">Impact</p>
        <p className="font-bold text-slate-950">
          {percentText(row.coverageImpactPercent)}
        </p>
      </div>
      <div className="text-sm">
        <p className="text-xs text-slate-500">Price</p>
        <p className="font-bold text-slate-950">{amountText(row.expectedPriceAmount)}</p>
      </div>
    </div>
  );
}

function MinimumCataloguePanel({
  accessToken,
  canCalculate,
  error,
  locale,
  onCalculate,
  optimization,
  optimizationProgress,
  optimizationStatus,
  running,
  sampleSize
}: Readonly<{
  accessToken: string;
  canCalculate: boolean;
  error: string | null;
  locale: Locale;
  onCalculate: () => void;
  optimization: AdminCatalogueOptimizationData | null;
  optimizationProgress: AdminCatalogueOptimizationProgress | null;
  optimizationStatus: CatalogueOptimizationStatus;
  running: boolean;
  sampleSize: number;
}>) {
  if (running) {
    return (
      <section className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-lg font-bold text-slate-950">Minimum catalogue</h2>
        <p className="mt-1 text-sm text-slate-500">
          Pause or complete the simulation to calculate the smallest catalogue that
          preserves near-full coverage.
        </p>
      </section>
    );
  }

  if (optimizationStatus === "processing") {
    return (
      <section className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Minimum catalogue</h2>
            <p className="mt-1 text-sm text-slate-500">
              Calculating the smallest carry set on the server so the page stays responsive.
            </p>
          </div>
          <Badge className="bg-blue-50 text-blue-700 ring-blue-200">
            Optimizing
          </Badge>
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full animate-pulse rounded-full bg-[#3A7BD5]"
            style={{
              width: `${Math.max(
                8,
                Math.min(
                  100,
                  ((optimizationProgress?.current ?? 0) /
                    Math.max(1, optimizationProgress?.total ?? 1)) *
                    100
                )
              )}%`
            }}
          />
        </div>
        {optimizationProgress ? (
          <p className="mt-2 text-sm text-slate-500">
            {optimizationProgress.label} · {numberText(optimizationProgress.current)} /{" "}
            {numberText(optimizationProgress.total)}
          </p>
        ) : null}
      </section>
    );
  }

  if (!optimization || optimization.status === "not_ready") {
    return (
      <section className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Minimum catalogue</h2>
            <p className="mt-1 text-sm text-slate-500">
              Run the simulation, then calculate the carry, review, source, and retire
              actions on the server.
            </p>
          </div>
          <button
            className={classNames(
              "rounded-md px-3 py-2 text-sm font-semibold ring-1 ring-inset",
              canCalculate
                ? "bg-[#20343A] text-white ring-[#20343A] hover:bg-[#16252A]"
                : "bg-slate-100 text-slate-400 ring-slate-200"
            )}
            disabled={!canCalculate}
            onClick={onCalculate}
            type="button"
          >
            Calculate
          </button>
        </div>
        {error ? (
          <p className="mt-2 text-sm font-semibold text-rose-700">{error}</p>
        ) : null}
      </section>
    );
  }

  return (
    <section className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Minimum catalogue</h2>
          <p className="mt-1 text-sm text-slate-500">
            Smallest matchable catalogue that stays within {percentText(
              optimization.coverageLossTolerancePercent
            )} of the full catalogue across {numberText(sampleSize)} simulated profiles.
          </p>
        </div>
        <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">
          {numberText(optimization.optimized.productCount)} carry products
        </Badge>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <CatalogueOptimizationMetric
          label="Full catalogue"
          value={`${numberText(optimization.baseline.productCount)} products`}
        />
        <CatalogueOptimizationMetric
          label="Optimized catalogue"
          value={`${numberText(optimization.optimized.productCount)} products`}
        />
        <CatalogueOptimizationMetric
          label="Product reduction"
          value={`${numberText(optimization.productReductionCount)} (${percentText(
            optimization.productReductionPercent
          )})`}
        />
        <CatalogueOptimizationMetric
          label="Expected cost"
          value={`${amountText(optimization.baseline.expectedCostAmount)} → ${amountText(
            optimization.optimized.expectedCostAmount
          )}`}
        />
        <CatalogueOptimizationMetric
          label="Average coverage"
          value={`${percentText(optimization.baseline.averageCoveragePercent)} → ${percentText(
            optimization.optimized.averageCoveragePercent
          )}`}
        />
        <CatalogueOptimizationMetric
          label="P10 coverage"
          value={`${percentText(optimization.baseline.p10CoveragePercent)} → ${percentText(
            optimization.optimized.p10CoveragePercent
          )}`}
        />
        <CatalogueOptimizationMetric
          label="Plans >=75%"
          value={`${percentText(optimization.baseline.percentAbove75)} → ${percentText(
            optimization.optimized.percentAbove75
          )}`}
        />
        <CatalogueOptimizationMetric
          label="Actions"
          value={numberText(optimization.actionRows.length)}
        />
      </div>

      <CatalogueFrontierChart frontier={optimization.frontier} />

      <div className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-slate-950">Catalogue actions</h3>
          <Badge>{numberText(optimization.actionRows.length)} actions</Badge>
        </div>
        {optimization.actionRows.length > 0 ? (
          optimization.actionRows.map((row) => (
            <CatalogueOptimizationActionRow
              accessToken={accessToken}
              key={row.id}
              locale={locale}
              row={row}
            />
          ))
        ) : (
          <p className="border-t border-slate-200 py-4 text-sm text-slate-500">
            No catalogue actions are available for this simulation output.
          </p>
        )}
      </div>
    </section>
  );
}

function compactDisplayList(values: readonly string[]) {
  const visibleValues = values.slice(0, 3);

  if (values.length < 1) {
    return "unmet supplement demand";
  }

  if (values.length === 1) {
    return visibleValues[0];
  }

  if (values.length === 2) {
    return `${visibleValues[0]} and ${visibleValues[1]}`;
  }

  if (values.length === 3) {
    return `${visibleValues[0]}, ${visibleValues[1]}, and ${visibleValues[2]}`;
  }

  return `${visibleValues[0]}, ${visibleValues[1]}, ${visibleValues[2]}, and ${numberText(values.length - 3)} more`;
}

function nextMoveReasonText(row: AdminSimulationNextMoveRow) {
  if (row.kind === "source_supplement") {
    return `Source a product for ${row.sourceSupplementName}; this true catalogue gap appears across ${numberText(
      row.unmetDemandCount
    )} simulated ${
      row.unmetDemandCount === 1 ? "profile" : "profiles"
    } (${percentText(row.unmetDemandPercent)}).`;
  }

  const profileLabel = row.unmetDemandCount === 1 ? "profile" : "profiles";
  const gapText =
    row.gapSupplementCount > 0
      ? ` and helps close ${numberText(row.gapSupplementCount)} catalogue ${
          row.gapSupplementCount === 1 ? "gap" : "gaps"
        }`
      : "";
  const overallText =
    row.matchableSupplementCount > row.unmetSupplementNames.length
      ? `; it covers ${numberText(row.matchableSupplementCount)} matchable supplements overall`
      : "";

  return `Reviewing this product could cover ${compactDisplayList(row.unmetSupplementNames)} across ${numberText(
    row.unmetDemandCount
  )} simulated ${profileLabel} (${percentText(row.unmetDemandPercent)})${gapText}${overallText}.`;
}

function unmetDemandStateLabel(
  state: AdminPlanCoverageSimulationData["unmetSupplements"][number]["state"]
) {
  if (state === "catalogue_gap") {
    return "Catalogue gap";
  }

  if (state === "blocked_only") {
    return "Blocked only";
  }

  if (state === "underdosed") {
    return "Underdosed";
  }

  return "Available";
}

function unmetDemandStateClassName(
  state: AdminPlanCoverageSimulationData["unmetSupplements"][number]["state"]
) {
  if (state === "catalogue_gap") {
    return "bg-rose-50 text-rose-700 ring-rose-200";
  }

  if (state === "blocked_only") {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }

  if (state === "underdosed") {
    return "bg-blue-50 text-blue-700 ring-blue-200";
  }

  return "bg-emerald-50 text-emerald-700 ring-emerald-200";
}

function unmetDemandReasonText(
  row: AdminPlanCoverageSimulationData["unmetSupplements"][number]
) {
  if (row.state === "catalogue_gap") {
    return "No eligible product currently covers this supplement.";
  }

  if (row.state === "blocked_only") {
    return "Only blocked or pending products currently cover this need.";
  }

  if (row.state === "underdosed") {
    return "Eligible products exist, but current dose coverage is below the target.";
  }

  return "Eligible products exist, but were not selected in these simulated stacks.";
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
  const targetDoseText =
    row.kind === "source_supplement" ? row.targetDoseText ?? "Not set" : null;

  return (
    <div className="grid gap-3 border-t border-slate-200 py-4 lg:grid-cols-[44px_minmax(0,1fr)_120px_120px_120px] lg:items-center">
      <p className="text-sm font-bold text-slate-400">#{row.rank}</p>
      <div className="min-w-0">
        {row.kind === "review_product" ? (
          <a
            className="inline-flex max-w-full items-center gap-1 truncate text-sm font-semibold text-slate-950 hover:text-[#168060]"
            href={productDetailHref(row.id, locale, accessToken)}
          >
            <span className="truncate">{row.title}</span>
            <ArrowTopRightOnSquareIcon className="size-4 shrink-0" aria-hidden={true} />
          </a>
        ) : (
          <p className="truncate text-sm font-semibold text-slate-950">{row.title}</p>
        )}
        <p className="mt-1 text-xs text-slate-500">
          {row.kind === "source_supplement" ? "New product needed" : row.brandName ?? "No brand"}
        </p>
        <p className="mt-1 text-xs font-medium text-slate-700">
          {nextMoveReasonText(row)}
        </p>
        {targetDoseText ? (
          <p className="mt-1 text-xs text-slate-500">
            Optimum dose: {targetDoseText}
          </p>
        ) : null}
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className={classNames(
              "h-full rounded-full",
              row.kind === "source_supplement" ? "bg-[#2563EB]" : "bg-[#F59E0B]"
            )}
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
        <p className="text-xs text-slate-500">
          {row.kind === "source_supplement" ? "Optimum dose" : "Price"}
        </p>
        <p className="font-bold text-slate-950">
          {row.kind === "source_supplement"
            ? row.targetDoseText ?? "Not set"
            : amountText(row.expectedPriceAmount)}
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
      label: "Plans >=75%",
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
      color: data.convergence.stable ? "#1FA77A" : "#8B5CF6",
      id: "usefulRuns",
      label: "Useful runs",
      series: [],
      value: convergenceMetricValue(data)
    },
    {
      color: "#6B7280",
      id: "samples",
      label: "Samples",
      series: [],
      value: numberText(data.sampleSize)
    }
  ];
}

function convergenceMetricValue(data: AdminPlanCoverageSimulationData) {
  if (data.convergence.status === "complete") {
    return data.convergence.stable ? "Stable" : "Complete";
  }

  if (data.convergence.status === "stable") {
    return `${numberText(data.convergence.samplesSinceMeaningfulChange)} steady`;
  }

  if (data.convergence.status === "changing") {
    return "Changing";
  }

  return `Need ${numberText(Math.max(0, ADMIN_PLAN_COVERAGE_CONVERGENCE_MIN_SAMPLES - data.sampleSize))}`;
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
  optimizationStatus: CatalogueOptimizationStatus,
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

  if (optimizationStatus === "processing" && data.sampleSize > 0) {
    return "Optimizing catalogue";
  }

  if (data.sampleSize >= ADMIN_PLAN_COVERAGE_SIMULATION_MAX_SAMPLES) {
    return "Complete";
  }

  if (data.sampleSize > 0) {
    return "Paused";
  }

  return "Ready";
}

function convergenceProgressText(data: AdminPlanCoverageSimulationData) {
  if (data.convergence.status === "insufficient_samples") {
    return `Need ${numberText(Math.max(0, ADMIN_PLAN_COVERAGE_CONVERGENCE_MIN_SAMPLES - data.sampleSize))} more samples to assess stability.`;
  }

  const delta = data.convergence.deltas.averageCoveragePercent;
  const windowText = `Last ${numberText(data.convergence.windowSize)} runs`;
  const coverageText =
    delta === null
      ? "coverage movement is not available yet"
      : `changed average coverage by ${percentText(delta)}`;
  const overlapText =
    data.convergence.topProductOverlapPercent === null
      ? ""
      : ` · top products ${percentText(data.convergence.topProductOverlapPercent)} stable`;

  if (data.convergence.stable) {
    return `${windowText} ${coverageText}${overlapText}. Results look stable enough to stop.`;
  }

  if (data.convergence.status === "complete") {
    return `${windowText} ${coverageText}${overlapText}. Full run complete.`;
  }

  return `${windowText} ${coverageText}${overlapText}. Results are still moving.`;
}

function simulationProgressDisplay({
  catalogueOptimizationProgress,
  catalogueOptimizationStatus,
  demandProfiles,
  generating,
  running,
  simulationData
}: Readonly<{
  catalogueOptimizationProgress: AdminCatalogueOptimizationProgress | null;
  catalogueOptimizationStatus: CatalogueOptimizationStatus;
  demandProfiles: readonly AdminPlanCoverageDemandProfile[];
  generating: boolean;
  running: boolean;
  simulationData: AdminPlanCoverageSimulationData;
}>): SimulatorProgressDisplay {
  if (catalogueOptimizationStatus === "processing") {
    return {
      current: catalogueOptimizationProgress?.current ?? 0,
      total: catalogueOptimizationProgress?.total ?? 1
    };
  }

  if (generating && running) {
    return {
      current: demandProfiles.length,
      total: ADMIN_PLAN_COVERAGE_SIMULATION_MAX_SAMPLES
    };
  }

  return {
    current: simulationData.sampleSize,
    total: ADMIN_PLAN_COVERAGE_SIMULATION_MAX_SAMPLES
  };
}

function SimulationProgressPanel({
  catalogueOptimizationProgress,
  catalogueOptimizationStatus,
  demandError,
  generating,
  hydrated,
  inputStatus,
  progressCount,
  progressPercent,
  progressTotal,
  running,
  simulationData
}: Readonly<{
  catalogueOptimizationProgress: AdminCatalogueOptimizationProgress | null;
  catalogueOptimizationStatus: CatalogueOptimizationStatus;
  demandError: string | null;
  generating: boolean;
  hydrated: boolean;
  inputStatus: SimulatorInputStatus;
  progressCount: number;
  progressPercent: number;
  progressTotal: number;
  running: boolean;
  simulationData: AdminPlanCoverageSimulationData;
}>) {
  const optimizingCatalogue = catalogueOptimizationStatus === "processing";

  return (
    <section className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-950">
          {simulationStatusText(
            simulationData,
            inputStatus,
            generating,
            running,
            catalogueOptimizationStatus,
            hydrated
          )}
        </p>
        <p className="text-sm text-slate-500">
          {numberText(progressCount)} / {numberText(progressTotal)}
        </p>
      </div>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100">
        <div
          className={classNames(
            "h-full rounded-full transition-[width]",
            optimizingCatalogue ? "animate-pulse bg-[#3A7BD5]" : "bg-[#1FA77A]"
          )}
          style={{ width: `${Math.max(0, Math.min(100, progressPercent))}%` }}
        />
      </div>
      {demandError ? (
        <p className="mt-2 text-sm font-semibold text-rose-700">{demandError}</p>
      ) : null}
      {!demandError && optimizingCatalogue && catalogueOptimizationProgress ? (
        <p className="mt-2 text-sm text-slate-500">
          {catalogueOptimizationProgress.label}
        </p>
      ) : null}
      {!demandError && simulationData.sampleSize > 0 ? (
        <p className="mt-2 text-sm text-slate-500">
          {convergenceProgressText(simulationData)}
        </p>
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
  const [selectedCountryCode, setSelectedCountryCode] = useState(() =>
    normalizedSimulatorCountryCode(data.countryCode)
  );
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
    initialSimulationData(data)
  );
  const [hydrated, setHydrated] = useState(false);
  const [running, setRunning] = useState(false);
  const [catalogueOptimization, setCatalogueOptimization] =
    useState<AdminCatalogueOptimizationData | null>(null);
  const [catalogueOptimizationError, setCatalogueOptimizationError] =
    useState<string | null>(null);
  const [catalogueOptimizationKey, setCatalogueOptimizationKey] =
    useState<string | null>(null);
  const [catalogueOptimizationProgress, setCatalogueOptimizationProgress] =
    useState<AdminCatalogueOptimizationProgress | null>(null);
  const [catalogueOptimizationStatus, setCatalogueOptimizationStatus] =
    useState<CatalogueOptimizationStatus>("idle");
  const [nextMovesClearedKey, setNextMovesClearedKey] = useState<string | null>(
    null
  );
  const runnerRef = useRef<AdminPlanCoverageSimulationRunner | null>(null);
  const inputStatusRef = useRef<SimulatorInputStatus>("loading");
  const catalogueOptimizationControllerRef = useRef<AbortController | null>(null);
  const runTokenRef = useRef(0);
  const previousDemandKeyRef = useRef<string | null>(null);
  const runningRef = useRef(false);
  const catalogueOptimizationRunKey = `${inputKey}:${simulationData.sampleSize}:${simulationData.sampleTraces.length}`;
  const currentCatalogueOptimization =
    catalogueOptimizationKey === catalogueOptimizationRunKey
      ? catalogueOptimization
      : null;
  const currentCatalogueOptimizationStatus =
    catalogueOptimizationStatus === "processing" ||
    catalogueOptimizationKey === catalogueOptimizationRunKey
      ? catalogueOptimizationStatus
      : "idle";
  const currentCatalogueOptimizationProgress =
    currentCatalogueOptimizationStatus === "processing"
      ? catalogueOptimizationProgress
      : null;
  const progressDisplay = simulationProgressDisplay({
    catalogueOptimizationProgress: currentCatalogueOptimizationProgress,
    catalogueOptimizationStatus: currentCatalogueOptimizationStatus,
    demandProfiles,
    generating: demandGenerating,
    running,
    simulationData
  });
  const progressCount = progressDisplay.current;
  const progressTotal = progressDisplay.total;
  const progressPercent =
    (progressCount / Math.max(1, progressTotal)) * 100;
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
        simulationInput: activeInputData.input,
        reviewPriorityProducts: inputData.reviewPriorityProducts,
        simulationData
      }),
    [activeInputData.input, inputData.reviewPriorityProducts, simulationData]
  );
  const nextMovesKey = useMemo(
    () =>
      hashText(
        JSON.stringify({
          inputKey,
          rows: nextMoveRows.map((row) => ({
            id: row.id,
            kind: row.kind,
            score: row.nextMoveScore,
            targetDoseText: row.targetDoseText,
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
  const visibleProductResultRows = useMemo(
    () => productResultRows(simulationData, activeInputData.input.candidates),
    [activeInputData.input.candidates, simulationData]
  );
  const scatterRows = useMemo(
    () => productScatterRows(simulationData, visibleProductResultRows),
    [simulationData, visibleProductResultRows]
  );
  const catalogueGapRows = useMemo(
    () =>
      simulationData.unmetSupplements.filter((row) =>
        row.state === "catalogue_gap"
      ),
    [simulationData.unmetSupplements]
  );

  useEffect(() => {
    runningRef.current = running || demandGenerating;
  }, [demandGenerating, running]);

  useEffect(() => {
    const syncCountryFromUrl = () => {
      setSelectedCountryCode(
        normalizedSimulatorCountryCode(
          new URL(window.location.href).searchParams.get("country")
        )
      );
    };

    window.addEventListener("popstate", syncCountryFromUrl);

    return () => {
      window.removeEventListener("popstate", syncCountryFromUrl);
    };
  }, []);

  useEffect(() => {
    inputStatusRef.current = inputStatus;
  }, [inputStatus]);

  useEffect(() => {
    const refreshInput = () => {
      if (runningRef.current || inputStatusRef.current === "loading") {
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
    let controller: AbortController | null = null;
    let requestTimedOut = false;
    let requestTimeoutId: number | null = null;
    const timeoutId = window.setTimeout(() => {
      if (cancelled) {
        return;
      }

      controller = new AbortController();
      requestTimeoutId = window.setTimeout(() => {
        requestTimedOut = true;
        controller?.abort();
      }, SIMULATOR_INPUT_TIMEOUT_MS);
      setInputStatus("loading");
      setInputError(null);
      const loadingData =
        normalizedSimulatorCountryCode(data.countryCode) === selectedCountryCode
          ? data
          : emptyAdminPlanCoverageSimulationData({
              countryCode: selectedCountryCode,
              databaseAvailable: data.databaseAvailable,
              seed: data.seed
            });

      setInputData(loadingData);
      setSimulationData(initialSimulationData(loadingData));
      setHydrated(false);
      setRunning(false);
      runnerRef.current = null;

      fetch(simulatorInputHref(selectedCountryCode, accessToken, range), {
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          "Cache-Control": "no-store",
          ...(accessToken ? { "x-admin-dashboard-token": accessToken } : {})
        },
        signal: controller.signal
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

          if (requestTimeoutId !== null) {
            window.clearTimeout(requestTimeoutId);
          }
          setInputData(payload);
          setInputStatus("ready");
        })
        .catch((error) => {
          if (cancelled) {
            return;
          }

          if (requestTimeoutId !== null) {
            window.clearTimeout(requestTimeoutId);
          }
          setInputData(emptyAdminPlanCoverageSimulationData({
            countryCode: selectedCountryCode,
            databaseAvailable: false,
            seed: data.seed
          }));
          setInputError(
            requestTimedOut
              ? "Simulator input request timed out. Try again."
              : simulatorInputErrorMessage(error)
          );
          setInputStatus("error");
          setHydrated(true);
        });
    }, 0);

    return () => {
      cancelled = true;
      if (requestTimeoutId !== null) {
        window.clearTimeout(requestTimeoutId);
      }
      controller?.abort();
      window.clearTimeout(timeoutId);
    };
  }, [accessToken, data, inputRefreshNonce, range, selectedCountryCode]);

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
      const savedProfiles = sanitizeDemandProfilesForSimulationSupplements(
        loadSavedDemandProfiles(demandKey),
        inputData.input.supplements
      );

      setDemandGenerating(false);
      setDemandError(null);
      setDemandProfiles(savedProfiles);

      if (savedProfiles.length > 0) {
        saveDemandProfiles(demandKey, savedProfiles);
      }

      if (previousDemandKey !== null && previousDemandKey !== demandKey) {
        clearSavedSimulationState();
        runnerRef.current = null;
      }
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [demandKey, inputData.input.supplements, inputStatus]);

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
        runnerRef.current = createAdminPlanCoverageSimulationRunner({
          ...activeInputData.input,
          reviewPriorityProducts: activeInputData.reviewPriorityProducts
        });
        setSimulationData(initialSimulationData(activeInputData));
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
      createAdminPlanCoverageSimulationRunner({
        ...activeInputData.input,
        reviewPriorityProducts: activeInputData.reviewPriorityProducts
      });
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

          profiles = sanitizeDemandProfilesForSimulationSupplements(
            nextDemandProfiles(profiles, profile),
            inputData.input.supplements
          );
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

  function stopCatalogueOptimization() {
    catalogueOptimizationControllerRef.current?.abort();
    catalogueOptimizationControllerRef.current = null;
    setCatalogueOptimizationProgress(null);

    if (catalogueOptimizationStatus === "processing") {
      setCatalogueOptimizationStatus("idle");
    }
  }

  function clearCatalogueOptimization() {
    catalogueOptimizationControllerRef.current?.abort();
    catalogueOptimizationControllerRef.current = null;
    setCatalogueOptimization(null);
    setCatalogueOptimizationError(null);
    setCatalogueOptimizationKey(null);
    setCatalogueOptimizationProgress(null);
    setCatalogueOptimizationStatus("idle");
  }

  async function calculateCatalogueOptimization() {
    if (
      catalogueOptimizationStatus === "processing" ||
      running ||
      demandGenerating ||
      simulationData.sampleSize < 1 ||
      simulationData.sampleTraces.length < 1
    ) {
      return;
    }

    const requestKey = catalogueOptimizationRunKey;
    const controller = new AbortController();

    catalogueOptimizationControllerRef.current?.abort();
    catalogueOptimizationControllerRef.current = controller;
    setCatalogueOptimization(null);
    setCatalogueOptimizationError(null);
    setCatalogueOptimizationKey(requestKey);
    setCatalogueOptimizationProgress({
      current: 0,
      label: "Calculating on server",
      stage: "validating",
      total: 1
    });
    setCatalogueOptimizationStatus("processing");

    try {
      const response = await fetch(catalogueOptimizationHref(accessToken), {
        body: JSON.stringify({
          accessToken,
          reviewPriorityProducts: inputData.reviewPriorityProducts,
          simulationData
        }),
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { "x-admin-dashboard-token": accessToken } : {})
        },
        method: "POST",
        signal: controller.signal
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        optimization?: AdminCatalogueOptimizationData;
      };

      if (!response.ok || !payload.optimization) {
        throw new Error(
          payload.error ?? `Minimum catalogue request failed (${response.status})`
        );
      }

      if (
        controller.signal.aborted ||
        catalogueOptimizationControllerRef.current !== controller
      ) {
        return;
      }

      setCatalogueOptimization(payload.optimization);
      setCatalogueOptimizationError(null);
      setCatalogueOptimizationProgress(null);
      setCatalogueOptimizationStatus("ready");
    } catch (error) {
      if (
        controller.signal.aborted ||
        catalogueOptimizationControllerRef.current !== controller
      ) {
        return;
      }

      setCatalogueOptimization(null);
      setCatalogueOptimizationError(
        error instanceof Error
          ? error.message
          : "Unable to calculate minimum catalogue"
      );
      setCatalogueOptimizationProgress(null);
      setCatalogueOptimizationStatus("idle");
    } finally {
      if (catalogueOptimizationControllerRef.current === controller) {
        catalogueOptimizationControllerRef.current = null;
      }
    }
  }

  function startSimulation() {
    if (!canRun || running) {
      return;
    }

    clearCatalogueOptimization();
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
    stopCatalogueOptimization();
  }

  function clearSimulation() {
    runTokenRef.current += 1;
    setRunning(false);
    setDemandGenerating(false);
    clearCatalogueOptimization();
    clearSavedSimulationState();
    setNextMovesClearedKey(null);

    const runner = activeInputData.databaseAvailable
      ? createAdminPlanCoverageSimulationRunner({
          ...activeInputData.input,
          reviewPriorityProducts: activeInputData.reviewPriorityProducts
        })
      : null;

    runnerRef.current = runner;
    setSimulationData(initialSimulationData(activeInputData));
    setHydrated(true);
  }

  function clearDemandProfiles() {
    stopSimulation();
    clearCatalogueOptimization();
    clearSavedDemandProfiles();
    clearSavedSimulationState();
    setDemandError(null);
    setDemandProfiles([]);
    setNextMovesClearedKey(null);
    runnerRef.current = activeInputData.databaseAvailable
      ? createAdminPlanCoverageSimulationRunner({
          ...activeInputData.input,
          demandProfiles: [],
          reviewPriorityProducts: activeInputData.reviewPriorityProducts
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

    if (clearTarget === "all") {
      setSyntheticArchetypes(SIMULATION_ARCHETYPES);
      saveSyntheticArchetypes(SIMULATION_ARCHETYPES);
    }
  }

  function clearNextMoves() {
    setNextMovesClearedKey(nextMovesKey);
  }

  function retrySimulatorInput() {
    if (inputStatus === "loading") {
      return;
    }

    setInputRefreshNonce((value) => value + 1);
  }

  function changeSimulatorCountry(countryCode: string) {
    const normalizedCountryCode = normalizedSimulatorCountryCode(countryCode);

    if (normalizedCountryCode === selectedCountryCode) {
      return;
    }

    stopSimulation();
    updateSimulatorCountryUrl(normalizedCountryCode);
    setSelectedCountryCode(normalizedCountryCode);
    setInputStatus("loading");
    setInputError(null);
    setHydrated(false);
    setInputRefreshNonce((value) => value + 1);
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
            <span className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-rose-700">{inputError}</span>
              <button
                className="rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                onClick={retrySimulatorInput}
                type="button"
              >
                Retry
              </button>
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            Country
            <select
              className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-950 shadow-sm focus:border-[#1FA77A] focus:outline-none focus:ring-2 focus:ring-[#1FA77A]/20"
              onChange={(event) => changeSimulatorCountry(event.target.value)}
              value={selectedCountryCode}
            >
              {productCountryOptions.map((country) => (
                <option key={country.code} value={country.code}>
                  {productCountryLabel(country.code)}
                </option>
              ))}
            </select>
          </label>
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
      </div>

      <SimulationProgressPanel
        catalogueOptimizationProgress={currentCatalogueOptimizationProgress}
        catalogueOptimizationStatus={currentCatalogueOptimizationStatus}
        demandError={demandError}
        generating={demandGenerating}
        hydrated={hydrated}
        inputStatus={inputStatus}
        progressCount={progressCount}
        progressPercent={progressPercent}
        progressTotal={progressTotal}
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

      <ProductPerformanceScatter
        currency={simulationData.summary.currency}
        rows={scatterRows}
        sampleSize={simulationData.sampleSize}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
        <section className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-950">Best performing products</h2>
            <Badge>{numberText(visibleProductResultRows.length)} used</Badge>
          </div>
          <div className="mt-2">
            {visibleProductResultRows.length > 0 ? (
              visibleProductResultRows.map((row) => (
                <ProductUsefulnessBar key={row.id} row={row} />
              ))
            ) : (
              <p className="border-t border-slate-200 py-4 text-sm text-slate-500">
                {simulationData.sampleSize > 0
                  ? "No products have been selected by the simulation yet."
                  : "Run the simulation to see product usefulness."}
              </p>
            )}
          </div>
        </section>

        <section className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Unmet plan demand</h2>
              <p className="mt-1 text-sm text-slate-500">
                Supplements requested by simulated profiles that the selected stacks did
                not satisfy.
              </p>
            </div>
            <Badge>{numberText(catalogueGapRows.length)} catalogue gaps</Badge>
          </div>
          <div className="mt-2">
            {simulationData.unmetSupplements.length > 0 ? (
              simulationData.unmetSupplements.map((row) => (
                <div
                  className="border-t border-slate-200 py-3 text-sm"
                  key={row.supplementKey}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-950">{row.name}</span>
                        <Badge className={unmetDemandStateClassName(row.state)}>
                          {unmetDemandStateLabel(row.state)}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {unmetDemandReasonText(row)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {numberText(row.eligibleProductCount)} eligible ·{" "}
                        {numberText(row.blockedProductCount)} blocked
                        {row.targetDoseText ? ` · target ${row.targetDoseText}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-slate-500">
                      {numberText(row.count)} · {percentText(row.percent)}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="border-t border-slate-200 py-4 text-sm text-slate-500">
                Every simulated supplement need had at least partial coverage.
              </p>
            )}
          </div>
          <div className="mt-4 border-t border-slate-200 pt-4">
            <h3 className="text-sm font-bold text-slate-950">Catalogue gaps</h3>
            {catalogueGapRows.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {catalogueGapRows.slice(0, 8).map((row) => (
                  <Badge
                    className="bg-rose-50 text-rose-700 ring-rose-200"
                    key={row.supplementKey}
                  >
                    {row.name}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-500">
                No true catalogue gaps in this simulation output.
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
              Review blocked products or source true catalogue gaps ranked by unmet plan demand.
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
              Run the simulation to calculate which blocked products and catalogue gaps
              matter most.
            </p>
          ) : simulationData.unmetSupplements.length < 1 ? (
            <p className="border-t border-slate-200 py-4 text-sm text-slate-500">
              The current simulation has no unmet supplement demand to prioritise.
            </p>
          ) : (
            <p className="border-t border-slate-200 py-4 text-sm text-slate-500">
              No blocked products or true catalogue gaps currently explain the unmet plan
              demand in this simulation output.
            </p>
          )}
        </div>
      </section>

      <MinimumCataloguePanel
        accessToken={accessToken}
        canCalculate={
          !running &&
          !demandGenerating &&
          currentCatalogueOptimizationStatus !== "processing" &&
          simulationData.sampleSize > 0 &&
          simulationData.sampleTraces.length > 0
        }
        error={catalogueOptimizationError}
        locale={locale}
        onCalculate={calculateCatalogueOptimization}
        optimization={currentCatalogueOptimization}
        optimizationProgress={currentCatalogueOptimizationProgress}
        optimizationStatus={currentCatalogueOptimizationStatus}
        running={running || demandGenerating}
        sampleSize={simulationData.sampleSize}
      />

    </div>
  );
}
