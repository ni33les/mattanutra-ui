import type { SafetyCeiling } from "@/lib/matcher/types";

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

export function safetyCeilingFor(
  ceilings: readonly SafetyCeiling[],
  input: Readonly<{ name?: string; subjectId: string }>
) {
  const raw = input.subjectId.trim().toLowerCase();
  const ids = new Set(
    [
      raw,
      raw.replace(/^supplement:/, ""),
      raw.replace(/^sup_/, "")
    ].filter(Boolean)
  );
  const byId = ceilings.find((item) => {
    const id = item.subjectId.trim().toLowerCase();
    return ids.has(id) || ids.has(id.replace(/^sup_/, ""));
  });

  if (byId) {
    return byId;
  }

  const name = normalizeName(input.name ?? "");

  if (!name) {
    return null;
  }

  return (
    ceilings.find((item) => normalizeName(item.name) === name) ?? null
  );
}
