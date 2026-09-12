import { sha256Hex } from '@/lib/sha256';
import { webIngredientAvailability } from '@/lib/matcher/adapters/web';
import type { ProductRecommendationInput } from '@/lib/product-recommendation-types';
import type { CanonicalSupplementOption } from '@/lib/canonical-supplements';
import type { FormulationBlueprint, LocalizedText } from '@/lib/formulation-types';

export const FORMULATION_AVAILABILITY_POLICY = 'product-backed-v1';
export type FormulationAvailability = Readonly<{ policy: typeof FORMULATION_AVAILABILITY_POLICY; catalogueIdentity: string; inputIdentity: string; supplements: CanonicalSupplementOption[] }>;
const words = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const texts = (value: LocalizedText | undefined) => typeof value === 'string' ? [value] : Object.values(value ?? {}).filter((value): value is string => typeof value === 'string');
function keys(row: CanonicalSupplementOption) { return new Set([row.name, row.normalizedName, row.id, ...row.aliases].map(words)); }
export function constrainFormulation(formula: FormulationBlueprint, permitted: readonly CanonicalSupplementOption[]): FormulationBlueprint {
  const allowed = permitted.map(keys);
  const included = formula.supplementBreakdown.filter(row => [row.id, ...texts(row.supplement)].some(name => allowed.some(set => set.has(words(name)))));
  const removed = formula.supplementBreakdown.filter(row => !included.includes(row));
  const removedNames = removed.flatMap(row => [row.id, ...texts(row.supplement)]).map(words).filter(Boolean);
  const dependsOnRemoved = (row: { id: string; title?: LocalizedText; body?: LocalizedText }) => [row.id, ...texts(row.title), ...texts(row.body)].some(value => removedNames.some(name => ` ${words(value)} `.includes(` ${name} `)));
  return { ...formula, supplementBreakdown: included.map((row,index) => ({ ...row, effectivenessRank: index+1,
    ...(row.cautions ? { cautions: row.cautions.filter(caution => !dependsOnRemoved(caution)) } : {}) })),
    cautions: (formula.cautions ?? []).filter(row => !dependsOnRemoved(row)),
    marketingPoints: (formula.marketingPoints ?? []).filter(row => !dependsOnRemoved(row)) };
}
export function formulationAvailabilityIdentity(catalogueIdentity: string, input: unknown, supplements: CanonicalSupplementOption[]): FormulationAvailability {
  return { policy: FORMULATION_AVAILABILITY_POLICY, catalogueIdentity,
    inputIdentity: sha256Hex(JSON.stringify({ policy: FORMULATION_AVAILABILITY_POLICY, catalogueIdentity, input, supplements })), supplements };
}
export function productBackedSupplements(options: readonly CanonicalSupplementOption[], input: ProductRecommendationInput) {
  const available = webIngredientAvailability(input);
  const names = new Set(input.needs.filter(need => available.supplied.has(need.normalizedName || need.sourceId || need.id)).map(need => need.displayName));
  return options.filter(row => names.has(row.name));
}
export function publishedFormulation(formula: FormulationBlueprint, payload: unknown, resultPayload: unknown) {
  const permitted = (payload as {formulationAvailability?: FormulationAvailability})?.formulationAvailability;
  if (!permitted) return formula; // Already-running tasks from the previous build retain their frozen inputs.
  if (permitted.policy !== FORMULATION_AVAILABILITY_POLICY || (resultPayload as {formulationAvailabilityIdentity?: string})?.formulationAvailabilityIdentity !== permitted.inputIdentity) {
    throw new Error('Formulation result does not match its permitted ingredient input');
  }
  return constrainFormulation(formula, permitted.supplements);
}
