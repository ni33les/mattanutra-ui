/** Pharmacy attribution is operational metadata, never a matching input. */
export type PharmacySource = "in_store" | "business_card" | "unknown";
export type PharmacyAcquisition = Readonly<{ source: PharmacySource; ray: string }>;
export const pharmacySources: readonly PharmacySource[] = ["in_store", "business_card", "unknown"];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function pharmacySource(value: unknown, missing: PharmacySource = "in_store"): PharmacySource {
  return value === undefined || value === null ? missing : value === "in_store" || value === "business_card" ? value : "unknown";
}
export function pharmacyAcquisitionFromAnswers(answers: unknown): PharmacyAcquisition | null {
  const value = record(record(record(answers).inStorePharmacy).acquisition);
  return typeof value.ray === "string" && uuid.test(value.ray) ? { source: pharmacySource(value.source, "unknown"), ray: value.ray } : null;
}
export function resolvePharmacyAcquisition(bpm: unknown, previousAnswers: unknown, fallbackRay: string): PharmacyAcquisition {
  const saved = pharmacyAcquisitionFromAnswers(previousAnswers);
  if (saved) return saved;
  // Existing assessments without attribution are historical unknowns, never new in-store scans.
  if (record(previousAnswers).inStorePharmacy) return { source: "unknown", ray: fallbackRay };
  const input = record(bpm), attribution = record(input.attribution);
  return { source: pharmacySource(attribution.sourceDetail, "unknown"), ray: typeof input.ray === "string" && uuid.test(input.ray) ? input.ray : fallbackRay };
}
export function pharmacyBpmAttribution(slug: string, acquisition: PharmacyAcquisition) {
  return { trafficSource: "pharmacy", sourceChannel: slug, sourceDetail: acquisition.source };
}
export function withoutPharmacyAcquisition<T>(answers: T): T {
  const value = record(answers), pharmacy = record(value.inStorePharmacy);
  if (!("acquisition" in pharmacy)) return answers;
  const matchingPharmacy = { ...pharmacy };
  delete matchingPharmacy.acquisition;
  return { ...value, inStorePharmacy: matchingPharmacy } as T;
}
export const pharmacySourceLabels = {
  en: { in_store: "In-store QR", business_card: "Business-card QR", unknown: "Unknown" },
  th: { in_store: "QR ภายในร้านยา", business_card: "QR บนนามบัตร", unknown: "ไม่ทราบแหล่งที่มา" },
  "zh-CN": { in_store: "店内二维码", business_card: "名片二维码", unknown: "未知来源" }
} as const;
