import { type ProductImportFactInput } from "@/lib/admin-products";
import { normalizeProductFactName } from "@/lib/product-recommendations";

function cleanText(value: string) {
  return value
    .replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0))
    .replace(/[Ａ-Ｚａ-ｚ]/g, (letter) => String.fromCharCode(letter.charCodeAt(0) - 0xfee0))
    .replace(/[，、]/g, "、")
    .replace(/[：]/g, ":")
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")")
    .replace(/[［]/g, "[")
    .replace(/[］]/g, "]")
    .replace(/\s+/g, " ")
    .trim();
}

function numberFromDose(value: string) {
  const parsed = Number(value.replace(/,/g, ""));

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function unitFromDhcText(value: string) {
  const normalized = cleanText(value).toLowerCase();

  if (/億\s*(?:個|cfu)|100\s*million\s*cfu/.test(normalized)) {
    return "billion CFU";
  }

  if (/cfu|個/.test(normalized)) {
    return "CFU";
  }

  if (/μg|µg|ug|mcg|マイクログラム/.test(normalized)) {
    return "mcg";
  }

  if (/i\.?\s*u\.?|iu|国際単位/.test(normalized)) {
    return "IU";
  }

  if (/mg|㎎|ミリグラム/.test(normalized)) {
    return "mg";
  }

  if (/\bg\b|ｇ|グラム/.test(normalized)) {
    return "g";
  }

  return null;
}

function amountForDhcUnit(amount: number, unitText: string, unit: string) {
  if (unit === "billion CFU" && /億/.test(unitText)) {
    return Number((amount * 0.1).toFixed(3));
  }

  return amount;
}

function normalizeDhcFactName(value: string) {
  const cleaned = cleanText(value)
    .replace(/^[-–—*•●・]+\s*/, "")
    .replace(/^(?:内|うち|含有量|総量|として|換算|[()])\s*/i, "")
    .replace(/\s*(?:として|換算|相当|由来)\s*$/i, "")
    .replace(/\([^)]*(?:基準値|%|あたり|当たり)[^)]*\)$/i, "")
    .trim();
  const compact = cleaned.replace(/\s+/g, "");
  const lower = cleaned.toLowerCase();

  if (!cleaned) {
    return null;
  }

  if (/^(?:熱量|エネルギー|たんぱく質|タンパク質|脂質|炭水化物|糖質|食物繊維|食塩相当量|ナトリウム|水分|灰分|価格|税込|内容量|粒重量|粒内容量|janコード|原材料名|名称)$/.test(compact)) {
    return null;
  }

  if (/\bepa\b|エイコサペンタエン酸|イコサペンタエン酸/.test(lower) || /ＥＰＡ/.test(cleaned)) {
    return "EPA";
  }

  if (/\bdha\b|ドコサヘキサエン酸/.test(lower) || /ＤＨＡ/.test(cleaned)) {
    return "DHA";
  }

  if (/omega\s*-?\s*3/i.test(cleaned) || /オメガ3|オメガ-3|n-3系脂肪酸/.test(compact)) {
    return "Omega-3";
  }

  if (/fish\s*oil/i.test(cleaned) || /魚油|精製魚油|フィッシュオイル/.test(compact)) {
    return "Fish Oil";
  }

  if (/co\s*enzyme\s*q10|coq10|ubiquinone/i.test(cleaned) || /コエンザイムQ10|還元型コエンザイムQ10|ユビキノ/.test(compact)) {
    return "CoQ10";
  }

  if (/astaxanthin/i.test(cleaned) || /アスタキサンチン/.test(compact)) {
    return "Astaxanthin";
  }

  if (/lutein/i.test(cleaned) || /ルテイン/.test(compact)) {
    return "Lutein";
  }

  if (/zeaxanthin/i.test(cleaned) || /ゼアキサンチン/.test(compact)) {
    return "Zeaxanthin";
  }

  if (/lycopene/i.test(cleaned) || /リコピン/.test(compact)) {
    return "Lycopene";
  }

  if (/beta[-\s]*carotene|β[-\s]*carotene/i.test(cleaned) || /β-?カロテン|ベータカロテン/.test(compact)) {
    return "Beta-carotene";
  }

  if (/curcumin/i.test(cleaned) || /クルクミン/.test(compact)) {
    return "Curcumin";
  }

  if (/glucosamine/i.test(cleaned) || /グルコサミン/.test(compact)) {
    return "Glucosamine";
  }

  if (/chondroitin/i.test(cleaned) || /コンドロイチン/.test(compact)) {
    return "Chondroitin";
  }

  if (/\bmsm\b|methylsulfonylmethane/i.test(cleaned) || /メチルスルフォニルメタン/.test(compact)) {
    return "MSM";
  }

  if (/collagen/i.test(cleaned) || /コラーゲン/.test(compact)) {
    return "Collagen";
  }

  if (/hyaluronic/i.test(cleaned) || /ヒアルロン酸/.test(compact)) {
    return "Hyaluronic Acid";
  }

  if (/ceramide/i.test(cleaned) || /セラミド/.test(compact)) {
    return "Ceramide";
  }

  if (/l[-\s]*theanine|theanine/i.test(cleaned) || /テアニン/.test(compact)) {
    return "L-Theanine";
  }

  if (/\bgaba\b/i.test(cleaned) || /ギャバ/.test(compact)) {
    return "GABA";
  }

  if (/lactoferrin/i.test(cleaned) || /ラクトフェリン/.test(compact)) {
    return "Lactoferrin";
  }

  if (/bifido|bifidus|bifidobacter/i.test(cleaned) || /ビフィズス菌/.test(compact)) {
    return "Bifidobacterium";
  }

  if (/lactic\s*acid\s*bacteria|lactobacillus|probiotic/i.test(cleaned) || /乳酸菌|プロバイオティクス/.test(compact)) {
    return "Probiotics";
  }

  if (/vitamin\s*d3?|cholecalciferol/i.test(cleaned) || /ビタミンD3?|ビタミンＤ3?|コレカルシフェロール/.test(compact)) {
    return "Vitamin D3";
  }

  if (/vitamin\s*c|ascorb/i.test(cleaned) || /ビタミンC|ビタミンＣ|アスコルビン酸/.test(compact)) {
    return "Vitamin C";
  }

  if (/vitamin\s*e|tocopher/i.test(cleaned) || /ビタミンE|ビタミンＥ|トコフェロール/.test(compact)) {
    return "Vitamin E";
  }

  if (/vitamin\s*a|retinol/i.test(cleaned) || /ビタミンA|ビタミンＡ|レチノール/.test(compact)) {
    return "Vitamin A";
  }

  if (/vitamin\s*k/i.test(cleaned) || /ビタミンK|ビタミンＫ/.test(compact)) {
    return "Vitamin K";
  }

  if (/vitamin\s*b\s*12|cyanocobalamin|cobalamin/i.test(cleaned) || /ビタミンB12|ビタミンＢ12|コバラミン/.test(compact)) {
    return "Vitamin B12";
  }

  if (/vitamin\s*b\s*6|pyridox/i.test(cleaned) || /ビタミンB6|ビタミンＢ6|ピリドキシン/.test(compact)) {
    return "Vitamin B6";
  }

  if (/vitamin\s*b\s*5|pantothen/i.test(cleaned) || /パントテン酸|ビタミンB5|ビタミンＢ5/.test(compact)) {
    return "Vitamin B5";
  }

  if (/vitamin\s*b\s*3|niacin|nicotinamide/i.test(cleaned) || /ナイアシン|ニコチン酸|ビタミンB3|ビタミンＢ3/.test(compact)) {
    return "Vitamin B3";
  }

  if (/vitamin\s*b\s*2|riboflavin/i.test(cleaned) || /ビタミンB2|ビタミンＢ2|リボフラビン/.test(compact)) {
    return "Vitamin B2";
  }

  if (/vitamin\s*b\s*1|thiamin/i.test(cleaned) || /ビタミンB1|ビタミンＢ1|チアミン/.test(compact)) {
    return "Vitamin B1";
  }

  if (/biotin|vitamin\s*b\s*7/i.test(cleaned) || /ビオチン|ビタミンB7|ビタミンＢ7/.test(compact)) {
    return "Vitamin B7";
  }

  if (/folic|folate|vitamin\s*b\s*9/i.test(cleaned) || /葉酸|ビタミンB9|ビタミンＢ9/.test(compact)) {
    return "Vitamin B9";
  }

  if (/zinc/i.test(cleaned) || /亜鉛|ジンク/.test(compact)) {
    return "Zinc";
  }

  if (/magnesium/i.test(cleaned) || /マグネシウム/.test(compact)) {
    return "Magnesium";
  }

  if (/calcium/i.test(cleaned) || /カルシウム/.test(compact)) {
    return "Calcium";
  }

  if (/\biron\b/i.test(cleaned) || /鉄/.test(compact)) {
    return "Iron";
  }

  if (/copper/i.test(cleaned) || /銅/.test(compact)) {
    return "Copper";
  }

  if (/selenium/i.test(cleaned) || /セレン/.test(compact)) {
    return "Selenium";
  }

  if (/chromium/i.test(cleaned) || /クロム/.test(compact)) {
    return "Chromium";
  }

  if (/manganese/i.test(cleaned) || /マンガン/.test(compact)) {
    return "Manganese";
  }

  if (/molybdenum/i.test(cleaned) || /モリブデン/.test(compact)) {
    return "Molybdenum";
  }

  if (/iodine/i.test(cleaned) || /ヨウ素/.test(compact)) {
    return "Iodine";
  }

  return normalizeProductFactName(cleaned) || cleaned;
}

