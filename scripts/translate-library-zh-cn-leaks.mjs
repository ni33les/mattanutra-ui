/**
 * One-off: translate EN-cloned library zh-CN articles into Simplified Chinese.
 * Uses xAI Grok with MattaNutra glossary rules. Does not change option values.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT = join(root, "content/library/visual-knowledge.json");

const LEAK_SLUGS = [
  "which-supplements-do-vegans-actually-need",
  "l-carnitine-and-your-energy",
  "spicy-food-thailand-supplement-routine",
  "gut-health-supplements-when-make-sense",
  "gut-absorption-supplements"
];

const TRANSLATABLE_KEYS = new Set([
  "text",
  "title",
  "description",
  "excerpt",
  "seoTitle",
  "imageAlt",
  "question",
  "answer",
  "label"
]);

const GLOSSARY = `
Brand glossary (must preserve):
- MattaNutra → MattaNutra (do not translate)
- Mattaññutā → Mattaññutā when formal; 知量 when conversational gloss is natural
- Right Amount Formula / Right Amount Plan → 知量方案
- Right Amount → 知量
- Living Protocol → 动态健康方案
- HealthScore / Health Score → 健康评分
- Nong Matta → Nong Matta
- Library (product surface) → 知识库 or 图书馆 (match existing MattaNutra library tone)
Keep Latin nutrient/product codes: B12, D3, EPA, DHA, ALA, CoQ10, IU, mg, mcg, Omega-3, L-Carnitine, etc.
Tone: natural Simplified Chinese (Mainland), conversion-quality, second person 你 not 您, no machine-translation stiffness.
Do not invent medical claims. Wellness guidance, not diagnosis.
`.trim();

function loadEnv() {
  for (const p of [
    join(root, ".env.local"),
    "/root/codex/mattanutra-ui/.env.local"
  ]) {
    try {
      const text = readFileSync(p, "utf8");
      for (const line of text.split("\n")) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (!m) continue;
        if (!process.env[m[1]]) process.env[m[1]] = m[2];
      }
    } catch {
      /* ignore */
    }
  }
}

function collectTranslatable(node, out = []) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const item of node) collectTranslatable(item, out);
    return out;
  }
  for (const [key, value] of Object.entries(node)) {
    if (typeof value === "string") {
      if (TRANSLATABLE_KEYS.has(key) && value.trim() && /[A-Za-z]{3,}/.test(value)) {
        out.push({ node, key, text: value });
      }
    } else if (value && typeof value === "object") {
      collectTranslatable(value, out);
    }
  }
  return out;
}

function rewriteHrefs(node) {
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(rewriteHrefs);
  const next = { ...node };
  if (next.attrs && typeof next.attrs === "object") {
    next.attrs = { ...next.attrs };
    if (typeof next.attrs.href === "string") {
      next.attrs.href = next.attrs.href
        .replace(/^\/en\//, "/zh-CN/")
        .replace(/^\/th\//, "/zh-CN/");
    }
  }
  if (Array.isArray(next.children)) {
    next.children = next.children.map(rewriteHrefs);
  }
  if (next.page?.nodes) {
    next.page = { ...next.page, nodes: next.page.nodes.map(rewriteHrefs) };
  }
  for (const [k, v] of Object.entries(next)) {
    if (k === "attrs" || k === "children" || k === "page") continue;
    if (v && typeof v === "object") next[k] = rewriteHrefs(v);
  }
  return next;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function chunk(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) out.push(array.slice(i, i + size));
  return out;
}

async function translateBatch(strings, model, apiKey) {
  const payload = strings.map((text, index) => ({ index, text }));
  const body = {
    model,
    temperature: 0.2,
    max_tokens: 12000,
    messages: [
      {
        role: "system",
        content:
          "You translate MattaNutra Library article copy from English to Simplified Chinese (zh-CN). Return ONLY valid JSON: an array of {index, text} with Chinese text. Keep HTML-free plain text. Preserve markdown-free paragraphs. " +
          GLOSSARY
      },
      {
        role: "user",
        content: JSON.stringify(payload, null, 2)
      }
    ]
  };

  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`xAI ${response.status}: ${err.slice(0, 500)}`);
  }

  const json = await response.json();
  const content = json.choices?.[0]?.message?.content ?? "";
  const cleaned = content
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start >= 0 && end > start) {
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    } else {
      throw new Error(`Could not parse translation JSON: ${cleaned.slice(0, 300)}`);
    }
  }
  if (!Array.isArray(parsed)) throw new Error("Translation response is not an array");

  const map = new Map();
  for (const row of parsed) {
    if (typeof row?.index === "number" && typeof row?.text === "string" && row.text.trim()) {
      map.set(row.index, row.text.trim());
    }
  }
  return map;
}

function cjkRatio(text) {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  return { cjk, latin };
}

async function main() {
  loadEnv();
  const apiKey = process.env.XAI_API_KEY?.trim();
  if (!apiKey) throw new Error("XAI_API_KEY required");
  const model = process.env.GROK_MODEL?.trim() || "grok-4.5";

  const library = JSON.parse(readFileSync(CONTENT, "utf8"));
  const unique = new Map(); // en -> zh later

  for (const slug of LEAK_SLUGS) {
    const article = library.articles.find((row) => row.slug === slug);
    if (!article) throw new Error(`Missing article ${slug}`);
    const en = article.translations.en;
    if (!en) throw new Error(`Missing EN for ${slug}`);
    // Start zh from EN clone with locale hrefs
    article.translations["zh-CN"] = rewriteHrefs(deepClone(en));
    for (const item of collectTranslatable(article.translations["zh-CN"])) {
      if (!unique.has(item.text)) unique.set(item.text, null);
    }
  }

  const strings = [...unique.keys()];
  console.log(`Translating ${strings.length} unique strings for ${LEAK_SLUGS.length} articles...`);

  const batches = chunk(strings, 28);
  for (let i = 0; i < batches.length; i += 1) {
    const batch = batches[i];
    console.log(`Batch ${i + 1}/${batches.length} (${batch.length} strings)...`);
    let map;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        map = await translateBatch(batch, model, apiKey);
        break;
      } catch (error) {
        console.warn(`  attempt ${attempt} failed:`, error.message);
        if (attempt === 3) throw error;
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
    let hit = 0;
    for (let index = 0; index < batch.length; index += 1) {
      const translated = map.get(index);
      if (translated) {
        unique.set(batch[index], translated);
        hit += 1;
      }
    }
    console.log(`  mapped ${hit}/${batch.length}`);
    // gentle pacing
    await new Promise((r) => setTimeout(r, 400));
  }

  // Apply
  for (const slug of LEAK_SLUGS) {
    const article = library.articles.find((row) => row.slug === slug);
    const zh = article.translations["zh-CN"];
    for (const item of collectTranslatable(zh)) {
      const translated = unique.get(item.text);
      if (translated) item.node[item.key] = translated;
    }
    const check = collectTranslatable(zh);
    const stillEnglish = check.filter((row) => {
      const { cjk, latin } = cjkRatio(row.text);
      return latin > 12 && cjk < 4;
    });
    console.log(
      `${slug}: remaining-latinish ${stillEnglish.length}/${check.length}`
    );
    if (stillEnglish.length) {
      console.log(
        "  sample:",
        stillEnglish.slice(0, 3).map((row) => row.text.slice(0, 80))
      );
    }
  }

  writeFileSync(CONTENT, JSON.stringify(library, null, 2) + "\n");
  console.log("Wrote", CONTENT);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
