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

const NIH_FALLBACK_CEILINGS: ReadonlyArray<{
  maxAmount: number;
  maxUnit: MatcherUnit;
  pattern: RegExp;
}> = [
  { maxAmount: 350, maxUnit: "mg", pattern: /\bmagnesium\b/i },
  { maxAmount: 4000, maxUnit: "IU", pattern: /\bvitamin\s*d|\bd3\b|\bcholecalciferol\b/i },
  { maxAmount: 40, maxUnit: "mg", pattern: /\bzinc\b/i }
];

export function fallbackSafetyCeiling(input: Readonly<{
  name?: string;
  subjectId: string;
}>): SafetyCeiling | null {
  const name = `${input.name ?? ""} ${input.subjectId}`;

  for (const item of NIH_FALLBACK_CEILINGS) {
    if (item.pattern.test(name)) {
      return {
        maxAmount: item.maxAmount,
        maxUnit: item.maxUnit,
        name: input.name?.trim() || input.subjectId,
        subjectId: input.subjectId
      };
    }
  }

  return null;
}

export function safetyCeilingFor(
  ceilings: readonly SafetyCeiling[],
  input: Readonly<{ name?: string; subjectId: string }>
) {
  if (ceilings.length > 0) {
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
    const byName = name ? index.byName.get(name) ?? null : null;

    if (byName) {
      return byName;
    }
  }

  return fallbackSafetyCeiling(input);
}