function ingredientEvidenceText(text: string) {
  const compact = cleanText(text);
  const start = compact.search(/(?:成分・原材料|栄養成分表示|原材料名|内容成分|一日あたり|1日あたり|主要原材料|商品情報)/i);

  if (start < 0) {
    return compact;
  }

  const remainder = compact.slice(start);
  const stop = remainder.search(
    /\s(?:レビュー|関連する商品|関連カテゴリ|健康食品について|アレルギー物質|カートに入れる|口コミ|商品レビュー)\b/i
  );

  return stop > 0 ? remainder.slice(0, stop) : remainder;
}

function factFromRawMatch(
  rawName: string,
  rawAmount: string,
  rawUnit: string,
  sourceText: string,
  sourceUrl?: string | null
): ProductImportFactInput | null {
  const amount = numberFromDose(rawAmount);
  const unit = unitFromDhcText(rawUnit);
  const name = normalizeDhcFactName(rawName);

  if (!name || amount === null || !unit) {
    return null;
  }

  return {
    amount: amountForDhcUnit(amount, rawUnit, unit),
    confidence: "moderate",
    itemType: "supplement",
    name,
    sourceText: cleanText(sourceText).slice(0, 500),
    sourceUrl,
    unit
  };
}

function shouldPreferDhcFact(next: ProductImportFactInput, current: ProductImportFactInput) {
  if ((next.confidence ?? "moderate") !== (current.confidence ?? "moderate")) {
    return next.confidence === "high";
  }

  if (current.amount === null && next.amount !== null) {
    return true;
  }

  return false;
}

