import { publicSupplementId } from "@/lib/agentic/contract/ids";
import { getSql } from "@/lib/db";
import {
  matcherSafetyCeilings,
  matcherSafetyCeilingsCachedAt,
  parseAdminLimitUnit,
  setMatcherSafetyCeilings,
  setMatcherSafetyCeilingsUnavailable
} from "@/lib/matcher/safety-ceilings";
import type {
  SafetyCeiling,
  SafetyLimitLifeStage,
  SafetySourceScope
} from "@/lib/matcher/types";
import {
  MATCHER_SOURCE_SCOPE,
  SAFETY_LIMIT_LIFE_STAGES,
  SAFETY_SOURCE_SCOPES
} from "@/lib/matcher/types";

const LIMITS_TTL_MS = 10 * 60_000;
let inflight: Promise<SafetyCeiling[]> | null = null;

function asMatcherUnit(value: string) {
  return parseAdminLimitUnit(value);
}

function asLifeStage(value: string | null): SafetyLimitLifeStage | null {
  if (!value) {
    return "adult";
  }

  return (SAFETY_LIMIT_LIFE_STAGES as readonly string[]).includes(value)
    ? (value as SafetyLimitLifeStage)
    : null;
}

function asSourceScope(value: string | null): SafetySourceScope | null {
  if (!value) {
    return MATCHER_SOURCE_SCOPE;
  }

  return (SAFETY_SOURCE_SCOPES as readonly string[]).includes(value)
    ? (value as SafetySourceScope)
    : null;
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

async function loadAdminSafetyCeilings(): Promise<SafetyCeiling[]> {
  try {
    const sql = getSql();

    if (!sql) {
      return matcherSafetyCeilings();
    }

    const rows = await sql<
      Array<{
        band_id: string;
        band_version: string | number;
        life_stage: string | null;
        max_amount: string | number | null;
        max_unit: string;
        name: string;
        source_scope: string | null;
        supplement_id: string;
      }>
    >`
      select distinct on (supplements.id, limits.life_stage, limits.source_scope)
        limits.id::text as band_id,
        limits.version as band_version,
        supplements.id::text as supplement_id,
        supplements.name,
        limits.life_stage,
        limits.max_amount,
        limits.max_unit,
        limits.source_scope
      from public.supplement_safety_limits limits
      join public.supplements supplements
        on supplements.id = limits.supplement_id
      where limits.max_amount is not null
        and limits.max_amount > 0
      order by
        supplements.id,
        limits.life_stage,
        limits.source_scope,
        limits.version desc
    `;

    const ceilings: SafetyCeiling[] = [];

    for (const row of rows) {
      const amount = Number(row.max_amount);
      const unit = asMatcherUnit(row.max_unit);
      const lifeStage = asLifeStage(row.life_stage);
      const sourceScope = asSourceScope(row.source_scope);

      if (
        !Number.isFinite(amount) ||
        amount <= 0 ||
        !unit ||
        !lifeStage ||
        !sourceScope
      ) {
        continue;
      }

      const bandVersion = Number(row.band_version);
      const ceiling = {
        ...(row.band_id.trim() ? { bandId: row.band_id.trim() } : {}),
        ...(Number.isInteger(bandVersion) && bandVersion > 0
          ? { bandVersion }
          : {}),
        lifeStage,
        maxAmount: amount,
        maxUnit: unit,
        name: row.name,
        sourceScope,
        subjectId: row.supplement_id
      };
      ceilings.push(ceiling);
      ceilings.push({
        ...ceiling,
        subjectId: publicSupplementId(row.supplement_id)
      });
    }

    if (ceilings.length === 0 && rows.length > 0) {
      const previous = matcherSafetyCeilings();

      if (previous.length > 0) {
        return previous;
      }

      setMatcherSafetyCeilingsUnavailable();
      return previous;
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
