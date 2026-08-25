import { readFileSync } from "node:fs";
import { parseAdminLimitUnit } from "@/lib/matcher/safety-ceilings";
import type {
  MatcherUnit,
  SafetyCeiling,
  SafetyLimitLifeStage,
  SafetySourceScope
} from "@/lib/matcher/types";
import {
  MATCHER_SOURCE_SCOPE,
  SAFETY_LIMIT_LIFE_STAGES,
  SAFETY_SOURCE_SCOPES
} from "@/lib/matcher/types";

export type SupplementalUlBand = Readonly<{
  lifeStage: SafetyLimitLifeStage;
  maxAmount: number;
}>;

export type SupplementalUlNutrient = Readonly<{
  aliases: readonly string[];
  authorityUrl: string;
  bands: readonly SupplementalUlBand[];
  name: string;
  sourceScope: SafetySourceScope;
  unit: MatcherUnit;
}>;

export type SupplementalUlReference = Readonly<{
  authority: string;
  effectiveOn: string;
  notes: string;
  nutrients: readonly SupplementalUlNutrient[];
}>;

const REFERENCE_PATH = new URL(
  "../../../data/nih-ods-supplemental-ul.json",
  import.meta.url
);

function isLifeStage(value: string): value is SafetyLimitLifeStage {
  return (SAFETY_LIMIT_LIFE_STAGES as readonly string[]).includes(value);
}

function isSourceScope(value: string): value is SafetySourceScope {
  return (SAFETY_SOURCE_SCOPES as readonly string[]).includes(value);
}

function parseReference(raw: unknown): SupplementalUlReference {
  if (!raw || typeof raw !== "object") {
    throw new Error("Supplemental UL reference is not an object");
  }

  const record = raw as Record<string, unknown>;
  const nutrients = Array.isArray(record.nutrients) ? record.nutrients : [];

  return {
    authority: String(record.authority ?? ""),
    effectiveOn: String(record.effectiveOn ?? ""),
    notes: String(record.notes ?? ""),
    nutrients: nutrients.map((item) => {
      const nutrient = item as Record<string, unknown>;
      const unit = parseAdminLimitUnit(String(nutrient.unit ?? ""));
      const sourceScope = String(nutrient.sourceScope ?? "");
      const bands = Array.isArray(nutrient.bands) ? nutrient.bands : [];

      if (!unit) {
        throw new Error(`Unsupported UL unit for ${String(nutrient.name)}`);
      }

      if (!isSourceScope(sourceScope)) {
        throw new Error(`Unsupported source scope for ${String(nutrient.name)}`);
      }

      return {
        aliases: Array.isArray(nutrient.aliases)
          ? nutrient.aliases.map((alias) => String(alias))
          : [],
        authorityUrl: String(nutrient.authorityUrl ?? ""),
        bands: bands.map((band) => {
          const row = band as Record<string, unknown>;
          const lifeStage = String(row.lifeStage ?? "");

          if (!isLifeStage(lifeStage)) {
            throw new Error(`Unsupported life stage ${lifeStage}`);
          }

          return {
            lifeStage,
            maxAmount: Number(row.maxAmount)
          };
        }),
        name: String(nutrient.name ?? ""),
        sourceScope,
        unit
      };
    })
  };
}

export const SUPPLEMENTAL_UL_REFERENCE = parseReference(
  JSON.parse(readFileSync(REFERENCE_PATH, "utf8")) as unknown
);

export function normalizeUlName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function nutrientMatchesName(
  nutrient: SupplementalUlNutrient,
  name: string
) {
  const hay = normalizeUlName(name);
  const needles = [nutrient.name, ...nutrient.aliases].map(normalizeUlName);

  return needles.some(
    (needle) => hay === needle || (needle.length > 0 && hay.startsWith(`${needle} `))
  );
}

export function findReferenceNutrient(name: string) {
  return (
    SUPPLEMENTAL_UL_REFERENCE.nutrients.find((nutrient) =>
      nutrientMatchesName(nutrient, name)
    ) ?? null
  );
}

export function ceilingsForSubjects(
  subjects: readonly Readonly<{
    aliases?: readonly string[];
    id: string;
    name: string;
  }>[]
): SafetyCeiling[] {
  const ceilings: SafetyCeiling[] = [];

  for (const subject of subjects) {
    const names = [subject.name, ...(subject.aliases ?? [])];
    const nutrient = names
      .map((name) => findReferenceNutrient(name))
      .find((item): item is SupplementalUlNutrient => item != null);

    if (!nutrient) {
      continue;
    }

    for (const band of nutrient.bands) {
      if (nutrient.sourceScope !== MATCHER_SOURCE_SCOPE) {
        continue;
      }

      ceilings.push({
        lifeStage: band.lifeStage,
        maxAmount: band.maxAmount,
        maxUnit: nutrient.unit,
        name: subject.name,
        sourceScope: nutrient.sourceScope,
        subjectId: subject.id
      });
    }
  }

  return ceilings;
}
