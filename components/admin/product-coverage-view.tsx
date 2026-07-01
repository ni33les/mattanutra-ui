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
import type { AdminCatalogueOptimizationJobView } from "@/lib/admin-catalogue-optimization-jobs";

const SIMULATOR_STORAGE_KEY =
  "mattanutra:admin-plan-coverage-simulator:v4";
const SIMULATOR_ARCHETYPES_STORAGE_KEY =
  "mattanutra:admin-plan-coverage-archetypes:v1";
const SIMULATOR_DEMAND_STORAGE_KEY =
  "mattanutra:admin-plan-coverage-demand-profiles:v1";
const SIMULATOR_OPTIMIZATION_STORAGE_KEY =
  "mattanutra:admin-plan-coverage-catalogue-optimization:v1";
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

type SavedCatalogueOptimizationEntry = Readonly<{
  baseCacheKey?: string;
  cacheKey: string;
  optimization: AdminCatalogueOptimizationData;
  savedAt: string;
}>;

type SavedCatalogueOptimizationState = Readonly<{
  entries: readonly SavedCatalogueOptimizationEntry[];
  version: 1 | 2;
}>;

type CatalogueOptimizationCachedProgress = Readonly<{
  cacheKey: string;
  candidateCount: number;
  current: number;
  savedAt: string;
  total: number;
}>;

type SimulatorInputStatus = "error" | "loading" | "ready";
type SimulatorClearTarget = "all" | "profiles" | "results";
type CatalogueOptimizationStatus = "blocked" | "idle" | "processing" | "ready";
type PlanCoverageSimulatorMode = "optimisation" | "simulator";
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

function durationText(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;

  if (minutes < 1) {
    return `${remainder}s`;
  }

  return `${minutes}m ${remainder.toString().padStart(2, "0")}s`;
}

