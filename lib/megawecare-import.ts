import { createHash } from "node:crypto";
import { type ProductImportFactInput } from "@/lib/admin-products";
import { normalizeProductFactName } from "@/lib/product-recommendations";

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function unitFromThai(value: string) {
  const normalized = value.trim().toLowerCase();

  if (/ไมโครกรัม|มคก|mcg|µg|ug/.test(normalized)) {
    return "mcg";
  }

  if (/มิลลิกรัม|มก|mg/.test(normalized)) {
    return "mg";
  }

  if (/กรัม|g\b/.test(normalized)) {
    return "g";
  }

  if (/ไอยู|iu/.test(normalized)) {
    return "IU";
  }

  if (/cfu|ซีเอฟยู/i.test(value)) {
    return /พันล้าน|billion/i.test(value) ? "billion CFU" : "CFU";
  }

  return normalized || null;
}

function numberFromDose(value: string) {
  const parsed = Number(value.replace(/,/g, ""));

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function factCandidatesFromSegment(segment: string, sourceUrl?: string | null) {
  const facts: ProductImportFactInput[] = [];
  const dosePattern =
    /([A-Za-zก-๙][A-Za-zก-๙0-9\s()+\-./]{1,90}?)\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*(ไมโครกรัม|มิลลิกรัม|มคก\.?|มก\.?|กรัม|ไอยู|mcg|µg|ug|mg|g|iu|IU|billion\s*CFU|CFU)(?=$|\s|[),.])/gi;

  for (const match of segment.matchAll(dosePattern)) {
    const rawName = cleanText(match[1])
      .replace(/^.*?ประกอบด้วย\s+/i, "")
      .replace(/^(?:และ|,|\+)\s*/i, "")
      .replace(/(?:ใน\s*1\s*(?:แคปซูล|เม็ด|ซอง|หน่วย|serving)|ประกอบด้วย|ส่วนประกอบสำคัญ|และ|,)+$/gi, "")
      .trim();
    const amount = numberFromDose(match[2]);
    const unit = unitFromThai(match[3]);
    const name = normalizeProductFactName(rawName) || rawName;

    if (!name || amount === null || !unit) {
      continue;
    }

    facts.push({
      amount,
      confidence: "moderate",
      itemType: "supplement",
      name,
      sourceText: cleanText(match[0]).slice(0, 500),
      sourceUrl,
      unit
    });
  }

  return facts;
}

export function parseMegaWeCareThaiFacts(
  text: string,
  sourceUrl?: string | null
): ProductImportFactInput[] {
  const compact = cleanText(text);
  const segments = [
    ...compact.matchAll(/ใน\s*1\s*(?:แคปซูล|เม็ด|ซอง|หน่วย|serving)\s*ประกอบด้วย\s+(.+?)(?=\s+(?:รับประทาน|วิธี|คำเตือน|ขนาดบรรจุ|เลข\s*อ\.?ย\.?|เลขที่|โฆษณา)|$)/gi),
    ...compact.matchAll(/ส่วนประกอบ(?:สำคัญ)?\s*[:：]?\s+(.+?)(?=\s+(?:รับประทาน|วิธี|คำเตือน|ขนาดบรรจุ|เลข\s*อ\.?ย\.?|เลขที่|โฆษณา)|$)/gi)
  ].map((match) => match[1]);
  const allFacts = (segments.length > 0 ? segments : [compact])
    .flatMap((segment) => factCandidatesFromSegment(segment, sourceUrl));
  const seen = new Map<string, ProductImportFactInput>();

  for (const fact of allFacts) {
    const key = `${fact.name.toLowerCase()}|${fact.amount}|${fact.unit}`;

    if (!seen.has(key)) {
      seen.set(key, fact);
    }
  }

  return [...seen.values()];
}

export function productEvidenceHash(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(value ?? null))
    .digest("hex");
}
