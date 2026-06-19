import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import sourceCatalog from "@/content/i18n/source/en.json" with { type: "json" };
import glossary from "@/content/i18n/glossary.json" with { type: "json" };
import { isLocale, type Locale } from "@/lib/i18n";
import {
  extractIcuVariables,
  isMessageId
} from "@/lib/i18n-messages";
import {
  messageIds,
  type MessageId
} from "@/content/i18n/generated";

type Descriptor = (typeof sourceCatalog)[MessageId] & {
  allowMarkup?: boolean;
  approvedGlossaryOverrides?: readonly Readonly<{
    locale: Locale;
    reason: string;
    term: string;
  }>[];
  maxLength?: number;
};

type CsvRow = Record<string, string>;

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

function variablesMatch(first: readonly string[], second: readonly string[]) {
  return (
    first.length === second.length &&
    first.every((value, index) => value === second[index])
  );
}

function normalizedVariables(value: readonly string[] | undefined) {
  return [...new Set(value ?? [])].sort();
}

function containsAccidentalMarkup(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value) || /\[[^\]]+\]\([^)]+\)/.test(value) || /\*\*[^*]+\*\*/.test(value);
}

function hasApprovedGlossaryOverride(
  descriptor: Descriptor,
  locale: Locale,
  term: string
) {
  return descriptor.approvedGlossaryOverrides?.some((override) =>
    override.locale === locale && override.term === term && override.reason.trim()
  ) ?? false;
}

async function readLocaleCatalog(locale: Locale) {
  if (locale === "en") {
    return {};
  }

  try {
    const text = await readFile(`content/i18n/locales/${locale}.json`, "utf8");

    return JSON.parse(text) as Partial<Record<MessageId, string>>;
  } catch {
    return {};
  }
}

async function main() {
  const locale = argValue("--locale");
  const file = argValue("--file");
  const dryRun = process.argv.includes("--dry-run");

  if (!locale || !isLocale(locale)) {
    throw new Error(`Unsupported or missing locale: ${locale ?? "(missing)"}`);
  }

  if (locale === "en") {
    throw new Error("Import writes translated locale files only; edit source/en.json for English.");
  }

  if (!file) {
    throw new Error("Missing --file path.csv");
  }

  const rows = parseCsv(await readFile(file, "utf8"));
  const existing = await readLocaleCatalog(locale);
  const next: Partial<Record<MessageId, string>> = { ...existing };
  const errors: string[] = [];
  const warnings: string[] = [];
  let updated = 0;

  for (const row of rows) {
    const id = row.id?.trim();

    if (!id) {
      continue;
    }

    if (!isMessageId(id)) {
      errors.push(`${id}: unknown catalog ID`);
      continue;
    }

    const descriptor = sourceCatalog[id] as Descriptor;
    const translation = row.currentTranslation?.trim() ?? "";

    if (descriptor.translatable === false) {
      continue;
    }

    if (!translation) {
      errors.push(`${id}: missing currentTranslation`);
      continue;
    }

    if (!descriptor.allowMarkup && containsAccidentalMarkup(translation)) {
      errors.push(`${id}: translation contains HTML or Markdown but descriptor does not allow markup`);
      continue;
    }

    if (
      typeof descriptor.maxLength === "number" &&
      translation.length > descriptor.maxLength
    ) {
      errors.push(`${id}: translation exceeds maxLength ${descriptor.maxLength}`);
      continue;
    }

    try {
      const expectedVariables = normalizedVariables(descriptor.variables);
      const actualVariables = extractIcuVariables(translation);

      if (!variablesMatch(actualVariables, expectedVariables)) {
        errors.push(
          `${id}: ICU placeholders [${actualVariables.join(", ")}] do not match [${expectedVariables.join(", ")}]`
        );
        continue;
      }
    } catch (error) {
      errors.push(`${id}: invalid ICU syntax: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }

    glossary
      .filter((entry) => entry.protected && descriptor.defaultMessage.includes(entry.term))
      .forEach((entry) => {
        if (
          !translation.includes(entry.term) &&
          !hasApprovedGlossaryOverride(descriptor, locale, entry.term)
        ) {
          warnings.push(`${id}: protected glossary term "${entry.term}" is not preserved`);
        }
      });

    if (next[id] !== translation) {
      next[id] = translation;
      updated += 1;
    }
  }

  for (const id of messageIds) {
    const descriptor = sourceCatalog[id];

    if (descriptor.translatable !== false && !next[id]?.trim()) {
      errors.push(`${id}: missing required ${locale} translation after import`);
    }
  }

  if (errors.length > 0) {
    console.error(JSON.stringify({ errors, warnings }, null, 2));
    process.exitCode = 1;
    return;
  }

  const outputPath = resolve(`content/i18n/locales/${locale}.json`);
  const sorted = Object.fromEntries(
    messageIds.map((id) => [id, next[id] ?? ""])
  );

  if (!dryRun) {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(sorted, null, 2)}\n`);
  }

  console.log(JSON.stringify({
    dryRun,
    file: outputPath,
    locale,
    rows: rows.length,
    updated,
    warnings
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
