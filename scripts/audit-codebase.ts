import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { getSql } from "@/lib/db";
import { catalogueSnapshotTableNames } from "@/lib/catalogue-snapshot-tables";

const SOURCE_DIRS = ["app", "components", "lib", "workers", "scripts", "test"] as const;
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mjs", ".js"]);

function argValue(name: string, fallback: string | null = null) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));

  return found ? found.slice(prefix.length) : fallback;
}

function extension(path: string) {
  const index = path.lastIndexOf(".");

  return index >= 0 ? path.slice(index) : "";
}

async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);

      return entry.isDirectory() ? filesUnder(path) : [path];
    })
  );

  return files
    .flat()
    .filter((file) => SOURCE_EXTENSIONS.has(extension(file)));
}

async function sourceFiles() {
  const groups = await Promise.all(
    SOURCE_DIRS.map(async (dir) => {
      try {
        return await filesUnder(dir);
      } catch {
        return [];
      }
    })
  );

  return groups.flat().sort();
}

async function tableCounts() {
  const sql = getSql();

  if (!sql) {
    return [];
  }

  try {
    const tables = await sql<Array<{ table_name: string }>>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_type = 'BASE TABLE'
      order by table_name
    `;
    const counts = [];

    for (const table of tables) {
      const rows = await sql<Array<{ count: number | string }>>`
        select count(*) as count
        from public.${sql(table.table_name)}
      `;
      counts.push({
        rows: Number(rows[0]?.count ?? 0),
        table: table.table_name
      });
    }

    return counts;
  } finally {
    await sql.end({ timeout: 1 });
  }
}

function classifyTable(table: string) {
  if (table.startsWith("product_") || table === "products") {
    return "Product catalogue";
  }
  if (table.startsWith("supplement_") || table === "supplements") {
    return "Supplement catalogue";
  }
  if (table.startsWith("task_") || table === "tasks" || table === "agents" || table === "worker_sessions") {
    return "Task runtime";
  }
  if (table === "assessments" || table === "assessment_versions" || table.startsWith("assessment_")) {
    return "Assessment";
  }
  if (table.includes("food") || table === "nutrients") {
    return "Food dormant";
  }
  if (table.startsWith("communication") || table.startsWith("plan_communication")) {
    return "Communications";
  }
  if (table.startsWith("finance")) {
    return "Finance";
  }
  if (table === "bpm" || table === "cron") {
    return "Operations";
  }
  if (table === "blog_posts" || table === "testimonials") {
    return "Content";
  }

  return "Other";
}

async function codeInventory() {
  const files = await sourceFiles();
  const inventory = [];
  const writeHotspots = [];
  const legacyHits = [];

  for (const file of files) {
    const source = await readFile(file, "utf8");
    const lines = source.split(/\r?\n/).length;
    const directWrites = [
      ...source.matchAll(/\b(insert into|update|delete from)\s+(public\.)?[a-z_]+/gi)
    ].length;
    const exportedOrNamedFunctions = [
      ...source.matchAll(/\b(export\s+)?(async\s+)?function\s+[A-Za-z0-9_]+\s*\(/g)
    ].length;
    const legacyTerms = [
      ...source.matchAll(/\b(marketplace|legacy|deprecated|temporary|source_snapshot|is_active|list_status)\b/gi)
    ].length;

    inventory.push({
      directWrites,
      exportedOrNamedFunctions,
      file: relative(process.cwd(), file),
      legacyTerms,
      lines
    });

    if (directWrites > 0) {
      writeHotspots.push({ directWrites, file: relative(process.cwd(), file), lines });
    }

    if (legacyTerms > 0) {
      legacyHits.push({ file: relative(process.cwd(), file), legacyTerms, lines });
    }
  }

  return {
    fileCount: files.length,
    largestFiles: [...inventory].sort((a, b) => b.lines - a.lines).slice(0, 25),
    legacyHits: legacyHits.sort((a, b) => b.legacyTerms - a.legacyTerms).slice(0, 25),
    totalLines: inventory.reduce((total, item) => total + item.lines, 0),
    writeHotspots: writeHotspots.sort((a, b) => b.directWrites - a.directWrites).slice(0, 25)
  };
}

function markdownTable(rows: readonly Record<string, unknown>[], columns: readonly string[]) {
  const header = `| ${columns.join(" | ")} |`;
  const separator = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) =>
    `| ${columns.map((column) => String(row[column] ?? "")).join(" | ")} |`
  );

  return [header, separator, ...body].join("\n");
}

const counts = await tableCounts();
const code = await codeInventory();
const groupedCounts = Object.entries(
  counts.reduce<Record<string, { rows: number; tables: number }>>((groups, row) => {
    const group = classifyTable(row.table);
    groups[group] ??= { rows: 0, tables: 0 };
    groups[group].rows += row.rows;
    groups[group].tables += 1;
    return groups;
  }, {})
).map(([group, summary]) => ({
  group,
  rows: summary.rows,
  tables: summary.tables
})).sort((a, b) => a.group.localeCompare(b.group));

const generatedAt = new Date().toISOString();
const markdown = `# MattaNutra Codebase Cleanup Assessment

Generated: ${generatedAt}

## Database Inventory

${markdownTable(groupedCounts, ["group", "tables", "rows"])}

## Catalogue Snapshot Scope

The reloadable catalogue snapshot includes:

${catalogueSnapshotTableNames().map((table) => `- \`${table}\``).join("\n")}

## Largest Modules

${markdownTable(code.largestFiles, ["file", "lines", "exportedOrNamedFunctions", "directWrites", "legacyTerms"])}

## Direct SQL Write Hotspots

${markdownTable(code.writeHotspots, ["file", "lines", "directWrites"])}

## Legacy / Compatibility Term Hotspots

${markdownTable(code.legacyHits, ["file", "lines", "legacyTerms"])}
`;

const output = argValue("out");

if (output) {
  await writeFile(resolve(output), markdown, "utf8");
}

console.log(markdown);
