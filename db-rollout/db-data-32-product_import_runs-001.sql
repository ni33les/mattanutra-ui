-- MattaNutra rollout SQL
-- Seed public.product_import_runs, batch 1 of 1.
-- Generated at 2026-05-23T14:26:15.254Z from the configured DEV DB.
-- Review before running against UAT or PRD.

begin;
insert into public."product_import_runs" ("id", "brand_name", "normalized_brand_name", "source", "status", "requested_auto_approve", "total_products", "staged_count", "approved_count", "failed_count", "notes", "started_at", "completed_at", "created_at", "updated_at")
values
  ('2bffa5fc-a06b-490c-9e87-1459c63f6843'::uuid, 'blackmores', 'blackmores', 'manufacturer_import_file', 'completed', false, 155, 155, 0, 0, 'Applied 155 blackmores products from snapshot /private/tmp/blackmores-full-ai-repair-local.json; skipped 0 products that were not imported.', '2026-05-21T13:09:43.775Z'::timestamptz, '2026-05-21T13:09:50.585Z'::timestamptz, '2026-05-21T13:09:43.775Z'::timestamptz, '2026-05-21T13:09:50.585Z'::timestamptz),
  ('ac8d3810-8b35-4941-b0ba-f4569685b78d'::uuid, 'vistra', 'vistra', 'manufacturer_import_file', 'completed', true, 37, 37, 22, 15, 'Applied 37 vistra products from snapshot /private/tmp/vistra-products-quality-local.json; skipped 0 products that were not imported.', '2026-05-21T10:13:13.125Z'::timestamptz, '2026-05-21T10:13:15.889Z'::timestamptz, '2026-05-21T10:13:13.125Z'::timestamptz, '2026-05-21T10:13:15.889Z'::timestamptz),
  ('d3e8618f-50de-4178-9b16-6833366c310f'::uuid, 'dhc', 'dhc', 'manufacturer_import_file', 'completed', true, 330, 330, 155, 175, 'Applied 330 dhc products from snapshot /private/tmp/dhc-products-quality-local.json; skipped 3 products that were not imported.', '2026-05-21T10:14:00.386Z'::timestamptz, '2026-05-21T10:14:22.149Z'::timestamptz, '2026-05-21T10:14:00.386Z'::timestamptz, '2026-05-21T10:14:22.149Z'::timestamptz),
  ('e978640f-7f20-4057-937f-576f0ee3c9f9'::uuid, 'mega we care', 'mega_we_care', 'manufacturer_import_file', 'completed', true, 45, 45, 28, 17, 'Applied 45 mega we care products from snapshot /private/tmp/megawecare-products-quality-local.json; skipped 0 products that were not imported.', '2026-05-21T10:12:29.647Z'::timestamptz, '2026-05-21T10:12:32.570Z'::timestamptz, '2026-05-21T10:12:29.647Z'::timestamptz, '2026-05-21T10:12:32.570Z'::timestamptz),
  ('f79618b3-4432-497c-8c41-76b31d9b03ae'::uuid, 'swisse', 'swisse', 'manufacturer_import_file', 'completed', true, 24, 24, 13, 11, 'Applied 24 swisse products from snapshot /private/tmp/swisse-products-quality-local.json; skipped 4 products that were not imported.', '2026-05-21T10:12:52.854Z'::timestamptz, '2026-05-21T10:12:54.971Z'::timestamptz, '2026-05-21T10:12:52.854Z'::timestamptz, '2026-05-21T10:12:54.971Z'::timestamptz)
on conflict ("id") do update set
  "brand_name" = excluded."brand_name",
  "normalized_brand_name" = excluded."normalized_brand_name",
  "source" = excluded."source",
  "status" = excluded."status",
  "requested_auto_approve" = excluded."requested_auto_approve",
  "total_products" = excluded."total_products",
  "staged_count" = excluded."staged_count",
  "approved_count" = excluded."approved_count",
  "failed_count" = excluded."failed_count",
  "notes" = excluded."notes",
  "started_at" = excluded."started_at",
  "completed_at" = excluded."completed_at",
  "created_at" = excluded."created_at",
  "updated_at" = excluded."updated_at"
;
commit;
