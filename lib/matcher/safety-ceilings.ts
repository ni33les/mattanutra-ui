import { publicSupplementId } from "@/lib/agentic/contract/ids";
import { getSql } from "@/lib/db";
import type { MatcherUnit, SafetyCeiling } from "@/lib/matcher/types";

const LIMITS_TTL_MS = 10 * 60_000;

let cached: { at: number; ceilings: SafetyCeiling[] } | null = null;
let inflight: Promise<SafetyCeiling[]> | null = null;

function asMatcherUnit(value: string): MatcherUnit | null {
  const unit = value.trim();

  if (
    unit === "mg" ||
    unit === "mcg" ||
    unit === "g" ||
    unit === "IU" ||
    unit === "CFU" ||
    unit === "ml" ||
    unit === "serving"
  ) {
    return unit;
  }

  if (unit.toLowerCase() === "iu") {
    return "IU";
  }

  if (unit.toLowerCase() === "ug" || unit.toLowerCase() === "µg") {
    return "mcg";
  }

  return null;
}

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function setMatcherSafetyCeilings(ceilings: readonly SafetyCeiling[]) {
  cached = { at: Date.now(), ceilings: [...ceilings] };
}

export function matcherSafetyCeilings() {
  return cached?.ceilings ?? [];
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

export async function refreshAdminSafetyCeilings(): Promise<SafetyCeiling[]> {
  if (cached && Date.now() - cached.at < LIMITS_TTL_MS) {
    return cached.ceilings;
  }

  if (inflight) {
    return inflight;
  }

  inflight = loadAdminSafetyCeilings()
    .then((ceilings) => {
      setMatcherSafetyCeilings(ceilings);
      return ceilings;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

async function loadAdminSafetyCeilings(): Promise<SafetyCeiling[]> {
  try {
    const sql = getSql();

    if (!sql) {
      return cached?.ceilings ?? [];
    }

    const rows = await sql<
      Array<{
        max_amount: string | number | null;
        max_unit: string;
        name: string;
        supplement_id: string;
      }>
    >`
      select distinct on (supplements.id)
        supplements.id::text as supplement_id,
        supplements.name,
        limits.max_amount,
        limits.max_unit
      from public.supplement_safety_limits limits
      join public.supplements supplements
        on supplements.id = limits.supplement_id
      where limits.max_amount is not null
        and limits.max_amount > 0
      order by supplements.id, limits.version desc
    `;

    const ceilings: SafetyCeiling[] = [];

    for (const row of rows) {
      const amount = Number(row.max_amount);
      const unit = asMatcherUnit(row.max_unit);

      if (!Number.isFinite(amount) || amount <= 0 || !unit) {
        continue;
      }

      const ceiling = {
        maxAmount: amount,
        maxUnit: unit,
        name: row.name,
        subjectId: row.supplement_id
      };
      ceilings.push(ceiling);
      ceilings.push({
        ...ceiling,
        subjectId: publicSupplementId(row.supplement_id)
      });
    }

    return ceilings;
  } catch {
    return cached?.ceilings ?? [];
  }
}
