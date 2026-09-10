import { isUuid, publicSupplementId } from "@/lib/agentic/contract/ids";
import { sha256Hex } from "@/lib/sha256";
import { convertAmount } from "@/lib/matcher/dose";
import { formatNutrientAmount } from "@/lib/agentic/presentation/amount";
import { adviceKind } from "@/lib/agentic/value/advice-kind";
import { patchScoring } from "@/lib/matcher/scoring-policy";
import { administrationDailyPills, verifiedAdministration } from "@/lib/product-administration";
import type { SimplePlanDecision } from "@/lib/agentic/contract/decision-schema";
import type { PlanResult, StackOption, SafetyGuidance, BasketItem, PlanRequestTarget } from "@/lib/agentic/plan/types";
import type { MatcherUnit } from "@/lib/matcher/types";

const COPY = {
  en: { processing: "Matching your targets. Wait before checking this plan again.", failed: "Matching did not finish. Retry this refinement with scoring:{} and a new idempotency key.",
    ready: "Review the recommended routine and its ingredient advice, then confirm your choice.", selected: "Your choice is selected. Confirm the routine and ingredient advice before checkout.",
    review: "No purchase is recommended; review the available choices and remaining gaps.", none: "No new supplement purchase is needed for these targets.", noTargets: "No targets remain, so no purchase is recommended.",
    stale: "Product facts changed. Refresh with scoring:{} before choosing a routine.", question: "Answer the question that affects your next choice.",
    unknown: "Some reported health context has not been assessed; absence of an interaction finding is not clearance.",
    missing: "No verified applicable reference is available; exposure cannot be described as below a limit.", product: "Composition or administration information is unverified or incomplete. Quantities remain uncertain.",
    interaction: "A possible interaction needs review. Read the supporting source before deciding.", overlap: "Several products contribute this ingredient. Review the combined daily exposure.", dose: "Review daily exposure against the applicable reference.", other: "Review this ingredient finding and its supporting source." },
  th: { processing: "กำลังจับคู่ตามเป้าหมาย โปรดรอก่อนตรวจสอบแผนอีกครั้ง", failed: "การจับคู่ยังไม่เสร็จ ลองส่ง scoring:{} พร้อมคีย์ idempotency ใหม่",
    ready: "ตรวจสอบชุดที่แนะนำและคำแนะนำของส่วนประกอบ ก่อนยืนยันตัวเลือก", selected: "เลือกชุดแล้ว โปรดยืนยันกิจวัตรและคำแนะนำของส่วนประกอบก่อนชำระเงิน",
    review: "ยังไม่แนะนำให้ซื้อ โปรดตรวจสอบตัวเลือกและส่วนที่ยังขาด", none: "เป้าหมายเหล่านี้ไม่จำเป็นต้องซื้ออาหารเสริมเพิ่ม", noTargets: "ไม่มีเป้าหมายเหลืออยู่ จึงไม่แนะนำให้ซื้อ",
    stale: "ข้อมูลผลิตภัณฑ์เปลี่ยนแล้ว ส่ง scoring:{} เพื่อปรับข้อมูลก่อนเลือก", question: "ตอบคำถามที่มีผลต่อตัวเลือกถัดไป",
    unknown: "ข้อมูลสุขภาพที่แจ้งบางส่วนยังไม่ได้รับการประเมิน การไม่พบข้อค้นพบเรื่องปฏิกิริยาระหว่างกันไม่ใช่การรับรอง",
    missing: "ไม่มีค่าอ้างอิงที่ใช้ได้และผ่านการยืนยัน จึงไม่อาจกล่าวว่าปริมาณต่ำกว่าขีดอ้างอิง", product: "ข้อมูลส่วนประกอบหรือวิธีใช้ยังไม่ครบหรือยังไม่ยืนยัน ปริมาณยังมีความไม่แน่นอน",
    interaction: "ควรทบทวนปฏิกิริยาที่อาจเกิดขึ้น อ่านแหล่งข้อมูลก่อนตัดสินใจ", overlap: "หลายผลิตภัณฑ์ให้ส่วนประกอบนี้ โปรดทบทวนปริมาณรวมต่อวัน", dose: "ทบทวนปริมาณต่อวันเทียบกับค่าอ้างอิงที่เกี่ยวข้อง", other: "ทบทวนข้อค้นพบเกี่ยวกับส่วนประกอบนี้และแหล่งข้อมูล" },
  "zh-CN": { processing: "正在匹配目标，请稍后再查询此计划。", failed: "匹配未完成。请使用 scoring:{} 和新的幂等键重试。",
    ready: "查看推荐组合及成分建议，然后确认选择。", selected: "已选择组合。结账前请确认日常用量和成分建议。",
    review: "目前不建议购买；请查看可选组合及尚未满足的目标。", none: "这些目标目前无需购买新的补充剂。", noTargets: "已无目标，因此不建议购买。",
    stale: "产品信息已变化。选择前请用 scoring:{} 刷新。", question: "请回答会影响下一步选择的问题。",
    unknown: "部分已报告的健康背景尚未评估；没有相互作用提示并不表示已获确认。",
    missing: "缺少经过核实且适用的参考值，无法声称摄入量低于限值。", product: "成分或服用信息未经核实或不完整，用量仍有不确定性。",
    interaction: "可能存在相互作用，请在决定前查阅支持来源。", overlap: "多个产品含有此成分，请查看每日合计摄入量。", dose: "请根据适用参考值查看每日摄入量。", other: "请查看此成分的提示及支持来源。" }
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
  const seen = new Set<string>();
  const options = [result.selected, ...result.alternatives].filter((option): option is StackOption => {
    if (!option) return false;
    const key = JSON.stringify(option.basket.map(row => [row.productId, row.servingsPerDay]).sort());
    if (seen.has(key)) return false; seen.add(key); return true;
  });
  // Empty supply is still a decision: preserve requested ingredients and gaps
  // using the committed coverage, without inventing a purchasable routine.
  if (!options.length && (result.requestSnapshot.originalRequest?.targets ?? result.requestSnapshot.targets).length) {
    options.push({ optionId: "empty", basket: [], coverage: result.coverage, coveragePercent: 0, dailyPills: 0,
      totalPriceMinor: 0, purchaseEligible: false, roles: ["best_match"], reason: result.summary,
      matcherVersion: result.matcherTelemetry.matcherVersion, snapshotId: result.matcherTelemetry.snapshotId });
  }
  return options;
}
type Ready = Extract<SimplePlanDecision, { choices: unknown }>;
type Ingredient = Ready["choices"][number]["ingredients"][number];
function converted(amount: number | null | undefined, from: string | null | undefined, to: string | null, name: string, id: string) {
  if (amount == null || !from || !to) return null;
  return convertAmount({ amount, fromUnit: from, toUnit: to as MatcherUnit, subjectId: id, subjectName: name });
}
function adviceIdentity(row: SafetyGuidance) {
  return JSON.stringify([row.code, row.ruleId, row.rulesVersion, row.sourceScope, row.exposure, row.threshold, row.unit,
    row.authorityUrl, row.uncertainty, row.productIds.slice().sort(), row.supplementIds.slice().sort()]);
}
function adviceRows(findings: readonly SafetyGuidance[], ingredient: Ingredient, locale: string): NonNullable<Ingredient["advice"]> {
  const seen = new Set<string>(), text = copy(locale);
  return findings.flatMap(row => {
    const key = adviceIdentity(row);
    if (seen.has(key)) return []; seen.add(key);
    const kind = adviceKind(row), measured = row.threshold != null && row.threshold > 0;
    const exposure = converted(row.exposure, row.unit, ingredient.unit, ingredient.name, ingredient.ingredientId);
    const reference = measured ? converted(row.threshold, row.unit, ingredient.unit, ingredient.name, ingredient.ingredientId) : null;
    const message = kind === "incomplete_information" ? text.missing : kind === "product_data" ? text.product : kind === "interaction" ? text.interaction : kind === "overlap" ? text.overlap : kind === "dose_review" ? text.dose : text.other;
    const amounts = exposure !== null && reference !== null ? ` ${formatNutrientAmount(exposure, ingredient.unit, ingredient.requested)} / ${formatNutrientAmount(reference, ingredient.unit, ingredient.requested)} ${ingredient.unit}.` : "";
    return [{ kind, severity: kind === "incomplete_information" ? "low" as const : row.severity === "info" ? "low" as const : "high" as const,
      message: message + amounts, ...(row.exposure !== null ? { exposure } : {}), ...(kind === "dose_review" || kind === "incomplete_information" ? { reference } : {}),
      ...(row.sourceScope ? { referenceScope: row.sourceScope } : {}), ...(row.authorityUrl ? { source: row.authorityUrl } : {}),
      ...(row.uncertainty ? { uncertainty: row.uncertainty } : {}), ...(row.supplementIds.length > 1 ? { relatedIngredientIds: row.supplementIds.filter(id => id !== ingredient.ingredientId) } : {}) }];
  });
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
  const guidance = option.safety?.guidance ?? [];
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
    const key = adviceIdentity(finding);
    if (emitted.has(key)) continue;
    const affected = [...rows.values()].filter(row => finding.supplementIds.includes(row.ingredientId) ||
      finding.nutrientName?.toLowerCase() === row.name.toLowerCase() ||
      (adviceKind(finding) === "product_data" && finding.productIds.some(id => row.productIds.includes(id))));
    const anchor = affected[0]; if (!anchor) continue;
    emitted.add(key);
    const advice = adviceRows([finding], anchor, state.locale)[0];
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
  const recommended = options.find(option => option.roles?.includes("best_match")) ?? result.selected;
  const noTargets = !(state.originalRequest?.targets ?? state.targets).length;
  const noPurchase = noTargets || result.status === "no_purchase";
  const alreadyCovered = noTargets || result.matchingDiagnostics?.reasonCode === "targets_already_covered";
  const purchaseAvailable = options.some(option => option.basket.length && option.purchaseEligible !== false);
  const refresh = Boolean(result.refreshRequired), questions = result.questions ?? [];
  const status = refresh || questions.length || (!(pinned ?? recommended)?.basket.length && !noPurchase) ? "needs_input" : noPurchase ? "no_purchase" : "ready";
  const nextAction = refresh ? "change_request" : questions.length ? "answer_questions" : noPurchase && !alreadyCovered ? purchaseAvailable ? "review_options" : "change_request" : noPurchase ? result.horizon?.nextReplenishmentDay && result.horizon?.nextReplenishmentDay > 0 ? "replenish_later" : "no_purchase" : pinned?.basket.length ? "execute" : recommended?.basket.length ? "confirm_with_user" : "review_options";
  let summary: string = refresh ? text.stale : questions.length ? text.question : noTargets ? text.noTargets : noPurchase ? alreadyCovered ? text.none : text.review : pinned ? text.selected : recommended?.basket.length ? text.ready : text.review;
  const unassessed = state.medicationCodes.some(code => !(result.selected?.safety?.assessedMedicationCodes ?? []).includes(code)) || state.conditionCodes.some(code => !(result.selected?.safety?.assessedConditionCodes ?? []).includes(code));
  if (unassessed) summary += ` ${text.unknown}`;
  return { ok: true, planHandle, revision, status, summary, scoring: state.scoring ?? patchScoring(undefined), currency: state.currency,
    recommendedOptionId: !noPurchase && recommended?.basket.length ? decisionOptionId(planHandle, revision, recommended) : null,
    selectedOptionId: pinned ? decisionOptionId(planHandle, revision, pinned) : null, nextAction,
    ...(refresh ? { refreshRequired: true } : {}), ...(result.horizon?.nextReplenishmentDay && result.horizon?.nextReplenishmentDay > 0 ? { nextReplenishmentDay: result.horizon?.nextReplenishmentDay } : {}),
    ...(questions.length ? { questions: questions.map(row => ({ questionId: row.questionId, prompt: row.prompt, choices: row.choices.map(choice => ({ choice: choice.choice, label: choice.label })) })) } : {}),
    choices: options.map(option => {
      const ingredients = choiceIngredients(result, option), requested = ingredients.filter(row => row.requested !== null);
      const coverageComplete = requested.every(row => typeof row.existing === "number" && row.supplied !== null);
      const coverage = requested.length ? 100 * requested.reduce((n, row) => n + Math.min(1, ((typeof row.existing === "number" ? row.existing : row.existing?.minimum ?? 0) + (row.supplied ?? row.suppliedAtLeast ?? 0)) / row.requested!), 0) / requested.length : 0;
      const pills = option.basket.map(row => { const count = administrationDailyPills(row.administration); return count === null ? null : count * row.servingsPerDay; });
      const knownPills = pills.reduce<number>((n, count) => n + (count ?? 0), 0), pillsKnown = pills.every(n => n !== null);
      const complete = option.basket.every(row => !row.incompleteCommercialFacts);
      return { optionId: decisionOptionId(planHandle, revision, option), roles: [...(option.roles ?? (option.role ? [option.role] : []))],
        summary: { text: option.reason, pillCount: pillsKnown ? knownPills : null, ...(!pillsKnown ? { pillCountAtLeast: knownPills } : {}), productCount: option.basket.length,
          goodsPrice: complete ? option.basket.reduce((n, row) => n + row.lineTotalMinor, 0) / 100 : null,
          coveragePercent: coverageComplete ? coverage : null, ...(!coverageComplete ? { coverageAtLeastPercent: coverage } : {}), ingredientDataComplete: ingredients.every(row => row.supplied !== null) }, ingredients, products: option.basket.map(productDecision) };
    }) };
}
