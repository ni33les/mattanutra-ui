import { businessError, isAgenticErrorResult, type AgenticErrorResult } from "@/lib/agentic/contract/errors";
import { resolveSupplement } from "@/lib/agentic/plan/normalize";
import { zeroTargetScale } from "@/lib/matcher/zero-target-policy";
import { convertAmount } from "@/lib/matcher/dose";
import { patchScoring, type ScoringPatch } from "@/lib/matcher/scoring-policy";
import { sha256Hex } from "@/lib/sha256";
import type { CatalogueSnapshot, CatalogueUnit } from "@/lib/agentic/catalogue/types";
import type { PlanRequest, PlanRequestTarget } from "@/lib/agentic/plan/types";

type Row = Record<string, unknown>;
function object(value: unknown): value is Row { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function merge(original: unknown, patch: unknown): unknown {
  if (Array.isArray(patch) || patch === null || !object(patch)) return structuredClone(patch);
  const result = object(original) ? { ...original } : {};
  for (const [key, value] of Object.entries(patch)) { if (["__proto__", "prototype", "constructor"].includes(key)) throw new Error("Unsafe property"); result[key] = merge(result[key], value); }
  return result;
}
const failure = (fieldPath: string, message: string) => businessError({ fieldPath, message, reasonCode: "invalid_request" });
/** Pure preparation over immutable facts, before admission/publication transactions. */
export function prepareSimpleRequest(input: Row, snapshot: CatalogueSnapshot, previous?: PlanRequest): PlanRequest | AgenticErrorResult {
  let scoring;
  try { scoring = patchScoring(previous?.scoring, input.scoring as ScoringPatch | undefined); }
  catch (error) { const message = error instanceof Error ? error.message : "Invalid scoring settings"; return failure(message.split(":")[0].split(" ")[0], message); }
  const base: PlanRequest = previous ?? { locale: String(input.locale), destinationCountry: String(input.destinationCountry), optimization: scoring.profile, profile: {}, requirements: {}, targets: [] };
  const patch = Object.fromEntries(Object.entries(input).filter(([key]) => !["planHandle", "expectedRevision", "idempotencyKey", "targets", "scoring", "searchEffort"].includes(key)));
  const merged = merge(base, patch) as PlanRequest;
  const targets = [...base.targets];
  const seen = new Set<string>(), removed = new Set<string>();
  for (const [index, row] of ((input.targets ?? []) as Row[]).entries()) {
    const field = `targets[${index}]`;
    const id = typeof row.ingredientId === "string" ? row.ingredientId : undefined;
    const existingIndex = id ? targets.findIndex(target => target.ingredientId === id || target.supplementId === id) : -1;
    const old = targets[existingIndex];
    if (row.amount === null) {
      if (!old || !id) return failure(`${field}.ingredientId`, "Removal requires the ingredient ID of a saved target.");
      if (seen.has(id)) return failure(`${field}.ingredientId`, "The same ingredient occurs twice in this call.");
      const override = (input.scoring as ScoringPatch | undefined)?.weights?.nutrients?.[id];
      if (override !== undefined && override !== null) return failure(`scoring.weights.nutrients.${id}`, "Remove the target and change its weight in separate calls.");
      seen.add(id); removed.add(id); targets.splice(existingIndex, 1); continue;
    }
    let name: string | undefined = typeof row.name === "string" ? row.name : old?.name;
    const unresolved = old?.ingredientId?.startsWith("req_") === true;
    const sourceAlias = name?.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() === "algae omega 3";
    const resolveName = sourceAlias && merged.requirements.omega3SourcePreference === "algae_only" ? "Omega-3" : name;
    const found = unresolved ? null : resolveSupplement(snapshot, { name: resolveName, supplementId: id }, `${field}.${id ? "ingredientId" : "name"}`);
    if (isAgenticErrorResult(found) && id) return found.error.reasonCode === "incompatible_identity" ? found : failure(`${field}.ingredientId`, "Use a returned or published ingredient ID.");
    const known = found && !isAgenticErrorResult(found) ? found : null;
    name ??= known?.name;
    if (!name) return failure(`${field}.name`, "A new target requires a name or published ingredient ID.");
    const identity = old?.ingredientId ?? known?.supplementId ?? `req_${sha256Hex(name.normalize("NFKC").trim().toLowerCase()).slice(0, 24)}`;
    if (seen.has(identity)) return failure(`${field}.ingredientId`, "Multiple rows resolve to the same ingredient; send one update.");
    seen.add(identity);
    if (!id && targets.some(target => target.ingredientId === identity)) return failure(`${field}.ingredientId`, "Refine an existing target using its returned ingredientId.");
    let amount = typeof row.amount === "number" ? row.amount : old?.amount;
    const unit = (row.unit ?? old?.unit) as CatalogueUnit | undefined;
    if (amount === undefined || !unit) return failure(field, "A new target requires amount and unit.");
    if (old && row.unit !== undefined && row.amount === undefined && row.unit !== old.unit) {
      const converted = convertAmount({ amount: old.amount, fromUnit: old.unit, toUnit: unit, subjectId: known?.supplementId ?? identity, subjectName: name });
      if (converted === null) return failure(`${field}.unit`, "These units/forms cannot be converted without changing the physical target.");
      amount = converted;
    }
    if (amount === 0 && !zeroTargetScale(known?.name ?? name, identity)) return failure(`${field}.amount`, "No reviewed zero-target normalization scale is available for this ingredient. Agree a positive target or use an explicit exclusion for categorical avoidance.");
    const next: PlanRequestTarget = { ...(old ?? {}), ingredientId: identity, name, amount, unit,
      basis: (row.basis ?? old?.basis ?? "total_daily") as PlanRequestTarget["basis"],
      ...(known ? { supplementId: known.supplementId } : {}), ...(row.acceptableRange ? { acceptableRange: row.acceptableRange as PlanRequestTarget["acceptableRange"] } : {}) };
    if (old) targets[existingIndex] = next; else targets.push(next);
  }
  if (targets.length > 30) return failure("targets", "At most 30 requested targets are supported; remove a target before adding another.");
  if (removed.size) scoring = patchScoring(scoring, { weights: { nutrients: Object.fromEntries([...removed].map(id => [id, null])) } });
  const available = new Set([...snapshot.supplements.map(row => row.supplementId), ...targets.map(row => row.ingredientId!)]);
  for (const id of Object.keys(scoring.weights.nutrients ?? {})) if (!available.has(id)) return failure(`scoring.weights.nutrients.${id}`, "Use a returned or published ingredient ID; weights do not fuzzy-match names.");
  return { ...merged, targets, scoring, optimization: scoring.profile };
}