export function parseDhcFacts(
  text: string,
  sourceUrl?: string | null
): ProductImportFactInput[] {
  const evidence = ingredientEvidenceText(text)
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)(mg|mcg|ug|µg|μg|g|iu|IU)\b/g, "$1 $2");
  const units =
    "(億\\s*個|CFU|cfu|μg|µg|ug|mcg|マイクログラム|国際単位|I\\.?\\s*U\\.?|IU|iu|mg|㎎|ミリグラム|g|ｇ|グラム)";
  const amount = "(\\d+(?:,\\d{3})*(?:\\.\\d+)?)";
  const bracketSectionPattern = /【[^】]*(?:栄養成分表示|内容成分|原材料名)[^】]*】([^【]{1,3000})/gi;
  const rowPattern = new RegExp(
    `([A-Za-zΑ-Ωα-ωβΒγΓ一-龯ぁ-んァ-ヶー][A-Za-z0-9Α-Ωα-ωβΒγΓ一-龯ぁ-んァ-ヶー\\s()+\\-./%&]{0,120}?)\\s*${amount}\\s*${units}(?=$|\\s|[()、,，。.:;])`,
    "gi"
  );
  const factRecords: Array<ProductImportFactInput & { key: string }> = [];
  const seenSections = new Set<string>();

  for (const sectionMatch of evidence.matchAll(bracketSectionPattern)) {
    const section = sectionMatch[1] ?? "";

    if (seenSections.has(section)) {
      continue;
    }

    seenSections.add(section);

    for (const match of section.matchAll(rowPattern)) {
      const fact = factFromRawMatch(
        match[1] ?? "",
        match[2] ?? "",
        match[3] ?? "",
        match[0] ?? "",
        sourceUrl
      );

      if (fact) {
        factRecords.push({
          ...fact,
          confidence: "high",
          key: fact.name.toLowerCase()
        });
      }
    }
  }

  for (const match of evidence.matchAll(rowPattern)) {
    const fact = factFromRawMatch(
      match[1] ?? "",
      match[2] ?? "",
      match[3] ?? "",
      match[0] ?? "",
      sourceUrl
    );

    if (fact) {
      factRecords.push({
        ...fact,
        key: fact.name.toLowerCase()
      });
    }
  }

  const deduped = new Map<string, ProductImportFactInput>();

  for (const fact of factRecords) {
    const key = fact.key;
    const withoutKey = {
      amount: fact.amount,
      confidence: fact.confidence,
      itemType: fact.itemType,
      name: fact.name,
      sourceText: fact.sourceText,
      sourceUrl: fact.sourceUrl,
      unit: fact.unit
    };
    const current = deduped.get(key);

    if (!current || shouldPreferDhcFact(withoutKey, current)) {
      deduped.set(key, withoutKey);
    }
  }

  return [...deduped.values()].slice(0, 80);
}

