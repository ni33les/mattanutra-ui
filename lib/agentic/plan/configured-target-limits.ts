import { convertAmount } from '@/lib/matcher/dose';
import { knownLimitProfile } from '@/lib/matcher/dose-fit';
import { matcherSafetyCeilings, matcherSafetyReferenceIdentity, safetyCeilingFor } from '@/lib/matcher/safety-ceilings';
import type { CanonicalPlanState, TargetLimitAdjustment } from '@/lib/agentic/plan/types';

export const CONFIGURED_TARGET_LIMIT_POLICY_VERSION = 1;

/** Run inside the operation's immutable reference scope, never on a saved read.
 * Rebuild from customer intent so a changed band/profile can also raise or remove
 * an earlier adjustment. Intake and physical product proposals are untouched. */
export function applyConfiguredTargetLimits(state: CanonicalPlanState): CanonicalPlanState {
  const profile = knownLimitProfile(state);
  const ceilings = matcherSafetyCeilings();
  const targetLimitAdjustments: TargetLimitAdjustment[] = [];
  const targets = state.targets.map((target, targetIndex) => {
    const index = state.originalRequest?.targets.findIndex(row => row.supplementId === target.supplementId ||
      row.ingredientId === target.supplementId || row.name === target.requestedName || row.name === target.name) ?? -1;
    const original = index >= 0 ? state.originalRequest!.targets[index] : undefined;
    const previous = state.targetLimitAdjustments?.find(row => row.supplementId === target.supplementId);
    const amount = original ? convertAmount({ amount: original.amount, fromUnit: original.unit, toUnit: target.unit,
      subjectId: target.supplementId, subjectName: target.name }) : previous?.requestedAmount ?? target.amount;
    if (amount === null) return target;
    const sourceRange = original?.acceptableRange;
    const rangeMinimum = sourceRange && convertAmount({ amount: sourceRange.minimum, fromUnit: sourceRange.unit,
      toUnit: target.unit, subjectId: target.supplementId, subjectName: target.name });
    const rangeMaximum = sourceRange && convertAmount({ amount: sourceRange.maximum, fromUnit: sourceRange.unit,
      toUnit: target.unit, subjectId: target.supplementId, subjectName: target.name });
    const acceptableRange = sourceRange && rangeMinimum != null && rangeMaximum != null
      ? { minimum: rangeMinimum, maximum: rangeMaximum, unit: target.unit } : target.acceptableRange;
    const requested = { ...target, amount, ...(acceptableRange ? { acceptableRange } : {}) };
    const sourceScope = target.basis === 'total_daily' ? 'total' : 'supplemental';
    const ceiling = profile && safetyCeilingFor(ceilings, { subjectId: target.supplementId, name: target.name, profile, sourceScope });
    if (!ceiling || !Number.isFinite(ceiling.maxAmount) || ceiling.maxAmount <= 0) return requested;
    const limit = convertAmount({ amount: ceiling.maxAmount, fromUnit: ceiling.maxUnit, toUnit: target.unit,
      subjectId: target.supplementId, subjectName: target.name });
    if (limit === null || !Number.isFinite(limit) || limit <= 0 || amount <= limit) return requested;
    targetLimitAdjustments.push({ requestIndex: index >= 0 ? index : targetIndex,
      ingredientId: original?.ingredientId ?? target.supplementId, supplementId: target.supplementId,
      name: original?.name ?? target.requestedName ?? target.name, requestedAmount: amount, appliedAmount: limit, unit: target.unit,
      sourceScope, bandId: ceiling.bandId ?? null, bandVersion: ceiling.bandVersion ?? null });
    return { ...requested, amount: limit, ...(acceptableRange ? { acceptableRange: {
      ...acceptableRange, minimum: Math.min(acceptableRange.minimum, limit), maximum: Math.min(acceptableRange.maximum, limit)
    } } : {}) };
  });
  return { ...state, targets, targetLimitAdjustments, configuredLimitPolicy: {
    version: CONFIGURED_TARGET_LIMIT_POLICY_VERSION, referenceFingerprint: matcherSafetyReferenceIdentity()?.fingerprint ?? null
  } };
}

/** Public requested remains customer intent; only adjusted rows use another denominator. */
export function appliedTargetAmount(state: CanonicalPlanState, ingredientId: string, requested: number) {
  return state.targetLimitAdjustments?.find(row => row.ingredientId === ingredientId || row.supplementId === ingredientId)?.appliedAmount ?? requested;
}
