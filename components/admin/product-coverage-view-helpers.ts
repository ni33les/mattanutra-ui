"use client";

/**
 * Product coverage / plan-coverage simulator pure helpers and durable storage.
 * Extracted from product-coverage-view to shrink the UI module.
 */
import type {
  AdminCatalogueOptimizationData,
  AdminCatalogueOptimizationProgress,
  AdminPlanCoverageDemandProfile,
  AdminPlanCoverageSimulationData,
  AdminPlanCoverageSimulationCheckpoint,
  AdminPlanCoverageSimulationSampleTrace,
  AdminPlanCoverageSimulationProductStats,
  AdminPlanCoverageSimulationRunner,
  AdminPlanCoverageSimulationUnmetDemandBucket,
  AdminSimulationProductUsefulnessRow,
  SupplementCoverageState,
  SyntheticPlanArchetype
} from "@/lib/admin-product-coverage";
import type { AdminDashboardRange } from "@/lib/admin-dashboard-data";
import type { Locale } from "@/lib/i18n";
import {
  defaultProductCountryCode,
  normalizeProductCountryCode
} from "@/lib/product-countries";
import {
  ADMIN_PLAN_COVERAGE_SIMULATION_MAX_SAMPLES,
  SIMULATION_ARCHETYPES,
  createAdminPlanCoverageSimulationRunner,
  emptyAdminPlanCoverageSimulationData,
  normalizeDemandProfiles,
  normalizeSyntheticPlanArchetypes,
  sanitizeDemandProfilesForSimulationSupplements
} from "@/lib/admin-product-coverage-simulation";
import type { AdminCatalogueOptimizationJobView } from "@/lib/admin-catalogue-optimization-jobs";

export const SIMULATOR_STORAGE_KEY =
  "mattanutra:admin-plan-coverage-simulator:v4";
export const SIMULATOR_ARCHETYPES_STORAGE_KEY =
  "mattanutra:admin-plan-coverage-archetypes:v1";
export const SIMULATOR_DEMAND_STORAGE_KEY =
  "mattanutra:admin-plan-coverage-demand-profiles:v1";
export const SIMULATOR_OPTIMIZATION_STORAGE_KEY =
  "mattanutra:admin-plan-coverage-catalogue-optimization:v1";
export const SIMULATOR_DURABLE_DB_NAME =
  "mattanutra-admin-product-coverage";
export const SIMULATOR_DURABLE_STORE_NAME = "entries";
export const SIMULATOR_DURABLE_SIMULATION_PREFIX = "simulation:";
export const SIMULATOR_DURABLE_OPTIMIZATION_PREFIX = "optimization:";
export const SIMULATOR_INPUT_TIMEOUT_MS = 30_000;

export type ArchetypeDraft = Readonly<{
  clientSex: "" | "female" | "male";
  description: string;
  goals: string;
  id: string;
  medications: string;
  name: string;
  needCount: string;
  preferredSupplementNames: string;
}>;

