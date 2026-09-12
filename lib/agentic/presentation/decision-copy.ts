import { formatNutrientAmount } from "@/lib/agentic/presentation/amount";
import { convertAmount } from "@/lib/matcher/dose";
import type { MatcherUnit } from "@/lib/matcher/types";
import type { SimplePlanDecision } from "@/lib/agentic/contract/decision-schema";
import type { CanonicalPlanState } from "@/lib/agentic/plan/types";
type Choice = Extract<SimplePlanDecision, { choices: unknown }>["choices"][number];
const number = (value: number) => formatNutrientAmount(value, "mg");
const words = (locale: string) => locale === "th" ? "th" : locale === "zh-CN" || locale === "zh" ? "zh" : "en";
const choose = (locale: string, en: string, th: string, zh: string) => ({ en, th, zh })[words(locale)];
export function boundedDecisionCopy(parts: readonly string[]) {
  let text = "";
  for (const part of parts.filter(Boolean)) {
    const next = `${text}${text ? " " : ""}${part}`;
    if (next.length > 600) break;
    text = next;
  }
  return text;
}

/** Describe quantified contributions, never diagnose a gap in unknown total intake. */
export function requestFitCopy(state: CanonicalPlanState, choice: Choice) {
  const locale = state.locale, parts: string[] = [];
  const goods = choice.summary.goodsPrice, preferred = state.requirements.maxPriceMinor;
  if (preferred != null && goods != null && Math.round(goods * 100) > preferred) {
    const actualMinor = Math.round(goods * 100), delta = actualMinor - preferred;
    const amounts = `${number(goods)} / ${number(preferred / 100)} ${state.currency}`;
    const excess = `${number(delta / 100)} ${state.currency}${preferred > 0 ? ` (${number(100 * delta / preferred)}%)` : ""}`;
    parts.push(choose(locale, `First-order goods ${amounts}; ${excess} over budget, delivery excluded.`,
      `ค่าสินค้าครั้งแรก ${amounts} เกินงบ ${excess} ไม่รวมค่าจัดส่ง`, `首次商品金额 ${amounts}，超出预算 ${excess}，不含运费。`));
  }
  const requested = choice.ingredients.filter(row => row.requested !== null && row.requested > 0);
  const contribution = (row: Choice["ingredients"][number]) => (row.supplied ?? row.suppliedAtLeast ?? 0) + (typeof row.existing === "number" ? row.existing : 0);
  const met = requested.filter(row => contribution(row) >= row.requested!);
  if (requested.length) {
    const names = met.slice(0, 3).map(row => row.name).join(", ");
    parts.push(choose(locale, `Known contributions meet ${met.length}/${requested.length} requested amounts${names ? ` (${names})` : ""}.`,
      `ปริมาณที่ทราบถึงเป้าหมาย ${met.length}/${requested.length} รายการ${names ? ` (${names})` : ""}`, `已知贡献达到 ${met.length}/${requested.length} 项请求量${names ? `（${names}）` : ""}。`));
  }
  if (requested.some(row => row.existing === null || typeof row.existing === "object" || row.supplied === null)) parts.push(choose(locale,
    "Other intake or quantities remain unknown/estimated.", "ปริมาณจากแหล่งอื่นหรือบางปริมาณยังไม่ทราบหรือเป็นค่าประมาณ", "其他摄入或部分数量仍未知或为估计值。"));
  const gaps = requested.filter(row => contribution(row) < row.requested!).sort((a, b) => contribution(a) / a.requested! - contribution(b) / b.requested! || a.ingredientId.localeCompare(b.ingredientId));
  for (const row of gaps.slice(0, 3)) {
    const actual = contribution(row), amount = formatNutrientAmount(actual, row.unit ?? "mg", row.requested);
    const target = formatNutrientAmount(row.requested!, row.unit ?? "mg", row.requested);
    const detail = `${row.name}: ${amount}/${target} ${row.unit ?? ""}`;
    parts.push(choose(locale, `Known contribution ${detail} requested.`, `ปริมาณที่ทราบ ${detail} ตามเป้าหมาย`, `已知贡献/请求量 ${detail}。`));
  }
  if (gaps.length > 3) parts.push(choose(locale, `${gaps.length - 3} other gaps in ingredients.`, `ดูส่วนที่ยังขาดอีก ${gaps.length - 3} รายการในส่วนผสม`, `成分中另列 ${gaps.length - 3} 项差额。`));
  return parts;
}

type RefinementFacts = Pick<Choice, "ingredients"> & { summary: Pick<Choice["summary"], "goodsPrice" | "productCount"> };
export function refinementCopy(before: RefinementFacts, after: RefinementFacts, previousCurrency: string, state: CanonicalPlanState) {
  const locale = state.locale, parts: string[] = [];
  const oldPrice = before.summary.goodsPrice, newPrice = after.summary.goodsPrice;
  if (previousCurrency === state.currency && oldPrice != null && newPrice != null) {
    const delta = Math.round(newPrice * 100) - Math.round(oldPrice * 100);
    if (delta) parts.push(choose(locale, `${number(Math.abs(delta) / 100)} ${state.currency} ${delta < 0 ? "less" : "more"} in first-order goods.`,
      `ค่าสินค้าครั้งแรก${delta < 0 ? "ลดลง" : "เพิ่มขึ้น"} ${number(Math.abs(delta) / 100)} ${state.currency}`, `首次商品金额${delta < 0 ? "减少" : "增加"} ${number(Math.abs(delta) / 100)} ${state.currency}。`));
  } else parts.push(choose(locale, "Price comparison unavailable.", "ยังเปรียบเทียบราคาไม่ได้", "价格无法比较。"));
  const count = after.summary.productCount - before.summary.productCount;
  if (count) parts.push(choose(locale, `${Math.abs(count)} ${count < 0 ? "fewer" : "more"} product${Math.abs(count) === 1 ? "" : "s"}.`,
    `จำนวนผลิตภัณฑ์${count < 0 ? "ลดลง" : "เพิ่มขึ้น"} ${Math.abs(count)} รายการ`, `产品${count < 0 ? "减少" : "增加"} ${Math.abs(count)} 件。`));
  const changes = after.ingredients.filter(row => row.requested !== null).flatMap(row => {
    const old = before.ingredients.find(item => item.ingredientId === row.ingredientId);
    if (!old || old.supplied === null || row.supplied === null || !old.unit || !row.unit) return [];
    const converted = convertAmount({ amount: old.supplied, fromUnit: old.unit, toUnit: row.unit as MatcherUnit, subjectId: row.ingredientId, subjectName: row.name });
    if (converted == null || converted === row.supplied) return [];
    return [{ row, old: converted, reduction: row.supplied < converted }];
  }).sort((a, b) => Number(b.reduction) - Number(a.reduction) || a.row.ingredientId.localeCompare(b.row.ingredientId));
  for (const { row, old } of changes.slice(0, 3)) {
    const values = `${row.name} ${formatNutrientAmount(old, row.unit!, row.requested)} → ${formatNutrientAmount(row.supplied!, row.unit!, row.requested)} ${row.unit}`;
    parts.push(choose(locale, `${values}/day from products.`, `${values}/วันจากผลิตภัณฑ์`, `产品每天提供 ${values}。`));
  }
  return boundedDecisionCopy(parts);
}
