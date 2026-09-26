# Delight price reconciliation, 26 September 2026

This is a data-only change pack. No application code, deployment source, schema, global price, stock count, clinical fact, financial record or frozen order is changed. DEV is excluded.

Authority: `Definitive Price List (2)`, workbook SHA256 `20caf578c9b6e01797428088fc4f9cd373aae9558e3bd0432540d7e99f764035`, and the manufacturer research addendum. Retail/wholesale prices belong to Delight. Platform name/pack edits preserve existing administration evidence. Unknown facts stay unknown. Green retail excludes the existing 10% customer markup.

The release workbook, separate field manifests, clarification sheet, exact recovery commands and immutable execution evidence are retained outside the checkout at `/root/.codex/deploy/delight-price-release-20260926/`.

Held rows: 4, 9, 13, 25, 32, 39, 47, 54, 68, 79, 93, 116. Row 83's nutrient normalization is separately held; its commercial changes are included. Red rows disable only Delight listings. Shared products/history remain.

Run focused core safeguards with `node --test test/delight-price-release.test.mjs`. The release inventory also exercises isolated restored PostgreSQL application, rollback, interruption, replay, all-seller preservation, authenticated backup rejection and actual catalogue/matcher reads. No unrelated application or MCP suite is implied.

Executor imports are deliberately inert: calling `executeManifest` defaults to read-only review. The release application wrapper requires the environment-specific manifest, proven maintenance/quiescence, a matching decryptable restore-tested backup, indefinite retention and passing rehearsal. PRD must pass before UAT. Recovery receipts are never inferred from filenames.

Use compensating changes after traffic reopens. A full database reset is restricted to the affected database with writers stopped and explicit reconciliation of any later legitimate customer activity. Never restore the shared cluster. Retain backup/configuration/key/source and restoration evidence indefinitely until the user explicitly authorizes deletion.

## Superseding field-wise completion

The user's subsequent instruction authorizes every supplied commercial price, name and pack quantity, regardless of prior row hold or listing state. The separate `delight-price-completion-20260926` manifests use explicit policy `sheet-commercial-fields-v2`; the original manifest and its held-row evidence remain unchanged. Blank fields preserve existing values. Pack corrections retain serving basis and fact confidence. Edited C-column quantities override older N-column quantities. Distinct formulations use their existing exact variant IDs without approval changes. Red rows stay unavailable; approved non-red listings can resume. Both stock-profile price copies mirror Delight's offer, with stock counts untouched. Historical frozen prices remain unchanged.

New maintained cases: `test/delight-price-completion.test.mjs`. Recovery, field preservation, replay and isolated catalogue checks reuse the original release tools; fresh indefinitely retained backups are required before each environment's writes. DEV remains excluded.
