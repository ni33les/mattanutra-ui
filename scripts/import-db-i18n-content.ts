import { readFile } from "node:fs/promises";
import { closeSqlPool, getSql } from "@/lib/db";
import { isLocale } from "@/lib/i18n";

type CsvRow = Record<string, string>;

const fieldAllowlist = {
  blog: new Set([
    "title",
    "subtitle",
    "excerpt",
    "content_markdown",
    "image_alt",
    "seo_title",
    "seo_description",
    "social_title",
    "social_description"
  ]),
  product: new Set(["title", "description"]),
  supplement: new Set([
    "name",
    "primary_use_case",
    "category_label",
    "safety_notes",
    "aliases"
  ]),
  testimonial: new Set([
    "quote",
    "author_name",
    "author_title",
    "author_image_alt"
  ])
} as const;

function argValue(name: string) {
  const direct = process.argv.find((arg) => arg.startsWith(`${name}=`));

  if (direct) {
    return direct.slice(name.length + 1);
  }

  const index = process.argv.indexOf(name);

  return index >= 0 ? process.argv[index + 1] : undefined;
}

function parseCsv(input: string): CsvRow[] {
  const rows: string[][] = [];
  let cell = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell);
      rows.push(row);
      cell = "";
      row = [];
      continue;
    }

    cell += char;
  }

  if (cell || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  const [headers, ...body] = rows.filter((candidate) =>
    candidate.some((value) => value.trim())
  );

  if (!headers) {
    return [];
  }

  return body.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]))
  );
}

function contentType(value: string): keyof typeof fieldAllowlist | null {
  return value === "blog" ||
    value === "product" ||
    value === "supplement" ||
    value === "testimonial"
    ? value
    : null;
}

function validateRows(rows: readonly CsvRow[]) {
  const errors: string[] = [];

  rows.forEach((row, index) => {
    const type = contentType(row.contentType?.trim() ?? "");
    const field = row.field?.trim() ?? "";

    if (!type) {
      errors.push(`row ${index + 2}: unsupported contentType`);
    }

    if (!row.id?.trim()) {
      errors.push(`row ${index + 2}: missing id`);
    }

    if (!isLocale(row.locale?.trim() ?? "")) {
      errors.push(`row ${index + 2}: unsupported locale`);
    }

    if (!type || !fieldAllowlist[type].has(field)) {
      errors.push(`row ${index + 2}: unsupported field ${field}`);
    }
  });

  return errors;
}

async function main() {
  const file = argValue("--file");
  const apply = process.argv.includes("--apply");

  if (!file) {
    throw new Error("Missing --file path.csv");
  }

  const rows = parseCsv(await readFile(file, "utf8"));
  const errors = validateRows(rows);

  if (errors.length > 0) {
    console.error(JSON.stringify({ errors }, null, 2));
    process.exitCode = 1;
    return;
  }

  if (!apply) {
    console.log(JSON.stringify({
      apply: false,
      message: "Dry run only. Re-run with --apply to update DB content.",
      rows: rows.length
    }, null, 2));
    return;
  }

  const sql = getSql();

  if (!sql) {
    throw new Error("DB_URL is not configured");
  }

  let updated = 0;

  for (const row of rows) {
    const type = contentType(row.contentType.trim());
    const field = row.field.trim();
    const id = row.id.trim();
    const locale = row.locale.trim();
    const text = row.currentText ?? "";

    if (!type || !fieldAllowlist[type].has(field)) {
      continue;
    }

    if (type === "blog") {
      await sql.unsafe(
        `update public.blog_posts set ${field} = $1, updated_at = now() where id = $2::uuid and locale = $3`,
        [text, id, locale]
      );
    }

    if (type === "testimonial") {
      await sql.unsafe(
        `update public.testimonials set ${field} = $1, updated_at = now() where id = $2::uuid and locale = $3`,
        [text, id, locale]
      );
    }

    if (type === "product") {
      await sql.unsafe(
        `update public.product_translations set ${field} = $1, status = 'complete', updated_at = now() where product_id = $2::uuid and locale = $3`,
        [text, id, locale]
      );
    }

    if (type === "supplement" && field === "aliases") {
      await sql`
        update public.supplement_translations
        set aliases = ${text.split("|").map((item) => item.trim()).filter(Boolean)},
            status = 'complete',
            updated_at = now()
        where supplement_id = ${id}::uuid
          and locale = ${locale}
      `;
    } else if (type === "supplement") {
      await sql.unsafe(
        `update public.supplement_translations set ${field} = $1, status = 'complete', updated_at = now() where supplement_id = $2::uuid and locale = $3`,
        [text, id, locale]
      );
    }

    updated += 1;
  }

  console.log(JSON.stringify({ apply, rows: rows.length, updated }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeSqlPool();
  });