export type SavedSimulationState = Readonly<{
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

export type SavedDemandProfilesEntry = Readonly<{
  demandKey: string;
  savedAt?: string;
  profiles: readonly AdminPlanCoverageDemandProfile[];
}>;

export type SavedDemandProfilesState = Readonly<{
  demandKey?: string;
  entries?: readonly SavedDemandProfilesEntry[];
  profiles?: readonly AdminPlanCoverageDemandProfile[];
  savedAt?: string;
  version: 1 | 2 | 3;
}>;

export type SavedCatalogueOptimizationEntry = Readonly<{
  baseCacheKey?: string;
  cacheKey: string;
  optimization: AdminCatalogueOptimizationData;
  savedAt: string;
}>;

export type SavedCatalogueOptimizationState = Readonly<{
  entries: readonly SavedCatalogueOptimizationEntry[];
  version: 1 | 2;
}>;

export type SimulatorDurableEntry = Readonly<{
  key: string;
  savedAt: string;
  value: unknown;
}>;

export type CatalogueOptimizationCachedProgress = Readonly<{
  cacheKey: string;
  candidateCount: number;
  current: number;
  savedAt: string;
  total: number;
}>;

export type SimulatorInputStatus = "error" | "loading" | "ready";
export type SimulatorClearTarget = "all" | "profiles" | "results";
export type CatalogueOptimizationStatus = "blocked" | "idle" | "processing" | "ready";
export type PlanCoverageSimulatorMode = "optimisation" | "simulator";
export type SimulatorProgressDisplay = Readonly<{
  current: number;
  total: number;
}>;
export type DemandProfileCacheStatus = "answers_hit" | "hit" | "miss";
export type DemandProfileCacheSummary = Readonly<{
  cachedCount: number;
  generatedThisRun: number;
  restoring: boolean;
}>;
export type DemandProfileCacheBatchResponse = Readonly<{
  cache?: Readonly<{
    answerHitSampleIndexes?: readonly number[];
    demandKey?: string;
    questionnaireKey?: string;
    requestedSamples?: number;
    totalCached?: number;
  }>;
  missingSampleIndexes?: readonly number[];
  profiles?: readonly AdminPlanCoverageDemandProfile[];
}>;
export type DemandProfileResponse = Readonly<{
  cache?: Readonly<{
    demandKey?: string;
    questionnaireKey?: string;
    status?: DemandProfileCacheStatus;
  }>;
  profile?: AdminPlanCoverageDemandProfile;
}>;

export function numberText(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function emptyDemandProfileCacheSummary(): DemandProfileCacheSummary {
  return {
    cachedCount: 0,
    generatedThisRun: 0,
    restoring: false
  };
}

export function allDemandProfileSampleIndexes() {
  return Array.from(
    { length: ADMIN_PLAN_COVERAGE_SIMULATION_MAX_SAMPLES },
    (_, index) => index
  );
}

export function percentText(value: number) {
  return `${numberText(value)}%`;
}

export function durationText(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;

  if (minutes < 1) {
    return `${remainder}s`;
  }

  return `${minutes}m ${remainder.toString().padStart(2, "0")}s`;
}

export function dateTimeText(value: string, locale: Locale) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

export function compactListText(values: readonly string[]) {
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

export function moneyText(amount: number | null, currency: string) {
  if (amount === null) {
    return "No price";
  }

  return new Intl.NumberFormat("en-US", {
    currency,
    maximumFractionDigits: 0,
    style: "currency"
  }).format(amount);
}

export function amountText(amount: number | null) {
  if (amount === null) {
    return "No price";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0
  }).format(amount);
}

export function normalizedSimulatorCountryCode(value: string | null | undefined) {
  return normalizeProductCountryCode(value) ?? defaultProductCountryCode;
}

export function updateSimulatorCountryUrl(
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

export function hashText(value: string) {
  let hash = 2166136261;

  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

export function simulatorDurableStorageAvailable() {
  return typeof window !== "undefined" && "indexedDB" in window;
}

export function openSimulatorDurableDb() {
  return new Promise<IDBDatabase | null>((resolve) => {
    if (!simulatorDurableStorageAvailable()) {
      resolve(null);
      return;
    }

    const request = window.indexedDB.open(SIMULATOR_DURABLE_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(SIMULATOR_DURABLE_STORE_NAME)) {
        db.createObjectStore(SIMULATOR_DURABLE_STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

export async function writeSimulatorDurableEntry(key: string, value: unknown) {
  const db = await openSimulatorDurableDb();

  if (!db) {
    return false;
  }

  return new Promise<boolean>((resolve) => {
    const transaction = db.transaction(SIMULATOR_DURABLE_STORE_NAME, "readwrite");
    const store = transaction.objectStore(SIMULATOR_DURABLE_STORE_NAME);

    store.put({
      key,
      savedAt: new Date().toISOString(),
      value
    } satisfies SimulatorDurableEntry);

    transaction.oncomplete = () => {
      db.close();
      resolve(true);
    };
    transaction.onerror = () => {
      db.close();
      resolve(false);
    };
    transaction.onabort = () => {
      db.close();
      resolve(false);
    };
  });
}

export async function readSimulatorDurableEntry<T>(key: string) {
  const db = await openSimulatorDurableDb();

  if (!db) {
    return null;
  }

  return new Promise<T | null>((resolve) => {
    const transaction = db.transaction(SIMULATOR_DURABLE_STORE_NAME, "readonly");
    const store = transaction.objectStore(SIMULATOR_DURABLE_STORE_NAME);
    const request = store.get(key);

    request.onsuccess = () => {
      const entry = request.result as SimulatorDurableEntry | undefined;

      db.close();
      resolve(entry ? entry.value as T : null);
    };
    request.onerror = () => {
      db.close();
      resolve(null);
    };
    transaction.onerror = () => {
      db.close();
      resolve(null);
    };
  });
}

export async function deleteSimulatorDurableEntry(key: string) {
  const db = await openSimulatorDurableDb();

  if (!db) {
    return;
  }

  await new Promise<void>((resolve) => {
    const transaction = db.transaction(SIMULATOR_DURABLE_STORE_NAME, "readwrite");
    const store = transaction.objectStore(SIMULATOR_DURABLE_STORE_NAME);

    store.delete(key);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      resolve();
    };
    transaction.onabort = () => {
      db.close();
      resolve();
    };
  });
}

export async function deleteSimulatorDurableEntriesByPrefix(prefix: string) {
  const db = await openSimulatorDurableDb();

  if (!db) {
    return;
  }

  await new Promise<void>((resolve) => {
    const transaction = db.transaction(SIMULATOR_DURABLE_STORE_NAME, "readwrite");
    const store = transaction.objectStore(SIMULATOR_DURABLE_STORE_NAME);
    const request = store.openCursor();

    request.onsuccess = () => {
      const cursor = request.result;

      if (!cursor) {
        return;
      }

      if (String(cursor.key).startsWith(prefix)) {
        cursor.delete();
      }
      cursor.continue();
    };
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      resolve();
    };
    transaction.onabort = () => {
      db.close();
      resolve();
    };
  });
}

export function durableSimulationKey(inputKey: string) {
  return `${SIMULATOR_DURABLE_SIMULATION_PREFIX}${inputKey}`;
}

export function durableOptimizationKey(cacheKey: string) {
  return `${SIMULATOR_DURABLE_OPTIMIZATION_PREFIX}${cacheKey}`;
}

export function simulationInputKey(data: AdminPlanCoverageSimulationData) {
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

export function demandProfilesKey(
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

export function listText(values: readonly string[]) {
  return values.join("\n");
}

export function listFromText(value: string) {
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function draftFromArchetype(archetype: SyntheticPlanArchetype): ArchetypeDraft {
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

export function archetypeFromDraft(draft: ArchetypeDraft): SyntheticPlanArchetype {
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

export function newArchetypeDraft(): ArchetypeDraft {
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

export function loadSavedSyntheticArchetypes() {
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

export function saveSyntheticArchetypes(archetypes: readonly SyntheticPlanArchetype[]) {
  try {
    window.localStorage.setItem(
      SIMULATOR_ARCHETYPES_STORAGE_KEY,
      JSON.stringify(archetypes)
    );
  } catch {
    // Storage is a convenience; defaults remain available without it.
  }
}

export function simulationDataWithArchetypes(
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

export function saveDemandProfiles(
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

export function pruneSavedDemandProfileEntries(demandKey?: string, maxOtherEntries = 0) {
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
      .slice(0, Math.max(0, maxOtherEntries));
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

export function clearSavedDemandProfiles() {
  try {
    window.localStorage.removeItem(SIMULATOR_DEMAND_STORAGE_KEY);
  } catch {
    // Ignore private browsing or storage policy failures.
  }
}

export function savedDemandProfileEntriesFromStorage(): SavedDemandProfilesEntry[] {
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

export function loadSavedDemandProfiles(expectedDemandKey?: string) {
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

export function savedDemandProfiles(
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

export function savedStateFromRunner(
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

export function normalizedSavedSimulationState(
  value: unknown,
  inputKey: string
): SavedSimulationState | null {
  const parsed = value as Partial<SavedSimulationState> | null;

  if (
    !parsed ||
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
}

export function saveSimulationStateToDurable(state: SavedSimulationState) {
  void writeSimulatorDurableEntry(
    durableSimulationKey(state.inputKey),
    state
  );
}

export function writeSavedSimulationState(state: SavedSimulationState) {
  try {
    window.localStorage.setItem(SIMULATOR_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function saveSimulationState(
  inputKey: string,
  runner: AdminPlanCoverageSimulationRunner,
  options?: Readonly<{ demandKey?: string }>
) {
  const nextState = savedStateFromRunner(inputKey, runner);

  saveSimulationStateToDurable(nextState);

  try {
    const raw = window.localStorage.getItem(SIMULATOR_STORAGE_KEY);

    if (raw) {
      const existing = normalizedSavedSimulationState(JSON.parse(raw), inputKey);

      if (
        existing &&
        (existing.sampleTraces?.length ?? 0) >= existing.sampleSize &&
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
  pruneSavedCatalogueOptimizationEntries(0);

  if (writeSavedSimulationState(nextState)) {
    return true;
  }

  clearSavedDemandProfiles();

  return writeSavedSimulationState(nextState);
}

export function clearSavedSimulationState() {
  try {
    window.localStorage.removeItem(SIMULATOR_STORAGE_KEY);
  } catch {
    // Ignore private browsing or storage policy failures.
  }
  void deleteSimulatorDurableEntriesByPrefix(SIMULATOR_DURABLE_SIMULATION_PREFIX);
}

export function catalogueOptimizationStateFromStorage(): SavedCatalogueOptimizationState {
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

export function savedCatalogueOptimizationEntriesFromStorage() {
  return catalogueOptimizationStateFromStorage().entries;
}

export function loadSavedCatalogueOptimization(cacheKey: string) {
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

export function normalizedSavedCatalogueOptimization(value: unknown) {
  return value &&
    typeof value === "object" &&
    (value as AdminCatalogueOptimizationData).status === "ready"
    ? value as AdminCatalogueOptimizationData
    : null;
}

export async function loadSavedCatalogueOptimizationFromDurable(cacheKey: string) {
  const saved = await readSimulatorDurableEntry<AdminCatalogueOptimizationData>(
    durableOptimizationKey(cacheKey)
  );

  return normalizedSavedCatalogueOptimization(saved);
}

export function catalogueOptimizationMatchesSampleSize(
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

export function saveCatalogueOptimization(
  cacheKey: string,
  optimization: AdminCatalogueOptimizationData,
  options?: Readonly<{ baseCacheKey?: string | null }>
) {
  void writeSimulatorDurableEntry(durableOptimizationKey(cacheKey), optimization);

  try {
    const state = catalogueOptimizationStateFromStorage();
    const baseCacheKey = options?.baseCacheKey?.trim() || undefined;

    if (baseCacheKey) {
      void writeSimulatorDurableEntry(
        durableOptimizationKey(baseCacheKey),
        optimization
      );
    }

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

export function pruneSavedCatalogueOptimizationEntries(maxEntries = 1) {
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

export function clearSavedCatalogueOptimization(cacheKey?: string) {
  try {
    if (!cacheKey) {
      window.localStorage.removeItem(SIMULATOR_OPTIMIZATION_STORAGE_KEY);
      void deleteSimulatorDurableEntriesByPrefix(
        SIMULATOR_DURABLE_OPTIMIZATION_PREFIX
      );
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
    void deleteSimulatorDurableEntry(durableOptimizationKey(cacheKey));
  } catch {
    // Ignore private browsing or storage policy failures.
  }
}

export function loadSavedSimulationState(inputKey: string) {
  try {
    const raw = window.localStorage.getItem(SIMULATOR_STORAGE_KEY);

    if (!raw) {
      return null;
    }

    return normalizedSavedSimulationState(JSON.parse(raw), inputKey);
  } catch {
    return null;
  }
}

export async function loadSavedSimulationStateFromDurable(inputKey: string) {
  const saved = await readSimulatorDurableEntry<SavedSimulationState>(
    durableSimulationKey(inputKey)
  );

  return normalizedSavedSimulationState(saved, inputKey);
}

export function runnerFromSavedState(
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

export function initialSimulationData(data: AdminPlanCoverageSimulationData) {
  return emptyAdminPlanCoverageSimulationData({
    ...data.input,
    databaseAvailable: data.databaseAvailable,
    realCustomerArchetypes: data.realCustomerArchetypes,
    realCustomerProfileCount: data.realCustomerProfileCount,
    realCustomerProfiles: data.realCustomerProfiles,
    reviewPriorityProducts: data.reviewPriorityProducts
  });
}

export function simulatorInputReady(data: AdminPlanCoverageSimulationData) {
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

export function productResultRows(
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

export type ProductPerformancePriceBand = "high" | "low" | "mid" | "unknown";

export type ProductPerformanceScatterRow = AdminSimulationProductUsefulnessRow &
  Readonly<{
    chosenRatePercent: number;
    priceBand: ProductPerformancePriceBand;
  }>;

export function priceBandClassName(band: ProductPerformancePriceBand) {
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

export function priceBandLabel(band: ProductPerformancePriceBand) {
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

export function productScatterRows(
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

export function safeUiPercent(value: number) {
  return Number.isFinite(value) ? Math.round(value) : 0;
}

export function waitForNextSample() {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, 24);
  });
}

export function simulatorInputErrorMessage(error: unknown) {
  if (
    error instanceof DOMException &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  ) {
    return "Simulator input request timed out. Try again.";
  }

  return error instanceof Error ? error.message : "Unknown input error";
}

export function runnerWithDemandProfiles(
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

export function productDetailHref(
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

export function simulatorInputHref(
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

export function demandProfileHref(accessToken: string) {
  const params = new URLSearchParams();

  if (accessToken) {
    params.set("access_token", accessToken);
  }

  const suffix = params.toString();

  return `/api/admin/product-coverage/demand-profile${suffix ? `?${suffix}` : ""}`;
}

export function demandProfilesHref(accessToken: string) {
  const params = new URLSearchParams();

  if (accessToken) {
    params.set("access_token", accessToken);
  }

  const suffix = params.toString();

  return `/api/admin/product-coverage/demand-profiles${suffix ? `?${suffix}` : ""}`;
}

export function catalogueOptimizationJobHref(accessToken: string) {
  const params = new URLSearchParams();

  if (accessToken) {
    params.set("access_token", accessToken);
  }

  const suffix = params.toString();

  return `/api/admin/product-coverage/catalogue-optimization/jobs${suffix ? `?${suffix}` : ""}`;
}

export function catalogueOptimizationJobCachedProgress(
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

export function catalogueOptimizationProgressFromJob(
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

export function timestampMillis(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);

  return Number.isFinite(parsed) ? parsed : null;
}

export function catalogueOptimizationJobStartedAt(
  job: AdminCatalogueOptimizationJobView
) {
  const parsed = timestampMillis(job.startedAt ?? job.createdAt);

  return parsed ?? Date.now();
}

export function stateLabel(state: SupplementCoverageState) {
  if (state === "covered") {
    return "Covered";
  }

  if (state === "pending_review") {
    return "Pending review";
  }

  return state === "dirty" ? "Dirty data" : "Missing";
}

export function stateClassName(state: SupplementCoverageState) {
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
