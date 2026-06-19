import type { Locale } from "@/lib/i18n";
import {
  isMessageId,
  t,
  type MessageId,
  type MessageValues
} from "@/lib/i18n-messages";
import type { HealthScoreDomainId, PillarName } from "@/lib/health-score/v4-types";

function oxford(items: readonly string[]) {
  const clean = items.filter(Boolean);

  if (clean.length <= 0) return "";
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;

  return `${clean.slice(0, -1).join(", ")}, and ${clean[clean.length - 1]}`;
}

function healthScoreId(path: string) {
  return `customer.healthScore.${path}` as MessageId;
}

function catalogText(
  locale: Locale,
  path: string,
  fallback: string,
  values?: MessageValues
) {
  const id = healthScoreId(path);

  return isMessageId(id) ? t(locale, id, values) : fallback;
}

export const GOAL_MAP: Record<string, PillarName[]> = {
  energy: ["Sleep & Recovery", "Activity & Fitness"],
  fitness: ["Activity & Fitness"],
  focus: ["Stress & Balance", "Sleep & Recovery"],
  heart: ["Activity & Fitness", "Nutrition & Diet"],
  hormones: ["Stress & Balance", "Sleep & Recovery"],
  immunity: ["Nutrition & Diet", "Health Habits"],
  joints: ["Activity & Fitness"],
  longevity: ["Nutrition & Diet", "Activity & Fitness"],
  mood: ["Stress & Balance"],
  skin: ["Nutrition & Diet"],
  sleep: ["Sleep & Recovery"],
  weight: ["Activity & Fitness", "Nutrition & Diet"]
};

export const GOAL_PILLARS: Record<PillarName, string[]> = {
  "Activity & Fitness": ["energy", "longevity", "fitness", "weight", "heart", "joints"],
  "Health Habits": ["immunity"],
  "Nutrition & Diet": ["longevity", "immunity", "weight", "heart", "skin"],
  "Sleep & Recovery": ["energy", "sleep", "focus", "hormones"],
  "Stress & Balance": ["focus", "mood", "hormones"]
};

export const PILLAR_ID: Record<PillarName, HealthScoreDomainId> = {
  "Activity & Fitness": "activity",
  "Health Habits": "habits",
  "Nutrition & Diet": "nutrition",
  "Sleep & Recovery": "sleep",
  "Stress & Balance": "stress"
};

export const FINDINGS: Record<string, {
  icon: string;
  tier: number;
}> = {
  BLOODTHINNER: {
    icon: "*",
    tier: 1
  },
  DIURETIC_MIN: {
    icon: "sun",
    tier: 3
  },
  ENERGY_UPSTREAM: {
    icon: "◎",
    tier: 2
  },
  KIDNEY_CEILING: {
    icon: "*",
    tier: 4
  },
  LIVER_ROUTING: {
    icon: "*",
    tier: 4
  },
  METFORMIN_B12: {
    icon: "*",
    tier: 1
  },
  PLANT_OMEGA_B12: {
    icon: "sun",
    tier: 3
  },
  PPI_B12_MAG: {
    icon: "*",
    tier: 1
  },
  PREGNANCY: {
    icon: "*",
    tier: 4
  },
  SLEEP_UPSTREAM: {
    icon: "◎",
    tier: 2
  },
  STATIN_COQ10: {
    icon: "*",
    tier: 1
  },
  VITD_ROUTINE: {
    icon: "sun",
    tier: 3
  },
  WEIGHT_PATTERN: {
    icon: "◎",
    tier: 2
  }
};

export function localizedGoalPhrase(goal: string, locale: Locale) {
  return catalogText(locale, `goalPhrase.${goal}`, goal);
}

export function localizedGoalTag(goal: string, locale: Locale) {
  return catalogText(locale, `goalTag.${goal}`, goal);
}

export function localizedSymptomName(symptom: string, locale: Locale) {
  return catalogText(locale, `symptomName.${symptom}`, symptom);
}

export function localizedEnergyCause(cause: string, locale: Locale) {
  return catalogText(locale, `energyCause.${cause}`, cause);
}

export function localizedPillarLabel(name: PillarName, locale: Locale) {
  return catalogText(locale, `pillar.label.${PILLAR_ID[name]}`, name);
}

export function localizedPillarDescription(name: PillarName, locale: Locale) {
  return catalogText(locale, `pillar.description.${PILLAR_ID[name]}`, name);
}

export function localizedPillarGap(name: PillarName, locale: Locale) {
  const id = PILLAR_ID[name];

  return {
    body: catalogText(locale, `pillar.gap.${id}.body`, ""),
    headline: catalogText(locale, `pillar.gap.${id}.headline`, "")
  };
}

export function localizedPillarStrength(
  name: PillarName,
  locale: Locale,
  values: Readonly<{ value: number | string }>
) {
  return catalogText(locale, `pillar.strength.${PILLAR_ID[name]}`, "", values);
}

export function localizedList(items: readonly string[], locale: Locale) {
  if (locale === "zh-CN") {
    if (items.length <= 1) {
      return items[0] ?? "";
    }

    return items.slice(0, -1).join("、") + "和" + items[items.length - 1];
  }

  if (locale !== "th") {
    return oxford(items);
  }

  if (items.length <= 1) {
    return items[0] ?? "";
  }

  return items.slice(0, -1).join(", ") + " และ" + items[items.length - 1];
}

export function localizedFindingCopy(code: string, locale: Locale) {
  const base = FINDINGS[code];

  if (!base) {
    return undefined;
  }

  const bodyValues =
    code === "ENERGY_UPSTREAM"
      ? { energy_causes: "{energy_causes}" }
      : undefined;

  return {
    ...base,
    body: catalogText(locale, `findings.${code}.body`, "", bodyValues),
    headline: catalogText(locale, `findings.${code}.headline`, "")
  };
}

export const HEALTHSCORE_COPY_FORBIDDEN_SUBSTRINGS = [
  "bloodwork",
  "blood work",
  "get tested",
  "lab test",
  "lab result",
  "unmeasured",
  "capped",
  "can't rise",
  "locked",
  "deficien"
] as const;
