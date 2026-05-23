-- MattaNutra rollout SQL
-- Seed public.product_brand_countries, batch 1 of 1.
-- Generated at 2026-05-23T14:26:14.547Z from the configured DEV DB.
-- Review before running against UAT or PRD.

begin;
insert into public."product_brand_countries" ("brand_id", "country_code", "created_at", "updated_at")
values
  ('03b2fd16-362b-4b2f-9265-eb2ff73cbf14'::uuid, 'TH', '2026-05-21T09:50:23.587Z'::timestamptz, '2026-05-21T09:50:23.587Z'::timestamptz),
  ('10868707-bfd0-484e-834b-eeb918807ae8'::uuid, 'TH', '2026-05-21T09:50:23.587Z'::timestamptz, '2026-05-21T09:50:23.587Z'::timestamptz),
  ('17f6ebfb-bc28-4471-84e6-12fccfd93e06'::uuid, 'SG', '2026-05-21T11:46:15.387Z'::timestamptz, '2026-05-22T00:58:19.701Z'::timestamptz),
  ('17f6ebfb-bc28-4471-84e6-12fccfd93e06'::uuid, 'TH', '2026-05-21T09:50:23.587Z'::timestamptz, '2026-05-22T00:58:19.701Z'::timestamptz),
  ('40e4806a-5049-4668-8d29-ab36a31202dd'::uuid, 'TH', '2026-05-21T09:50:23.587Z'::timestamptz, '2026-05-22T13:59:34.387Z'::timestamptz),
  ('50dbe488-0eb8-4327-b089-c5289807e7da'::uuid, 'TH', '2026-05-21T09:50:23.587Z'::timestamptz, '2026-05-22T00:31:49.863Z'::timestamptz),
  ('577a0c52-9c0a-44b8-b882-0f87363311a3'::uuid, 'TH', '2026-05-21T09:50:23.587Z'::timestamptz, '2026-05-22T00:31:49.774Z'::timestamptz),
  ('e33b2375-6f7f-4f97-a5d6-d814e9693e5f'::uuid, 'TH', '2026-05-21T09:50:23.587Z'::timestamptz, '2026-05-22T00:31:49.660Z'::timestamptz)
on conflict ("brand_id", "country_code") do update set
  "created_at" = excluded."created_at",
  "updated_at" = excluded."updated_at"
;
commit;