export function extractDhcProductId(value: string) {
  try {
    const url = new URL(value, "https://www.dhc.co.jp");
    const htmlId = url.pathname.match(/\/goods\/(\d+)\.html$/i)?.[1];
    const gCode = url.searchParams.get("gCode")?.match(/^\d+$/)?.[0];
    const pid = url.searchParams.get("pid")?.match(/^\d+$/)?.[0];

    return htmlId ?? gCode ?? pid ?? null;
  } catch {
    return null;
  }
}

export function isDhcSupplementProduct(input: Readonly<{
  productTitle: string;
  sourceText?: string | null;
}>) {
  const title = cleanText(input.productTitle).toLowerCase();
  const text = cleanText(input.sourceText ?? "").toLowerCase();
  const combined = `${title} ${text}`;

  if (/第[123１２３]類医薬品|指定第[12１２]類医薬品|医薬品|医薬部外品|外皮用薬|点眼薬/.test(title)) {
    return false;
  }

  if (/詰替ボトル|シェーカー|専用シェーカー|シェーカーコップ|サプリメントケース/.test(title)) {
    return false;
  }

  const hasSupplementSignal =
    /健康食品|サプリメント|栄養機能食品|機能性表示食品|栄養成分表示|原材料名|内容成分|一日摂取目安量|1日摂取目安量|お召し上がり|水またはぬるま湯/.test(combined) ||
    /\b(?:capsule|tablet|softgel|supplement|nutrition facts|serving)\b/i.test(combined);

  if (
    /薬用|化粧品|美容液|クリーム|ローション|ファンデーション|クッション|シャンプー|トリートメント|日焼け止め|石けん|洗顔|クレンジング|化粧水|乳液|ジェル|リップ|マスク|bb\s*クッション/i.test(title) &&
    !hasSupplementSignal
  ) {
    return false;
  }

  return hasSupplementSignal;
}
