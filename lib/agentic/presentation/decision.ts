import { isUuid, publicSupplementId } from "@/lib/agentic/contract/ids";
import { sha256Hex } from "@/lib/sha256";
import { convertAmount } from "@/lib/matcher/dose";
import { recommendedLimitFindings, recommendedLimitMessage } from "@/lib/agentic/presentation/limit-advice";
import { patchScoring } from "@/lib/matcher/scoring-policy";
import { publicScoring } from "@/lib/agentic/contract/scoring";
import { administrationDailyPills, verifiedAdministration } from "@/lib/product-administration";
import type { SimplePlanDecision } from "@/lib/agentic/contract/decision-schema";
import type { PlanResult, StackOption, SafetyGuidance, BasketItem, PlanRequestTarget } from "@/lib/agentic/plan/types";
import type { MatcherUnit } from "@/lib/matcher/types";

const COPY = {
  en: { processing: "Matching your targets. Wait before checking this plan again.", failed: "Matching did not finish. Retry this refinement with scoring:{} and a new idempotency key.",
    ready: "Review the recommended routine, then confirm it or adjust the weights.", selected: "Your routine is selected. Confirm it before checkout.",
    review: "No purchase is recommended. Review the gaps and adjust the targets or weights to refine this plan.", none: "No new supplement purchase is needed for these targets.", noTargets: "No targets remain, so no purchase is recommended.",
    stale: "Product facts changed. Refresh with scoring:{} before choosing a routine.", question: "Answer the question that affects your next choice." },
  th: { processing: "กำลังจับคู่ตามเป้าหมาย โปรดรอก่อนตรวจสอบแผนอีกครั้ง", failed: "การจับคู่ยังไม่เสร็จ ลองส่ง scoring:{} พร้อมคีย์ idempotency ใหม่",
    ready: "ตรวจสอบชุดที่แนะนำ แล้วยืนยันหรือปรับน้ำหนักความสำคัญ", selected: "เลือกชุดแล้ว โปรดยืนยันกิจวัตรก่อนชำระเงิน",
    review: "ยังไม่แนะนำให้ซื้อ โปรดตรวจสอบส่วนที่ยังขาดและปรับเป้าหมายหรือน้ำหนักความสำคัญ", none: "เป้าหมายเหล่านี้ไม่จำเป็นต้องซื้ออาหารเสริมเพิ่ม", noTargets: "ไม่มีเป้าหมายเหลืออยู่ จึงไม่แนะนำให้ซื้อ",
    stale: "ข้อมูลผลิตภัณฑ์เปลี่ยนแล้ว ส่ง scoring:{} เพื่อปรับข้อมูลก่อนเลือก", question: "ตอบคำถามที่มีผลต่อตัวเลือกถัดไป" },
  "zh-CN": { processing: "正在匹配目标，请稍后再查询此计划。", failed: "匹配未完成。请使用 scoring:{} 和新的幂等键重试。",
    ready: "查看推荐组合，然后确认或调整权重。", selected: "已选择组合。结账前请确认日常用量。",
    review: "目前不建议购买。请查看尚未满足的目标，并调整目标或权重以完善方案。", none: "这些目标目前无需购买新的补充剂。", noTargets: "已无目标，因此不建议购买。",
    stale: "产品信息已变化。选择前请用 scoring:{} 刷新。", question: "请回答会影响下一步选择的问题。" }
} as const;
const copy = (locale?: string) => COPY[locale === "th" ? "th" : locale === "zh-CN" || locale === "zh" ? "zh-CN" : "en"];
export function processingDecision(planHandle: string, revision: number, locale?: string, pollAfterSeconds = 3): SimplePlanDecision {
  return { ok: true, planHandle, revision, status: "processing", summary: copy(locale).processing, nextAction: "poll_plan", pollAfterSeconds };
}
export function failedDecision(planHandle: string, revision: number, locale?: string): SimplePlanDecision {
  return { ok: true, planHandle, revision, status: "failed", summary: copy(locale).failed, nextAction: "change_request" };
}
export function decisionOptionId(planHandle: string, revision: number, option: StackOption) {
  return `opt_${sha256Hex(JSON.stringify([planHandle, revision, option.basket.map(row => [row.productId, row.sellerId, row.servingsPerDay, row.quantity, row.unitPriceMinor]).sort()])).slice(0, 32)}`;
}
export function decisionOptions(result: PlanResult) {
  // Internal candidates remain available to matching, but MCP exposes only the
  // current winner (or the explicitly confirmed routine). Refinement re-ranks.
  const options: StackOption[] = result.selected ? [result.selected] : [];
  // Empty supply is still a decision: preserve requested ingredients and gaps
  // using the committed coverage, without inventing a purchasable routine.
  if (!options.length && (result.requestSnapshot.originalRequest?.targets ?? result.requestSnapshot.targets).length) {
    options.push({ optionId: "empty", basket: [], coverage: result.coverage, coveragePercent: 0, dailyPills: 0,
      totalPriceMinor: 0, purchaseEligible: false, roles: ["best_match"], reason: result.summary,
      matcherVersion: result.matcherTelemetry.matcherVersion, snapshotId: result.matcherTelemetry.snapshotId ?? "unknown" });
  }
  return options;
}
type Ready = Extract<SimplePlanDecision, { choices: unknown }>;
type Ingredient = Ready["choices"][number]["ingredients"][number];
function converted(amount: number | null | undefined, from: string | null | undefined, to: string | null, name: string, id: string) {
  if (amount == null || !from || !to) return null;
  return convertAmount({ amount, fromUnit: from, toUnit: to as MatcherUnit, subjectId: id, subjectName: name });
}
function ingredientLimitAdvice(row: SafetyGuidance, ingredient: Ingredient, locale: string): NonNullable<Ingredient["advice"]>[number] | null {
  const exposure = converted(row.exposure, row.unit, ingredient.unit, ingredient.name, ingredient.ingredientId);
  const reference = converted(row.threshold, row.unit, ingredient.unit, ingredient.name, ingredient.ingredientId);
  if (exposure == null || reference == null || !Number.isFinite(exposure) || !Number.isFinite(reference) || exposure <= reference || !ingredient.unit) return null;
  return { kind: "dose_review", severity: "high", message: recommendedLimitMessage(reference, ingredient.unit, locale, ingredient.requested),
    exposure, reference, ...(row.sourceScope ? { referenceScope: row.sourceScope } : {}),
    ...(row.authorityUrl ? { source: row.authorityUrl } : {}), ...(row.uncertainty === "lower_bound" ? { uncertainty: "lower_bound" } : {}) };
}
function choiceIngredients(result: PlanResult, option: StackOption): Ingredient[] {
  const state = result.requestSnapshot, targets = state.originalRequest?.targets ?? state.targets;
  const rows = new Map<string, Ingredient>();
  const unknown = new Set<string>();
  const quantified = new Map<string, number>();
  const identity = (fact: { supplementId?: string | null; name: string }) => (fact.supplementId ? isUuid(fact.supplementId) ? publicSupplementId(fact.supplementId) : fact.supplementId : null) ??
    [...rows.values()].find(row => row.name.toLowerCase() === fact.name.toLowerCase())?.ingredientId ??
    `ing_${sha256Hex(fact.name.toLowerCase()).slice(0, 24)}`;
  for (const target of targets) {
    const id = (target as PlanRequestTarget).ingredientId ?? target.supplementId ?? `req_${sha256Hex(target.name).slice(0, 24)}`;
    const subject = target.supplementId ?? id;
    const coverage = option.coverage.find(row => row.supplementId === subject || row.name === target.name);
    const observations = (state.intake ?? []).filter(row => row.supplementId === subject && (target.basis !== "supplemental" || row.source === "current_supplement"));
    const estimated = observations.filter(row => row.certainty === "estimated");
    let existing: Ingredient["existing"] = coverage?.intakeCertainty === "known" ? coverage.currentAmount : null;
    // The coverage ledger's currentAmount contains only quantified known intake.
    // Add estimated endpoints to that known basis; never silently replace it.
    if (estimated.length && !observations.some(row => row.certainty === "unknown")) {
      const bounds = estimated.map(row => row.certainty === "estimated" ? {
        minimum: converted(row.minimum, row.unit, target.unit, target.name, subject),
        maximum: converted(row.maximum, row.unit, target.unit, target.name, subject)
      } : null);
      if (bounds.every(row => row?.minimum != null && row.maximum != null)) existing = { certainty: "estimated",
        minimum: (coverage?.currentAmount ?? 0) + bounds.reduce((n, row) => n + row!.minimum!, 0),
        maximum: (coverage?.currentAmount ?? 0) + bounds.reduce((n, row) => n + row!.maximum!, 0) };
    }
    rows.set(id, { ingredientId: id, name: target.name, unit: target.unit, requested: target.amount, supplied: 0,
      productIds: [], targetBasis: target.basis ?? "total_daily", existing, gap: null, excess: null });
  }
  for (const product of option.basket) {
    const contributions = [...(product.requestedNutrients ?? []), ...(product.incidentalNutrients ?? [])];
    for (const fact of [...contributions, ...(product.labelledFacts ?? [])]) {
      const id = identity(fact);
      const row = rows.get(id) ?? { ingredientId: id, name: fact.name, unit: fact.unit, requested: null, supplied: 0, productIds: [] };
      if (!row.productIds.includes(product.productId)) row.productIds.push(product.productId);
      rows.set(id, row);
    }
    for (const fact of contributions) {
      const id = identity(fact), row = rows.get(id)!;
      const label = product.labelledFacts?.find(item => identity(item) === id);
      if (label && (label.amount === null || label.mappingStatus !== "verified" || label.confidence !== "high")) { unknown.add(id); continue; }
      const amount = converted(fact.amount, fact.unit, row.unit, fact.name, id);
      if (amount === null) unknown.add(id); else quantified.set(id, (quantified.get(id) ?? 0) + amount);
    }
    for (const fact of product.labelledFacts ?? []) {
      const id = identity(fact);
      if (fact.amount === null || fact.mappingStatus !== "verified" || fact.confidence !== "high" || !contributions.some(item => identity(item) === id)) unknown.add(id);
    }
  }
  const guidance = recommendedLimitFindings(option);
  for (const row of rows.values()) {
    const amount = quantified.get(row.ingredientId) ?? 0;
    row.supplied = unknown.has(row.ingredientId) ? null : amount;
    if (row.supplied === null && amount > 0) row.suppliedAtLeast = amount;
    if (row.requested !== null && typeof row.existing === "number" && row.supplied !== null) {
      row.gap = Math.max(0, row.requested - row.existing - row.supplied);
      row.excess = Math.max(0, row.existing + row.supplied - row.requested);
    }
  }
  // A source finding belongs to the choice once. Link its other affected
  // ingredients instead of cloning the same body on every label constituent.
  const emitted = new Set<string>();
  for (const finding of guidance) {
    const affected = [...rows.values()].filter(row => finding.supplementIds.includes(row.ingredientId) ||
      finding.nutrientName?.toLowerCase() === row.name.toLowerCase());
    const anchor = affected[0]; if (!anchor) continue;
    const advice = ingredientLimitAdvice(finding, anchor, state.locale);
    if (!advice) continue;
    const key = JSON.stringify([anchor.ingredientId, advice.exposure, advice.reference, advice.referenceScope]);
    if (emitted.has(key)) continue;
    emitted.add(key);
    const related = [...new Set([...affected.map(row => row.ingredientId), ...finding.supplementIds])].filter(id => id !== anchor.ingredientId);
    if (related.length) advice.relatedIngredientIds = related;
    (anchor.advice ??= []).push(advice);
  }
  return [...rows.values()];
}
function productDecision(row: BasketItem): Ready["choices"][number]["products"][number] {
  const administration = verifiedAdministration(row.administration);
  return { productId: row.productId, name: row.productName, imageUrl: row.imageUrl || null, productUrl: row.productUrl ?? null,
    quantity: row.quantity, unitPrice: row.incompleteCommercialFacts ? null : row.unitPriceMinor / 100, lineTotal: row.incompleteCommercialFacts ? null : row.lineTotalMinor / 100,
    servingsPerDay: row.servingsPerDay, dailyQuantity: administration?.unitsPerServing != null && administration.physicalUnit !== "unknown" ? { amount: row.servingsPerDay * administration.unitsPerServing!, unit: administration.physicalUnit } : null,
    supplyDays: row.daysOfSupply ?? null };
}
export function presentDecision(result: PlanResult, planHandle: string, revision: number): SimplePlanDecision {
  const state = result.requestSnapshot, text = copy(state.locale);
  if (result.status === "processing") return processingDecision(planHandle, revision, state.locale);
  const options = decisionOptions(result), pinned = state.pinnedOptionId ? result.selected : null;
  const recommended = options[0];
  const noTargets = !(state.originalRequest?.targets ?? state.targets).length;
  const noPurchase = noTargets || result.status === "no_purchase";
  const alreadyCovered = noTargets || result.matchingDiagnostics?.reasonCode === "targets_already_covered";
  const refresh = Boolean(result.refreshRequired), questions = result.questions ?? [];
  const status = refresh || questions.length || (!(pinned ?? recommended)?.basket.length && !noPurchase) ? "needs_input" : noPurchase ? "no_purchase" : "ready";
  const nextAction = refresh ? "change_request" : questions.length ? "answer_questions" : noPurchase && !alreadyCovered ? "change_request" : noPurchase ? result.horizon?.nextReplenishmentDay && result.horizon?.nextReplenishmentDay > 0 ? "replenish_later" : "no_purchase" : pinned?.basket.length ? "execute" : recommended?.basket.length ? "confirm_with_user" : "change_request";
  const summary: string = refresh ? text.stale : questions.length ? text.question : noTargets ? text.noTargets : noPurchase ? alreadyCovered ? text.none : text.review : pinned ? text.selected : recommended?.basket.length ? text.ready : text.review;
  return { ok: true, planHandle, revision, status, summary, scoring: publicScoring(state.scoring ?? patchScoring(undefined)), currency: state.currency,
    recommendedOptionId: !noPurchase && recommended?.basket.length ? decisionOptionId(planHandle, revision, recommended) : null,
    selectedOptionId: pinned ? decisionOptionId(planHandle, revision, pinned) : null, nextAction,
    ...(refresh ? { refreshRequired: true } : {}), ...(result.horizon?.nextReplenishmentDay && result.horizon?.nextReplenishmentDay > 0 ? { nextReplenishmentDay: result.horizon?.nextReplenishmentDay } : {}),
    ...(questions.length ? { questions: questions.map(row => ({ questionId: row.questionId, prompt: row.prompt, choices: row.choices.map(choice => ({ choice: choice.choice, label: choice.label })) })) } : {}),
    choices: options.map(option => {
      const ingredients = choiceIngredients(result, option), requested = ingredients.filter(row => row.requested !== null);
      const coverageComplete = requested.every(row => typeof row.existing === "number" && row.supplied !== null);
      const coverage = requested.length ? 100 * requested.reduce((n, row) => {
        const quantified = (typeof row.existing === "number" ? row.existing : row.existing?.minimum ?? 0) + (row.supplied ?? row.suppliedAtLeast ?? 0);
        // Zero goals contribute a binary known-zero result; unknown never becomes verified zero.
        const contribution = row.requested === 0 ? Number(typeof row.existing === "number" && row.supplied !== null && quantified === 0) : Math.min(1, quantified / row.requested!);
        return n + contribution;
      }, 0) / requested.length : 0;
      const pills = option.basket.map(row => { const count = administrationDailyPills(row.administration); return count === null ? null : count * row.servingsPerDay; });
      const knownPills = pills.reduce<number>((n, count) => n + (count ?? 0), 0), pillsKnown = pills.every(n => n !== null);
      const complete = option.basket.every(row => !row.incompleteCommercialFacts);
      return { optionId: decisionOptionId(planHandle, revision, option), roles: [...(option.roles ?? (option.role ? [option.role] : []))],
        summary: { text: option.reason, pillCount: pillsKnown ? knownPills : null, ...(!pillsKnown ? { pillCountAtLeast: knownPills } : {}), productCount: option.basket.length,
          goodsPrice: complete ? option.basket.reduce((n, row) => n + row.lineTotalMinor, 0) / 100 : null,
          coveragePercent: coverageComplete ? coverage : null, ...(!coverageComplete ? { coverageAtLeastPercent: coverage } : {}), ingredientDataComplete: ingredients.every(row => row.supplied !== null) }, ingredients, products: option.basket.map(productDecision) };
    }) };
}
