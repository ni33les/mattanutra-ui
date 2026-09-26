# Historical SQL archive and unreachable widgets

Evidence and original backups: `/root/.codex/deploy/code-quality-20260926/archive-orphans/`.

Before implementation, the eleven original SQL files were copied byte-for-byte into `originals/`, with `originals-manifest.json`. The committed `historical-rollout-baseline.json` freezes independent original hashes, byte ranges and task-DDL hashes before any source is removed. Git history and existing external backups remain untouched.

## Archive contract

- One deterministic gzip preserves the complete original combined rollout dump. Its manifest restores the original combined path and all ten seed paths, offline, byte-for-byte. The CLI only verifies/restores files and never executes SQL; restore requires an explicit output directory and refuses to overwrite different existing contents.
- Preserve the exact embedded historical schema as `db-rollout/historical-schema-2026-05-23.sql`. It differs from the current schema and must not be rebuilt from it. The isolated MCP bootstrap reads this small file; its three table definitions keep their frozen hashes.
- The existing SQL lock scanner discovers the historical schema normally. Update only the old dump's registry path/key, preserving its `public.prevent_task_dependency_cycle` statement, invariant and mechanism links. No lock discovery exemption is added.
- Keep the small platform seed in its original location for the live payment tests. Other original raw SQL copies become archive members. The database schema's generic seeding instruction and an archive README point to the explicit offline restore command, preserving manual workflows.
- Retain `files/library`, `files/ttf.zip`, all other handoffs, runtime content and public assets unchanged. Artifact byte savings are reported separately from application LOC.

## Widget retirement and assertion disposition

The eight listed widgets total 714 application lines. An AST audit across 855 application modules found no static/dynamic import edges to them and no nonliteral application import calls; exported-symbol and tooling searches found no runtime registry. Current landing, library and supplement-edit implementations remain unchanged.

No existing test case is removed. In `supplement-admin-static.test.ts` / **uses one popup to create, AI-suggest, edit, save, and delete supplements**, remove only the obsolete file read and positive assertion that `CreateSupplementModal` still exists. Preserve the assertion that the live editor does not use it and every live create/AI/edit/save/delete assertion. `admin-localization-static.test.ts` removes that unreachable modal from its text-button inspection list; its live supplement editor remains in the same list. `image-hardening-static.test.ts` removes only the unreachable chat widget from the QR image-exception allowlist; all live image enforcement remains.

`red.tap` records all six intended failures before implementation (missing archive/schema/restorer, raw duplicates still present, widgets still present), zero skips/cancellations. `baseline.tap` records 62/64 existing checks passing. Its two existing image-hardening failures identify the raw image in `components/pharmacy/landing.tsx` and QR `unoptimized` usage in `components/pharmacy/line-connect.tsx:53`; neither is changed or waived by this slice. The new archive cases protect restoration, schema parity and removal of raw duplicates; the new widget case prevents accidental reintroduction of the retired source files. No business acceptance threshold, assertion for a live feature, historical baseline or handoff is deleted.

## Implemented verification

RED was committed as `14fc4ad1` before implementation. `candidate.tap` records 68/70 affected checks passing, including all six new checks, with only the same two previously recorded pharmacy image failures; there are no skips or cancellations. Scoped ESLint and `git diff --check` pass. `lock-migration.json` proves that the active historical-schema lock retains its exact statement and mechanisms, every discovered lock is registered, and the older global-lock audit entry remains byte-for-byte unchanged. The SQL scanner itself is unchanged.

`size.json` records 127,460,745 removed raw SQL bytes and 9,630,381 replacement artifact bytes, including the gzip, manifest, exact schema prefix and README: a net reduction of 117,830,364 checkout artifact bytes. Separately, the eight widgets remove 714 application lines and 23,205 bytes; the archive CLI is tooling, not application code. All eleven original external copies match their independent frozen checksums. The CLI verification reports 63,814,681 combined original bytes and eleven restorable paths. Restoration is deliberately outside the checkout so historical SQL cannot be rediscovered as active schema input.
