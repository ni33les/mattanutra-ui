import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const handoffDir = join(
  root,
  "files/chinese-handoff/Chinese_optimised_localisation_conversion"
);
const outDir = join(root, "files/chinese-handoff");

const gb18030 = new TextDecoder("gb18030", { fatal: false });

function normalizeSpaces(value) {
  return String(value ?? "")
    .replace(/\uFFFD/g, "")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, " ")
    .trim();
}

function rtfPlainText(input) {
  const output = [];
  let hexBuffer = [];
  let unicodeSkip = 1;
  let skip = 0;

  function push(value) {
    output.push(value);
  }

  function flushHexBuffer() {
    if (hexBuffer.length < 1) return;
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
      if (Number.isFinite(byte)) hexBuffer.push(byte);
      index += 3;
      continue;
    }
    flushHexBuffer();
    let cursor = index + 1;
    if (cursor < input.length && !/[A-Za-z]/.test(input[cursor])) {
      if ("{}\\".includes(input[cursor])) push(input[cursor]);
      index = cursor;
      continue;
    }
    while (cursor < input.length && /[A-Za-z]/.test(input[cursor])) cursor += 1;
    const word = input.slice(index + 1, cursor);
    let sign = 1;
    if (input[cursor] === "-") {
      sign = -1;
      cursor += 1;
    }
    const numberStart = cursor;
    while (cursor < input.length && /\d/.test(input[cursor])) cursor += 1;
    const numeric = input.slice(numberStart, cursor);
    if (input[cursor] === " ") cursor += 1;
    if (word === "row") push("\n");
    else if (word === "cell" || word === "tab") push("\t");
    else if (word === "par" || word === "line") push("\n");
    else if (word === "u" && numeric) {
      let codePoint = sign * Number.parseInt(numeric, 10);
      if (codePoint < 0) codePoint += 65536;
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

function parseMarketRows(input) {
  const rows = [];
  let section = "术语表";
  for (const rawLine of rtfPlainText(input).split("\n")) {
    const cells = rawLine.split("\t").map(normalizeSpaces).filter(Boolean);
    if (cells.length < 2) continue;
    if (
      cells.length >= 2 &&
      cells[cells.length - 2] === "English" &&
      cells[cells.length - 1] === "中文"
    ) {
      section = cells.slice(0, -2).join(" ");
      continue;
    }
    const candidate =
      cells.length >= 3
        ? { english: cells[1], label: cells[0], section, zhCN: cells.slice(2).join(" ") }
        : section === "术语表"
          ? { english: cells[0], label: "Term", section, zhCN: cells[1] }
          : null;
    if (!candidate) continue;
    if (
      candidate.english === "English" ||
      candidate.zhCN === "中文" ||
      !candidate.english ||
      !candidate.zhCN
    ) {
      continue;
    }
    const rowHash = createHash("sha256")
      .update([candidate.section, candidate.label, candidate.english, candidate.zhCN].join("\n"))
      .digest("hex")
      .slice(0, 16);
    rows.push({ ...candidate, rowHash });
  }
  return rows;
}

/** Questionnaire page RTF is mostly sequential EN/ZH blocks, not market tables. */
function parseQuestionnairePairs(input) {
  const plain = rtfPlainText(input)
    .replace(/\uFFFD/g, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    // drop font junk lines
    .filter((line) => !/Helvetica|PingFang|Times-Roman|LucidaGrande|Hiragino|SIL-Kai/i.test(line))
    .filter((line) => !/^\{decimal\}|^\{disc\}/i.test(line));

  const pairs = [];
  let i = 0;
  const hasCjk = (s) => /[\u4e00-\u9fff]/.test(s);
  const mostlyLatin = (s) => {
    const cjk = (s.match(/[\u4e00-\u9fff]/g) || []).length;
    const latin = (s.match(/[A-Za-z]/g) || []).length;
    return latin > 8 && cjk < latin * 0.35;
  };

  while (i < plain.length) {
    const line = plain[i];
    // Skip pure chrome debris
    if (line.length < 2) {
      i += 1;
      continue;
    }
    if (mostlyLatin(line) && i + 1 < plain.length && hasCjk(plain[i + 1])) {
      pairs.push({
        english: line,
        zhCN: plain[i + 1],
        index: pairs.length
      });
      i += 2;
      continue;
    }
    // single bilingual line with little separator
    if (mostlyLatin(line) && hasCjk(line)) {
      // try split at first CJK run
      const m = line.match(/^(.*?)([\u4e00-\u9fff].*)$/);
      if (m && m[1].trim().length > 3) {
        pairs.push({ english: m[1].trim(), zhCN: m[2].trim(), index: pairs.length });
      }
    }
    i += 1;
  }

  return { plain, pairs };
}

mkdirSync(outDir, { recursive: true });

const marketRaw = readFileSync(
  join(handoffDir, "mattanutra-zh-CN market optimised for conversion_DS.rtf"),
  "utf8"
);
const questionRaw = readFileSync(join(handoffDir, "Questionaire Page.rtf"), "utf8");

const marketRows = parseMarketRows(marketRaw);
const questionnaire = parseQuestionnairePairs(questionRaw);

writeFileSync(join(outDir, "market-rtf-rows.json"), JSON.stringify(marketRows, null, 2));
writeFileSync(
  join(outDir, "questionnaire-rtf-pairs.json"),
  JSON.stringify(questionnaire.pairs, null, 2)
);
writeFileSync(join(outDir, "questionnaire-rtf-plain.txt"), questionnaire.plain.join("\n"));

console.log(
  JSON.stringify(
    {
      marketRows: marketRows.length,
      questionnairePairs: questionnaire.pairs.length,
      questionnairePlainLines: questionnaire.plain.length
    },
    null,
    2
  )
);

for (const pair of questionnaire.pairs.slice(0, 50)) {
  console.log("---");
  console.log("EN:", pair.english.slice(0, 160));
  console.log("ZH:", pair.zhCN.slice(0, 160));
}
