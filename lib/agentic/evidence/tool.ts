import { businessError, isAgenticErrorResult } from "@/lib/agentic/contract/errors";
import { readPlanPresentation } from "@/lib/agentic/presentation/plan-read";
import { decisionOptions, decisionOptionId, presentDecision } from "@/lib/agentic/presentation/decision";
import type { AgenticRuntime } from "@/lib/agentic/runtime";

/** Evidence is scoped to one current choice and one returned ingredient or product. */
export async function evidenceTool(input: Pick<AgenticRuntime, "config" | "now" | "scope" | "store"> & Readonly<{
  planHandle: string; expectedRevision: number; optionId: string; ingredientId?: string; productId?: string;
}>) {
  const saved = await readPlanPresentation(input, input.planHandle);
  if (isAgenticErrorResult(saved)) return saved;
  if (saved.revision.revision !== input.expectedRevision) return businessError({ reasonCode: "stale_revision", fieldPath: "expectedRevision",
    currentRevision: saved.revision.revision, message: "Use the current revision and its returned IDs." });
  const option = decisionOptions(saved.result).find(row => decisionOptionId(input.planHandle, input.expectedRevision, row) === input.optionId);
  if (!option) return businessError({ reasonCode: "not_found", fieldPath: "optionId", message: "Not found." });
  const decision = presentDecision(saved.result, input.planHandle, input.expectedRevision);
  const choice = "choices" in decision ? decision.choices.find(row => row.optionId === input.optionId) : undefined;
  const ingredient = choice?.ingredients.find(row => row.ingredientId === input.ingredientId);
  const product = option.basket.find(row => row.productId === input.productId);
  if (input.ingredientId ? !ingredient : !product) return businessError({ reasonCode: "not_found", fieldPath: input.ingredientId ? "ingredientId" : "productId", message: "Use an ID returned for this choice." });
  const products = product ? [product] : option.basket.filter(row => ingredient!.productIds.includes(row.productId));
  const facts = products.flatMap(row => (row.labelledFacts ?? []).filter(fact => !ingredient || fact.supplementId === ingredient.ingredientId || fact.name.toLowerCase() === ingredient.name.toLowerCase())
    .map(fact => ({ productId: row.productId, ...fact })));
  const findings = (option.safety?.guidance ?? []).filter(row => product ? row.productIds.includes(product.productId) : row.supplementIds.includes(ingredient!.ingredientId) || row.nutrientName?.toLowerCase() === ingredient!.name.toLowerCase());
  return { ok: true as const, planHandle: input.planHandle, revision: input.expectedRevision, optionId: input.optionId,
    ...(product ? { productId: product.productId, administration: product.administration ?? null } : { ingredientId: input.ingredientId }), facts,
    findings: findings.map(row => ({ ruleId: row.ruleId, ruleVersion: row.rulesVersion, message: row.message, exposure: row.exposure,
      reference: row.threshold, unit: row.unit, scope: row.sourceScope, source: row.authorityUrl ?? null, evidence: [...(row.evidence ?? [])], uncertainty: row.uncertainty ?? null })) };
}
