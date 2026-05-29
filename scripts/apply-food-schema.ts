import { existsSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { managedFoodSeeds } from "@/lib/managed-foods";
import { publicLocales } from "@/lib/i18n";

const connection = process.env.DB_CONNECTION;

if (!connection) {
  throw new Error("DB_CONNECTION is not configured");
}

const sql = postgres(connection, { max: 1 });

try {
  await sql`alter table public.foods add column if not exists image_path text`;
  await sql`alter table public.foods add column if not exists image_source text`;
  await sql`alter table public.foods add column if not exists image_updated_at timestamptz`;

  await sql`
    create table if not exists public.food_translations (
      food_id uuid not null references public.foods(id) on delete cascade,
      locale text not null,
      name text not null,
      category text,
      primary_use_case text,
      image_alt text,
      status text not null default 'missing'
        check (status in ('complete', 'draft', 'missing')),
      updated_at timestamptz not null default now(),
      primary key (food_id, locale)
    )
  `;
  await sql`
    create index if not exists food_translations_locale_idx
      on public.food_translations (locale, status)
  `;

  for (const food of managedFoodSeeds) {
    const imagePath = food.imagePath;

    await sql`
      update public.foods set
        image_path = coalesce(nullif(image_path, ''), ${imagePath}),
        image_source = coalesce(nullif(image_source, ''), ${food.imageSource}),
        image_updated_at = coalesce(image_updated_at, now()),
        updated_at = now()
      where normalized_name = ${food.normalizedName}
    `;

    for (const locale of publicLocales) {
      await sql`
        insert into public.food_translations (
          food_id,
          locale,
          name,
          category,
          primary_use_case,
          image_alt,
          status,
          updated_at
        )
        select
          foods.id,
          ${locale},
          ${food.name[locale]},
          ${food.category[locale]},
          ${food.primaryUseCase[locale]},
          ${food.imageAlt[locale]},
          'complete',
          now()
        from public.foods
        where foods.normalized_name = ${food.normalizedName}
        on conflict (food_id, locale) do update set
          name = excluded.name,
          category = excluded.category,
          primary_use_case = excluded.primary_use_case,
          image_alt = excluded.image_alt,
          status = excluded.status,
          updated_at = now()
      `;
    }
  }

  await sql`
    insert into public.food_translations (
      food_id,
      locale,
      name,
      category,
      primary_use_case,
      image_alt,
      status,
      updated_at
    )
    select
      foods.id,
      'en',
      foods.name,
      foods.category,
      foods.primary_use_case,
      foods.name,
      'complete',
      now()
    from public.foods
    where not exists (
      select 1
      from public.food_translations
      where food_translations.food_id = foods.id
        and food_translations.locale = 'en'
    )
  `;

  const missingRows = await sql<Array<{
    image_path: string | null;
    normalized_name: string;
  }>>`
    select normalized_name, image_path
    from public.foods
    where is_active = true
      and list_status = 'whitelisted'
      and coalesce(image_path, '') = ''
    order by normalized_name
  `;

  if (missingRows.length > 0) {
    throw new Error(
      `Whitelisted foods missing image paths: ${
        missingRows.map((row) => row.normalized_name).join(", ")
      }`
    );
  }

  const missingFiles = managedFoodSeeds
    .map((food) => ({
      file: join(process.cwd(), "public", food.imagePath.replace(/^\//, "")),
      normalizedName: food.normalizedName
    }))
    .filter((item) => !existsSync(item.file));

  if (missingFiles.length > 0) {
    throw new Error(
      `Managed food image files are missing: ${
        missingFiles.map((item) => item.normalizedName).join(", ")
      }`
    );
  }

  console.log(
    JSON.stringify({
      foodsSeeded: managedFoodSeeds.length,
      ok: true
    })
  );
} finally {
  await sql.end();
}
