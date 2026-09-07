# Anna v6 data review — 7 September 2026

These are independent DEV and UAT manifests. Each correction compares its reviewed before-state, appends an immutable audit receipt and rejects changed inputs or a changed manifest under the same correction ID. No manifest changes product prices, nutrient confidence, orders or payment identities. Apply compatible reference readers and the additive receipt schema before applying data.

Each environment's review covers all 79 sellable product identities (154 retailer listings). There are 57 administration corrections: 45 establish a composition basis and 12 verify only physical form, leaving the serving basis unknown. Two existing corrections remain intact; 15 products lack a matching authoritative label and five have conflicting or ambiguous evidence. Unsupported quantities stay null. Seventeen pack quantities have product-specific source support; other pack quantities remain unknown. The separate review files retain every attempted source, its retrieval outcome and archived content hashes.

The three nutrient-fact corrections are transcription differences for the Thailand Multilives formulation: Vitamin C 60 mg, biotin 50 mcg and lutein 6 mg per softgel. Original confidence is preserved. The manufacturer explicitly identifies the formulation as available in Thailand. Administration verification does not independently upgrade nutrient evidence.

Reference review covers 18 latest heads across six nutrients. Historical versions and prior product-review notes remain in the append-only history and correction evidence.

| Reference | Reviewed treatment |
| --- | --- |
| Vitamin D3 | Retire supplemental-scoped copies and publish the FNB total-intake reference. Adult DEV 1,000 mcg becomes 100 mcg / 4,000 IU; UAT's existing 100 mcg is preserved. Age-specific values retain original source units. |
| Vitamin B6 | Correct supported FNB child/adolescent and pregnancy/lactation scope to total intake. Disclose the adult/teen pregnancy distinction and lower EFSA references. Existing adult internal amounts differ by environment and remain low-confidence internal thresholds pending a governed policy decision. |
| Niacin/B3 | Restore the FNB 35 mg/day added-niacin reference; do not treat tryptophan equivalents as added niacin. Disclose form differences and unquantified fortified-food exposure. |
| Glucosamine, probiotics, B. longum | Preserve each environment's internal amount with low confidence and explicit uncertainty. The linked authorities support cautions and uncertainty, not those numerical thresholds. |

Primary references: [Vitamin D](https://ods.od.nih.gov/factsheets/VitaminD-HealthProfessional/), [Vitamin B6](https://ods.od.nih.gov/factsheets/VitaminB6-HealthProfessional/), [Niacin](https://ods.od.nih.gov/factsheets/Niacin-HealthProfessional/), [Probiotics](https://ods.od.nih.gov/factsheets/Probiotics-HealthProfessional/), [Glucosamine](https://www.nccih.nih.gov/health/glucosamine-and-chondroitin-for-osteoarthritis-what-you-need-to-know). Product-specific sources and hashes are in each correction. [CALPLEX's manufacturer](https://www.vistra.co.th/product/vistra-calplex-calcium-600-mg-menaquinone-7-plus/) verifies a tablet basis; its local pack quantity remains unset.

Read-only review commands:

```sh
node --experimental-strip-types --import ./scripts/register-ts-path-loader.mjs scripts/apply-catalogue-corrections.ts data/corrections/anna-v6-2026-09-07/dev-catalogue.json
node --experimental-strip-types --import ./scripts/register-ts-path-loader.mjs scripts/correct-supplement-safety-references.ts --environment dev --manifest data/corrections/anna-v6-2026-09-07/dev-references.json
```

Select the matching UAT files and environment for UAT. `--apply` writes reviewed changes; repeating it verifies the same receipt and resulting heads. After any subsequent source review, produce a new correction identity rather than editing an applied manifest. Rollback must retain the latest-head-before-null-filter reader and immutable receipts; frozen orders remain unchanged.
