import { type ProductImportFactInput } from "@/lib/admin-products";
import { normalizeProductFactName } from "@/lib/product-recommendations";

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function numberFromDose(value: string) {
  const parsed = Number(value.replace(/,/g, ""));

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function unitFromVistraText(value: string) {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");

  if (/พันล้าน|billion/.test(normalized) && /cfu|ซีเอฟยู/.test(normalized)) {
    return "billion CFU";
  }

  if (/cfu|ซีเอฟยู/.test(normalized)) {
    return "CFU";
  }

  if (/ไมโครกรัม|มคก|mcg|µg|ug/.test(normalized)) {
    return "mcg";
  }

  if (/หน่วยสากล|ไอยู|i\.?\s*u\.?|iu/.test(normalized)) {
    return "IU";
  }

  if (/มิลลิกรัม|มก|mg/.test(normalized)) {
    return "mg";
  }

  if (/กรัม|g\b/.test(normalized)) {
    return "g";
  }

  return null;
}

function normalizeVistraFactName(value: string) {
  const cleaned = cleanText(value)
    .replace(/^[-–—*•]\s*/, "")
    .replace(/^[:：,;)\]]+\s*/, "")
    .replace(/^(?:ให้|provides?|yielding|equivalent\s+to)\s+/i, "")
    .replace(/^(?:และ|รวม|ต่อ|per)\s+/i, "")
    .replace(/\s*\([^)]*\)\s*$/g, "")
    .trim();
  const compactThai = cleaned.replace(/\s+/g, "");

  if (/\b(?:epa|eicosapentaenoic)\b/i.test(cleaned) || /ไอโคซาเพนตาอีโนอิก/.test(compactThai)) {
    return "EPA";
  }

  if (/\b(?:dha|docosahexaenoic)\b/i.test(cleaned) || /โดโคซาเฮกซาอีโนอิก/.test(compactThai)) {
    return "DHA";
  }

  if (/omega\s*-?\s*3/i.test(cleaned) || /โอเมก้า-?3|โอเมกา-?3/.test(compactThai)) {
    return "Omega-3";
  }

  if (/fish\s*oil/i.test(cleaned) || /น้ำมันปลา/.test(compactThai)) {
    return "Fish Oil";
  }

  if (/astaxanthin/i.test(cleaned) || /แอสตาแซน/.test(compactThai)) {
    return "Astaxanthin";
  }

  if (/co\s*enzyme\s*q10|coq10|ubiquinone/i.test(cleaned) || /โคเอนไซม์คิว10|โคเอนไซม์/.test(compactThai)) {
    return "CoQ10";
  }

  if (/l[-\s]*lysine|lysine/i.test(cleaned) || /ไลซีน/.test(compactThai)) {
    return "L-Lysine";
  }

  if (/glutathione/i.test(cleaned) || /กลูตาไธโอน/.test(compactThai)) {
    return "L-Glutathione";
  }

  if (/zinc/i.test(cleaned) || /สังกะสี|ซิงค์/.test(compactThai)) {
    return "Zinc";
  }

  if (/magnesium/i.test(cleaned) || /แมกนีเซียม/.test(compactThai)) {
    return "Magnesium";
  }

  if (/calcium/i.test(cleaned) || /แคลเซียม/.test(compactThai)) {
    return "Calcium";
  }

  if (/vitamin\s*d3?|cholecalciferol/i.test(cleaned) || /วิตามินดี3?|โคลีแคลซิเฟอรอล/.test(compactThai)) {
    return "Vitamin D3";
  }

  if (/vitamin\s*e|tocopher/i.test(cleaned) || /วิตามินอี|โทโคเฟอ/.test(compactThai)) {
    return "Vitamin E";
  }

  if (/vitamin\s*c|ascorb/i.test(cleaned) || /วิตามินซี|แอสคอร์บ/.test(compactThai)) {
    return "Vitamin C";
  }

  if (/vitamin\s*b\s*12|cyanocobalamin|cobalamin/i.test(cleaned) || /วิตามินบี12|ไซยาโนโคบาลามิน/.test(compactThai)) {
    return "Vitamin B12";
  }

  if (/vitamin\s*b\s*6|pyridox/i.test(cleaned) || /วิตามินบี6|ไพริดอกซ/.test(compactThai)) {
    return "Vitamin B6";
  }

  if (/vitamin\s*b\s*5|pantothen/i.test(cleaned) || /วิตามินบี5|แพนโทธีเนต|แพนโทเทน/.test(compactThai)) {
    return "Vitamin B5";
  }

  if (/vitamin\s*b\s*3|niacin|nicotinamide/i.test(cleaned) || /วิตามินบี3|ไนอะซิน|ไนอาซิน|นิโคตินาไมด์/.test(compactThai)) {
    return "Vitamin B3";
  }

  if (/vitamin\s*b\s*2|riboflavin/i.test(cleaned) || /วิตามินบี2|ไรโบฟลาวิน/.test(compactThai)) {
    return "Vitamin B2";
  }

  if (/vitamin\s*b\s*1|thiamin/i.test(cleaned) || /วิตามินบี1|ไธอะมิน|ไทอะมิน/.test(compactThai)) {
    return "Vitamin B1";
  }

  if (/biotin|vitamin\s*b\s*7/i.test(cleaned) || /ไบโอติน|วิตามินบี7/.test(compactThai)) {
    return "Vitamin B7";
  }

  if (/folic|folate|vitamin\s*b\s*9/i.test(cleaned) || /โฟลิก|โฟเลต|วิตามินบี9/.test(compactThai)) {
    return "Vitamin B9";
  }

  if (/fructo[-\s]*oligosaccharide|fos\b/i.test(cleaned) || /ฟรุกโตโอลิโก/.test(compactThai)) {
    return "Fructooligosaccharides";
  }

  return normalizeProductFactName(cleaned) || cleaned;
}

