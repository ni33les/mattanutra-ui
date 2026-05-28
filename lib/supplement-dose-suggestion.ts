import {
  supplementDoseUnits,
  type SupplementDoseUnit
} from "@/lib/supplement-dose-units";
import type {
  SupplementConfidence,
  SupplementListStatus
} from "@/lib/admin-supplements";
import {
  normalizeSupplementSafetyFlags,
  supplementSafetyFlags,
  type SupplementSafetyFlag
} from "@/lib/supplement-safety-flags";
import { recordXaiUsageCost } from "@/lib/finance-ledger";
import {
  callGrokChatCompletion,
  configuredGrokModel,
  configuredGrokValue,
  getRequiredXaiApiKey
} from "@/lib/grok-client";

export type SupplementDoseSuggestionInput = Readonly<{
  category?: string | null;
  confidence?: SupplementConfidence | null;
  currentMaxAmount?: number | null;
  currentMaxUnit?: string | null;
  listStatus?: string | null;
  primaryUseCase?: string | null;
  safetyFlags?: SupplementSafetyFlag[];
  safetyNotes?: string | null;
  supplementName: string;
}>;

export type SupplementDoseSuggestion = Readonly<{
  confidence: SupplementConfidence;
  listStatus: SupplementListStatus;
  maxAmount: number | null;
  maxUnit: SupplementDoseUnit | "";
  responseId?: string;
  safetyFlags: SupplementSafetyFlag[];
  safetyNotes: string;
}>;

const DEFAULT_REASONING_EFFORT = "low";
const REQUEST_TIMEOUT_MS = 120_000;

function config() {
  return {
    apiKey: getRequiredXaiApiKey(),
    model: configuredGrokModel(process.env.GROK_MODEL),
    reasoningEffort:
      configuredGrokValue(process.env.FORMULATION_REASONING_EFFORT) ||
      DEFAULT_REASONING_EFFORT
  };
}

function normalizeUnit(value: unknown): SupplementDoseUnit | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  return (
    supplementDoseUnits.find((unit) => unit.toLowerCase() === normalized) ?? null
  );
}

function confidenceValue(value: unknown): SupplementConfidence {
  if (value === "high" || value === "moderate" || value === "low") {
    return value;
  }

  return "low";
}

function listStatusValue(
  value: unknown,
  fallback: string | null | undefined
): SupplementListStatus {
  if (
    value === "active" ||
    value === "blocked"
  ) {
    return value;
  }

  if (
    fallback === "active" ||
    fallback === "blocked"
  ) {
    return fallback;
  }

  return "active";
}

function numberOrNull(value: unknown) {
  if (value === null || value === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function parseJsonObject(content: string | null | undefined) {
  if (!content) {
    throw new Error("Model returned empty content");
  }

  const trimmed = content
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");

    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
    }

    throw new Error("Model returned invalid JSON");
  }
}

function suggestionPayload(parsed: Record<string, unknown>) {
  const nested =
    parsed.contract &&
    typeof parsed.contract === "object" &&
    !Array.isArray(parsed.contract)
      ? (parsed.contract as Record<string, unknown>)
      : null;

  return nested &&
    Number.isFinite(Number(nested.maxAmount)) &&
    normalizeUnit(nested.maxUnit)
    ? nested
    : parsed;
}

async function callGrok(input: SupplementDoseSuggestionInput) {
  const grok = config();

  const completion = await callGrokChatCompletion({
    apiKey: grok.apiKey,
    maxTokens: 400,
    messages: [
      {
        content: [
              "You prepare conservative supplement safety drafts for MattaNutra admin review.",
              "This is internal safety support, not medical advice.",
              "Return JSON only. No markdown, no prose outside JSON.",
              "Return exactly one root JSON object with only these keys: listStatus, confidence, maxAmount, maxUnit, safetyFlags, safetyNotes.",
              "Do not echo the request, allowedUnits, contract, supplement, or schema.",
              "Use one maxUnit from allowedUnits exactly.",
              "Use only safetyFlags from allowedSafetyFlags.",
              "Choose listStatus from active or blocked.",
              "Choose blocked only for broadly unsafe, illegal, unsuitable, non-supplement, or strongly contraindicated items.",
              "Choose active when generally suitable for catalogue use with the suggested conservative max dose.",
              "For active, return a positive numeric maxAmount and an allowed maxUnit.",
              "For blocked, maxAmount may be null and maxUnit may be an empty string.",
              "If evidence is uncertain, choose a conservative ceiling and confidence low.",
              "Never suggest a dose range.",
              "Write safetyNotes as concise admin-facing notes explaining the status, flags, and dose choice."
        ].join("\n"),
        role: "system"
      },
      {
        content: JSON.stringify(
              {
                allowedUnits: supplementDoseUnits,
                allowedSafetyFlags: supplementSafetyFlags,
                output: {
                  confidence: "high | moderate | low",
                  listStatus: "active | blocked",
                  maxAmount: "positive number, or null for blocked",
                  maxUnit: "one allowedUnits value",
                  safetyFlags: ["zero or more allowedSafetyFlags values"],
                  safetyNotes: "short admin-facing notes"
                },
                supplement: input
              },
              null,
              2
        ),
        role: "user"
      }
    ],
    model: grok.model,
    purpose: "supplement dose suggestion",
    reasoningEffort: grok.reasoningEffort,
    temperature: 0.1,
    timeoutMs: REQUEST_TIMEOUT_MS
  });

  await recordXaiUsageCost({
    metadata: {
      category: input.category,
      supplementName: input.supplementName
    },
    model: completion.model ?? grok.model,
    purpose: "supplement_dose_suggestion",
    reasoningEffort: grok.reasoningEffort,
    responseId: completion.id,
    usage: completion.usage
  });

  return completion;
}

export async function suggestSupplementDose(
  input: SupplementDoseSuggestionInput
): Promise<SupplementDoseSuggestion> {
  if (!input.supplementName.trim()) {
    throw new Error("Supplement name is required");
  }

  const response = await callGrok(input);
  const parsed = suggestionPayload(
    parseJsonObject(response.choices?.[0]?.message?.content)
  );
  const listStatus = listStatusValue(parsed.listStatus, input.listStatus);
  const maxAmount = numberOrNull(parsed.maxAmount);
  const maxUnit = normalizeUnit(parsed.maxUnit);
  const doseRequired = listStatus === "active";

  if (doseRequired && (!maxAmount || maxAmount <= 0 || !maxUnit)) {
    throw new Error("Model returned an invalid dose suggestion");
  }

  const safetyNotes =
    typeof parsed.safetyNotes === "string" && parsed.safetyNotes.trim()
      ? parsed.safetyNotes.trim().slice(0, 1000)
      : typeof parsed.rationale === "string" && parsed.rationale.trim()
        ? parsed.rationale.trim().slice(0, 1000)
        : "Conservative AI-suggested supplement safety draft.";

  return {
    confidence: confidenceValue(parsed.confidence),
    listStatus,
    maxAmount,
    maxUnit: maxUnit ?? "",
    responseId: response.id,
    safetyFlags: normalizeSupplementSafetyFlags(parsed.safetyFlags),
    safetyNotes
  };
}
