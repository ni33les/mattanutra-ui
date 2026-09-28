import { formatNutrientAmount } from '@/lib/agentic/presentation/amount';
import type { CanonicalPlanState } from '@/lib/agentic/plan/types';

export function targetLimitIssues(state: CanonicalPlanState) {
  return (state.targetLimitAdjustments ?? []).map(row => {
    const name = row.name.length > 60 ? `${row.name.slice(0, 59)}…` : row.name;
    const requested = `${formatNutrientAmount(row.requestedAmount, row.unit)} ${row.unit}`;
    const applied = `${formatNutrientAmount(row.appliedAmount, row.unit)} ${row.unit}`;
    const message = state.locale === 'th'
      ? `${name}: ขอ ${requested}/วัน; วางแผนที่ขีดจำกัดที่ MattaNutra กำหนด ${applied}/วัน`
      : state.locale === 'zh-CN' || state.locale === 'zh'
        ? `${name}：请求量为每天 ${requested}；按 MattaNutra 配置的上限每天 ${applied} 制定计划。`
        : `${name}: requested ${requested}/day; planned to MattaNutra's configured limit of ${applied}/day.`;
    return { fieldPath: `targets[${row.requestIndex}]`, itemId: row.ingredientId,
      code: 'adjusted_to_configured_limit' as const, message };
  });
}
