import type { MatcherUnit, SafetyCeiling } from "@/lib/matcher/types";

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

export function safetyCeilingFor(
  ceilings: readonly SafetyCeiling[],
  input: Readonly<{ name?: string; subjectId: string }>
) {
  if (ceilings.length === 0) {
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

  if (!name) {
    return null;
  }

  return index.byName.get(name) ?? null;
}
