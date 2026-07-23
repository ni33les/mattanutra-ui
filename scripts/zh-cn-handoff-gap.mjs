import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

// Load TS modules via strip-types entry is awkward; use plain JSON catalog + static parse of copy files.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const plain = readFileSync(
  join(root, "files/chinese-handoff/questionnaire-rtf-plain.txt"),
  "utf8"
);
const zhModule = readFileSync(
  join(root, "components/assessment-flow-copy-zh-cn.ts"),
  "utf8"
);
const uiModule = readFileSync(
  join(root, "components/assessment-flow-copy.ts"),
  "utf8"
);
const panel = readFileSync(
  join(root, "components/nutrition-flow/healthscore-panel-copy.ts"),
  "utf8"
);
const catalog = JSON.parse(
  readFileSync(join(root, "content/i18n/locales/zh-CN.json"), "utf8")
);

function extractZhStrings(source) {
  const out = [];
  const re = /"((?:\\.|[^"\\])*)"/g;
  let m;
  while ((m = re.exec(source))) {
    const s = m[1]
      .replace(/\\n/g, "\n")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
    if (/[\u4e00-\u9fff]/.test(s) && s.length >= 2) out.push(s);
  }
  return out;
}

function normalize(s) {
  return s.replace(/\s+/g, "").replace(/[—–-]/g, "—");
}

// Split bilingual plain lines into ZH segments
const handoffZh = [];
for (const line of plain.split("\n")) {
  // Prefer longest CJK run segments
  const parts = line.split(/(?<=[\u4e00-\u9fff])(?=[A-Za-z])/);
  for (const part of parts) {
    const m = part.match(/[\u4e00-\u9fff].*/);
    if (m) {
      const zh = m[0].replace(/[☑✓☑️]/g, "").trim();
      if (zh.length >= 2) handoffZh.push(zh);
    }
  }
  // whole-line CJK
  if (/^[\u4e00-\u9fff]/.test(line.trim()) || /[\u4e00-\u9fff]{4,}/.test(line)) {
    const only = line.replace(/[A-Za-z0-9%./()·,:;'"`_+*#@!?\-\[\]{}|\\<>]+/g, " ").replace(/\s+/g, " ").trim();
    // keep mixed with punctuation
    const zhOnly = line.match(/[\u4e00-\u9fff][^A-Za-z]*/g);
    if (zhOnly) for (const z of zhOnly) if (z.trim().length >= 2) handoffZh.push(z.trim());
  }
}

const uniqueHandoff = [...new Set(handoffZh.map((s) => s.trim()).filter(Boolean))];
const productZh = [
  ...extractZhStrings(zhModule),
  ...extractZhStrings(uiModule),
  ...extractZhStrings(panel),
  ...Object.values(catalog).filter((v) => typeof v === "string" && /[\u4e00-\u9fff]/.test(v))
];
const productNorm = new Set(productZh.map(normalize));

const missing = [];
const present = [];
for (const zh of uniqueHandoff) {
  const n = normalize(zh);
  if (n.length < 4) continue;
  // skip pure number-ish
  if (!/[\u4e00-\u9fff]{2,}/.test(zh)) continue;
  let found = productNorm.has(n);
  if (!found) {
    for (const p of productNorm) {
      if (p.includes(n) || n.includes(p)) {
        found = true;
        break;
      }
    }
  }
  (found ? present : missing).push(zh);
}

const report = {
  handoffZhSegments: uniqueHandoff.length,
  productZhStrings: productZh.length,
  presentApprox: present.length,
  missingApprox: missing.length,
  missingSample: missing.slice(0, 80),
  presentSample: present.slice(0, 20)
};

writeFileSync(
  join(root, "files/chinese-handoff/GAP_MATRIX.json"),
  JSON.stringify(report, null, 2)
);
console.log(JSON.stringify({ ...report, missingSample: report.missingSample.slice(0, 40) }, null, 2));
