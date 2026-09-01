/** Catalogue-owner attestation of pinned DEV safety rules. Amounts come from the DEV ledger. */

export const DEV_SAFETY_RULE_ATTESTATIONS = [
  {
    date: "2026-09-01",
    decision: "accepted_dev_ledger",
    equivalentIu: 40000,
    maxAmount: 1000,
    maxUnit: "mcg",
    name: "Vitamin D3",
    owner: "dev-catalogue-safety",
    sourceScope: "supplemental"
  }
] as const;

export function attestedVitaminD3Rule() {
  return DEV_SAFETY_RULE_ATTESTATIONS[0];
}
