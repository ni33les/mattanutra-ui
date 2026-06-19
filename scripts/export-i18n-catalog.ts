import { writeFile } from "node:fs/promises";
import sourceCatalog from "@/content/i18n/source/en.json" with { type: "json" };
import glossary from "@/content/i18n/glossary.json" with { type: "json" };
import { isLocale, type Locale } from "@/lib/i18n";
import {
  messageIds,
  type MessageId
} from "@/content/i18n/generated";

type Descriptor = (typeof sourceCatalog)[MessageId] & {
  glossaryTerms?: readonly string[];
  maxLength?: number;
  notes?: string;
};

const csvHeaders = [
  "id",
  "namespace",
  "audience",
  "surface",
  "description",
  "defaultMessage",
  "currentTranslation",
  "variables",
  "glossaryTerms",
  "maxLength",
  "notes",
  "status"
] as const;

function argValue(name: string) {
  const direct = process.argv.find((arg) => arg.startsWith(`${name}=`));

  if (direct) {
    return direct.slice(name.length + 1);
  }

  const index = process.argv.indexOf(name);

  return index >= 0 ? process.argv[index + 1] : undefined;
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);

  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function readLocaleCatalog(locale: Locale) {
  if (locale === "en") {
    return Object.fromEntries(
      messageIds.map((id) => [id, sourceCatalog[id].defaultMessage])
    ) as Partial<Record<MessageId, string>>;
  }

  try {
    const localeModule = await import(`../content/i18n/locales/${locale}.json`, {
      with: { type: "json" }
    });

    return localeModule.default as Partial<Record<MessageId, string>>;
  } catch {
    return {};
  }
}

function descriptorGlossaryTerms(id: MessageId, descriptor: Descriptor) {
  if (descriptor.glossaryTerms?.length) {
    return descriptor.glossaryTerms;
  }

  const haystack = `${id}\n${descriptor.defaultMessage}\n${descriptor.description}`;

  return glossary
    .filter((entry) => haystack.includes(entry.term))
    .map((entry) => entry.term);
}

async function main() {
  const locale = argValue("--locale") ?? "zh-CN";
  const format = argValue("--format") ?? "csv";
  const out = argValue("--out");

  if (!isLocale(locale)) {
    throw new Error(`Unsupported locale: ${locale}`);
  }

  if (format !== "csv") {
    throw new Error(`Unsupported i18n export format: ${format}`);
  }

  const translations = await readLocaleCatalog(locale);
  const rows = messageIds.map((id) => {
    const descriptor = sourceCatalog[id] as Descriptor;
    const currentTranslation = translations[id] ?? "";
    const status =
      locale === "en"
        ? "source"
        : currentTranslation.trim()
          ? "translated"
          : descriptor.translatable === false
            ? "not_translatable"
            : "missing";

    return {
      audience: descriptor.audience,
      currentTranslation,
      defaultMessage: descriptor.defaultMessage,
      description: descriptor.description,
      glossaryTerms: JSON.stringify(descriptorGlossaryTerms(id, descriptor)),
      id,
      maxLength: descriptor.maxLength ?? "",
      namespace: descriptor.namespace,
      notes: descriptor.notes ?? "",
      status,
      surface: descriptor.surface,
      variables: JSON.stringify(descriptor.variables ?? [])
    };
  });

  const csv = [
    csvHeaders.join(","),
    ...rows.map((row) =>
      csvHeaders.map((header) => csvCell(row[header])).join(",")
    )
  ].join("\n");

  if (out) {
    await writeFile(out, `${csv}\n`);
    console.log(JSON.stringify({ file: out, locale, rows: rows.length }, null, 2));
    return;
  }

  console.log(csv);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