function ingredientEvidenceText(text: string) {
  const compact = cleanText(text);
  const start = compact.search(/ส่วนประกอบ|active\s+ingredients?|ingredients?/i);

  if (start < 0) {
    return compact;
  }

  const remainder = compact.slice(start);
  const stop = remainder.search(
    /\s(?:วิธี(?:การ)?รับประทาน|ข้อมูลสำหรับผู้แพ้อาหาร|คำเตือน|เลขสารระบบอาหาร|เลขที่อย|หมวดหมู่|แชร์|related\s+products|สินค้าที่เกี่ยวข้อง)\b/i
  );

  return stop > 0 ? remainder.slice(0, stop) : remainder;
}

function factFromMatch(
  match: RegExpMatchArray,
  sourceUrl?: string | null
): ProductImportFactInput | null {
  const rawName = match[1] ?? "";
  const amount = numberFromDose(match[2] ?? "");
  const unit = unitFromVistraText(match[3] ?? "");
  const name = normalizeVistraFactName(rawName);

  if (!name || amount === null || !unit) {
    return null;
  }

  return {
    amount,
    confidence: "moderate",
    itemType: "supplement",
    name,
    sourceText: cleanText(match[0] ?? "").slice(0, 500),
    sourceUrl,
    unit
  };
}

export function parseVistraThaiFacts(
  text: string,
  sourceUrl?: string | null
): ProductImportFactInput[] {
  const evidence = ingredientEvidenceText(text)
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)(mg|mcg|ug|µg|g|iu|IU|CFU)\b/g, "$1 $2");
  const units =
    "(พันล้าน\\s*CFU|billion\\s*CFU|CFU|ซีเอฟยู|ไมโครกรัม|มิลลิกรัม|มคก\\.?|มก\\.?|กรัม|หน่วยสากล|ไอยู|i\\.?\\s*u\\.?|iu|IU|mcg|µg|ug|mg|g)";
  const amount = "(\\d+(?:,\\d{3})*(?:\\.\\d+)?)";
  const yieldPattern = new RegExp(
    `(?:\\(|\\[|\\s)(?:ให้|provides?|yielding)\\s*([^()\\[\\]]{1,100}?)\\s*${amount}\\s*${units}`,
    "gi"
  );
  const rowPattern = new RegExp(
    `([A-Za-zก-๙][A-Za-zก-๙0-9\\s()+\\-./'′&]{1,140}?)\\s*${amount}\\s*${units}(?=$|\\s|[),.:;])`,
    "gi"
  );
  const factRecords: Array<{ fact: ProductImportFactInput; index: number }> = [];

  for (const match of evidence.matchAll(yieldPattern)) {
    const fact = factFromMatch(match, sourceUrl);

    if (fact) {
      factRecords.push({
        fact: { ...fact, confidence: "high" },
        index: match.index ?? 0
      });
    }
  }

  for (const match of evidence.matchAll(rowPattern)) {
    const rawName = cleanText(match[1] ?? "");

    if (/\(\s*ให้|\[\s*ให้/i.test(rawName)) {
      continue;
    }

    const fact = factFromMatch(match, sourceUrl);

    if (fact) {
      factRecords.push({ fact, index: match.index ?? 0 });
    }
  }

  const seen = new Map<string, ProductImportFactInput>();

  for (const { fact } of factRecords.sort((left, right) => left.index - right.index)) {
    const key = `${fact.name.toLowerCase()}|${fact.amount}|${fact.unit}`;

    if (!seen.has(key)) {
      seen.set(key, fact);
    }
  }

  return [...seen.values()];
}

export function extractVistraFdaNumber(text: string) {
  const compact = cleanText(text);

  return compact.match(/เลขสารระบบอาหาร\s*[:：]?\s*([0-9\-]{8,})/i)?.[1] ??
    compact.match(/\b(?:อย|FDA)\.?\s*(?:เลขที่)?\s*[:：]?\s*([0-9\-\/.]{6,})/i)?.[1] ??
    null;
}
