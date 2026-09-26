# Historical catalogue rollout

`2026-05-23.sql.gz` preserves the former `db-rollout/db-rollout.sql` byte-for-byte. Its manifest indexes that combined dump and all ten original `db-data-*` files with byte lengths and SHA-256 hashes. These are historical catalogue snapshots, not a replacement for the current schema or a live database backup.

Verify the archive offline, without database access:

```sh
node scripts/historical-rollout.mjs verify
```

Restore the complete original directory layout to an explicit location outside this checkout:

```sh
node scripts/historical-rollout.mjs restore --output /tmp/mattanutra-historical-rollout
```

This creates `/tmp/mattanutra-historical-rollout/db-rollout/db-rollout.sql` and all ten original seed files. Existing identical files are accepted; different existing files stop restoration before any writes. The tool never executes SQL or loads environment credentials. Historical manual seed workflows can use these restored paths after the same data/schema review previously required by their headers. Do not assume the May 2026 seed columns match today's schema.

`../historical-schema-2026-05-23.sql` is the exact embedded schema prefix from the original dump. Isolated task bootstrap and SQL lock discovery use it without loading historical catalogue data. Its hash and the original task table definitions are frozen by `test/code-quality/historical-rollout-baseline.json`. The tiny platform seed remains at its original path because payment tests read it directly.

The compressed archive, manifest and frozen schema are tracked, so a checkout remains fully usable offline. Original raw backups were also preserved outside the checkout under `/root/.codex/deploy/code-quality-20260926/archive-orphans/originals/`; no Git history or previous backup was rewritten or deleted. Library, Thai, Chinese, questionnaire and HealthScore handoffs remain unchanged.
