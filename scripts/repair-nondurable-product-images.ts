import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import postgres from "postgres";

const apply = process.argv.includes("--apply");
const jsonOutput = process.argv.includes("--json");
const allowProd = process.argv.includes("--allow-prod");
const connection =
  process.env.UAT_DB_URL?.trim() || process.env.DB_URL?.trim() || "";
const generatedAt = new Date().toISOString();
const reportPath = join(
  process.cwd(),
  "reports",
  `product-image-nondurable-${generatedAt.replace(/[:.]/g, "-")}.json`
);

type NondurableImageRow = Readonly<{
  id: string;
  title: string | null;
  brand_name: string | null;
  status: string | null;
  image_url: string | null;
  upload_url: string | null;
  updated_at: string | null;
}>;

function requireConnection() {
  if (!connection) {
    throw new Error("Set UAT_DB_URL, or DB_URL pointing at the UAT database.");
  }
}

async function writeReport(report: unknown) {
  await mkdir(join(process.cwd(), "reports"), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

async function main() {
  requireConnection();

  const sql = postgres(connection, {
    max: 1,
    prepare: false
  });

  try {
    const databaseRows = await sql<Array<{ database: string }>>`
      select current_database() as database
    `;
    const databaseName = String(databaseRows[0]?.database ?? "");

    if (/prd|prod/i.test(databaseName) && !allowProd) {
      throw new Error(
        `Refusing to clear product images on production-like database ${databaseName}.`
      );
    }

    if (!/uat|mattanutra-uat|dev|development/i.test(databaseName)) {
      throw new Error(
        `Refusing to clear product images on unexpected database ${databaseName}.`
      );
    }

    const rows = await sql<Array<NondurableImageRow>>`
      select
        id::text,
        title,
        brand_name,
        status,
        image_url,
        source_snapshot->'productImageUpload'->>'url' as upload_url,
        updated_at::text
      from public.products
      where image_url like '/uploads/uat/%'
        or source_snapshot->'productImageUpload'->>'url' like '/uploads/uat/%'
      order by updated_at desc nulls last, title
    `;
    const report = {
      applied: false,
      database: databaseName,
      generatedAt,
      issue: "non_durable_uat_upload_url",
      match: "products.image_url like '/uploads/uat/%'",
      reportPath,
      rows
    };

    if (!apply) {
      await writeReport(report);
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    const ids = rows.map((row) => row.id);

    if (ids.length > 0) {
      await sql`
        update public.products
        set
          image_url = case
            when image_url like '/uploads/uat/%' then null
            else image_url
          end,
          source_snapshot = jsonb_set(
            coalesce(source_snapshot, '{}'::jsonb) - 'productImageUpload',
            '{productImageRepair}',
            coalesce(source_snapshot->'productImageRepair', '{}'::jsonb) ||
              jsonb_build_object(
                'clearedNonDurableImageAt', now(),
                'clearedNonDurableImageReason', 'image_url_was_local_uat_upload'
              ),
            true
          ),
          updated_at = now()
        where id = any(${ids}::uuid[])
      `;
    }

    const appliedReport = {
      ...report,
      applied: true,
      clearedCount: ids.length
    };

    await writeReport(appliedReport);

    if (jsonOutput) {
      console.log(JSON.stringify(appliedReport, null, 2));
    } else {
      console.log(
        `Cleared ${ids.length} non-durable product image URLs. Report: ${reportPath}`
      );
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
