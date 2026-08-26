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

let cached: { at: number; ceilings: SafetyCeiling[] } | null = null;
let unavailable = false;

export function setMatcherSafetyCeilings(ceilings: readonly SafetyCeiling[]) {
  cached = { at: Date.now(), ceilings: [...ceilings] };
  unavailable = false;
}

export function setMatcherSafetyCeilingsUnavailable() {
  unavailable = true;
}

export function matcherSafetyCeilingsUnavailable() {
  return unavailable && (cached?.ceilings.length ?? 0) < 1;
}

export function matcherSafetyCeilings() {
  return cached?.ceilings ?? [];
}

export function matcherSafetyCeilingsCachedAt() {
  return cached?.at ?? 0;
}

export function resetMatcherSafetyCeilings() {
  cached = null;
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
  const subjectIds = new Set<string>();
  const names = new Set<string>();

  for (const item of ceilings) {
    const lifeStage = resolvedLifeStage(item);
    const sourceScope = resolvedSourceScope(item);
    const name = normalizeName(item.name);

    for (const id of identityKeys(item.subjectId)) {
      subjectIds.add(id);
      byBand.set(bandKey(id, lifeStage, sourceScope), item);
    }

    if (name) {
      names.add(name);
      byBand.set(bandKey(`name:${name}`, lifeStage, sourceScope), item);
    }
  }

  const index = { byBand, names, subjectIds };
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
  const pediatric = profile.lifeStage === "child" || ageYears < 9;

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
    const found = index.byBand.get(bandKey(id, lifeStage, sourceScope));

    if (found) {
      return found;
    }
  }

  const name = normalizeName(input.name ?? "");
  return name
    ? index.byBand.get(bandKey(`name:${name}`, lifeStage, sourceScope)) ?? null
    : null;
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
    name?: string;
    profile?: SafetyProfile | null;
    subjectId: string;
  }>
) {
  const lifeStage = catalogLifeStageFor(input.profile);
  return catalogCeilingFor(
    ceilings,
    input,
    lifeStage,
    MATCHER_SOURCE_SCOPE
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
