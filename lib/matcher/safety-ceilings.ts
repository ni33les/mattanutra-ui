import type {
  LifeStage,
  MatcherUnit,
  SafetyCeiling,
  SafetyLimitLifeStage,
  SafetySourceScope
} from "@/lib/matcher/types";
import { MATCHER_SOURCE_SCOPE } from "@/lib/matcher/types";

export type SafetyProfile = Readonly<{
  ageYears: number;
  lifeStage: LifeStage;
}>;

export function parseAdminLimitUnit(value: string): MatcherUnit | null {
  const lower = value
    .trim()
    .toLowerCase()
    .replace(/µ/g, "u")
    .replace(/μ/g, "u");

  if (!lower || lower.startsWith("exclude") || lower === "custom") {
    return null;
  }

  const daily = lower.replace(/\s*\/\s*day\b.*$/, "").trim();
  const token = daily.split(/\s+/)[0] ?? "";

  if (token === "mg") {
    return "mg";
  }

  if (token === "mcg" || token === "ug") {
    return "mcg";
  }

  if (token === "g") {
    return "g";
  }

  if (token === "iu") {
    return "IU";
  }

  if (token === "ml") {
    return "ml";
  }

  if (token === "serving") {
    return "serving";
  }

  if (token === "cfu") {
    return "CFU";
  }

  return null;
}

/** Decode a complete reference quantity; a scaled CFU label cannot be parsed as a unit alone. */
export function parseAdminLimitDose(amount: number, value: string): { amount: number; unit: MatcherUnit } | null {
  const scaledCfu = value.trim().match(/^(million|billion)\s+CFU(?:\s*\/\s*day)?$/i);
  const unit = scaledCfu ? "CFU" : parseAdminLimitUnit(value);
  const normalizedAmount = amount * (scaledCfu ? scaledCfu[1].toLowerCase() === "billion" ? 1_000_000_000 : 1_000_000 : 1);
  if (!unit || !Number.isFinite(normalizedAmount) || normalizedAmount <= 0 || normalizedAmount > Number.MAX_SAFE_INTEGER) return null;
  return { amount: normalizedAmount, unit };
}

export type SafetyReferenceIdentity = Readonly<{ runtimeRevision: number; fingerprint: string }>;
export type MatcherSafetySnapshot = Readonly<{
  version: 1; ceilings: readonly SafetyCeiling[]; identity: SafetyReferenceIdentity | null; unavailable: boolean;
}>;
// The browser matcher uses the same pure fact readers. Server callers install
// their request-local accessor without importing Node runtime APIs here.
let readReferenceScope: (() => MatcherSafetySnapshot | undefined) | undefined;
export function installMatcherSafetyScope(reader: () => MatcherSafetySnapshot | undefined) {
  readReferenceScope = reader;
}
const referenceSnapshots = new Map<number, MatcherSafetySnapshot>();
let cached: { at: number; ceilings: SafetyCeiling[]; referenceIdentity: SafetyReferenceIdentity | null } | null = null;
let unavailable = false;

export function immutableReferences(value: MatcherSafetySnapshot): MatcherSafetySnapshot {
  if (value.version !== 1) throw new Error("Unsupported immutable safety reference snapshot");
  return Object.freeze({ ...value, identity: value.identity ? Object.freeze({ ...value.identity }) : null,
    ceilings: Object.freeze(value.ceilings.map(item => Object.freeze({ ...item }))) });
}

export function captureMatcherSafetySnapshot(runtimeRevision?: number): MatcherSafetySnapshot {
  const scoped = readReferenceScope?.();
  if (scoped && (runtimeRevision === undefined || scoped.identity?.runtimeRevision === runtimeRevision)) return scoped;
  const snapshot = runtimeRevision === undefined ? immutableReferences({ version: 1, ceilings: cached?.ceilings ?? [],
    identity: cached?.referenceIdentity ?? null, unavailable: matcherSafetyCeilingsUnavailable() }) : referenceSnapshots.get(runtimeRevision);
  if (!snapshot) throw new Error("Immutable safety reference snapshot is unavailable for the catalogue revision");
  return snapshot;
}

export function setMatcherSafetyCeilings(ceilings: readonly SafetyCeiling[], referenceIdentity: SafetyReferenceIdentity | null = null) {
  const snapshot = immutableReferences({ version: 1, ceilings, identity: referenceIdentity, unavailable: false });
  cached = { at: Date.now(), ceilings: snapshot.ceilings as SafetyCeiling[], referenceIdentity: snapshot.identity };
  if (referenceIdentity) {
    referenceSnapshots.set(referenceIdentity.runtimeRevision, snapshot);
    while (referenceSnapshots.size > 32) referenceSnapshots.delete(referenceSnapshots.keys().next().value!);
  }
  unavailable = false;
}

export function setMatcherSafetyCeilingsUnavailable() {
  unavailable = true;
}

export function matcherSafetyCeilingsUnavailable() {
  return readReferenceScope?.()?.unavailable ?? (unavailable && (cached?.ceilings.length ?? 0) < 1);
}

export function matcherSafetyCeilings() {
  return readReferenceScope?.()?.ceilings as SafetyCeiling[] | undefined ?? cached?.ceilings ?? [];
}

export function matcherSafetyCeilingsCachedAt() {
  return cached?.at ?? 0;
}

export function matcherSafetyReferenceIdentity() {
  const scoped = readReferenceScope?.();
  return scoped ? scoped.identity : cached?.referenceIdentity ?? null;
}

export function resetMatcherSafetyCeilings() {
  cached = null;
  referenceSnapshots.clear();
  unavailable = false;
}

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function identityKeys(subjectId: string) {
  const raw = subjectId.trim().toLowerCase();
  return [raw, raw.replace(/^supplement:/, ""), raw.replace(/^sup_/, "")];
}

