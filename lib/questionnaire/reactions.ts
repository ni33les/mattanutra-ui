import type {
  QuestionnaireAnswers,
  QuestionnaireDefinition,
  TurnDef
} from "@/lib/questionnaire/types";

function reactLine(
  definition: QuestionnaireDefinition,
  key: string
): { pose: string; text: string } | null {
  const raw = definition.react[key];

  if (!raw || raw.length < 2) {
    return null;
  }

  return { pose: String(raw[0]), text: String(raw[1]) };
}

/**
 * Deterministic reaction after an answer (mirrors q-v6 maybeReact).
 * Returns reaction + id to mark as fired, or null.
 * Note: vegan diet path uses veganSkip via engine autofill instead of diet_plant.
 */
export function selectReaction(
  definition: QuestionnaireDefinition,
  turn: TurnDef,
  value: unknown,
  fired: Readonly<Record<string, number>>
): { id: string; pose: string; text: string } | null {
  const once = (id: string) => !fired[id];
  const k = turn.k;
  const line = (reactKey: string, id: string) => {
    if (!once(id)) {
      return null;
    }

    const r = reactLine(definition, reactKey);

    return r ? { id, ...r } : null;
  };

  if (k === "goals") {
    return line("goals", "goals");
  }

  if (k === "symptoms" && Array.isArray(value) && value.includes("great")) {
    return line("symptoms_great", "sg");
  }

  if (k === "sleepHrs" && (value === "u5" || value === "5-6")) {
    return line("sleep_low", "sl");
  }

  if (k === "stress" && (value === "high" || value === "extreme")) {
    return line("stress_high", "st");
  }

  if (k === "digestion" && value === "bloating") {
    return line("digestion_bloat", "bl");
  }

  if (k === "activity" && (value === "active" || value === "athlete")) {
    return line("activity_high", "ac");
  }

  // diet plant/vegan reaction is handled in engine when vegan autofill runs
  if (k === "diet" && value === "plant") {
    return line("diet_plant", "vg");
  }

  if (k === "meds" && value === "yes") {
    return line("meds_yes", "md");
  }

  if (k === "medTypes" && Array.isArray(value) && value.includes("statin")) {
    return line("statin", "stt");
  }

  if (
    (k === "kidney" && value !== "normal") ||
    (k === "liver" && value !== "normal")
  ) {
    return line("organ_flag", "org");
  }

  if (k === "antibiotics" && value === "yes") {
    return line("antibiotics_yes", "ab");
  }

  if (k === "caffeine" && value === "4+") {
    return line("caffeine_high", "cf");
  }

  if (k === "supplements" && value === "targeted") {
    return line("supp_targeted", "sp");
  }

  return null;
}

/**
 * Micro-ack after an answer (v6). Deterministic: no random pool roll —
 * uses pool rotation from sinceAck so agent/web/LINE stay aligned.
 */
export function selectAck(
  definition: QuestionnaireDefinition,
  turnKey: string,
  value: unknown,
  options: {
    reacted: boolean;
    sinceAck: number;
  }
): { text: string; pose: string } | null {
  if (options.reacted) {
    return null;
  }

  const spec = definition.acks?.spec?.[turnKey];
  if (spec) {
    const valueKey = Array.isArray(value) ? "*" : String(value);
    const hit = spec[valueKey] || spec["*"];
    if (hit) {
      return { text: hit, pose: "open" };
    }
  }

  const pool = definition.acks?.pool ?? [];
  // Mirror HTML: after 3 non-ack answers, show pool line (~every 3rd)
  if (options.sinceAck >= 3 && pool.length > 0) {
    const index = Math.floor(options.sinceAck / 3 - 1) % pool.length;
    return { text: pool[index]!, pose: "open" };
  }

  return null;
}

export function isTurnVisible(
  turn: TurnDef,
  answers: QuestionnaireAnswers
): boolean {
  if (!turn.cond) {
    return true;
  }

  const sex = answers.sex;
  const reproStatus = answers.reproStatus;
  const meds = answers.meds;
  const medTypes = answers.medTypes;
  const suppAllergies = answers.suppAllergies;
  const tracker = answers.tracker;

  switch (turn.cond) {
    case "female":
      return sex === "female";
    case "femaleCycle":
      return (
        sex === "female" &&
        reproStatus !== "pregnant" &&
        reproStatus !== "breastfeeding"
      );
    case "medsYes":
      return meds === "yes";
    case "medOther":
      return Array.isArray(medTypes) && medTypes.includes("other");
    case "suppOther":
      return (
        Array.isArray(suppAllergies) && suppAllergies.includes("other")
      );
    case "trackerOther":
      return tracker === "other";
    default:
      return true;
  }
}
