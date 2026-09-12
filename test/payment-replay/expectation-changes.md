# Payment replay compatibility — DEV

Release base: `3161c4592a050d303efd374266324a7547d2139c`.
MCP 11.0.0, unchanged application response shapes; no schema or data migration.

## Reviewed test scope

`impact.json` is the complete reviewed inventory. `npm run test:payment-replay -- --list`
lists cases/files; `validate:dev:payment-replay` reuses the existing scoped runner,
execution reconciliation, source hygiene, build hashing and DEV attestation.
It executes affected payment, finance, webhook, readiness and checkout consumers only.
Normal deployment verification remains available and unchanged.

The private restored-PRD probe lives under `scripts/payment-replay` and is explicitly
included in this inventory. It requires the independently restored encrypted PG18
backup; ordinary public fixture runs have no dependency on private customer data.
Sanitised fixtures remain under `test/payment-replay`. Nothing is quarantined.
Network isolation blocks external services; provider and FX dependencies are mocked.

## Intentional expectation changes

- PRD-COMPAT-01: historical completion requires confirmed payment, exact revenue,
  current selected-plan adoption and durable work/output evidence, corroborated by
  the payment-scoped success receipt. Paid status or revenue alone is insufficient.
- PRD-COMPAT-02: identical accounting replay preserves the entire original row,
  including FX, metadata, dates and attribution. Conflicting accounting fails.
- Unbound historical reservations additionally require completed reservation work;
  a telemetry success event alone cannot establish fulfilment.
- The existing mock-return source assertion now expects prepared evidence (or the
  explicitly newly-confirmed state) at task admission. Its return-path, webhook and
  checkout behaviour assertions remain intact.
- Task admission revalidates the persisted payment identity through its existing
  conditional write. It cannot reset concurrent completion or use an old binding.
- The general finance upsert and frozen checkout contents are unchanged.

## RED evidence and fixtures

Immutable evidence is outside the checkout under the deployment host's
`payment-replay-20260912` directory. Historical, accounting, recovery, reservation,
admission-race and release-proof RED runs are preserved separately from green runs.
Fixture-construction failures are labelled failures, not counted as behavioural RED.
The original PRD rehearsal remains unchanged in `prd-3161c459-20260912`.

The encrypted backup checksum is pinned in the inventory; final validation requires
its verified restore receipt and checks all original rows across the restored tables
before/after the affected tests. The singleton `catalogue_runtime_revision` is an
operational cache counter advanced by existing synthetic-fixture triggers; its
before/after hashes are reported separately. All original business rows remain
subject to exact preservation. Hashes are exported, never private row bodies.
Synthetic fixtures may add their own isolated rows and advance sequences; original
payment, order, finance, catalogue and food rows must all remain unchanged.
No test charges a real payment or sends external email.

## Deployment

DEV only, using `deploy:dev -- --payment-replay-attestation /absolute/proof/attestation.json
--payment-replay-build /absolute/attested/.next`. Proof checks bind the release base,
source, input and inventory hashes, execution, encrypted backup, preservation report,
contract, absence of added locks and compiled artifact. This path verifies existing
schema and applies no migration, seed, backfill, financial repair or data correction.
UAT and PRD promotion requires a subsequent separate rollout.
