import { FIXTURE_SUPPLEMENTS } from "@/lib/agentic/catalogue/fixtures";
import { publicSupplementId } from "@/lib/agentic/contract/ids";
import { getSql } from "@/lib/db";
import {
  matcherSafetyCeilings,
  matcherSafetyCeilingsCachedAt,
  setMatcherSafetyCeilings,
  setMatcherSafetyCeilingsUnavailable
} from "@/lib/matcher/safety-ceilings";
import type { MatcherUnit, SafetyCeiling } from "@/lib/matcher/types";

const LIMITS_TTL_MS = 10 * 60_000;
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

export async function refreshAdminSafetyCeilings(): Promise<SafetyCeiling[]> {
  if (
    matcherSafetyCeilings().length > 0 &&
    Date.now() - matcherSafetyCeilingsCachedAt() < LIMITS_TTL_MS
  ) {
    return matcherSafetyCeilings();
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

function fixtureIdsForName(name: string) {
  const needle = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  return FIXTURE_SUPPLEMENTS.filter((item) => {
    const names = [item.name, ...item.aliases].map((value) =>
      value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
    );
    return names.includes(needle);
  }).flatMap((item) => [item.supplementId, item.uuid]);
}

async function loadAdminSafetyCeilings(): Promise<SafetyCeiling[]> {
  try {
    const sql = getSql();

    if (!sql) {
      return matcherSafetyCeilings();
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
      for (const fixtureId of fixtureIdsForName(row.name)) {
        ceilings.push({
          ...ceiling,
          subjectId: fixtureId
        });
      }
    }

    return ceilings;
  } catch {
    const previous = matcherSafetyCeilings();

    if (previous.length > 0) {
      return previous;
    }

    setMatcherSafetyCeilingsUnavailable();
    return previous;
  }
}
