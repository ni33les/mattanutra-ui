# Reviewed v5 catalogue corrections

The manifest preserves the reviewed original fields, exact fingerprints, source evidence and proposed final fields. It deliberately leaves package quantities unknown. No orders or prices are modified.

The Vistra manufacturer states 1,000 mg fish oil provides **350 mg total Omega-3 per capsule**, with EPA and DHA included in that total: https://www.vistra.co.th/product/vistra-odorless-fish-oil-1000mg/. Both matching product records receive serving provenance; the erroneous total is corrected. The already-correct record receives source evidence only.

JOINPLUS has three demonstrably contradictory stored mappings. Their original labels and quantities are preserved, mappings cleared and confidence marked low until a verified label resolves them. The manifest does **not** assert replacement nutrients from the product title or a neighbouring product.

The Hair Rise manufacturer's scalp-application instructions establish a topical route: https://www.hairrisethailand.com/. This removes false oral nutrient coverage without modifying retail sellability.

After applying `product-administration-schema.sql`, review without mutation:

```sh
node --experimental-strip-types --import ./scripts/register-ts-path-loader.mjs scripts/apply-catalogue-corrections.ts db-rollout/catalogue-corrections/2026-09-07-v5-reviewed.json
```

Only after the release green gate, append `--apply` against DEV. The script rejects UAT/production writes, locks reviewed rows, checks every original fingerprint, changes only reviewed fields, stores full before/after records in an immutable audit, and rolls the entire batch back on conflicts. Replaying the identical manifest is idempotent. Application rollback leaves additive metadata and evidence intact; any future data reversal requires its own reviewed compensating manifest.
