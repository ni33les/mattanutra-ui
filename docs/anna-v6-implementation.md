# Anna v6 implementation and evidence

Release base: `a659a2292493ccf6f2ef1a2ce0e5e2b346b1ba85` on `dev`.
Authorized rollout: DEV followed by UAT, code and reviewed data, after the complete green gate.

## Behaviour

`maxProductCount`, `maxDailyPills`, and `maxPriceMinor` are advisory preferences.
They never prune candidates or quantities, make a plan need input, or prevent selection/checkout.
Null clears a preference; patch omission preserves it; explicit zero is a preference, not a prohibition.
Prominent numerical preference advice uses strictly greater than 20% excess. Any applicable health-reference excess remains prominent.
Unknown counts/exposure remain unknown. Exact dose scoring, required/core priority, commercial tie-breaks and the additional 2x applicable reference excess penalty remain unchanged.
Product/nutrient exclusions, dietary requirements, supported physical quantities, ordinary availability, revision fencing and payment integrity remain enforced.

## Baseline and test hygiene

Immutable original environment captures are under `/tmp/anna-v6-evidence/baseline/`:

- DEV snapshot `snap_00e8f4311baa16a3`, 154 listings/79 products; database SHA256 `ab0ee1f02107d6f8e631627d4f69b612e4f00efef7a27e3365224bfaa8872ec5`.
- UAT snapshot `snap_69cbe9ba25c0da82`, 154 listings/79 products; database SHA256 `82be28ad2c1f2c17faa849e3d9a1fc78e322821e94d46a5071b13289e7a0373f`.
- The initial archive-only baseline runner failed because its source directory lacked Git metadata. Preserve it as incomplete; the replacement uses a detached worktree at the release base.
- Existing v4/v5 results, snapshots, case IDs and prices remain historical evidence. Never overwrite their expected scores to manufacture a pass.

Intentional expectation changes must pair the old assertion with its maintained replacement:

| Old behaviour | v6 replacement |
| --- | --- |
| Explicit numerical ceiling rejects products/quantities | Eligible choices remain selectable with exact preference comparisons |
| Zero product ceiling requests no products | Zero preference allows positive baskets with prominent advice |
| Unknown pill counts excluded, or ranked as zero | Candidate remains eligible; public count remains null; no false fewer-pill claim |
| Budget/pill overrun requires relaxation answer | Ready with advice and ordinary basket confirmation |
| FIX-06 claims installed connector parity from local artifacts | Preserve local parity test and add independent installed-projection evidence |
| Source-less product-driven limit increase | Independent reference review and append-only sourced correction |
| Retired reference falls back to older positive version | Latest null head remains retired across reads, replay and caches |

## Verification and deployment

Each implementation slice records RED/GREEN evidence and complete maintained MCP/matcher execution.
Final gate: `npm run validate:dev:advisory`, with release lint base set to the SHA above, isolated PostgreSQL, mock/test payment and email sink.
Require all application/PostgreSQL/browser suites, typecheck, changed-file lint, production build, two complete MCP/matcher runs and EN/TH/ZH documented client journeys (including tools-only discovery). Compare full non-latency business outputs and immutable source/data/inventory fingerprints.

Catalogue administration corrections are evidence-backed, environment-specific and replayable; unavailable facts stay unknown. Reference corrections preserve previous rows and correct scope atomically. DEV adult D3 starts at an erroneous 1000mcg; UAT already has 100mcg and must not receive the erroneous value.

Install retirement-aware readers/seeders before data corrections; retain that compatibility in rollback. Existing orders remain frozen. Verify deployed application/worker/source/schema/catalogue/reference identities and actual installed connectors separately. Native endpoint success does not prove the external connector projection refreshed.

The DEV and UAT deployment schema phases run `supplements:safety-reference-integrity:schema:apply` before the life-stage seeder, because that seeder now reads `source_url` and `basis_rationale`. The migration adds provenance columns and immutable correction receipts without changing existing reference amounts. Deploy and verify the compatible application and workers next. Only then run `npm run supplements:safety-references:correct -- --environment dev --manifest data/corrections/anna-v6-2026-09-07/dev-references.json` with the matching database/environment; review its dry-run result before repeating with `--apply`. Use the UAT environment and UAT manifest independently for UAT. Deployment does not automatically apply either manifest. A DEV deployment without schema-owner credentials must pass the runtime schema verifier against a schema already provisioned by its owner.

## Integrated expectation changes

- Active contract locks move to 6.0.0 and the matcher identity to flexible-dose-fit-4; archived v4/v5 resources remain byte-identical.
- DEV-SAVE-04 and R2-SAVE-04 still require a genuinely missing core target and prohibit unsupported equivalent-savings claims. Explicit exclusion of every magnesium product now creates that fixture; the historical one-product number is retained as advice. No price changes or weaker loss assertions are used.
- The published client proposes two physically supported servings using the published template, then selects the returned 80% partial trade-off explicitly. A one-product preference cannot force that partial basket to be the default when a closer multi-product option exists.
- The complete client matrix includes resource discovery and tools-only discovery in English, Thai and Chinese, twice each, including payment recovery. Missing a discovery mode invalidates proof even if its artifact manifest is rehashed.
- Full reference-manifest and catalogue reviews are independently recorded for DEV and UAT under `data/corrections/anna-v6-2026-09-07/`. Manufacturer evidence is reviewed separately from nutrient-confidence evidence.

Baseline preparation attempts that lacked Git metadata or the required build identity are preserved as incomplete configuration failures. The subsequent isolated baseline pair completed successfully; it does not validate the new source. Diagnostic acceptance while implementation files are changing likewise cannot be an unchanged-source green attestation.

The seven legacy compatibility cases use an immutable six-product result and checkout generated by a659a229. Their original fixture prices are unchanged. Explicit six is preserved as an advisory preference after refresh, while both historical paid and unpaid orders still require six frozen line items. The source fixture hash is asserted before replay.

Additional compatibility fixes preserve uncertainty in concise empty-basket explanations (EN/TH/ZH), recover known legacy targets without an obsolete numeric-provenance gate, and forward optional guide/schema arguments through the lightweight production MCP transport. Current contract examples, native resources and tools-only discovery are tested through the real HTTP handlers.

DEV and UAT correction manifests were applied and replayed in separate fresh isolated databases, with 60 catalogue and six reference correction receipts per environment. All before/after fingerprints and exact commands are preserved under `/tmp/anna-v6-evidence/data-final-2026-09-07T12-11-41.440Z/`. Neither environment has been mutated during implementation validation.
