# Configured target limits

Plan normalization adjusts an above-limit target to the existing configured band for its resolved nutrient, known life stage and matching intake scope. Supplemental targets use supplemental bands; total-daily targets use total bands. Country availability continues to choose the eligible catalogue. This change adds neither country-specific dose limits nor new limit values.

The original request and public ingredient `requested` amount remain unchanged. Internal targets, acceptable ranges, matching scores, gaps, coverage and completion summaries use the applied amount. Each adjustment is reported through `requestIssues` with code `adjusted_to_configured_limit`, an ingredient identity, target field path and localized message containing both amounts. Existing issue and advice structures and contract version 11.1.0 remain in use.

Adjustment provenance is stored in the existing revision JSON with the reference fingerprint and band identity/version. A saved read never consults current limits. New or refined requests recompute from original intent; policy/reference identities participate in reuse checks. An interrupted operation retains the references captured before dispatch, including when process caches change during recovery.

No applicable finite positive band, unknown required profile, or incompatible reference units means no adjustment. Recorded intake and explicit physical product proposals are preserved. Missing/estimated intake remains uncertain; coverage lower bounds retain their existing representation. A configured limit adjusts the target, rather than introducing a new basket-rejection rule.

Warnings retain existing behavior. In particular, MCP currently publishes quantified exceeded-limit dose advice and filters medication-interaction findings; this change does not add a K2/apixaban interaction warning. The separate connector issue that hides structured details is outside this change. Direct structured MCP responses provide implementation acceptance evidence.

## Validation and deployment

`test/simple-plan/configured-target-limits.test.ts` covers normalization, conversion, scope/population selection, ranges, original intent, response arithmetic, localized issues, task execution, replay, refinement, changing references and preserved advice. Its PostgreSQL companion interrupts real worker matching, changes process references and verifies recovery and replay through a fresh store instance.

Run the affected simple-plan/practical-matching and reference-recovery tests with isolated PostgreSQL, typecheck, changed-file lint and a production build. Deploy the feature onto the current UAT baseline first, then onto dev; preserve unrelated branch differences. Hosted checks use each environment's actual configured values, TH/en and standard effort, and retain direct MCP responses plus task/worker receipts. No database migration or limit-data backfill is required. Retain prior builds and deployment identities for rollback.
