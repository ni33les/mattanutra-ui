import { closeSqlPool, getSql } from "@/lib/db";
import {
  copySharedSpacesObject,
  firstPartyImageStorageConfigFromEnv
} from "@/lib/first-party-image-mirror";
import {
  retargetSharedSpacesImageUrl,
  sharedSpacesObjectKey,
  type SharedSpacesImageEnvironment
} from "@/lib/first-party-image-rules";

function argValue(name: string) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function asEnv(value: string | null): SharedSpacesImageEnvironment {
  if (value === "dev" || value === "uat" || value === "prd") {
    return value;
  }

  throw new Error("Pass --env=prd and --from=uat");
}

function applyTargetDbUrl(environment: SharedSpacesImageEnvironment) {
  if (environment === "prd" && process.env.PRD_DB_URL) {
    process.env.DB_URL = process.env.PRD_DB_URL;
  } else if (environment === "uat" && process.env.UAT_DB_URL) {
    process.env.DB_URL = process.env.UAT_DB_URL;
  }
}

async function main() {
  const target = asEnv(argValue("env"));
  const from = asEnv(argValue("from"));
  const apply = process.argv.includes("--apply");

  if (from === target) {
    throw new Error("--from and --env must differ");
  }

  applyTargetDbUrl(target);
  process.env.MATTANUTRA_ENV = target;

  const sql = getSql();
  const config = firstPartyImageStorageConfigFromEnv();

  if (!sql) {
    throw new Error("DB_URL is required");
  }

  if (!config) {
    throw new Error("DigitalOcean Spaces credentials are required");
  }

  const productRows = await sql<Array<{ id: string; image_url: string }>>`
    select id::text, image_url
    from public.products
    where image_url ilike ${"%/" + from + "/products/%"}
  `;

  console.log(
    JSON.stringify({
      apply,
      from,
      productRows: productRows.length,
      target
    })
  );

  let copied = 0;
  let updated = 0;
  let failed = 0;

  for (const row of productRows) {
    const nextUrl = retargetSharedSpacesImageUrl(row.image_url, target);
    const sourceKey = sharedSpacesObjectKey(row.image_url);
    const destinationKey = sharedSpacesObjectKey(nextUrl);

    if (!nextUrl || !sourceKey || !destinationKey || nextUrl === row.image_url) {
      continue;
    }

    try {
      if (apply) {
        await copySharedSpacesObject({
          config,
          destinationKey,
          sourceKey
        });
        await sql`
          update public.products
          set
            image_url = ${nextUrl},
            source_snapshot = replace(
              coalesce(source_snapshot, '{}'::jsonb)::text,
              ${"/" + from + "/products/"},
              ${"/" + target + "/products/"}
            )::jsonb,
            updated_at = now()
          where id = ${row.id}::uuid
        `;
        updated += 1;
      }
      copied += 1;
    } catch (error) {
      failed += 1;
      console.error(
        JSON.stringify({
          destinationKey,
          id: row.id,
          message: error instanceof Error ? error.message : String(error),
          sourceKey
        })
      );
    }
  }

  if (apply) {
    await sql`
      update public.product_imports
      set image_urls = (
        select coalesce(array_agg(
          replace(url, ${"/" + from + "/products/"}, ${"/" + target + "/products/"})
        ), '{}'::text[])
        from unnest(coalesce(image_urls, '{}'::text[])) as url
      )
      where exists (
        select 1
        from unnest(coalesce(image_urls, '{}'::text[])) as url
        where url ilike ${"%/" + from + "/products/%"}
      )
    `;
  }

  const remaining = await sql<Array<{ n: number }>>`
    select count(*)::int as n
    from public.products
    where image_url ilike ${"%/" + from + "/products/%"}
  `;

  console.log(
    JSON.stringify({
      copied,
      failed,
      remaining: remaining[0]?.n ?? 0,
      updated
    })
  );

  await closeSqlPool();

  if (apply && failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
