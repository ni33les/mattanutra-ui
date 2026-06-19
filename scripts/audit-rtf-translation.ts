import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import sourceCatalog from "@/content/i18n/source/en.json" with { type: "json" };
import glossary from "@/content/i18n/glossary.json" with { type: "json" };
import { isLocale, type Locale } from "@/lib/i18n";
import {
  isMessageId,
  type MessageId
} from "@/lib/i18n-messages";

type RtfRow = Readonly<{
  english: string;
  label: string;
  rowHash: string;
  section: string;
  zhCN: string;
}>;

type ReconciliationStatus =
  | "implemented_catalog"
  | "implemented_db_seed"
  | "not_in_product"
  | "superseded_by_current_copy";

type ReconciliationRow = Readonly<{
  catalogChecks?: ReadonlyArray<Readonly<{
    id: MessageId;
    zhCN: string;
  }>>;
  catalogIds?: readonly MessageId[];
  dbSeedRefs?: readonly string[];
  english: string;
  label: string;
  reason?: string;
  rowHash: string;
  section: string;
  status: ReconciliationStatus;
  zhCN: string;
}>;

type ReconciliationMatrix = Readonly<{
  generatedFrom: string;
  locale: Locale;
  rows: readonly ReconciliationRow[];
}>;

const validStatuses = new Set<ReconciliationStatus>([
  "implemented_catalog",
  "implemented_db_seed",
  "not_in_product",
  "superseded_by_current_copy"
]);

const gb18030 = new TextDecoder("gb18030", { fatal: false });

function argValue(name: string) {
  const direct = process.argv.find((arg) => arg.startsWith(`${name}=`));

  if (direct) {
    return direct.slice(name.length + 1);
  }

  const index = process.argv.indexOf(name);

  return index >= 0 ? process.argv[index + 1] : undefined;
}