function dateTimeText(value: string, locale: Locale) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function compactListText(values: readonly string[]) {
  const items = values.filter(Boolean).slice(0, 3);

  if (items.length < 1) {
    return "simulated demand";
  }

  if (items.length === 1) {
    return items[0]!;
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items[0]}, ${items[1]}, and ${items[2]}`;
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

function updateSimulatorCountryUrl(
  countryCode: string,
  mode: PlanCoverageSimulatorMode
) {
  const url = new URL(window.location.href);

  url.searchParams.set("country", countryCode);
  url.searchParams.set(
    "view",
    mode === "optimisation" ? "product-optimisation" : "plan-coverage-simulator"
  );
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
    const existingEntry = entries.find((entry) => entry.demandKey === demandKey);
    const profilesToSave =
      existingEntry && existingEntry.profiles.length > currentProfiles.length
        ? existingEntry.profiles
        : currentProfiles;
    const savedAtToSave =
      existingEntry && existingEntry.profiles.length > currentProfiles.length
        ? existingEntry.savedAt
        : savedAt;
    const retainedEntries = entries
      .filter((entry) => entry.demandKey !== demandKey)
      .sort((first, second) =>
        (second.savedAt ?? "").localeCompare(first.savedAt ?? "")
      )
      .slice(0, 2);
    const nextEntries = [
      {
        demandKey,
        profiles: profilesToSave,
        savedAt: savedAtToSave
      },
      ...retainedEntries
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

function pruneSavedDemandProfileEntries(demandKey?: string) {
  try {
    const entries = savedDemandProfileEntriesFromStorage();
    const exact = demandKey
      ? entries.find((entry) => entry.demandKey === demandKey)
      : null;
    const retainedEntries = entries
      .filter((entry) => entry.demandKey !== exact?.demandKey)
      .sort((first, second) =>
        (second.savedAt ?? "").localeCompare(first.savedAt ?? "")
      )
      .slice(0, exact ? 2 : 1);
    const nextEntries = exact ? [exact, ...retainedEntries] : retainedEntries;

    if (nextEntries.length < 1) {
      window.localStorage.removeItem(SIMULATOR_DEMAND_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(
      SIMULATOR_DEMAND_STORAGE_KEY,
      JSON.stringify({
        entries: nextEntries,
        version: 3
      } satisfies SavedDemandProfilesState)
    );
  } catch {
    // Pruning is a best-effort recovery path for storage quota pressure.
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

function writeSavedSimulationState(state: SavedSimulationState) {
  try {
    window.localStorage.setItem(SIMULATOR_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

function saveSimulationState(
  inputKey: string,
  runner: AdminPlanCoverageSimulationRunner,
  options?: Readonly<{ demandKey?: string }>
) {
  const nextState = savedStateFromRunner(inputKey, runner);

  try {
    const raw = window.localStorage.getItem(SIMULATOR_STORAGE_KEY);

    if (raw) {
      const existing = JSON.parse(raw) as Partial<SavedSimulationState>;

      if (
        existing.version === 5 &&
        existing.inputKey === inputKey &&
        typeof existing.sampleSize === "number" &&
        Array.isArray(existing.sampleTraces) &&
        existing.sampleTraces.length >= existing.sampleSize &&
        existing.sampleSize > runner.sampleSize
      ) {
        return true;
      }
    }
  } catch {
    // Ignore unreadable existing storage and try to write the new state.
  }

  if (writeSavedSimulationState(nextState)) {
    return true;
  }

  pruneSavedDemandProfileEntries(options?.demandKey);
  pruneSavedCatalogueOptimizationEntries();

  return writeSavedSimulationState(nextState);
}

function clearSavedSimulationState() {
  try {
    window.localStorage.removeItem(SIMULATOR_STORAGE_KEY);
  } catch {
    // Ignore private browsing or storage policy failures.
  }
}

function catalogueOptimizationStateFromStorage(): SavedCatalogueOptimizationState {
  try {
    const raw = window.localStorage.getItem(SIMULATOR_OPTIMIZATION_STORAGE_KEY);

    if (!raw) {
      return {
        entries: [],
        version: 2
      };
    }

    const parsed = JSON.parse(raw) as Partial<SavedCatalogueOptimizationState>;

    if (
      (parsed.version !== 1 && parsed.version !== 2) ||
      !Array.isArray(parsed.entries)
    ) {
      return {
        entries: [],
        version: 2
      };
    }

    const entries = parsed.entries
      .map((entry) => ({
        baseCacheKey:
          typeof entry.baseCacheKey === "string" ? entry.baseCacheKey : undefined,
        cacheKey: typeof entry.cacheKey === "string" ? entry.cacheKey : "",
        optimization: entry.optimization,
        savedAt: typeof entry.savedAt === "string" ? entry.savedAt : ""
      }))
      .filter((entry) =>
        entry.cacheKey &&
        entry.optimization &&
        entry.optimization.status === "ready"
      )
      .slice(0, 12);
    return {
      entries,
      version: 2
    };
  } catch {
    return {
      entries: [],
      version: 2
    };
  }
}

function savedCatalogueOptimizationEntriesFromStorage() {
  return catalogueOptimizationStateFromStorage().entries;
}

function loadSavedCatalogueOptimization(cacheKey: string) {
  const expectsPotentialHash = cacheKey.includes(":review:1:");

  return savedCatalogueOptimizationEntriesFromStorage()
    .find((entry) =>
      expectsPotentialHash
        ? entry.cacheKey === cacheKey ||
          entry.baseCacheKey === cacheKey
        : entry.cacheKey === cacheKey ||
          entry.baseCacheKey === cacheKey
    )?.optimization ?? null;
}

function catalogueOptimizationMatchesSampleSize(
  optimization: AdminCatalogueOptimizationData,
  sampleSize: number
) {
  if (optimization.sampleSize !== sampleSize) {
    return false;
  }

  return !(
    optimization.potential?.status === "ready" &&
    optimization.potential.sampleSize !== sampleSize
  );
}

function saveCatalogueOptimization(
  cacheKey: string,
  optimization: AdminCatalogueOptimizationData,
  options?: Readonly<{ baseCacheKey?: string | null }>
) {
  try {
    const state = catalogueOptimizationStateFromStorage();
    const baseCacheKey = options?.baseCacheKey?.trim() || undefined;
    const nextEntries = [
      {
        ...(baseCacheKey ? { baseCacheKey } : {}),
        cacheKey,
        optimization,
        savedAt: new Date().toISOString()
      },
      ...state.entries.filter((entry) =>
        entry.cacheKey !== cacheKey &&
        (!baseCacheKey || entry.baseCacheKey !== baseCacheKey)
      )
    ].slice(0, 12);

    window.localStorage.setItem(
      SIMULATOR_OPTIMIZATION_STORAGE_KEY,
      JSON.stringify({
        entries: nextEntries,
        version: 2
      } satisfies SavedCatalogueOptimizationState)
    );
  } catch {
    // Optimizer caching is a speed-up; calculation still works without storage.
  }
}

function pruneSavedCatalogueOptimizationEntries(maxEntries = 1) {
  try {
    const state = catalogueOptimizationStateFromStorage();
    const nextEntries = [...state.entries]
      .sort((first, second) => second.savedAt.localeCompare(first.savedAt))
      .slice(0, Math.max(0, maxEntries));

    if (nextEntries.length < 1) {
      window.localStorage.removeItem(SIMULATOR_OPTIMIZATION_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(
      SIMULATOR_OPTIMIZATION_STORAGE_KEY,
      JSON.stringify({
        entries: nextEntries,
        version: 2
      } satisfies SavedCatalogueOptimizationState)
    );
  } catch {
    // Pruning is a best-effort recovery path for storage quota pressure.
  }
}

function clearSavedCatalogueOptimization(cacheKey?: string) {
  try {
    if (!cacheKey) {
      window.localStorage.removeItem(SIMULATOR_OPTIMIZATION_STORAGE_KEY);
      return;
    }

    const state = catalogueOptimizationStateFromStorage();
    const nextEntries = state.entries
      .filter((entry) =>
        entry.cacheKey !== cacheKey &&
        entry.baseCacheKey !== cacheKey
      );

    window.localStorage.setItem(
      SIMULATOR_OPTIMIZATION_STORAGE_KEY,
      JSON.stringify({
        entries: nextEntries,
        version: 2
      } satisfies SavedCatalogueOptimizationState)
    );
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
  runner.sampleTraces = [...(saved.sampleTraces ?? [])];
  runner.sampleSize = Math.max(
    0,
    Math.min(
      Math.floor(saved.sampleSize),
      runner.sampleTraces.length,
      saved.coverageValues.length,
      saved.costValues.length
    )
  );
  if (runner.sampleTraces.length > runner.sampleSize) {
    runner.sampleTraces = runner.sampleTraces.slice(0, runner.sampleSize);
  }
  if (runner.coverageValues.length > runner.sampleSize) {
    runner.coverageValues = runner.coverageValues.slice(0, runner.sampleSize);
  }
  if (runner.costValues.length > runner.sampleSize) {
    runner.costValues = runner.costValues.slice(0, runner.sampleSize);
  }
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

function simulatorInputReady(data: AdminPlanCoverageSimulationData) {
  return (
    data.databaseAvailable &&
    (
      data.input.candidates.length > 0 ||
      data.input.supplements.length > 0 ||
      data.input.supplementGovernanceHash !== "supplement-governance:unknown" ||
      data.realCustomerArchetypes.length > 0 ||
      data.realCustomerProfiles.length > 0 ||
      data.reviewPriorityProducts.length > 0
    )
  );
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

function catalogueOptimizationJobHref(accessToken: string) {
  const params = new URLSearchParams();

  if (accessToken) {
    params.set("access_token", accessToken);
  }

  const suffix = params.toString();

  return `/api/admin/product-coverage/catalogue-optimization/jobs${suffix ? `?${suffix}` : ""}`;
}

function catalogueOptimizationJobCachedProgress(
  job: AdminCatalogueOptimizationJobView | null,
  fallbackTotal: number
): CatalogueOptimizationCachedProgress | null {
  if (!job || (job.status !== "queued" && job.status !== "running")) {
    return null;
  }

  return {
    cacheKey: job.cacheKey,
    candidateCount: job.candidateCount,
    current: Math.max(0, job.completedSamples),
    savedAt: job.updatedAt,
    total: Math.max(1, job.totalSamples || fallbackTotal)
  };
}

function catalogueOptimizationProgressFromJob(
  job: AdminCatalogueOptimizationJobView,
  fallbackTotal: number
): AdminCatalogueOptimizationProgress {
  const total = Math.max(1, job.totalSamples || fallbackTotal);
  const current = Math.min(total, Math.max(0, job.completedSamples));

  if (
    job.stage === "loading_catalogue" ||
    job.stage === "queued" ||
    job.stage === "starting"
  ) {
    return {
      current,
      label: job.message || "Preparing potential catalogue",
      stage: "validating",
      total
    };
  }

  if (job.stage === "finalizing") {
    return {
      current: total,
      label: job.message || "Finalizing optimum basket",
      stage: "pruning",
      total
    };
  }

  return {
    current,
    label: job.message || "Evaluating potential basket",
    stage: "scoring",
    total
  };
}

function timestampMillis(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function catalogueOptimizationJobStartedAt(
  job: AdminCatalogueOptimizationJobView
) {
  const parsed = timestampMillis(job.startedAt ?? job.createdAt);

  return parsed ?? Date.now();
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

function CatalogueOptimizationFrontierGraph({
  baseline,
  frontier,
  optimized
}: Readonly<{
  baseline: AdminCatalogueOptimizationData["baseline"];
  frontier: AdminCatalogueOptimizationData["frontier"];
  optimized: AdminCatalogueOptimizationData["optimized"];
}>) {
  const points = [...frontier]
    .filter((point) =>
      Number.isFinite(point.productCount) &&
      Number.isFinite(point.averageCoveragePercent)
    )
    .sort((first, second) => first.productCount - second.productCount);
  const sweetSpot =
    points.find((point) => point.recommended) ??
    points.find((point) => point.productCount === optimized.productCount) ??
    null;

  if (points.length < 1 || !sweetSpot) {
    return null;
  }

  const width = 720;
  const height = 280;
  const padding = {
    bottom: 42,
    left: 54,
    right: 22,
    top: 22
  };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxProducts = Math.max(
    baseline.productCount,
    ...points.map((point) => point.productCount),
    1
  );
  const minCoverage = Math.max(
    0,
    Math.min(
      ...points.map((point) => point.averageCoveragePercent),
      sweetSpot.averageCoveragePercent,
      baseline.averageCoveragePercent
    ) - 5
  );
  const maxCoverage = Math.min(
    100,
    Math.max(
      ...points.map((point) => point.averageCoveragePercent),
      sweetSpot.averageCoveragePercent,
      baseline.averageCoveragePercent
    ) + 2
  );
  const coverageSpan = Math.max(1, maxCoverage - minCoverage);
  const x = (productCount: number) =>
    padding.left + (productCount / maxProducts) * plotWidth;
  const y = (coveragePercent: number) =>
    padding.top +
    ((maxCoverage - coveragePercent) / coverageSpan) * plotHeight;
  const path = points
    .map((point, index) =>
      `${index === 0 ? "M" : "L"} ${x(point.productCount).toFixed(1)} ${y(
        point.averageCoveragePercent
      ).toFixed(1)}`
    )
    .join(" ");
  const perfectY = y(baseline.averageCoveragePercent);
  const sweetX = x(sweetSpot.productCount);
  const sweetY = y(sweetSpot.averageCoveragePercent);
  const coverageLoss = Math.max(
    0,
    baseline.averageCoveragePercent - sweetSpot.averageCoveragePercent
  );

  return (
    <div className="mt-4 rounded-lg bg-slate-50 p-4 ring-1 ring-slate-200">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-950">
            Optimisation frontier
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            The curve shows average coverage as the basket grows toward the
            full-catalogue baseline.
          </p>
        </div>
        <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">
          Sweet spot · {numberText(sweetSpot.productCount)} products
        </Badge>
      </div>

      <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_230px] lg:items-center">
        <svg
          aria-label="Optimisation frontier graph"
          className="h-auto w-full overflow-visible"
          role="img"
          viewBox={`0 0 ${width} ${height}`}
        >
          <line
            stroke="#CBD5E1"
            strokeWidth="1"
            x1={padding.left}
            x2={padding.left}
            y1={padding.top}
            y2={height - padding.bottom}
          />
          <line
            stroke="#CBD5E1"
            strokeWidth="1"
            x1={padding.left}
            x2={width - padding.right}
            y1={height - padding.bottom}
            y2={height - padding.bottom}
          />
          <line
            stroke="#94A3B8"
            strokeDasharray="5 5"
            strokeWidth="1.5"
            x1={padding.left}
            x2={width - padding.right}
            y1={perfectY}
            y2={perfectY}
          />
          <text
            fill="#64748B"
            fontSize="12"
            x={padding.left}
            y={Math.max(12, perfectY - 8)}
          >
            Perfect coverage baseline
          </text>
          <path
            d={path}
            fill="none"
            stroke="#3A7BD5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
          />
          {points.map((point) => (
            <circle
              cx={x(point.productCount)}
              cy={y(point.averageCoveragePercent)}
              fill={point.withinCoverageFloor ? "#3A7BD5" : "#CBD5E1"}
              key={`${point.productCount}-${point.averageCoveragePercent}`}
              r={point.recommended ? 0 : 4}
            />
          ))}
          <line
            stroke="#168060"
            strokeDasharray="4 4"
            strokeWidth="1.5"
            x1={sweetX}
            x2={sweetX}
            y1={sweetY}
            y2={height - padding.bottom}
          />
          <circle
            cx={sweetX}
            cy={sweetY}
            fill="#168060"
            r="7"
            stroke="#FFFFFF"
            strokeWidth="3"
          />
          <text
            fill="#0F513F"
            fontSize="13"
            fontWeight="700"
            x={Math.min(width - 180, sweetX + 12)}
            y={Math.max(18, sweetY - 10)}
          >
            Sweet spot
          </text>
          <text fill="#64748B" fontSize="12" x={padding.left} y={height - 10}>
            Products carried
          </text>
          <text
            fill="#64748B"
            fontSize="12"
            transform={`translate(14 ${height / 2}) rotate(-90)`}
          >
            Average coverage
          </text>
          <text
            fill="#64748B"
            fontSize="12"
            textAnchor="middle"
            x={padding.left}
            y={height - padding.bottom + 18}
          >
            0
          </text>
          <text
            fill="#64748B"
            fontSize="12"
            textAnchor="middle"
            x={width - padding.right}
            y={height - padding.bottom + 18}
          >
            {numberText(maxProducts)}
          </text>
          <text
            fill="#64748B"
            fontSize="12"
            textAnchor="end"
            x={padding.left - 8}
            y={y(minCoverage) + 4}
          >
            {percentText(Math.round(minCoverage))}
          </text>
          <text
            fill="#64748B"
            fontSize="12"
            textAnchor="end"
            x={padding.left - 8}
            y={y(maxCoverage) + 4}
          >
            {percentText(Math.round(maxCoverage))}
          </text>
        </svg>

        <div className="space-y-3 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">
              Sweet spot
            </p>
            <p className="mt-1 text-lg font-bold text-slate-950">
              {numberText(sweetSpot.productCount)} products
            </p>
            <p className="text-slate-500">
              {percentText(sweetSpot.averageCoveragePercent)} average coverage
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">
              Coverage retained
            </p>
            <p className="mt-1 font-bold text-slate-950">
              {percentText(sweetSpot.retainedAverageCoveragePercent)}
            </p>
            <p className="text-slate-500">
              {percentText(coverageLoss)} below the full-catalogue baseline.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">
              Reliability
            </p>
            <p className="mt-1 font-bold text-slate-950">
              {percentText(sweetSpot.p10CoveragePercent)} P10 coverage
            </p>
            <p className="text-slate-500">
              {percentText(sweetSpot.percentAbove75)} of plans reach at least 75%.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function readinessBadgeClassName(readiness?: "current" | "needs_review") {
  return readiness === "needs_review"
    ? "bg-amber-50 text-amber-700 ring-amber-200"
    : "bg-emerald-50 text-emerald-700 ring-emerald-200";
}

function CatalogueCarryProductRow({
  accessToken,
  locale,
  row
}: Readonly<{
  accessToken: string;
  locale: Locale;
  row: AdminCatalogueOptimizationData["carryProducts"][number];
}>) {
  return (
    <div className="grid gap-3 border-t border-slate-200 py-3 lg:grid-cols-[44px_minmax(0,1fr)_100px_120px_120px] lg:items-center">
      <p className="text-sm font-bold text-slate-400">#{row.rank}</p>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <a
            className="inline-flex min-w-0 items-center gap-1 truncate text-sm font-semibold text-slate-950 hover:text-[#168060]"
            href={productDetailHref(row.id, locale, accessToken)}
          >
            <span className="truncate">{row.title}</span>
            <ArrowTopRightOnSquareIcon className="size-4 shrink-0" aria-hidden={true} />
          </a>
          <Badge className={readinessBadgeClassName(row.readiness)}>
            {row.readinessLabel ?? "Current"}
          </Badge>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {row.brandName ?? "No brand"} · {compactListText(row.protectedSupplementNames)}
        </p>
      </div>
      <div className="text-sm">
        <p className="text-xs text-slate-500">Profiles</p>
        <p className="font-bold text-slate-950">{numberText(row.protectedPlanCount)}</p>
      </div>
      <div className="text-sm">
        <p className="text-xs text-slate-500">Contribution</p>
        <p className="font-bold text-slate-950">
          {percentText(row.averageStackContributionPercent)}
        </p>
      </div>
      <div className="text-sm">
        <p className="text-xs text-slate-500">Price</p>
        <p className="font-bold text-slate-950">{amountText(row.expectedPriceAmount)}</p>
      </div>
    </div>
  );
}

function CatalogueOptimizationRemoveRow({
  accessToken,
  locale,
  row
}: Readonly<{
  accessToken: string;
  locale: Locale;
  row: AdminCatalogueOptimizationData["actionRows"][number];
}>) {
  return (
    <div className="grid gap-3 py-3 lg:grid-cols-[44px_minmax(0,1fr)_120px_120px_120px] lg:items-center">
      <p className="text-sm font-bold text-slate-400">#{row.rank}</p>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {row.productId ? (
            <a
              className="inline-flex min-w-0 items-center gap-1 truncate text-sm font-semibold text-slate-950 hover:text-[#168060]"
              href={productDetailHref(row.productId, locale, accessToken)}
            >
              <span className="truncate">{row.title}</span>
              <ArrowTopRightOnSquareIcon className="size-4 shrink-0" aria-hidden={true} />
            </a>
          ) : (
            <p className="truncate text-sm font-semibold text-slate-950">
              {row.title}
            </p>
          )}
          <Badge className="bg-rose-50 text-rose-700 ring-rose-200">
            Remove
          </Badge>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {row.brandName ?? "No brand"} · {row.reason}
        </p>
      </div>
      <div className="text-sm">
        <p className="text-xs text-slate-500">Baseline use</p>
        <p className="font-bold text-slate-950">
          {numberText(row.affectedPlanCount)}
        </p>
      </div>
      <div className="text-sm">
        <p className="text-xs text-slate-500">Contribution</p>
        <p className="font-bold text-slate-950">
          {percentText(row.coverageImpactPercent)}
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

function CatalogueOptimizationReviewToggle({
  checked,
  disabled = false,
  onChange
}: Readonly<{
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}>) {
  return (
    <label
      className={classNames(
        "inline-flex items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold ring-1 ring-inset",
        disabled
          ? "cursor-not-allowed bg-slate-50 text-slate-400 ring-slate-200"
          : "cursor-pointer bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
      )}
    >
      <span className="text-left">
        <span className="block">Include pending-review products</span>
        <span className="block text-xs font-medium text-slate-500">
          Shows the best possible basket if pending products were approved
        </span>
      </span>
      <input
        checked={checked}
        className="sr-only"
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
        type="checkbox"
      />
      <span
        aria-hidden={true}
        className={classNames(
          "relative inline-flex h-6 w-11 shrink-0 rounded-full transition",
          checked ? "bg-[#168060]" : "bg-slate-300"
        )}
      >
        <span
          className={classNames(
            "absolute top-1 size-4 rounded-full bg-white shadow transition",
            checked ? "left-6" : "left-1"
          )}
        />
      </span>
    </label>
  );
}

function MinimumCataloguePanel({
  accessToken,
  canCalculate,
  cachedProgress,
  elapsedSeconds,
  error,
  includeReviewPriorityProducts,
  locale,
  onRestartQueued,
  onCalculate,
  onIncludeReviewPriorityProductsChange,
  onRecalculate,
  onReset,
  onStop,
  optimization,
  optimizationProgress,
  job,
  blocked,
  queued,
  canRestartQueued,
  optimizationStatus,
  running,
  sampleSize
}: Readonly<{
  accessToken: string;
  canCalculate: boolean;
  cachedProgress: CatalogueOptimizationCachedProgress | null;
  elapsedSeconds: number | null;
  error: string | null;
  includeReviewPriorityProducts: boolean;
  locale: Locale;
  onCalculate: () => void;
  onIncludeReviewPriorityProductsChange: (checked: boolean) => void;
  onRecalculate: () => void;
  onRestartQueued: () => void;
  onReset: () => void;
  onStop: () => void;
  optimization: AdminCatalogueOptimizationData | null;
  optimizationProgress: AdminCatalogueOptimizationProgress | null;
  job: AdminCatalogueOptimizationJobView | null;
  blocked: boolean;
  queued: boolean;
  canRestartQueued: boolean;
  optimizationStatus: CatalogueOptimizationStatus;
  running: boolean;
  sampleSize: number;
}>) {
  const cachedProgressText = cachedProgress
    ? `${numberText(cachedProgress.current)} / ${numberText(cachedProgress.total)} profiles completed by shared job`
    : null;
  const jobDiagnostics = job
    ? [
        job.reservationId ? `reservation ${job.reservationId.slice(0, 8)}` : null,
        job.workerSessionId ? `worker ${job.workerSessionId.slice(0, 8)}` : null,
        job.leaseUntil
          ? `lease ${dateTimeText(job.leaseUntil, locale)}`
          : null,
        job.lastWorkerHeartbeatAt
          ? `heartbeat ${dateTimeText(job.lastWorkerHeartbeatAt, locale)}`
          : null
      ].filter(Boolean).join(" · ")
    : "";

  if (running) {
    return (
      <section className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-lg font-bold text-slate-950">
          Optimum product basket
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Pause or complete the simulation to calculate the product basket.
        </p>
      </section>
    );
  }

  if (optimizationStatus === "processing") {
    return (
      <section className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Optimum product basket
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {blocked
                ? "The Analytics worker stopped updating this shared background job."
                : queued
                ? "Waiting for the Analytics worker to start this shared background job."
                : "Calculating the product basket as a shared background job. You can leave this page and return later."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-blue-50 text-blue-700 ring-blue-200">
              {blocked ? "Blocked" : queued ? "Queued" : "Optimizing"}
            </Badge>
            <CatalogueOptimizationReviewToggle
              checked={includeReviewPriorityProducts}
              disabled={true}
              onChange={onIncludeReviewPriorityProductsChange}
            />
            <button
              className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
              onClick={onStop}
              type="button"
            >
              Stop
            </button>
            {queued || blocked ? (
              <button
                className={classNames(
                  "rounded-md px-3 py-2 text-sm font-semibold ring-1 ring-inset",
                  canRestartQueued
                    ? "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
                    : "bg-slate-100 text-slate-400 ring-slate-200"
                )}
                disabled={!canRestartQueued}
                onClick={onRestartQueued}
                type="button"
              >
                {blocked ? "Restart blocked job" : "Restart queued job"}
              </button>
            ) : null}
          </div>
        </div>
        <div className="mt-4 rounded-md bg-blue-50 p-3 text-sm text-blue-800 ring-1 ring-blue-100">
          <p className="font-semibold">
            {queued
              ? "Waiting for Analytics worker"
              : blocked
                ? "Analytics worker update stalled"
                : optimizationProgress?.current
                  ? "Still working"
                  : "Preparing the shared job"}
            {elapsedSeconds !== null ? ` · ${durationText(elapsedSeconds)} elapsed` : ""}
          </p>
          <p className="mt-1 text-blue-700">
            The first update is usually the slowest because the server loads the
            potential product catalogue before it can save the first chunk. Progress is
            saved to the shared job after each chunk.
          </p>
          {cachedProgressText ? (
            <p className="mt-1 font-semibold text-blue-900">
              {cachedProgressText}
              {cachedProgress?.candidateCount
                ? ` · ${numberText(cachedProgress.candidateCount)} products considered`
                : ""}
            </p>
          ) : null}
          {jobDiagnostics ? (
            <p className="mt-1 text-xs font-semibold text-blue-900">
              {jobDiagnostics}
            </p>
          ) : null}
        </div>
        {optimizationProgress ? (
          <p className="mt-2 text-sm text-slate-500">
            {optimizationProgress.label}
            {optimizationProgress.stage === "scoring" ? (
              <>
                {" · "}
                {numberText(optimizationProgress.current)} /{" "}
                {numberText(optimizationProgress.total)} profiles
              </>
            ) : (
              <>
                {" · "}
                {numberText(optimizationProgress.current)} /{" "}
                {numberText(optimizationProgress.total)}
              </>
            )}
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
            <h2 className="text-lg font-bold text-slate-950">
              Optimum product basket
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Run the simulation, then calculate the products to carry.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <CatalogueOptimizationReviewToggle
              checked={includeReviewPriorityProducts}
              onChange={onIncludeReviewPriorityProductsChange}
            />
            {error || cachedProgress || job ? (
              <button
                className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
                onClick={onReset}
                type="button"
              >
                Reset
              </button>
            ) : null}
            <button
              className={classNames(
                "rounded-md px-3 py-2 text-sm font-semibold ring-1 ring-inset",
                canCalculate
                  ? "bg-[#20343A] text-white ring-[#20343A] hover:bg-[#16252A]"
                  : "bg-slate-100 text-slate-400 ring-slate-200"
              )}
              disabled={!canCalculate}
              onClick={error ? onRecalculate : onCalculate}
              type="button"
            >
              {error ? "Run again" : "Calculate"}
            </button>
          </div>
        </div>
        {error ? (
          <p className="mt-2 text-sm font-semibold text-rose-700">{error}</p>
        ) : null}
        {jobDiagnostics ? (
          <p className="mt-2 text-xs font-semibold text-slate-500">
            {jobDiagnostics}
          </p>
        ) : null}
        {cachedProgressText ? (
          <p className="mt-3 rounded-md bg-emerald-50 p-3 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-100">
            Shared job progress found: {cachedProgressText}. Calculate will show the
            latest shared result or continue the job.
          </p>
        ) : null}
      </section>
    );
  }

  const potentialBasket =
    includeReviewPriorityProducts && optimization.potential?.status === "ready"
      ? optimization.potential
      : null;
  const basketProducts = potentialBasket?.carryProducts ?? optimization.carryProducts;
  const basketBaseline = potentialBasket?.baseline ?? optimization.baseline;
  const basketFrontier = potentialBasket?.frontier ?? optimization.frontier;
  const basketSummary = potentialBasket?.optimized ?? optimization.optimized;
  const basketProductCount = potentialBasket?.candidateCount ??
    optimization.baseline.productCount;
  const basketGeneratedAt = potentialBasket?.generatedAt ?? optimization.generatedAt;
  const basketSampleSize = potentialBasket?.sampleSize ?? optimization.sampleSize;
  const basketNeedsReviewCount = basketProducts.filter((product) =>
    product.readiness === "needs_review"
  ).length;
  const removeRecommendationRows = optimization.actionRows
    .filter((row) => row.actionType === "consider_retiring")
    .slice(0, 8);
  const sampleCountMismatch = basketSampleSize !== sampleSize;

  return (
    <section className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-950">
            Optimum product basket
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Products to carry for the highest simulated coverage. Generated{" "}
            {dateTimeText(basketGeneratedAt, locale)} from{" "}
            {numberText(basketSampleSize)} profiles.
          </p>
          {sampleCountMismatch ? (
            <p className="mt-1 text-xs font-semibold text-amber-700">
              Current simulator sample count is {numberText(sampleSize)}; recalculate
              to align this basket with the visible simulation.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CatalogueOptimizationReviewToggle
            checked={includeReviewPriorityProducts}
            onChange={onIncludeReviewPriorityProductsChange}
          />
          <button
            className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
            onClick={onReset}
            type="button"
          >
            Reset
          </button>
          <button
            className={classNames(
              "rounded-md px-3 py-2 text-sm font-semibold ring-1 ring-inset",
              canCalculate
                ? "bg-[#20343A] text-white ring-[#20343A] hover:bg-[#16252A]"
                : "bg-slate-100 text-slate-400 ring-slate-200"
            )}
            disabled={!canCalculate}
            onClick={onRecalculate}
            type="button"
          >
            Recalculate
          </button>
          <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">
            {numberText(basketSummary.productCount)} products
          </Badge>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <CatalogueOptimizationMetric
          label="Products considered"
          value={`${numberText(basketProductCount)} products`}
        />
        <CatalogueOptimizationMetric
          label="Basket products"
          value={`${numberText(basketSummary.productCount)} products`}
        />
        <CatalogueOptimizationMetric
          label="Need review"
          value={numberText(basketNeedsReviewCount)}
        />
        <CatalogueOptimizationMetric
          label="Expected cost"
          value={amountText(basketSummary.expectedCostAmount)}
        />
        <CatalogueOptimizationMetric
          label="Average coverage"
          value={percentText(basketSummary.averageCoveragePercent)}
        />
        <CatalogueOptimizationMetric
          label="P10 coverage"
          value={percentText(basketSummary.p10CoveragePercent)}
        />
        <CatalogueOptimizationMetric
          label="Plans >=75%"
          value={percentText(basketSummary.percentAbove75)}
        />
        <CatalogueOptimizationMetric
          label="Max coverage"
          value={percentText(basketBaseline.averageCoveragePercent)}
        />
      </div>

      <CatalogueOptimizationFrontierGraph
        baseline={basketBaseline}
        frontier={basketFrontier}
        optimized={basketSummary}
      />

      <div className="mt-4">
        {basketProducts.length > 0 ? (
          basketProducts.map((row) => (
            <CatalogueCarryProductRow
              accessToken={accessToken}
              key={row.id}
              locale={locale}
              row={row}
            />
          ))
        ) : (
          <p className="border-t border-slate-200 py-4 text-sm text-slate-500">
            No basket products were identified for this simulation output.
          </p>
        )}
      </div>

      {removeRecommendationRows.length > 0 ? (
        <div className="mt-4 border-t border-slate-200 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-950">
                Remove recommendations
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Products outside the minimum carry set that can be considered for
                retirement.
              </p>
            </div>
            <Badge className="bg-rose-50 text-rose-700 ring-rose-200">
              {numberText(removeRecommendationRows.length)} candidates
            </Badge>
          </div>
          <div className="mt-2 divide-y divide-slate-200">
            {removeRecommendationRows.map((row) => (
              <CatalogueOptimizationRemoveRow
                accessToken={accessToken}
                key={row.id}
                locale={locale}
                row={row}
              />
            ))}
          </div>
        </div>
      ) : null}
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

function convergenceDeltaSummaryText(
  deltas: AdminPlanCoverageSimulationData["convergence"]["deltas"]
) {
  const metrics = [
    ["average", deltas.averageCoveragePercent],
    ["median", deltas.medianCoveragePercent],
    ["P10", deltas.p10CoveragePercent],
    [">=75%", deltas.percentAbove75],
    ["cost", deltas.expectedCostPercent]
  ] as const;
  const availableMetrics: string[] = [];

  for (const [label, value] of metrics) {
    if (value !== null) {
      availableMetrics.push(`${label} ${percentText(value)}`);
    }
  }

  if (availableMetrics.length === 0) {
    return "movement is not available yet";
  }

  return availableMetrics.join(" · ");
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
    return "Loading catalogue input";
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

  const windowText = `Last ${numberText(data.convergence.windowSize)} runs`;
  const deltaText = convergenceDeltaSummaryText(data.convergence.deltas);
  const overlapText =
    data.convergence.topProductOverlapPercent === null
      ? ""
      : ` · top products ${percentText(data.convergence.topProductOverlapPercent)} stable`;

  if (data.convergence.status === "complete") {
    return data.convergence.stable
      ? `${windowText}: ${deltaText}${overlapText}. Full run complete and stable.`
      : `${windowText}: ${deltaText}${overlapText}. Full run complete, but the last window was still moving.`;
  }

  if (data.convergence.status === "stable" && data.convergence.stable) {
    return `${windowText}: ${deltaText}${overlapText}. Results look stable enough to stop.`;
  }

  return `${windowText}: ${deltaText}${overlapText}. Results are still moving.`;
}

function simulationProgressDisplay({
  demandProfiles,
  generating,
  optimizingCatalogue,
  running,
  simulationData
}: Readonly<{
  demandProfiles: readonly AdminPlanCoverageDemandProfile[];
  generating: boolean;
  optimizingCatalogue: boolean;
  running: boolean;
  simulationData: AdminPlanCoverageSimulationData;
}>): SimulatorProgressDisplay {
  if (optimizingCatalogue) {
    return {
      current: ADMIN_PLAN_COVERAGE_SIMULATION_MAX_SAMPLES,
      total: ADMIN_PLAN_COVERAGE_SIMULATION_MAX_SAMPLES
    };
  }

  if (generating && running) {
    return {
      current: Math.max(simulationData.sampleSize, demandProfiles.length),
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
  const loadingInput = inputStatus === "loading" && !hydrated;
  const barPercent = loadingInput
    ? 34
    : Math.max(0, Math.min(100, progressPercent));
  const optimizationProgressText =
    optimizingCatalogue && catalogueOptimizationProgress
      ? `${catalogueOptimizationProgress.label} · ${numberText(
          catalogueOptimizationProgress.current
        )} / ${numberText(catalogueOptimizationProgress.total)} profiles`
      : null;

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
            optimizingCatalogue || loadingInput ? "bg-[#3A7BD5]" : "bg-[#1FA77A]",
            loadingInput && "admin-progress-indeterminate"
          )}
          style={{
            width: `${barPercent}%`
          }}
        />
      </div>
      {demandError ? (
        <p className="mt-2 text-sm font-semibold text-rose-700">{demandError}</p>
      ) : null}
      {!demandError && optimizationProgressText ? (
        <p className="mt-2 text-sm text-slate-500">
          {optimizationProgressText}
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

function answerLabelText(key: string) {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function answerValueText(value: unknown): string {
  if (Array.isArray(value)) {
    const text = value.map(answerValueText).filter(Boolean).join(", ");

    return text || "None";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? numberText(value) : "Unknown";
  }

  if (typeof value === "string") {
    return value.trim() || "Blank";
  }

  if (value && typeof value === "object") {
    const text = Object.entries(value as Record<string, unknown>)
      .map(([key, nestedValue]) => `${answerLabelText(key)}: ${answerValueText(nestedValue)}`)
      .filter(Boolean)
      .join("; ");

    return text || "Blank";
  }

  return "Blank";
}

function clippedAnswerText(value: unknown, maxLength = 150) {
  const text = answerValueText(value);

  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

const PROFILE_ANSWER_SUMMARY_KEYS = [
  "age",
  "sex",
  "country",
  "goals",
  "symptoms",
  "sleep",
  "stress",
  "medications",
  "conditions",
  "diet"
] as const;

function questionnaireAnswerRows(answers: Record<string, unknown>) {
  const usedKeys = new Set<string>();
  const preferredRows = PROFILE_ANSWER_SUMMARY_KEYS.flatMap((key) => {
    if (!(key in answers)) {
      return [];
    }

    usedKeys.add(key);
    return [[key, answers[key]] as const];
  });
  const remainingRows = Object.entries(answers)
    .filter(([key]) => !usedKeys.has(key))
    .sort(([first], [second]) => first.localeCompare(second));

  return [...preferredRows, ...remainingRows];
}

function demandProfileSummaryText(profile: AdminPlanCoverageDemandProfile) {
  const answerRows = questionnaireAnswerRows(profile.answers);
  const summary = answerRows
    .filter(([key]) => PROFILE_ANSWER_SUMMARY_KEYS.includes(
      key as (typeof PROFILE_ANSWER_SUMMARY_KEYS)[number]
    ))
    .slice(0, 4)
    .map(([key, value]) => `${answerLabelText(key)}: ${clippedAnswerText(value, 54)}`);

  return summary.length > 0 ? summary.join(" · ") : "No questionnaire answers";
}

function GeneratedDemandProfilesPanel({
  profiles
}: Readonly<{
  profiles: readonly AdminPlanCoverageDemandProfile[];
}>) {
  const sortedProfiles = [...profiles].sort(
    (first, second) => first.sampleIndex - second.sampleIndex
  );

  return (
    <section className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-950">
            AI profile questionnaires
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Generated profiles mapped to their AI-filled assessment answers and
            supplement needs.
          </p>
        </div>
        <Badge>{numberText(sortedProfiles.length)} generated</Badge>
      </div>

      {sortedProfiles.length > 0 ? (
        <div className="mt-3 max-h-[520px] overflow-auto rounded-md border border-slate-200">
          {sortedProfiles.map((profile) => {
            const answerRows = questionnaireAnswerRows(profile.answers);
            const needRows = profile.needs.slice(0, 8);

            return (
              <details
                className="group border-t border-slate-200 first:border-t-0"
                key={`${profile.sampleIndex}:${profile.id}`}
              >
                <summary className="grid cursor-pointer gap-3 px-3 py-3 text-left hover:bg-slate-50 md:grid-cols-[72px_minmax(0,1fr)_minmax(0,1.4fr)_minmax(160px,0.7fr)] md:items-center">
                  <span className="text-sm font-bold text-slate-500">
                    #{numberText(profile.sampleIndex + 1)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-950">
                      {profile.archetypeName}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {profile.clientSex ? sexFilterLabel(profile.clientSex) : "Any sex"}
                    </span>
                  </span>
                  <span className="text-xs font-medium text-slate-600">
                    {demandProfileSummaryText(profile)}
                  </span>
                  <span className="flex flex-wrap gap-1">
                    {profile.supplementNames.slice(0, 3).map((name) => (
                      <Badge
                        className="bg-emerald-50 text-emerald-700 ring-emerald-100"
                        key={name}
                      >
                        {name}
                      </Badge>
                    ))}
                    {profile.supplementNames.length > 3 ? (
                      <Badge>
                        +{numberText(profile.supplementNames.length - 3)}
                      </Badge>
                    ) : null}
                  </span>
                </summary>
                <div className="grid gap-4 border-t border-slate-100 bg-slate-50 px-3 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.75fr)]">
                  <div>
                    <h3 className="text-xs font-bold uppercase text-slate-500">
                      Questionnaire answers
                    </h3>
                    <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                      {answerRows.map(([key, value]) => (
                        <div
                          className="rounded-md bg-white p-2 ring-1 ring-slate-200"
                          key={key}
                        >
                          <dt className="text-[11px] font-semibold uppercase text-slate-400">
                            {answerLabelText(key)}
                          </dt>
                          <dd className="mt-1 break-words text-xs font-medium text-slate-700">
                            {clippedAnswerText(value, 240)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                  <div>
                    <h3 className="text-xs font-bold uppercase text-slate-500">
                      Supplement needs
                    </h3>
                    <div className="mt-2 divide-y divide-slate-200 rounded-md bg-white ring-1 ring-slate-200">
                      {needRows.map((need) => (
                        <div
                          className="px-3 py-2 text-xs"
                          key={`${need.id}:${need.displayName}`}
                        >
                          <p className="font-semibold text-slate-950">
                            {need.displayName}
                          </p>
                          <p className="mt-1 text-slate-500">
                            {need.category} · {need.targetText ?? "No target dose"} ·
                            weight {numberText(need.weight)}
                          </p>
                        </div>
                      ))}
                      {profile.needs.length > needRows.length ? (
                        <p className="px-3 py-2 text-xs font-semibold text-slate-500">
                          +{numberText(profile.needs.length - needRows.length)} more needs
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      ) : (
        <p className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-500 ring-1 ring-slate-200">
          No AI questionnaires generated yet.
        </p>
      )}
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
  mode = "simulator",
  range
}: Readonly<{
  accessToken: string;
  data: AdminPlanCoverageSimulationData;
  locale: Locale;
  mode?: PlanCoverageSimulatorMode;
  range: AdminDashboardRange;
}>) {
  const productOptimisationMode = mode === "optimisation";
  const initialInputReady = simulatorInputReady(data);
  const [selectedCountryCode, setSelectedCountryCode] = useState(() =>
    normalizedSimulatorCountryCode(data.countryCode)
  );
  const [inputData, setInputData] = useState(data);
  const [inputStatus, setInputStatus] =
    useState<SimulatorInputStatus>(initialInputReady ? "ready" : "loading");
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
  const [hydrated, setHydrated] = useState(initialInputReady);
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
  const [catalogueOptimizationStartedAt, setCatalogueOptimizationStartedAt] =
    useState<number | null>(null);
  const [catalogueOptimizationHeartbeat, setCatalogueOptimizationHeartbeat] =
    useState(() => Date.now());
  const [catalogueOptimizationCachedProgress, setCatalogueOptimizationCachedProgress] =
    useState<CatalogueOptimizationCachedProgress | null>(null);
  const [catalogueOptimizationJob, setCatalogueOptimizationJob] =
    useState<AdminCatalogueOptimizationJobView | null>(null);
  const [catalogueOptimizationResetKey, setCatalogueOptimizationResetKey] =
    useState<string | null>(null);
  const [
    includeReviewPriorityProductsInCatalogueOptimization,
    setIncludeReviewPriorityProductsInCatalogueOptimization
  ] = useState(true);
  const [nextMovesClearedKey, setNextMovesClearedKey] = useState<string | null>(
    null
  );
  const runnerRef = useRef<AdminPlanCoverageSimulationRunner | null>(null);
  const runnerInputKeyRef = useRef<string | null>(null);
  const simulationDataRef = useRef(simulationData);
  const inputStatusRef = useRef<SimulatorInputStatus>("loading");
  const runTokenRef = useRef(0);
  const previousDemandKeyRef = useRef<string | null>(null);
  const runningRef = useRef(false);
  const catalogueOptimizationResetKeyRef = useRef<string | null>(null);
  const catalogueReviewProductsKey = useMemo(
    () =>
      hashText(
        JSON.stringify(
          inputData.reviewPriorityProducts.map((product) => ({
            blockedReason: product.blockedReason,
            brandStatus: product.brandStatus ?? null,
            coveredSupplementNames: product.coveredSupplementNames,
            expectedPriceAmount: product.expectedPriceAmount,
            id: product.id,
            productStatus: product.productStatus,
            reviewScore: product.reviewScore
          }))
        )
      ),
    [inputData.reviewPriorityProducts]
  );
  const catalogueOptimizationRunKey = `${inputKey}:${simulationData.sampleSize}:${simulationData.sampleTraces.length}:review:${
    includeReviewPriorityProductsInCatalogueOptimization ? "1" : "0"
  }:${includeReviewPriorityProductsInCatalogueOptimization ? catalogueReviewProductsKey : "none"}`;
  const catalogueOptimizationJobUrl = useMemo(
    () => catalogueOptimizationJobHref(accessToken),
    [accessToken]
  );
  const currentCatalogueOptimization =
    catalogueOptimizationKey === catalogueOptimizationRunKey
      ? catalogueOptimization
      : null;
  const matchedCatalogueOptimizationJob =
    catalogueOptimizationJob?.cacheKey === catalogueOptimizationRunKey
      ? catalogueOptimizationJob
      : null;
  const currentCatalogueOptimizationStatus =
    catalogueOptimizationKey === catalogueOptimizationRunKey
      ? catalogueOptimizationStatus
      : "idle";
  const currentCatalogueOptimizationProgress =
    currentCatalogueOptimizationStatus === "processing"
      ? catalogueOptimizationProgress
      : null;
  const currentCatalogueOptimizationCachedProgress =
    catalogueOptimizationJobCachedProgress(
      matchedCatalogueOptimizationJob,
      simulationData.sampleTraces.length
    ) ?? (
      catalogueOptimizationCachedProgress?.cacheKey === catalogueOptimizationRunKey
        ? catalogueOptimizationCachedProgress
        : null
    );
  const currentCatalogueOptimizationElapsedSeconds =
    currentCatalogueOptimizationStatus === "processing" &&
    catalogueOptimizationStartedAt !== null
      ? Math.floor(
          (catalogueOptimizationHeartbeat - catalogueOptimizationStartedAt) / 1000
        )
      : null;
  const currentCatalogueOptimizationJobMatches =
    matchedCatalogueOptimizationJob !== null;
  const currentCatalogueOptimizationLeaseUntil =
    timestampMillis(
      matchedCatalogueOptimizationJob?.reservationLeaseUntil ??
        matchedCatalogueOptimizationJob?.leaseUntil
    );
  const currentCatalogueOptimizationLastHeartbeat =
    timestampMillis(matchedCatalogueOptimizationJob?.lastWorkerHeartbeatAt);
  const currentCatalogueOptimizationHasReservation =
    Boolean(matchedCatalogueOptimizationJob?.reservationId);
  const currentCatalogueOptimizationLeaseExpired =
    currentCatalogueOptimizationHasReservation &&
    (
      currentCatalogueOptimizationLeaseUntil === null ||
      currentCatalogueOptimizationLeaseUntil <= catalogueOptimizationHeartbeat
    );
  const currentCatalogueOptimizationHeartbeatStale =
    currentCatalogueOptimizationHasReservation &&
    (
      currentCatalogueOptimizationLastHeartbeat === null ||
      catalogueOptimizationHeartbeat - currentCatalogueOptimizationLastHeartbeat >
        120_000
    );
  const currentCatalogueOptimizationQueued =
    currentCatalogueOptimizationStatus === "processing" &&
    currentCatalogueOptimizationJobMatches &&
    matchedCatalogueOptimizationJob?.status === "queued" &&
    !currentCatalogueOptimizationHasReservation;
  const currentCatalogueOptimizationBlocked =
    currentCatalogueOptimizationStatus === "processing" &&
    currentCatalogueOptimizationJobMatches &&
    (
      (
        matchedCatalogueOptimizationJob?.status === "queued" &&
        currentCatalogueOptimizationHasReservation
      ) ||
      (
        matchedCatalogueOptimizationJob?.status === "running" &&
        (
          currentCatalogueOptimizationLeaseExpired ||
          currentCatalogueOptimizationHeartbeatStale
        )
      )
    );
  const canRestartQueuedCatalogueOptimization =
    (currentCatalogueOptimizationQueued || currentCatalogueOptimizationBlocked) &&
    (currentCatalogueOptimizationElapsedSeconds ?? 0) >= 10;
  const productOptimisationSimulationComplete =
    simulationData.sampleSize >= ADMIN_PLAN_COVERAGE_SIMULATION_MAX_SAMPLES &&
    simulationData.sampleTraces.length >= ADMIN_PLAN_COVERAGE_SIMULATION_MAX_SAMPLES;
  const progressDisplay = simulationProgressDisplay({
    demandProfiles,
    generating: demandGenerating,
    optimizingCatalogue:
      productOptimisationMode &&
      currentCatalogueOptimizationStatus === "processing",
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

  const preserveLatestSimulationState = useCallback((
    nextData: AdminPlanCoverageSimulationData,
    nextRunner: AdminPlanCoverageSimulationRunner
  ) => {
    simulationDataRef.current = nextData;
    runnerRef.current = nextRunner;
    runnerInputKeyRef.current = inputKey;
    setSimulationData(nextData);
  }, [inputKey]);

  const restoreSavedSimulationIfNewer = useCallback((
    minimumSampleSize = 0
  ) => {
    const currentRunner = runnerRef.current;
    const currentSampleSize = Math.max(
      simulationDataRef.current.sampleSize,
      currentRunner && runnerInputKeyRef.current === inputKey
        ? currentRunner.sampleSize
        : 0
    );
    const savedState = loadSavedSimulationState(inputKey);

    if (!savedState) {
      return currentSampleSize;
    }

    const savedRunner = runnerFromSavedState(activeInputData, savedState);

    if (
      savedRunner.sampleSize <= currentSampleSize ||
      savedRunner.sampleSize < minimumSampleSize
    ) {
      return currentSampleSize;
    }

    preserveLatestSimulationState(
      adminPlanCoverageSimulationDataFromRunner(savedRunner),
      savedRunner
    );

    return savedRunner.sampleSize;
  }, [activeInputData, inputKey, preserveLatestSimulationState]);

  const applyCatalogueOptimizationJob = useCallback((
    job: AdminCatalogueOptimizationJobView | null,
    requestKey: string
  ) => {
    if (catalogueOptimizationResetKeyRef.current === requestKey) {
      return;
    }

    setCatalogueOptimizationJob(job);

    if (!job) {
      setCatalogueOptimizationCachedProgress(null);
      return;
    }

    setCatalogueOptimizationKey(requestKey);
    setCatalogueOptimizationCachedProgress(
      catalogueOptimizationJobCachedProgress(
        job.cacheKey === requestKey ? job : null,
        simulationData.sampleTraces.length
      )
    );

    if (job.status === "completed" && job.optimization) {
      const visibleSampleSize = restoreSavedSimulationIfNewer(
        job.optimization.sampleSize
      );

      if (
        !catalogueOptimizationMatchesSampleSize(
          job.optimization,
          visibleSampleSize
        )
      ) {
        setCatalogueOptimization(null);
        setCatalogueOptimizationError(
          "The saved optimum basket does not match the visible simulation. Run it again to replace the stale result."
        );
        setCatalogueOptimizationProgress(null);
        setCatalogueOptimizationStartedAt(null);
        setCatalogueOptimizationStatus("idle");
        return;
      }

      saveCatalogueOptimization(requestKey, job.optimization);
      setCatalogueOptimization(job.optimization);
      setCatalogueOptimizationError(null);
      setCatalogueOptimizationProgress(null);
      setCatalogueOptimizationStartedAt(null);
      setCatalogueOptimizationStatus("ready");
      return;
    }

    if (job.status === "failed") {
      setCatalogueOptimization(null);
      setCatalogueOptimizationError(
        job.errorMessage || "Optimum basket request failed"
      );
      setCatalogueOptimizationProgress(null);
      setCatalogueOptimizationStartedAt(null);
      setCatalogueOptimizationStatus("idle");
      return;
    }

    if (job.status === "cancelled") {
      setCatalogueOptimization(null);
      setCatalogueOptimizationError(null);
      setCatalogueOptimizationProgress(null);
      setCatalogueOptimizationStartedAt(null);
      setCatalogueOptimizationStatus("idle");
      return;
    }

    setCatalogueOptimization(null);
    setCatalogueOptimizationError(null);
    setCatalogueOptimizationProgress(
      catalogueOptimizationProgressFromJob(
        job,
        simulationData.sampleTraces.length
      )
    );
    setCatalogueOptimizationStartedAt(catalogueOptimizationJobStartedAt(job));
    setCatalogueOptimizationHeartbeat(Date.now());
    setCatalogueOptimizationStatus("processing");
  }, [
    restoreSavedSimulationIfNewer,
    simulationData.sampleTraces.length
  ]);

  const requestCatalogueOptimizationJob = useCallback(async (
    action: "cancel" | "start" | "status",
    requestKey: string,
    options?: Readonly<{ forceRestart?: boolean }>
  ) => {
    const response = await fetch(catalogueOptimizationJobUrl, {
      body: JSON.stringify({
        accessToken,
        action,
        cacheKey: requestKey,
        ...(action === "start" && options?.forceRestart
          ? { forceRestart: true }
          : {}),
        includePendingReviewProducts:
          includeReviewPriorityProductsInCatalogueOptimization,
        ...(action === "start" ? { simulationData } : {})
      }),
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { "x-admin-dashboard-token": accessToken } : {})
      },
      method: "POST"
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      job?: AdminCatalogueOptimizationJobView | null;
    };

    if (!response.ok) {
      throw new Error(
        payload.error ?? `Optimum basket request failed (${response.status})`
      );
    }

    return payload.job ?? null;
  }, [
    accessToken,
    catalogueOptimizationJobUrl,
    includeReviewPriorityProductsInCatalogueOptimization,
    simulationData
  ]);

  useEffect(() => {
    runningRef.current = running || demandGenerating;
  }, [demandGenerating, running]);

  useEffect(() => {
    simulationDataRef.current = simulationData;
  }, [simulationData]);

  useEffect(() => {
    if (
      currentCatalogueOptimizationStatus !== "processing" ||
      catalogueOptimizationStartedAt === null
    ) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setCatalogueOptimizationHeartbeat(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [catalogueOptimizationStartedAt, currentCatalogueOptimizationStatus]);

  useEffect(() => {
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      if (
        cancelled ||
        !productOptimisationMode ||
        includeReviewPriorityProductsInCatalogueOptimization ||
        running ||
        demandGenerating ||
        catalogueOptimizationStatus === "processing" ||
        !productOptimisationSimulationComplete ||
        catalogueOptimizationResetKey === catalogueOptimizationRunKey ||
        catalogueOptimizationKey === catalogueOptimizationRunKey
      ) {
        return;
      }

      const savedOptimization = loadSavedCatalogueOptimization(
        catalogueOptimizationRunKey
      );

      if (!savedOptimization) {
        return;
      }

      if (
        !catalogueOptimizationMatchesSampleSize(
          savedOptimization,
          simulationData.sampleSize
        )
      ) {
        clearSavedCatalogueOptimization(catalogueOptimizationRunKey);
        return;
      }

      setCatalogueOptimization(savedOptimization);
      setCatalogueOptimizationError(null);
      setCatalogueOptimizationKey(catalogueOptimizationRunKey);
      setCatalogueOptimizationProgress(null);
      setCatalogueOptimizationStartedAt(null);
      setCatalogueOptimizationStatus("ready");
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    catalogueOptimizationKey,
    catalogueOptimizationResetKey,
    catalogueOptimizationRunKey,
    catalogueOptimizationStatus,
    demandGenerating,
    includeReviewPriorityProductsInCatalogueOptimization,
    productOptimisationMode,
    productOptimisationSimulationComplete,
    running,
    simulationData.sampleSize,
    simulationData.sampleTraces.length
  ]);

  useEffect(() => {
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      if (
        cancelled ||
        !productOptimisationMode ||
        running ||
        demandGenerating ||
        !productOptimisationSimulationComplete ||
        catalogueOptimizationResetKey === catalogueOptimizationRunKey
      ) {
        return;
      }

      void requestCatalogueOptimizationJob("status", catalogueOptimizationRunKey)
        .then((job) => {
          if (!cancelled && job) {
            applyCatalogueOptimizationJob(job, catalogueOptimizationRunKey);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setCatalogueOptimizationCachedProgress(null);
          }
        });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    applyCatalogueOptimizationJob,
    catalogueOptimizationResetKey,
    catalogueOptimizationRunKey,
    demandGenerating,
    productOptimisationMode,
    productOptimisationSimulationComplete,
    requestCatalogueOptimizationJob,
    running,
    simulationData.sampleSize,
    simulationData.sampleTraces.length
  ]);

  useEffect(() => {
    if (
      currentCatalogueOptimizationStatus !== "processing" ||
      !productOptimisationMode ||
      catalogueOptimizationKey !== catalogueOptimizationRunKey
    ) {
      return;
    }

    let cancelled = false;
    const pollJob = () => {
      void requestCatalogueOptimizationJob("status", catalogueOptimizationRunKey)
        .then((job) => {
          if (!cancelled) {
            applyCatalogueOptimizationJob(job, catalogueOptimizationRunKey);
          }
        })
        .catch((error) => {
          if (!cancelled) {
            setCatalogueOptimizationError(
              error instanceof Error
                ? error.message
                : "Unable to check optimum basket job"
            );
          }
        });
    };
    const intervalId = window.setInterval(pollJob, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    applyCatalogueOptimizationJob,
    catalogueOptimizationKey,
    catalogueOptimizationRunKey,
    currentCatalogueOptimizationStatus,
    productOptimisationMode,
    requestCatalogueOptimizationJob
  ]);

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
      const sameSelectedCountry =
        normalizedSimulatorCountryCode(data.countryCode) === selectedCountryCode;
      const shouldReplaceVisibleData = !hydrated || !sameSelectedCountry;
      const loadingData =
        sameSelectedCountry
          ? data
          : emptyAdminPlanCoverageSimulationData({
              countryCode: selectedCountryCode,
              databaseAvailable: data.databaseAvailable,
              seed: data.seed
            });

      if (shouldReplaceVisibleData) {
        setInputStatus("loading");
      }
      setInputError(null);

      if (shouldReplaceVisibleData) {
        setInputData(loadingData);
        const loadingSimulationData = initialSimulationData(loadingData);

        simulationDataRef.current = loadingSimulationData;
        setSimulationData(loadingSimulationData);
        runnerRef.current = null;
        runnerInputKeyRef.current = null;
      }
      setHydrated((current) =>
        shouldReplaceVisibleData ? current && sameSelectedCountry : current
      );
      setRunning(false);

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
          if (shouldReplaceVisibleData) {
            setInputData(payload);
          }
          setInputStatus("ready");
        })
        .catch((error) => {
          if (cancelled) {
            return;
          }

          if (requestTimeoutId !== null) {
            window.clearTimeout(requestTimeoutId);
          }
          if (shouldReplaceVisibleData) {
            setInputData(emptyAdminPlanCoverageSimulationData({
              countryCode: selectedCountryCode,
              databaseAvailable: false,
              seed: data.seed
            }));
            setInputStatus("error");
          } else {
            setInputStatus("ready");
          }
          setInputError(
            requestTimedOut
              ? "Simulator input request timed out. Try again."
              : simulatorInputErrorMessage(error)
          );
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
  }, [accessToken, data, hydrated, inputRefreshNonce, range, selectedCountryCode]);

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
        runnerInputKeyRef.current = null;
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
        if (!hydrated) {
          runnerRef.current = null;
        }
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
      const currentRunner = runnerRef.current;
      const currentSampleSize =
        runnerInputKeyRef.current === inputKey && currentRunner
          ? Math.max(simulationDataRef.current.sampleSize, currentRunner.sampleSize)
          : simulationDataRef.current.sampleSize;

      if (savedState) {
        const savedRunner = runnerFromSavedState(activeInputData, savedState);

        if (
          runnerInputKeyRef.current === inputKey &&
          currentRunner &&
          currentSampleSize > savedRunner.sampleSize
        ) {
          preserveLatestSimulationState(
            adminPlanCoverageSimulationDataFromRunner(currentRunner),
            currentRunner
          );
        } else {
          preserveLatestSimulationState(
            adminPlanCoverageSimulationDataFromRunner(savedRunner),
            savedRunner
          );
        }
      } else {
        const runner = createAdminPlanCoverageSimulationRunner({
          ...activeInputData.input,
          reviewPriorityProducts: activeInputData.reviewPriorityProducts
        });

        if (
          runnerInputKeyRef.current === inputKey &&
          currentRunner &&
          currentSampleSize > 0
        ) {
          preserveLatestSimulationState(
            adminPlanCoverageSimulationDataFromRunner(currentRunner),
            currentRunner
          );
        } else {
          preserveLatestSimulationState(initialSimulationData(activeInputData), runner);
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
    hydrated,
    inputKey,
    inputStatus,
    preserveLatestSimulationState,
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
    runnerInputKeyRef.current = inputKey;

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
          runnerInputKeyRef.current = inputKey;
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

        preserveLatestSimulationState(nextData, runner);
        saveSimulationState(inputKey, runner, { demandKey });

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
    const requestKey = catalogueOptimizationKey;

    if (
      catalogueOptimizationStatus === "processing" &&
      requestKey
    ) {
      void requestCatalogueOptimizationJob("cancel", requestKey)
        .then((job) => applyCatalogueOptimizationJob(job, requestKey))
        .catch(() => {
          // The local UI can stop even if the shared cancellation request fails.
        });
    }

    setCatalogueOptimizationProgress(null);
    setCatalogueOptimizationStartedAt(null);
    setCatalogueOptimizationCachedProgress(null);

    if (catalogueOptimizationStatus === "processing") {
      setCatalogueOptimizationStatus("idle");
    }
  }

  function clearCatalogueOptimization(options?: Readonly<{
    cacheKey?: string;
    clearSaved?: boolean;
  }>) {
    if (options?.clearSaved) {
      clearSavedCatalogueOptimization(options.cacheKey);
    }

    setCatalogueOptimization(null);
    setCatalogueOptimizationError(null);
    setCatalogueOptimizationKey(null);
    setCatalogueOptimizationProgress(null);
    setCatalogueOptimizationStartedAt(null);
    setCatalogueOptimizationCachedProgress(null);
    setCatalogueOptimizationJob(null);
    catalogueOptimizationResetKeyRef.current = null;
    setCatalogueOptimizationResetKey(null);
    setCatalogueOptimizationStatus("idle");
  }

  async function calculateCatalogueOptimization(options?: Readonly<{
    forceRestart?: boolean;
    ignoreProcessing?: boolean;
  }>) {
    if (
      (!options?.ignoreProcessing && catalogueOptimizationStatus === "processing") ||
      running ||
      demandGenerating ||
      !productOptimisationSimulationComplete
    ) {
      return;
    }

    const requestKey = catalogueOptimizationRunKey;

    catalogueOptimizationResetKeyRef.current = null;
    setCatalogueOptimizationResetKey(null);

    if (options?.forceRestart) {
      clearSavedCatalogueOptimization(requestKey);
    }

    setCatalogueOptimization(null);
    setCatalogueOptimizationError(null);
    setCatalogueOptimizationKey(requestKey);
    setCatalogueOptimizationProgress({
      current: 0,
      label: "Starting shared optimum basket job",
      stage: "validating",
      total: Math.max(1, simulationData.sampleTraces.length)
    });
    setCatalogueOptimizationCachedProgress({
      cacheKey: requestKey,
      candidateCount: 0,
      current: 0,
      savedAt: new Date().toISOString(),
      total: Math.max(1, simulationData.sampleTraces.length)
    });
    setCatalogueOptimizationStartedAt(Date.now());
    setCatalogueOptimizationHeartbeat(Date.now());
    setCatalogueOptimizationStatus("processing");

    try {
      const job = await requestCatalogueOptimizationJob(
        "start",
        requestKey,
        { forceRestart: options?.forceRestart }
      );
      applyCatalogueOptimizationJob(job, requestKey);
    } catch (error) {
      setCatalogueOptimization(null);
      setCatalogueOptimizationError(
        error instanceof Error
          ? error.message
          : "Unable to calculate optimum basket"
      );
      setCatalogueOptimizationProgress(null);
      setCatalogueOptimizationStartedAt(null);
      setCatalogueOptimizationStatus("idle");
    }
  }

  function resetCatalogueOptimization() {
    clearCatalogueOptimization({
      cacheKey: catalogueOptimizationRunKey,
      clearSaved: true
    });
    catalogueOptimizationResetKeyRef.current = catalogueOptimizationRunKey;
    setCatalogueOptimizationResetKey(catalogueOptimizationRunKey);
  }

  function recalculateCatalogueOptimization() {
    void calculateCatalogueOptimization({ forceRestart: true });
  }

  function restartQueuedCatalogueOptimization() {
    void calculateCatalogueOptimization({
      forceRestart: true,
      ignoreProcessing: true
    });
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
    clearCatalogueOptimization({ clearSaved: true });
    clearSavedSimulationState();
    setNextMovesClearedKey(null);

    const runner = activeInputData.databaseAvailable
      ? createAdminPlanCoverageSimulationRunner({
          ...activeInputData.input,
          reviewPriorityProducts: activeInputData.reviewPriorityProducts
        })
      : null;

    runnerRef.current = runner;
    runnerInputKeyRef.current = runner ? inputKey : null;
    const nextData = initialSimulationData(activeInputData);

    simulationDataRef.current = nextData;
    setSimulationData(nextData);
    setHydrated(true);
  }

  function clearDemandProfiles() {
    stopSimulation();
    clearCatalogueOptimization({ clearSaved: true });
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
    runnerInputKeyRef.current = runnerRef.current ? inputKey : null;
    const nextData = initialSimulationData({
      ...activeInputData,
      input: {
        ...activeInputData.input,
        demandProfiles: []
      }
    });

    simulationDataRef.current = nextData;
    setSimulationData(nextData);
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
    updateSimulatorCountryUrl(normalizedCountryCode, mode);
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
          <h2 className="text-lg font-bold text-slate-950">
            {productOptimisationMode
              ? "Product optimisation run"
              : "Plan coverage projection"}
          </h2>
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
        catalogueOptimizationProgress={
          productOptimisationMode ? currentCatalogueOptimizationProgress : null
        }
        catalogueOptimizationStatus={
          productOptimisationMode ? currentCatalogueOptimizationStatus : "idle"
        }
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

      {!productOptimisationMode ? (
        <ProductPerformanceScatter
          currency={simulationData.summary.currency}
          rows={scatterRows}
          sampleSize={simulationData.sampleSize}
        />
      ) : null}

      {!productOptimisationMode ? (
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
      ) : null}

      {!productOptimisationMode ? (
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
      ) : null}

      {productOptimisationMode ? (
        <GeneratedDemandProfilesPanel profiles={demandProfiles} />
      ) : null}

      {productOptimisationMode ? (
      <MinimumCataloguePanel
        accessToken={accessToken}
        canCalculate={
          !running &&
          !demandGenerating &&
          currentCatalogueOptimizationStatus !== "processing" &&
          productOptimisationSimulationComplete
        }
        cachedProgress={currentCatalogueOptimizationCachedProgress}
        elapsedSeconds={currentCatalogueOptimizationElapsedSeconds}
        error={catalogueOptimizationError}
        includeReviewPriorityProducts={
          includeReviewPriorityProductsInCatalogueOptimization
        }
        locale={locale}
        onCalculate={calculateCatalogueOptimization}
        onIncludeReviewPriorityProductsChange={
          setIncludeReviewPriorityProductsInCatalogueOptimization
        }
        onRecalculate={recalculateCatalogueOptimization}
        onRestartQueued={restartQueuedCatalogueOptimization}
        onReset={resetCatalogueOptimization}
        onStop={stopCatalogueOptimization}
        optimization={currentCatalogueOptimization}
        optimizationProgress={currentCatalogueOptimizationProgress}
        job={catalogueOptimizationJob}
        blocked={currentCatalogueOptimizationBlocked}
        queued={currentCatalogueOptimizationQueued}
        canRestartQueued={canRestartQueuedCatalogueOptimization}
        optimizationStatus={currentCatalogueOptimizationStatus}
        running={running || demandGenerating}
        sampleSize={simulationData.sampleSize}
      />
      ) : null}

    </div>
  );
}

export function AdminProductOptimisationView(props: Readonly<{
  accessToken: string;
  data: AdminPlanCoverageSimulationData;
  locale: Locale;
  range: AdminDashboardRange;
}>) {
  return <AdminPlanCoverageSimulatorView {...props} mode="optimisation" />;
}