function bandKey(
  subjectId: string,
  lifeStage: SafetyLimitLifeStage,
  sourceScope: SafetySourceScope
) {
  return `${subjectId.trim().toLowerCase()}::${lifeStage}::${sourceScope}`;
}

type CeilingIndex = {
  ambiguous: Set<string>;
  byBand: Map<string, SafetyCeiling>;
  subjectIds: Set<string>;
  names: Set<string>;
};

const ceilingIndexCache = new WeakMap<object, CeilingIndex>();

function resolvedLifeStage(item: SafetyCeiling): SafetyLimitLifeStage {
  return item.lifeStage ?? "adult";
}

function resolvedSourceScope(item: SafetyCeiling): SafetySourceScope {
  return item.sourceScope ?? MATCHER_SOURCE_SCOPE;
}

function indexCeilings(ceilings: readonly SafetyCeiling[]): CeilingIndex {
  const cachedIndex = ceilingIndexCache.get(ceilings as object);

  if (cachedIndex) {
    return cachedIndex;
  }

  const byBand = new Map<string, SafetyCeiling>();
  const ambiguous = new Set<string>();
  const subjectIds = new Set<string>();
  const names = new Set<string>();

  const remember = (key: string, item: SafetyCeiling) => {
    const previous = byBand.get(key);
    if (
      previous &&
      (previous.bandId !== item.bandId ||
        previous.maxAmount !== item.maxAmount ||
        previous.maxUnit !== item.maxUnit)
    ) {
      ambiguous.add(key);
    }
    byBand.set(key, item);
  };

  for (const item of ceilings) {
    const lifeStage = resolvedLifeStage(item);
    const sourceScope = resolvedSourceScope(item);
    const name = normalizeName(item.name);

    for (const id of identityKeys(item.subjectId)) {
      subjectIds.add(id);
      remember(bandKey(id, lifeStage, sourceScope), item);
    }

    if (name) {
      names.add(name);
      remember(bandKey(`name:${name}`, lifeStage, sourceScope), item);
    }
  }

  const index = { ambiguous, byBand, names, subjectIds };
  ceilingIndexCache.set(ceilings as object, index);
  return index;
}

export function isPediatricSafetyProfile(
  profile?: SafetyProfile | null
): boolean {
  if (!profile) {
    return false;
  }

  return profile.lifeStage === "child" || profile.ageYears < 9;
}

export function catalogLifeStageFor(
  profile?: SafetyProfile | null
): SafetyLimitLifeStage {
  if (!profile) {
    return "adult";
  }

  if (profile.lifeStage === "pregnant") {
    return "pregnant";
  }

  if (profile.lifeStage === "breastfeeding") {
    return "breastfeeding";
  }

  const ageYears = profile.ageYears;
  const pediatric = profile.lifeStage === "child" || ageYears < 19;

  if (pediatric) {
    if (ageYears <= 3) {
      return "child_1_3";
    }

    if (ageYears <= 8) {
      return "child_4_8";
    }

    if (ageYears <= 13) {
      return "child_9_13";
    }

    if (ageYears <= 18) {
      return "adolescent_14_18";
    }
  }

  return "adult";
}

function catalogCeilingFor(
  ceilings: readonly SafetyCeiling[],
  input: Readonly<{ name?: string; subjectId: string }>,
  lifeStage: SafetyLimitLifeStage,
  sourceScope: SafetySourceScope
): SafetyCeiling | null {
  if (ceilings.length < 1) {
    return null;
  }

  const index = indexCeilings(ceilings);

  for (const id of identityKeys(input.subjectId)) {
    const key = bandKey(id, lifeStage, sourceScope);
    if (index.ambiguous.has(key)) {
      return null;
    }
    const found = index.byBand.get(key);

    if (found) {
      return found;
    }
  }

  const name = normalizeName(input.name ?? "");
  if (!name) {
    return null;
  }
  const nameKey = bandKey(`name:${name}`, lifeStage, sourceScope);
  if (index.ambiguous.has(nameKey)) {
    return null;
  }
  return index.byBand.get(nameKey) ?? null;
}

export function catalogSubjectHasCeiling(
  ceilings: readonly SafetyCeiling[],
  input: Readonly<{ name?: string; subjectId: string }>
) {
  if (ceilings.length < 1) {
    return false;
  }

  const index = indexCeilings(ceilings);

  if (identityKeys(input.subjectId).some((id) => index.subjectIds.has(id))) {
    return true;
  }

  const name = normalizeName(input.name ?? "");
  return Boolean(name && index.names.has(name));
}

export function adultPolicyCeilingExists(
  ceilings: readonly SafetyCeiling[],
  input: Readonly<{ name?: string; subjectId: string }>
) {
  return catalogSubjectHasCeiling(ceilings, input);
}

export function safetyCeilingFor(
  ceilings: readonly SafetyCeiling[],
  input: Readonly<{
    conditionCodes?: readonly string[] | null;
    name?: string;
    profile?: SafetyProfile | null;
    subjectId: string;
    sourceScope?: SafetySourceScope;
  }>
) {
  const lifeStage = catalogLifeStageFor(input.profile);
  return catalogCeilingFor(
    ceilings,
    input,
    lifeStage,
    input.sourceScope ?? MATCHER_SOURCE_SCOPE
  );
}

export function catalogBandRuleId(ceiling: SafetyCeiling | null | undefined) {
  const id = ceiling?.bandId?.trim();
  return id ? id : null;
}

export function catalogBandRulesVersion(ceiling: SafetyCeiling | null | undefined) {
  const version = ceiling?.bandVersion;
  return typeof version === "number" && Number.isInteger(version) && version > 0
    ? String(version)
    : null;
}
