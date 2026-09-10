import { scaleAmount, isDoseError } from '@/lib/matcher/dose';
import { sha256Hex } from '@/lib/sha256';

/** Engineering comparison units, NOT recommended intakes or clinical references.
 * Frozen captured labelled amounts; provenance is not upgraded by this policy.
 * Extend only with an explicit scale review and catalogue-fixture evidence. */
export const ZERO_TARGET_POLICY = Object.freeze({
  version: 'zero-target-scales-1',
  source: 'test/fixtures/anna-v6/dev-baseline.json',
  sourceSha256: 'e559d0177134986a47a00e75c04a8cd90f9f4612068875931ede3f294d3cd2c8',
  scales: Object.freeze([
    Object.freeze({ name: 'Vitamin D3', aliases: Object.freeze(['vitamin d3', 'd3']), amount: 25, unit: 'mcg' as const,
      productId: '617d8373-80b3-4ada-99c0-769d502b5b1c', labelledAmount: 1000, labelledUnit: 'IU',
      provenance: 'Captured Blackmores Vitamin D3 1000 IU label; 1000 IU converts to 25 mcg. Engineering scale, not a daily recommendation.' }),
    Object.freeze({ name: 'Selenium', aliases: Object.freeze(['selenium']), amount: 50, unit: 'mcg' as const,
      productId: 'e261adbe-890a-485a-a81e-784608625d11', labelledAmount: 50, labelledUnit: 'mcg',
      provenance: 'Captured Blackmores Multivitamin Active selenium amount, 50 mcg. Engineering scale; original admin provenance remains unverified externally.' })
  ])
});
export const ZERO_TARGET_POLICY_HASH = sha256Hex(JSON.stringify(ZERO_TARGET_POLICY));
export function zeroTargetScale(name: string, subjectId: string) {
  const normalized = name.normalize('NFKC').trim().toLowerCase();
  const policy = ZERO_TARGET_POLICY.scales.find(row => row.aliases.some(alias => alias === normalized));
  if (!policy) return null;
  const amount = scaleAmount({ amount: policy.amount, unit: policy.unit, subjectName: policy.name, subjectId });
  if (isDoseError(amount) || amount.units <= BigInt(0)) throw new Error('Invalid frozen zero-target scale');
  return { ...amount, policy, policyHash: ZERO_TARGET_POLICY_HASH };
}
