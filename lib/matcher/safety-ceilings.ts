import type { LifeStage, MatcherUnit, SafetyCeiling } from "@/lib/matcher/types";

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

type CeilingIndex = {
  byId: Map<string, SafetyCeiling>;
  byName: Map<string, SafetyCeiling>;
};

const ceilingIndexCache = new WeakMap<object, CeilingIndex>();

function indexCeilings(ceilings: readonly SafetyCeiling[]): CeilingIndex {
  const cachedIndex = ceilingIndexCache.get(ceilings as object);

  if (cachedIndex) {
    return cachedIndex;
  }

  const byId = new Map<string, SafetyCeiling>();
  const byName = new Map<string, SafetyCeiling>();

  for (const item of ceilings) {
    const id = item.subjectId.trim().toLowerCase();
    byId.set(id, item);
    byId.set(id.replace(/^supplement:/, ""), item);
    byId.set(id.replace(/^sup_/, ""), item);
    const name = normalizeName(item.name);

    if (name && !byName.has(name)) {
      byName.set(name, item);
    }
  }

  const index = { byId, byName };
  ceilingIndexCache.set(ceilings as object, index);
  return index;
}

const MAGNESIUM = /\bmagnesium\b/i;
const VITAMIN_A = /\bvitamin\s*a\b|\bretinol\b/i;
const VITAMIN_D = /\bvitamin\s*d|\bd3\b|\bcholecalciferol\b/i;
const ZINC = /\bzinc\b/i;

function haystackOf(input: Readonly<{ name?: string; subjectId: string }>) {
  return `${input.name ?? ""} ${input.subjectId}`;
}

export function isPediatricSafetyProfile(
  profile?: SafetyProfile | null
): boolean {
  if (!profile) {
    return false;
  }

  return profile.lifeStage === "child" || profile.ageYears < 9;
}

function magnesiumUlMg(ageYears: number) {
  if (ageYears <= 3) {
    return 65;
  }

  if (ageYears <= 8) {
    return 110;
  }

  return 350;
}

function vitaminD3UlIu(ageYears: number) {
  if (ageYears < 1) {
    return 1000;
  }

  if (ageYears <= 3) {
    return 2500;
  }

  if (ageYears <= 8) {
    return 3000;
  }

  return 4000;
}

function vitaminAUlMcg(ageYears: number) {
  if (ageYears <= 3) {
    return 600;
  }

  if (ageYears <= 8) {
    return 900;
  }

  if (ageYears <= 13) {
    return 1700;
  }

  if (ageYears <= 18) {
    return 2800;
  }

  return 3000;
}

function zincUlMg(ageYears: number) {
  if (ageYears <= 3) {
    return 7;
  }

  if (ageYears <= 8) {
    return 12;
  }

  if (ageYears <= 13) {
    return 23;
  }

  if (ageYears <= 18) {
    return 34;
  }

  return 40;
}

function nihBandFor(
  input: Readonly<{ name?: string; subjectId: string }>,
  ageYears: number
): SafetyCeiling | null {
  const hay = haystackOf(input);
  const name = input.name?.trim() || input.subjectId;

  if (MAGNESIUM.test(hay)) {
    return {
      maxAmount: magnesiumUlMg(ageYears),
      maxUnit: "mg",
      name,
      subjectId: input.subjectId
    };
  }

  if (VITAMIN_A.test(hay)) {
    return {
      maxAmount: vitaminAUlMcg(ageYears),
      maxUnit: "mcg",
      name,
      subjectId: input.subjectId
    };
  }

  if (VITAMIN_D.test(hay)) {
    return {
      maxAmount: vitaminD3UlIu(ageYears),
      maxUnit: "IU",
      name,
      subjectId: input.subjectId
    };
  }

  if (ZINC.test(hay)) {
    return {
      maxAmount: zincUlMg(ageYears),
      maxUnit: "mg",
      name,
      subjectId: input.subjectId
    };
  }

  return null;
}

export function fallbackSafetyCeiling(input: Readonly<{
  name?: string;
  profile?: SafetyProfile | null;
  subjectId: string;
}>): SafetyCeiling | null {
  const ageYears = input.profile?.ageYears ?? 19;
  return nihBandFor(input, ageYears);
}

function adminCeilingFor(
  ceilings: readonly SafetyCeiling[],
  input: Readonly<{ name?: string; subjectId: string }>
): SafetyCeiling | null {
  if (ceilings.length < 1) {
    return null;
  }

  const index = indexCeilings(ceilings);
  const raw = input.subjectId.trim().toLowerCase();
  const byId =
    index.byId.get(raw) ??
    index.byId.get(raw.replace(/^supplement:/, "")) ??
    index.byId.get(raw.replace(/^sup_/, ""));

  if (byId) {
    return byId;
  }

  const name = normalizeName(input.name ?? "");
  return name ? index.byName.get(name) ?? null : null;
}

export function adultPolicyCeilingExists(
  ceilings: readonly SafetyCeiling[],
  input: Readonly<{ name?: string; subjectId: string }>
) {
  return Boolean(
    adminCeilingFor(ceilings, input) || nihBandFor(input, 19)
  );
}

export function safetyCeilingFor(
  ceilings: readonly SafetyCeiling[],
  input: Readonly<{
    name?: string;
    profile?: SafetyProfile | null;
    subjectId: string;
  }>
) {
  if (isPediatricSafetyProfile(input.profile)) {
    const banded = nihBandFor(input, input.profile?.ageYears ?? 0);

    if (banded) {
      return banded;
    }

    return null;
  }

  return adminCeilingFor(ceilings, input) ?? fallbackSafetyCeiling(input);
}