function normalizeSpaces(value: string) {
  return value
    .replace(/\uFFFD/g, "")
    .replace(/Matta耨utā/g, "Mattaññutā")
    .replace(/Ç¹Ô´Ò/g, "วนิดา")
    .replace(/枪源/g, "วนิดา")
    .replace(/烈耪/g, "มาลี")
    .replace(/MDPhD/g, "MD–PhD")
    .replace(/(^|\D)1530(?=\D|$)/g, "$115–30")
    .replace(/(^|\D)3060(?=\D|$)/g, "$130–60")
    .replace(/[棗]/g, "—")
    .replace(//g, "–")
    .replace(/\?{3,}/g, "")
    .replace(/\s+([，。！？；：、])/g, "$1")
    .replace(/([（「])\s+/g, "$1")
    .replace(/\s+([）」])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanSection(value: string) {
  return normalizeSpaces(value)
    .replace(/\bElement\b/g, "")
    .replace(/\bEnglish\b.*$/g, "")
    .trim();
}

function rtfPlainText(input: string) {
  const output: string[] = [];
  let hexBuffer: number[] = [];
  let unicodeSkip = 1;
  let skip = 0;

  function push(value: string) {
    output.push(value);
  }

  function flushHexBuffer() {
    if (hexBuffer.length < 1) {
      return;
    }

    push(gb18030.decode(Uint8Array.from(hexBuffer)));
    hexBuffer = [];
  }

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (skip > 0) {
      skip -= 1;
      continue;
    }

    if (char === "{" || char === "}") {
      flushHexBuffer();
      continue;
    }

    if (char !== "\\") {
      flushHexBuffer();
      push(char === "\r" || char === "\n" ? " " : char);
      continue;
    }

    if (input[index + 1] === "'" && index + 3 < input.length) {
      const byte = Number.parseInt(input.slice(index + 2, index + 4), 16);

      if (Number.isFinite(byte)) {
        hexBuffer.push(byte);
      }

      index += 3;
      continue;
    }

    flushHexBuffer();

    let cursor = index + 1;

    if (cursor < input.length && !/[A-Za-z]/.test(input[cursor])) {
      if ("{}\\".includes(input[cursor])) {
        push(input[cursor]);
      }

      index = cursor;
      continue;
    }

    while (cursor < input.length && /[A-Za-z]/.test(input[cursor])) {
      cursor += 1;
    }

    const word = input.slice(index + 1, cursor);
    let sign = 1;

    if (input[cursor] === "-") {
      sign = -1;
      cursor += 1;
    }

    const numberStart = cursor;
    while (cursor < input.length && /\d/.test(input[cursor])) {
      cursor += 1;
    }

    const numeric = input.slice(numberStart, cursor);

    if (input[cursor] === " ") {
      cursor += 1;
    }

    if (word === "row") {
      push("\n");
    } else if (word === "cell" || word === "tab") {
      push("\t");
    } else if (word === "par" || word === "line") {
      push(" ");
    } else if (word === "u" && numeric) {
      let codePoint = sign * Number.parseInt(numeric, 10);

      if (codePoint < 0) {
        codePoint += 65536;
      }

      push(String.fromCharCode(codePoint));
      skip = unicodeSkip;
    } else if (word === "uc" && numeric) {
      unicodeSkip = Number.parseInt(numeric, 10);
    }

    index = cursor - 1;
  }

  flushHexBuffer();

  return output.join("");
}

function rowHash(input: Readonly<{
  english: string;
  label: string;
  section: string;
  zhCN: string;
}>) {
  return createHash("sha256")
    .update([
      input.section,
      input.label,
      input.english,
      input.zhCN
    ].map(normalizeSpaces).join("\n"))
    .digest("hex")
    .slice(0, 16);
}

export function parseRtfRows(input: string): RtfRow[] {
  const rows: RtfRow[] = [];
  let section = "术语表";

  for (const rawLine of rtfPlainText(input).split("\n")) {
    const cells = rawLine
      .split("\t")
      .map(normalizeSpaces)
      .filter(Boolean);

    if (cells.length < 2) {
      continue;
    }

    if (
      cells.length >= 2 &&
      cells[cells.length - 2] === "English" &&
      cells[cells.length - 1] === "中文"
    ) {
      section = cleanSection(cells.slice(0, -2).join(" "));
      continue;
    }

    const candidate =
      cells.length >= 3
        ? {
            english: cells[1],
            label: cells[0],
            section,
            zhCN: cells.slice(2).join(" ")
          }
        : section === "术语表"
          ? {
              english: cells[0],
              label: "Term",
              section,
              zhCN: cells[1]
            }
          : null;

    if (!candidate) {
      continue;
    }

    if (
      candidate.english === "English" ||
      candidate.zhCN === "中文" ||
      candidate.english.length < 1 ||
      candidate.zhCN.length < 1
    ) {
      continue;
    }

    rows.push({
      ...candidate,
      rowHash: rowHash(candidate)
    });
  }

  return rows;
}

async function readLocaleCatalog(locale: Locale) {
  if (locale === "en") {
    return Object.fromEntries(
      Object.entries(sourceCatalog).map(([id, descriptor]) => [
        id,
        descriptor.defaultMessage
      ])
    ) as Partial<Record<MessageId, string>>;
  }

  const text = await readFile(`content/i18n/locales/${locale}.json`, "utf8");

  return JSON.parse(text) as Partial<Record<MessageId, string>>;
}

async function readMatrix(locale: Locale) {
  const text = await readFile(`content/i18n/reconciliation/${locale}-rtf.json`, "utf8");

  return JSON.parse(text) as ReconciliationMatrix;
}

function equivalentCopy(first: string, second: string) {
  return normalizeSpaces(first) === normalizeSpaces(second);
}

async function main() {
  const locale = argValue("--locale") ?? "zh-CN";
  const file = argValue("--file");
  const dumpRows = process.argv.includes("--dump-rows");

  if (!isLocale(locale)) {
    throw new Error(`Unsupported locale: ${locale}`);
  }

  if (locale !== "zh-CN") {
    throw new Error("RTF reconciliation is currently defined for zh-CN only.");
  }

  if (!file) {
    throw new Error("Missing --file path/to/source.rtf");
  }

  const rtfRows = parseRtfRows(await readFile(file, "utf8"));

  if (dumpRows) {
    console.log(JSON.stringify(rtfRows, null, 2));
    return;
  }

  const matrix = await readMatrix(locale);
  const translations = await readLocaleCatalog(locale);
  const parsedByHash = new Map(rtfRows.map((row) => [row.rowHash, row]));
  const matrixByHash = new Map(matrix.rows.map((row) => [row.rowHash, row]));
  const findings: string[] = [];

  if (matrix.locale !== locale) {
    findings.push(`matrix locale ${matrix.locale} does not match requested ${locale}`);
  }

  for (const row of rtfRows) {
    if (!matrixByHash.has(row.rowHash)) {
      findings.push(`missing matrix row for ${row.section} / ${row.label} / ${row.english}`);
    }
  }

  for (const row of matrix.rows) {
    const parsed = parsedByHash.get(row.rowHash);

    if (!parsed) {
      findings.push(`matrix row ${row.rowHash} no longer exists in parsed RTF`);
      continue;
    }

    if (!validStatuses.has(row.status)) {
      findings.push(`${row.rowHash}: invalid status ${row.status}`);
    }

    if (
      !equivalentCopy(row.section, parsed.section) ||
      !equivalentCopy(row.label, parsed.label) ||
      !equivalentCopy(row.english, parsed.english) ||
      !equivalentCopy(row.zhCN, parsed.zhCN)
    ) {
      findings.push(`${row.rowHash}: matrix row text drifted from parsed RTF`);
    }

    if (row.status === "implemented_catalog" || row.status === "implemented_db_seed") {
      const catalogChecks =
        row.catalogChecks ??
        (row.catalogIds ?? []).map((id) => ({ id, zhCN: row.zhCN }));

      if (row.status === "implemented_catalog" && catalogChecks.length < 1) {
        findings.push(`${row.rowHash}: implemented_catalog requires catalogIds or catalogChecks`);
      }

      for (const check of catalogChecks) {
        if (!isMessageId(check.id)) {
          findings.push(`${row.rowHash}: unknown catalog ID ${check.id}`);
          continue;
        }

        const actual = translations[check.id];

        if (!equivalentCopy(actual ?? "", check.zhCN)) {
          findings.push(
            `${row.rowHash}: ${check.id} expected "${check.zhCN}" but found "${actual ?? ""}"`
          );
        }
      }
    }

    if (row.status === "implemented_db_seed" && !row.dbSeedRefs?.length) {
      findings.push(`${row.rowHash}: implemented_db_seed requires dbSeedRefs`);
    }

    if (
      (row.status === "not_in_product" || row.status === "superseded_by_current_copy") &&
      !row.reason?.trim()
    ) {
      findings.push(`${row.rowHash}: ${row.status} requires a reason`);
    }
  }

  const protectedGlossaryFindings = glossary
    .filter((entry) => entry.protected)
    .flatMap((entry) => {
      const translation = entry.translations?.[locale] ?? entry.term;
      const matchingRows = matrix.rows.filter((row) =>
        row.english === entry.term || row.zhCN.includes(entry.term)
      );

      return matchingRows
        .filter((row) => !row.zhCN.includes(translation))
        .map((row) => `${row.rowHash}: protected glossary term ${entry.term} not preserved as ${translation}`);
    });

  findings.push(...protectedGlossaryFindings);

  const report = {
    file,
    findings,
    locale,
    matrixRows: matrix.rows.length,
    parsedRows: rtfRows.length,
    status: findings.length > 0 ? "needs_attention" : "ok"
  };

  console.log(JSON.stringify(report, null, 2));

  if (findings.length > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
